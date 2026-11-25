import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProviderModels,
  providersFromHealth,
  testAiConnection,
} from './aiProvider';
import type { AiHealth } from './freeformDiagnosis';

function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(payload: unknown, status = 200) {
  const spy = vi.fn().mockImplementation(() => Promise.resolve(response(status, payload)));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const credential = {
  mode: 'custom' as const,
  apiKey: 'sk-test-123',
  providerId: 'deepseek',
  textModel: 'deepseek-chat',
  visionModel: 'vision-model',
  revision: 3,
};

describe('测试连接', () => {
  it('只把 Key 放在请求体，成功时返回实际耗时和模型', async () => {
    const spy = mockFetch({
      available: true,
      ok: true,
      latencyMs: 42,
      reply: 'OK',
      providerId: 'deepseek',
      model: 'deepseek-chat',
    });

    const result = await testAiConnection(credential);

    expect(result).toMatchObject({
      ok: true,
      latencyMs: 42,
      reply: 'OK',
      providerId: 'deepseek',
      model: 'deepseek-chat',
    });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ai/test');
    expect(url).not.toContain('sk-test-123');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      credentialMode: 'custom',
      providerId: 'deepseek',
      apiKey: 'sk-test-123',
      model: 'deepseek-chat',
      visionModel: 'vision-model',
    });
  });

  it('Key 无效时返回明确错误，错误信息不含 Key', async () => {
    mockFetch({ available: true, error: 'custom-key-invalid' }, 401);

    const result = await testAiConnection(credential);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('custom-key-invalid');
      expect(result.message).not.toContain('sk-test-123');
    }
  });

  it('站点模式不发送 Key 字段', async () => {
    const spy = mockFetch({ available: true, ok: true, latencyMs: 10, reply: 'OK' });

    await testAiConnection({ mode: 'site', providerId: 'site', revision: 1 });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({ credentialMode: 'site', providerId: 'site' });
  });
});

describe('读取模型列表', () => {
  it('成功时返回模型 ID', async () => {
    mockFetch({ available: true, models: ['model-a', 'model-b'] });

    const result = await fetchProviderModels(credential);
    expect(result).toEqual({ ok: true, models: ['model-a', 'model-b'] });
  });

  it('列表接口不可用时保留手填提示', async () => {
    mockFetch({
      available: false,
      error: 'models-unavailable',
      message: '模型列表接口不可用，请手动填写模型 ID。',
    });

    const result = await fetchProviderModels(credential);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('models-unavailable');
      expect(result.message).toContain('手动填写');
    }
  });
});

describe('旧服务端健康信息回退', () => {
  it('没有 providers 时合成单一供应商，隐藏未知域名', () => {
    const health: AiHealth = {
      ai: false,
      vision: true,
      provider: 'MockProvider',
      model: 'mock-model',
      visionModel: 'mock-vision',
      customKeyReady: true,
    };

    expect(providersFromHealth(health)).toEqual([{
      id: 'default',
      label: 'MockProvider',
      protocol: 'openai',
      domain: '',
      basePath: '',
      textModels: ['mock-model'],
      visionModels: ['mock-vision'],
      suggestedTextModels: [],
      suggestedVisionModels: [],
      siteKey: false,
      customKey: true,
      isDefault: true,
    }]);
  });

  it('新服务端直接使用公开供应商目录', () => {
    const providers = providersFromHealth({
      ai: true,
      vision: false,
      providers: [{
        id: 'relay',
        label: 'Relay',
        protocol: 'anthropic',
        domain: 'relay.example.com',
        basePath: '/v1',
        textModels: ['m'],
        visionModels: [],
        suggestedTextModels: [],
        suggestedVisionModels: [],
        siteKey: true,
        customKey: true,
        isDefault: true,
      }],
    });
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({ id: 'relay', protocol: 'anthropic' });
  });
});
