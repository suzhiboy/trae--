import { knowledgeNodes } from '../data/knowledge';
import { parseFreeformAiResult, parseOcrResult, parseVariantList } from '../engine/freeformSchema';
import type { FreeformAiResult, FreeformVariantCandidate, OcrResult } from '../types';

export type FreeformFailureCode =
  | 'ai-not-configured'
  | 'timeout'
  | 'rate-limited'
  | 'auth-failed'
  | 'model-not-found'
  | 'bad-request'
  | 'vision-model-required'
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
}

const failureMessages: Record<FreeformFailureCode, string> = {
  'ai-not-configured': 'AI 服务未配置。内置 12 题仍可离线诊断；配置服务端 AI_API_KEY 与 AI_MODEL 后可使用任意题。',
  timeout: '模型服务超时，未生成结论。可以重试，或先用内置题。',
  'rate-limited': '模型服务限流，请稍后重试。',
  'auth-failed': '模型服务鉴权失败。请检查服务端密钥；页面不会显示密钥。',
  'model-not-found': '模型 ID 不存在或未开通。请检查服务端 AI_MODEL / AI_VISION_MODEL。',
  'bad-request': '模型服务拒绝了请求。请检查 AI_MODEL 是否为支持 JSON 输出的对话模型。',
  'vision-model-required': '当前模型不支持图片输入。请配置支持多模态的 AI_VISION_MODEL。',
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

  if (response.status === 503 || code === 'ai-not-configured') return failure('ai-not-configured');
  if (response.status === 429 || code === 'rate-limited') return failure('rate-limited', undefined, retryAfter);
  if (code === 'timeout') return failure('timeout');
  if (code === 'auth-failed') return failure('auth-failed');
  if (code === 'model-not-found') return failure('model-not-found');
  if (code === 'bad-request') return failure('bad-request');
  if (code === 'vision-model-required') return failure('vision-model-required');
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

/** 任意题诊断：只发文本，密钥永不出现在前端。 */
export async function requestFreeformDiagnosis(input: {
  question: string;
  finalAnswer: string;
  steps: string[];
}): Promise<FreeformDiagnosisResponse> {
  const posted = await postJson('/api/freeform-diagnose', {
    ...input,
    nodes: knowledgeNodes.map((node) => ({ id: node.id, label: node.label })),
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
}): Promise<VariantCandidateResponse> {
  const posted = await postJson('/api/freeform-variants', input, 30000);
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
export async function requestImageRecognition(file: File): Promise<OcrResponse> {
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

  const posted = await postJson('/api/recognize', { image }, 40000);
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

/** 首页状态条用：未配置时页面明确说明，不假装 AI 可用。 */
export async function checkAiHealth(): Promise<AiHealth> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) return { ai: false, vision: false };
    const payload: unknown = await response.json();
    const record = isRecord(payload) ? payload : {};
    return { ai: record.ai === true, vision: record.vision === true };
  } catch {
    return { ai: false, vision: false };
  }
}
