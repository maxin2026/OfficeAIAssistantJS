'use strict';
// 端到端冒烟测试：用本地 Mock 模拟阿里云百炼 DashScope 官方接口，
// 验证后端的请求组装、SSE 流式、图片生成异步轮询逻辑真实可跑（不依赖真实 Key）。
const http = require('http');
const { BASE } = require('../server/src/config');

// —— 改指向本地 mock ——
BASE.COMPAT = 'http://localhost:3999/compatible-mode/v1';
BASE.NATIVE = 'http://localhost:3999/api/v1';
BASE.TASK = 'http://localhost:3999/api/v1/tasks';

const server = http.createServer(async (req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const url = req.url;
    let out;
    if (url.endsWith('/chat/completions')) {
      const p = JSON.parse(body);
      if (p.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"Hello，"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"DashScope"}}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      out = { choices: [{ message: { content: 'mock 非流式回复' } }] };
    } else if (url.endsWith('/text2image/image-synthesis')) {
      out = { output: { task_id: 'mock-task-123' } };
    } else if (url.includes('/tasks/mock-task-123')) {
      // 结构对齐真实 API：output 内平铺 task_status / results
      const seen = !!global.__pollCount;
      global.__pollCount = true;
      out = seen
        ? { output: { task_status: 'SUCCEEDED', results: [{ url: 'http://mock.local/img.png' }] } }
        : { output: { task_status: 'RUNNING' } };
    } else if (url.endsWith('/embeddings')) {
      out = { data: [{ embedding: [0.1, 0.2, 0.3] }] };
    } else {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
server.listen(3999, async () => {
  const ds = require('../server/src/dashscope');
  const assert = (cond, msg) => { if (!cond) { console.error('✗ FAIL:', msg); process.exitCode = 1; } else console.log('✓', msg); };

  // 1. 非流式 chat
  const c = await ds.chat({ model: 'qwen-plus', messages: [{ role: 'user', content: 'hi' }] });
  assert(c.choices[0].message.content === 'mock 非流式回复', '非流式 chat 透传正确');

  // 2. 流式 chat（SSE 解析）
  let streamed = '';
  const stream = await ds.chatStream({ model: 'qwen-plus', messages: [{ role: 'user', content: 'hi' }] });
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      const t = l.trim();
      if (t.startsWith('data:') && t.slice(5).trim() !== '[DONE]') {
        const o = JSON.parse(t.slice(5).trim());
        if (o.choices?.[0]?.delta?.content) streamed += o.choices[0].delta.content;
      }
    }
  }
  assert(streamed.includes('Hello，DashScope') || (streamed.includes('Hello') && streamed.includes('DashScope')), '流式 chat SSE 增量正确: ' + JSON.stringify(streamed));

  // 3. 图片生成（异步任务轮询到成功）
  const img = await ds.imageGenerate({ model: 'wanx2.1-t2i-turbo', prompt: '一只猫' }, { pollIntervalMs: 50, timeoutMs: 5000 });
  assert(img.images.length === 1 && img.images[0] === 'http://mock.local/img.png', '图片生成异步轮询返回图片 URL');

  // 4. embedding
  const e = await ds.embedding('text-embedding-v4', ['你好']);
  assert(Array.isArray(e.data) && e.data.length === 1 && Array.isArray(e.data[0].embedding), 'embedding 返回向量');

  server.close();
  console.log('\n冒烟测试结束，退出码:', process.exitCode || 0);
});
