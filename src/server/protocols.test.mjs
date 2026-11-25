import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ModelError,
  buildAnthropicUrl,
  buildOpenAiChatUrl,
  callChatModel,
  extractAnthropicText,
  extractOpenAiText,
  listProviderModels,
  toAnthropicMessages,
} from '../../server/ai/protocols.mjs';

const anthropicProvider = {
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
};

const openAiProvider = {
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
};

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function stubFetch(response) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('协议 URL 拼接', () => {
  it('OpenAI 兼容接口保留 /v1、/api/v3 和自定义前缀', () => {
    expect(buildOpenAiChatUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    expect(buildOpenAiChatUrl('https://ark.cn-beijing.volces.com/api/v3/')).toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
    expect(buildOpenAiChatUrl('https://relay.example.com/ai/openai/v1')).toBe('https://relay.example.com/ai/openai/v1/chat/completions');
  });

  it('Anthropic 不重复 /v1，并保留中转站前缀', () => {
    expect(buildAnthropicUrl('https://api.anthropic.com', 'messages')).toBe('https://api.anthropic.com/v1/messages');
    expect(buildAnthropicUrl('https://api.anthropic.com/v1', 'messages')).toBe('https://api.anthropic.com/v1/messages');
    expect(buildAnthropicUrl('https://relay.example.com/anthropic', 'messages')).toBe('https://relay.example.com/anthropic/v1/messages');
    expect(buildAnthropicUrl('https://relay.example.com/anthropic/v1/', 'messages')).toBe('https://relay.example.com/anthropic/v1/messages');
  });
});

describe('Anthropic 消息转换', () => {
  it('system 提升到顶层，图片转换为 base64 内容块', () => {
    const converted = toAnthropicMessages([
      { role: 'system', content: '你是转录员。' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '识别图片' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        ],
      },
    ]);

    expect(converted.system).toBe('你是转录员。');
    expect(converted.messages).toHaveLength(1);
    expect(converted.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '识别图片' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      ],
    });
  });

  it('非法图片数据抛出明确错误', () => {
    expect(() => toAnthropicMessages([{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:text/plain;base64,AAAA' } }],
    }])).toThrowError(expect.objectContaining({ code: 'unsupported-image' }));
  });

  it('只取 text 块，thinking 不进入最终文本', () => {
    const result = extractAnthropicText({
      content: [
        { type: 'thinking', thinking: '先想一想' },
        { type: 'text', text: '{"reason":"加法错误"}' },
      ],
      stop_reason: 'end_turn',
    });
    expect(result.text).toBe('{"reason":"加法错误"}');
    expect(result.text).not.toContain('先想一想');
  });
});

describe('OpenAI 响应解析', () => {
  it('支持字符串内容与内容块数组', () => {
    expect(extractOpenAiText({ choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] }))
      .toEqual({ text: 'hello', finishReason: 'stop' });
    expect(extractOpenAiText({
      choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }],
    })).toEqual({ text: 'ab', finishReason: '' });
  });

  it('空内容不算成功', () => {
    expect(() => extractOpenAiText({ choices: [{ message: { content: '   ' } }] }))
      .toThrowError(expect.objectContaining({ code: 'empty-content' }));
  });
});

describe('协议请求体与请求头', () => {
  it('Anthropic 发送 x-api-key、anthropic-version 和顶层 system', async () => {
    const spy = stubFetch(jsonResponse(200, {
      content: [{ type: 'thinking', thinking: '忽略' }, { type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
    }));

    const result = await callChatModel({
      provider: anthropicProvider,
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '只回复 OK' },
      ],
      timeout: 5000,
      maxTokens: 32,
      temperature: 0,
    });

    expect(result.text).toBe('OK');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.redirect).toBe('manual');
    const body = JSON.parse(String(init.body));
    expect(body.system).toBe('系统提示');
    expect(body.max_tokens).toBe(32);
    expect(body.messages).toEqual([{ role: 'user', content: '只回复 OK' }]);
    expect(body.response_format).toBeUndefined();
  });

  it('OpenAI 兼容接口只在声明支持时发送 response_format', async () => {
    const spy = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, {
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    })));
    vi.stubGlobal('fetch', spy);

    await callChatModel({
      provider: openAiProvider,
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: '输出 JSON' }],
      timeout: 5000,
      jsonMode: 'none',
    });
    let body = JSON.parse(String(spy.mock.calls[0][1].body));
    expect(body.response_format).toBeUndefined();
    expect(spy.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-openai');

    spy.mockClear();
    await callChatModel({
      provider: openAiProvider,
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: '输出 JSON' }],
      timeout: 5000,
      jsonMode: 'json_object',
    });
    body = JSON.parse(String(spy.mock.calls[0][1].body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('OpenAI 图片按 image_url 原样发送', async () => {
    const spy = stubFetch(jsonResponse(200, {
      choices: [{ message: { content: '{"question":"x"}' }, finish_reason: 'stop' }],
    }));

    await callChatModel({
      provider: openAiProvider,
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '识别' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      }],
      timeout: 5000,
      hasImage: true,
    });

    const body = JSON.parse(String(spy.mock.calls[0][1].body));
    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AAAA' },
    });
  });
});

describe('上游错误映射', () => {
  it('401/403 映射为 auth-failed，429 保留 retry-after', async () => {
    stubFetch(jsonResponse(401, { error: 'invalid' }));
    await expect(callChatModel({
      provider: openAiProvider,
      apiKey: 'bad',
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      timeout: 1000,
    })).rejects.toMatchObject({ code: 'auth-failed' });

    vi.unstubAllGlobals();
    stubFetch(jsonResponse(429, { error: 'slow down' }, { 'retry-after': '7' }));
    await expect(callChatModel({
      provider: openAiProvider,
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      timeout: 1000,
    })).rejects.toMatchObject({ code: 'rate-limited', status: 429, retryAfter: 7 });
  });

  it('跳转不跟随，直接报错', async () => {
    stubFetch(new Response('', { status: 302, headers: { Location: 'https://attacker.example.com' } }));
    await expect(callChatModel({
      provider: openAiProvider,
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      timeout: 1000,
    })).rejects.toMatchObject({ code: 'upstream-redirect' });
  });

  it('图片请求的 400 映射为图片能力不足', async () => {
    stubFetch(jsonResponse(400, { error: 'image unsupported' }));
    await expect(callChatModel({
      provider: openAiProvider,
      apiKey: 'key',
      model: 'text-only',
      messages: [{ role: 'user', content: 'x' }],
      timeout: 1000,
      hasImage: true,
    })).rejects.toMatchObject({ code: 'vision-model-required' });
  });

  it('截断响应不算成功', async () => {
    stubFetch(jsonResponse(200, {
      choices: [{ message: { content: '{"reason":"半截' }, finish_reason: 'length' }],
    }));
    await expect(callChatModel({
      provider: openAiProvider,
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      timeout: 1000,
    })).rejects.toMatchObject({ code: 'truncated' });
  });

  it('超时映射为 timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    await expect(callChatModel({
      provider: openAiProvider,
      apiKey: 'key',
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      timeout: 1,
    })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('ModelError 默认是 502，可按需携带状态码', () => {
    expect(new ModelError('x')).toMatchObject({ status: 502, retryAfter: null });
    expect(new ModelError('x', 429, 3)).toMatchObject({ status: 429, retryAfter: 3 });
  });
});

describe('模型列表', () => {
  it('读取 OpenAI 兼容接口的 data[].id', async () => {
    stubFetch(jsonResponse(200, { data: [{ id: 'model-a' }, { id: 'model-b' }, { id: 'model-a' }] }));
    const models = await listProviderModels({ provider: openAiProvider, apiKey: 'key', timeout: 1000 });
    expect(models).toEqual(['model-a', 'model-b']);
  });

  it('读取 Anthropic /v1/models 并携带原生请求头', async () => {
    const spy = stubFetch(jsonResponse(200, { data: [{ id: 'claude-sonnet-4-5' }] }));
    const models = await listProviderModels({ provider: anthropicProvider, apiKey: 'sk-ant', timeout: 1000 });
    expect(models).toEqual(['claude-sonnet-4-5']);
    expect(spy.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/models');
    expect(spy.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant');
  });

  it('空列表视为不可用', async () => {
    stubFetch(jsonResponse(200, { data: [] }));
    await expect(listProviderModels({ provider: openAiProvider, apiKey: 'key', timeout: 1000 }))
      .rejects.toMatchObject({ code: 'models-unavailable' });
  });
});
