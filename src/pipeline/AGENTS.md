<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-25 -->

# pipeline

## Purpose
RAG 管道的 5 个阶段，按调用顺序：解析 → 切分 → 向量化 → 检索 → 生成。

## Key Files
| File | Description |
|------|-------------|
| `parser.ts` | 按文件扩展名选择解析器（pdf-parse / mammoth / marked），`SUPPORTED_EXTENSIONS` 和 `MIME_TO_EXT` 为 upload 路由提供校验 |
| `chunker.ts` | 递归字符切分：`\n\n` → `\n` → `。` → 硬切，512 token/块，64 token 重叠。`getChunkConfig()` 暴露参数给外部 |
| `embedder.ts` | `@xenova/transformers` 加载 all-MiniLM-L6-v2 (384维)，`env.localModelPath` 指向本地 `models/embedding/`。单例模式——`initEmbedder()` 只初始化一次 |
| `retriever.ts` | 问题向量化 → LanceDB 余弦搜索 Top-K → 过滤相似度 < 0.5 → 排序返回 |
| `generator.ts` | 管理 `llama-server` 子进程生命周期：`findLlamaServer()` 在 `bin/` 中按 `llama-server*` 前缀查找 → `spawn` 启动 → 健康检查轮询 → 通过 `127.0.0.1:8080/v1/chat/completions` 流式生成。暴露 `startGenerator` / `stopGenerator` / `generateStream` / `getGeneratorStatus` |

## For AI Agents

### Working In This Directory
- 管道的调用顺序不可变——`upload.ts` 按 parser→chunker→embedder 调用，`chat.ts` 按 retriever→generator 调用
- `embedder.ts` 和 `generator.ts` 各自维护 `isReady` 状态，通过 `getXxxStatus()` 暴露给 health 路由
- `generator.ts` `findLlamaServer()` 用 `startsWith('llama-server')` 匹配，不限制扩展名（Windows 有 `.exe`，macOS/Linux 无）
- 修改 chunker 参数会影响所有已上传文档的检索精度——修改后需删除 `data/` 并重新上传

### Common Patterns
- 动态 import 仅在函数内使用（`parser.ts` 的 `await import('pdf-parse')`），避免非必要模块在启动时加载
- 向量搜索用余弦距离（`distanceType('cosine')`），`retriever.ts` 中 `1 - distance` 转为相似度

## Dependencies

### Internal
- `store/vector-db.ts` — `retriever.ts` 调用 `searchChunks()`
- `../types.ts` — `SearchResult` 等接口
- `../prompt.ts` — `generator.ts` 不需要（messages 由 `chat.ts` 组装后传入）

### External
- `@xenova/transformers` — `embedder.ts` 的核心依赖，内部走 ONNX runtime
- `@lancedb/lancedb` — `retriever.ts` 通过 `store/vector-db.ts` 间接使用
