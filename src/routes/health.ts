import { Router } from 'express';
import { getEmbeddingStatus } from '../pipeline/embedder';
import { getGeneratorStatus } from '../pipeline/generator';
import type { HealthStatus } from '../types';

const router = Router();

router.get('/health', (_req, res) => {
  const embedding = getEmbeddingStatus();
  const llm = getGeneratorStatus();

  const status: HealthStatus = {
    status: llm.ready && embedding.ready ? 'ready'
      : embedding.error || llm.error ? 'error'
      : 'loading',
    llm: llm.ready,
    embedding: embedding.ready,
    message: llm.error || embedding.error || '正在加载模型...',
  };

  res.json(status);
});

export default router;
