import { Router } from 'express';
import { retrieve } from '../pipeline/retriever';
import { generateStream } from '../pipeline/generator';
import { buildChatMessages } from '../prompt';
import { hasDocuments } from '../store/vector-db';
import type { Source } from '../types';

const router = Router();

router.post('/chat', async (req, res) => {
  try {
    const { question } = req.body as { question?: string };

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({ error: '问题不能为空' });
      return;
    }

    const hasDocs = await hasDocuments();
    if (!hasDocs) {
      res.status(400).json({ error: '请先上传文档' });
      return;
    }

    // Retrieve relevant chunks
    const results = await retrieve(question.trim(), 5);

    if (results.length === 0) {
      res.json({
        answer: '未找到相关文档段落，请尝试上传更多相关文件或换个问题。',
        sources: [],
      });
      return;
    }

    const contexts = results.map((r) => r.text);

    const sources: Source[] = results.map((r) => ({
      docName: r.docName,
      text: r.text,
      chunkIndex: r.chunkIndex,
    }));

    const messages = buildChatMessages(contexts, question.trim());

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let fullAnswer = '';

    try {
      await generateStream(messages, {
        onToken(token) {
          fullAnswer += token;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
        onDone() {
          // Send sources at the end
          res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
          res.end();
        },
        onError(err) {
          console.error('[Chat] LLM 错误:', err.message);
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        },
      });
    } catch (genErr) {
      console.error('[Chat] 生成错误:', genErr);
      res.write(`data: ${JSON.stringify({ error: 'LLM 生成失败' })}\n\n`);
      res.end();
    }
  } catch (err) {
    console.error('[Chat] 错误:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: '处理请求失败',
        message: err instanceof Error ? err.message : String(err),
      });
    } else {
      res.end();
    }
  }
});

export default router;
