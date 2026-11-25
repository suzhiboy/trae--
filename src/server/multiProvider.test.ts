import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupTestKit,
  diagnoseRequest,
  freeformRequest,
  imageRequest,
  postJson,
  providerEntry,
  startApp,
  startMockUpstream,
  variantRequest,
} from './aiTestKit';

afterEach(async () => {
  await cleanupTestKit();
});

function providersJson(providers: Array<Record<string, unknown>>): string {
  return JSON.stringify(providers);
}

describe('旧部署兼容', () => {
  it('旧火山的 Base URL、模型和站点 Key 仍能完成诊断', async () => {
    const upstream = await startMockUpstream();
    const app = await startApp({
      AI_BASE_URL: `http://127.0.0.1:${upstream.port}/api/v3`,
      AI_MODEL: 'legacy-model',
      AI_VISION_MODEL: 'legacy-vision',
      AI_API_KEY: 'legacy-site-key',
      AI_PROVIDER_NAME: '旧火山配置',
    });

    expect(app.health).toMatchObject({
      ai: true,
      model: 'legacy-model',
      visionModel: 'legacy-vision',
      provider: '旧火山配置',
      customKeyReady: true,
    });
    expect(app.health.defaultProviderId).toBe('default');

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'site',
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { result?: { reason?: string }; credentialMode?: string; providerId?: string };
    expect(payload.credentialMode).toBe('site');
    expect(payload.providerId).toBe('default');
    expect(payload.result?.reason).toBe('最后一步加法错误');
    expect(upstream.requests).toHaveLength(1);
    expect(upstream.requests[0].path).toBe('/api/v3/chat/completions');
    expect(upstream.requests[0].authorization).toBe('Bearer legacy-site-key');
    expect(upstream.requests[0].model).toBe('legacy-model');
  }, 20000);

  it('没有任何 AI 配置时站点模式明确拒绝，健康接口保留旧字段', async () => {
    const app = await startApp({});

    expect(app.health).toMatchObject({
      ok: true,
      ai: false,
      model: null,
      visionModel: null,
      vision: false,
      customKeyReady: false,
    });
    expect(app.health.providers?.length).toBeGreaterThanOrEqual(4);
    expect(app.health.providers?.some((provider) => provider.id === 'volcengine')).toBe(true);

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'site',
    });
    expect(response.status).toBe(503);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe('ai-not-configured');
  }, 20000);

  it('旧 AI 兜底入口 /api/diagnose 也走新配置', async () => {
    const upstream = await startMockUpstream();
    const app = await startApp({
      AI_BASE_URL: `http://127.0.0.1:${upstream.port}/v1`,
      AI_MODEL: 'legacy-model',
      AI_API_KEY: 'legacy-site-key',
    });

    const response = await postJson(app.port, '/api/diagnose', diagnoseRequest);
    expect(response.status).toBe(200);
    const payload = await response.json() as { result?: { reason?: string } };
    expect(payload.result?.reason).toBe('一次项符号错误');
    expect(upstream.requests[0].path).toBe('/v1/chat/completions');
  }, 20000);
});

describe('多供应商按请求隔离', () => {
  it('OpenAI 与 DeepSeek 并发请求各自命中地址、模型和 Key', async () => {
    const openai = await startMockUpstream({ mode: 'openai' });
    const deepseek = await startMockUpstream({ mode: 'openai' });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'openai-mock',
          label: 'OpenAI',
          baseUrl: `http://127.0.0.1:${openai.port}/openai/v1`,
          textModels: ['gpt-test'],
          visionModels: ['gpt-test'],
        }),
        providerEntry({
          id: 'deepseek-mock',
          label: 'DeepSeek',
          baseUrl: `http://127.0.0.1:${deepseek.port}/deepseek/v1`,
          textModels: ['deepseek-test'],
          visionModels: [],
        }),
      ]),
    });

    const [openaiResponse, deepseekResponse] = await Promise.all([
      postJson(app.port, '/api/freeform-diagnose', {
        ...freeformRequest,
        credentialMode: 'custom',
        providerId: 'openai-mock',
        model: 'gpt-test',
        apiKey: 'sk-openai-user',
      }),
      postJson(app.port, '/api/freeform-diagnose', {
        ...freeformRequest,
        question: 'DeepSeek 的题',
        credentialMode: 'custom',
        providerId: 'deepseek-mock',
        model: 'deepseek-test',
        apiKey: 'sk-deepseek-user',
      }),
    ]);

    expect(openaiResponse.status).toBe(200);
    expect(deepseekResponse.status).toBe(200);
    expect(openai.requests).toHaveLength(1);
    expect(deepseek.requests).toHaveLength(1);
    expect(openai.requests[0]).toMatchObject({
      path: '/openai/v1/chat/completions',
      authorization: 'Bearer sk-openai-user',
      model: 'gpt-test',
    });
    expect(deepseek.requests[0]).toMatchObject({
      path: '/deepseek/v1/chat/completions',
      authorization: 'Bearer sk-deepseek-user',
      model: 'deepseek-test',
    });
    expect(openai.requests[0].prompt).not.toContain('DeepSeek 的题');
    expect(deepseek.requests[0].prompt).toContain('DeepSeek 的题');
  }, 20000);

  it('切换供应商后 B 收不到 A 的 Key，旧请求晚返回也不影响 B', async () => {
    const slow = await startMockUpstream({ delayMs: 250 });
    const fast = await startMockUpstream();
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'provider-a', label: 'A', baseUrl: `http://127.0.0.1:${slow.port}/a/v1` }),
        providerEntry({ id: 'provider-b', label: 'B', baseUrl: `http://127.0.0.1:${fast.port}/b/v1` }),
      ]),
    });

    const requestA = postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'provider-a',
      model: 'model-a',
      apiKey: 'key-a',
    });
    const requestB = postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'provider-b',
      model: 'model-b',
      apiKey: 'key-b',
    });

    const [responseA, responseB] = await Promise.all([requestA, requestB]);
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(slow.requests[0].authorization).toBe('Bearer key-a');
    expect(fast.requests).toHaveLength(1);
    expect(fast.requests[0].authorization).toBe('Bearer key-b');
    expect(fast.requests.some((request) => request.authorization.includes('key-a'))).toBe(false);
  }, 20000);
});

describe('Anthropic 原生 Messages', () => {
  it('Claude 官方模式发送 Anthropic 请求并只解析文本块', async () => {
    const upstream = await startMockUpstream({ mode: 'anthropic' });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'claude-official',
          label: 'Anthropic (Claude)',
          protocol: 'anthropic',
          baseUrl: `http://127.0.0.1:${upstream.port}`,
          textModels: ['claude-test'],
          visionModels: ['claude-test'],
          jsonMode: 'none',
        }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'claude-official',
      model: 'claude-test',
      apiKey: 'sk-ant-user',
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { result?: { reason?: string } };
    expect(payload.result?.reason).toBe('最后一步加法错误');

    const request = upstream.requests[0];
    expect(request.path).toBe('/v1/messages');
    expect(request.apiKey).toBe('sk-ant-user');
    expect(request.anthropicVersion).toBe('2023-06-01');
    expect(request.authorization).toBe('');
    expect(request.body.system).toContain('高中数学');
    expect(request.body.max_tokens).toBe(3000);
    expect(Array.isArray(request.body.messages)).toBe(true);
    expect(request.body.response_format).toBeUndefined();
  }, 20000);

  it('Anthropic 图片按 base64 内容块发送，且不把 thinking 混进结果', async () => {
    const upstream = await startMockUpstream({ mode: 'anthropic' });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'claude-official',
          protocol: 'anthropic',
          baseUrl: `http://127.0.0.1:${upstream.port}`,
          textModels: ['claude-test'],
          visionModels: ['claude-vision'],
          jsonMode: 'none',
        }),
      ]),
    });

    const response = await postJson(app.port, '/api/recognize', {
      ...imageRequest,
      credentialMode: 'custom',
      providerId: 'claude-official',
      model: 'claude-test',
      visionModel: 'claude-vision',
      apiKey: 'sk-ant-user',
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as { result?: { question?: string } };
    expect(payload.result?.question).toBe('已知 f(x)=x²-3x+2，求 f(2)');

    const request = upstream.requests[0];
    expect(request.path).toBe('/v1/messages');
    expect(request.model).toBe('claude-vision');
    const content = (request.body.messages as Array<{ content: unknown }>)[0].content as Array<Record<string, unknown>>;
    expect(content[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
    });
  }, 20000);
});

describe('中转站协议与路径', () => {
  it('带路径前缀、模型别名含 claude 的 OpenAI 兼容中转站仍按 OpenAI 调用', async () => {
    const upstream = await startMockUpstream({ mode: 'openai' });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'campus-relay',
          label: '校园中转站',
          protocol: 'openai',
          baseUrl: `http://127.0.0.1:${upstream.port}/campus/ai/v1`,
          textModels: ['claude-sonnet-4-5-relay'],
          jsonMode: 'none',
        }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'campus-relay',
      model: 'claude-sonnet-4-5-relay',
      apiKey: 'relay-user-key',
    });

    expect(response.status).toBe(200);
    const request = upstream.requests[0];
    expect(request.path).toBe('/campus/ai/v1/chat/completions');
    expect(request.authorization).toBe('Bearer relay-user-key');
    expect(request.apiKey).toBe('');
    expect(request.anthropicVersion).toBe('');
    expect(request.model).toBe('claude-sonnet-4-5-relay');
    expect(request.body.response_format).toBeUndefined();
  }, 20000);

  it('四个业务入口都经过新配置流程', async () => {
    const upstream = await startMockUpstream({ mode: 'openai' });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'site-relay',
          label: '站点中转',
          baseUrl: `http://127.0.0.1:${upstream.port}/site/v1`,
          textModels: ['site-text'],
          visionModels: ['site-vision'],
          apiKey: 'site-key',
        }),
      ]),
    });

    const credential = { credentialMode: 'site', providerId: 'site-relay' };
    const diagnose = await postJson(app.port, '/api/diagnose', { ...diagnoseRequest, ...credential });
    const freeform = await postJson(app.port, '/api/freeform-diagnose', { ...freeformRequest, ...credential });
    const variants = await postJson(app.port, '/api/freeform-variants', { ...variantRequest, ...credential });
    const recognize = await postJson(app.port, '/api/recognize', { ...imageRequest, ...credential });

    expect(diagnose.status).toBe(200);
    expect(freeform.status).toBe(200);
    expect(variants.status).toBe(200);
    expect(recognize.status).toBe(200);

    const variantPayload = await variants.json() as { result?: { variants?: unknown[] } };
    expect(variantPayload.result?.variants).toHaveLength(1);
    const ocrPayload = await recognize.json() as { result?: { question?: string } };
    expect(ocrPayload.result?.question).toBe('已知 f(x)=x²-3x+2，求 f(2)');

    expect(upstream.requests).toHaveLength(4);
    expect(upstream.requests.every((request) => request.path === '/site/v1/chat/completions')).toBe(true);
    expect(upstream.requests.filter((request) => request.prompt.includes('题目转录员'))).toHaveLength(1);
    expect(upstream.requests.find((request) => request.prompt.includes('题目转录员'))?.model).toBe('site-vision');
    expect(upstream.requests.filter((request) => request.model === 'site-text')).toHaveLength(3);
  }, 20000);
});

describe('站点 Key 与客户端地址', () => {
  it('拒绝客户端覆盖 Base URL，站点模型不会被客户端改掉', async () => {
    const upstream = await startMockUpstream();
    const other = await startMockUpstream();
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'site-relay',
          baseUrl: `http://127.0.0.1:${upstream.port}/site/v1`,
          textModels: ['site-model'],
          apiKey: 'site-secret-key',
        }),
      ]),
    });

    const override = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'site',
      providerId: 'site-relay',
      baseUrl: `http://127.0.0.1:${other.port}/evil`,
    });
    expect(override.status).toBe(400);
    expect((await override.json() as { error?: string }).error).toBe('provider-override-rejected');
    expect(upstream.requests).toHaveLength(0);
    expect(other.requests).toHaveLength(0);

    const unknown = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'site',
      providerId: 'not-registered',
    });
    expect(unknown.status).toBe(400);
    expect((await unknown.json() as { error?: string }).error).toBe('unknown-provider');

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'site',
      providerId: 'site-relay',
      model: 'client-model',
      apiKey: 'client-key',
    });
    expect(response.status).toBe(200);
    expect(upstream.requests[0].model).toBe('site-model');
    expect(upstream.requests[0].authorization).toBe('Bearer site-secret-key');
    expect(JSON.stringify(app.health)).not.toContain('site-secret-key');
  }, 20000);

  it('站点模式选择没有站点 Key 的内置供应商时明确拒绝且不发请求', async () => {
    const upstream = await startMockUpstream();
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'site-relay',
          baseUrl: `http://127.0.0.1:${upstream.port}/site/v1`,
          apiKey: 'site-key',
        }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'site',
      providerId: 'openai',
    });
    expect(response.status).toBe(503);
    expect((await response.json() as { error?: string }).error).toBe('ai-not-configured');
    expect(upstream.requests).toHaveLength(0);
  }, 20000);
});

describe('错误映射与无凭证泄漏', () => {
  it('自定义 Key 401 → custom-key-invalid，错误体不含 Key', async () => {
    const upstream = await startMockUpstream({ status: 401 });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'sk-very-secret',
    });
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).toContain('custom-key-invalid');
    expect(body).not.toContain('sk-very-secret');
    expect(upstream.requests[0].authorization).toBe('Bearer sk-very-secret');
  }, 20000);

  it('站点 403 → auth-failed，错误体不含站点 Key', async () => {
    const upstream = await startMockUpstream({ status: 403 });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'site-relay',
          baseUrl: `http://127.0.0.1:${upstream.port}/v1`,
          apiKey: 'site-secret',
        }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'site',
      providerId: 'site-relay',
    });
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain('auth-failed');
    expect(body).not.toContain('site-secret');
  }, 20000);

  it('429 保留 retry-after', async () => {
    const upstream = await startMockUpstream({ status: 429, headers: { 'retry-after': '9' } });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: 'rate-limited', retryAfter: 9 });
  }, 20000);

  it('超时返回 timeout', async () => {
    const upstream = await startMockUpstream({ delayMs: 700 });
    const app = await startApp({
      AI_TIMEOUT_MS: '200',
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(502);
    expect((await response.json() as { error?: string }).error).toBe('timeout');
  }, 20000);

  it('图片请求 400 → vision-model-required', async () => {
    const upstream = await startMockUpstream({ status: 400 });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({
          id: 'relay-a',
          baseUrl: `http://127.0.0.1:${upstream.port}/v1`,
          visionModels: ['text-only-model'],
        }),
      ]),
    });

    const response = await postJson(app.port, '/api/recognize', {
      ...imageRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      visionModel: 'text-only-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(502);
    expect((await response.json() as { error?: string }).error).toBe('vision-model-required');
  }, 20000);

  it('无效 JSON 不会被当成成功诊断', async () => {
    const upstream = await startMockUpstream({ content: '这不是 JSON' });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'insufficient-evidence',
      error: 'invalid-schema',
    });
    expect(upstream.requests).toHaveLength(2);
  }, 20000);

  it('空响应不算成功', async () => {
    const upstream = await startMockUpstream({ content: '   ' });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(502);
    const payload = await response.json() as { error?: string; result?: unknown };
    expect(payload.error).toBe('empty-content');
    expect(payload.result).toBeUndefined();
  }, 20000);

  it('截断响应返回 truncated，不返回结果', async () => {
    const upstream = await startMockUpstream({ truncate: true });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(502);
    const payload = await response.json() as { error?: string; result?: unknown };
    expect(payload.error).toBe('truncated');
    expect(payload.result).toBeUndefined();
  }, 20000);

  it('跳转不跟随，目标地址收不到凭证', async () => {
    const target = await startMockUpstream();
    const redirecting = await startMockUpstream({
      location: `http://127.0.0.1:${target.port}/steal`,
    });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${redirecting.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(502);
    expect((await response.json() as { error?: string }).error).toBe('upstream-redirect');
    expect(target.requests).toHaveLength(0);
  }, 20000);

  it('上游正文不是 JSON → invalid-response', async () => {
    const upstream = await startMockUpstream({ invalidUpstreamBody: true });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/freeform-diagnose', {
      ...freeformRequest,
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'key',
    });
    expect(response.status).toBe(502);
    expect((await response.json() as { error?: string }).error).toBe('invalid-response');
  }, 20000);
});

describe('连接测试与模型列表', () => {
  it('测试连接只发送最小请求并验证文本响应', async () => {
    const upstream = await startMockUpstream();
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/ai/test', {
      credentialMode: 'custom',
      providerId: 'relay-a',
      model: 'mock-model',
      apiKey: 'test-key',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      ok: true,
      model: 'mock-model',
      reply: 'OK',
    });

    expect(upstream.requests).toHaveLength(1);
    const request = upstream.requests[0];
    expect(request.prompt).toContain('只回复 OK');
    expect(request.body.response_format).toBeUndefined();
    expect(request.body.max_tokens).toBeLessThanOrEqual(64);
    expect(JSON.stringify(request.body)).not.toContain('变式题');
  }, 20000);

  it('读取模型列表成功时返回模型 ID', async () => {
    const upstream = await startMockUpstream({ models: ['model-a', 'model-b'] });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/ai/models', {
      credentialMode: 'custom',
      providerId: 'relay-a',
      apiKey: 'key',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: true, models: ['model-a', 'model-b'] });
    expect(upstream.requests[0]).toMatchObject({ method: 'GET', path: '/v1/models' });
  }, 20000);

  it('模型列表接口不可用时返回可手填的降级信息', async () => {
    const upstream = await startMockUpstream({ models: null });
    const app = await startApp({
      AI_PROVIDERS: providersJson([
        providerEntry({ id: 'relay-a', baseUrl: `http://127.0.0.1:${upstream.port}/v1` }),
      ]),
    });

    const response = await postJson(app.port, '/api/ai/models', {
      credentialMode: 'custom',
      providerId: 'relay-a',
      apiKey: 'key',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: false,
      error: 'models-unavailable',
    });
  }, 20000);
});
