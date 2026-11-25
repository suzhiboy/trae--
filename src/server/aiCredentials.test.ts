import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const serverEntry = join(projectRoot, 'server.mjs');
const cleanups: Array<() => Promise<void> | void> = [];

const freeformResult = {
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

interface UpstreamRequest {
  authorization: string;
  userContent: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function freePort(): Promise<number> {
  const server = createNetServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function startMockUpstream(): Promise<{ port: number; requests: UpstreamRequest[] }> {
  const requests: UpstreamRequest[] = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let payload: unknown = {};
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      payload = {};
    }
    const record = payload && typeof payload === 'object'
      ? payload as Record<string, unknown>
      : {};
    const messages = Array.isArray(record.messages) ? record.messages : [];
    const find = (role: string) => messages.find(
      (message): message is { role: string; content: string } =>
        Boolean(message) && typeof message === 'object'
        && (message as Record<string, unknown>).role === role
        && typeof (message as Record<string, unknown>).content === 'string',
    );
    const system = find('system')?.content ?? '';
    const userContent = find('user')?.content ?? '';
    const authorization = String(request.headers.authorization ?? '');
    requests.push({ authorization, userContent });

    if (authorization.includes('bad-key')) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end('{"error":"invalid-key"}');
      return;
    }

    const content = system.includes('变式题命题助手')
      ? { variants: [{ stem: '已知 f(x)=x²-3x+2，求 f(3)', answer: '2' }] }
      : freeformResult;
    const delay = authorization.includes('user-a') ? 80 : 5;
    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }],
      }));
    }, delay);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mock upstream port unavailable');

  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  return { port: address.port, requests };
}

async function waitForHealth(port: number): Promise<{ ai: boolean; model: string | null; customKeyReady: boolean; provider: string | null }> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return await response.json() as {
          ai: boolean;
          model: string | null;
          customKeyReady: boolean;
          provider: string | null;
        };
      }
    } catch {
      // 服务尚未启动。
    }
    await sleep(50);
  }
  throw new Error(`server did not start: ${port}`);
}

async function startApp(
  mockPort: number,
  environment: Record<string, string>,
): Promise<{ port: number; health: Awaited<ReturnType<typeof waitForHealth>> }> {
  const port = await freePort();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      AI_BASE_URL: `http://127.0.0.1:${mockPort}`,
      AI_MODEL: 'mock-model',
      AI_VISION_MODEL: 'mock-model',
      AI_API_KEY: '',
      AI_PROVIDER_NAME: 'MockProvider',
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});

  cleanups.push(() => new Promise<void>((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  }));

  const health = await waitForHealth(port);
  return { port, health };
}

function postFreeform(
  port: number,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/freeform-diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: '已知 f(x)=x²-3x+2，求 f(2)',
      finalAnswer: '4',
      steps: ['f(2)=4-6+2=4'],
      nodes: [{ id: 'function-value', label: '函数值求解' }],
      ...body,
    }),
  });
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) await cleanup();
  }
});

describe('服务端按请求选择 AI 凭证', () => {
  it('默认站点凭证正常工作', async () => {
    const mock = await startMockUpstream();
    const app = await startApp(mock.port, { AI_API_KEY: 'site-key' });

    expect(app.health).toMatchObject({
      ai: true,
      model: 'mock-model',
      provider: 'MockProvider',
      customKeyReady: true,
    });

    const response = await postFreeform(app.port, { credentialMode: 'site' });
    expect(response.status).toBe(200);
    const payload = await response.json() as { credentialMode?: string };
    expect(payload.credentialMode).toBe('site');
    expect(mock.requests[mock.requests.length - 1]?.authorization).toBe('Bearer site-key');
  }, 20000);

  it('只有自定义 Key、站点没有默认 Key 时也能诊断', async () => {
    const mock = await startMockUpstream();
    const app = await startApp(mock.port, { AI_API_KEY: '' });

    expect(app.health).toMatchObject({
      ai: false,
      model: 'mock-model',
      customKeyReady: true,
    });

    const response = await postFreeform(app.port, {
      credentialMode: 'custom',
      apiKey: 'user-a-key',
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { credentialMode?: string };
    expect(payload.credentialMode).toBe('custom');
    expect(mock.requests[mock.requests.length - 1]?.authorization).toBe('Bearer user-a-key');

    const siteResponse = await postFreeform(app.port, { credentialMode: 'site' });
    expect(siteResponse.status).toBe(503);
    expect((await siteResponse.json() as { error?: string }).error).toBe('ai-not-configured');
  }, 20000);

  it('自定义 Key 无效时不会回退到站点账户', async () => {
    const mock = await startMockUpstream();
    const app = await startApp(mock.port, { AI_API_KEY: 'site-key' });

    const response = await postFreeform(app.port, {
      credentialMode: 'custom',
      apiKey: 'bad-key',
    });
    expect(response.status).toBe(401);
    const payload = await response.json() as { error?: string };
    expect(payload.error).toBe('custom-key-invalid');

    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0].authorization).toBe('Bearer bad-key');
    expect(mock.requests.some((request) => request.authorization === 'Bearer site-key')).toBe(false);
  }, 20000);

  it('两个并发请求各自使用自己的 Key，不共享鉴权状态', async () => {
    const mock = await startMockUpstream();
    const app = await startApp(mock.port, { AI_API_KEY: '' });

    const [responseA, responseB] = await Promise.all([
      postFreeform(app.port, {
        question: '题A：已知 f(x)=x²-3x+2，求 f(2)',
        credentialMode: 'custom',
        apiKey: 'user-a-key',
      }),
      postFreeform(app.port, {
        question: '题B：已知 f(x)=x²-3x+2，求 f(2)',
        credentialMode: 'custom',
        apiKey: 'user-b-key',
      }),
    ]);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(mock.requests).toHaveLength(2);

    const requestA = mock.requests.find((request) => request.authorization === 'Bearer user-a-key');
    const requestB = mock.requests.find((request) => request.authorization === 'Bearer user-b-key');
    expect(requestA?.userContent).toContain('题A');
    expect(requestB?.userContent).toContain('题B');
  }, 20000);
});
