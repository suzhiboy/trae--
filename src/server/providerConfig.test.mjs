import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  buildHealth,
  normalizeBaseUrl,
  resolveProviderRegistry,
  resolveRequestConfig,
} from '../../server/ai/providers.mjs';

function registryWith(environment) {
  return resolveProviderRegistry({
    AI_BASE_URL: '',
    AI_MODEL: '',
    AI_VISION_MODEL: '',
    AI_API_KEY: '',
    AI_PROVIDER_NAME: '',
    AI_PROVIDERS: '',
    ...environment,
  });
}

describe('供应商注册表：旧变量兼容', () => {
  it('只有旧变量时生成默认供应商，健康字段保持原语义', () => {
    const registry = registryWith({
      AI_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
      AI_MODEL: 'ep-legacy-text',
      AI_VISION_MODEL: 'ep-legacy-vision',
      AI_API_KEY: 'site-key',
      AI_PROVIDER_NAME: '火山方舟',
    });
    const health = buildHealth(registry);

    expect(health).toMatchObject({
      ok: true,
      ai: true,
      model: 'ep-legacy-text',
      visionModel: 'ep-legacy-vision',
      vision: true,
      provider: '火山方舟',
      customKeyReady: true,
    });
    expect(health.defaultProviderId).toBe('default');
    expect(health.providers.find((provider) => provider.id === 'default')).toMatchObject({
      protocol: 'openai',
      domain: 'ark.cn-beijing.volces.com',
      basePath: '/api/v3',
      siteKey: true,
      customKey: true,
      isDefault: true,
    });
  });

  it('没有任何 AI 配置时仍提供内置 BYOK 目录，但站点 AI 不可用', () => {
    const health = buildHealth(registryWith({}));

    expect(health.ai).toBe(false);
    expect(health.model).toBeNull();
    expect(health.customKeyReady).toBe(false);
    expect(health.providers.map((provider) => provider.id)).toEqual(expect.arrayContaining([
      'volcengine',
      'deepseek',
      'openai',
      'anthropic',
    ]));
    expect(health.providers.every((provider) => provider.siteKey === false)).toBe(true);
  });

  it('只配置模型、不配置站点 Key 时允许自定义 Key', () => {
    const health = buildHealth(registryWith({
      AI_BASE_URL: 'http://127.0.0.1:9876/v1',
      AI_MODEL: 'mock-model',
    }));

    expect(health.ai).toBe(false);
    expect(health.customKeyReady).toBe(true);
    expect(health.providers.find((provider) => provider.id === 'default')?.siteKey).toBe(false);
  });
});

describe('供应商注册表：管理员中转站', () => {
  const relay = {
    id: 'campus-relay',
    label: '校园中转站',
    protocol: 'openai',
    baseUrl: 'https://relay.example.edu.cn/ai/v1/',
    textModels: ['claude-sonnet-4-5-relay'],
    visionModels: ['claude-vision-relay'],
    jsonMode: 'none',
    customKey: true,
    default: true,
  };

  it('保留路径前缀，协议与模型别名分别解析', () => {
    const registry = registryWith({
      AI_PROVIDERS: JSON.stringify([relay]),
    });
    const config = resolveRequestConfig({
      credentialMode: 'custom',
      providerId: 'campus-relay',
      model: 'claude-sonnet-4-5-relay',
      apiKey: 'user-key',
    }, { registry, kind: 'text' });

    expect(config).toMatchObject({
      mode: 'custom',
      protocol: 'openai',
      baseUrl: 'https://relay.example.edu.cn/ai/v1',
      model: 'claude-sonnet-4-5-relay',
      apiKey: 'user-key',
      jsonMode: 'none',
    });
    expect(registry.defaultProviderId).toBe('campus-relay');
  });

  it('支持声明 Anthropic 协议的中转站', () => {
    const registry = registryWith({
      AI_PROVIDERS: JSON.stringify([{
        ...relay,
        id: 'claude-relay',
        protocol: 'anthropic',
        baseUrl: 'https://relay.example.com/anthropic',
      }]),
    });
    const config = resolveRequestConfig({
      credentialMode: 'custom',
      providerId: 'claude-relay',
      model: 'claude-sonnet-4-5',
      apiKey: 'user-key',
    }, { registry, kind: 'text' });

    expect(config.protocol).toBe('anthropic');
    expect(config.baseUrl).toBe('https://relay.example.com/anthropic');
    expect(config.jsonMode).toBe('none');
  });

  it('公开信息不包含 Key，也不包含完整 Base URL', () => {
    const registry = registryWith({
      AI_PROVIDERS: JSON.stringify([{ ...relay, apiKey: 'site-secret-key' }]),
    });
    const health = buildHealth(registry);
    const serialized = JSON.stringify(health);

    expect(serialized).not.toContain('site-secret-key');
    expect(serialized).not.toContain('https://relay.example.edu.cn/ai/v1');
    expect(health.providers[0]).toMatchObject({
      domain: 'relay.example.edu.cn',
      basePath: '/ai/v1',
      siteKey: true,
    });
  });

  it('拒绝未知 providerId 和客户端覆盖地址', () => {
    const registry = registryWith({ AI_PROVIDERS: JSON.stringify([relay]) });

    expect(() => resolveRequestConfig({
      credentialMode: 'custom',
      providerId: 'not-registered',
      apiKey: 'key',
    }, { registry })).toThrowError(expect.objectContaining({ code: 'unknown-provider' }));

    expect(() => resolveRequestConfig({
      credentialMode: 'custom',
      providerId: 'campus-relay',
      apiKey: 'key',
      baseUrl: 'https://attacker.example.com',
    }, { registry })).toThrowError(expect.objectContaining({ code: 'provider-override-rejected' }));
  });

  it('站点模式忽略客户端提交的模型，只使用服务端配置', () => {
    const registry = registryWith({
      AI_PROVIDERS: JSON.stringify([{ ...relay, apiKey: 'site-key' }]),
    });
    const config = resolveRequestConfig({
      credentialMode: 'site',
      providerId: 'campus-relay',
      model: 'client-chosen-model',
      apiKey: 'client-key',
    }, { registry, kind: 'text' });

    expect(config.mode).toBe('site');
    expect(config.model).toBe('claude-sonnet-4-5-relay');
    expect(config.apiKey).toBe('site-key');
  });

  it('不允许自定义 Key 的供应商返回明确错误', () => {
    const registry = registryWith({
      AI_PROVIDERS: JSON.stringify([{ ...relay, customKey: false }]),
    });

    expect(() => resolveRequestConfig({
      credentialMode: 'custom',
      providerId: 'campus-relay',
      apiKey: 'key',
    }, { registry })).toThrowError(expect.objectContaining({ code: 'custom-key-not-allowed', status: 403 }));
  });
});

describe('供应商注册表：配置边界', () => {
  it('Base URL 只允许 HTTPS 或本机回环 HTTP', () => {
    expect(normalizeBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
    expect(normalizeBaseUrl('http://127.0.0.1:8080/v1')).toBe('http://127.0.0.1:8080/v1');
    expect(normalizeBaseUrl('http://localhost:8080')).toBe('http://localhost:8080');
    expect(normalizeBaseUrl('http://api.example.com/v1')).toBeNull();
    expect(normalizeBaseUrl('ftp://api.example.com/v1')).toBeNull();
    expect(normalizeBaseUrl('https://user:pass@api.example.com/v1')).toBeNull();
  });

  it('忽略重复 id、非法协议和非法 JSON，不影响其它供应商', () => {
    const registry = registryWith({
      AI_PROVIDERS: JSON.stringify([
        { id: 'relay-a', label: 'A', protocol: 'openai', baseUrl: 'https://a.example.com/v1' },
        { id: 'relay-a', label: '重复', protocol: 'openai', baseUrl: 'https://b.example.com/v1' },
        { id: 'relay-b', label: 'B', protocol: 'graphql', baseUrl: 'https://c.example.com/v1' },
      ]),
    });

    expect(registry.byId.has('relay-a')).toBe(true);
    expect(registry.byId.has('relay-b')).toBe(false);
    expect(registry.warnings.length).toBeGreaterThan(0);
  });

  it('非法 AI_PROVIDERS JSON 不阻止服务启动', () => {
    const registry = registryWith({ AI_PROVIDERS: '{not-json' });
    expect(registry.providers.length).toBeGreaterThan(0);
    expect(registry.warnings.join(' ')).toContain('AI_PROVIDERS');
  });

  it('站点模式没有站点 Key 时返回 ai-not-configured', () => {
    const registry = registryWith({ AI_PROVIDERS: JSON.stringify([{
      id: 'relay-a',
      label: 'A',
      protocol: 'openai',
      baseUrl: 'https://a.example.com/v1',
      textModels: ['m'],
    }]) });

    expect(() => resolveRequestConfig({ credentialMode: 'site', providerId: 'relay-a' }, { registry }))
      .toThrowError(expect.objectContaining({ code: 'ai-not-configured', status: 503 }));
  });

  it('ConfigError 携带状态码，便于路由直接返回', () => {
    const error = new ConfigError('example', 403);
    expect(error).toMatchObject({ name: 'ConfigError', code: 'example', status: 403 });
  });
});
