import { credentialPayload } from './aiCredential';
import type { AiCredential, AiProviderInfo, AiRequestCredential } from '../types';
import type { AiHealth } from './freeformDiagnosis';

export type AiProviderFailureCode =
  | 'custom-key-required'
  | 'custom-key-invalid'
  | 'custom-key-not-allowed'
  | 'unknown-provider'
  | 'ai-not-configured'
  | 'ai-model-not-configured'
  | 'invalid-request'
  | 'model-not-found'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'models-unavailable'
  | 'upstream';

export interface AiProviderFailure {
  ok: false;
  code: AiProviderFailureCode;
  message: string;
  retryAfter?: number;
}

export interface AiTestSuccess {
  ok: true;
  latencyMs: number;
  reply: string;
  providerId: string;
  model: string;
}

export interface AiModelsSuccess {
  ok: true;
  models: string[];
}

export type AiTestResponse = AiTestSuccess | AiProviderFailure;
export type AiModelsResponse = AiModelsSuccess | AiProviderFailure;

const failureMessages: Record<AiProviderFailureCode, string> = {
  'custom-key-required': '还没有填写并启用自定义 Key。',
  'custom-key-invalid': '自定义 API Key 无效或没有权限。请检查 Key 后重新启用。',
  'custom-key-not-allowed': '该供应商不允许使用自定义 Key。',
  'unknown-provider': '所选供应商未在服务端登记，请刷新页面或联系管理员。',
  'ai-not-configured': '站点没有为该校验点配置默认 Key。可以改用「使用自己的 Key」。',
  'ai-model-not-configured': '还没有填写模型 ID。',
  'invalid-request': '请求参数不符合要求，请检查模型 ID 后重试。',
  'model-not-found': '模型不可用或 ID 不存在，请检查模型 ID。',
  'rate-limited': '模型服务限流，请稍后重试。',
  timeout: '模型服务超时，请稍后重试。',
  network: '网络中断，请求没有发送成功。',
  'models-unavailable': '模型列表接口不可用，请手动填写模型 ID。',
  upstream: '模型服务暂时不可用，请稍后重试。',
};

function failure(code: AiProviderFailureCode, message?: string, retryAfter?: number): AiProviderFailure {
  const base = message || failureMessages[code];
  const withRetry = code === 'rate-limited' && retryAfter ? `${base}（约 ${retryAfter} 秒后可重试）` : base;
  return { ok: false, code, message: withRetry, ...(retryAfter ? { retryAfter } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type PostResult = { response: Response; payload: unknown } | AiProviderFailure;

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<PostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { response, payload };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    return failure(name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

function isFailure(value: PostResult): value is AiProviderFailure {
  return 'ok' in value && value.ok === false;
}

function mapFailure(response: Response, payload: unknown): AiProviderFailure {
  const record = isRecord(payload) ? payload : {};
  const code = text(record.error);
  const retryAfter = Number(record.retryAfter) || undefined;
  const message = text(record.message);

  if (code === 'custom-key-invalid') return failure('custom-key-invalid', message || undefined);
  if (code === 'custom-key-required') return failure('custom-key-required');
  if (code === 'custom-key-not-allowed') return failure('custom-key-not-allowed');
  if (code === 'unknown-provider') return failure('unknown-provider');
  if (code === 'ai-model-not-configured') return failure('ai-model-not-configured');
  if (response.status === 503 || code === 'ai-not-configured') return failure('ai-not-configured');
  if (response.status === 429 || code === 'rate-limited') {
    return failure('rate-limited', message || undefined, retryAfter);
  }
  if (code === 'timeout') return failure('timeout');
  if (code === 'model-not-found') return failure('model-not-found');
  if (code === 'invalid-model' || response.status === 400) return failure('invalid-request');
  if (response.status === 401 || response.status === 403) return failure('custom-key-invalid');
  return failure('upstream');
}

/** 用户主动点击「测试连接」时才调用；打开设置或切换下拉不会触发。 */
export async function testAiConnection(
  credential: AiCredential | AiRequestCredential,
): Promise<AiTestResponse> {
  const posted = await postJson('/api/ai/test', credentialPayload(credential), 22000);
  if (isFailure(posted)) return posted;

  const { response, payload } = posted;
  const record = isRecord(payload) ? payload : {};
  if (!response.ok || record.ok !== true) return mapFailure(response, payload);

  return {
    ok: true,
    latencyMs: Number(record.latencyMs) || 0,
    reply: text(record.reply) || 'OK',
    providerId: text(record.providerId),
    model: text(record.model),
  };
}

/** 用户主动点击「读取模型列表」时才调用；失败时前端保留手填。 */
export async function fetchProviderModels(
  credential: AiCredential | AiRequestCredential,
): Promise<AiModelsResponse> {
  const posted = await postJson('/api/ai/models', credentialPayload(credential), 14000);
  if (isFailure(posted)) return posted;

  const { response, payload } = posted;
  const record = isRecord(payload) ? payload : {};
  if (!response.ok) return mapFailure(response, payload);

  const models = Array.isArray(record.models)
    ? record.models.filter((item): item is string => typeof item === 'string').slice(0, 80)
    : [];
  if (record.available !== true || models.length === 0) {
    return failure('models-unavailable', text(record.message) || undefined);
  }
  return { ok: true, models };
}

/** 新服务端返回公开供应商目录；旧服务端没有 providers 时退化成单一站点供应商。 */
export function providersFromHealth(health: AiHealth | null): AiProviderInfo[] {
  if (!health) return [];
  if (health.providers && health.providers.length > 0) return health.providers;
  return [{
    id: 'default',
    label: health.provider || '站点配置',
    protocol: 'openai',
    domain: '',
    basePath: '',
    textModels: health.model ? [health.model] : [],
    visionModels: health.visionModel ? [health.visionModel] : [],
    suggestedTextModels: [],
    suggestedVisionModels: [],
    siteKey: health.ai === true,
    customKey: health.customKeyReady === true,
    isDefault: true,
  }];
}
