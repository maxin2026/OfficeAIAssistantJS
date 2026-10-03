# Office AI 助手（Office AI Assistant）

基于 **阿里云百炼 DashScope 官方接口** 的 Microsoft Office 智能助手，**全模型适配**（文本 / 视觉理解 / 图片生成 / 向量嵌入 / 语音）。本仓库为 **Office.js 网页加载项版**（Node/Express 后端 + 任务窗格），跨 Word / Excel / PowerPoint，浏览器即可开发联调。

> 图标文件（manifest/icon-*.png）由 `node scripts/gen-icons.js` 自动生成，仓库未含二进制图标。

---

## 功能

- 💬 **智能写作**：润色 / 翻译 / 摘要 / 标题 / 自由问答（qwen 全系列，支持流式输出）
- 🖼 **图片生成**：通义万相 wanx 文生图，异步任务轮询（支持 1/2/4 张、多尺寸）
- 🔍 **文档理解**：qwen-vl 系列对图片 / 文档截图做 OCR、表格提取、问答
- 📊 向量嵌入、语音等扩展能力（模型注册表已内置）

## 后端启动

```bash
cd <项目根>
npm install
cp .env.example .env   # 填入 DASHSCOPE_API_KEY（阿里云百炼控制台创建）
npm start              # http://localhost:3000
```

接口一览（`server/src/index.js`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/models` | 全模型目录 |
| POST | `/api/chat` | 非流式对话（文本/视觉） |
| POST | `/api/chat/stream` | 流式对话（SSE） |
| POST | `/api/image` | 图片生成（异步轮询） |
| POST | `/api/embed` | 向量嵌入 |

冒烟测试（不依赖真实 Key，本地 Mock 校验请求组装 / SSE / 异步轮询逻辑）：

```bash
npm run smoke
```

## 加载项联调

1. 启动后端 `npm start`。
2. 用浏览器打开 `http://localhost:3000/taskpane/taskpane.html` 预览前端。
3. 在 Word / Excel / PowerPoint 中通过 **插入 → 我的加载项 → 上传我的加载项** 旁加载 `manifest/office-ai-manifest.xml`（本地联调需 https 或按 Office 规范配置回环地址豁免）。

## 配置说明

- API Key：`.env` 的 `DASHSCOPE_API_KEY`，或 `config/dashscope.json` 的 `apiKey`。
- 端点：`https://dashscope.aliyuncs.com/compatible-mode/v1`（chat/embedding）与 `.../api/v1`（wanx 异步任务）。
- 图片生成流程：提交 → 轮询 `task_id` → 返回图片 URL。

## 验证说明

- 后端已通过本地冒烟测试（4/4：非流式、SSE 流式、图片异步轮询、向量嵌入）。
- 要求 Node.js >= 18。

## License

MIT
