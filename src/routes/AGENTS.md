<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-25 -->

# routes

## Purpose
Express API 路由——每个文件导出一个 `Router`，在 `server.ts` 中挂载到 `/api` 路径前缀下。

## Key Files
| File | Description |
|------|-------------|
| `health.ts` | `GET /api/health` — 返回 LLM 和 Embedding 的就绪状态（loading/ready/error） |
| `upload.ts` | `POST /api/upload` — multipart 上传 → 解析 → 切分 → 向量化 → 存储。50MB 限制，`.pdf/.docx/.md/.txt` |
| `documents.ts` | `GET /api/documents` 列表 + `DELETE /api/documents/:docId` 删除（同时清理 LanceDB 和上传文件） |
| `chat.ts` | `POST /api/chat` — SSE 流式问答。检索 Top-5 → 组装 Prompt → 调用 `generateStream` → `data: {token}` 逐字推送 → 末尾 `data: {done, sources}` |

## For AI Agents

### Working In This Directory
- 每个路由文件独立 `Router()`，在 `server.ts` 行 33-37 统一挂载
- `upload.ts` 中有两处 UTF-8 文件名修复（`fixFilename`），因为 multer 在某些系统上把 UTF-8 错误解析为 Latin-1
- `chat.ts` SSE 头设置后必须 `res.writeHead(200, ...)`，不能用 `res.status(200).json()`，否则流式无效
- 错误处理注意区分 `res.headersSent`：已发送 SSE 头后用 `res.write(data: {error})` + `res.end()`，未发送则用 `res.status(500).json()`

### Testing Requirements
- 无自动化测试——手动验证：上传文件 → 等 Embedding 加载 → 提问 → 检查流式输出和来源引用
- 健康检查端点可在浏览器中直接访问 `/api/health` 查看模型加载状态

## Dependencies

### Internal
- `../pipeline/parser` → `upload.ts` 解析文档
- `../pipeline/chunker` → `upload.ts` 切分文本
- `../pipeline/embedder` → `upload.ts` 向量化 + `health.ts` 查询状态
- `../pipeline/retriever` → `chat.ts` 检索相关段落
- `../pipeline/generator` → `chat.ts` 流式生成 + `health.ts` 查询状态
- `../store/vector-db` → `upload.ts` 存储 + `documents.ts` 列表/删除 + `chat.ts` 检查是否有文档
- `../prompt` → `chat.ts` 组装 messages

### External
- `multer` — `upload.ts` 文件上传中间件
- `crypto` — `upload.ts` 生成唯一文件名和 docId
