# 手把手教你从零写一个本地 RAG

> 本教程会带你从空文件夹开始，亲手写出一个能跑的本地 RAG 文档问答系统。
> 每行代码都会解释为什么这样写。读完你不仅会用，还会懂原理。

---

## 目录

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

---

## 一、准备环境

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

### 2.4 安装依赖

```bash
npm install --ignore-scripts
npm rebuild sharp onnxruntime-node
```

> **为什么分两步**：`sharp` 包安装时需要从 GitHub 下载文件，网络可能超时。`--ignore-scripts` 先跳过所有原生编译，再用 `rebuild` 单独处理。

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
    setTimeout(() => { if (childProcess) childProcess.kill('SIGKILL'); }, 5000);
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

**设计要点**：LLM 不是作为一个库引入的，而是作为一个**独立进程**管理的。`llama-server.exe` 是一个完整的 HTTP 服务器，暴露了和 OpenAI 兼容的 `/v1/chat/completions` 接口。这样做的好处是进程隔离——Node.js 挂了 LLM 不受影响，反之亦然。

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
for (const v of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy']) {
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
for (const v of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy']) {
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
npm rebuild sharp onnxruntime-node

# 2. 下载模型（首次需联网，~480MB）
npm run setup

# 3. 启动
npm start
```

打开浏览器，访问 **http://localhost:3000**。

上传一个文档，问它一个问题。你会看到 AI 逐字输出回答，答完还能展开引用来源，看到它具体引用了哪些段落。

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
