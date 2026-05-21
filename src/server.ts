import express from 'express';
import path from 'path';

// 清除系统代理 — 本地服务需直连 hf-mirror.com 下载 embedding 模型
const proxyVars = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy',
  'NO_PROXY', 'no_proxy',
  'CDNURL', 'MIRROR',
];
for (const v of proxyVars) {
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
// 暴露 marked 库供前端 ESM import
app.use('/lib', express.static(path.resolve(process.cwd(), 'node_modules/marked/lib')));

// API routes
app.use('/api', healthRouter);
app.use('/api', documentsRouter);
app.use('/api', uploadRouter);
app.use('/api', chatRouter);

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

async function main() {
  // Pre-load embedding model
  try {
    console.log('[Server] 加载 Embedding 模型...');
    await initEmbedder();
  } catch (err) {
    console.error('[Server] Embedding 模型加载失败，上传功能不可用');
    console.error(err);
  }

  // Start llama-server (non-blocking for first request too)
  try {
    await startGenerator();
  } catch (err) {
    console.error('[Server] llama-server 启动失败，请在浏览器中查看健康状态');
    console.error(err);
  }

  const server = app.listen(PORT, () => {
    console.log(`\n=== RAG 本地 Demo 已启动 ===`);
    console.log(`访问: http://localhost:${PORT}`);
    console.log(`==========================\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Server] 关闭中...');
    stopGenerator();
    server.close(() => {
      console.log('[Server] 已关闭');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Port conflict handling
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 已被占用。请设置 PORT 环境变量使用其他端口，或关闭占用该端口的进程。`);
      process.exit(1);
    }
    throw err;
  });
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
