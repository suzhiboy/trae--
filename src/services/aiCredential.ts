import { useSyncExternalStore } from 'react';
import type {
  AiCredential,
  AiCredentialMode,
  AiProviderInfo,
  AiRequestCredential,
} from '../types';

/**
 * 自定义 API Key 的唯一存放点：模块内存。
 * 不写 localStorage / sessionStorage / Cookie / URL，刷新或关闭页面即清除。
 * revision 在每次设置变化时递增，用来丢弃切换供应商后才返回的旧请求结果。
 */

export type AiSettingsStatus = 'idle' | 'connected' | 'invalid' | 'error';

export interface AiSettingsState {
  mode: AiCredentialMode;
  providerId: string;
  textModel: string;
  visionModel: string;
  key: string;
  enabled: boolean;
  status: AiSettingsStatus;
  statusMessage: string;
  revision: number;
}

export const initialAiSettingsState: AiSettingsState = {
  mode: 'site',
  providerId: '',
  textModel: '',
  visionModel: '',
  key: '',
  enabled: false,
  status: 'idle',
  statusMessage: '',
  revision: 0,
};

let state: AiSettingsState = initialAiSettingsState;
const listeners = new Set<() => void>();

function setState(next: AiSettingsState): void {
  state = next;
  for (const listener of listeners) listener();
}

function update(patch: Partial<Omit<AiSettingsState, 'revision'>>): void {
  setState({ ...state, ...patch, revision: state.revision + 1 });
}

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAiSettings(): AiSettingsState {
  return state;
}

/** 兼容旧调用：任意 AI 请求前取凭证；自定义模式未启用时返回 null。 */
export function activeAiCredential(): AiCredential | null {
  if (state.mode === 'site') return { mode: 'site' };
  const key = state.key.trim();
  return state.enabled && key ? { mode: 'custom', apiKey: key } : null;
}

/**
 * 新请求使用的完整快照：供应商、文本模型、图片模型和 revision。
 * 自定义模式未启用时返回 null，调用方不得改用站点 Key。
 */
export function activeAiRequest(): AiRequestCredential | null {
  const base = {
    ...(state.providerId ? { providerId: state.providerId } : {}),
    ...(state.textModel ? { textModel: state.textModel } : {}),
    ...(state.visionModel ? { visionModel: state.visionModel } : {}),
    revision: state.revision,
  };
  if (state.mode === 'site') return { mode: 'site', ...base };
  const key = state.key.trim();
  return state.enabled && key ? { mode: 'custom', apiKey: key, ...base } : null;
}

/** Key 只放进 HTTPS 请求体，不进入 URL；站点模式不发送模型，避免客户端改变服务端配置。 */
export function credentialPayload(credential: AiCredential | AiRequestCredential): {
  credentialMode: AiCredentialMode;
  providerId?: string;
  apiKey?: string;
  model?: string;
  visionModel?: string;
} {
  if (credential.mode === 'site') {
    return {
      credentialMode: 'site',
      ...(credential.providerId ? { providerId: credential.providerId } : {}),
    };
  }
  return {
    credentialMode: 'custom',
    ...(credential.providerId ? { providerId: credential.providerId } : {}),
    apiKey: credential.apiKey,
    ...(credential.textModel ? { model: credential.textModel } : {}),
    ...(credential.visionModel ? { visionModel: credential.visionModel } : {}),
  };
}

const localCodes = new Set([
  'invalid-request',
  'image-too-large',
  'invalid-image',
  'provider-override-rejected',
  'unknown-provider',
  'custom-key-required',
  'ai-not-configured',
  'ai-model-not-configured',
  'invalid-model',
]);
const respondedCodes = new Set([
  'insufficient-evidence',
  'invalid-schema',
  'invalid-json',
  'truncated',
  'empty-content',
]);

function matchesCurrent(credential: AiCredential | AiRequestCredential): boolean {
  if (credential.revision !== undefined && credential.revision !== state.revision) return false;
  if (credential.providerId && credential.providerId !== state.providerId) return false;
  return true;
}

/** 只有真实 AI 请求成功后才调用；旧 revision 的结果不会标记新设置。 */
export function recordAiSuccess(credential: AiCredential | AiRequestCredential): void {
  if (!matchesCurrent(credential)) return;
  if (credential.mode === 'site') {
    // 旧测试与旧调用不带 revision，保持“不改变设置状态”的旧语义。
    if (credential.revision === undefined || state.mode !== 'site') return;
    setState({
      ...state,
      status: 'connected',
      statusMessage: '站点供应商已实际响应。',
    });
    return;
  }
  if (state.mode !== 'custom' || !state.enabled) return;
  setState({
    ...state,
    status: 'connected',
    statusMessage: '连接成功：服务商已实际响应。',
  });
}

/** 把一次请求的结果映射到设置面板状态；不记录 Key 本身。 */
export function recordAiFailure(
  credential: AiCredential | AiRequestCredential,
  code: string,
  message: string,
): void {
  if (!matchesCurrent(credential)) return;

  if (credential.mode === 'site') {
    if (credential.revision === undefined || state.mode !== 'site' || localCodes.has(code)) return;
    setState({
      ...state,
      status: 'error',
      statusMessage: message,
    });
    return;
  }

  if (state.mode !== 'custom' || !state.enabled || localCodes.has(code)) return;
  if (code === 'custom-key-invalid') {
    setState({ ...state, status: 'invalid', statusMessage: message });
    return;
  }
  // 服务商已经返回响应，只是内容不合格；Key 本身是通的。
  if (respondedCodes.has(code)) {
    setState({ ...state, status: 'connected', statusMessage: '连接成功：服务商已实际响应。' });
    return;
  }
  markAiError(message);
}

export function selectAiMode(mode: AiCredentialMode): void {
  if (mode === 'site') {
    setState({
      ...initialAiSettingsState,
      providerId: state.providerId,
      revision: state.revision + 1,
    });
    return;
  }
  setState({
    ...state,
    mode: 'custom',
    key: state.mode === 'custom' ? state.key : '',
    enabled: state.mode === 'custom' ? state.enabled : false,
    status: 'idle',
    statusMessage: '',
    revision: state.revision + 1,
  });
}

/** 切换供应商时清空旧 Key，避免把 A 的 Key 发给 B。 */
export function selectAiProvider(provider: AiProviderInfo): void {
  if (provider.id === state.providerId) return;
  setState({
    ...state,
    providerId: provider.id,
    textModel: provider.textModels[0] ?? provider.suggestedTextModels[0] ?? '',
    visionModel: provider.visionModels[0] ?? provider.suggestedVisionModels[0] ?? '',
    key: '',
    enabled: false,
    status: 'idle',
    statusMessage: '',
    revision: state.revision + 1,
  });
}

/** 健康接口先返回、后打开设置时，补一个可用的默认供应商；不会覆盖用户当前选择。 */
export function syncAiProviders(providers: AiProviderInfo[], defaultProviderId?: string): void {
  if (providers.length === 0) return;
  if (state.providerId && providers.some((provider) => provider.id === state.providerId)) return;
  const pick = providers.find((provider) => provider.id === defaultProviderId)
    ?? providers.find((provider) => provider.isDefault)
    ?? providers[0];
  setState({
    ...state,
    providerId: pick.id,
    textModel: pick.textModels[0] ?? pick.suggestedTextModels[0] ?? '',
    visionModel: pick.visionModels[0] ?? pick.suggestedVisionModels[0] ?? '',
    key: '',
    enabled: false,
    status: 'idle',
    statusMessage: '',
    revision: state.revision + 1,
  });
}

export function editAiKey(key: string): void {
  update({
    mode: 'custom',
    key,
    enabled: false,
    status: 'idle',
    statusMessage: '',
  });
}

/** 模型 ID 可手填；任何修改都会让“已启用/已连接”状态失效。 */
export function editAiModel(textModel: string): void {
  update({
    mode: 'custom',
    textModel,
    enabled: false,
    status: 'idle',
    statusMessage: '',
  });
}

export function editAiVisionModel(visionModel: string): void {
  update({
    mode: 'custom',
    visionModel,
    enabled: false,
    status: 'idle',
    statusMessage: '',
  });
}

/** 点击「启用」只表示设置生效，不代表服务商已响应。 */
export function enableAiKey(): void {
  const key = state.key.trim();
  if (!key) return;
  update({
    mode: 'custom',
    key,
    enabled: true,
    status: 'idle',
    statusMessage: '已启用，尚未验证。',
  });
}

export function clearAiKey(): void {
  setState(initialAiSettingsState);
}

/** 只有真实 AI 请求成功后才调用。 */
export function markAiConnected(): void {
  if (state.mode !== 'custom' || !state.enabled) return;
  setState({
    ...state,
    status: 'connected',
    statusMessage: '连接成功：服务商已实际响应。',
  });
}

/** 自定义 Key 被服务商拒绝；不自动回退站点账户。 */
export function markAiInvalid(message = '自定义 API Key 无效或没有权限。'): void {
  if (state.mode !== 'custom' || !state.enabled) return;
  setState({
    ...state,
    status: 'invalid',
    statusMessage: message,
  });
}

/** 限流、超时、断网等；已连接成功过时不降级连接状态。 */
export function markAiError(message: string): void {
  if (state.mode !== 'custom' || !state.enabled || state.status === 'connected') return;
  setState({
    ...state,
    status: 'error',
    statusMessage: message,
  });
}

/** 仅用于测试模拟刷新：状态回到初始值，不保留 Key。 */
export function resetAiSettings(): void {
  setState(initialAiSettingsState);
}

export function useAiSettings(): AiSettingsState {
  return useSyncExternalStore(subscribeAiSettings, getAiSettings, getAiSettings);
}
