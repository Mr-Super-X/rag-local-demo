import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';

// 清除系统代理 — 直连下载
for (const v of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy']) {
  process.env[v] = '';
}

const MODELS_DIR = path.resolve(process.cwd(), 'models');
const LLM_DIR = path.join(MODELS_DIR, 'llm');
const BIN_DIR = path.resolve(process.cwd(), 'bin');

// llama.cpp release to use — pin for stability
const LLAMA_CPP_TAG = 'b9263';
const LLAMA_ZIP = `llama-${LLAMA_CPP_TAG}-bin-win-cpu-x64.zip`;
const LLAMA_URL = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/${LLAMA_ZIP}`;

// HuggingFace 可能不可达，使用 hf-mirror.com 镜像
const HF_HOST = 'https://hf-mirror.com';

const MODEL_URL =
  `${HF_HOST}/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf`;
const MODEL_FILENAME = 'qwen2.5-0.5b-q4_k_m.gguf';

// Embedding 模型: all-MiniLM-L6-v2 (Xenova/transformers.js ONNX 格式)
const EMBEDDING_DIR = path.join(MODELS_DIR, 'embedding', 'Xenova', 'all-MiniLM-L6-v2');
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// GGUF magic bytes: "GGUF" = 0x47 0x47 0x55 0x46
const GGUF_MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46]);

function validateGGUF(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.equals(GGUF_MAGIC);
  } catch {
    return false;
  }
}

function download(url: string, dest: string, label: string, maxRedirects = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[下载] ${label} (无进度条，~400MB 请耐心等待)...`);

    const doRequest = (reqUrl: string, redirectsLeft: number, retriesLeft = 3) => {
      const file = fs.createWriteStream(dest);
      const transport = reqUrl.startsWith('https') ? https : http;
      const req = transport.get(reqUrl, {
        headers: { 'User-Agent': 'rag-local-demo-setup' },
        agent: false,
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          if (redirectsLeft <= 0) {
            file.close();
            try { fs.unlinkSync(dest); } catch {}
            reject(new Error('重定向次数过多'));
            return;
          }
          let location = res.headers.location;
          if (!location) {
            file.close();
            try { fs.unlinkSync(dest); } catch {}
            reject(new Error('重定向无 location'));
            return;
          }
          if (!location.startsWith('http://') && !location.startsWith('https://')) {
            const baseUrl = new URL(reqUrl);
            location = `${baseUrl.origin}${location}`;
          }
          file.close();
          res.resume();
          doRequest(location, redirectsLeft - 1, retriesLeft);
          return;
        }

        if (!res.statusCode || res.statusCode >= 400) {
          file.close();
          try { fs.unlinkSync(dest); } catch {}
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (err) => {
          file.close();
          try { fs.unlinkSync(dest); } catch {}
          reject(err);
        });
      });

      req.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        if (retriesLeft > 0 && (err as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
          console.log(`  连接超时，重试中... (剩余 ${retriesLeft} 次)`);
          setTimeout(() => doRequest(reqUrl, redirectsLeft, retriesLeft - 1), 2000);
          return;
        }
        reject(err);
      });
      req.setTimeout(300_000, () => {
        req.destroy();
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        reject(new Error('下载超时 (5分钟)'));
      });
    };

    doRequest(url, maxRedirects);
  });
}

async function main() {
  console.log('=== RAG 本地 Demo 环境设置 ===\n');

  ensureDir(MODELS_DIR);
  ensureDir(LLM_DIR);
  ensureDir(BIN_DIR);

  // Download llama-server binary
  const zipPath = path.join(BIN_DIR, LLAMA_ZIP);
  const serverExe = path.join(BIN_DIR, 'llama-server.exe');

  if (fs.existsSync(serverExe)) {
    console.log('[跳过] llama-server.exe 已存在');
  } else {
    await download(LLAMA_URL, zipPath, 'llama.cpp binary');
    console.log('[解压] llama.zip...');
    // Use PowerShell Expand-Archive (Windows native, no extra deps)
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`,
      { stdio: 'inherit' }
    );
    // The zip contains files directly, no subdirectory in newer releases
    const candidates = fs.readdirSync(BIN_DIR).filter(f => f.endsWith('.exe'));
    console.log(`[解压完成] 找到可执行文件: ${candidates.join(', ')}`);
    fs.unlinkSync(zipPath);
  }

  // Download LLM model
  const modelPath = path.join(LLM_DIR, MODEL_FILENAME);

  // Check if existing model file is valid
  let needDownload = true;
  if (fs.existsSync(modelPath)) {
    if (validateGGUF(modelPath)) {
      console.log('[跳过] 模型文件已存在，校验通过');
      needDownload = false;
    } else {
      console.log('[警告] 模型文件损坏（GGUF 魔数校验失败），重新下载...');
      fs.unlinkSync(modelPath);
    }
  }

  if (needDownload) {
    await download(MODEL_URL, modelPath, 'Qwen2.5-0.5B Q4_K_M');
    if (!validateGGUF(modelPath)) {
      console.error('\n[错误] 下载的模型文件校验失败，可能是网络传输中断');
      console.error('请删除 models/llm/ 下的文件后重试 npm run setup');
      process.exit(1);
    }
    console.log('[校验] 模型文件 GGUF 魔数校验通过');
  }

  // Download Embedding model files (all-MiniLM-L6-v2 ONNX files)
  // 使用 Node.js 下载（undici.fetch 连接超时 10s 太短，https.get 无此限制）
  console.log('\n[Embedding] 下载 all-MiniLM-L6-v2 模型文件 (~80MB)...');
  ensureDir(path.join(EMBEDDING_DIR, 'onnx'));

  for (const file of EMBEDDING_FILES) {
    const dest = path.join(EMBEDDING_DIR, file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`[跳过] ${file}`);
      continue;
    }
    await download(`${HF_HOST}/${EMBEDDING_MODEL}/resolve/main/${file}`, dest, file);
  }
  console.log('[Embedding] 模型文件下载完成');

  // Verify server binary
  if (!fs.existsSync(serverExe)) {
    // Search for llama-server.exe in bin directory
    const found = fs.readdirSync(BIN_DIR).find(f => f.toLowerCase().includes('llama-server'));
    if (found) {
      console.log(`\n[就绪] 找到: ${found}`);
    } else {
      console.error('\n[错误] 未找到 llama-server.exe，请检查 bin/ 目录');
      process.exit(1);
    }
  }

  console.log('\n=== 设置完成！运行 npm start 启动应用 ===');
}

main().catch((err) => {
  console.error('\n设置失败:', err.message);
  process.exit(1);
});
