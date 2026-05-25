<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-25 -->

# src

## Purpose
RAG 系统全部后端源码：Express 入口、RAG 管道、API 路由、向量数据库操作。

## Key Files
| File | Description |
|------|-------------|
| `server.ts` | Express 入口：代理清理、模型预加载、路由注册、优雅关闭 |
| `prompt.ts` | System Prompt 模板 + `buildChatMessages()` 组装 messages 数组 |
| `types.ts` | 全部 TypeScript 接口：ChunkRecord、SearchResult、HealthStatus 等 |
| `types.d.ts` | `pdf-parse` 库的 ambient 类型声明（官方无类型包） |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `pipeline/` | RAG 管道 5 阶段（see `pipeline/AGENTS.md`） |
| `routes/` | Express 路由（see `routes/AGENTS.md`） |
| `store/` | 向量数据库操作（see `store/AGENTS.md`） |

## For AI Agents

### Working In This Directory
- `server.ts` 在顶部清空代理变量后会 `import` 路由和管道模块——这些模块依赖代理已清理
- 启动流程：`initEmbedder()` → `startGenerator()` → `app.listen()`。Embedding 失败不阻止启动（仅日志告警）
- 优雅关闭监听 SIGINT/SIGTERM，调用 `stopGenerator()` → SIGTERM → 5s 后 SIGKILL
- 端口冲突 (EADDRINUSE) 时输出友好提示后退出

### Common Patterns
- 所有模块路径使用 `process.cwd()` resolve，因为 `tsx` 在项目根目录执行
- 管道模块对外暴露 `Promise<结果>` 函数，内部自行处理初始化

## Dependencies

### Internal
- `pipeline/` 和 `store/` 是 `routes/` 的下层依赖
- `prompt.ts` 被 `routes/chat.ts` 使用

### External
- `express` — app 实例在 `server.ts` 创建，各路由文件导出 `Router`
- `tsx` — 命令行直接执行 TypeScript，无编译步骤
