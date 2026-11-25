import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// 可选 AI 兜底服务：只在配置了 AI_API_KEY 时启用，未配置时接口返回 503，前端静默回退到规则诊断。
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const AI_BASE_URL = (process.env.AI_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL ?? 'deepseek-chat';
const AI_API_KEY = process.env.AI_API_KEY ?? '';
const AI_TIMEOUT_MS = 8000;
const BODY_LIMIT = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body-too-large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function trimmedString(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';
}

function validateRequest(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const questionId = trimmedString(payload.questionId, 80);
  const stem = trimmedString(payload.stem, 800);
  const correctAnswer = trimmedString(payload.correctAnswer, 200);
  const finalAnswer = trimmedString(payload.finalAnswer, 200);
  if (!questionId || !stem || !correctAnswer || !finalAnswer) return null;
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((step) => trimmedString(step, 300)).filter(Boolean).slice(0, 8)
    : [];
  const nodes = Array.isArray(payload.nodes)
    ? payload.nodes
      .filter((node) => node && typeof node.id === 'string' && typeof node.label === 'string')
      .slice(0, 40)
      .map((node) => ({ id: node.id.slice(0, 80), label: node.label.slice(0, 80) }))
    : [];
  return { questionId, stem, correctAnswer, finalAnswer, steps, nodes };
}

// 严格校验模型返回结构；节点 ID 只接受前端提供的图谱节点，置信度最高为 medium。
function validateResult(value, allowedNodeIds) {
  if (!value || typeof value !== 'object') return null;
  const reason = trimmedString(value.reason, 400);
  const evidence = trimmedString(value.evidence, 400);
  if (!reason || !evidence) return null;

  const steps = Array.isArray(value.steps)
    ? value.steps.map((step) => trimmedString(step, 200)).filter(Boolean).slice(0, 3)
    : [];
  const weakNodeIds = Array.isArray(value.weakNodeIds)
    ? [...new Set(value.weakNodeIds.filter((id) => typeof id === 'string' && allowedNodeIds.has(id)))].slice(0, 3)
    : [];
  const confidence = value.confidence === 'low' ? 'low' : 'medium';

  return { reason, evidence, steps, weakNodeIds, confidence };
}

function buildMessages(input) {
  const nodeList = input.nodes.map((node) => `- ${node.id}：${node.label}`).join('\n') || '- （无可用节点）';
  return [
    {
      role: 'system',
      content: [
        '你是一名严谨的高中数学诊断助手。学生答案没有命中任何预设错误模式，请基于题干与学生的过程给出可能的错因推断。',
        '必须只输出一个 JSON 对象，不要输出 Markdown 或解释文字，字段如下：',
        '{"reason": "错因推断，80 字以内", "evidence": "证据与不确定性说明，80 字以内", "weakNodeIds": ["只能从给定节点 ID 中选择，1-3 个"], "steps": ["补习步骤，1-3 条，每条 40 字以内"], "confidence": "low 或 medium"}',
        '不要编造学生没有写过的步骤；证据不足时在 evidence 中说明，confidence 用 low。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `题目（${input.questionId}）：${input.stem}`,
        `参考答案：${input.correctAnswer}`,
        `学生最终答案：${input.finalAnswer}`,
        `学生解题步骤：${input.steps.length ? input.steps.map((step, index) => `\n${index + 1}. ${step}`).join('') : '（未提供）'}`,
        `可选知识点节点：\n${nodeList}`,
      ].join('\n'),
    },
  ];
}

async function diagnoseWithAi(input) {
  const allowedNodeIds = new Set(input.nodes.map((node) => node.id));
  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: buildMessages(input),
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`upstream-${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('empty-content');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('invalid-json');
  }

  const result = validateResult(parsed, allowedNodeIds);
  if (!result) throw new Error('invalid-schema');
  return result;
}

function serveStatic(request, response, pathname) {
  if (!existsSync(DIST)) {
    writeJson(response, 404, { error: 'not-found' });
    return;
  }
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html');
  }
  if (!existsSync(file)) {
    writeJson(response, 404, { error: 'not-found' });
    return;
  }
  response.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/health') {
    writeJson(response, 200, { ok: true, ai: Boolean(AI_API_KEY), model: AI_MODEL });
    return;
  }

  if (url.pathname === '/api/diagnose') {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'method-not-allowed' });
      return;
    }
    if (!AI_API_KEY) {
      writeJson(response, 503, { available: false, error: 'ai-not-configured' });
      return;
    }
    try {
      const payload = validateRequest(JSON.parse(await readBody(request)));
      if (!payload) {
        writeJson(response, 400, { available: true, error: 'invalid-request' });
        return;
      }
      const result = await diagnoseWithAi(payload);
      writeJson(response, 200, { available: true, source: 'ai', result });
    } catch (error) {
      // 超时、上游异常或结构不合格都只返回错误码，由前端保留规则诊断结果。
      writeJson(response, 502, { available: true, error: error instanceof Error ? error.message : 'ai-failed' });
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    writeJson(response, 405, { error: 'method-not-allowed' });
    return;
  }
  serveStatic(request, response, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`knowledge-detective server: http://127.0.0.1:${PORT}`);
  console.log(AI_API_KEY
    ? `AI fallback enabled: ${AI_BASE_URL} / ${AI_MODEL}`
    : 'AI fallback disabled: set AI_API_KEY to enable /api/diagnose');
});
