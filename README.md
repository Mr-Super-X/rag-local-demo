# RAG 本地文档问答 Demo

基于检索增强生成（RAG）的本地文档问答系统——纯本地运行，无需任何外部 API，完全离线可用。

## 文档导航

| 文档                                                                | 适合                                                     | 预计时间 |
| ------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| 本文档 (README)                                                     | 了解项目概况 + 快速启动                                  | 5 分钟   |
| [理解 RAG：从概念到实践](docs/理解RAG-从概念到实践.md)              | **所有人**——RAG 是什么、为什么用、核心概念、在线 AI 对比 | 15 分钟  |
| [从零搭建本地 RAG 知识库](docs/从零搭建本地RAG知识库.md)            | **零基础用户**——安装、使用、踩坑速查                     | 20 分钟  |
| [手把手教你从零写一个本地 RAG](docs/手把手教你从零写一个本地RAG.md) | **开发者**——逐行写代码 + 设计原理 + 生产进阶             | 半天     |
| [RAG 模拟面试问答](docs/RAG模拟面试问答.md)                         | **面试准备**——基础→工程→生产 27 个问答                   | 1 小时   |

> **建议阅读顺序**：理解 RAG（概念）→ 从零搭建（使用）→ 手把手教程（原理）→ 模拟面试（检验）。

---

## 功能特性

- **多格式支持**：上传 PDF、Word (.docx)、Markdown、TXT 文件
- **智能检索**：语义向量相似度搜索，精准定位文档中的相关段落
- **AI 问答**：本地 LLM 基于检索结果生成回答 + 引用来源标注
- **跨文件提问**：一次提问同时检索所有已上传文档
- **流式输出**：逐字实时渲染 + Markdown 格式（代码高亮、表格、列表）
- **完全本地**：无需 API Key，无需联网，数据完全存储在本地

## 系统架构

```
                        浏览器 (localhost:3000)
                              │
              ┌───────────────┼───────────────┐
              ▼               │               ▼
        POST /api/upload       │        POST /api/chat (SSE)
              │               │               │
              ▼               │               ▼
    ┌─────────────┐           │     ┌─────────────┐
    │  文档解析    │           │     │  向量检索    │
    │ pdf-parse   │           │     │ Top-5 + 阈值 │
    │ mammoth     │           │     │ 相似度 ≥ 0.5 │
    │ marked      │           │     └──────┬──────┘
    └──────┬──────┘           │            │
           ▼                  │            ▼
    ┌─────────────┐           │     ┌─────────────┐
    │  文本切分    │           │     │  Prompt 组装 │
    │ 512 token   │           │     │ system + ctx │
    │ 64 overlap  │           │     │ + question   │
    └──────┬──────┘           │     └──────┬──────┘
           ▼                  │            │
    ┌─────────────┐           │            ▼
    │  向量化      │           │     ┌─────────────┐
    │ all-MiniLM  │           │     │ llama-server │
    │ 384维向量    │           │     │ Qwen2.5-0.5B│
    └──────┬──────┘           │     │ 流式生成回答  │
           ▼                  │     └──────┬──────┘
    ┌─────────────┐           │            │
    │   LanceDB   │◄──────────┘            │
    │  向量存储+检索│                       │
    └─────────────┘                        │
           ▲                               │
           └───────────────┬───────────────┘
                           ▼
                  前端渲染回答 + 引用来源
```

## 环境要求

| 项目     | 要求                               |
| -------- | ---------------------------------- |
| Node.js  | >= 18.0                            |
| 操作系统 | Windows 10/11 x64                  |
| 磁盘空间 | ~1GB（含模型文件 ~480MB）          |
| 内存     | >= 4GB RAM                         |
| 网络     | 首次安装时下载模型（后续完全离线） |

## 快速开始

```bash
# 1. 安装依赖
npm install --ignore-scripts

# 2. 构建原生模块
npm rebuild sharp onnxruntime-node

# 3. 下载运行环境和 AI 模型（首次，需联网，约 480MB）
npm run setup

# 4. 启动
npm start
```

浏览器打开 <http://localhost:3000>，上传文档即可开始提问。

## 技术栈

| 组件       | 技术                                  | 说明                             |
| ---------- | ------------------------------------- | -------------------------------- |
| 运行时     | Node.js + TypeScript                  | tsx 直接执行，无需编译           |
| Web 框架   | Express.js 4.x                        | HTTP 服务 + 静态文件             |
| 文档解析   | pdf-parse / mammoth / marked          | 纯 JS，零系统依赖                |
| 文本切分   | 自实现递归字符切分                    | 512 token / 64 token overlap     |
| Embedding  | @xenova/transformers all-MiniLM-L6-v2 | 384 维，~80MB，纯 CPU            |
| 向量数据库 | @lancedb/lancedb                      | 嵌入式，本地文件，零配置         |
| LLM 运行时 | llama.cpp (llama-server)              | 预编译二进制，进程隔离           |
| LLM 模型   | Qwen2.5-0.5B-Instruct Q4_K_M          | ~400MB，CPU 推理，中文友好       |
| 前端       | 纯 HTML/CSS/JS (ES Modules)           | 零构建工具，marked 渲染 Markdown |

> **选型原则**：零外部服务依赖、纯 JS/TS 生态、模型总体积 ≤ 500MB、CPU 友好。详细技术选型对比见[手把手教程 §0.2](docs/手把手教你从零写一个本地RAG.md)。

## 配置

| 参数       | 默认值       | 位置                        | 说明                         |
| ---------- | ------------ | --------------------------- | ---------------------------- |
| 服务端口   | 3000         | 环境变量 `PORT`             | `set PORT=8080 && npm start` |
| 检索 Top-K | 5            | `src/routes/chat.ts`        | 检索返回的最大结果数         |
| 相似度阈值 | 0.5          | `src/pipeline/retriever.ts` | 低于此值的结果被过滤         |
| Chunk 大小 | 512 token    | `src/pipeline/chunker.ts`   | 文本切分粒度                 |
| Chunk 重叠 | 64 token     | `src/pipeline/chunker.ts`   | 相邻块重叠量                 |
| LLM 模型   | qwen2.5-0.5b | `src/pipeline/generator.ts` | 可替换为任意 GGUF 模型       |

## 限制与已知问题

- **跨平台**：支持 Windows / macOS / Linux。`npm run setup` 自动检测平台下载对应二进制
- **扫描版 PDF 不支持**：依赖文字提取，图片型 PDF 会返回解析错误
- **小模型回答质量有限**：0.5B 参数仅适合演示。换 Qwen2.5-1.5B（~1.5GB）质量明显提升
- **首次启动较慢**：模型加载需 10-30 秒
- **单用户**：无多用户隔离和认证
- **不持久化聊天**：刷新页面后历史丢失

## 常见问题

### npm install 报错 (sharp / network timeout)

`sharp` 是 `@xenova/transformers` 的间接依赖，安装时需从 GitHub 下载原生文件。如遇超时：

```bash
npm install --ignore-scripts
npm rebuild sharp onnxruntime-node
```

### npm run setup 下载失败

脚本已内置国内镜像（hf-mirror.com）、代理清除、超时自动重试（3 次）。如仍失败：

```bash
# 方式一：重新运行（自动重试可能换节点）
rm models/llm/*.gguf
npm run setup

# 方式二：手动下载
# 1. 从 https://github.com/ggml-org/llama.cpp/releases 下载 win-cpu-x64.zip → 解压到 bin/
# 2. 从 https://hf-mirror.com/Qwen/Qwen2.5-0.5B-Instruct-GGUF 下载 q4_k_m.gguf → 放到 models/llm/
```

### 端口被占用

```bash
set PORT=8080 && npm start
```

---

## 项目结构

```
rag-local-demo/
├── package.json
├── tsconfig.json
├── README.md
├── docs/
│   ├── 从零搭建本地RAG知识库.md    # 使用手册 + 踩坑速查
│   ├── 手把手教你从零写一个本地RAG.md # 逐行代码教程 + 生产进阶
│   └── RAG模拟面试问答.md          # 27 个技术面试问答
├── scripts/
│   └── setup.ts                   # 一键下载环境脚本
├── src/
│   ├── server.ts                  # Express 入口
│   ├── prompt.ts                  # RAG Prompt 模板
│   ├── types.ts                   # 类型定义
│   ├── routes/                    # API 路由
│   │   ├── health.ts              # GET  /api/health
│   │   ├── documents.ts           # GET  /api/documents + DELETE
│   │   ├── upload.ts              # POST /api/upload
│   │   └── chat.ts                # POST /api/chat (SSE)
│   ├── pipeline/                  # RAG 核心管线
│   │   ├── parser.ts              # 文档解析 (PDF/Word/MD/TXT)
│   │   ├── chunker.ts             # 递归字符切分
│   │   ├── embedder.ts            # 文字 → 384 维向量
│   │   ├── retriever.ts           # 向量检索 + 阈值过滤
│   │   └── generator.ts           # LLM 进程管理 + 流式推理
│   └── store/
│       └── vector-db.ts           # LanceDB CRUD
└── public/                        # 前端 (纯 HTML/CSS/JS)
    ├── index.html
    ├── style.css
    ├── ui.js                      # DOM + 状态管理
    ├── upload.js                  # 文件上传模块
    └── chat.js                    # SSE 流式对话 + Markdown 渲染
```
