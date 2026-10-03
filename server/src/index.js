'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT, API_KEY, VERBOSE } = require('./config');
const { publicCatalog } = require('./modelRegistry');
const ds = require('./dashscope');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 支持 base64 图片

const log = (...a) => { if (VERBOSE) console.log('[server]', ...a); };

/* ---------------- 中间件：检查 API Key ---------------- */
function requireKey(req, res, next) {
  if (!API_KEY) {
    return res.status(500).json({
      code: 'NO_API_KEY',
      message: '未配置阿里云百炼 API Key：请在项目根目录创建 .env（参考 .env.example）填写 DASHSCOPE_API_KEY，或在 config/dashscope.json 配置 apiKey。',
    });
  }
  next();
}

/* ---------------- 接口 ---------------- */

/** 健康检查 */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'office-ai-assistant', apiKeyConfigured: !!API_KEY });
});

/** 全模型目录 */
app.get('/api/models', (req, res) => {
  res.json({ models: publicCatalog() });
});

/** 非流式对话（文本 / 视觉） */
app.post('/api/chat', requireKey, async (req, res) => {
  const { model, messages, temperature, topP, maxTokens, thinking } = req.body || {};
  if (!model || !Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: '缺少 model 或 messages' });
  }
  try {
    const data = await ds.chat({ model, messages, temperature, topP, maxTokens, thinking });
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    res.json({ text, raw: data });
  } catch (e) {
    log('chat error', e.message);
    res.status(e.status || 500).json({ code: 'CHAT_ERROR', message: e.message });
  }
});

/** 流式对话（SSE） */
app.post('/api/chat/stream', requireKey, async (req, res) => {
  const { model, messages, temperature, topP, maxTokens, thinking } = req.body || {};
  if (!model || !Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: '缺少 model 或 messages' });
  }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  try {
    const stream = await ds.chatStream({ model, messages, temperature, topP, maxTokens, thinking });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 按 SSE 行切分
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (data === '[DONE]') { res.write('event: done\ndata: [DONE]\n\n'); continue; }
        try {
          const obj = JSON.parse(data);
          const delta = obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
          if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        } catch (_) { /* 忽略无法解析的帧 */ }
      }
    }
    res.write('event: end\ndata: [END]\n\n');
    res.end();
  } catch (e) {
    log('stream error', e.message);
    res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
    res.end();
  }
});

/** 图片生成（通义万相） */
app.post('/api/image', requireKey, async (req, res) => {
  const { model, prompt, n, size, negativePrompt } = req.body || {};
  if (!model || !prompt) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: '缺少 model 或 prompt' });
  }
  try {
    const result = await ds.imageGenerate({ model, prompt, n: n || 1, size, negativePrompt });
    res.json({ ...result, model, prompt });
  } catch (e) {
    log('image error', e.message);
    res.status(e.status || 500).json({ code: 'IMAGE_ERROR', message: e.message });
  }
});

/** 向量嵌入 */
app.post('/api/embed', requireKey, async (req, res) => {
  const { model, texts } = req.body || {};
  if (!model || !Array.isArray(texts) || !texts.length) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: '缺少 model 或 texts' });
  }
  try {
    const data = await ds.embedding(model, texts);
    res.json({ embeddings: data.data.map((d) => d.embedding) });
  } catch (e) {
    res.status(e.status || 500).json({ code: 'EMBED_ERROR', message: e.message });
  }
});

/* ---------------- 静态资源（任务窗格 + manifest） ---------------- */
const TASKPANE = path.join(__dirname, '..', '..', 'src', 'taskpane');
const MANIFEST = path.join(__dirname, '..', '..', 'manifest');
app.use('/taskpane', express.static(TASKPANE));
app.use('/manifest', express.static(MANIFEST));

/* ---------------- 启动 ---------------- */
app.listen(PORT, () => {
  console.log(`[office-ai-assistant] 服务已启动: http://localhost:${PORT}`);
  console.log(`[office-ai-assistant] API Key: ${API_KEY ? '已配置' : '未配置（请填写 .env）'}`);
  console.log(`[office-ai-assistant] 任务窗格: http://localhost:${PORT}/taskpane/taskpane.html`);
  console.log(`[office-ai-assistant] manifest: http://localhost:${PORT}/manifest/office-ai-manifest.xml`);
});
