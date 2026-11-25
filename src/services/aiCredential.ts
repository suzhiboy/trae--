import { useSyncExternalStore } from 'react';
import type { AiCredential, AiCredentialMode } from '../types';

/**
 * 自定义 API Key 的唯一存放点：模块内存。
 * 不写 localStorage / sessionStorage / Cookie / URL，刷新或关闭页面即清除。
 */

export type AiSettingsStatus = 'idle' | 'connected' | 'invalid' | 'error';

export interface AiSettingsState {
  mode: AiCredentialMode;
  key: string;
  enabled: boolean;
  status: AiSettingsStatus;
  statusMessage: string;
}

export const initialAiSettingsState: AiSettingsState = {
  mode: 'site',
  key: '',
  enabled: false,
  status: 'idle',
  statusMessage: '',
};

let state: AiSettingsState = initialAiSettingsState;
const listeners = new Set<() => void>();

function setState(next: AiSettingsState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAiSettings(): AiSettingsState {
  return state;
}

/** 任意 AI 请求前取凭证；自定义模式未启用时返回 null，调用方不得改用站点 Key。 */
export function activeAiCredential(): AiCredential | null {
  if (state.mode === 'site') return { mode: 'site' };
  const key = state.key.trim();
  return state.enabled && key ? { mode: 'custom', apiKey: key } : null;
}

/** Key 只放进 HTTPS 请求体，不进入 URL。 */
export function credentialPayload(credential: AiCredential): {
  credentialMode: AiCredential['mode'];
  apiKey?: string;
} {
  return credential.mode === 'custom'
    ? { credentialMode: 'custom', apiKey: credential.apiKey }
    : { credentialMode: 'site' };
}

const localCodes = new Set(['invalid-request', 'image-too-large', 'invalid-image']);
const respondedCodes = new Set(['insufficient-evidence', 'invalid-schema']);

/** 只有真实 AI 请求成功后才调用。 */
export function recordAiSuccess(credential: AiCredential): void {
  if (credential.mode === 'custom') markAiConnected();
}

/** 把一次请求的结果映射到设置面板状态；不记录 Key 本身。 */
export function recordAiFailure(
  credential: AiCredential,
  code: string,
  message: string,
): void {
  if (credential.mode !== 'custom' || localCodes.has(code)) return;
  if (code === 'custom-key-invalid') {
    markAiInvalid(message);
    return;
  }
  // 服务商已经返回 200，只是内容不合格；Key 本身是通的。
  if (respondedCodes.has(code)) {
    markAiConnected();
    return;
  }
  markAiError(message);
}

export function selectAiMode(mode: AiCredentialMode): void {
  if (mode === 'site') {
    setState(initialAiSettingsState);
    return;
  }
  setState({
    ...state,
    mode: 'custom',
    key: state.mode === 'custom' ? state.key : '',
    enabled: false,
    status: 'idle',
    statusMessage: '',
  });
}

export function editAiKey(key: string): void {
  setState({
    ...state,
    mode: 'custom',
    key,
    enabled: false,
    status: 'idle',
    statusMessage: '',
  });
}

/** 点击「启用」只表示设置生效，不代表服务商已响应。 */
export function enableAiKey(): void {
  const key = state.key.trim();
  if (!key) return;
  setState({
    ...state,
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
