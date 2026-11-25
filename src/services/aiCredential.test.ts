import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeAiCredential,
  clearAiKey,
  credentialPayload,
  editAiKey,
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
} from './aiCredential';

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
