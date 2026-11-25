import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeAiCredential,
  activeAiRequest,
  clearAiKey,
  credentialPayload,
  editAiKey,
  editAiModel,
  editAiVisionModel,
  enableAiKey,
  getAiSettings,
  initialAiSettingsState,
  markAiConnected,
  markAiError,
  markAiInvalid,
  recordAiFailure,
  recordAiSuccess,
  resetAiSettings,
  selectAiMode,
  selectAiProvider,
  syncAiProviders,
} from './aiCredential';
import type { AiProviderInfo } from '../types';

describe('自定义 Key 内存状态', () => {
  beforeEach(() => {
    resetAiSettings();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初始使用站点配置，内存里没有 Key', () => {
    expect(getAiSettings()).toEqual(initialAiSettingsState);
    expect(getAiSettings().key).toBe('');
    expect(activeAiCredential()).toEqual({ mode: 'site' });
  });

  it('选择自定义但未启用时不允许请求，也不回退站点', () => {
    selectAiMode('custom');
    editAiKey('sk-test-123');

    expect(getAiSettings().enabled).toBe(false);
    expect(activeAiCredential()).toBeNull();
  });

  it('点击启用后只表示设置生效，尚未显示连接成功', () => {
    selectAiMode('custom');
    editAiKey('  sk-test-123  ');
    enableAiKey();

    expect(getAiSettings().enabled).toBe(true);
    expect(getAiSettings().key).toBe('sk-test-123');
    expect(getAiSettings().status).toBe('idle');
    expect(activeAiCredential()).toEqual({ mode: 'custom', apiKey: 'sk-test-123' });
  });

  it('编辑 Key 会立即停用并清除旧连接状态', () => {
    selectAiMode('custom');
    editAiKey('sk-test-123');
    enableAiKey();
    markAiConnected();
    editAiKey('sk-test-456');

    expect(getAiSettings().enabled).toBe(false);
    expect(getAiSettings().status).toBe('idle');
    expect(activeAiCredential()).toBeNull();
  });

  it('服务商实际响应成功后才标记连接成功', () => {
    selectAiMode('custom');
    editAiKey('sk-test-123');
    enableAiKey();
    expect(getAiSettings().status).toBe('idle');

    markAiConnected();
    expect(getAiSettings().status).toBe('connected');
  });

  it('自定义 Key 无效时明确标红，不改成站点状态', () => {
    selectAiMode('custom');
    editAiKey('sk-bad');
    enableAiKey();
    markAiInvalid('Key 无效');

    expect(getAiSettings().status).toBe('invalid');
    expect(getAiSettings().statusMessage).toBe('Key 无效');
    expect(getAiSettings().mode).toBe('custom');
  });

  it('限流或超时首次失败标记连接未完成，已连接成功过则不降级', () => {
    selectAiMode('custom');
    editAiKey('sk-test-123');
    enableAiKey();
    markAiError('超时');
    expect(getAiSettings().status).toBe('error');

    markAiConnected();
    markAiError('限流');
    expect(getAiSettings().status).toBe('connected');
  });

  it('清除后回到站点模式并移除 Key（等价刷新后的初始状态）', () => {
    selectAiMode('custom');
    editAiKey('sk-test-123');
    enableAiKey();
    markAiConnected();
    clearAiKey();

    expect(getAiSettings()).toEqual(initialAiSettingsState);
    expect(activeAiCredential()).toEqual({ mode: 'site' });
  });

  it('请求体只在自定义模式携带 Key，站点模式不带', () => {
    expect(credentialPayload({ mode: 'site' })).toEqual({ credentialMode: 'site' });
    expect(credentialPayload({ mode: 'custom', apiKey: 'sk-test' })).toEqual({
      credentialMode: 'custom',
      apiKey: 'sk-test',
    });
  });

  it('请求结果映射：无效 Key 标红，内容不合格视为已连通，超时标错误', () => {
    selectAiMode('custom');
    editAiKey('sk-test');
    enableAiKey();

    recordAiFailure({ mode: 'custom', apiKey: 'sk-test' }, 'invalid-request', '本地参数错误');
    expect(getAiSettings().status).toBe('idle');

    recordAiFailure({ mode: 'custom', apiKey: 'sk-test' }, 'invalid-schema', '结构不合格');
    expect(getAiSettings().status).toBe('connected');

    resetAiSettings();
    selectAiMode('custom');
    editAiKey('sk-test');
    enableAiKey();
    recordAiFailure({ mode: 'custom', apiKey: 'sk-test' }, 'custom-key-invalid', 'Key 无效');
    expect(getAiSettings().status).toBe('invalid');

    resetAiSettings();
    selectAiMode('custom');
    editAiKey('sk-test');
    enableAiKey();
    recordAiFailure({ mode: 'custom', apiKey: 'sk-test' }, 'timeout', '超时');
    expect(getAiSettings().status).toBe('error');
  });

  it('站点模式的请求结果不改变自定义设置状态', () => {
    recordAiSuccess({ mode: 'site' });
    recordAiFailure({ mode: 'site' }, 'auth-failed', '站点鉴权失败');

    expect(getAiSettings()).toEqual(initialAiSettingsState);
  });

  it('Key 不会写入 localStorage 或 sessionStorage', () => {
    const localStorageSpy = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const sessionStorageSpy = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', localStorageSpy);
    vi.stubGlobal('sessionStorage', sessionStorageSpy);

    selectAiMode('custom');
    editAiKey('sk-memory-only');
    enableAiKey();
    markAiConnected();

    expect(localStorageSpy.setItem).not.toHaveBeenCalled();
    expect(localStorageSpy.getItem).not.toHaveBeenCalled();
    expect(sessionStorageSpy.setItem).not.toHaveBeenCalled();
    expect(sessionStorageSpy.getItem).not.toHaveBeenCalled();
  });
});

const providers: AiProviderInfo[] = [
  {
    id: 'site',
    label: '站点火山',
    protocol: 'openai',
    domain: 'ark.cn-beijing.volces.com',
    basePath: '/api/v3',
    textModels: ['site-model'],
    visionModels: ['site-vision'],
    suggestedTextModels: [],
    suggestedVisionModels: [],
    siteKey: true,
    customKey: true,
    isDefault: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    domain: 'api.deepseek.com',
    basePath: '/v1',
    textModels: [],
    visionModels: [],
    suggestedTextModels: ['deepseek-chat'],
    suggestedVisionModels: [],
    siteKey: false,
    customKey: true,
    isDefault: false,
  },
  {
    id: 'claude',
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    domain: 'api.anthropic.com',
    basePath: '',
    textModels: [],
    visionModels: [],
    suggestedTextModels: ['claude-sonnet-4-5'],
    suggestedVisionModels: ['claude-sonnet-4-5'],
    siteKey: false,
    customKey: true,
    isDefault: false,
  },
];

describe('多供应商设置状态', () => {
  beforeEach(() => {
    resetAiSettings();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('健康目录到达后选中默认供应商并填入示例模型', () => {
    syncAiProviders(providers, 'site');

    expect(getAiSettings()).toMatchObject({
      mode: 'site',
      providerId: 'site',
      textModel: 'site-model',
      visionModel: 'site-vision',
    });
    const credential = activeAiRequest();
    expect(credential).toMatchObject({ mode: 'site', providerId: 'site' });
    expect(credential?.mode === 'site' && 'apiKey' in credential).toBe(false);
  });

  it('切换供应商会清空旧 Key，请求载荷带供应商、模型和图片模型', () => {
    syncAiProviders(providers, 'site');
    selectAiMode('custom');
    selectAiProvider(providers[1]);
    editAiKey('sk-deepseek');
    enableAiKey();

    expect(getAiSettings()).toMatchObject({
      mode: 'custom',
      providerId: 'deepseek',
      textModel: 'deepseek-chat',
      key: 'sk-deepseek',
      enabled: true,
    });

    const credential = activeAiRequest();
    expect(credential).toMatchObject({
      mode: 'custom',
      providerId: 'deepseek',
      textModel: 'deepseek-chat',
      apiKey: 'sk-deepseek',
    });
    expect(credentialPayload(credential!)).toEqual({
      credentialMode: 'custom',
      providerId: 'deepseek',
      apiKey: 'sk-deepseek',
      model: 'deepseek-chat',
    });

    selectAiProvider(providers[2]);
    expect(getAiSettings()).toMatchObject({
      providerId: 'claude',
      textModel: 'claude-sonnet-4-5',
      visionModel: 'claude-sonnet-4-5',
      key: '',
      enabled: false,
      status: 'idle',
    });
    expect(activeAiRequest()).toBeNull();
  });

  it('编辑模型或图片模型会停用并清除旧连接状态', () => {
    syncAiProviders(providers, 'site');
    selectAiMode('custom');
    selectAiProvider(providers[1]);
    editAiKey('sk-test');
    enableAiKey();
    markAiConnected();
    expect(getAiSettings().status).toBe('connected');

    editAiModel('deepseek-reasoner');
    expect(getAiSettings().enabled).toBe(false);
    expect(getAiSettings().status).toBe('idle');

    editAiKey('sk-test');
    enableAiKey();
    markAiConnected();
    editAiVisionModel('vision-model');
    expect(getAiSettings().enabled).toBe(false);
    expect(getAiSettings().status).toBe('idle');
  });

  it('旧请求晚返回时不会把新供应商标成连接成功', () => {
    syncAiProviders(providers, 'site');
    selectAiMode('custom');
    selectAiProvider(providers[1]);
    editAiKey('sk-old');
    enableAiKey();
    const stale = activeAiRequest();
    expect(stale).not.toBeNull();

    selectAiProvider(providers[2]);
    recordAiSuccess(stale!);
    expect(getAiSettings().status).toBe('idle');
    expect(getAiSettings().providerId).toBe('claude');

    recordAiFailure(stale!, 'custom-key-invalid', '旧 Key 无效');
    expect(getAiSettings().status).toBe('idle');
  });

  it('同步健康目录不会覆盖用户当前选择', () => {
    syncAiProviders(providers, 'site');
    selectAiMode('custom');
    selectAiProvider(providers[2]);
    syncAiProviders(providers, 'site');
    expect(getAiSettings().providerId).toBe('claude');
  });

  it('站点模式的载荷不包含 Key 与模型', () => {
    syncAiProviders(providers, 'site');
    const credential = activeAiRequest();
    expect(credentialPayload(credential!)).toEqual({
      credentialMode: 'site',
      providerId: 'site',
    });
  });
});
