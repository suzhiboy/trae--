// 供应商注册表：只回答“这次请求用哪个供应商、哪个地址、哪个模型、哪把凭证”。
// 协议如何调用由 protocols.mjs 负责；这里不发起任何网络请求，也不保存用户 Key。
//
// 配置来源：
// 1. AI_PROVIDERS：管理员登记的供应商数组（JSON）。
// 2. 旧变量 AI_BASE_URL / AI_MODEL / AI_VISION_MODEL / AI_API_KEY / AI_PROVIDER_NAME：
//    自动生成一个默认供应商，保证旧部署升级后原样运行。
// 3. 内置的 BYOK 目录：火山方舟、DeepSeek、OpenAI、Anthropic，仅用于用户自带 Key。

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,119}$/;
const OVERRIDE_FIELDS = ['baseUrl', 'baseURL', 'apiBase', 'apiBaseUrl', 'endpoint', 'apiEndpoint'];

export const DEFAULT_VOLC_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
export const ANTHROPIC_VERSION = '2023-06-01';

export class ConfigError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'ConfigError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimmedString(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';
}

function normalizeModels(value) {
  if (!Array.isArray(value)) return [];
  const models = [];
  for (const item of value.slice(0, 20)) {
    const model = trimmedString(item, 120);
    if (model && MODEL_PATTERN.test(model) && !models.includes(model)) models.push(model);
  }
  return models;
}

function normalizeNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function providerLabel(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    if (host.includes('volces.com')) return '火山方舟';
    if (host.includes('openai.com')) return 'OpenAI';
    if (host.includes('dashscope')) return '阿里云百炼';
    if (host.includes('deepseek')) return 'DeepSeek';
    if (host.includes('anthropic')) return 'Anthropic (Claude)';
    return host;
  } catch {
    return 'AI 服务';
  }
}

/** 只接受 HTTPS；本机回环地址允许 HTTP，便于本地 mock 与开发联调。 */
export function normalizeBaseUrl(value) {
  const raw = trimmedString(value, 500);
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export function builtinProviders() {
  return [
    {
      id: 'volcengine',
      label: '火山方舟',
      protocol: 'openai',
      baseUrl: DEFAULT_VOLC_BASE_URL,
      textModels: [],
      visionModels: [],
      suggestedTextModels: [],
      suggestedVisionModels: [],
      apiKey: '',
      customKey: true,
      jsonMode: 'json_object',
      maxTokens: 3000,
      temperature: 0.1,
      default: false,
      source: 'builtin',
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      protocol: 'openai',
      baseUrl: 'https://api.deepseek.com/v1',
      textModels: [],
      visionModels: [],
      suggestedTextModels: ['deepseek-chat', 'deepseek-reasoner'],
      suggestedVisionModels: [],
      apiKey: '',
      customKey: true,
      jsonMode: 'json_object',
      maxTokens: 3000,
      temperature: 0.1,
      default: false,
      source: 'builtin',
    },
    {
      id: 'openai',
      label: 'OpenAI',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      textModels: [],
      visionModels: [],
      suggestedTextModels: ['gpt-4o-mini', 'gpt-4o'],
      suggestedVisionModels: ['gpt-4o-mini', 'gpt-4o'],
      apiKey: '',
      customKey: true,
      jsonMode: 'json_object',
      maxTokens: 3000,
      temperature: 0.1,
      default: false,
      source: 'builtin',
    },
    {
      id: 'anthropic',
      label: 'Anthropic (Claude)',
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      textModels: [],
      visionModels: [],
      suggestedTextModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
      suggestedVisionModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
      apiKey: '',
      customKey: true,
      jsonMode: 'none',
      maxTokens: 3000,
      temperature: 0.1,
      default: false,
      source: 'builtin',
    },
  ];
}

function parseProviderEntry(raw, index, warnings) {
  if (!isRecord(raw)) {
    warnings.push(`AI_PROVIDERS[${index}] 不是对象，已忽略`);
    return null;
  }
  const id = trimmedString(raw.id, 32);
  if (!ID_PATTERN.test(id)) {
    warnings.push(`AI_PROVIDERS[${index}] 的 id 不合法（需小写字母、数字、- 或 _），已忽略`);
    return null;
  }
  const protocol = raw.protocol === 'anthropic' || raw.protocol === 'openai' ? raw.protocol : null;
  if (!protocol) {
    warnings.push(`AI_PROVIDERS[${index}] 的 protocol 必须是 openai 或 anthropic，已忽略`);
    return null;
  }
  const baseUrl = normalizeBaseUrl(raw.baseUrl);
  if (!baseUrl) {
    warnings.push(`AI_PROVIDERS[${index}] 的 baseUrl 不合法（必须是 HTTPS，或本机回环 HTTP），已忽略`);
    return null;
  }

  const textModels = normalizeModels(raw.textModels);
  const singularText = trimmedString(raw.model, 120);
  if (singularText && MODEL_PATTERN.test(singularText) && !textModels.includes(singularText)) {
    textModels.unshift(singularText);
  }
  const visionModels = normalizeModels(raw.visionModels);
  const singularVision = trimmedString(raw.visionModel, 120);
  if (singularVision && MODEL_PATTERN.test(singularVision) && !visionModels.includes(singularVision)) {
    visionModels.unshift(singularVision);
  }

  const maxTokens = normalizeNumber(raw.maxTokens, 16, 16000) ?? 3000;
  const temperature = raw.temperature === null ? null : normalizeNumber(raw.temperature, 0, 2) ?? 0.1;

  return {
    id,
    label: trimmedString(raw.label, 40) || id,
    protocol,
    baseUrl,
    textModels,
    visionModels,
    suggestedTextModels: normalizeModels(raw.suggestedTextModels),
    suggestedVisionModels: normalizeModels(raw.suggestedVisionModels),
    apiKey: trimmedString(raw.apiKey, 512),
    customKey: raw.customKey !== false,
    // 中转站默认不发送 response_format，管理员确认支持后再显式打开。
    jsonMode: protocol === 'anthropic' ? 'none' : raw.jsonMode === 'json_object' ? 'json_object' : 'none',
    maxTokens,
    temperature,
    default: raw.default === true,
    source: 'config',
  };
}

function legacyProvider(env, warnings) {
  const model = trimmedString(env.AI_MODEL, 120);
  const apiKey = trimmedString(env.AI_API_KEY, 512);
  if (!model && !apiKey) return null;

  const baseUrl = normalizeBaseUrl(env.AI_BASE_URL || DEFAULT_VOLC_BASE_URL);
  if (!baseUrl) {
    warnings.push('旧变量 AI_BASE_URL 不合法，已忽略默认供应商');
    return null;
  }
  const protocol = env.AI_PROTOCOL === 'anthropic' ? 'anthropic' : 'openai';
  const vision = trimmedString(env.AI_VISION_MODEL, 120) || model;
  return {
    id: ID_PATTERN.test(trimmedString(env.AI_PROVIDER_ID, 32)) ? trimmedString(env.AI_PROVIDER_ID, 32) : 'default',
    label: trimmedString(env.AI_PROVIDER_NAME, 40) || providerLabel(baseUrl),
    protocol,
    baseUrl,
    textModels: model ? [model] : [],
    visionModels: vision ? [vision] : [],
    suggestedTextModels: [],
    suggestedVisionModels: [],
    apiKey,
    customKey: true,
    jsonMode: protocol === 'anthropic' ? 'none' : env.AI_JSON_MODE === 'none' ? 'none' : 'json_object',
    maxTokens: 3000,
    temperature: 0.1,
    default: true,
    source: 'legacy',
  };
}

function parseConfiguredProviders(env, warnings) {
  const raw = trimmedString(env.AI_PROVIDERS, 20000);
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push('AI_PROVIDERS 不是合法 JSON，已忽略');
    return [];
  }
  if (!Array.isArray(parsed)) {
    warnings.push('AI_PROVIDERS 必须是数组，已忽略');
    return [];
  }
  const providers = [];
  parsed.forEach((item, index) => {
    const provider = parseProviderEntry(item, index, warnings);
    if (provider) providers.push(provider);
  });
  return providers;
}

/**
 * 启动时解析一次，之后只读。每个请求从 byId 里取自己的配置对象，
 * 不修改进程级变量，因此并发请求不会串供应商或串凭证。
 */
export function resolveProviderRegistry(env = process.env) {
  const warnings = [];
  const configured = parseConfiguredProviders(env, warnings);
  const legacy = legacyProvider(env, warnings);
  const providers = [];
  const ids = new Set();
  const endpoints = new Set();

  const push = (provider) => {
    if (ids.has(provider.id)) {
      warnings.push(`供应商 id 重复，已忽略：${provider.id}`);
      return;
    }
    const endpoint = `${provider.protocol}|${provider.baseUrl}`;
    if (endpoints.has(endpoint)) {
      warnings.push(`供应商地址与已有项重复，已忽略：${provider.id}`);
      return;
    }
    ids.add(provider.id);
    endpoints.add(endpoint);
    providers.push(provider);
  };

  for (const provider of configured) push(provider);
  if (legacy) push(legacy);
  for (const provider of builtinProviders()) {
    if (ids.has(provider.id) || endpoints.has(`${provider.protocol}|${provider.baseUrl}`)) continue;
    push(provider);
  }

  const defaultProvider = providers.find((provider) => provider.default)
    || providers.find((provider) => provider.apiKey && provider.textModels.length > 0)
    || providers[0]
    || null;
  for (const provider of providers) {
    provider.default = defaultProvider ? provider.id === defaultProvider.id : false;
  }

  return {
    providers,
    byId: new Map(providers.map((provider) => [provider.id, provider])),
    defaultProviderId: defaultProvider?.id ?? '',
    warnings,
  };
}

function publicProvider(provider, defaultProviderId) {
  let domain = '';
  let basePath = '';
  try {
    const url = new URL(provider.baseUrl);
    domain = url.host;
    basePath = url.pathname.replace(/\/+$/, '');
  } catch {
    // 配置已在解析时校验，这里只做兜底。
  }
  return {
    id: provider.id,
    label: provider.label,
    protocol: provider.protocol,
    domain,
    basePath,
    textModels: [...provider.textModels],
    visionModels: [...provider.visionModels],
    suggestedTextModels: [...provider.suggestedTextModels],
    suggestedVisionModels: [...provider.suggestedVisionModels],
    siteKey: Boolean(provider.apiKey),
    customKey: provider.customKey !== false,
    isDefault: provider.id === defaultProviderId,
  };
}

/** /api/health 的公开部分：不含任何 Key，也不含用户凭证。 */
export function buildHealth(registry) {
  const defaultProvider = registry.byId.get(registry.defaultProviderId) ?? null;
  const model = defaultProvider?.textModels[0] ?? null;
  const visionModel = defaultProvider?.visionModels[0] ?? null;
  return {
    ok: true,
    ai: Boolean(defaultProvider?.apiKey && model),
    model,
    visionModel,
    vision: Boolean(visionModel),
    provider: defaultProvider?.label || 'AI 服务',
    // 保留旧语义：默认供应商是否已有模型，旧前端的自定义模式依赖它。
    customKeyReady: Boolean(model),
    customKeyAvailable: registry.providers.some((provider) => provider.customKey !== false),
    defaultProviderId: registry.defaultProviderId,
    providers: registry.providers.map((provider) => publicProvider(provider, registry.defaultProviderId)),
  };
}

function hasOverrideField(payload) {
  return OVERRIDE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

/**
 * 解析单次请求的供应商与凭证。
 * kind: 'text' 文本诊断 | 'vision' 图片识别 | 'models' 拉取模型列表。
 * 站点模式的地址、模型和 Key 全部来自服务端配置，客户端提交的模型会被忽略。
 */
export function resolveRequestConfig(payload, { registry, kind = 'text' }) {
  if (!isRecord(payload)) throw new ConfigError('invalid-request');
  if (hasOverrideField(payload)) throw new ConfigError('provider-override-rejected');

  const rawMode = payload.credentialMode;
  if (rawMode !== undefined && rawMode !== 'site' && rawMode !== 'custom') {
    throw new ConfigError('invalid-request');
  }
  const mode = rawMode === 'custom' ? 'custom' : 'site';
  const requestedId = trimmedString(payload.providerId, 32);
  const provider = requestedId
    ? registry.byId.get(requestedId)
    : registry.byId.get(registry.defaultProviderId);
  if (!provider) throw new ConfigError('unknown-provider');
  if (mode === 'custom' && provider.customKey === false) throw new ConfigError('custom-key-not-allowed', 403);

  let apiKey = '';
  if (mode === 'custom') {
    apiKey = trimmedString(payload.apiKey, 512);
    if (!apiKey) throw new ConfigError('custom-key-required');
  } else {
    apiKey = provider.apiKey;
    if (!apiKey) throw new ConfigError('ai-not-configured', 503);
  }

  let model = '';
  if (kind === 'models') {
    model = provider.textModels[0] || '';
  } else if (mode === 'site') {
    model = kind === 'vision'
      ? provider.visionModels[0] || provider.textModels[0] || ''
      : provider.textModels[0] || '';
    if (!model) {
      throw new ConfigError(kind === 'vision' ? 'vision-model-required' : 'ai-model-not-configured', 400);
    }
  } else {
    if (kind === 'vision') {
      model = trimmedString(payload.visionModel, 120)
        || trimmedString(payload.model, 120)
        || provider.visionModels[0]
        || provider.textModels[0]
        || '';
      if (!model) throw new ConfigError('vision-model-required', 400);
    } else {
      model = trimmedString(payload.model, 120) || provider.textModels[0] || '';
      if (!model) throw new ConfigError('ai-model-not-configured', 400);
    }
  }
  if (model && !MODEL_PATTERN.test(model)) throw new ConfigError('invalid-model');

  return {
    mode,
    kind,
    provider,
    providerId: provider.id,
    providerLabel: provider.label,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey,
    model,
    jsonMode: provider.jsonMode,
    maxTokens: provider.maxTokens,
    temperature: provider.temperature,
  };
}
