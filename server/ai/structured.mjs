// 结构化模型输出：要求模型返回 JSON，再做 schema 校验。
// 第一次不合格时补一轮“只输出 JSON”的纠正；仍不合格返回 null，
// 由端点降级为“证据不足”，绝不把错误 JSON、空响应或截断响应当成成功诊断。

export function stripCodeFence(content) {
  return content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

export function parseJsonContent(content) {
  try {
    return JSON.parse(stripCodeFence(content));
  } catch {
    return null;
  }
}

export async function callStructuredModel({ call, messages, validate }) {
  let currentMessages = messages;
  let lastContent = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { text } = await call(currentMessages);
    lastContent = text;
    const parsed = parseJsonContent(text);
    if (parsed !== null) {
      const result = validate(parsed);
      if (result) return result;
    }

    if (attempt === 0) {
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: lastContent.slice(0, 2000) || '（上一次输出不是合法 JSON）' },
        {
          role: 'user',
          content: '上一次输出没有通过结构校验。请只输出一个 JSON 对象，严格包含要求的全部字段，不要输出 Markdown、代码围栏或解释文字。',
        },
      ];
    }
  }

  return null;
}
