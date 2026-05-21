import fs from 'fs/promises';

type ParserFn = (filePath: string) => Promise<string>;

async function parsePdf(filePath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDocx(filePath: string): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function parseMarkdown(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  // Strip HTML tags from rendered markdown, keep plain text
  const { marked } = await import('marked');
  const html = await marked(content);
  const text = html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return text.trim();
}

const PARSERS: Record<string, ParserFn> = {
  '.pdf': parsePdf,
  '.docx': parseDocx,
  '.md': parseMarkdown,
  '.txt': async (filePath: string) => fs.readFile(filePath, 'utf-8'),
};

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.md', '.txt'];

export const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/markdown': '.md',
  'text/plain': '.txt',
};

export async function parseDocument(filePath: string, ext: string): Promise<string> {
  const parser = PARSERS[ext.toLowerCase()];
  if (!parser) {
    throw new Error(`不支持的文件格式: ${ext}。支持的格式: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }
  return parser(filePath);
}
