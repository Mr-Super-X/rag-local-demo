# 从零搭建本地 RAG 知识库

> 本文适合零基础读者。跟着教程走，你就能在自己电脑上搭建一个完全离线的 AI 文档问答系统。

---

## 一、什么是 RAG？

**RAG** 是 Retrieval-Augmented Generation 的缩写，中文叫"检索增强生成"。

用大白话说就是：你有一堆文档（PDF、Word、Markdown），你想问 AI 这些文档里面讲了什么。但 ChatGPT 这种在线 AI 看不到你本地的文件。RAG 的做法是：

```
你的文档 → 切成小块 → 每块转成数学向量 → 存入向量数据库
你提问题 → 问题也转成向量 → 在数据库里找最相似的文档块
找到的文档块 + 你的问题 → 一起发给 AI → AI 基于文档内容回答
```

这样 AI 就能"看懂"你的文档了，而且全程都在你电脑上运行，不需要联网。

---

## 二、你需要准备什么

| 条件 | 说明 |
|------|------|
| 操作系统 | Windows 10/11（64 位） |
| 硬盘空间 | 至少 2GB（代码很少，主要是下载模型文件 ~500MB） |
| 内存 | 建议 4GB 以上 |
| 网络 | 首次安装时需要下载模型（后续完全离线） |

**不需要**：显卡（纯 CPU 就能跑）、Python、Docker、API Key。

---

## 三、一步步搭建

### 第 1 步：安装 Node.js

Node.js 是 JavaScript 的运行环境。

1. 打开浏览器，访问 `https://nodejs.org`
2. 下载左边的 **LTS** 版本（长期支持版，更稳定）
3. 双击下载的 `.msi` 文件，一路点"Next"安装
4. 安装完成后，按键盘 `Win + R`，输入 `cmd` 回车，在黑色窗口里输入：

```bash
node --version
```

如果看到 `v20.x.x` 这样的数字，说明安装成功。

### 第 2 步：获取项目代码

把项目文件夹放到你喜欢的位置（比如桌面或 D 盘）。如果你有 git，可以 clone；如果没有，直接复制粘贴项目文件夹即可。

打开命令行（在项目文件夹的地址栏输入 `cmd` 回车），你应该在类似这样的路径：

```
D:\personal\AI\rag
```

### 第 3 步：安装项目依赖

在命令行中依次执行以下命令：

```bash
# 安装 JavaScript 依赖包（跳过需要从 GitHub 下载的原生模块）
npm install --ignore-scripts

# 单独构建两个需要原生二进制文件的关键模块
npm rebuild sharp onnxruntime-node
```

> **踩坑提醒 ①**：`npm install` 直接运行大概率会卡在 `sharp` 这个包上（它需要从 GitHub 下载文件，国内网络经常超时）。所以分两步走：先用 `--ignore-scripts` 跳过，再单独 `rebuild`。

看到类似下面的输出就表示成功了：
```
rebuilt dependencies successfully
```

### 第 4 步：下载 AI 模型

这个项目需要两个模型：

| 模型 | 作用 | 大小 |
|------|------|------|
| all-MiniLM-L6-v2 | 把文字转成向量（做搜索用） | ~80MB |
| Qwen2.5-0.5B | AI 大脑（生成回答用） | ~400MB |

运行：

```bash
npm run setup
```

> **踩坑提醒 ②**：这个命令会自动下载两个模型。你电脑上如果设置了代理（翻墙工具等），可能会导致下载失败。报错 `ECONNREFUSED 127.0.0.1:443` 或者 `ETIMEDOUT` 都是代理导致的。

> 我们的 setup 脚本已经做了很多网络兼容处理（切换国内镜像、重试机制等），如果还是失败，见第五章的"网络问题"部分。

下载成功后会看到：
```
[校验] 模型文件 GGUF 魔数校验通过
[Embedding] 模型文件下载完成
=== 设置完成！运行 npm start 启动应用 ===
```

### 第 5 步：启动应用

```bash
npm start
```

第一次启动会慢一些（需要加载模型到内存），之后会看到：

```
[Embedding] 模型加载完成 (本地): Xenova/all-MiniLM-L6-v2
[LLM] llama-server 就绪
=== RAG 本地 Demo 已启动 ===
访问: http://localhost:3000
```

打开浏览器，输入 `http://localhost:3000`，你就能看到聊天界面了！

---

## 四、怎么用

### 上传文档

1. 点击左侧的「上传文档」按钮
2. 选择你的 PDF / Word / Markdown / TXT 文件
3. 等待出现"已添加：xxx (N 片段)"的提示
4. 左侧文档列表出现文件名，说明上传成功

> **踩坑提醒 ③**：扫描版 PDF（图片做成的 PDF）无法识别文字！会提示"无法从文档中提取文本内容"。你需要用"可选择文字"的 PDF（在 PDF 阅读器里能选中文字的那种）。

### 提问

1. 在右侧输入框中输入问题
2. 按 Enter 发送
3. AI 会逐字输出回答
4. 回答下方可以展开「引用来源」，看到 AI 是从哪些文档段落里找到答案的

### 删除文档

点击文档名右侧的 × 按钮即可删除。

### 小提示

- 上传多个文档后，AI 会同时搜索所有文档，实现跨文件问答
- AI 回答质量取决于你上传的文档内容是否相关
- 因为这个 AI 模型很小（0.5B 参数），回答会比较简洁，但检索能力是靠谱的

---

## 五、常见踩坑与解决

### 网络问题 🟡 最常遇到

| 现象 | 原因 | 解决 |
|------|------|------|
| `npm install` 卡在 `sharp` | sharp 需从 GitHub 下载文件，国内慢 | 用 `npm install --ignore-scripts` 然后 `npm rebuild sharp onnxruntime-node` |
| `npm run setup` 报 `ECONNREFUSED 127.0.0.1:443` | 系统设置了代理但代理没运行 | setup 脚本已处理——会自动清代理、切换国内镜像 |
| `npm run setup` 报 `ETIMEDOUT` | 某个 CDN 节点连不上 | setup 脚本已加了自动重试（3 次），换了 IP 通常就好 |
| 模型下载后校验失败 | 下载中断导致文件损坏 | 删除 `models/llm/` 下的 `.gguf` 文件，重新 `npm run setup` |

### 启动问题

| 现象 | 原因 | 解决 |
|------|------|------|
| `npm start` 报 `Cannot find module sharp` | 原生模块没构建 | 运行 `npm rebuild sharp onnxruntime-node` |
| `npm start` 报 `gguf_init_from_file_ptr: failed to read magic` | 模型文件损坏（0 字节或半截文件） | 删除 `models/llm/` 下文件，重新 `npm run setup` |
| `npm start` 报 `failed to read magic` | 同上 | 同上 |
| `[Embedding] 加载失败: fetch failed` | 模型文件路径不对或缺少文件 | 确认 `models/embedding/Xenova/all-MiniLM-L6-v2/` 下有 4 个文件 |
| 端口 3000 被占用 | 其他程序在用 3000 端口 | `set PORT=8080 && npm start` 换端口 |

### 上传问题

| 现象 | 原因 | 解决 |
|------|------|------|
| 上传 PDF 报"不支持的文件类型" | Windows 对部分文件类型的 MIME 识别不对 | 已修复——现在按文件扩展名判断，不是 MIME |
| 上传后文件名乱码 | multer 把 UTF-8 文件名错误解析为 Latin-1 | 已修复——加了编码自动转换 |
| 上传后"无法提取文本内容" | PDF 是扫描版（图片），没有文字层 | 换用可选择文字的 PDF，或用 OCR 工具先识别 |
| 点击上传弹两次文件选择框 | label 标签和 JS 重复触发了 click | 已修复——删除了多余的 JS 点击事件 |

### 使用问题

| 现象 | 原因 | 解决 |
|------|------|------|
| AI 回答和问题无关 | 文档内容和问题不匹配 | 上传相关文档，或者换个问法 |
| 页面报 JS 语法错误 | 前端 JS 文件里混入了 TypeScript 语法 | 已修复——`.js` 文件不能有 `: Type` 类型标注和 `!` 非空断言 |
| 文档列表 500 错误 | LanceDB 空表没有 schema | 已修复——创建表时插入占位行定义 schema |
| 页面刷新后聊天记录没了 | 设计如此——本地 demo 不持久化聊天历史 | 这是预期行为 |

---

## 六、技术架构（给想进一步了解的人）

```
浏览器 (localhost:3000)
  ↓ 上传文件 / 发送问题
Express 服务器 (Node.js + TypeScript)
  ↓
  ├── 文档解析: pdf-parse / mammoth / marked
  ├── 文本切分: 递归字符切分 (每块 ~500 字)
  ├── 向量化: all-MiniLM-L6-v2 (384 维向量)
  ├── 向量存储: LanceDB (本地嵌入式数据库)
  ├── 向量检索: 余弦相似度 Top-5 + 最低相似度过滤
  ├── LLM 推理: llama-server.exe (Qwen2.5-0.5B)
  └── 前端渲染: marked (Markdown → HTML)
```

**数据存储位置**：
- `data/uploads/` — 你上传的原始文件
- `data/lancedb/` — 文档切分后的向量索引
- `models/` — 下载的 AI 模型文件

删除这些目录即可清空所有数据（下次启动会重建）。

---

## 七、常见问答

**Q: 能换更大的 AI 模型吗？**

可以。去 HuggingFace 或 hf-mirror.com 下载任意 GGUF 格式的模型，放到 `models/llm/` 目录，然后修改 `src/pipeline/generator.ts` 中的 `MODEL_FILE` 常量。推荐 Qwen2.5-1.5B 或 3B，回答质量会明显提升。

**Q: 能支持更多文件格式吗？**

可以。在 `src/pipeline/parser.ts` 中添加新的解析函数（比如 `.pptx`、`.epub`），注册到 `PARSERS` 字典，并在 `SUPPORTED_EXTENSIONS` 中添加扩展名。

**Q: 回答太慢了怎么办？**

这个小模型（0.5B）已经很快了。如果换更大模型会更慢。提升空间：用 GPU 加速（修改 `src/pipeline/generator.ts` 中 `spawn` 的 `-ngl 0` 为 `-ngl 99`），或者用更强的 CPU。

**Q: 怎么让 AI 回答得更准确？**

三个方向：
1. 换更大的模型（Qwen2.5-1.5B ~1.5GB 或 3B ~2.4GB）
2. 调整 Prompt 模板（在 `src/prompt.ts` 中）
3. 调整检索参数：增加 Top-K 值，降低相似度阈值

---

## 八、项目文件结构速查

```
rag-local-demo/
├── package.json          # 项目配置和依赖
├── README.md             # 项目说明
├── docs/                 # 文档
├── scripts/setup.ts      # 模型下载脚本
├── src/
│   ├── server.ts         # 服务器入口
│   ├── prompt.ts         # AI Prompt 模板
│   ├── types.ts          # 类型定义
│   ├── routes/           # API 路由（上传、对话、文档管理、健康检查）
│   ├── pipeline/         # RAG 核心管线（解析、切分、向量化、检索、生成）
│   └── store/            # 向量数据库操作
├── public/               # 前端页面（HTML + CSS + JS）
├── data/                 # 运行时数据（上传文件 + 向量数据库）
├── models/               # AI 模型文件
└── bin/                  # llama-server 可执行文件
```
