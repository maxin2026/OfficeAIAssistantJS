'use strict';

const { BASE, API_KEY, VERBOSE } = require('./config');

const log = (...args) => { if (VERBOSE) console.log('[dashscope]', ...args); };

function authHeaders() {
  return { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
}

/** 统一的 fetch 封装，抛出含状态码的错误 */
async function request(url, body) {
  const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch (_) { /* 保留原文 */ }
    const err = new Error(`DashScope ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

/* ================= 文本对话 / 视觉理解（OpenAI 兼容） ================= */

/**
 * 非流式对话。
 * @param {object} opts { model, messages, temperature, topP, maxTokens, thinking }
 * messages: [{ role, content }]；视觉时 content 可为 [{type:'text',text}, {type:'image_url',image_url:{url}}]
 */
async function chat(opts) {
  const { model, messages, temperature, topP, maxTokens, thinking } = opts;
  const payload = { model, messages };
  if (temperature !== undefined) payload.temperature = temperature;
  if (topP !== undefined) payload.top_p = topP;
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;
  if (thinking !== undefined) payload.thinking = thinking;
  log('chat', model, 'messages=', messages.length);
  const data = await request(`${BASE.COMPAT}/chat/completions`, payload);
  return data;
}

/** 流式对话：返回 ReadableStream，转发给客户端 SSE。 */
async function chatStream(opts) {
  const { model, messages, temperature, topP, maxTokens, thinking } = opts;
  const payload = { model, messages, stream: true };
  if (temperature !== undefined) payload.temperature = temperature;
  if (topP !== undefined) payload.top_p = topP;
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;
  if (thinking !== undefined) payload.thinking = thinking;
  log('chatStream', model);
  const res = await fetch(`${BASE.COMPAT}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DashScope ${res.status}: ${text}`);
  }
  return res.body; // ReadableStream（SSE）
}

/** 构造视觉消息（content 数组形式） */
function visionMessage(text, imageInputs) {
  const content = [{ type: 'text', text }];
  for (const img of imageInputs) {
    content.push({ type: 'image_url', image_url: { url: img } }); // img 可为公网 URL 或 data:base64
  }
  return content;
}

/* ================= 图片生成（通义万相 wanx，异步任务） ================= */

/**
 * 文生图。默认走异步任务：提交 -> 轮询任务 -> 返回图片 URL。
 * @param {object} opts { model, prompt, n, size, negativePrompt }
 */
async function imageGenerate(opts, { pollIntervalMs = 2000, timeoutMs = 120000 } = {}) {
  const { model, prompt, n = 1, size, negativePrompt } = opts;
  const input = { prompt };
  if (n) input.n = n;
  if (size) input.size = size;
  if (negativePrompt) input.negative_prompt = negativePrompt;

  const parameters = {};
  if (size) parameters.size = size;

  const payload = {
    model,
    input,
    // 兼容不同 wanx 版本：部分模型把 size/negative 放 input，部分放 parameters
    ...(size && { parameters }),
  };

  log('imageGenerate submit', model, 'prompt=', prompt.slice(0, 40));
  const data = await request(`${BASE.NATIVE}/services/aigc/text2image/image-synthesis`, payload);

  const taskId = data.output && data.output.task_id;
  if (!taskId) {
    throw new Error(`未返回 task_id：${JSON.stringify(data)}`);
  }

  // 轮询异步任务。真实 API 的 output 结构：
  // { task_id, task_status: 'PENDING/RUNNING/SUCCEEDED/FAILED/CANCELED', results: [{url}], message }
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await pollTask(taskId);
    const st = last.task_status;
    if (st === 'SUCCEEDED') break;
    if (st === 'FAILED' || st === 'CANCELED') {
      throw new Error(`图片生成任务失败：${st} ${last.message || ''}`);
    }
    await sleep(pollIntervalMs);
  }
  if (last && last.task_status !== 'SUCCEEDED') {
    throw new Error('图片生成超时');
  }

  const results = last.results || [];
  return { taskId, images: results.map((r) => r.url) };
}

/** 查询异步任务状态，返回 output 对象。 */
async function pollTask(taskId) {
  const res = await fetch(`${BASE.TASK}/${taskId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`查询任务失败 ${res.status}: ${text}`);
  }
  const body = JSON.parse(text);
  return body.output || {};
}

/* ================= 向量嵌入 ================= */
async function embedding(model, texts) {
  const data = await request(`${BASE.COMPAT}/embeddings`, {
    model,
    input: Array.isArray(texts) ? texts : [texts],
    encoding_format: 'float',
  });
  return data;
}

/* ================= 工具 ================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { chat, chatStream, visionMessage, imageGenerate, embedding, sleep };
