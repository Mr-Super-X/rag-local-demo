import path from 'path';
import type { FeatureExtractionPipeline } from '@xenova/transformers';

let pipeline: FeatureExtractionPipeline | null = null;
let isReady = false;
let loadError: string | null = null;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const LOCAL_MODELS = path.resolve(process.cwd(), 'models', 'embedding');

export function getEmbeddingStatus(): { ready: boolean; error: string | null } {
  return { ready: isReady, error: loadError };
}

export async function initEmbedder(): Promise<void> {
  if (isReady) return;

  try {
    const { env, pipeline: pipe } = await import('@xenova/transformers');

    // 用 setup 预下载的本地文件
    env.allowLocalModels = true;
    env.localModelPath = LOCAL_MODELS;

    pipeline = await pipe('feature-extraction', MODEL_NAME, {
      quantized: true,
    });
    isReady = true;
    loadError = null;
    console.log('[Embedding] 模型加载完成 (本地):', MODEL_NAME);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error('[Embedding] 加载失败:', loadError);
    throw err;
  }
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!pipeline || !isReady) {
    await initEmbedder();
  }

  const embeddings: number[][] = [];

  for (const text of texts) {
    const result = await pipeline!(text, {
      pooling: 'mean',
      normalize: true,
    });
    embeddings.push(Array.from(result.data as Float32Array));
  }

  return embeddings;
}

export async function embedSingle(text: string): Promise<number[]> {
  const results = await embed([text]);
  return results[0];
}
