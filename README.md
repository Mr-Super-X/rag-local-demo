# RAG 本地文档问答 Demo

基于检索增强生成（RAG）的本地文档问答系统，纯本地运行，无需任何外部 API，完全离线可用。

## 功能特性

- **多格式支持**：上传 PDF、Word (.docx)、Markdown、TXT 文件
- **智能检索**：基于语义向量相似度，精准定位文档中的相关段落
- **AI 问答**：本地 LLM 基于检索结果生成回答，并标注引用来源
- **跨文件提问**：一次提问可同时检索已上传的所有文档
- **流式输出**：回答逐字实时渲染，无需等待完整生成
- **完全本地**：无需 API Key，无需联网，数据完全存储在你自己的电脑上

## 系统架构

```
浏览器 (localhost:3000)
    │
    │ HTTP + SSE
    ▼
Express.js 服务
    │
    ├── 文档解析 ──── pdf-parse / mammoth / marked
    ├── 文本切分 ──── 递归字符切分 (512 token / 64 overlap)
    ├── 向量化 ────── all-MiniLM-L6-v2 (384维)
    ├── 向量存储 ──── LanceDB (本地嵌入式)
    ├── 向量检索 ──── 余弦相似度 Top-K + 阈值过滤
    └── LLM 生成 ──── llama-server (Qwen2.5-0.5B Q4_K_M)
```

## 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18.0 |
| 操作系统 | Windows x64（当前版本） |
| 磁盘空间 | ~1GB（含模型文件 ~480MB） |
| 内存 | >= 4GB RAM |
| 网络 | 首次安装时需下载模型（约 480MB） |

## 快速开始

```bash
# 1. 安装依赖
npm install --ignore-scripts

# 1.5 构建原生模块（sharp 下载可能超时，--ignore-scripts 跳过了它）
npm rebuild sharp onnxruntime-node

# 2. 下载运行环境和模型（首次运行，需联网，约 480MB）
npm run setup

# 3. 启动应用
npm start
```

启动后，在浏览器中打开 **http://localhost:3000**。

## 使用指南

### 上传文档

1. 点击左侧「上传文档」按钮
2. 选择 PDF、Word、Markdown 或 TXT 文件
3. 等待「正在解析文档...」提示消失，文档列表中出现文件名即表示完成

### 提问

1. 在右侧聊天框中输入问题
2. 按 Enter 或点击「发送」
3. 回答将逐字流式渲染
4. 回答下方可展开「引用来源」查看原文段落

### 提示

- 上传多个相关文档后，可以进行跨文件提问
- 如果回答显示「未找到相关文档段落」，请尝试上传更多相关文件或换个问法
- 扫描版 PDF（图片型）无法提取文字，请使用可选择文字的文档

## 项目结构

```
rag-local-demo/
├── package.json
├── tsconfig.json
├── README.md
├── scripts/
│   └── setup.ts              # 一键下载环境脚本
├── src/
│   ├── server.ts              # 服务入口 (Express)
│   ├── prompt.ts              # RAG Prompt 模板
│   ├── types.ts               # TypeScript 类型定义
│   ├── routes/
│   │   ├── health.ts          # GET  /api/health      — 服务健康检查
│   │   ├── documents.ts       # GET  /api/documents   — 文档列表
│   │   ├── upload.ts          # POST /api/upload      — 文件上传
│   │   └── chat.ts            # POST /api/chat        — 流式问答
│   ├── pipeline/
│   │   ├── parser.ts          # 文档格式解析
│   │   ├── chunker.ts         # 文本切分
│   │   ├── embedder.ts        # 文本向量化
│   │   ├── retriever.ts       # 向量检索
│   │   └── generator.ts       # LLM 进程管理 + 推理
│   └── store/
│       └── vector-db.ts       # LanceDB 向量库操作
└── public/
    ├── index.html             # 聊天界面
    ├── style.css              # 样式
    ├── ui.js                  # UI 状态管理
    ├── upload.js              # 文件上传模块
    └── chat.js                # SSE 流式对话模块
```

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js + TypeScript | — |
| Web 框架 | Express.js 4.x | HTTP 服务 + 静态文件 |
| 文档解析 | pdf-parse / mammoth / marked | 分别处理 PDF/Word/MD |
| 文本切分 | 自实现递归字符切分 | 512 token / 64 token overlap |
| Embedding | @xenova/transformers (all-MiniLM-L6-v2) | 384 维向量，~80MB |
| 向量数据库 | @lancedb/lancedb | 嵌入式，本地文件存储 |
| LLM 运行时 | llama.cpp (llama-server) | 预编译二进制，无需 CUDA |
| LLM 模型 | Qwen2.5-0.5B-Instruct Q4_K_M | ~400MB，CPU 推理 |
| 前端 | 纯 HTML/CSS/JS (ES Modules) | 零构建工具，零框架依赖 |

## RAG 工作流程

```
┌─────────────────────────────────────────────────────────┐
│                    文档入库流程                           │
│                                                         │
│  文件上传 → 格式识别 → 提取纯文本 → 切分为 Chunk          │
│     → Embedding 向量化 → 存入 LanceDB                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    问答查询流程                           │
│                                                         │
│  用户提问 → Embedding 向量化 → LanceDB 相似度检索        │
│     → 过滤低相关度结果 (阈值 0.5) → Prompt 模板组装       │
│     → llama-server 流式推理 → SSE 逐字返回               │
│     → 前端渲染回答 + 引用来源                             │
└─────────────────────────────────────────────────────────┘
```

## 配置

### 端口修改

默认端口 3000，可通过环境变量修改：

```bash
PORT=8080 npm start
```

### 模型替换

如需更换 LLM 模型，将 GGUF 模型文件放入 `models/llm/` 目录，然后修改 `src/pipeline/generator.ts` 中的 `MODEL_FILE` 常量。

### 检索参数

| 参数 | 默认值 | 位置 | 说明 |
|------|--------|------|------|
| Top-K | 5 | `src/routes/chat.ts` | 检索返回的最大结果数 |
| 相似度阈值 | 0.5 | `src/pipeline/retriever.ts` | 低于此值的结果被过滤 |
| Chunk 大小 | 512 token | `src/pipeline/chunker.ts` | 文本切分粒度 |
| Chunk 重叠 | 64 token | `src/pipeline/chunker.ts` | 相邻块重叠量 |

## 限制与已知问题

- **仅支持 Windows x64**：llama-server 二进制为 Windows 版本，如需 macOS/Linux 支持需替换二进制文件
- **扫描版 PDF 不支持**：依赖文字提取，图片型 PDF 会返回解析错误提示
- **小模型回答质量有限**：Qwen2.5-0.5B 是超小模型，回答仅适合演示 RAG 流程。如需更好效果，可替换为更大的模型（如 Qwen2.5-7B ~4GB）
- **首次启动较慢**：Embedding 模型和 LLM 加载需 10-30 秒（取决于 CPU 性能）
- **单用户**：无多用户隔离和认证机制
- **不持久化聊天记录**：刷新页面后聊天历史丢失
- **不支持图片/表格**：文档中的图片和表格会被忽略

## 常见问题

### npm install 报错 (sharp / network timeout)

`sharp` 是 `transformers.js` 的依赖，安装时需要从 GitHub 下载原生二进制文件。如遇超时，分两步安装：

```bash
# 第一步：跳过原生构建，安装所有 JS 包
npm install --ignore-scripts

# 第二步：单独构建原生模块
npm rebuild sharp onnxruntime-node
```

### npm start 报错 Cannot find module sharp

同上——原生模块未构建。执行 `npm rebuild sharp onnxruntime-node` 即可。

### npm run setup 下载失败

setup 脚本需要从 GitHub 和 HuggingFace 下载文件。如果网络受限，可手动下载：

1. 从 [llama.cpp Releases](https://github.com/ggml-org/llama.cpp/releases) 下载 `llama-b{tag}-bin-win-cpu-x64.zip`
2. 解压到项目 `bin/` 目录
3. 从 [HuggingFace](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF) 下载 `qwen2.5-0.5b-instruct-q4_k_m.gguf`
4. 放入 `models/llm/` 目录

### 端口被占用

```
端口 3000 已被占用。请设置 PORT 环境变量使用其他端口。
```

```bash
# Windows PowerShell
$env:PORT=8080; npm start
```

### 模型加载缓慢

首次启动时需要加载 Embedding 模型（~80MB）和 LLM 模型（~400MB）。Embedding 模型由 transformers.js 自动下载缓存。LLM 模型由 `npm run setup` 下载。后续启动只需加载模型到内存，通常 5-15 秒。
