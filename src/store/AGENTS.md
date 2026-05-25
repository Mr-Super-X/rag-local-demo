<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-25 -->

# store

## Purpose
LanceDB 嵌入式向量数据库的 CRUD 封装——存向量、搜相似、管理文档。

## Key Files
| File | Description |
|------|-------------|
| `vector-db.ts` | LanceDB 单例连接。单表 `chunks`，schema 对应 `ChunkRecord`。`getDb()` / `getTable()` 懒初始化、`addChunks()` 批量插入、`searchChunks()` 余弦向量搜索、`getDocumentStats()` 按 docId 聚合统计、`deleteDocument()` 按 docId 删除、`hasDocuments()` 判空 |

## For AI Agents

### Working In This Directory
- LanceDB 数据存在 `data/lancedb/`，向量维度固定 384（all-MiniLM-L6-v2 输出维度）
- 新建表时先插一条占位行再 `delete('id = ""')` 删除——这是 LanceDB 在建表时强制写入 schema 的 workaround
- `searchChunks()` 返回的 `_distance` 是余弦距离（0~2），需在 `retriever.ts` 用 `1 - _distance` 转为相似度
- 删除文档用字符串插值 `docId = "${docId}"`，LanceDB 支持 SQL 风格过滤
- 数据目录 `data/` 已在 `.gitignore`，删除即重置

### Common Patterns
- 所有函数 `async`，`getDb()` 和 `getTable()` 是懒加载单例——首次调用才连接/建表
- `addChunks()` 的 `records` 需 `as unknown as Array<Record<string, unknown>>` 断言——LanceDB 的类型定义与运行时不完全匹配

## Dependencies

### Internal
- `../types.ts` — `ChunkRecord` 接口

### External
- `@lancedb/lancedb` — 嵌入式向量数据库，npm install 即用，无需额外进程
