import { searchChunks } from '../store/vector-db';
import { embedSingle } from './embedder';
import type { SearchResult } from '../types';

const MIN_SIMILARITY = 0.5;

function cosineToSimilarity(distance: number): number {
  return 1 - distance;
}

export async function retrieve(
  query: string,
  topK = 5
): Promise<SearchResult[]> {
  const queryVector = await embedSingle(query);
  const results = await searchChunks(queryVector, topK);

  return results
    .map((r) => ({
      text: r.text,
      docName: r.docName,
      chunkIndex: r.chunkIndex,
      similarity: cosineToSimilarity(r._distance),
    }))
    .filter((r) => r.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity);
}
