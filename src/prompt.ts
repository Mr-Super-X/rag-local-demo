export function buildPrompt(contexts: string[], question: string): string {
  const contextText = contexts
    .map((c, i) => `[${i + 1}] ${c}`)
    .join('\n\n');

  return `你是一个基于文档检索的助手。请仅使用下面提供的参考资料回答问题。
如果参考资料中没有足够信息，请说"根据提供的资料无法回答此问题。"
不要编造事实，不要使用你自己的知识。

参考资料：
${contextText}

问题：${question}

回答：`;
}

export function buildChatMessages(contexts: string[], question: string) {
  return [
    {
      role: 'system',
      content: '你是一个基于文档检索的助手。请仅使用提供的参考资料回答问题。如果资料不足，请如实说明。不要编造。回答时使用 Markdown 格式：代码用 ``` 包裹，标题用 ##，列表用 - 或数字。',
    },
    {
      role: 'user',
      content: `参考资料：\n${contexts.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}\n\n问题：${question}`,
    },
  ];
}
