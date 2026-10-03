'use strict';

/* ============================================================
 * 配置入口
 * - 环境变量优先（.env 由 dotenv 加载，位于项目根目录）
 * - API Key 备用来源：根目录 config/dashscope.json 的 apiKey 字段
 * 本文件位于 server/src/，项目根目录为上两级。
 * ============================================================ */

const path = require('path');
const fs = require('fs');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
} catch (_) { /* 未安装 dotenv 时仅使用进程环境变量 */ }

function readJsonKey() {
  try {
    const file = path.join(__dirname, '..', '..', 'config', 'dashscope.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (json.apiKey || '').trim();
  } catch (_) {
    return '';
  }
}

const API_KEY = (process.env.DASHSCOPE_API_KEY || readJsonKey()).trim();
const PORT = Number(process.env.PORT) || 3000;
const VERBOSE = String(process.env.VERBOSE || '').toLowerCase() === 'true';

const BASE = {
  // OpenAI 兼容模式
  COMPAT: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  // 原生 REST（wanx 文生图）
  NATIVE: 'https://dashscope.aliyuncs.com/api/v1',
  // 异步任务查询
  TASK: 'https://dashscope.aliyuncs.com/api/v1/tasks',
};

module.exports = { BASE, API_KEY, PORT, VERBOSE };
