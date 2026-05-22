# 手把手教你从零写一个本地 RAG

> 本教程会带你从空文件夹开始，亲手写出一个能跑的本地 RAG 文档问答系统。
> 每行代码都会解释为什么这样写。读完你不仅会用，还会懂原理。

---

## 目录

0. [RAG 总览——这个系统在做什么](#01-rag-是怎么工作的)
   - [技术选型——为什么选这些](#02-技术选型为什么选这些)
   - [系统架构——各组件如何协作](#03-系统架构各组件如何协作)
1. [准备环境](#一准备环境)
2. [创建项目骨架](#二创建项目骨架)
3. [类型定义](#三类型定义)
4. [文档解析器](#四文档解析器)
5. [文本切分器](#五文本切分器)
6. [向量化模块](#六向量化模块)
7. [向量数据库](#七向量数据库)
8. [检索模块](#八检索模块)
9. [LLM 生成模块](#九llm-生成模块)
10. [Prompt 模板](#十prompt-模板)
11. [API 路由](#十一api-路由)
12. [服务器入口](#十二服务器入口)
13. [模型下载脚本](#十三模型下载脚本)
14. [前端界面](#十四前端界面)
15. [启动测试](#十五启动测试)
16. [进阶：从 Demo 到生产级 RAG 系统](#十六进阶从-demo-到生产级-rag-系统)

---

## 一、准备环境

### 0.1 RAG 是怎么工作的？

在动手写代码之前，先理解整个系统在做什么。下面这张图就是你将要搭的东西：

```
┌─ 文档入库（离线）─────────────────────────────────────────┐
│                                                         │
│  你的 PDF/Word/MD → 解析为纯文本 → 切成小块(Chunk)       │
│    → 每块用 embedding 模型转为 384 维向量 → 存入 LanceDB │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─ 问答查询（在线）─────────────────────────────────────────┐
│                                                         │
│  你输入问题 → 问题也转为 384 维向量                       │
│    → 在 LanceDB 中搜最相似的 5 个文档块                    │
│    → 把文档块 + 问题拼成 Prompt → 发给本地 LLM           │
│    → LLM 逐字输出回答 → 前端实时渲染                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

整个系统分为 15 个模块，你会按这个顺序逐个实现：

| 章节 | 模块 | 在系统里的角色 |
|------|------|-------------|
| 二~三 | 项目骨架 + 类型 | 地基——定义"这个项目是什么"和"数据长什么样" |
| 四~五 | 解析器 + 切分器 | 入库管线前半段——把文件变成文本块 |
| 六~八 | 向量化 + 向量库 + 检索 | RAG 核心——语义搜索 |
| 九~十 | LLM 模块 + Prompt | 回答生成——调用 AI 写出答案 |
| 十一~十二 | API 路由 + 服务器 | 桥梁——把前端和后端连起来 |
| 十三 | 下载脚本 | 准备——下载 AI 模型和运行环境 |
| 十四 | 前端界面 | 门面——用户看到和操作的东西 |
| 十五 | 启动测试 | 验证——一切就绪，跑起来！ |

别担心看起来很复杂。每个模块平均只有 60~150 行代码，15 个模块加起来约 1500 行。一章一章来，半天就能写完。

> **概念准备**：如果你对向量、维度、Embedding 模型、余弦相似度等概念还不熟悉，建议先花 15 分钟读 **[理解 RAG：从概念到实践](理解RAG-从概念到实践.md)**。本文聚焦"如何写代码"，那篇聚焦"为什么这样设计"。

---

### 0.2 技术选型——为什么选这些

在动手写代码之前，你可能好奇：外面那么多 AI 工具和框架，为什么本教程选的是这些？

**选型原则**：针对 Demo 场景，我们追求三个目标——**零外部服务依赖**（不需要装数据库、不需要注册 API）、**纯 JS/TS 生态**（一个语言搞定前后端+AI）、**总模型体积 ≤ 500MB**（下载快、CPU 能跑）。

每个组件的决策过程：

#### Embedding 模型：Xenova/all-MiniLM-L6-v2

| 候选 | 维度 | 大小 | 为什么选/不选 |
|------|------|------|-------------|
| **all-MiniLM-L6-v2** ✅ | 384 | 80MB | 纯 JS（transformers.js），CPU 友好，足够 Demo 使用 |
| BGE-large-zh-v1.5 | 1024 | 1.3GB | 中文效果更好但太大，且 transformers.js 不支持 |
| text2vec-large-chinese | 1024 | 1.2GB | 同上，模型体积超过 500MB 总预算 |
| OpenAI text-embedding-3-small | 1536 | 0 (API) | 需要 API Key，违反"纯本地"原则 |

**决策理由**：all-MiniLM-L6-v2 是唯一一个能在 **Node.js 纯 CPU 环境**下运行、体积可控、且 `@xenova/transformers` 官方支持的 embedding 模型。384 维对 Demo 场景完全够用。

#### 向量数据库：LanceDB

| 候选 | 部署方式 | 为什么选/不选 |
|------|---------|-------------|
| **LanceDB** ✅ | 嵌入式（npm 包，零配置） | 本地文件存储，不需要安装任何服务 |
| ChromaDB | Python 嵌入式 | Python only，Node.js 只能用 HTTP 客户端——多一个服务要启动 |
| Qdrant | 独立服务 | 需要 Docker 或手动安装，太重 |
| Milvus | 分布式集群 | 企业级方案，Demo 严重过度工程 |
| Pinecone | 云服务 | 需要 API Key + 联网 |

**决策理由**：LanceDB 是唯一一个"npm install 就能用"的向量数据库——不需要 Docker、不需要启动额外进程、数据直接存本地文件。对 Demo 来说零运维成本是最重要的。

#### LLM 运行时：llama.cpp (llama-server.exe)

| 候选 | 运行方式 | 为什么选/不选 |
|------|---------|-------------|
| **llama.cpp** ✅ | 独立可执行文件（预编译 .exe） | 无需 C++ 编译器，15MB 下载即用，CPU 高效推理 |
| Ollama | 独立安装 | 成熟的本地 LLM 工具，但需要用户额外下载安装 .msi |
| node-llama-cpp | npm 原生插件 | 需 Visual Studio Build Tools（6-8GB），违反轻量原则 |
| @xenova/transformers | npm 包纯 JS | 文本生成模型质量差（flan-t5），LLM 回答不可用 |
| vLLM | GPU 服务 | 企业级 GPU 推理框架，Demo 不需要 |

**决策理由**：llama.cpp 提供预编译的 Windows 二进制包（一个 .zip，解压即用），管理为子进程，通过 HTTP API 通信。既避免了 C++ 编译的复杂性，又保证了 LLM 推理质量。**进程隔离**——Node.js 崩了 LLM 不受影响，反之亦然。

#### LLM 模型：Qwen2.5-0.5B-Instruct (GGUF, Q4_K_M 量化)

| 候选 | 大小 | 为什么选/不选 |
|------|------|-------------|
| **Qwen2.5-0.5B** ✅ | ~400MB (Q4) | 500MB 预算内，中文支持好，指令遵循能力基础可用 |
| Qwen2.5-1.5B | ~1.1GB (Q4) | 质量好很多但超出体积预算 |
| Llama-3.2-1B | ~700MB (Q4) | 英文为主，中文支持弱 |
| Gemma-2-2B | ~1.7GB (Q4) | 太大 |

**决策理由**：0.5B 是能在 500MB 预算内找到的唯一一个有较好中文支持的指令微调模型。Q4_K_M 量化平衡了体积和精度。回答质量确实有限，但对 RAG 流程演示来说——检索到相关段落 + 基于段落生成回答——完全够用。**用户可随时换成更大的模型。**

#### 文档解析：pdf-parse / mammoth / marked

| 组件 | 用途 | 为什么选 |
|------|------|---------|
| `pdf-parse` | PDF → 纯文本 | 纯 JS 实现，零系统依赖（不需要装 poppler/ghostscript） |
| `mammoth` | Word (.docx) → 纯文本 | 纯 JS，专注提取文字，比 word-extractor 更准确 |
| `marked` | Markdown → HTML → 纯文本 | 也在前端复用（Markdown 渲染），一份依赖两处使用 |

#### 前端：纯 HTML/CSS/JS（ES Modules）

| 候选 | 为什么选/不选 |
|------|-------------|
| **纯 HTML/CSS/JS** ✅ | 零构建工具，零框架依赖，一个 `index.html` + 三个 `.js` 文件 |
| React / Vue | 需要打包工具（Vite/Webpack），增加几十个依赖，Demo 过度工程 |
| htmx | 好选择但不是教程目标——我们想展示手写 SSE 流式处理的过程 |

---

### 0.3 系统架构——各组件如何协作

在写代码之前，先在脑中建立一个完整的架构图。下面这张图就是你要搭建的东西：

```
┌─────────────────────────────────────────────────────────┐
│                 Browser (localhost:3000)                 │
│  ┌────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │  upload.js │  │    ui.js      │  │   chat.js     │  │
│  │  文件上传   │  │  DOM + 状态   │  │  SSE流式对话   │  │
│  └─────┬──────┘  └───────────────┘  └───────┬───────┘  │
│        │              ↑    ↑               │           │
└────────┼──────────────┼────┼───────────────┼───────────┘
         │              │    │               │
         │   POST       │    │    POST       │
         │  /api/upload │    │   /api/chat   │
         ▼              │    │               ▼
┌────────────────────────┼────┼───────────────────────────┐
│               Express.js Server (TypeScript)            │
│                        │    │                           │
│  ┌─────────────────────┼────┼────────────────────────┐  │
│  │    upload.ts        │    │       chat.ts          │  │
│  │  ① 接收文件          │    │   ① 接收问题            │  │
│  │  ② parser.ts        │    │   ② retriever.ts       │  │
│  │     ↓               │    │      ↓                 │  │
│  │  ③ chunker.ts       │    │   ③ buildChatMessages  │  │
│  │     ↓               │    │      ↓                 │  │
│  │  ④ embedder.ts      │    │   ④ generator.ts       │  │
│  │     ↓               │    │      ↓                 │  │
│  │  ⑤ vector-db.ts     │    │   ⑤ SSE 流式返回        │  │
│  └─────────┬───────────┘    └────────────────────────┘  │
│            │                                            │
│  ┌─────────▼──────────────────────────────────────┐     │
│  │          @lancedb/lancedb                       │     │
│  │   Table: chunks (id, text, vector 384维,        │     │
│  │   docId, docName, chunkIndex, createdAt)        │     │
│  └────────────────────────────────────────────────┘     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │      llama-server.exe (子进程, port 8080)       │    │
│  │   模型: qwen2.5-0.5b-q4_k_m.gguf (~400MB)      │    │
│  │   接口: /v1/chat/completions (OpenAI 兼容)       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  data/uploads/       │  │  models/                  │ │
│  │   (原始文件)          │  │  ├── embedding/           │ │
│  │                      │  │  │   all-MiniLM-L6-v2/    │ │
│  │  data/lancedb/       │  │  │   (~80MB, 4 文件)      │ │
│  │   (向量索引)          │  │  └── llm/                 │ │
│  │                      │  │      qwen2.5-0.5b.gguf    │ │
│  └──────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**两条核心数据流：**

**🔵 文档入库（上传时）**
```
浏览器 → Express → multer 接收文件
  → parser.ts 解析（PDF/Word/MD → 纯文本）
  → chunker.ts 切分（递归字符切分，512 token/块）
  → embedder.ts 向量化（384 维向量，每块一条）
  → vector-db.ts 批量写入 LanceDB
  → 返回 { docId, docName, chunkCount }
```

**🟢 智能问答（提问时）**
```
浏览器 → Express → chat.ts 接收问题
  → embedder.ts 把问题转成 384 维向量
  → retriever.ts 在 LanceDB 中搜 Top-5 最相似片段
    → 过滤相似度 < 0.5 的低质结果
  → prompt.ts 拼接 Prompt（system + context + question）
  → generator.ts 调用 llama-server /v1/chat/completions (SSE 流式)
  → 逐 token 通过 SSE 推送回浏览器
  → chat.js 逐字渲染 + marked 渲染 Markdown
  → 回答完成后展示来源引用（文件名 + 段落）
```

**你接下来要做的事**：按章节顺序逐个实现图中的模块。从 `types.ts`（定义数据形状）→ `parser.ts`（解析文档）→ `chunker.ts`（切分）→ `embedder.ts`（向量化）→ `vector-db.ts`（存储）→ `retriever.ts`（检索）→ `generator.ts`（LLM）→ `prompt.ts`（模板）→ API 路由 → `server.ts`（入口）→ `setup.ts`（下载）→ 前端界面。一章一个模块，写完即用。

---

### 1.1 你需要安装

- **Node.js**：去 [nodejs.org](https://nodejs.org) 下载 LTS 版，一路 Next 安装
- 验证：打开命令行（Win+R → 输入 `cmd`），输入 `node --version`，看到 v20.x 就行

### 1.2 创建空文件夹

```bash
mkdir rag-demo
cd rag-demo
```

从现在开始，我们就在这个空文件夹里从零搭建整个项目。

---

## 二、创建项目骨架

这两个文件定义了项目叫什么、依赖哪些包、TypeScript 怎么编译。

### 2.1 package.json

新建 `package.json`：

```json
{
  "name": "rag-demo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "setup": "tsx scripts/setup.ts",
    "start": "tsx src/server.ts"
  },
  "dependencies": {
    "@lancedb/lancedb": "^0.29.0",
    "@xenova/transformers": "^2.17.0",
    "express": "^4.21.0",
    "mammoth": "^1.8.0",
    "marked": "^15.0.0",
    "multer": "^2.0.0",
    "onnxruntime-node": "^1.21.0",
    "pdf-parse": "^1.1.0",
    "@types/pdf-parse": "^1.1.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/multer": "^2.1.0",
    "@types/node": "^22.15.0",
    "tsx": "^4.22.0",
    "typescript": "^5.9.0"
  }
}
```

**包的作用速查**：

| 包名 | 干什么的 |
|------|---------|
| `express` | 启动 HTTP 服务器 |
| `multer` | 处理文件上传 |
| `pdf-parse` | 读取 PDF 里的文字 |
| `mammoth` | 读取 Word 文档里的文字 |
| `marked` | 解析 Markdown / 前端渲染 Markdown |
| `@xenova/transformers` | 把文字转成向量（embedding） |
| `onnxruntime-node` | transformers 的底层推理引擎 |
| `@lancedb/lancedb` | 本地向量数据库，存向量和搜索 |
| `tsx` | 直接运行 TypeScript 文件（不用编译） |
| `typescript` | 类型检查 |

### 2.2 tsconfig.json

新建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts"]
}
```

### 2.3 创建目录结构

```bash
mkdir scripts
mkdir src
mkdir src\routes
mkdir src\pipeline
mkdir src\store
mkdir public
mkdir data\uploads
mkdir data\lancedb
mkdir models\embedding
mkdir models\llm
```

### 2.3.5 创建 .gitignore

新建 `.gitignore`，避免把几百 MB 的模型文件和依赖提交到 git：

```
node_modules/
dist/
data/
models/
bin/
*.exe
*.gguf
*.ps1
```

### 2.4 安装依赖

```bash
npm install --ignore-scripts
npm rebuild sharp onnxruntime-node
```

> **为什么分两步 + 为什么 rebuild sharp**：`sharp` 是 `@xenova/transformers` 的间接依赖（处理图片用的，不在你的 package.json 里），它安装时需要从 GitHub 下载原生二进制文件，网络可能超时导致整体 `npm install` 失败。`--ignore-scripts` 先跳过所有原生编译，再用 `rebuild` 单独处理这两个需要原生模块的包。

---

## 三、类型定义

`src/types.ts` — 定义整个项目用到的数据结构。写代码前先把类型定义好，后面就不容易搞混。

```typescript
// 向量数据库里存的一条记录（一个文档片段）
export interface ChunkRecord {
  id: string;
  text: string;          // 片段文本
  vector: number[];      // 384 维向量
  docId: string;         // 属于哪个文档
  docName: string;       // 文档文件名
  chunkIndex: number;    // 在文档内的序号
  createdAt: string;
}

// 文档列表里展示的一条文档信息
export interface DocumentInfo {
  docId: string;
  docName: string;
  chunkCount: number;
  uploadedAt: string;
}

// 检索结果
export interface SearchResult {
  text: string;
  docName: string;
  chunkIndex: number;
  similarity: number;
}

// 回答来源引用
export interface Source {
  docName: string;
  text: string;
  chunkIndex: number;
}

// 上传接口返回
export interface UploadResult {
  docId: string;
  docName: string;
  chunkCount: number;
}

// 健康检查状态
export interface HealthStatus {
  status: 'loading' | 'ready' | 'error';
  llm: boolean;
  embedding: boolean;
  message: string;
}
```

---

## 四、文档解析器

`src/pipeline/parser.ts` — 负责把上传的文件（PDF/Word/Markdown/TXT）读成纯文本。

```typescript
import fs from 'fs/promises';

type ParserFn = (filePath: string) => Promise<string>;

// PDF 解析
async function parsePdf(filePath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

// Word 解析
async function parseDocx(filePath: string): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

// Markdown 解析（去掉 HTML 标签得到纯文本）
async function parseMarkdown(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  const { marked } = await import('marked');
  const html = await marked(content);
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// 注册解析器：扩展名 → 解析函数
const PARSERS: Record<string, ParserFn> = {
  '.pdf': parsePdf,
  '.docx': parseDocx,
  '.md': parseMarkdown,
  '.txt': async (filePath) => fs.readFile(filePath, 'utf-8'),
};

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.md', '.txt'];

// 根据扩展名调度到对应的解析器
export async function parseDocument(filePath: string, ext: string): Promise<string> {
  const parser = PARSERS[ext.toLowerCase()];
  if (!parser) {
    throw new Error(`不支持的文件格式: ${ext}`);
  }
  return parser(filePath);
}
```

**设计要点**：用了"策略模式"——一个 `PARSERS` 表把扩展名映射到解析函数。以后要加 `.pptx` 支持，只需加一个函数、注册一行，其他代码不用动。

---

## 五、文本切分器

`src/pipeline/chunker.ts` — 把长篇文本切成小块，为后续向量化做准备。

**为什么要切分**？因为 embedding 模型一次只能处理有限长度的文本（512 个 token），而且小块检索更精准。

```typescript
const CHUNK_SIZE = 512;     // 每块最多 512 个 token（约 300-500 个中文字符）
const CHUNK_OVERLAP = 64;   // 相邻块之间重叠 64 个 token，防止关键信息被切断
const SEPARATORS = ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' ', ''];

export function chunkText(text: string): { text: string; index: number }[] {
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/\0/g, '');
  const chunks = splitRecursive(cleanText, SEPARATORS, CHUNK_SIZE, CHUNK_OVERLAP);
  return chunks.map((c, i) => ({ text: c, index: i }));
}

// 递归切分：先按大分隔符切，切完还有超长的再用下一级分隔符继续切
function splitRecursive(
  text: string, separators: string[], chunkSize: number, overlap: number
): string[] {
  if (text.length === 0) return [];
  const [sep, ...restSep] = separators;

  // 最后一级也不够 → 硬按字符数切
  if (sep === '') {
    return splitByLength(text, chunkSize);
  }

  const splits = text.split(sep);
  const result: string[] = [];
  let current = '';

  for (const part of splits) {
    if (current.length + part.length + sep.length > chunkSize && current.length > 0) {
      result.push(current.trim());
      current = part;
    } else {
      current = current ? current + sep + part : part;
    }
  }
  if (current.trim()) result.push(current.trim());

  // 对仍然超长的块递归用下一级分隔符
  const final: string[] = [];
  for (const chunk of result) {
    if (chunk.length > chunkSize && restSep.length > 0) {
      final.push(...splitRecursive(chunk, restSep, chunkSize, overlap));
    } else {
      final.push(chunk);
    }
  }
  return addOverlap(final, overlap);
}

function splitByLength(text: string, size: number): string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length; start += size) {
    result.push(text.slice(start, start + size));
  }
  return result;
}

// 相邻块之间加上重叠
function addOverlap(chunks: string[], overlapChars: number): string[] {
  if (chunks.length <= 1) return chunks;
  const result = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const overlap = prev.length > overlapChars ? prev.slice(-overlapChars) : prev;
    result.push(overlap + chunks[i]);
  }
  return result;
}
```

**设计要点**：采用"递归字符切分"——优先在自然断点（段落、句子）处切，实在切不动了才做硬截断。重叠保证边界附近的文字同时出现在上下文里。

---

## 六、向量化模块

`src/pipeline/embedder.ts` — 把文字转成向量（一串 384 个数字）。这是整个 RAG 系统最核心的一步。

**原理简介**：`all-MiniLM-L6-v2` 是一个已经训练好的"文字→向量"模型。它能把含义相近的文字映射到空间中相近的点——比如"苹果手机"和"iPhone"的向量距离会很近。

> 想深入理解向量、维度、Embedding 模型和 LLM 的区别？参考 **[理解 RAG：从概念到实践 §四](理解RAG-从概念到实践.md)**。

```typescript
import path from 'path';
import type { FeatureExtractionPipeline } from '@xenova/transformers';

let pipeline: FeatureExtractionPipeline | null = null;
let isReady = false;
let loadError: string | null = null;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const LOCAL_MODELS = path.resolve(process.cwd(), 'models', 'embedding');

export function getEmbeddingStatus() {
  return { ready: isReady, error: loadError };
}

export async function initEmbedder(): Promise<void> {
  if (isReady) return;
  try {
    const { env, pipeline: pipe } = await import('@xenova/transformers');
    // 用本地预下载的模型文件，不走网络
    env.allowLocalModels = true;
    env.localModelPath = LOCAL_MODELS;

    pipeline = await pipe('feature-extraction', MODEL_NAME, { quantized: true });
    isReady = true;
    console.log('[Embedding] 模型加载完成 (本地):', MODEL_NAME);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!pipeline || !isReady) await initEmbedder();

  const embeddings: number[][] = [];
  for (const text of texts) {
    const result = await pipeline!(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(result.data as Float32Array));
  }
  return embeddings;
}

export async function embedSingle(text: string): Promise<number[]> {
  const results = await embed([text]);
  return results[0];
}
```

**设计要点**：`pipeline` 是**单例**——只加载一次，后续复用，避免重复加载几百 MB 的模型。`env.localModelPath` 指向预下载的本地文件，不用每次启动都从网络下载。

---

## 七、向量数据库

`src/store/vector-db.ts` — 封装 LanceDB 的所有操作。LanceDB 是一个嵌入式向量数据库，不需要装任何服务，一个文件夹搞定。

```typescript
import * as lancedb from '@lancedb/lancedb';
import type { Connection, Table } from '@lancedb/lancedb';
import path from 'path';
import type { ChunkRecord } from '../types';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'lancedb');
const TABLE_NAME = 'chunks';

let db: Connection | null = null;
let table: Table | null = null;

export async function getDb(): Promise<Connection> {
  if (!db) db = await lancedb.connect(DATA_DIR);
  return db;
}

export async function getTable(): Promise<Table> {
  if (table) return table;
  const conn = await getDb();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    table = await conn.openTable(TABLE_NAME);
  } else {
    // 用一条占位记录创建表（LanceDB 需要推断 schema）
    table = await conn.createTable(TABLE_NAME, [{
      id: '', text: '', vector: new Array(384).fill(0) as number[],
      docId: '', docName: '', chunkIndex: 0, createdAt: new Date().toISOString(),
    }]);
    await (table as Table).delete('id = ""');
  }
  return table;
}

// 添加片段（批量）
export async function addChunks(records: ChunkRecord[]): Promise<void> {
  const tbl = await getTable();
  await tbl.add(records as unknown as Array<Record<string, unknown>>);
}

// 向量检索
export async function searchChunks(vector: number[], limit = 5) {
  const tbl = await getTable();
  const results = await tbl.vectorSearch(vector)
    .distanceType('cosine')   // 用余弦距离衡量相似度
    .limit(limit)
    .toArray();

  return results.map((r: Record<string, unknown>) => ({
    text: r.text as string,
    docName: r.docName as string,
    chunkIndex: r.chunkIndex as number,
    docId: r.docId as string,
    _distance: r._distance as number,
  }));
}

// 文档统计（用于文档列表）
export async function getDocumentStats() {
  const tbl = await getTable();
  const data = await tbl.query().toArray();
  const map = new Map();
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const docId = r.docId as string;
    if (!map.has(docId)) {
      map.set(docId, { docName: r.docName, chunkCount: 0, uploadedAt: r.createdAt });
    }
    map.get(docId).chunkCount++;
  }
  return Array.from(map.entries()).map(([docId, info]) => ({ docId, ...info }));
}

export async function deleteDocument(docId: string): Promise<void> {
  const tbl = await getTable();
  await tbl.delete(`docId = "${docId}"`);
}

export async function hasDocuments(): Promise<boolean> {
  const tbl = await getTable();
  return (await tbl.countRows()) > 0;
}
```

**设计要点**：LanceDB 在磁盘上只是一个文件夹，`lancedb.connect(DATA_DIR)` 就完成了"数据库连接"。创建空表时必须插入一条有 schema 的数据再删掉——否则 LanceDB 不知道这张表有哪些列。

---

## 八、检索模块

`src/pipeline/retriever.ts` — 把用户问题转成向量，在向量库里找最相似的片段。

```typescript
import { searchChunks } from '../store/vector-db';
import { embedSingle } from './embedder';
import type { SearchResult } from '../types';

const MIN_SIMILARITY = 0.5;  // 最低相似度阈值：低于此值的结果丢弃

export async function retrieve(query: string, topK = 5): Promise<SearchResult[]> {
  // 1. 把问题转成向量
  const queryVector = await embedSingle(query);

  // 2. 在向量库里找最相似的 topK 个片段
  const results = await searchChunks(queryVector, topK);

  // 3. 过滤低相似度 + 按相似度从高到低排序
  return results
    .map((r) => ({
      text: r.text,
      docName: r.docName,
      chunkIndex: r.chunkIndex,
      similarity: 1 - r._distance,  // 余弦距离 → 余弦相似度
    }))
    .filter((r) => r.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity);
}
```

**设计要点**：`MIN_SIMILARITY = 0.5` 是经验值——太低会有不相关的结果混进来，太高可能什么也找不到。可以按需调整。

---

## 九、LLM 生成模块

`src/pipeline/generator.ts` — 管理 llama-server 进程，把检索到的文档片段 + 用户问题发给它生成回答。

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const BIN_DIR = path.resolve(process.cwd(), 'bin');
const LLM_DIR = path.resolve(process.cwd(), 'models', 'llm');
const MODEL_FILE = 'qwen2.5-0.5b-q4_k_m.gguf';
const LLAMA_PORT = 8080;

let childProcess: ChildProcess | null = null;
let isLoaded = false;

// 找 bin 目录下的 llama-server.exe
function findLlamaServer(): string {
  const candidates = fs.readdirSync(BIN_DIR);
  const match = candidates.find(
    (f) => f.toLowerCase().includes('llama-server') && f.endsWith('.exe')
  );
  if (!match) throw new Error('未找到 llama-server.exe，请先运行 npm run setup');
  return path.join(BIN_DIR, match);
}

// 轮询检查 llama-server 是否已就绪
async function waitForReady(timeoutMs = 120000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${LLAMA_PORT}/health`);
      if (res.ok) { isLoaded = true; console.log('[LLM] llama-server 就绪'); return; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('llama-server 启动超时');
}

export function getGeneratorStatus() {
  return { ready: isLoaded, error: null };
}

// 启动 llama-server 子进程
export async function startGenerator(): Promise<void> {
  if (isLoaded || childProcess) return;

  const serverExe = findLlamaServer();
  const modelPath = path.join(LLM_DIR, MODEL_FILE);
  if (!fs.existsSync(modelPath)) {
    throw new Error('模型文件不存在，请先运行 npm run setup');
  }

  childProcess = spawn(serverExe, [
    '-m', modelPath,
    '--port', String(LLAMA_PORT),
    '--host', '127.0.0.1',
    '-ngl', '0',   // 0 表示纯 CPU，99 表示全部 GPU
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  childProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes('error')) console.error('[LLM]', msg.trim());
  });

  childProcess.on('exit', (code) => {
    console.log(`[LLM] llama-server 退出 (code=${code})`);
    isLoaded = false;
    childProcess = null;
  });

  await waitForReady();
}

// 关闭 llama-server
export function stopGenerator(): void {
  if (childProcess) {
    childProcess.kill('SIGTERM');
    const forceTimeout = setTimeout(() => {
      if (childProcess) { childProcess.kill('SIGKILL'); }
    }, 5000);
    childProcess.on('exit', () => {
      clearTimeout(forceTimeout);
      childProcess = null;
      isLoaded = false;
    });
  }
}

// 流式调用 LLM
export async function generateStream(
  messages: Array<{ role: string; content: string }>,
  opts: { onToken: (t: string) => void; onDone: () => void; onError: (e: Error) => void }
): Promise<void> {
  if (!isLoaded) await startGenerator();

  const response = await fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 512,
      stop: ['<|endoftext|>', '<|im_end|>'],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API 错误: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取 SSE 流');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) opts.onToken(content);
          } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock();
    opts.onDone();
  }
}
```

**设计要点**：LLM 不是作为一个库引入的，而是作为一个**独立进程**管理的。`llama-server.exe` 是一个完整的 HTTP 服务器，暴露了和 OpenAI 兼容的 `/v1/chat/completions` 接口——进程隔离，Node.js 挂了 LLM 不受影响。

> **关于 GGUF**：`qwen2.5-0.5b-q4_k_m.gguf` 是一种模型文件格式。GGUF 文件的前 4 个字节是固定的 `0x47 0x47 0x55 0x46`（ASCII 的 "GGUF"），叫做"魔数"（magic number）。setup 脚本下载完模型后会校验这 4 个字节，确保文件没有损坏——如果网络传输中断导致文件不完整，魔数不对，就能立即发现。

---

## 十、Prompt 模板

`src/prompt.ts` — 把检索到的上下文和用户问题拼成发给 LLM 的最终提示词。

```typescript
export function buildChatMessages(contexts: string[], question: string) {
  return [
    {
      role: 'system',
      content: `你是一个基于文档检索的助手。请仅使用提供的参考资料回答问题。
如果资料不足，请如实说明。不要编造。
回答时使用 Markdown 格式：代码用 \`\`\` 包裹，标题用 ##，列表用 - 或数字。`,
    },
    {
      role: 'user',
      content: `参考资料：
${contexts.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}

问题：${question}`,
    },
  ];
}
```

**设计要点**：system prompt 里的"仅使用提供的参考资料"和"不要编造"是关键约束，能大大减少 LLM 在检索不到信息时胡编乱造。

---

## 十一、API 路由

所有 API 都挂载在 `/api` 路径下。

### 11.1 健康检查 — `src/routes/health.ts`

前端页面通过这个接口知道模型是否加载好了。

```typescript
import { Router } from 'express';
import { getEmbeddingStatus } from '../pipeline/embedder';
import { getGeneratorStatus } from '../pipeline/generator';

const router = Router();

router.get('/health', (_req, res) => {
  const embedding = getEmbeddingStatus();
  const llm = getGeneratorStatus();
  res.json({
    status: llm.ready && embedding.ready ? 'ready'
      : embedding.error || llm.error ? 'error' : 'loading',
    llm: llm.ready,
    embedding: embedding.ready,
    message: llm.error || embedding.error || '正在加载模型...',
  });
});

export default router;
```

### 11.2 文档管理 — `src/routes/documents.ts`

获取文档列表和删除文档。

```typescript
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDocumentStats, deleteDocument } from '../store/vector-db';

const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const router = Router();

router.get('/documents', async (_req, res) => {
  try {
    const docs = await getDocumentStats();
    res.json({ documents: docs });
  } catch (err) {
    res.status(500).json({ error: '获取文档列表失败' });
  }
});

router.delete('/documents/:docId', async (req, res) => {
  try {
    await deleteDocument(req.params.docId);
    // 同时清理磁盘上的原始文件
    const files = await fs.readdir(UPLOAD_DIR);
    for (const file of files) {
      if (file.includes(req.params.docId)) {
        await fs.unlink(path.join(UPLOAD_DIR, file));
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除文档失败' });
  }
});

export default router;
```

### 11.3 文件上传 — `src/routes/upload.ts`

最复杂的路由——接收文件 → 解析 → 切分 → 向量化 → 存入数据库。

```typescript
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { parseDocument, SUPPORTED_EXTENSIONS } from '../pipeline/parser';
import { chunkText } from '../pipeline/chunker';
import { embed } from '../pipeline/embedder';
import { addChunks } from '../store/vector-db';
import type { ChunkRecord, UploadResult } from '../types';

const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// multer 有时把 UTF-8 文件名解析为 Latin-1，需转回来
function fixFilename(raw: string): string {
  try { return Buffer.from(raw, 'latin1').toString('utf8'); } catch { return raw; }
}

const ALLOWED_EXTENSIONS = SUPPORTED_EXTENSIONS.map((e) => e.toLowerCase());

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safeName = fixFilename(file.originalname).replace(/[/\\:*?"<>|]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(fixFilename(file.originalname)).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}`));
    }
  },
});

const router = Router();

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: '请选择要上传的文件' }); return; }

    const originalName = fixFilename(req.file.originalname);
    const ext = path.extname(originalName).toLowerCase();

    // ① 解析文档 → 纯文本
    let text;
    try {
      text = await parseDocument(req.file.path, ext);
    } catch {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: '文档解析失败，请确认文件未被加密或损坏' });
      return;
    }

    if (!text || !text.trim()) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: '无法从文档中提取文本内容（扫描版 PDF 不支持）' });
      return;
    }

    // ② 切分 → 小块
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: '无法从文档中提取文本内容' });
      return;
    }

    // ③ 向量化
    const vectors = await embed(chunks.map((c) => c.text));

    // ④ 建记录 → 写入数据库
    const docId = crypto.randomUUID();
    const now = new Date().toISOString();
    const records: ChunkRecord[] = chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      text: chunk.text,
      vector: vectors[i],
      docId,
      docName: originalName,
      chunkIndex: chunk.index,
      createdAt: now,
    }));

    await addChunks(records);

    const result: UploadResult = { docId, docName: originalName, chunkCount: chunks.length };
    res.json(result);
  } catch (err) {
    console.error('[Upload] 错误:', err);
    res.status(500).json({ error: '文件处理失败' });
  }
});

export default router;
```

**数据流**：文件 ↔ 解析 ↔ 切分 ↔ 向量化 ↔ LanceDB。每一步出问题都会中止并返回具体错误。

### 11.4 聊天 — `src/routes/chat.ts`

接收问题 → 检索 → 拼接 prompt → 流式生成 → 返回回答+来源。

```typescript
import { Router } from 'express';
import { retrieve } from '../pipeline/retriever';
import { generateStream } from '../pipeline/generator';
import { buildChatMessages } from '../prompt';
import { hasDocuments } from '../store/vector-db';
import type { Source } from '../types';

const router = Router();

router.post('/chat', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: '问题不能为空' });
      return;
    }

    if (!(await hasDocuments())) {
      res.status(400).json({ error: '请先上传文档' });
      return;
    }

    // ① 检索相关片段
    const results = await retrieve(question.trim(), 5);
    if (results.length === 0) {
      res.json({ answer: '未找到相关文档段落，请尝试上传更多相关文件或换个问题。', sources: [] });
      return;
    }

    // ② 拼接 prompt
    const contexts = results.map((r) => r.text);
    const messages = buildChatMessages(contexts, question.trim());
    const sources: Source[] = results.map((r) => ({
      docName: r.docName, text: r.text, chunkIndex: r.chunkIndex,
    }));

    // ③ SSE 流式返回
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      await generateStream(messages, {
        onToken(token) { res.write(`data: ${JSON.stringify({ token })}\n\n`); },
        onDone() { res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`); res.end(); },
        onError(err) { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); },
      });
    } catch (genErr) {
      res.write(`data: ${JSON.stringify({ error: 'LLM 生成失败' })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: '处理请求失败' });
    }
  }
});

export default router;
```

**设计要点**：回答采用 **SSE（Server-Sent Events）流式传输**——不是等全部生成完再一起发给前端，而是生成一个字就发一个字。用户看到的是逐字打印的效果，体验和 ChatGPT 一样。

---

## 十二、服务器入口

`src/server.ts` — 把所有模块串起来，启动 HTTP 服务。

```typescript
import express from 'express';
import path from 'path';

// 清除系统代理环境变量（避免 transformers.js 下载时走死代理）
for (const v of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy', 'CDNURL', 'MIRROR']) {
  process.env[v] = '';
}

import healthRouter from './routes/health';
import documentsRouter from './routes/documents';
import uploadRouter from './routes/upload';
import chatRouter from './routes/chat';
import { initEmbedder } from './pipeline/embedder';
import { startGenerator, stopGenerator } from './pipeline/generator';

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/lib', express.static(path.resolve(process.cwd(), 'node_modules/marked/lib')));

app.use('/api', healthRouter);
app.use('/api', documentsRouter);
app.use('/api', uploadRouter);
app.use('/api', chatRouter);

app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

async function main() {
  try { await initEmbedder(); } catch (err) { console.error('Embedding 加载失败:', err); }
  try { await startGenerator(); } catch (err) { console.error('LLM 启动失败:', err); }

  const server = app.listen(PORT, () => {
    console.log(`\n=== RAG 本地 Demo 已启动 ===`);
    console.log(`访问: http://localhost:${PORT}`);
    console.log(`==========================\n`);
  });

  const shutdown = () => {
    console.log('\n[Server] 关闭中...');
    stopGenerator();
    server.close(() => { process.exit(0); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 已被占用。用 set PORT=8080 && npm start 换端口。`);
      process.exit(1);
    }
  });
}

main().catch((err) => { console.error('启动失败:', err); process.exit(1); });
```

**Express.js 工作流回顾**：
1. 先注册中间件（`express.json()` 解析 JSON body、`express.static()` 托管前端文件）
2. 再注册 API 路由（`/api/health`、`/api/documents`、`/api/upload`、`/api/chat`）
3. 最后注册兜底路由（所有非 API 请求返回 `index.html`）
4. `main()` 异步启动——先加载模型，再启动 HTTP 监听

---

## 十三、模型下载脚本

`scripts/setup.ts` — 一键下载 llama.cpp 运行环境和 AI 模型。

```typescript
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';

// 清代理，直连下载
for (const v of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy', 'CDNURL', 'MIRROR']) {
  process.env[v] = '';
}

const MODELS_DIR = path.resolve(process.cwd(), 'models');
const LLM_DIR = path.join(MODELS_DIR, 'llm');
const BIN_DIR = path.resolve(process.cwd(), 'bin');
const HF_HOST = 'https://hf-mirror.com';

// llama.cpp 发布版本
const LLAMA_TAG = 'b9263';
const LLAMA_URL = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/llama-${LLAMA_TAG}-bin-win-cpu-x64.zip`;

// LLM 模型
const MODEL_URL = `${HF_HOST}/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf`;
const MODEL_FILE = 'qwen2.5-0.5b-q4_k_m.gguf';

// Embedding 模型
const EMBED_DIR = path.join(MODELS_DIR, 'embedding', 'Xenova', 'all-MiniLM-L6-v2');
const EMBED_REPO = 'Xenova/all-MiniLM-L6-v2';
const EMBED_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];

// GGUF 文件魔数校验
const GGUF_MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46]);
function validateGGUF(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.equals(GGUF_MAGIC);
  } catch { return false; }
}

// 下载函数（支持重定向跟随、自动重试）
function download(url: string, dest: string, maxRedirects = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (reqUrl: string, redirectsLeft: number, retriesLeft = 3) => {
      const file = fs.createWriteStream(dest);
      const transport = reqUrl.startsWith('https') ? https : http;

      const req = transport.get(reqUrl, {
        headers: { 'User-Agent': 'rag-demo-setup' },
        agent: false,
      }, (res) => {
        // 处理重定向
        if ([301, 302, 307, 308].includes(res.statusCode || 0)) {
          if (redirectsLeft <= 0) { file.close(); reject(new Error('重定向过多')); return; }
          let loc = res.headers.location || '';
          if (!loc.startsWith('http')) loc = new URL(reqUrl).origin + loc;
          file.close();
          res.resume();
          doRequest(loc, redirectsLeft - 1, retriesLeft);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) { file.close(); reject(new Error(`HTTP ${res.statusCode}`)); return; }

        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (err) => { file.close(); reject(err); });
      });

      req.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        // 连接超时自动重试（换 CDN 节点）
        if (retriesLeft > 0 && (err as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
          console.log(`  超时重试... (${retriesLeft})`);
          setTimeout(() => doRequest(reqUrl, redirectsLeft, retriesLeft - 1), 2000);
          return;
        }
        reject(err);
      });
      req.setTimeout(300_000, () => { req.destroy(); file.close(); reject(new Error('下载超时')); });
    };
    doRequest(url, maxRedirects);
  });
}

function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

async function main() {
  console.log('=== 下载运行环境与模型 ===\n');
  ensureDir(MODELS_DIR);
  ensureDir(LLM_DIR);
  ensureDir(BIN_DIR);

  // 1. 下载 llama-server
  const zipPath = path.join(BIN_DIR, `llama.zip`);
  const serverExe = path.join(BIN_DIR, 'llama-server.exe');
  if (!fs.existsSync(serverExe)) {
    console.log('[1/3] 下载 llama.cpp...');
    await download(LLAMA_URL, zipPath);
    console.log('  解压中...');
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`, { stdio: 'inherit' });
    fs.unlinkSync(zipPath);
  } else { console.log('[1/3] llama-server 已存在，跳过'); }

  // 2. 下载 LLM 模型
  console.log('[2/3] 下载 LLM 模型 (~400MB)...');
  const modelPath = path.join(LLM_DIR, MODEL_FILE);
  if (fs.existsSync(modelPath) && validateGGUF(modelPath)) {
    console.log('  已存在且校验通过，跳过');
  } else {
    if (fs.existsSync(modelPath)) { fs.unlinkSync(modelPath); console.log('  旧文件损坏，重新下载'); }
    await download(MODEL_URL, modelPath);
    if (!validateGGUF(modelPath)) { console.error('校验失败！删除文件后重试'); process.exit(1); }
    console.log('  GGUF 校验通过');
  }

  // 3. 下载 Embedding 模型
  console.log('[3/3] 下载 Embedding 模型 (~80MB)...');
  ensureDir(path.join(EMBED_DIR, 'onnx'));
  for (const file of EMBED_FILES) {
    const dest = path.join(EMBED_DIR, file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { console.log(`  ${file} 已存在`); continue; }
    await download(`${HF_HOST}/${EMBED_REPO}/resolve/main/${file}`, dest);
  }

  console.log('\n=== 全部就绪！运行 npm start ===');
}

main().catch((err) => { console.error('失败:', err.message); process.exit(1); });
```

---

## 十四、前端界面

前端用纯 HTML + CSS + JS（ES Modules），零构建工具、零框架依赖。

### 14.1 页面结构 — `public/index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RAG 本地文档问答</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div id="app">
  <header id="header">
    <h1>RAG 本地文档问答</h1>
    <div id="status-bar">
      <span id="status-indicator" class="status-loading"></span>
      <span id="status-text">正在加载模型...</span>
    </div>
  </header>

  <main id="main">
    <aside id="sidebar">
      <div id="upload-area">
        <label for="file-input" id="upload-btn">上传文档</label>
        <input type="file" id="file-input" accept=".pdf,.docx,.md,.txt" hidden>
        <p id="upload-hint">支持 PDF、Word、Markdown、TXT</p>
        <div id="upload-progress" class="hidden">
          <div class="progress-bar"><div id="progress-fill"></div></div>
          <span id="progress-text"></span>
        </div>
        <div id="upload-spinner" class="spinner hidden"></div>
      </div>
      <div id="doc-list">
        <h3>已上传文档</h3>
        <ul id="documents"></ul>
        <p id="no-docs">暂无文档，请先上传</p>
      </div>
    </aside>

    <section id="chat-area">
      <div id="chat-messages"></div>
      <div id="chat-empty"><p>上传文档后，在此提问</p></div>
      <div id="chat-input-area">
        <textarea id="chat-input" placeholder="输入问题..." rows="2" disabled></textarea>
        <button id="send-btn" disabled>发送</button>
      </div>
    </section>
  </main>
</div>
<div id="toast" class="hidden"></div>
<script type="module" src="/ui.js"></script>
<script type="module" src="/upload.js"></script>
<script type="module" src="/chat.js"></script>
</body>
</html>
```

### 14.2 样式 — `public/style.css`

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #f8f9fa; --surface: #fff; --border: #e0e0e0;
  --text: #1a1a1a; --text-secondary: #666;
  --primary: #2563eb; --primary-hover: #1d4ed8;
  --success: #16a34a; --error: #dc2626; --radius: 8px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text); height: 100vh; overflow: hidden;
}

#app { display: flex; flex-direction: column; height: 100vh; }

#header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 24px; background: var(--surface); border-bottom: 1px solid var(--border);
}
#header h1 { font-size: 1.2rem; font-weight: 600; }
#status-bar { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-secondary); }
#status-indicator { width: 10px; height: 10px; border-radius: 50%; }
.status-loading { background: #f59e0b; animation: pulse 1s infinite; }
.status-ready { background: var(--success); }
.status-error { background: var(--error); }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

#main { display: flex; flex: 1; overflow: hidden; }

#sidebar {
  width: 280px; background: var(--surface); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 16px; gap: 16px; overflow-y: auto;
}

#upload-btn {
  display: block; width: 100%; padding: 12px;
  background: var(--primary); color: #fff; border-radius: var(--radius);
  cursor: pointer; font-size: 0.9rem; font-weight: 500; text-align: center;
}
#upload-btn:hover { background: var(--primary-hover); }
#upload-hint { font-size: 0.75rem; color: var(--text-secondary); margin-top: 8px; }

#upload-progress { margin-top: 12px; }
.progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
#progress-fill { height: 100%; width: 0; background: var(--primary); transition: width 0.2s; }
#progress-text { font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; display: block; }
.spinner { width: 24px; height: 24px; border: 3px solid var(--border); border-top: 3px solid var(--primary); border-radius: 50%; animation: spin 0.6s linear infinite; margin: 12px auto; }
@keyframes spin { to { transform: rotate(360deg); } }

.hidden { display: none !important; }

#chat-area { flex: 1; display: flex; flex-direction: column; background: var(--bg); }
#chat-messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
#chat-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }

.message { max-width: 80%; padding: 12px 16px; border-radius: var(--radius); line-height: 1.6; font-size: 0.9rem; word-break: break-word; }
.message.user { align-self: flex-end; background: var(--primary); color: #fff; }
.message.assistant { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); }
.message .sources { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 0.8rem; }
.message .sources summary { cursor: pointer; color: var(--primary); font-weight: 500; }
.message .source-item { padding: 8px; margin: 4px 0; background: var(--bg); border-radius: 4px; border-left: 3px solid var(--primary); }
.typing-cursor::after { content: '|'; animation: blink 0.8s infinite; color: var(--primary); }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

#chat-input-area { display: flex; gap: 12px; padding: 16px 24px; background: var(--surface); border-top: 1px solid var(--border); }
#chat-input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius); resize: none; font: inherit; font-size: 0.9rem; }
#send-btn { padding: 0 24px; background: var(--primary); color: #fff; border: none; border-radius: var(--radius); cursor: pointer; }
#send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

#toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 10px 24px; border-radius: var(--radius); background: #333; color: #fff; font-size: 0.85rem; z-index: 1000; }
#toast.error { background: var(--error); }

/* Markdown 渲染 */
.message.assistant h2,.message.assistant h3 { margin: 12px 0 6px; font-size: 1em; }
.message.assistant p { margin: 4px 0; }
.message.assistant ul,.message.assistant ol { margin: 4px 0; padding-left: 20px; }
.message.assistant code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.85em; font-family: "Cascadia Code",Consolas,monospace; }
.message.assistant pre { background: #1e1e1e; color: #d4d4d4; padding: 12px 16px; border-radius: 6px; overflow-x: auto; margin: 8px 0; font-size: 0.85em; line-height: 1.5; }
.message.assistant pre code { background: none; padding: 0; color: inherit; }
.message.assistant blockquote { border-left: 3px solid var(--primary); padding-left: 12px; margin: 8px 0; color: var(--text-secondary); }
```

### 14.3 UI 逻辑 — `public/ui.js`

管理所有 DOM 操作：消息渲染、文档列表更新、状态管理。

```javascript
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const chatEmpty = document.getElementById('chat-empty');
const documentsList = document.getElementById('documents');
const noDocs = document.getElementById('no-docs');
const uploadSpinner = document.getElementById('upload-spinner');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const fileInput = document.getElementById('file-input');
const toast = document.getElementById('toast');

export function setStatus(ready, message) {
  statusIndicator.className = ready ? 'status-ready' : 'status-loading';
  statusText.textContent = message;
}

export function setChatEnabled(enabled) {
  chatInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  if (enabled) chatInput.placeholder = '输入问题...';
}

export function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.className = isError ? 'error' : '';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

export function addUserMessage(text) {
  chatEmpty.classList.add('hidden');
  const el = document.createElement('div');
  el.className = 'message user';
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function createAssistantMessage() {
  chatEmpty.classList.add('hidden');
  const el = document.createElement('div');
  el.className = 'message assistant typing-cursor';
  chatMessages.appendChild(el);
  return el;
}

export function finalizeAssistantMessage(el, sources) {
  el.classList.remove('typing-cursor');
  if (sources.length > 0) {
    const details = document.createElement('details');
    details.innerHTML = `<summary>引用来源 (${sources.length})</summary>`;
    for (const s of sources) {
      details.innerHTML += `<div class="source-item">
        <div class="source-name">${escapeHtml(s.docName)} · 段落 ${s.chunkIndex + 1}</div>
        <div class="source-text">${escapeHtml(s.text.slice(0, 300))}${s.text.length > 300 ? '...' : ''}</div>
      </div>`;
    }
    const srcDiv = document.createElement('div');
    srcDiv.className = 'sources';
    srcDiv.appendChild(details);
    el.appendChild(srcDiv);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

let onDeleteDoc = null;
export function setOnDeleteDoc(fn) { onDeleteDoc = fn; }

export function updateDocuments(docs) {
  documentsList.innerHTML = '';
  if (docs.length === 0) { noDocs.classList.remove('hidden'); setChatEnabled(false); return; }
  noDocs.classList.add('hidden');
  setChatEnabled(true);
  for (const doc of docs) {
    const li = document.createElement('li');
    li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)';
    const name = document.createElement('span');
    name.textContent = `${doc.docName} (${doc.chunkCount} 片段)`;
    name.style.flex = '1';
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.style.cssText = 'margin-left:8px;width:22px;height:22px;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:14px';
    delBtn.title = '删除';
    delBtn.addEventListener('click', () => {
      if (confirm(`确定删除 ${doc.docName}？`)) onDeleteDoc?.(doc.docId);
    });
    li.appendChild(name);
    li.appendChild(delBtn);
    documentsList.appendChild(li);
  }
}

export function setUploadProgress(pct, text) {
  uploadProgress.classList.remove('hidden');
  progressFill.style.width = pct + '%';
  progressText.textContent = text;
}
export function hideUploadProgress() { uploadProgress.classList.add('hidden'); }
export function setUploadSpinner(show) { uploadSpinner.classList.toggle('hidden', !show); }

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export { chatInput, sendBtn, fileInput };
```

### 14.4 上传模块 — `public/upload.js`

```javascript
import {
  fileInput, showToast, setUploadProgress, hideUploadProgress,
  setUploadSpinner, updateDocuments, setOnDeleteDoc,
} from './ui.js';

// 轮询服务健康状态
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const { setStatus } = await import('./ui.js');
    if (data.status === 'ready') { setStatus(true, '模型就绪'); fetchDocuments(); }
    else if (data.status === 'error') { setStatus(false, `错误: ${data.message}`); }
    else { setStatus(false, data.message || '加载中...'); }
  } catch {}
}

let healthInterval;
export function startHealthCheck() {
  checkHealth();
  healthInterval = setInterval(checkHealth, 3000);
}

async function fetchDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    updateDocuments(data.documents || []);
  } catch {}
}

// 文件上传
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) uploadFile(file);
});

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  setUploadSpinner(true);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100), `上传中 ${Math.round(e.loaded / e.total * 100)}%`);
  });
  xhr.addEventListener('load', () => {
    setUploadSpinner(false); hideUploadProgress();
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      showToast(`已添加: ${data.docName} (${data.chunkCount} 片段)`);
      fetchDocuments();
    } else {
      try { showToast(JSON.parse(xhr.responseText).error || '上传失败', true); } catch { showToast('上传失败', true); }
    }
  });
  xhr.addEventListener('error', () => { setUploadSpinner(false); hideUploadProgress(); showToast('上传失败', true); });
  xhr.send(formData);
  fileInput.value = '';
}

// 删除文档
async function deleteDocument(docId) {
  try {
    const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    if (res.ok) { showToast('已删除'); fetchDocuments(); }
    else { const err = await res.json(); showToast(err.error || '删除失败', true); }
  } catch { showToast('删除失败', true); }
}

setOnDeleteDoc(deleteDocument);
startHealthCheck();
```

### 14.5 聊天模块 — `public/chat.js`

```javascript
import { marked } from '/lib/marked.esm.js';
import {
  chatInput, sendBtn, addUserMessage, createAssistantMessage,
  finalizeAssistantMessage, showToast,
} from './ui.js';

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || sendBtn.disabled) return;

  chatInput.value = '';
  sendBtn.disabled = true;
  addUserMessage(question);

  const assistantEl = createAssistantMessage();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      const err = await response.json();
      assistantEl.textContent = err.error || '请求失败';
      assistantEl.classList.remove('typing-cursor');
      showToast(err.error || '请求失败', true);
      sendBtn.disabled = false;
      return;
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      assistantEl.innerHTML = marked.parse(data.answer);
      finalizeAssistantMessage(assistantEl, data.sources || []);
      sendBtn.disabled = false;
      return;
    }

    // SSE 流式
    const reader = response.body?.getReader();
    if (!reader) { assistantEl.textContent = '无法读取响应'; assistantEl.classList.remove('typing-cursor'); sendBtn.disabled = false; return; }

    const decoder = new TextDecoder();
    let buffer = '', answerText = '', sources = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { assistantEl.textContent = answerText || data.error; assistantEl.classList.remove('typing-cursor'); showToast(data.error, true); sendBtn.disabled = false; return; }
            if (data.token) { answerText += data.token; assistantEl.textContent = answerText; }
            if (data.done) { sources = data.sources || []; }
          } catch {}
        }
      }
      assistantEl.innerHTML = marked.parse(answerText);
      finalizeAssistantMessage(assistantEl, sources);
    } finally { reader.releaseLock(); }
  } catch {
    assistantEl.textContent = '连接中断，请重试';
    assistantEl.classList.remove('typing-cursor');
    showToast('连接中断', true);
  }
  sendBtn.disabled = false;
}
```

---

## 十五、启动测试

所有文件都写好了。现在运行：

```bash
# 1. 安装依赖
npm install --ignore-scripts
npm rebuild sharp onnxruntime-node     # sharp 是 transformers 的间接依赖，见第二节说明

# 2. 下载模型（首次需联网，~480MB）
npm run setup

# 3. 启动
npm start
```

打开浏览器，输入 **http://localhost:3000**。你会看到：

1. 顶部状态栏：「模型就绪」（绿色圆点）
2. 左侧有上传按钮和文档列表
3. 右侧有聊天输入框

### 试试效果

- **上传一个文档**：点击「上传文档」，选一个 PDF/Word/MD/TXT 文件。看到 "已添加: xxx (N 片段)" 表示成功
- **问一个问题**：在输入框输入问题，按 Enter。AI 会逐字输出回答
- **查看来源**：回答下方展开「引用来源」，可以看到 AI 引用了哪些文档段落
- **跨文件提问**：上传第二个文档，再问一个涉及两个文档的问题
- **删除文档**：点击文档名右侧的 ×

### 预期看到的启动日志

当一切正常时，`npm start` 的输出应该是：

```
[Server] 加载 Embedding 模型...
[Embedding] 模型加载完成 (本地): Xenova/all-MiniLM-L6-v2
[LLM] 启动 llama-server...
[LLM] llama-server 就绪
=== RAG 本地 Demo 已启动 ===
访问: http://localhost:3000
==========================
```

### 常见启动问题

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| `Cannot find module sharp` | sharp 原生模块没构建 | `npm rebuild sharp onnxruntime-node` |
| `[Embedding] 加载失败` | 模型文件路径不对或缺失 | 确认 `models/embedding/Xenova/all-MiniLM-L6-v2/` 下有 4 个文件 |
| `gguf_init_from_file_ptr: failed to read magic` | 模型文件损坏（0 字节） | 删除 `models/llm/*.gguf`，重新 `npm run setup` |
| `端口 3000 已被占用` | 3000 端口有别的程序在用 | `set PORT=8080 && npm start` |
| `ECONNREFUSED 127.0.0.1:443` | 系统代理干扰了网络请求 | 已通过 `process.env` 置空处理，重启即可 |
| 上传后"无法提取文本内容" | PDF 是扫描版（图片） | 换用可选择文字的 PDF |

---

## 十六、进阶：从 Demo 到生产级 RAG 系统

你已经亲手搭了一个能跑的 RAG。但下面这个问题值得思考：

> 如果要把这个 Demo 变成公司内部 100 人每天使用的知识库系统，哪些地方要改？

本章从**技术选型**的角度，逐层对比 Demo 方案和生产方案的差异，并给出推荐架构。

---

### 16.1 升级路线总览

```
Demo 方案                              生产方案
───────                               ──────
all-MiniLM-L6-v2 (80MB, 384维)  →   BGE-large-zh-v1.5 (1.3GB, 1024维)
LanceDB 嵌入式                     →   Milvus / Qdrant 分布式向量库
Qwen2.5-0.5B (本地 CPU)           →   Qwen2.5-14B / DeepSeek-V3 (GPU 集群)
递归字符切分                       →   语义切分 + 父子文档索引
无重排序                           →   BGE-Reranker-v2-m3 精排
单进程（Express + 全部模块）        →   微服务 + 消息队列 + 对象存储
```

核心矛盾：**检索质量、吞吐量、可维护性 三者不可兼得，Demo 优化了"简单"，生产要优化另外两个。**

---

### 16.2 Embedding 模型选型

这是 RAG 系统**最重要的决策**——检索质量的上限由 embedding 模型决定。

| 模型 | 维度 | 大小 | 中文效果 | 适用场景 |
|------|------|------|---------|---------|
| all-MiniLM-L6-v2 | 384 | 80MB | 一般 | Demo、英文为主的小项目 |
| BGE-large-zh-v1.5 | 1024 | 1.3GB | **优秀** | 中文知识库首选 |
| text2vec-large-chinese | 1024 | 1.2GB | 优秀 | 中文语义相似度任务 |
| multilingual-e5-large | 1024 | 2.2GB | 优秀 | 多语言混合场景 |
| BGE-M3 | 1024 | 2.2GB | 优秀 | 多语言 + 支持稀疏+稠密混合检索 |

**选型原则：**
- **维度越高，信息量越大**——1024 维比 384 维多存了近 3 倍的语义信息，但检索稍慢、存储稍大
- **中文场景优先选 BGE 系列**——BAAI（智源研究院）在中文 embedding 上投入了大量训练资源
- **不要频繁换模型**——每次换 embedding 模型都需要**全量重新入库**（存量向量的维度/语义空间不同）

> 一个常见误区：以为 embedding 模型越大越好。实际上 1024 维的 BGE-large 在很多中文检索任务上已经接近更大模型的水平，再往上边际收益递减。**生产环境优先保证稳定性，其次才是追新模型。**

---

### 16.3 向量数据库选型

向量库是 RAG 的"搜索引擎"。Demo 用 LanceDB（嵌入式，单文件），到生产环境需要考量以下维度：

| | LanceDB | Milvus | Qdrant | Weaviate | Elasticsearch |
|---|---|---|---|---|---|
| 部署方式 | 嵌入式 | 分布式集群 | 单机/集群 | 单机/集群 | 分布式集群 |
| 向量检索 | ✅ | ✅ | ✅ | ✅ | ✅ (8.x+) |
| 标量过滤 | 基础 | 强大 | 强大 | 强大 | 极强 |
| 混合检索 | ❌ | ✅ 稠密+稀疏 | ❌ | ✅ BM25+向量 | ✅ |
| 多租户 | ❌ | ✅ Partition Key | ✅ | ✅ | ✅ |
| 运维复杂度 | 零 | 高 | 中 | 中 | 高 |
| 适用规模 | < 10 万条 | 亿级 | 百万~千万级 | 百万~亿级 | 亿级 |

**选型决策树：**

```
你的场景是？
├── 个人项目 / PoC → LanceDB（零运维，五分钟上线）
├── 团队内部知识库（<100人，文档量可控）
│   └── Qdrant（单机部署，Rust 实现，内存效率高）
├── 企业级知识中台（多部门，海量文档，高并发）
│   └── Milvus（分布式架构，GPU 加速索引构建，云原生）
└── 已有 Elasticsearch 基础设施
    └── ES 8.x+ 直接加向量（不用引入新组件）
```

**关键决策点：**
- **混合检索（Hybrid Search）** ：纯向量检索有时会漏掉精确关键词匹配。比如搜"2025 年财报"，向量更关注语义（"年度财务报告"），但用户可能想要包含"2025"这个精确数字的段落。Milvus 和 Weaviate 支持稠密（dense）+ 稀疏（sparse）混合检索，能同时覆盖语义和关键词。
- **多租户**：如果知识库要服务多个部门且数据隔离，必须选支持 Partition Key 的库（Milvus、Qdrant），否则需要为每个租户建独立表，查询管理复杂。
- **标量过滤**：生产环境常见的需求——"只搜最近 30 天的合同"、"只搜技术部的文档"。向量库需要在向量检索前先按元数据筛选，差的标量过滤实现会导致全表扫描。

---

### 16.4 LLM 选型

Demo 用 Qwen2.5-0.5B（0.5B 参数），它能跑，但回答质量有限。生产级 RAG 对 LLM 的要求不同：

| 要求 | 原因 |
|------|------|
| **指令遵循能力** | RAG 输出必须严格基于 context，不能编造——小模型在这方面表现差 |
| **上下文窗口** | 检索到的 chunk 越多，需要越大的上下文窗口来容纳 |
| **推理速度** | 生产环境有并发用户，需要合理的 token 生成速度 |
| **中文能力** | 如果是中文知识库，要求模型中文预训练充分 |

**选型对比：**

| 模型 | 参数量 | 所需显存 | RAG 适用性 | 部署方式 |
|------|--------|---------|-----------|---------|
| Qwen2.5-0.5B | 0.5B | CPU | ❌ Demo 用 | llama.cpp CPU |
| Qwen2.5-7B-Instruct | 7B | ~16GB | ✅ 适合 | vLLM / Ollama |
| Qwen2.5-14B-Instruct | 14B | ~32GB | ✅ 更佳 | vLLM / TGI |
| Qwen2.5-72B-Instruct | 72B | ~160GB | ✅ 最佳 | vLLM (多卡) |
| DeepSeek-V3 | 671B MoE | ~40GB (激活) | ✅ 极佳 | SGLang / vLLM |
| GPT-4o / Claude (API) | — | 0 (云端) | ✅ | HTTP API |

**部署框架选型：**

| 框架 | 适用场景 | 优势 |
|------|---------|------|
| Ollama | 单机、开发测试 | 一行命令启动，自动下载模型 |
| vLLM | 生产环境 | PagedAttention 显存管理、连续批处理、高吞吐 |
| llama.cpp | CPU / 边缘设备 | 无需 GPU，量化支持最好 |
| SGLang | 高并发 | RadixAttention，比 vLLM 快 30%+（某些场景） |

**推荐路线：** 7B 模型 + vLLM 部署，是生产环境 RAG 场景的"甜蜜点"——指令遵循能力够用、单卡可跑、推理速度可接受。

---

### 16.5 文档解析

Demo 的 `pdf-parse` 只能处理简单 PDF（单栏、纯文字）。真实世界的 PDF 远比这复杂：

| 真实场景 | Demo 能处理？ | 生产方案 |
|---------|-------------|---------|
| 双栏论文 | ❌ 读取顺序混乱 | Unstructured.io 的 `detect_document_type` |
| 含表格的 PDF | ❌ 表格变乱码 | LlamaParse / MinerU ——识别表格结构 |
| 扫描件 | ❌ 直接报错 | OCR（PaddleOCR / Tesseract）→ 转文字 |
| PPT/Excel | ❌ 不支持 | Unstructured（支持 20+ 格式） |
| 图片里的文字 | ❌ 不支持 | 多模态模型（GPT-4V / Qwen-VL）提取 |

**生产环境推荐的文档处理流水线：**

```
原始文件 → 格式检测 → 根据类型分流：
  ├── 可提取文字 PDF → Unstructured / MinerU（保留段落、表格、标题结构）
  ├── 扫描件 / 图片   → OCR (PaddleOCR) → 文字提取
  ├── Office 文档     → Unstructured / python-docx
  └── 网页           → trafilatura（提取正文，去掉导航栏/广告）
→ 统一输出 Markdown 格式（保留标题层级、表格、列表）→ 进入切分流程
```

重要原则：**文档解析的输出尽可能保留结构化信息（Markdown 格式），而不是压平成纯文本。** 标题层级（`#`、`##`）能帮助分块器在自然边界切分；表格保留结构能让 LLM 正确理解数据。

---

### 16.6 检索策略升级

Demo 用了最简单的检索方式：向量相似度 Top-5 + 固定阈值。生产环境通常会叠加多个策略：

**① 混合检索（Hybrid Search）**

```
向量检索（语义相似）          关键词检索（BM25 / TF-IDF）
       │                              │
       └──────────┬───────────────────┘
                  ▼
          结果融合（RRF / 加权求和）
                  │
                  ▼
            最终候选列表
```

BM25 擅长匹配专有名词、编号、日期；向量检索擅长匹配同义表达。两者互补。

**② 重排序（Reranking）**

```
向量检索召回 Top-20 → Cross-Encoder Reranker 精排 → 取 Top-5
```

向量模型是"双塔"架构（query 和 doc 分开编码），速度快但精度有限。Cross-Encoder（如 BGE-Reranker-v2-m3）把 query 和 doc 拼在一起打分，精度高但慢——所以只在 Top-K 候选上做重排。

> 一个直观的类比：向量检索像"海选"（快速筛出 20 个候选人），Reranker 像"面试"（对每人仔细评估）。

**③ 多路召回（Multi-Path Retrieval）**

```
用户问题 → 同时走三条路：
  ├── 稠密向量检索（语义匹配）
  ├── 稀疏向量/BM25（关键词匹配）
  └── 问题改写后的二次检索（换个问法再搜一次）
→ 合并去重 → Reranker 精排 → 最终结果
```

**④ 小→大文档索引（Small-to-Big Retrieval）**

一个常见困境：chunk 太小（丢了上下文），chunk 太大（检索不精准）。

解决思路：**用小块做检索，用大块喂 LLM。**

```
索引时：
  文档 → 切成小 chunk (200 token) → embedding → 存入向量库
            ↓
        同时也存"父文档"引用（该小 chunk 所在的原始段落/章节）

检索时：
  用小 chunk 向量匹配 → 找到相关小块
    → 取对应的大块（完整的段落，500-1000 token）→ 喂给 LLM
```

这样既保证了检索颗粒度，又保证了 LLM 看到足够的上下文。

---

### 16.7 生产级架构图

综合以上选型，一个**企业级 RAG 知识库系统**的推荐架构：

```
                        ┌──────────────┐
                        │   用户/前端   │
                        └──────┬───────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │   API Gateway    │  ← 鉴权、限流、路由
                    │  (Kong / Nginx)  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  上传服务   │  │  检索服务   │  │   LLM 服务  │
     │            │  │            │  │            │
     │ 文件→解析   │  │ query→向量  │  │ Prompt→生成 │
     │ →切分→入库  │  │ →检索→重排  │  │ →流式返回   │
     └─────┬──────┘  └─────┬──────┘  └──────┬─────┘
           │               │                │
           ▼               ▼                │
    ┌──────────┐   ┌──────────────┐         │
    │ 对象存储  │   │  向量数据库   │         │
    │  (MinIO) │   │ (Milvus 集群) │         │
    └──────────┘   └──────────────┘         │
           │               │                │
           └───────┬───────┘                │
                   │                        │
                   ▼                        ▼
          ┌────────────────┐      ┌─────────────────┐
          │   消息队列      │      │  模型推理集群    │
          │ (Redis / Kafka) │      │ vLLM + 7B 模型  │
          └────────────────┘      │ (GPU: A10 x2)   │
                                  └─────────────────┘
```

**各组件职责：**

| 组件 | 职责 | 为什么需要 |
|------|------|-----------|
| API Gateway | 统一入口、身份认证、速率限制 | 多服务需要统一的流量控制层 |
| 上传服务 | 文档接收→解析→切分→向量化→入库 | 这是一个重 CPU 操作，需独立扩缩 |
| 检索服务 | query embedding→向量搜索→重排 | 无状态，最容易水平扩展 |
| LLM 服务 | Prompt 组装→调用推理引擎→流式返回 | 与 GPU 资源强绑定，独立部署便于管理 |
| 对象存储 (MinIO) | 原始文档持久化 | 上传服务挂了文档不丢 |
| 消息队列 | 异步处理大文档入库 | 100 页 PDF 的解析+向量化可能耗时 2 分钟，不能让用户干等 |
| 模型推理集群 | GPU 上的 LLM 推理 | 与业务服务解耦，可独立升级模型 |

**这条流水线的实际运转流程：**

1. 用户上传一份 50 页的 PDF → API Gateway 鉴权 → 转发到上传服务
2. 上传服务把原始文件存到 MinIO，发一条消息到 Redis："有新文档，ID=xxx，路径=xxx"
3. Worker 消费消息 → 读文件 → 解析 → 切分 → 向量化 → 批量写入 Milvus
4. 处理完成后标记文档为"可检索"
5. 用户提问 → 检索服务 embedding → Milvus 搜索 + Reranker 精排 → Prompt 拼接
6. Prompt → LLM 服务 → vLLM 推理 → 流式 SSE → 用户看到逐字输出

---

### 16.8 生产环境额外考量

**评估体系：**

Demo 靠"感觉"判断好不好，生产环境需要量化指标：

| 指标 | 衡量什么 | 计算方式 |
|------|---------|---------|
| Hit Rate | 检索到的 chunk 里有没有正确答案 | 正确的检索次数 / 总查询次数 |
| MRR (Mean Reciprocal Rank) | 正确答案排在第几位 | 排名倒数 1/rank 的均值 |
| NDCG@10 | 前 10 个结果的排序质量 | 归一化折损累计增益 |
| 答案准确率 | LLM 回答是否正确 | 需要人工标注或用 LLM-as-Judge |
| 幻觉率 | LLM 是否编造了文档中没有的信息 | 答案中断言不在 source 中的比例 |
| 首字延迟 | 用户感知的响应速度 | 请求发出 → 第一个 token 返回的时间 |
| 吞吐量 | 系统能同时处理多少请求 | 并发下的 QPS + P99 延迟 |

**RAG 评估数据集构建：**

```
准备 100 个真实用户问题 → 人工标注每个问题的"正确答案所在段落"
  → 跑一遍检索 → 看标注的段落是否在 Top-K 里 → 计算 Hit Rate 和 MRR
```

**安全与合规：**

- **文档权限**：不同部门的知识库要隔离（向量库多租户 + API 层权限校验）
- **敏感信息**：上传的文档可能含身份证号、手机号 → 入库前自动脱敏
- **审计日志**：谁在什么时间问了什么问题、看了哪些文档 → 需完整记录
- **内容安全**：用户输入和 LLM 输出都需要过内容审核（涉政、涉黄检测）

**监控与运维：**

```
核心监控看板：
├── 检索服务：QPS、P99 延迟、Hit Rate 趋势（每周计算）
├── LLM 服务：首 Token 延迟、tokens/s 吞吐、GPU 利用率、队列长度
├── 上传服务：处理成功率、平均单文档处理时长、失败重试次数
└── 基础设施：Milvus 内存/磁盘、MinIO 存储增长趋势、消息队列积压
```

> 一个经验法则：**RAG 系统出问题，70% 是检索环节，20% 是文档解析，10% 是 LLM 生成。** 排查问题时从检索开始（检索结果是否相关？），再看文档解析（原文是否完整提取？），最后看 LLM（prompt 是否正确？）。

---

## 回顾：你刚刚写了什么

```
rag-demo/
├── package.json              ← 项目身份证
├── tsconfig.json             ← TypeScript 配置
├── scripts/setup.ts          ← 一键下载脚本（150 行）
├── src/
│   ├── server.ts             ← 服务器，把所有模块串起来（80 行）
│   ├── prompt.ts             ← AI 提示词模板（25 行）
│   ├── types.ts              ← 类型定义（50 行）
│   ├── routes/
│   │   ├── health.ts         ← 健康检查 API（20 行）
│   │   ├── documents.ts      ← 文档列表+删除 API（45 行）
│   │   ├── upload.ts         ← 上传→解析→入库 API（120 行）
│   │   └── chat.ts           ← 检索→LLM 流式回答 API（90 行）
│   ├── pipeline/
│   │   ├── parser.ts         ← 四种格式解析器（55 行）
│   │   ├── chunker.ts        ← 递归文本切分（85 行）
│   │   ├── embedder.ts       ← 文字→384 维向量（60 行）
│   │   ├── retriever.ts      ← 向量检索+阈值过滤（30 行）
│   │   └── generator.ts      ← LLM 进程管理+流式调用（170 行）
│   └── store/
│       └── vector-db.ts      ← LanceDB 增删查（95 行）
└── public/
    ├── index.html            ← 页面结构
    ├── style.css             ← 样式（含代码块渲染）
    ├── ui.js                 ← 聊天 UI 逻辑（120 行）
    ├── upload.js             ← 文件上传模块（95 行）
    └── chat.js               ← SSE 流式对话（90 行）
```

**整个 RAG 系统，从文档解析到向量检索到 AI 生成，加上前端聊天界面，总共 ~1500 行代码。** 每一行你都知道它在做什么。想加功能？知道在哪加。出问题了？知道往哪找。

这就是"从零搭建"的意义。复制粘贴是别人的，亲手敲过才是自己的。
