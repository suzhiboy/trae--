import { knowledgeNodes } from '../data/knowledge';
import { parseFreeformAiResult, parseOcrResult, parseVariantList } from '../engine/freeformSchema';
import type {
  AiCredential,
  AiProviderInfo,
  AiRequestCredential,
  FreeformAiResult,
  FreeformVariantCandidate,
  OcrResult,
} from '../types';
import { credentialPayload } from './aiCredential';

export type FreeformFailureCode =
  | 'ai-not-configured'
  | 'ai-model-not-configured'
  | 'custom-key-required'
  | 'custom-key-invalid'
  | 'custom-key-not-allowed'
  | 'unknown-provider'
  | 'provider-override-rejected'
  | 'invalid-model'
  | 'timeout'
  | 'rate-limited'
  | 'auth-failed'
  | 'model-not-found'
  | 'bad-request'
  | 'vision-model-required'
  | 'truncated'
  | 'upstream-redirect'
  | 'invalid-response'
  | 'empty-content'
  | 'upstream'
  | 'network'
  | 'invalid-request'
  | 'image-too-large'
  | 'invalid-image'
  | 'insufficient-evidence'
  | 'invalid-schema';

export interface FreeformFailure {
  ok: false;
  code: FreeformFailureCode;
  message: string;
  retryAfter?: number;
}

export type FreeformDiagnosisResponse = { ok: true; result: FreeformAiResult } | FreeformFailure;
export type OcrResponse = { ok: true; result: OcrResult } | FreeformFailure;
export type VariantCandidateResponse = { ok: true; variants: FreeformVariantCandidate[] } | FreeformFailure;

export interface AiHealth {
  ai: boolean;
  vision: boolean;
  provider?: string | null;
  model?: string | null;
  visionModel?: string | null;
  customKeyReady?: boolean;
  customKeyAvailable?: boolean;
  defaultProviderId?: string;
  providers?: AiProviderInfo[];
}

const failureMessages: Record<FreeformFailureCode, string> = {
  'ai-not-configured': '站点没有配置默认 AI Key。可以在「AI 设置」里使用自己的 Key；内置 12 题仍可离线诊断。',
  'ai-model-not-configured': '站点尚未配置模型 ID，无法使用自定义 Key。请管理员设置服务端 AI_MODEL 后再试。',
  'custom-key-required': '已选择自定义 Key，但还没有启用。请先在「AI 设置」里填写并启用，或切回站点配置。',
  'custom-key-invalid': '自定义 API Key 无效或没有权限。请检查 Key 后重新启用；系统不会自动切换到站点账户。',
  'custom-key-not-allowed': '该供应商不允许使用自定义 Key。请选择其它供应商，或使用站点配置。',
  'unknown-provider': '所选供应商未在服务端登记。请刷新页面；如果仍然失败，请联系管理员检查 AI_PROVIDERS。',
  'provider-override-rejected': '请求包含了客户端指定的服务地址，已被拒绝。地址只能由服务端配置决定。',
  'invalid-model': '模型 ID 格式不合法。请填写服务商控制台里的模型名称、接入点 ID 或中转站别名。',
  timeout: '模型服务超时，未生成结论。可以重试，或先用内置题。',
  'rate-limited': '模型服务限流，请稍后重试。',
  'auth-failed': '站点 AI 鉴权失败。请检查服务端密钥；页面不会显示密钥。',
  'model-not-found': '模型不可用或 ID 不存在。请检查「AI 设置」中的模型 ID，或服务端配置的模型范围。',
  'bad-request': '模型服务拒绝了请求。请检查模型 ID 与协议是否匹配。',
  'vision-model-required': '当前模型不支持图片输入。请在「AI 设置」填写支持图片的模型 ID，或改用支持图片的供应商；文本诊断不受影响。',
  truncated: '模型响应被截断（达到最大输出长度），未生成结论。请缩短步骤或重试。',
  'upstream-redirect': '上游返回了跳转。为避免凭证被转发到其他域名，请求已中止。请检查供应商 Base URL。',
  'invalid-response': '供应商返回了无法解析的响应，未生成结论。',
  'empty-content': '供应商返回了空响应，未生成结论。',
  upstream: '模型服务暂时不可用，请稍后重试。',
  network: '网络中断，请求没有发送成功。请检查连接后重试。',
  'invalid-request': '题目、答案或步骤不符合要求，请检查后重试。',
  'image-too-large': '图片超过大小限制，请压缩或重新拍照。',
  'invalid-image': '请上传 JPG、PNG 或 WebP 图片。',
  'insufficient-evidence': '证据不足：模型没有给出可核验的结论。请补充步骤、检查题目是否完整，或换一道题。',
  'invalid-schema': '模型返回的结构不完整，未生成结论。请重试。',
};

const validNodeIds = new Set(knowledgeNodes.map((node) => node.id));

function failure(code: FreeformFailureCode, message?: string, retryAfter?: number): FreeformFailure {
  const base = message || failureMessages[code];
  const withRetry = code === 'rate-limited' && retryAfter
    ? `${base}（约 ${retryAfter} 秒后可重试）`
    : base;
  return { ok: false, code, message: withRetry, ...(retryAfter ? { retryAfter } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function payloadText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type PostResult = { response: Response; payload: unknown } | FreeformFailure;

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

function isFailure(value: PostResult): value is FreeformFailure {
  return 'ok' in value && value.ok === false;
}

function mapHttpFailure(response: Response, payload: unknown): FreeformFailure {
  const record = isRecord(payload) ? payload : {};
  const code = payloadText(record.error);
  const retryAfter = Number(record.retryAfter) || undefined;

  if (code === 'custom-key-invalid') return failure('custom-key-invalid');
  if (code === 'custom-key-required') return failure('custom-key-required');
  if (code === 'custom-key-not-allowed') return failure('custom-key-not-allowed');
  if (code === 'unknown-provider') return failure('unknown-provider');
  if (code === 'provider-override-rejected') return failure('provider-override-rejected');
  if (code === 'invalid-model') return failure('invalid-model');
  if (code === 'ai-model-not-configured') return failure('ai-model-not-configured');
  if (response.status === 503 || code === 'ai-not-configured') return failure('ai-not-configured');
  if (response.status === 429 || code === 'rate-limited') return failure('rate-limited', undefined, retryAfter);
  if (code === 'timeout') return failure('timeout');
  if (code === 'auth-failed') return failure('auth-failed');
  if (code === 'model-not-found') return failure('model-not-found');
  if (code === 'bad-request') return failure('bad-request');
  if (code === 'vision-model-required' || code === 'unsupported-image') return failure('vision-model-required');
  if (code === 'truncated') return failure('truncated');
  if (code === 'upstream-redirect') return failure('upstream-redirect');
  if (code === 'invalid-response') return failure('invalid-response');
  if (code === 'empty-content') return failure('empty-content');
  if (response.status === 413) return failure('image-too-large');
  if (response.status === 400) return failure('invalid-request');
  if (response.status === 404) {
    return failure(
      'ai-not-configured',
      '没有检测到 API 服务，线上站点可能仍是纯静态部署。内置 12 题仍可使用。',
    );
  }
  return failure('upstream');
}

/** 任意题诊断：只发文本，密钥永不出现在 URL 或前端日志。 */
export async function requestFreeformDiagnosis(input: {
  question: string;
  finalAnswer: string;
  steps: string[];
}, credential: AiCredential | AiRequestCredential): Promise<FreeformDiagnosisResponse> {
  const posted = await postJson('/api/freeform-diagnose', {
    ...input,
    nodes: knowledgeNodes.map((node) => ({ id: node.id, label: node.label })),
    ...credentialPayload(credential),
  }, 35000);
  if (isFailure(posted)) return posted;

  const { response, payload } = posted;
  const record = isRecord(payload) ? payload : {};

  if (response.ok && record.status === 'insufficient-evidence') {
    return failure('insufficient-evidence', payloadText(record.message) || undefined);
  }
  if (!response.ok) return mapHttpFailure(response, payload);

  const result = parseFreeformAiResult(record.result, validNodeIds);
  if (!result) return failure('invalid-schema');
  return { ok: true, result };
}

/** 补充生成同错因变式候选；候选仍要经过本地复算才会展示。 */
export async function requestVariantCandidates(input: {
  question: string;
  errorReason: string;
  knowledgePoint: string;
  count: number;
  excludeStems: string[];
}, credential: AiCredential | AiRequestCredential): Promise<VariantCandidateResponse> {
  const posted = await postJson('/api/freeform-variants', {
    ...input,
    ...credentialPayload(credential),
  }, 30000);
  if (isFailure(posted)) return posted;

  const { response, payload } = posted;
  const record = isRecord(payload) ? payload : {};

  if (response.ok && record.status === 'insufficient-evidence') {
    return failure(
      'insufficient-evidence',
      payloadText(record.message) || '模型没有生成可用于独立复算的变式。',
    );
  }
  if (!response.ok) return mapHttpFailure(response, payload);

  const result = isRecord(record.result) ? record.result : {};
  const variants = parseVariantList(result.variants, 1, 3);
  if (!variants) {
    return failure('invalid-schema', '变式候选结构不合格，未生成可展示的题目。');
  }
  return { ok: true, variants };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-load-failed'));
    };
    image.src = url;
  });
}

/** 压缩到最长边 1600px 的 JPEG，避免把超大原图发送到服务端。 */
async function compressImage(file: File): Promise<string> {
  const image = await loadImage(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas-unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** 图片识别：返回可编辑的题目、答案、步骤，由学生确认后再诊断。 */
export async function requestImageRecognition(
  file: File,
  credential: AiCredential | AiRequestCredential,
): Promise<OcrResponse> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return failure('invalid-image');
  }
  if (file.size > 12 * 1024 * 1024) return failure('image-too-large');

  let image: string;
  try {
    image = await compressImage(file);
  } catch {
    return failure('invalid-image', '图片读取失败，请换一张 JPG、PNG 或 WebP 图片。');
  }
  if (image.length > 6.4 * 1024 * 1024) return failure('image-too-large');

  const posted = await postJson('/api/recognize', {
    image,
    ...credentialPayload(credential),
  }, 40000);
  if (isFailure(posted)) return posted;

  const { response, payload } = posted;
  const record = isRecord(payload) ? payload : {};
  if (response.ok && record.status === 'insufficient-evidence') {
    return failure('insufficient-evidence', payloadText(record.message) || '图片识别结果不完整，请手动填写。');
  }
  if (!response.ok) return mapHttpFailure(response, payload);

  const result = parseOcrResult(record.result);
  if (!result) return failure('invalid-schema', '图片识别结果不完整，请手动填写题目和步骤。');
  return { ok: true, result };
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 20)
    : [];
}

/** 只读取公开字段；即使服务端误传 Key，也不会进入前端状态。 */
function parseProviders(value: unknown): AiProviderInfo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const providers: AiProviderInfo[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = payloadText(item.id);
    const label = payloadText(item.label);
    const protocol = item.protocol === 'anthropic' ? 'anthropic' : item.protocol === 'openai' ? 'openai' : null;
    if (!id || !label || !protocol) continue;
    providers.push({
      id,
      label,
      protocol,
      domain: payloadText(item.domain),
      basePath: payloadText(item.basePath),
      textModels: stringItems(item.textModels),
      visionModels: stringItems(item.visionModels),
      suggestedTextModels: stringItems(item.suggestedTextModels),
      suggestedVisionModels: stringItems(item.suggestedVisionModels),
      siteKey: item.siteKey === true,
      customKey: item.customKey === true,
      isDefault: item.isDefault === true,
    });
  }
  return providers.length > 0 ? providers : undefined;
}

/** 首页状态条用：未配置时页面明确说明，不假装 AI 可用。 */
export async function checkAiHealth(): Promise<AiHealth> {
  const unavailable: AiHealth = {
    ai: false,
    vision: false,
    provider: null,
    model: null,
    visionModel: null,
    customKeyReady: false,
  };
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) return unavailable;
    const payload: unknown = await response.json();
    const record = isRecord(payload) ? payload : {};
    const health: AiHealth = {
      ai: record.ai === true,
      vision: record.vision === true,
      provider: typeof record.provider === 'string' ? record.provider : null,
      model: typeof record.model === 'string' ? record.model : null,
      visionModel: typeof record.visionModel === 'string' ? record.visionModel : null,
      customKeyReady: record.customKeyReady === true,
    };
    const providers = parseProviders(record.providers);
    if (providers) {
      health.providers = providers;
      if (typeof record.customKeyAvailable === 'boolean') health.customKeyAvailable = record.customKeyAvailable;
      if (typeof record.defaultProviderId === 'string') health.defaultProviderId = record.defaultProviderId;
    }
    return health;
  } catch {
    return unavailable;
  }
}
