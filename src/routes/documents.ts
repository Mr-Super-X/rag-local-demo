import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDocumentStats, deleteDocument } from '../store/vector-db';

const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const router = Router();

router.get('/documents', async (_req, res) => {
  try {
    const docs = await getDocumentStats();
    res.json({ documents: docs });
  } catch (err) {
    res.status(500).json({
      error: '获取文档列表失败',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

router.delete('/documents/:docId', async (req, res) => {
  try {
    const { docId } = req.params;

    // Delete from LanceDB
    await deleteDocument(docId);

    // Delete uploaded files for this docId
    try {
      const files = await fs.readdir(UPLOAD_DIR);
      for (const file of files) {
        if (file.includes(docId)) {
          await fs.unlink(path.join(UPLOAD_DIR, file));
        }
      }
    } catch {
      // Upload dir might not exist or file already gone
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      error: '删除文档失败',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
