<!-- Generated: 2026-05-25 -->
# RAG 本地文档问答 Demo

## Purpose
基于检索增强生成（RAG）的本地文档问答系统——Express + TypeScript 后端，原生 HTML/CSS/JS 前端。完全本地运行，无需外部 API。

## Key Files
| File | Description |
|------|-------------|
| `package.json` | 项目元信息、依赖、`setup` / `start` 脚本 |
| `tsconfig.json` | TypeScript 配置：ES2022 target、ESNext module、bundler 解析 |
| `CLAUDE.md` | Claude Code 工作指引（命令、架构、设计决策） |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `src/` | 全部后端源码（see `src/AGENTS.md`） |
| `scripts/` | `setup.ts` — 首次环境安装，下载引擎和模型 |
| `public/` | 前端静态文件（index.html + 4 个 JS/CSS），无打包工具 |
| `docs/` | 4 份配套教程文档（Markdown） |
| `models/` | 下载的 AI 模型文件（GGUF + ONNX） |
| `bin/` | llama-server 可执行文件（setup.ts 下载） |
| `data/` | 运行时数据（uploads/ + lancedb/），删除即重置 |

## For AI Agents

### Working In This Directory
- `npm run setup` 下载引擎和模型（首次约 480MB），`npm start` 启动服务
- 没有 lint / test / build 脚本——tsx 直接执行 TypeScript
- `PORT=8080 npm start` 可自定义端口
- 修改 `scripts/setup.ts` 时注意 Windows (`.zip`) 和 macOS/Linux (`.tar.gz`) 的差异

### Common Patterns
- 所有路径用 `path.resolve(process.cwd(), ...)` 确保相对项目根目录
- 启动时清空 `HTTP_PROXY` / `HTTPS_PROXY` 等代理环境变量，防止干扰本地直连

## Dependencies

### External
| Package | Usage |
|---------|-------|
| `express` 4.x | HTTP 框架 |
| `@xenova/transformers` | Embedding 模型推理 (ONNX runtime) |
| `@lancedb/lancedb` | 嵌入式向量数据库 |
| `pdf-parse` / `mammoth` / `marked` | 文档解析 |
| `multer` | 文件上传中间件 |
| `tsx` | TypeScript 执行器 |
