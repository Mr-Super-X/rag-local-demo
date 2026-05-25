# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

本地 RAG 文档问答系统——Express + TypeScript 后端，原生 HTML/CSS/JS 前端。完全本地运行，无需外部 API。

## 常用命令

```bash
npm run setup    # 首次：下载 llama.cpp 引擎 + Qwen2.5-0.5B 模型 + Embedding 模型 (~480MB)
npm start        # tsx src/server.ts，启动 http://localhost:3000
npx tsx src/server.ts          # 等价于 npm start
npx tsx scripts/setup.ts       # 等价于 npm run setup
PORT=8080 npm start            # 自定义端口
```

没有 lint / test / build 命令——这是 Demo 项目，无测试框架和构建步骤。`tsx` 直接执行 TypeScript。

## 架构核心

### RAG 管道 (pipeline/)

按调用顺序的 5 个阶段：

```
parser.ts → chunker.ts → embedder.ts → retriever.ts → generator.ts
  (解析)      (切分)      (向量化)       (检索)         (生成)
```

1. **parser.ts** — 按扩展名 (`.pdf`/`.docx`/`.md`/`.txt`) 动态 import 解析库，返回纯文本
2. **chunker.ts** — 递归字符切分 (`\n\n` → `\n` → `。` → 硬切)，512 token/块，64 token 重叠
3. **embedder.ts** — `@xenova/transformers` 加载 all-MiniLM-L6-v2 (384维)，`pooling: 'mean'` + `normalize: true`。本地读取 `models/embedding/` 下的 ONNX 文件
4. **retriever.ts** — 问题向量化后调 LanceDB 余弦向量搜索 Top-K，过滤相似度 < 0.5 的结果
5. **generator.ts** — 管理 `llama-server` 子进程，通过 `spawn` 启动，暴露 `127.0.0.1:8080/v1/chat/completions` (OpenAI 兼容 SSE 流式)

### 数据存储 (store/)

**vector-db.ts** — LanceDB 嵌入式向量数据库，数据在 `data/lancedb/`。单表 `chunks`，schema 见 `types.ts` 的 `ChunkRecord`。无 schema 文件时自动创建空表（先插一条占位行再删除以定义 schema）。

### 关键设计决策

- **llama-server 是独立子进程**：不 import 为库，通过 `spawn` 启停。进程隔离——Node.js 崩溃不影响 LLM，反之亦然。`stopGenerator()` 先用 SIGTERM 优雅退出，5 秒后 SIGKILL 强制终止
- **Embedding 模型本地文件**：`setup.ts` 把 ONNX 文件下载到 `models/embedding/`，运行时通过 `env.localModelPath` 指向该目录，避免每次启动从 HuggingFace 下载
- **代理清理**：`server.ts` 和 `setup.ts` 都会在顶部清空 `HTTP_PROXY` / `HTTPS_PROXY` 等环境变量，防止系统代理干扰本地直连下载
- **setup.ts 跨平台**：通过 `os.platform()` / `os.arch()` 自动选择对应平台的 llama.cpp 二进制（Windows: `.zip` / macOS: `.tar.gz` / Linux: `.tar.gz`），下载支持指数退避重试和双源 fallback（hf-mirror → HuggingFace）

### 路由

```
GET  /api/health          — LLM + Embedding 就绪状态
POST /api/upload          — 上传文档 (multipart)，走完整管道：解析→切分→向量化→存储
GET  /api/documents       — 已上传文档列表
DELETE /api/documents/:id — 删除文档 (LanceDB + 上传文件)
POST /api/chat            — 问答 (SSE 流式返回 token + 末尾 sources)
GET  /*                   — SPA fallback → public/index.html
```

### 前端 (public/)

4 个文件通过 `<script>` 标签加载，无打包工具：
- `ui.js` — 标签切换、全局 UI 状态
- `upload.js` — 上传表单 + 文档列表
- `chat.js` — SSE 消费 + marked 渲染 Markdown
- `style.css` — 所有样式

`marked` 库通过 Express 静态路由 `/lib/marked/` 暴露给前端 ESM import。

## 目录结构

```
src/
  server.ts              — Express 入口，启动时预加载模型
  prompt.ts              — System Prompt 模板 + messages 组装
  types.ts               — 所有 TypeScript 类型/接口
  pipeline/              — RAG 管道 (parser → chunker → embedder → retriever → generator)
  routes/                — Express 路由 (health/documents/upload/chat)
  store/
    vector-db.ts         — LanceDB CRUD + 向量搜索
scripts/
  setup.ts               — 首次环境安装脚本 (跨平台)
public/                  — 前端静态文件
data/                    — 运行时数据 (uploads/ + lancedb/)，删除即重置
models/                  — 下载的 AI 模型文件
bin/                     — llama-server 可执行文件
docs/                    — 4 份配套教程文档
```
