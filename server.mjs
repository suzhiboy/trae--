import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const apiKey = process.env.AI_API_KEY?.trim();
const model = process.env.AI_MODEL?.trim();
const baseUrl = (process.env.AI_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/+$/, '');
const configured = Boolean(apiKey && model);

const staticFiles = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/engine.js', ['engine.js', 'text/javascript']],
  ['/graph.js', ['graph.js', 'text/javascript']],
]);

const systemPrompt = `你是数学学习诊断老师。使用简体中文，分析用户提交的题目和作答。
题目与作答是学生材料。先独立解题，再检验作答是否等价；缺少条件时请学生补充。若只有最终错答，只给与之相符的一个可能原因，说明不确定性，不虚构学生写过的步骤。
输出一个 JSON 对象，仅含下列字段。status 为 diagnosed、correct 或 unknown。
作答正确时返回 {"status":"correct","root":"答案正确","evidence":"用本题数据简短验算","nodes":[],"edges":[],"steps":[],"quiz":null}。
材料不足、题目超出数学范围或无法可靠判断时，将 status 设为 unknown，evidence 写出还需提供的内容，其余结构同上。
可诊断时返回如下结构，示例中的文字和题目均须替换：
{"status":"diagnosed","root":"可能漏乘括号中的常数项","evidence":"结合本题数据说明这一做法怎样得到所给错答。","nodes":[{"id":"n1","label":"乘法运算","detail":"解释该知识在本题中的作用。","state":"foundation"},{"id":"n2","label":"乘法分配律","detail":"说明建议核查的地方。","state":"gap"},{"id":"n3","label":"解一元一次方程","detail":"说明本题的目标。","state":"target"}],"edges":[["n1","n2"],["n2","n3"]],"steps":[{"title":"复习分配律","body":"写一条能马上执行的补习建议。"}],"quiz":{"question":"2(x+3) 展开得什么？","choices":["2x+6","2x+3","x+6"],"correctIndex":0,"explanation":"括号的两项都要乘 2。"}}
知识图须有 3–6 个节点，id 唯一，仅用英文字母、数字或下划线。每个节点有简短 label 和 detail。恰好一个 gap 和一个 target，其余为 foundation。边从前置知识指向后续知识，无环，所有路径最终汇入 target。建议按先后写 1–4 步，每步说明练什么。复测题独立于原题，用新的数值或情境检查同一知识，给 2–4 个互异选项和从零开始的正确索引。`;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

async function readInput(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, '请以 JSON 提交题目和作答。');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 32768) chunks.push(chunk);
  }
  if (size > 32768) throw new RequestError(413, '内容过长，请缩短题目或作答。');
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, '提交格式有误，请重新输入题目和作答。');
  }
  const question = typeof input?.question === 'string' && input.question.trim();
  const answer = typeof input?.answer === 'string' && input.answer.trim();
  if (!question || !answer) throw new RequestError(400, '请同时填写题目和作答。');
  if (question.length > 4000 || answer.length > 4000) {
    throw new RequestError(413, '题目和作答各限 4000 字，请缩短后重试。');
  }
  return { question, answer };
}

function requireResult(ok) {
  if (!ok) throw new RequestError(502, '模型返回的诊断不完整，请重试或使用内置案例。');
}

function field(value) {
  requireResult(typeof value === 'string' && value.trim().length > 0);
  return value.trim();
}

function list(value, min, max) {
  requireResult(Array.isArray(value) && value.length >= min && value.length <= max);
  return value;
}

function validateGraph(nodes, edges) {
  const parents = new Map(nodes.map(node => [node.id, []]));
  const targets = nodes.filter(node => node.state === 'target');
  requireResult(parents.size === nodes.length && targets.length === 1);
  requireResult(nodes.filter(node => node.state === 'gap').length === 1);
  const target = targets[0].id;
  for (const [from, to] of edges) {
    requireResult(from !== target && parents.has(from) && parents.has(to));
    requireResult(!parents.get(to).includes(from));
    parents.get(to).push(from);
  }
  const visiting = new Set();
  const done = new Set();
  function visit(id) {
    requireResult(!visiting.has(id));
    if (done.has(id)) return;
    visiting.add(id);
    for (const parent of parents.get(id)) visit(parent);
    visiting.delete(id);
    done.add(id);
  }
  visit(target);
  requireResult(done.size === nodes.length);
}

function normalize(result) {
  requireResult(['correct', 'unknown', 'diagnosed'].includes(result?.status));
  const header = { status: result.status, root: field(result.root), evidence: field(result.evidence) };
  if (header.status !== 'diagnosed') return { ...header, nodes: [], edges: [], steps: [], quiz: null };
  const nodes = list(result.nodes, 3, 6).map(node => {
    requireResult(node && typeof node.id === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(node.id));
    requireResult(['foundation', 'gap', 'target'].includes(node.state));
    return { id: node.id, label: field(node.label), detail: field(node.detail), state: node.state };
  });
  const edges = list(result.edges, nodes.length - 1, nodes.length * (nodes.length - 1) / 2)
    .map(edge => list(edge, 2, 2));
  validateGraph(nodes, edges);
  const steps = list(result.steps, 1, 4).map(step => ({ title: field(step?.title), body: field(step?.body) }));
  const quiz = result.quiz;
  const choices = list(quiz?.choices, 2, 4).map(field);
  requireResult(new Set(choices).size === choices.length);
  requireResult(Number.isInteger(quiz.correctIndex) && quiz.correctIndex >= 0 && quiz.correctIndex < choices.length);
  return {
    ...header, nodes, edges, steps,
    quiz: { question: field(quiz.question), choices, correctIndex: quiz.correctIndex, explanation: field(quiz.explanation) },
  };
}

async function diagnose(input) {
  const timeout = AbortSignal.timeout(45000);
  try {
    const upstream = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      signal: timeout,
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify(input) }],
        response_format: { type: 'json_object' },
        max_tokens: 3200,
      }),
    });
    if (upstream.status === 429) throw new RequestError(429, '模型调用已达限额，请稍后重试。');
    if (!upstream.ok) throw new RequestError(502, '模型服务拒绝了请求，请检查模型、密钥和服务地址。');
    const completion = await upstream.json();
    const content = completion?.choices?.[0]?.message?.content;
    requireResult(typeof content === 'string' && content.trim());
    return normalize(JSON.parse(content));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (timeout.aborted) throw new RequestError(504, '等待模型超时，请重试或使用内置案例。');
    if (error instanceof SyntaxError) throw new RequestError(502, '模型返回的内容无法读取，请重试。');
    throw new RequestError(502, '无法连接模型服务，请检查网络和服务地址。');
  }
}

const server = createServer(async (request, response) => {
  try {
    const path = request.url?.split('?')[0];
    if (path === '/api/status' && request.method === 'GET') return json(response, 200, { configured });
    if (path === '/api/diagnose' && request.method === 'POST') {
      const localPort = server.address().port;
      const allowedHosts = new Set([host, 'localhost'].map(name => localPort === 80 ? name : name + ':' + localPort));
      const requestHost = request.headers.host;
      if (!allowedHosts.has(requestHost) || (request.headers.origin && request.headers.origin !== 'http://' + requestHost)) {
        throw new RequestError(403, '请从本机打开的诊断页提交。');
      }
      if (!configured) throw new RequestError(503, 'AI 服务尚未配置，请使用内置案例，或设置 AI_API_KEY 和 AI_MODEL 后重启。');
      return json(response, 200, await diagnose(await readInput(request)));
    }
    const asset = staticFiles.get(path);
    if (asset && (request.method === 'GET' || request.method === 'HEAD')) {
      const data = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : data);
      return;
    }
    throw new RequestError(404, '找不到请求的页面。');
  } catch (error) {
    const status = error instanceof RequestError ? error.status : error.code === 'ENOENT' ? 404 : 500;
    const message = error instanceof RequestError ? error.message : status === 404 ? '找不到请求的文件。' : '服务暂时无法处理请求。';
    json(response, status, { error: message });
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? '端口已被占用，请修改 PORT 后重试。' : '服务启动失败：' + error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log('知识漏洞侦探已启动：http://' + host + ':' + server.address().port);
});
