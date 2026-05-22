import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const BIN_DIR = path.resolve(process.cwd(), 'bin');
const LLM_DIR = path.resolve(process.cwd(), 'models', 'llm');
const MODEL_FILE = 'qwen2.5-0.5b-q4_k_m.gguf';
const LLAMA_PORT = 8080;

let childProcess: ChildProcess | null = null;
let isLoaded = false;
let loadError: string | null = null;

function findLlamaServer(): string {
  const candidates = fs.readdirSync(BIN_DIR);
  const match = candidates.find((f) =>
    f.toLowerCase().startsWith('llama-server')
  );
  if (!match) {
    throw new Error(
      `未找到 llama-server 于 ${BIN_DIR}，请先运行 npm run setup`
    );
  }
  return path.join(BIN_DIR, match);
}

function healthCheck(): Promise<boolean> {
  return fetch(`http://127.0.0.1:${LLAMA_PORT}/health`)
    .then((r) => r.ok)
    .catch(() => false);
}

async function waitForReady(timeoutMs = 120000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await healthCheck();
    if (ok) {
      isLoaded = true;
      console.log('[LLM] llama-server 就绪');
      return;
    }
    await sleep(1000);
  }
  throw new Error('llama-server 启动超时');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function getGeneratorStatus(): { ready: boolean; error: string | null } {
  return { ready: isLoaded, error: loadError };
}

export async function startGenerator(): Promise<void> {
  if (isLoaded || childProcess) return;

  const serverExe = findLlamaServer();
  const modelPath = path.join(LLM_DIR, MODEL_FILE);

  if (!fs.existsSync(modelPath)) {
    throw new Error(`模型文件不存在: ${modelPath}，请先运行 npm run setup`);
  }

  console.log('[LLM] 启动 llama-server...');
  console.log(`[LLM] 模型: ${modelPath}`);

  childProcess = spawn(serverExe, [
    '-m', modelPath,
    '--port', String(LLAMA_PORT),
    '--host', '127.0.0.1',
    '-ngl', '0',  // CPU only, no GPU layers
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  childProcess.stdout?.on('data', (data: Buffer) => {
    // llama-server logs to stderr, but catch stdout too
  });

  childProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString();
    // Only log significant messages
    if (msg.includes('error') || msg.includes('Error')) {
      console.error('[LLM]', msg.trim());
    }
  });

  childProcess.on('exit', (code) => {
    console.log(`[LLM] llama-server 退出 (code=${code})`);
    isLoaded = false;
    childProcess = null;
  });

  try {
    await waitForReady();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

export function stopGenerator(): void {
  if (childProcess) {
    console.log('[LLM] 关闭 llama-server...');
    childProcess.kill('SIGTERM');

    const forceTimeout = setTimeout(() => {
      if (childProcess) {
        console.log('[LLM] 强制终止');
        childProcess.kill('SIGKILL');
      }
    }, 5000);

    childProcess.on('exit', () => {
      clearTimeout(forceTimeout);
      childProcess = null;
      isLoaded = false;
    });
  }
}

export interface GenerateStreamOptions {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export async function generateStream(
  messages: Array<{ role: string; content: string }>,
  opts: GenerateStreamOptions
): Promise<void> {
  if (!isLoaded) {
    await startGenerator();
  }

  const response = await fetch(
    `http://127.0.0.1:${LLAMA_PORT}/v1/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 512,
        stop: ['<|endoftext|>', '<|im_end|>'],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API 错误: ${response.status} ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取 SSE 流');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              opts.onToken(content);
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    opts.onDone();
  }
}
