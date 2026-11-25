import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';

export interface MockRequest {
  method: string;
  path: string;
  authorization: string;
  apiKey: string;
  anthropicVersion: string;
  model: string;
  prompt: string;
  body: Record<string, unknown>;
}

export interface MockOptions {
  mode?: 'openai' | 'anthropic';
  delayMs?: number;
  status?: number;
  headers?: Record<string, string>;
  location?: string;
  /** 上游 HTTP 正文不是 JSON，用于验证 invalid-response。 */
  invalidUpstreamBody?: boolean;
  /** 模型文本内容覆盖；默认按提示词返回结构化 JSON。 */
  content?: string;
  /** 模型响应被截断。 */
  truncate?: boolean;
  /** GET /models 的返回；设为 null 时返回 404。 */
  models?: string[] | null;
  modelsStatus?: number;
}

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

const diagnoseResult = {
  reason: '一次项符号错误',
  evidence: '学生把 -2×(-1) 写成了 -2',
  weakNodeIds: ['function-value'],
  steps: ['先核对代入符号'],
  confidence: 'medium',
};

const ocrResult = {
  question: '已知 f(x)=x²-3x+2，求 f(2)',
  finalAnswer: '4',
  steps: ['f(2)=4-6+2=4'],
  uncertainFields: [],
  confidence: 'medium',
};

function defaultContent(prompt: string): string {
  if (prompt.includes('只回复 OK')) return 'OK';
  if (prompt.includes('变式题命题助手')) {
    return JSON.stringify({ variants: [{ stem: '已知 f(x)=x²-3x+2，求 f(3)', answer: '2' }] });
  }
  if (prompt.includes('题目转录员')) return JSON.stringify(ocrResult);
  if (prompt.includes('预设题库之外')) return JSON.stringify(freeformResult);
  if (prompt.includes('预设错误模式')) return JSON.stringify(diagnoseResult);
  return JSON.stringify(freeformResult);
}

function extractPrompt(body: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof body.system === 'string') parts.push(body.system);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const record = message as Record<string, unknown>;
    const content = record.content;
    if (typeof content === 'string') {
      parts.push(content);
      continue;
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const item = block as Record<string, unknown>;
        if (typeof item.text === 'string') parts.push(item.text);
      }
    }
  }
  return parts.join('\n');
}

export interface MockUpstream {
  port: number;
  requests: MockRequest[];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export async function freePort(): Promise<number> {
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

const cleanups: Array<() => Promise<void> | void> = [];

export function registerCleanup(cleanup: () => Promise<void> | void): void {
  cleanups.push(cleanup);
}

export async function cleanupTestKit(): Promise<void> {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) await cleanup();
  }
}

export async function startMockUpstream(options: MockOptions = {}): Promise<MockUpstream> {
  const mode = options.mode ?? 'openai';
  const requests: MockRequest[] = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw || '{}') as Record<string, unknown>;
    } catch {
      body = {};
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const record: MockRequest = {
      method: request.method ?? 'GET',
      path: url.pathname,
      authorization: String(request.headers.authorization ?? ''),
      apiKey: String(request.headers['x-api-key'] ?? ''),
      anthropicVersion: String(request.headers['anthropic-version'] ?? ''),
      model: typeof body.model === 'string' ? body.model : '',
      prompt: extractPrompt(body),
      body,
    };
    requests.push(record);

    if (url.pathname.endsWith('/models') && request.method === 'GET') {
      if (options.modelsStatus && options.modelsStatus >= 400) {
        response.writeHead(options.modelsStatus, { 'Content-Type': 'application/json' });
        response.end('{"error":"models"}');
        return;
      }
      if (options.models === null) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end('{"error":"not-found"}');
        return;
      }
      const models = options.models ?? ['model-a', 'model-b'];
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      return;
    }

    if (options.location) {
      response.writeHead(options.status ?? 302, { Location: options.location });
      response.end();
      return;
    }
    if (options.status && options.status >= 400) {
      response.writeHead(options.status, { 'Content-Type': 'application/json', ...options.headers });
      response.end('{"error":"mock-upstream"}');
      return;
    }
    if (options.invalidUpstreamBody) {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html>not json</html>');
      return;
    }

    const content = options.content ?? defaultContent(record.prompt);
    const finishReason = options.truncate
      ? (mode === 'anthropic' ? 'max_tokens' : 'length')
      : (mode === 'anthropic' ? 'end_turn' : 'stop');

    const send = () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (mode === 'anthropic') {
        response.end(JSON.stringify({
          content: [
            { type: 'thinking', thinking: '这段思考不应进入诊断 JSON' },
            { type: 'text', text: content },
          ],
          stop_reason: finishReason,
        }));
      } else {
        response.end(JSON.stringify({
          choices: [{ message: { content }, finish_reason: finishReason }],
        }));
      }
    };
    if (options.delayMs) {
      setTimeout(send, options.delayMs);
    } else {
      send();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mock upstream port unavailable');

  registerCleanup(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  return { port: address.port, requests };
}

export interface AppHealth {
  ok: boolean;
  ai: boolean;
  model: string | null;
  visionModel: string | null;
  vision: boolean;
  provider: string;
  customKeyReady: boolean;
  customKeyAvailable?: boolean;
  defaultProviderId?: string;
  providers?: Array<Record<string, unknown>>;
}

export async function waitForHealth(port: number): Promise<AppHealth> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return await response.json() as AppHealth;
    } catch {
      // 服务尚未启动。
    }
    await sleep(50);
  }
  throw new Error(`server did not start: ${port}`);
}

export interface StartedApp {
  port: number;
  health: AppHealth;
  child: ChildProcess;
}

export async function startApp(environment: Record<string, string>): Promise<StartedApp> {
  const port = await freePort();
  const child = spawn(process.execPath, [join(process.cwd(), 'server.mjs')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      AI_BASE_URL: '',
      AI_MODEL: '',
      AI_VISION_MODEL: '',
      AI_API_KEY: '',
      AI_PROVIDER_NAME: '',
      AI_PROVIDERS: '',
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});

  registerCleanup(() => new Promise<void>((resolve) => {
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
  return { port, health, child };
}

export function postJson(
  port: number,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const freeformRequest = {
  question: '已知 f(x)=x²-3x+2，求 f(2)',
  finalAnswer: '4',
  steps: ['f(2)=4-6+2=4'],
  nodes: [{ id: 'function-value', label: '函数值求解' }],
};

export const diagnoseRequest = {
  questionId: 'function-value-1',
  stem: '已知 f(x)=x²-3x+2，求 f(2)',
  correctAnswer: '0',
  finalAnswer: '4',
  steps: ['f(2)=4-6+2=4'],
  nodes: [{ id: 'function-value', label: '函数值求解' }],
};

export const variantRequest = {
  question: '已知 f(x)=x²-3x+2，求 f(2)',
  errorReason: '最后一步加法错误',
  knowledgePoint: '函数值求解',
  count: 2,
  excludeStems: [],
};

export const imageRequest = {
  image: 'data:image/png;base64,AAAA',
};

export function providerEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'mock-relay',
    label: 'Mock Relay',
    protocol: 'openai',
    baseUrl: 'https://relay.example.com/v1',
    textModels: ['mock-model'],
    visionModels: ['mock-vision'],
    customKey: true,
    jsonMode: 'json_object',
    ...overrides,
  };
}
