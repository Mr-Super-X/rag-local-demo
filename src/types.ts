export interface ChunkRecord {
  id: string;
  text: string;
  vector: number[];
  docId: string;
  docName: string;
  chunkIndex: number;
  createdAt: string;
}

export interface DocumentInfo {
  docId: string;
  docName: string;
  chunkCount: number;
  uploadedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Source {
  docName: string;
  text: string;
  chunkIndex: number;
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
}

export interface UploadResult {
  docId: string;
  docName: string;
  chunkCount: number;
}

export interface HealthStatus {
  status: 'loading' | 'ready' | 'error';
  llm: boolean;
  embedding: boolean;
  message: string;
}

export interface SearchResult {
  text: string;
  docName: string;
  chunkIndex: number;
  similarity: number;
}
