import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkAiHealth,
  requestFreeformDiagnosis,
  requestVariantCandidates,
} from './freeformDiagnosis';

const validResult = {
  correctAnswer: '0',
  standardSteps: ['f(2)=2^2-3*2+2=0'],
  firstWrongStepIndex: 1,
  stepQuote: 'f(2)=4-6+2=4',
  reason: '最后一步加法错误',
  knowledgePoint: '函数值求解',
  knowledgeNodeId: 'function-value',
  variants: [{ stem: '已知 f(x)=x²-3x+2，求 f(3)', answer: '2' }],
  confidence: 'medium',
  claims: [{ kind: 'arithmetic', expression: '4-6+2=0', claimed: '0' }],
  insufficientEvidence: false,
  uncertainty: '',
};

function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(payload: unknown, status = 200) {
  const spy = vi.fn().mockResolvedValue(response(status, payload));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AI 请求凭证：Key 只进请求体', () => {
  it('自定义模式把 Key 放在请求体，不放在 URL', async () => {
    const spy = mockFetch({ available: true, source: 'ai', result: validResult });

    const result = await requestFreeformDiagnosis({
      question: '已知 f(x)=x²-3x+2，求 f(2)',
      finalAnswer: '4',
      steps: ['f(2)=4-6+2=4'],
    }, { mode: 'custom', apiKey: 'sk-test-123' });

    expect(result.ok).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/freeform-diagnose');
    expect(url).not.toContain('sk-test-123');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.credentialMode).toBe('custom');
    expect(body.apiKey).toBe('sk-test-123');
  });

  it('站点模式不发送任何 Key 字段', async () => {
    const spy = mockFetch({ available: true, source: 'ai', result: validResult });

    const result = await requestFreeformDiagnosis({
      question: '已知 f(x)=x²-3x+2，求 f(2)',
      finalAnswer: '4',
      steps: [],
    }, { mode: 'site' });

    expect(result.ok).toBe(true);
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.credentialMode).toBe('site');
    expect(body).not.toHaveProperty('apiKey');
  });

  it('自定义 Key 无效时返回明确错误，且错误信息不含 Key', async () => {
    mockFetch({ available: true, error: 'custom-key-invalid' }, 401);

    const result = await requestFreeformDiagnosis({
      question: '已知 f(x)=x²-3x+2，求 f(2)',
      finalAnswer: '4',
      steps: [],
    }, { mode: 'custom', apiKey: 'sk-bad-key' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('custom-key-invalid');
      expect(result.message).toContain('自定义 API Key 无效');
      expect(result.message).not.toContain('sk-bad-key');
    }
  });

  it('站点未配置模型时给出独立错误码', async () => {
    mockFetch({ available: false, error: 'ai-model-not-configured' }, 503);

    const result = await requestFreeformDiagnosis({
      question: '任意题',
      finalAnswer: '1',
      steps: [],
    }, { mode: 'custom', apiKey: 'sk-test' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ai-model-not-configured');
      expect(result.message).toContain('AI_MODEL');
    }
  });

  it('变式补充生成同样按请求携带凭证', async () => {
    const spy = vi.fn().mockResolvedValue(response(200, {
      available: true,
      source: 'ai',
      result: { variants: [{ stem: '已知 f(x)=x²-3x+2，求 f(3)', answer: '2' }] },
    }));
    vi.stubGlobal('fetch', spy);

    const result = await requestVariantCandidates({
      question: '已知 f(x)=x²-3x+2，求 f(2)',
      errorReason: '加法错误',
      knowledgePoint: '函数值求解',
      count: 2,
      excludeStems: [],
    }, { mode: 'custom', apiKey: 'sk-variant' });

    expect(result.ok).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/freeform-variants');
    expect(url).not.toContain('sk-variant');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.apiKey).toBe('sk-variant');
  });
});

describe('健康检查：无站点 Key 也不拦自定义模式', () => {
  it('返回服务商、模型和 customKeyReady', async () => {
    mockFetch({
      ok: true,
      ai: false,
      model: 'mock-model',
      vision: false,
      provider: 'MockProvider',
      customKeyReady: true,
    });

    const health = await checkAiHealth();
    expect(health).toEqual({
      ai: false,
      vision: false,
      provider: 'MockProvider',
      model: 'mock-model',
      visionModel: null,
      customKeyReady: true,
    });
  });
});
