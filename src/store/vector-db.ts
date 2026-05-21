import * as lancedb from '@lancedb/lancedb';
import type { Connection, Table } from '@lancedb/lancedb';
import path from 'path';
import type { ChunkRecord } from '../types';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'lancedb');
const TABLE_NAME = 'chunks';

let db: Connection | null = null;
let table: Table | null = null;

export async function getDb(): Promise<Connection> {
  if (!db) {
    db = await lancedb.connect(DATA_DIR);
  }
  return db;
}

export async function getTable(): Promise<Table> {
  if (table) return table;
  const conn = await getDb();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    table = await conn.openTable(TABLE_NAME);
  } else {
    // Create empty table with explicit schema
    table = await conn.createTable(TABLE_NAME, [
      {
        id: '',
        text: '',
        vector: new Array(384).fill(0) as number[],
        docId: '',
        docName: '',
        chunkIndex: 0,
        createdAt: new Date().toISOString(),
      },
    ]);
    // Remove the placeholder row
    await (table as Table).delete('id = ""');
  }
  return table;
}

export async function addChunks(records: ChunkRecord[]): Promise<void> {
  const tbl = await getTable();
  await tbl.add(records as unknown as Array<Record<string, unknown>>);
}

export async function searchChunks(
  vector: number[],
  limit = 5
): Promise<Array<{ text: string; docName: string; chunkIndex: number; docId: string; _distance: number }>> {
  const tbl = await getTable();
  const results = await tbl
    .vectorSearch(vector)
    .distanceType('cosine')
    .limit(limit)
    .toArray();

  return results.map((r: Record<string, unknown>) => ({
    text: r.text as string,
    docName: r.docName as string,
    chunkIndex: r.chunkIndex as number,
    docId: r.docId as string,
    _distance: r._distance as number,
  }));
}

export async function getDocumentStats(): Promise<Array<{ docId: string; docName: string; chunkCount: number; uploadedAt: string }>> {
  const tbl = await getTable();
  const data = await tbl.query().toArray();

  const map = new Map<string, { docName: string; chunkCount: number; uploadedAt: string }>();
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const docId = r.docId as string;
    if (!map.has(docId)) {
      map.set(docId, {
        docName: r.docName as string,
        chunkCount: 0,
        uploadedAt: r.createdAt as string,
      });
    }
    map.get(docId)!.chunkCount++;
  }
  return Array.from(map.entries()).map(([docId, info]) => ({
    docId,
    ...info,
  }));
}

export async function deleteDocument(docId: string): Promise<void> {
  const tbl = await getTable();
  await tbl.delete(`docId = "${docId}"`);
}

export async function hasDocuments(): Promise<boolean> {
  const tbl = await getTable();
  const count = await tbl.countRows();
  return count > 0;
}
