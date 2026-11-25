// 协议适配层：只负责“如何调用供应商协议”，不决定用哪个供应商或哪把 Key。
// 目前支持 OpenAI Chat Completions 与 Anthropic 原生 Messages。
// 注意：所有携带凭证的请求都禁止跟随跳转，避免 Key 被转发到其他域名。

import { ANTHROPIC_VERSION } from './providers.mjs';

export class ModelError extends Error {
  constructor(code, status = 502, retryAfter = null) {
    super(code);
    this.name = 'ModelError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function trimBase(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

/** Base URL 保留管理员配置的路径前缀，只追加 /chat/completions。 */
export function buildOpenAiChatUrl(baseUrl) {
  const base = trimBase(baseUrl);
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

/** Base URL 已带 /v1 时不重复追加；自定义前缀原样保留。 */
export function buildAnthropicUrl(baseUrl, suffix) {
  const base = trimBase(baseUrl);
  if (base.endsWith(`/${suffix}`)) return base;
  return base.endsWith('/v1') ? `${base}/${suffix}` : `${base}/v1/${suffix}`;
}

export function buildOpenAiModelsUrl(baseUrl) {
  return `${trimBase(baseUrl)}/models`;
}

export function buildAnthropicModelsUrl(baseUrl) {
  return buildAnthropicUrl(baseUrl, 'models');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((block) => (isRecord(block) && typeof block.text === 'string' ? block.text : ''))
    .join('');
}

function parseDataUrl(url) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(url);
  if (!match) return null;
  return { mediaType: match[1].toLowerCase(), data: match[2] };
}

/** 把内部消息（OpenAI 风格）转换为 Anthropic 内容块，图片只接受 data URL。 */
export function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw new ModelError('invalid-request', 400);
  const blocks = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      blocks.push({ type: 'text', text: block.text });
      continue;
    }
    if (block.type === 'image_url') {
      const url = isRecord(block.image_url) && typeof block.image_url.url === 'string'
        ? block.image_url.url
        : '';
      if (/^https:\/\//i.test(url)) {
        blocks.push({ type: 'image', source: { type: 'url', url } });
        continue;
      }
      const parsed = parseDataUrl(url);
      if (!parsed) throw new ModelError('unsupported-image', 400);
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
      });
    }
  }
  return blocks.length > 0 ? blocks : '';
}

export function toAnthropicMessages(messages) {
  const systemParts = [];
  const converted = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!isRecord(message)) continue;
    const content = typeof message.content === 'string' ? message.content : textFromBlocks(message.content);
    if (message.role === 'system') {
      if (content.trim()) systemParts.push(content.trim());
      continue;
    }
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const blocks = toAnthropicContent(message.content);
    if (!blocks) continue;
    converted.push({ role: message.role, content: blocks });
  }
  return { system: systemParts.join('\n\n'), messages: converted };
}

export function extractOpenAiText(data) {
  if (!isRecord(data) || isRecord(data.error)) throw new ModelError('invalid-response');
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  const text = typeof message?.content === 'string'
    ? message.content
    : textFromBlocks(message?.content);
  if (!text.trim()) throw new ModelError('empty-content');
  return {
    text,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : '',
  };
}

export function extractAnthropicText(data) {
  if (!isRecord(data) || isRecord(data.error)) throw new ModelError('invalid-response');
  // 只取 type === 'text' 的内容块；thinking / redacted_thinking 不进入诊断 JSON。
  const text = Array.isArray(data.content)
    ? data.content
      .filter((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
    : '';
  if (!text.trim()) throw new ModelError('empty-content');
  return {
    text,
    finishReason: typeof data.stop_reason === 'string' ? data.stop_reason : '',
  };
}

function mapUpstreamStatus(status, retryAfter, hasImage) {
  if (status === 401 || status === 403) throw new ModelError('auth-failed');
  if (status === 429) throw new ModelError('rate-limited', 429, retryAfter);
  if (status === 404) throw new ModelError('model-not-found');
  if (status === 408 || status === 504) throw new ModelError('timeout');
  if (hasImage && (status === 400 || status === 415 || status === 422)) {
    throw new ModelError('vision-model-required');
  }
  if (status === 400) throw new ModelError('bad-request');
  if (status >= 500) throw new ModelError('upstream-5xx');
  throw new ModelError(`upstream-${status}`);
}

async function requestJson({ method = 'POST', url, headers, body, timeout, hasImage = false }) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ModelError('timeout');
    }
    throw new ModelError('network');
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ModelError('upstream-redirect');
  }
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after')) || null;
    mapUpstreamStatus(response.status, retryAfter, hasImage);
  }

  try {
    return await response.json();
  } catch {
    throw new ModelError('invalid-response');
  }
}

function openAiHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function anthropicHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

async function callOpenAiChat({ provider, apiKey, model, messages, timeout, jsonMode, maxTokens, temperature, hasImage }) {
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
  };
  if (temperature !== null && temperature !== undefined) body.temperature = temperature;
  if (jsonMode === 'json_object') body.response_format = { type: 'json_object' };

  const data = await requestJson({
    url: buildOpenAiChatUrl(provider.baseUrl),
    headers: openAiHeaders(apiKey),
    body,
    timeout,
    hasImage,
  });
  const result = extractOpenAiText(data);
  if (result.finishReason === 'length') throw new ModelError('truncated');
  if (result.finishReason === 'content_filter') throw new ModelError('invalid-response');
  return result;
}

async function callAnthropicMessages({ provider, apiKey, model, messages, timeout, maxTokens, temperature, hasImage }) {
  const converted = toAnthropicMessages(messages);
  if (converted.messages.length === 0) throw new ModelError('invalid-request', 400);
  const body = {
    model,
    max_tokens: maxTokens,
    messages: converted.messages,
  };
  if (converted.system) body.system = converted.system;
  if (temperature !== null && temperature !== undefined) body.temperature = temperature;

  const data = await requestJson({
    url: buildAnthropicUrl(provider.baseUrl, 'messages'),
    headers: anthropicHeaders(apiKey),
    body,
    timeout,
    hasImage,
  });
  const result = extractAnthropicText(data);
  if (result.finishReason === 'max_tokens') throw new ModelError('truncated');
  if (result.finishReason === 'refusal') throw new ModelError('invalid-response');
  return result;
}

export async function callChatModel({
  provider,
  apiKey,
  model,
  messages,
  timeout,
  jsonMode = 'none',
  maxTokens = 3000,
  temperature = 0.1,
  hasImage = false,
}) {
  if (!provider || !apiKey || !model) throw new ModelError('invalid-request', 400);
  const options = {
    provider,
    apiKey,
    model,
    messages,
    timeout,
    jsonMode,
    maxTokens: Math.max(1, Number(maxTokens) || 3000),
    temperature,
    hasImage,
  };
  return provider.protocol === 'anthropic'
    ? callAnthropicMessages(options)
    : callOpenAiChat(options);
}

/** 用户主动点击“读取模型列表”时才调用；失败由调用方降级为手填。 */
export async function listProviderModels({ provider, apiKey, timeout = 10000 }) {
  if (!provider || !apiKey) throw new ModelError('invalid-request', 400);
  const anthropic = provider.protocol === 'anthropic';
  const data = await requestJson({
    method: 'GET',
    url: anthropic ? buildAnthropicModelsUrl(provider.baseUrl) : buildOpenAiModelsUrl(provider.baseUrl),
    headers: anthropic ? anthropicHeaders(apiKey) : openAiHeaders(apiKey),
    timeout,
  });
  const items = isRecord(data) && Array.isArray(data.data)
    ? data.data
    : isRecord(data) && Array.isArray(data.models)
      ? data.models
      : [];
  const models = [];
  for (const item of items) {
    const id = typeof item === 'string'
      ? item
      : isRecord(item) && typeof item.id === 'string'
        ? item.id
        : '';
    if (id && !models.includes(id)) models.push(id);
    if (models.length >= 80) break;
  }
  if (models.length === 0) throw new ModelError('models-unavailable');
  return models;
}
