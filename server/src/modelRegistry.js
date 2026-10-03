'use strict';

/* ============================================================
 * 模型目录（公开给任务窗格）
 * family: chat（文本对话）/ vision（视觉理解）/ image（文生图）
 * 与 VSTO 端 ModelCatalog.cs 保持一致；新增模型在此追加。
 * ============================================================ */

const REGISTRY = [
  // ---- 文本对话 ----
  { id: 'qwen-max', family: 'chat', name: '通义千问 Qwen-Max', desc: '千亿级 MoE 旗舰，效果最佳' },
  { id: 'qwen-plus', family: 'chat', name: '通义千问 Qwen-Plus', desc: '效果与速度均衡，默认' },
  { id: 'qwen-turbo', family: 'chat', name: '通义千问 Qwen-Turbo', desc: '高速低成本' },
  { id: 'qwen-flash', family: 'chat', name: '通义千问 Qwen-Flash', desc: '新一代极速模型' },
  { id: 'qwen-long', family: 'chat', name: '通义千问 Qwen-Long', desc: '1M Token 长上下文' },
  { id: 'qwen3-max', family: 'chat', name: '通义千问 Qwen3-Max', desc: 'Qwen3 旗舰，支持思考模式' },
  { id: 'qwen3-plus', family: 'chat', name: '通义千问 Qwen3-Plus', desc: 'Qwen3 均衡款' },
  { id: 'qwen3-turbo', family: 'chat', name: '通义千问 Qwen3-Turbo', desc: 'Qwen3 快模型' },
  { id: 'deepseek-r1', family: 'chat', name: 'DeepSeek-R1', desc: '深度思考开源模型' },
  { id: 'deepseek-v3', family: 'chat', name: 'DeepSeek-V3', desc: '通用对话开源模型' },

  // ---- 视觉理解 ----
  { id: 'qwen-vl-max', family: 'vision', name: 'Qwen-VL-Max', desc: '图像/文档理解旗舰，OCR、图表' },
  { id: 'qwen-vl-plus', family: 'vision', name: 'Qwen-VL-Plus', desc: '视觉理解均衡款' },
  { id: 'qwen2.5-vl-72b-instruct', family: 'vision', name: 'Qwen2.5-VL-72B', desc: '开源 72B 视觉模型' },
  { id: 'qwen-vl-ocr', family: 'vision', name: 'Qwen-VL-OCR', desc: '专注文字识别 OCR' },

  // ---- 图片生成 ----
  { id: 'wanx2.1-t2i-turbo', family: 'image', name: '通义万相 Wanx Turbo', desc: '文生图，快速，默认' },
  { id: 'wanx2.1-t2i-plus', family: 'image', name: '通义万相 Wanx Plus', desc: '文生图，更高画质' },
  { id: 'wanx-v1', family: 'image', name: '通义万相 Wanx-V1', desc: '基础文生图模型' },
];

/** 返回目录副本，避免调用方修改内部数组。 */
function publicCatalog() {
  return REGISTRY.map((m) => Object.assign({}, m));
}

module.exports = { publicCatalog };
