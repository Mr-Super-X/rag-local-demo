import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { parseDocument, MIME_TO_EXT, SUPPORTED_EXTENSIONS } from '../pipeline/parser';
import { chunkText } from '../pipeline/chunker';
import { embed } from '../pipeline/embedder';
import { addChunks } from '../store/vector-db';
import type { ChunkRecord, UploadResult } from '../types';

const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_MIMES = Object.keys(MIME_TO_EXT);
const ALLOWED_EXTENSIONS = SUPPORTED_EXTENSIONS.map(e => e.toLowerCase());

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safeName = fixFilename(file.originalname).replace(/[/\\:*?"<>|]/g, '_');
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(fixFilename(file.originalname)).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}。支持: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

// multer 在某些系统上把 UTF-8 文件名错误解析为 Latin-1，需转回来
function fixFilename(raw: string): string {
  try {
    return Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    return raw;
  }
}

const router = Router();

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '请选择要上传的文件' });
      return;
    }

    const originalName = fixFilename(req.file.originalname);
    const ext = MIME_TO_EXT[req.file.mimetype] || path.extname(originalName).toLowerCase();

    // Parse document
    let text: string;
    try {
      text = await parseDocument(req.file.path, ext);
    } catch (parseErr) {
      // Clean up file on parse failure
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({
        error: '文档解析失败，请确认文件未被加密或损坏',
        message: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return;
    }

    if (!text || text.trim().length === 0) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({
        error: '无法从文档中提取文本内容。请确认文档包含可选择中的文字（扫描版 PDF 不支持）',
      });
      return;
    }

    // Chunk
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({
        error: '无法从文档中提取文本内容。请确认文档包含可选择中的文字（扫描版 PDF 不支持）',
      });
      return;
    }

    // Embed
    const chunkTexts = chunks.map((c) => c.text);
    const vectors = await embed(chunkTexts);

    // Build records
    const docId = crypto.randomUUID();
    const now = new Date().toISOString();
    const records: ChunkRecord[] = chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      text: chunk.text,
      vector: vectors[i],
      docId,
      docName: originalName,
      chunkIndex: chunk.index,
      createdAt: now,
    }));

    // Store
    await addChunks(records);

    const result: UploadResult = {
      docId,
      docName: originalName,
      chunkCount: chunks.length,
    };

    console.log(`[Upload] ${originalName} → ${chunks.length} chunks (docId=${docId})`);
    res.json(result);
  } catch (err) {
    console.error('[Upload] 错误:', err);
    res.status(500).json({
      error: '文件处理失败',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
