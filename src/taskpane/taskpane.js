'use strict';

/* ============================================================
 * Office AI 助手 —— 任务窗格逻辑
 * 对接本地后端（默认 http://localhost:3000），由后端代理调用
 * 阿里云百炼 DashScope 官方接口。
 * ============================================================ */

const STORE_KEY = 'officeAIAssistant.cfg';
const cfg = Object.assign(
  { apiBase: 'http://localhost:3000', lastChatModel: '', lastImageModel: '', lastVisionModel: '' },
  JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
);
function saveCfg() { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); }

/* ---------- DOM 引用 ---------- */
const $ = (id) => document.getElementById(id);
const els = {
  tabChat: document.querySelector('[data-tab="chat"]'),
  tabImage: document.querySelector('[data-tab="image"]'),
  tabVision: document.querySelector('[data-tab="vision"]'),
  panelChat: $('panelChat'),
  panelImage: $('panelImage'),
  panelVision: $('panelVision'),
  selChatModel: $('selChatModel'),
  selImageModel: $('selImageModel'),
  selVisionModel: $('selVisionModel'),
  selPromptPreset: $('selPromptPreset'),
  selImageSize: $('selImageSize'),
  selImageN: $('selImageN'),
  chatInput: $('chatInput'),
  chatOutput: $('chatOutput'),
  chatStatus: $('chatStatus'),
  imagePrompt: $('imagePrompt'),
  imageResult: $('imageResult'),
  imageStatus: $('imageStatus'),
  visionPrompt: $('visionPrompt'),
  visionOutput: $('visionOutput'),
  visionStatus: $('visionStatus'),
  btnSend: $('btnSend'),
  btnInsert: $('btnInsert'),
  btnReplace: $('btnReplace'),
  btnReadSelection: $('btnReadSelection'),
  btnGenImage: $('btnGenImage'),
  btnInsertImage: $('btnInsertImage'),
  btnOpenImage: $('btnOpenImage'),
  btnVisionRun: $('btnVisionRun'),
  btnVisionInsert: $('btnVisionInsert'),
  btnPickImage: $('btnPickImage'),
  btnSettings: $('btnSettings'),
  btnSaveSettings: $('btnSaveSettings'),
  btnCloseSettings: $('btnCloseSettings'),
  dlgSettings: $('dlgSettings'),
  inpApiBase: $('inpApiBase'),
  rngTemp: $('rngTemp'),
  lblTemp: $('lblTemp'),
  chkThinking: $('chkThinking'),
  chkUseClipboard: $('chkUseClipboard'),
  visionFile: $('visionFile'),
};

/* ---------- 状态 ---------- */
let lastChatText = '';
let lastGeneratedImages = []; // [{url}]
let visionBase64 = ''; // data:image/...;base64,...
let visionFileUrl = '';
let catalog = []; // 全模型目录
let inFlight = false;

/* ---------- Office 环境工具 ---------- */
function isInOffice() {
  return typeof Office !== 'undefined' && typeof Office.context !== 'undefined';
}
function hostName() {
  if (!isInOffice()) return 'browser';
  return (Office.context.host && Office.context.host.host) || 'unknown';
}
function showStatus(el, msg, kind) {
  el.textContent = msg;
  el.className = 'status ' + (kind || '');
}

/* ============ 模型目录加载 ============ */
async function loadModels() {
  try {
    const res = await fetch(`${cfg.apiBase}/api/models`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    catalog = data.models || [];
    fillChatModels();
    fillImageModels();
    fillVisionModels();
  } catch (e) {
    showStatus(els.chatStatus, `无法连接后端（${e.message}），请确认已启动服务并在设置里核对地址`, 'err');
  }
}
function fillChatModels() {
  const pool = catalog.filter((m) => m.family === 'chat');
  renderOptions(els.selChatModel, pool, cfg.lastChatModel || (pool[0] && pool[0].id));
}
function fillImageModels() {
  const pool = catalog.filter((m) => m.family === 'image');
  renderOptions(els.selImageModel, pool, cfg.lastImageModel || (pool[0] && pool[0].id));
}
function fillVisionModels() {
  const pool = catalog.filter((m) => m.family === 'vision');
  renderOptions(els.selVisionModel, pool, cfg.lastVisionModel || (pool[0] && pool[0].id));
}
function renderOptions(sel, list, selected) {
  sel.innerHTML = list
    .map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''} title="${m.desc}">${m.name}</option>`)
    .join('');
  if (!selected && list[0]) sel.value = list[0].id;
}

/* ============ 标签切换 ============ */
function switchTab(name) {
  [['chat', els.tabChat], ['image', els.tabImage], ['vision', els.tabVision]].forEach(([n, tab]) => {
    tab.classList.toggle('active', n === name);
  });
  [els.panelChat, els.panelImage, els.panelVision].forEach((p) => p.classList.remove('active'));
  ({ chat: els.panelChat, image: els.panelImage, vision: els.panelVision }[name]).classList.add('active');
}

/* ============ 智能写作 ============ */
const PRESET_SYSTEM = {
  free: '你是一个专业的办公助手，回答简洁、准确、可直接使用。',
  polish: '请对用户提供的文本进行润色改写：修正语病、提升表达，保持原意，直接输出润色后的文本。',
  translate: '请将用户提供的文本翻译成通顺、专业的中文，直接输出译文。',
  'translate-en': 'Please translate the user\'s text into fluent, professional English. Output only the translation.',
  summary: '请为用户提供的文本生成精炼的摘要，分点列出核心要点，直接输出摘要。',
  title: '请为用户提供的文本拟 3~5 个简洁有力的标题，每个标题一行。',
};

async function handleSend() {
  if (inFlight) return;
  const input = els.chatInput.value.trim();
  if (!input) { showStatus(els.chatStatus, '请先输入或读取内容', 'err'); return; }
  const model = els.selChatModel.value;
  cfg.lastChatModel = model; saveCfg();
  const preset = els.selPromptPreset.value;
  const system = PRESET_SYSTEM[preset] || PRESET_SYSTEM.free;

  inFlight = true;
  setBusy(els.btnSend, true, '生成中…');
  els.chatOutput.classList.remove('empty');
  els.chatOutput.textContent = '';
  showStatus(els.chatStatus, '正在调用 ' + model + ' …', '');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: input },
  ];

  try {
    const res = await fetch(`${cfg.apiBase}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: Number(els.rngTemp.value),
        thinking: els.chkThinking.checked,
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text();
      throw new Error(t || 'HTTP ' + res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]' || data === '[END]') continue;
        try {
          const obj = JSON.parse(data);
          if (obj.delta) { full += obj.delta; els.chatOutput.textContent = full; }
          if (obj.message) { showStatus(els.chatStatus, obj.message, 'err'); }
        } catch (_) { /* 忽略 */ }
      }
    }
    lastChatText = full;
    els.btnInsert.disabled = !full || !canInsertText();
    els.btnReplace.disabled = !full || !canInsertText();
    showStatus(els.chatStatus, full ? '生成完成' : '未返回内容', full ? 'ok' : 'err');
  } catch (e) {
    showStatus(els.chatStatus, '生成失败：' + e.message, 'err');
  } finally {
    inFlight = false;
    setBusy(els.btnSend, false);
  }
}

/* ============ 读取选区 / 插入 / 替换 ============ */
function canInsertText() { return isInOffice(); }

function readSelection() {
  if (!isInOffice()) { showStatus(els.chatStatus, '请在 Office（Word/Excel/PowerPoint）加载项中运行才能读取文档', 'err'); return; }
  Office.context.document.getSelectedDataAsync(Office.CoercionType.Text, (res) => {
    if (res.status === Office.AsyncResultStatus.Succeeded && res.value) {
      els.chatInput.value = res.value;
      showStatus(els.chatStatus, `已读取 ${res.value.length} 字符`, 'ok');
    } else {
      showStatus(els.chatStatus, '未读取到选区内容', 'err');
    }
  });
}

function insertTextToDoc(text) {
  if (!isInOffice()) return false;
  const host = hostName();
  if (host === 'WORD') {
    Word.run((ctx) => { ctx.document.body.insertText(text, Word.InsertLocation.end); return ctx.sync(); })
      .then(() => showStatus(els.chatStatus, '已插入到文档末尾', 'ok'))
      .catch((e) => showStatus(els.chatStatus, '插入失败：' + e.message, 'err'));
  } else {
    Office.context.document.setSelectedDataAsync(text, { coercionType: Office.CoercionType.Text },
      (res) => showStatus(els.chatStatus, res.status === Office.AsyncResultStatus.Succeeded ? '已写入当前单元格/选区' : '写入失败', res.status === Office.AsyncResultStatus.Succeeded ? 'ok' : 'err'));
  }
  return true;
}

function replaceSelection(text) {
  if (!isInOffice()) return false;
  Office.context.document.setSelectedDataAsync(text, { coercionType: Office.CoercionType.Text },
    (res) => showStatus(els.chatStatus, res.status === Office.AsyncResultStatus.Succeeded ? '已替换选区' : '替换失败', res.status === Office.AsyncResultStatus.Succeeded ? 'ok' : 'err'));
  return true;
}

/* ============ 图片生成 ============ */
async function handleGenImage() {
  if (inFlight) return;
  const prompt = els.imagePrompt.value.trim();
  if (!prompt) { showStatus(els.imageStatus, '请先描述要生成的图片', 'err'); return; }
  const model = els.selImageModel.value;
  const size = els.selImageSize.value;
  const n = Number(els.selImageN.value);

  inFlight = true;
  setBusy(els.btnGenImage, true, '生成中…');
  els.imageResult.innerHTML = '';
  showStatus(els.imageStatus, `正在调用 ${model} 生成…（可能需十几秒）`, '');

  try {
    const res = await fetch(`${cfg.apiBase}/api/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, n }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
    lastGeneratedImages = (data.images || []).map((url) => ({ url }));
    els.imageResult.innerHTML = lastGeneratedImages
      .map((im, i) => `<img class="thumb" data-idx="${i}" src="${im.url}" title="第 ${i + 1} 张" />`)
      .join('');
    document.querySelectorAll('#imageResult img').forEach((img) =>
      img.addEventListener('click', () => openImage(img.dataset.idx)));
    els.btnInsertImage.disabled = !lastGeneratedImages.length || !canInsertText();
    els.btnOpenImage.disabled = !lastGeneratedImages.length;
    showStatus(els.imageStatus, `已生成 ${lastGeneratedImages.length} 张图片`, 'ok');
  } catch (e) {
    showStatus(els.imageStatus, '图片生成失败：' + e.message, 'err');
  } finally {
    inFlight = false;
    setBusy(els.btnGenImage, false);
  }
}

async function insertImageToDoc() {
  if (!lastGeneratedImages.length) return;
  const url = lastGeneratedImages[0].url;
  if (!isInOffice()) { openImage(0); return; }
  const host = hostName();
  if (host === 'WORD') {
    showStatus(els.imageStatus, '正在下载图片并插入 Word…', '');
    try {
      const b64 = await urlToBase64(url);
      await Word.run((ctx) => {
        const p = ctx.document.body.insertParagraph('', Word.InsertLocation.end);
        p.insertInlinePictureFromBase64(b64, Word.InsertLocation.end);
        return ctx.sync();
      });
      showStatus(els.imageStatus, '图片已插入到文档', 'ok');
    } catch (e) {
      showStatus(els.imageStatus, '插入失败：' + e.message + '（可在新窗口打开后复制）', 'err');
    }
  } else {
    await navigator.clipboard.writeText(url);
    showStatus(els.imageStatus, '已复制图片链接到剪贴板（Excel/PPT 请手动粘贴或插入）', 'ok');
  }
}

function openImage(idx) {
  const url = lastGeneratedImages[idx] && lastGeneratedImages[idx].url;
  if (url) window.open(url, '_blank');
}

async function urlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('下载图片失败');
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ============ 文档理解（视觉） ============ */
async function handleVision() {
  if (inFlight) return;
  const prompt = els.visionPrompt.value.trim() || '请描述图片内容并提取关键信息。';
  const model = els.selVisionModel.value;
  cfg.lastVisionModel = model; saveCfg();

  let imageRef = visionFileUrl;
  if (els.chkUseClipboard.checked) {
    try { imageRef = await readClipboardImage(); } catch (_) { /* 剪贴板无图片 */ }
  }
  if (!imageRef) { showStatus(els.visionStatus, '请先选择图片，或勾选「使用剪贴板图片」', 'err'); return; }

  inFlight = true;
  setBusy(els.btnVisionRun, true, '分析中…');
  els.visionOutput.classList.remove('empty');
  els.visionOutput.textContent = '';
  showStatus(els.visionStatus, `正在调用 ${model} 分析…`, '');

  try {
    const res = await fetch(`${cfg.apiBase}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageRef } },
          ],
        }],
        temperature: 0.3,
      }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]' || data === '[END]') continue;
        try { const obj = JSON.parse(data); if (obj.delta) { full += obj.delta; els.visionOutput.textContent = full; } } catch (_) {}
      }
    }
    lastChatText = full;
    els.btnVisionInsert.disabled = !full || !canInsertText();
    showStatus(els.visionStatus, full ? '分析完成' : '未返回内容', full ? 'ok' : 'err');
  } catch (e) {
    showStatus(els.visionStatus, '分析失败：' + e.message, 'err');
  } finally {
    inFlight = false;
    setBusy(els.btnVisionRun, false);
  }
}

function pickVisionFile() {
  els.visionFile.click();
}
function handleFileChange() {
  const f = els.visionFile.files && els.visionFile.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    visionBase64 = reader.result;
    visionFileUrl = visionBase64; // data: URL，后端可直接透传给 DashScope
    renderVisionPreview();
  };
  reader.readAsDataURL(f);
}
function renderVisionPreview() {
  els.visionImagePreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = visionFileUrl;
  img.className = 'thumb';
  els.visionImagePreview.appendChild(img);
  const btn = document.createElement('button');
  btn.className = 'ghost';
  btn.textContent = '🖼 更换图片';
  btn.addEventListener('click', pickVisionFile);
  els.visionImagePreview.appendChild(btn);
}
async function readClipboardImage() {
  if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('无剪贴板读取权限');
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) {
      const blob = await item.getType(type);
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
  }
  throw new Error('剪贴板中没有图片');
}

/* ============ 工具 ============ */
function setBusy(btn, busy, label) {
  btn.disabled = busy || (busy === undefined && false);
  btn.textContent = label || btn.textContent;
  if (!busy) {
    if (btn === els.btnSend) btn.textContent = '▶ 生成';
    else if (btn === els.btnGenImage) btn.textContent = '🎨 生成图片';
    else if (btn === els.btnVisionRun) btn.textContent = '🔍 分析';
    btn.disabled = false;
  }
}

/* ============ 设置 ============ */
function openSettings() {
  els.inpApiBase.value = cfg.apiBase;
  els.dlgSettings.showModal();
}
function saveSettings() {
  cfg.apiBase = els.inpApiBase.value.trim().replace(/\/+$/, '') || 'http://localhost:3000';
  saveCfg();
  els.dlgSettings.close();
  loadModels();
}

/* ============ 事件绑定 ============ */
els.tabChat.addEventListener('click', () => switchTab('chat'));
els.tabImage.addEventListener('click', () => switchTab('image'));
els.tabVision.addEventListener('click', () => switchTab('vision'));
els.btnSend.addEventListener('click', handleSend);
els.btnReadSelection.addEventListener('click', readSelection);
els.btnInsert.addEventListener('click', () => insertTextToDoc(lastChatText));
els.btnReplace.addEventListener('click', () => replaceSelection(lastChatText));
els.btnGenImage.addEventListener('click', handleGenImage);
els.btnInsertImage.addEventListener('click', insertImageToDoc);
els.btnOpenImage.addEventListener('click', openImage(0));
els.btnVisionRun.addEventListener('click', handleVision);
els.btnVisionInsert.addEventListener('click', () => insertTextToDoc(lastChatText));
els.btnPickImage.addEventListener('click', pickVisionFile);
els.visionFile.addEventListener('change', handleFileChange);
els.btnSettings.addEventListener('click', openSettings);
els.btnSaveSettings.addEventListener('click', saveSettings);
els.btnCloseSettings.addEventListener('click', () => els.dlgSettings.close());
els.rngTemp.addEventListener('input', () => { els.lblTemp.textContent = els.rngTemp.value; });

/* ============ 初始化 ============ */
function init() {
  els.inpApiBase.value = cfg.apiBase;
  loadModels();
  showStatus(els.chatStatus, isInOffice() ? `已接入 ${hostName()}` : '浏览器预览模式（文档操作需在 Office 中运行）', isInOffice() ? 'ok' : '');
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
