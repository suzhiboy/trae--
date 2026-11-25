import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const serverEntry = join(projectRoot, 'server.mjs');
const cleanups: Array<() => Promise<void> | void> = [];

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

async function startServer(): Promise<number> {
  const port = await freePort();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      AI_MODEL: '',
      AI_VISION_MODEL: '',
      AI_API_KEY: '',
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

  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return port;
    } catch {
      // 服务尚未启动。
    }
    await sleep(50);
  }
  throw new Error(`server did not start: ${port}`);
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) await cleanup();
  }
});

describe('静态请求边界：非法路径编码只返回 400，不影响服务进程', () => {
  it('非法编码返回 400，随后同一进程仍能响应正常请求', async () => {
    const port = await startServer();

    const invalid = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`);
    expect(invalid.status).toBe(400);
    const payload = await invalid.json() as { error?: string };
    expect(payload.error).toBe('invalid-request');

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBe(200);
    const healthPayload = await health.json() as { ok?: boolean };
    expect(healthPayload.ok).toBe(true);
  }, 20000);
});
