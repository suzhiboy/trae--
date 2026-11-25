import {
  cleanStepLine,
  evaluateExpression,
  hasAmbiguousLeadingLabel,
  type CleanStepOptions,
} from './stepAnalysis';
import { normalizeAnswer } from './normalize';
import type { AiClaim, VerificationState } from '../types';

/**
 * 任意题核验的独立计算器。
 * 只对能可靠复算的结论给出 verified / conflict；其余一律 unverified，
 * 不把自然语言、方程变形或含参讨论硬判成错误。
 */

export interface AnswerCheck {
  status: VerificationState;
  /** 本地复算得到的规范答案；无法算出时为 null。 */
  expected: string | null;
  detail: string;
  kind: 'function' | 'equation' | 'sequence' | 'set' | 'arithmetic' | null;
}

export interface StepCheck {
  status: 'consistent' | 'inconsistent' | 'unrecognized';
  expectedValue: string | null;
  detail: string;
}

export interface EquationChainCheck {
  status: 'consistent' | 'inconsistent' | 'unrecognized';
  segments: string[];
  values: number[];
  recomputed: number | null;
  wrongSegmentIndex: number | null;
}

const superscriptDigits: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

export function isClose(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

/** 保留中文与运算符号的数学文本归一化。 */
function normalizeMathText(raw: string): string {
  return String(raw ?? '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => superscriptDigits[digit]).join('')}`)
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '')
    .replace(/\$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .toLowerCase();
}

/** 去掉“∴、所以、即、则”等连接词，保留可计算的等式主体。 */
function cleanLine(raw: string, options: CleanStepOptions): string {
  return cleanStepLine(raw, options)
    .replace(/^\\(?:therefore|because)/, '')
    .replace(/^[∴∵]/, '')
    .replace(/^(?:所以|因此|即|则|得|故)[:：]?/, '');
}

function substituteVariable(expression: string, variable: string, value: number): number | null {
  const literal = losslessNumber(value);
  if (literal === null) return null;
  const pattern = new RegExp(`(?<![a-z])${variable}(?![a-z])`, 'g');
  return evaluateExpression(expression.replace(pattern, `(${literal})`));
}

/**
 * 回送到求值器的数字必须无损：formatNumber 会舍入到 6 位小数，只能用于展示。
 * 科学计数法形式的数字当前求值器不支持，返回 null 由调用方降级为未核验。
 */
function losslessNumber(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  if (Object.is(value, -0)) return '0';
  const text = String(value);
  return /[eE]/.test(text) ? null : text;
}

export function parseNumericAnswer(answer: string): number | null {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return null;

  const direct = evaluateExpression(normalized);
  if (direct !== null) return direct;

  const afterEquals = normalized.split('=').pop();
  if (!afterEquals) return null;
  const evaluated = evaluateExpression(afterEquals);
  if (evaluated !== null) return evaluated;
  const value = Number(afterEquals);
  return Number.isFinite(value) ? value : null;
}

/** 逐段复算 a=b=c 型等式链。 */
export function analyzeEquationChain(
  raw: string,
  options: CleanStepOptions = {},
): EquationChainCheck {
  const line = cleanLine(raw, options);
  const empty: EquationChainCheck = {
    status: 'unrecognized',
    segments: [],
    values: [],
    recomputed: null,
    wrongSegmentIndex: null,
  };
  if (!line) return empty;

  const rawSegments = line.split('=');
  while (rawSegments.length > 0 && rawSegments[0] === '') rawSegments.shift();
  while (rawSegments.length > 0 && rawSegments[rawSegments.length - 1] === '') rawSegments.pop();
  if (rawSegments.length < 2) return empty;

  const segments = [...rawSegments];
  // f(-1)=1-2+3=2：左侧函数调用只是标签，真正要复算的是右侧等式链。
  if (segments.length > 1 && /^[a-z]\s*\([^()]*\)$/.test(segments[0])) segments.shift();
  if (segments.length < 2) return { ...empty, segments };

  const values = segments.map((segment) => evaluateExpression(segment));
  if (values.some((value) => value === null)) {
    return { ...empty, segments };
  }

  const numbers = values as number[];
  const first = numbers[0];
  const wrongIndex = numbers.findIndex((value) => !isClose(value, first));
  if (wrongIndex === -1) {
    return {
      status: 'consistent',
      segments,
      values: numbers,
      recomputed: first,
      wrongSegmentIndex: null,
    };
  }

  return {
    status: 'inconsistent',
    segments,
    values: numbers,
    recomputed: first,
    wrongSegmentIndex: wrongIndex,
  };
}

/* ---------- 函数代入 ---------- */

interface FunctionModel {
  name: string;
  variable: string;
  body: string;
}

function parseFunctionModel(question: string): FunctionModel | null {
  const text = normalizeMathText(question);
  const match = /([a-z])\s*\(\s*([a-z])\s*\)\s*=\s*([^,，。;；\n]+)/i.exec(text);
  if (!match) return null;
  const body = match[3].split(/求|则|且|，|,|。|；|;/)[0];
  if (!body) return null;
  return {
    name: match[1].toLowerCase(),
    variable: match[2].toLowerCase(),
    body,
  };
}

function parseFunctionCall(text: string, name: string): { argument: number; rest: string } | null {
  const normalized = normalizeMathText(text);
  const pattern = new RegExp(`${name}\\s*\\(\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)`);
  const match = pattern.exec(normalized);
  if (!match) return null;
  const argument = Number(match[1]);
  if (!Number.isFinite(argument)) return null;
  return { argument, rest: normalized.slice(match.index + match[0].length) };
}

function evaluateFunctionAt(model: FunctionModel, argument: number): number | null {
  return substituteVariable(model.body, model.variable, argument);
}

/**
 * 题干最后一个提问动词（求 / 计算 / 解）的位置；没有则返回 null。
 * 核验器据此判断“题目所求”，题干里给出的条件不会被当成求解目标。
 * “解”只在后面紧跟方程、表达式或“方程/下列”时才算提问，
 * 以免把“方程的解”“解法”“解释”里的名词误当成提问。
 */
function findAskStart(text: string): { index: number; length: number } | null {
  const matches = [...text.matchAll(/计算|求|解(?=[0-9a-z(（:：方下])/g)];
  const match = matches[matches.length - 1];
  if (!match || match.index === undefined) return null;
  return { index: match.index, length: match[0].length };
}

/** 提问动词之后、到题干末尾的内容，去掉句末标点。 */
function askClauseOf(text: string): string {
  const ask = findAskStart(text);
  if (!ask) return text;
  return text.slice(ask.index + ask.length).replace(/[。；;？?、]+$/, '');
}

/** 提取“求/计算”之后完整可识别的所求表达式；含其他问法或分句时返回 null。 */
function parseRequestedFunctionExpression(question: string): string | null {
  const text = normalizeMathText(question);
  const markers = text.match(/求|计算/g) ?? [];
  if (markers.length !== 1) return null;

  // 只去掉真正的句末标点。! 可能是阶乘，属于数学内容，必须留在表达式里。
  const match = /^([a-z0-9+\-*/^().]+?)(?:的值|等于多少|是多少|为多少)?$/.exec(askClauseOf(text));
  return match ? match[1] : null;
}

/**
 * 只对能完整识别的所求表达式求值；残留字母或断开的调用一律返回 null。
 * 实参、函数值和后续运算全程用数字计算，不经过字符串舍入。
 */
function evaluateFunctionExpression(model: FunctionModel, expression: string): number | null {
  const text = normalizeMathText(expression);
  let index = 0;

  const isValueStart = (char: string | undefined): boolean =>
    char !== undefined && /[0-9.a-zπ(]/i.test(char);

  function parseExpression(): number | null {
    let value = parseTerm();
    while (value !== null && (text[index] === '+' || text[index] === '-')) {
      const operator = text[index];
      index += 1;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number | null {
    let value = parseUnary();
    while (value !== null) {
      const char = text[index];
      if (char !== '*' && char !== '/' && !isValueStart(char)) break;
      // 显式乘除号才消费一个字符；隐式乘法的右操作数就从当前字符开始。
      const explicit = char === '*' || char === '/';
      if (explicit) index += 1;
      const right = parseUnary();
      if (right === null) return null;
      value = char === '/' ? value / right : value * right;
    }
    return value;
  }

  function parseUnary(): number | null {
    if (text[index] === '+' || text[index] === '-') {
      const operator = text[index];
      index += 1;
      const value = parseUnary();
      if (value === null) return null;
      return operator === '-' ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number | null {
    const base = parsePrimary();
    if (base === null || text[index] !== '^') return base;
    index += 1;
    const exponent = parseUnary();
    if (exponent === null) return null;
    return base ** exponent;
  }

  function parsePrimary(): number | null {
    const char = text[index];
    if (char === undefined) return null;

    if (char === '(') {
      index += 1;
      const value = parseExpression();
      if (value === null || text[index] !== ')') return null;
      index += 1;
      return value;
    }

    if (/[0-9.]/.test(char)) {
      const match = /^(?:\d+\.?\d*|\.\d+)/.exec(text.slice(index));
      if (!match) return null;
      index += match[0].length;
      const value = Number(match[0]);
      return Number.isFinite(value) ? value : null;
    }

    if (char === 'π') {
      index += 1;
      return Math.PI;
    }

    if (/[a-z]/i.test(char)) {
      const call = new RegExp(`^${model.name}\\(`).exec(text.slice(index));
      // 只认题干里的这个函数；其他字母说明所求表达式没有被完整识别。
      if (!call) return null;
      index += call[0].length;
      const argument = parseExpression();
      if (argument === null || text[index] !== ')') return null;
      index += 1;
      return evaluateFunctionAt(model, argument);
    }

    return null;
  }

  const value = parseExpression();
  if (value === null || index !== text.length || !Number.isFinite(value)) return null;
  return value;
}

function firstValueAfterCall(rest: string): number | null {
  const body = rest.replace(/^=/, '');
  if (!body) return null;
  for (const segment of body.split('=').filter(Boolean)) {
    const value = evaluateExpression(segment);
    if (value !== null) return value;
  }
  return null;
}

interface FunctionStepCheck {
  expectedValue: number;
  studentValue: number | null;
  detail: string;
}

function checkFunctionStep(question: string, quote: string): FunctionStepCheck | null {
  const model = parseFunctionModel(question);
  if (!model) return null;
  const normalizedQuote = normalizeMathText(quote);
  const calls = normalizedQuote.match(new RegExp(`(?<![a-z])${model.name}\\s*\\(`, 'g')) ?? [];
  // 一行里出现多个函数调用（如 f(1)+f(2)）时，不能用第一次调用的值代表整行。
  if (calls.length !== 1) return null;
  const call = parseFunctionCall(normalizedQuote, model.name);
  if (!call) return null;
  const expected = evaluateFunctionAt(model, call.argument);
  if (expected === null) return null;

  // 先看整条等式链：避免“第一段算对了、最后一段写错”被当成正确步骤。
  const chain = analyzeEquationChain(quote);
  let studentValue = firstValueAfterCall(call.rest);
  if (chain.status === 'inconsistent' && chain.wrongSegmentIndex !== null) {
    studentValue = chain.values[chain.wrongSegmentIndex];
  } else if (chain.status === 'consistent') {
    studentValue = chain.recomputed;
  }

  if (studentValue === null) {
    return {
      expectedValue: expected,
      studentValue: null,
      detail: `把 ${model.name}(${formatNumber(call.argument)}) 代入 ${model.name}(${model.variable})=${model.body}，复算应为 ${formatNumber(expected)}。`,
    };
  }

  return {
    expectedValue: expected,
    studentValue,
    detail: isClose(studentValue, expected)
      ? `把 ${model.name}(${formatNumber(call.argument)}) 代入 ${model.name}(${model.variable})=${model.body}，复算得到 ${formatNumber(expected)}，与这一步一致。`
      : `把 ${model.name}(${formatNumber(call.argument)}) 代入 ${model.name}(${model.variable})=${model.body}，复算应为 ${formatNumber(expected)}；这一步得到 ${formatNumber(studentValue)}。`,
  };
}

function checkFunctionAnswer(question: string, _steps: string[], answer: string): AnswerCheck | null {
  const model = parseFunctionModel(question);
  if (!model) return null;

  // 只按题干完整所求的表达式复算；学生步骤里的中间函数值不能替代最终所求。
  const expression = parseRequestedFunctionExpression(question);
  if (!expression) {
    return {
      status: 'unverified',
      expected: null,
      detail: '题干所求不是一个可完整识别的函数值表达式（可能是组合运算、含参讨论或附加问法），本地不据此判定答案对错。',
      kind: 'function',
    };
  }

  const expected = evaluateFunctionExpression(model, expression);
  if (expected === null) {
    return {
      status: 'unverified',
      expected: null,
      detail: `题干要求计算 ${expression}，超出本地可完整复算的范围，保留原答案不做判定。`,
      kind: 'function',
    };
  }

  const expectedText = formatNumber(expected);
  // 答案可以是一个数，也可以是同一个函数的表达式（如 2f(3)），两者用同一套求值规则。
  const claimed = parseNumericAnswer(answer)
    ?? evaluateFunctionExpression(model, normalizeMathText(answer));
  const status = compareAnswerValue(answer, expected, claimed);
  if (status === 'unverified') return unparsableValue(answer, expectedText, 'function');

  return {
    status,
    expected: expectedText,
    detail: status === 'verified'
      ? `把 ${expression} 代入题干函数，复算得到 ${expectedText}，与答案一致。`
      : `把 ${expression} 代入题干函数，复算得到 ${expectedText}，与答案「${answer}」不一致。`,
    kind: 'function',
  };
}

/* ---------- 一元二次 / 一元一次方程 ---------- */

interface EquationModel {
  left: string;
  right: string;
  variable: string;
}

/** 分隔数学表达式的字符：空白、中文、分句标点和引号。其余字符都属于同一个数学片段。 */
const EXPRESSION_SEPARATOR = /[\s\u4e00-\u9fff，,。；;：:、？?！"'“”‘’]/;

/**
 * 提问部分没有重新写出方程、而是指向“题干里那个方程的解”的问法。
 * 其他问法（如“两根之和”）所求的不是根集，方程核验器不适用。
 */
const SOLUTION_ASK = /^(?:下列|这个|该|此|已知)?(?:方程组?|等式)?(?:的)?(?:实数解集|解集|所有(?:实数)?(?:根|解)|实数根|实数解|根|解)$/;

/**
 * 找出题目要求求解的方程：把指定范围内的题干切成“数学片段”，含等号的片段必须
 * 整体是左表达式=右表达式。π、根号、绝对值等未支持的符号留在片段内，由多项式
 * 解析器拒绝整题；不会从片段中间截出一段看起来能解的方程。
 */
function parseEquationModel(question: string): EquationModel | null {
  const text = normalizeMathText(question);

  // 先确认题目所求：题干里给出的方程只是条件时，不能拿它的根集去判定答案。
  let scope = text;
  let askedVariable: string | null = null;
  if (findAskStart(text)) {
    const clause = askClauseOf(text);
    if (clause.includes('=')) {
      scope = clause;
    } else if (!SOLUTION_ASK.test(clause)) {
      // “求 x 的值”：提问的是方程里的未知数本身，同样属于求根；其他对象（如两根之和）不是。
      const asked = /^([a-z])(?:的值)?$/.exec(clause);
      if (!asked) return null;
      askedVariable = asked[1];
    }
  }

  const candidates: EquationModel[] = [];
  let start = -1;

  const flush = (end: number) => {
    if (start === -1) return;
    const run = scope.slice(start, end);
    start = -1;
    // 等号必须恰好一个，且两侧都非空。
    const parts = run.split('=');
    if (parts.length !== 2) return;
    const [left, right] = parts as [string, string];
    if (!left || !right) return;
    // f(x)=... 是函数定义，不是待解方程。
    if (/^[a-z]\(/.test(left)) return;
    // x=2、a1=2、s5=40 是答案声明或数列参数，不是可代回检验的方程。
    if (/^[a-z]$/.test(left) && !/[a-z]/.test(right)) return;
    if (/^[a-z][0-9]+$/.test(left)) return;

    const variableMatch = /[a-z]/.exec(left + right);
    if (!variableMatch) return;
    candidates.push({ left, right, variable: variableMatch[0] });
  };

  for (let index = 0; index < scope.length; index += 1) {
    if (EXPRESSION_SEPARATOR.test(scope[index])) {
      flush(index);
    } else if (start === -1) {
      start = index;
    }
  }
  flush(scope.length);

  // 题干里出现多个方程时无法确定求解目标，整题不做本地判定。
  if (candidates.length !== 1) return null;
  const [candidate] = candidates as [EquationModel];
  // 问的是别的字母时（如“求 a 的值”而方程里只有 x），所求不是这个方程的根。
  return askedVariable === null || askedVariable === candidate.variable ? candidate : null;
}

/** 根必须是纯数字四则运算与括号组成的完整表达式；π、根号、字母等不解析。 */
function evaluateRootExpression(expression: string): number | null {
  if (!expression || !/^[0-9.+\-*/^()]+$/.test(expression)) return null;
  return evaluateExpression(expression);
}

/**
 * 把答案解析成完整的解集。每个分支都必须被完整消费：出现无法解析的片段时
 * complete 为 false，调用方不能把“能解析的那几个根”当成完整答案。
 */
function parseRootAnswer(answer: string): { roots: number[]; complete: boolean } {
  // 每个分支末尾的句末标点只是行文，不属于根。英文句点只在分支最末尾时才是标点，
  // 3.5 这样后面还有数字的仍是小数；! 可能是阶乘，保留。
  const parts = normalizeMathText(answer)
    .split(/或|,|、|和|及/)
    .map((part) => part.replace(/[。；;？?.]+$/, '').trim())
    .filter(Boolean);
  const roots: number[] = [];
  let complete = parts.length > 0;

  const add = (value: number | null) => {
    if (value === null) {
      complete = false;
      return;
    }
    if (!roots.some((root) => isClose(root, value))) roots.push(value);
  };

  for (const part of parts) {
    const matched = /x\s*[0-9]*\s*=\s*(.+)/.exec(part);
    const expression = (matched ? matched[1] : part).trim();
    // x=±1 表示两个根；其余写法按单个根的完整表达式解析。
    const signed = /^±(.+)$/.exec(expression);
    if (signed) {
      add(evaluateRootExpression(`-${signed[1]}`));
      add(evaluateRootExpression(signed[1]));
      continue;
    }
    add(evaluateRootExpression(expression));
  }

  return { roots, complete };
}

/** 只有完整答案就是“无解”时才承认，避免把“不是无解”误认成无解。 */
const NO_SOLUTION_ANSWERS = new Set(['无实数解', '无解', '无实数根', '无实根', '空集', '∅', '{}']);

/**
 * 判断一份答案是否在断言“没有解”。诊断、变式筛选和变式作答判分共用这一语义，
 * 三处对“无实数解 / 无解 / ∅”的认定保持一致。
 */
export function isNoSolutionAnswer(answer: string): boolean {
  const text = normalizeAnswer(answer)
    .replace(/[。.!！]/g, '')
    .replace(/^x[∈=]/, '');
  return NO_SOLUTION_ANSWERS.has(text);
}

function equationValueAt(model: EquationModel, value: number): number | null {
  const left = substituteVariable(model.left, model.variable, value);
  const right = substituteVariable(model.right, model.variable, value);
  if (left === null || right === null) return null;
  return left - right;
}

/* ---------- 多项式解析：按结构确定次数，不靠采样点猜次数 ---------- */

const MAX_POLYNOMIAL_DEGREE = 8;
/** 首项系数相对其余系数过小时，次数在数值上不可靠，整题降级。 */
const DEGREE_AMBIGUOUS_RATIO = 1e-9;
/** 判别式相对量级不超过它时视为重根；双精度噪声约在 1e-16 量级。 */
const DISCRIMINANT_RELATIVE_EPSILON = 1e-14;
/** 抵消噪声的相对量级：十进制小数做加减会产生约 1e-16 的相对误差。 */
const CANCELLATION_NOISE_RATIO = 1e-12;

/**
 * 整个多项式都小于这个量级时，无法区分“恒等式的抵消噪声”和“很小的非零常数”。
 * 以表达式中数字（不含指数位置）的最大量级为基准。
 */
function polynomialNoiseFloor(expression: string): number {
  const literals = expression.replace(/\^\d+/g, '').match(/\d+(?:\.\d+)?/g);
  if (!literals || literals.length === 0) return CANCELLATION_NOISE_RATIO;
  return CANCELLATION_NOISE_RATIO * Math.max(...literals.map(Number));
}

/**
 * 只去掉精确为 0 的最高次项。不能按容差删项：一个很小的非零首项可能带着
 * 一个很大的根，删掉它再声称“解集完整”就会漏根。
 */
function trimPolynomial(coefficients: number[]): number[] {
  const result = [...coefficients];
  while (result.length > 0 && result[result.length - 1] === 0) result.pop();
  return result;
}

function addPolynomial(left: number[], right: number[]): number[] {
  const size = Math.max(left.length, right.length);
  const result = new Array<number>(size).fill(0);
  for (let index = 0; index < size; index += 1) {
    result[index] = (left[index] ?? 0) + (right[index] ?? 0);
  }
  return trimPolynomial(result);
}

function scalePolynomial(value: number[], factor: number): number[] {
  return trimPolynomial(value.map((coefficient) => coefficient * factor));
}

function multiplyPolynomial(left: number[], right: number[]): number[] | null {
  if (left.length === 0 || right.length === 0) return [];
  if (left.length + right.length - 2 > MAX_POLYNOMIAL_DEGREE) return null;
  const result = new Array<number>(left.length + right.length - 1).fill(0);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      result[leftIndex + rightIndex] += left[leftIndex] * right[rightIndex];
    }
  }
  return trimPolynomial(result);
}

function dividePolynomial(numerator: number[], denominator: number[]): number[] | null {
  // 只允许除以非零常数；除以含变量的表达式属于分式方程，超出本地求根范围。
  if (denominator.length !== 1) return null;
  if (denominator[0] === 0) return null;
  return numerator.map((coefficient) => coefficient / denominator[0]);
}

type PolynomialToken =
  | { type: 'number'; value: number }
  | { type: 'variable' }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function tokenizePolynomial(expression: string, variable: string): PolynomialToken[] | null {
  const tokens: PolynomialToken[] = [];
  let index = 0;
  let previous: 'value' | 'op' | 'lparen' | null = null;

  const pushValue = (token: PolynomialToken) => {
    if (previous === 'value') tokens.push({ type: 'op', value: '*' });
    tokens.push(token);
    previous = 'value';
  };

  while (index < expression.length) {
    const char = expression[index];

    if (/[0-9.]/.test(char)) {
      const match = /^(?:\d+\.?\d*|\.\d+)/.exec(expression.slice(index));
      if (!match) return null;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return null;
      pushValue({ type: 'number', value });
      index += match[0].length;
      continue;
    }

    if (/[a-z]/.test(char)) {
      if (char !== variable) return null;
      pushValue({ type: 'variable' });
      index += 1;
      continue;
    }

    if (char === '(') {
      pushValue({ type: 'lparen' });
      previous = 'lparen';
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'rparen' });
      previous = 'value';
      index += 1;
      continue;
    }

    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ type: 'op', value: char });
      previous = 'op';
      index += 1;
      continue;
    }

    return null;
  }

  return tokens.length > 0 ? tokens : null;
}

/** 解析为系数数组（下标即次数）；零多项式返回空数组，无法解析返回 null。 */
function parsePolynomial(expression: string, variable: string): number[] | null {
  const tokenized = tokenizePolynomial(expression, variable);
  if (!tokenized) return null;
  const tokens: PolynomialToken[] = tokenized;
  let index = 0;

  const current = (): PolynomialToken | undefined => tokens[index];
  const isOperator = (token: PolynomialToken | undefined, values: string[]): boolean =>
    token?.type === 'op' && values.includes(token.value);
  const operatorValue = (): '+' | '-' | '*' | '/' | '^' =>
    (tokens[index] as { type: 'op'; value: '+' | '-' | '*' | '/' | '^' }).value;

  function parseExpression(): number[] | null {
    let value = parseTerm();
    while (value !== null && isOperator(current(), ['+', '-'])) {
      const operator = operatorValue();
      index += 1;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+'
        ? addPolynomial(value, right)
        : addPolynomial(value, scalePolynomial(right, -1));
    }
    return value;
  }

  function parseTerm(): number[] | null {
    let value = parseUnary();
    while (value !== null && isOperator(current(), ['*', '/'])) {
      const operator = operatorValue();
      index += 1;
      const right = parseUnary();
      if (right === null) return null;
      value = operator === '*'
        ? multiplyPolynomial(value, right)
        : dividePolynomial(value, right);
      if (value === null) return null;
    }
    return value;
  }

  function parseUnary(): number[] | null {
    if (isOperator(current(), ['+', '-'])) {
      const operator = operatorValue();
      index += 1;
      const value = parseUnary();
      if (value === null) return null;
      return operator === '-' ? scalePolynomial(value, -1) : value;
    }
    return parsePower();
  }

  function parsePower(): number[] | null {
    const base = parsePrimary();
    if (base === null) return null;
    if (!isOperator(current(), ['^'])) return base;
    index += 1;
    const exponentValue = parseUnary();
    if (exponentValue === null || exponentValue.length > 1) return null;
    const exponent = exponentValue[0] ?? 0;
    if (!Number.isInteger(exponent) || exponent < 0) return null;
    let value: number[] = [1];
    for (let count = 0; count < exponent; count += 1) {
      const next = multiplyPolynomial(value, base);
      if (next === null) return null;
      value = next;
    }
    return value;
  }

  function parsePrimary(): number[] | null {
    const token = tokens[index];
    if (!token) return null;
    if (token.type === 'number') {
      index += 1;
      return [token.value];
    }
    if (token.type === 'variable') {
      index += 1;
      return [0, 1];
    }
    if (token.type === 'lparen') {
      index += 1;
      const value = parseExpression();
      if (value === null || tokens[index]?.type !== 'rparen') return null;
      index += 1;
      return value;
    }
    return null;
  }

  const value = parseExpression();
  if (value === null || index !== tokens.length) return null;
  return value;
}

/**
 * 只对结构上确定为一次或二次的多项式方程给出完整解集。
 * 三次及以上、分式或无法解析的表达式一律返回 null，由调用方标记未核验。
 */
function solvePolynomialEquation(model: EquationModel): number[] | null {
  const left = parsePolynomial(model.left, model.variable);
  const right = parsePolynomial(model.right, model.variable);
  if (left === null || right === null) return null;

  // 系数只做精确归零，不按容差删项：很小的非零项也可能带着一个很大的根。
  const coefficients = addPolynomial(left, scalePolynomial(right, -1));
  // 恒等式：解集不是有限个根，无法用“全部根”比较。
  if (coefficients.length === 0) return null;
  const magnitude = Math.max(...coefficients.map((value) => Math.abs(value)));
  // 整个多项式都只是抵消噪声的量级：分不清恒等式和很小的非零常数。
  if (magnitude <= Math.max(polynomialNoiseFloor(model.left), polynomialNoiseFloor(model.right))) {
    return null;
  }

  // 先按最大系数归一，再判断次数：方程两边同乘非零常数不影响次数与解集。
  const normalized = coefficients.map((value) => value / magnitude);
  const degree = normalized.length - 1;
  // 首项系数相对其余项过小：浮点精度不足以可靠区分次数，不能据此给出完整解集。
  if (Math.abs(normalized[degree]) < DEGREE_AMBIGUOUS_RATIO) return null;
  // 三次及以上无法在本地确认完整解集，不能声称已找到全部根。
  if (degree > 2) return null;
  // 非零常数等于 0：实数范围内无解。
  if (degree === 0) return [];

  if (degree === 1) {
    return [-(normalized[0] ?? 0) / normalized[1]];
  }

  const intercept = normalized[0] ?? 0;
  const linear = normalized[1] ?? 0;
  const quadratic = normalized[2];
  const discriminant = linear * linear - 4 * quadratic * intercept;
  const discriminantScale = Math.max(linear * linear, Math.abs(4 * quadratic * intercept));
  // 判别式相对量级足够小才算重根；固定绝对阈值会让整体缩小后的两个实根被误判为重根。
  if (Math.abs(discriminant) <= DISCRIMINANT_RELATIVE_EPSILON * discriminantScale) {
    return [-linear / (2 * quadratic)];
  }
  if (discriminant < 0) return [];
  // 数值稳定写法：先求绝对值较大的那个根，另一个根用根与系数的关系得到。
  const root = Math.sqrt(discriminant);
  const near = -0.5 * (linear + Math.sign(linear) * root);
  const roots = near === 0
    ? [root / (2 * quadratic), -root / (2 * quadratic)]
    : [intercept / near, near / quadratic];
  // 两个根在比较容差下无法区分：分不清是重根还是两个相近的根，不给出完整解集。
  if (isClose(roots[0], roots[1]) || formatNumber(roots[0]) === formatNumber(roots[1])) return null;
  return roots;
}

function formatRoots(roots: number[]): string {
  if (roots.length === 0) return '无实数解';
  return [...roots].sort((left, right) => left - right).map((root) => `x=${formatNumber(root)}`).join('或');
}

function sameRoots(claimed: number[], computed: number[]): boolean {
  if (claimed.length !== computed.length) return false;
  const sortedClaimed = [...claimed].sort((left, right) => left - right);
  const sortedComputed = [...computed].sort((left, right) => left - right);
  return sortedClaimed.every((value, index) => isClose(value, sortedComputed[index]));
}

function conflictRoots(expected: string, answer: string): AnswerCheck {
  return {
    status: 'conflict',
    expected,
    detail: `本地求根复算得到 ${expected}，与答案「${answer}」不一致。`,
    kind: 'equation',
  };
}

/** 答案无法完整解析成解集：既不能判对，也不能凭“能解析的那部分”判错。 */
function unparsableRoots(answer: string, expected: string | null): AnswerCheck {
  return {
    status: 'unverified',
    expected,
    detail: `答案「${answer}」里有无法完整解析的部分，不能确认它是否等于完整解集，保留为未核验。`,
    kind: 'equation',
  };
}

function checkEquationAnswer(question: string, answer: string): AnswerCheck | null {
  const model = parseEquationModel(question);
  if (!model) return null;
  const { roots, complete } = parseRootAnswer(answer);
  const noSolutionClaimed = isNoSolutionAnswer(answer);
  const computed = solvePolynomialEquation(model);

  if (computed) {
    const expected = formatRoots(computed);
    // 本地已求出完整解集：答案断言“无解”或含有不在解集里的根，都能直接判错。
    if (computed.length === 0) {
      // 完整解集为空时，任何不是“无解”的答案（包括解析不了的片段）都与它矛盾。
      return noSolutionClaimed
        ? { status: 'verified', expected, detail: `本地求根复算得到 ${expected}，与答案一致。`, kind: 'equation' }
        : conflictRoots(expected, answer);
    }
    if (noSolutionClaimed || roots.some((root) => !computed.some((value) => isClose(root, value)))) {
      return conflictRoots(expected, answer);
    }
    // 能解析的根都在解集里，但答案还有解析不了的部分：无法确认答案完整，不判对。
    if (!complete || roots.length === 0) return unparsableRoots(answer, expected);
    return sameRoots(roots, computed)
      ? { status: 'verified', expected, detail: `本地求根复算得到 ${expected}，与答案一致。`, kind: 'equation' }
      : conflictRoots(expected, answer);
  }

  // 无法精确求出完整解集：代回只能确认“是根”，不能据此声称已核验。
  // 代回本身也要求方程两侧是可计算的多项式，否则“算不出来”会被误当成“不成立”。
  if (
    parsePolynomial(model.left, model.variable) === null
    || parsePolynomial(model.right, model.variable) === null
  ) {
    return {
      status: 'unverified',
      expected: null,
      detail: '原方程含有本地无法计算的表达式（如 π、根号、绝对值），既不能求根也不能代回检验，保留为未核验。',
      kind: 'equation',
    };
  }

  // 能解析的根代回不成立：这个答案至少有一个根是错的，可以直接判错。
  const failures: string[] = [];
  for (const root of roots) {
    const value = equationValueAt(model, root);
    if (value !== null && !isClose(value, 0)) failures.push(`x=${formatNumber(root)}`);
  }
  if (failures.length > 0) {
    return {
      status: 'conflict',
      expected: null,
      detail: `把 ${failures.join('、')} 代回原方程，左右两边不相等；这个答案至少有一个根不成立。`,
      kind: 'equation',
    };
  }

  // 答案里有解析不了的部分，或只能确认“是根”而无法确认是否漏根：都保留为未核验。
  if (!complete) return unparsableRoots(answer, null);
  if (roots.length === 0) {
    return {
      status: 'unverified',
      expected: null,
      detail: noSolutionClaimed
        ? '本地无法精确求出这道题的解集，不能确认“无实数解”是否成立，需要人工核对。'
        : '本地无法把答案解析成完整的解集，保留为未核验。',
      kind: 'equation',
    };
  }
  return {
    status: 'unverified',
    expected: null,
    detail: `代回只能确认 ${roots.map((root) => `x=${formatNumber(root)}`).join('、')} 是根；本题超出本地精确求解能力，无法确认是否漏根，需要人工核对完整解集。`,
    kind: 'equation',
  };
}

/* ---------- 等差数列求和 ---------- */

interface SequenceModel {
  a1: number;
  d: number;
  n: number;
}

function parseSequenceModel(question: string): SequenceModel | null {
  const text = normalizeMathText(question);
  const a1Match = /a\s*_?[1]\s*=\s*(-?\d+(?:\.\d+)?)/.exec(text);
  const dMatch = /d\s*=\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (!a1Match || !dMatch) return null;

  const nMatch = /s\s*_?([0-9]+)/.exec(text)
    ?? /前\s*([0-9]+)\s*项/.exec(text)
    ?? /([0-9]+)\s*项和/.exec(text);
  if (!nMatch) return null;

  const n = Number(nMatch[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    a1: Number(a1Match[1]),
    d: Number(dMatch[1]),
    n,
  };
}

function checkSequenceAnswer(question: string, answer: string): AnswerCheck | null {
  const model = parseSequenceModel(question);
  if (!model) return null;
  const expected = (model.n / 2) * (2 * model.a1 + (model.n - 1) * model.d);
  const expectedText = formatNumber(expected);
  const status = compareAnswerValue(answer, expected);
  if (status === 'unverified') return unparsableValue(answer, expectedText, 'sequence');

  return {
    status,
    expected: expectedText,
    detail: status === 'verified'
      ? `用 S_n=n/2[2a1+(n-1)d] 复算：S${model.n}=${expectedText}，与答案一致。`
      : `用 S_n=n/2[2a1+(n-1)d] 复算：S${model.n}=${expectedText}，与答案「${answer}」不一致。`,
    kind: 'sequence',
  };
}

/** 只解析“求 a_n / 求第 n 项”这类单项请求，避免误把求和题当单项。 */
function checkSequenceTermAnswer(question: string, answer: string): AnswerCheck | null {
  const text = normalizeMathText(question);
  const a1Match = /a\s*_?[1]\s*=\s*(-?\d+(?:\.\d+)?)/.exec(text);
  const dMatch = /d\s*=\s*(-?\d+(?:\.\d+)?)/.exec(text);
  const nMatch = /求\s*a\s*_?([0-9]+)/.exec(text) ?? /求第\s*([0-9]+)\s*项/.exec(text);
  if (!a1Match || !dMatch || !nMatch) return null;

  const n = Number(nMatch[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const a1 = Number(a1Match[1]);
  const d = Number(dMatch[1]);
  const expected = a1 + (n - 1) * d;
  const expectedText = formatNumber(expected);
  const status = compareAnswerValue(answer, expected);
  if (status === 'unverified') return unparsableValue(answer, expectedText, 'sequence');

  return {
    status,
    expected: expectedText,
    detail: status === 'verified'
      ? `用 a_n=a1+(n-1)d 复算：a${n}=${expectedText}，与答案一致。`
      : `用 a_n=a1+(n-1)d 复算：a${n}=${expectedText}，与答案「${answer}」不一致。`,
    kind: 'sequence',
  };
}

/** 纯数字算式题（如“计算 1-2+3”）；含字母的代数式不在此处硬判。 */
function checkArithmeticAnswer(question: string, answer: string): AnswerCheck | null {
  const text = normalizeMathText(question);
  const ask = findAskStart(text);
  if (!ask) return null;
  // 提问后的第一个完整数学片段必须整体是纯数字算式。
  // 片段里含字母、根号等内容时，说明题目所求不是本地能完整计算的算式，不截取前半段来算。
  let end = ask.index + ask.length;
  while (end < text.length && !EXPRESSION_SEPARATOR.test(text[end])) end += 1;
  const expression = text.slice(ask.index + ask.length, end);
  if (!/^[0-9π+\-*/^().]+$/.test(expression)) return null;
  if (!/[0-9π]/.test(expression) || !/[+\-*/^]/.test(expression)) return null;

  const expected = evaluateExpression(expression);
  if (expected === null) return null;
  const expectedText = formatNumber(expected);
  const status = compareAnswerValue(answer, expected);
  if (status === 'unverified') return unparsableValue(answer, expectedText, 'arithmetic');

  return {
    status,
    expected: expectedText,
    detail: status === 'verified'
      ? `本地复算 ${expression} = ${expectedText}，与答案一致。`
      : `本地复算 ${expression} = ${expectedText}，与答案「${answer}」不一致。`,
    kind: 'arithmetic',
  };
}

/**
 * 比较答案与本地复算值。答案解析不出可比较的数值时，本地既不能证明它对，
 * 也不能证明它错，必须保留为未核验，不能判冲突。
 */
function compareAnswerValue(
  answer: string,
  expected: number,
  claimed: number | null = parseNumericAnswer(answer),
): 'verified' | 'conflict' | 'unverified' {
  if (claimed === null) return 'unverified';
  return isClose(claimed, expected) ? 'verified' : 'conflict';
}

function unparsableValue(answer: string, expectedText: string, kind: AnswerCheck['kind']): AnswerCheck {
  return {
    status: 'unverified',
    expected: null,
    detail: `本地复算得到 ${expectedText}，但答案「${answer}」不是可比较的数值，无法判定。`,
    kind,
  };
}

/* ---------- 集合运算 ---------- */

type SetValue = Set<string>;

interface SetContext {
  sets: Map<string, SetValue>;
  universe: SetValue | null;
}

function parseSetElements(body: string): SetValue {
  return new Set(
    body
      .split(/[,，、]/)
      .map((item) => normalizeAnswer(item))
      .filter(Boolean),
  );
}

function parseSetLiteral(raw: string): SetValue | null {
  const text = normalizeAnswer(raw);
  const labeled = text.includes('=') ? text.slice(text.lastIndexOf('=') + 1) : text;
  // 花括号必须包住整个答案；花括号外还有别的字符时，说明答案没有被完整解析。
  if ((labeled.includes('{') || labeled.includes('}')) && !/^\{[^{}]*\}$/.test(labeled)) return null;
  const match = /\{([^{}]*)\}/.exec(labeled);
  const body = match ? match[1] : labeled;
  if (!body || /[=∪∩\\∁]/.test(body)) return null;
  const values = parseSetElements(body);
  return values.size > 0 ? values : null;
}

function parseSetContext(question: string): SetContext | null {
  const text = normalizeMathText(question);
  const sets = new Map<string, SetValue>();
  const pattern = /([a-z])\s*=\s*\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    sets.set(match[1].toUpperCase(), parseSetElements(match[2]));
  }
  if (sets.size === 0) return null;
  return { sets, universe: sets.get('U') ?? null };
}

function requestedSetExpression(question: string): string | null {
  const text = normalizeMathText(question);
  const complement = /([a-z{}∪∩()\\]+?)在u中的补集/.exec(text);
  if (complement) return `u\\(${complement[1]})`;
  const shortComplement = /([a-z{}∪∩()\\]+?)的补集/.exec(text);
  if (shortComplement) return `u\\(${shortComplement[1]})`;
  const requested = /(?:求|计算|则)([a-z{}∪∩()\\]+)/.exec(text);
  return requested ? requested[1] : null;
}

class SetExpressionParser {
  private index = 0;

  constructor(
    private readonly text: string,
    private readonly context: SetContext,
  ) {}

  parse(): SetValue | null {
    const value = this.parseUnion();
    if (this.index !== this.text.length) return null;
    return value;
  }

  private parseUnion(): SetValue | null {
    let left = this.parseIntersection();
    while (left && this.text[this.index] === '∪') {
      this.index += 1;
      const right = this.parseIntersection();
      if (!right) return null;
      left = new Set([...left, ...right]);
    }
    return left;
  }

  private parseIntersection(): SetValue | null {
    let left = this.parseUnary();
    while (left && this.text[this.index] === '∩') {
      this.index += 1;
      const right = this.parseUnary();
      if (!right) return null;
      left = new Set([...left].filter((item) => right.has(item)));
    }
    return left;
  }

  private parseUnary(): SetValue | null {
    if (this.text.startsWith('∁_', this.index) || this.text.startsWith('∁', this.index)) {
      if (this.text[this.index] === '∁') this.index += 1;
      if (this.text[this.index] === '_') this.index += 1;
      if (/[a-z]/.test(this.text[this.index] ?? '')) this.index += 1;
      return this.complementOf(this.parseUnary());
    }

    if (this.text[this.index] === 'u' && this.text[this.index + 1] === '\\') {
      this.index += 2;
      return this.complementOf(this.parseUnary());
    }

    if (this.text[this.index] === '(') {
      this.index += 1;
      const value = this.parseUnion();
      if (this.text[this.index] !== ')') return null;
      this.index += 1;
      return value;
    }

    if (this.text[this.index] === '{') {
      const end = this.text.indexOf('}', this.index);
      if (end === -1) return null;
      const literal = parseSetLiteral(this.text.slice(this.index, end + 1));
      this.index = end + 1;
      return literal;
    }

    const name = this.text[this.index];
    if (name && /[a-z]/.test(name)) {
      this.index += 1;
      return this.context.sets.get(name.toUpperCase()) ?? null;
    }

    return null;
  }

  private complementOf(value: SetValue | null): SetValue | null {
    if (!value || !this.context.universe) return null;
    return new Set([...this.context.universe].filter((item) => !value.has(item)));
  }
}

function formatSet(value: SetValue): string {
  return `{${[...value].sort().join(',')}}`;
}

function evaluateSetExpression(context: SetContext, expression: string): SetValue | null {
  const text = normalizeMathText(expression)
    .replace(/∁_?[a-z]?\(/g, 'u\\(')
    .replace(/\\left|\\right/g, '');
  return new SetExpressionParser(text, context).parse();
}

function compareSets(left: SetValue, right: SetValue): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

function checkSetAnswer(question: string, answer: string): AnswerCheck | null {
  const context = parseSetContext(question);
  if (!context) return null;
  const expression = requestedSetExpression(question);
  if (!expression) return null;
  const expected = evaluateSetExpression(context, expression);
  if (!expected) return null;
  const claimed = parseSetLiteral(answer);
  if (!claimed) return null;

  const expectedText = formatSet(expected);
  const consistent = compareSets(claimed, expected);
  return {
    status: consistent ? 'verified' : 'conflict',
    expected: expectedText,
    detail: consistent
      ? `按题干集合定义复算 ${expression} = ${expectedText}，与答案一致。`
      : `按题干集合定义复算 ${expression} = ${expectedText}，与答案「${answer}」不一致。`,
    kind: 'set',
  };
}

function checkSetStep(question: string, quote: string): StepCheck | null {
  const context = parseSetContext(question);
  if (!context) return null;
  const text = normalizeMathText(quote);
  const separator = text.indexOf('=');
  if (separator <= 0) return null;
  const expression = text.slice(0, separator);
  const claimed = parseSetLiteral(text.slice(separator + 1));
  const expected = evaluateSetExpression(context, expression);
  if (!claimed || !expected) return null;

  const expectedText = formatSet(expected);
  const consistent = compareSets(claimed, expected);
  return {
    status: consistent ? 'consistent' : 'inconsistent',
    expectedValue: expectedText,
    detail: consistent
      ? `这一步按题干集合定义复算得到 ${expectedText}，与写法一致。`
      : `这一步按题干集合定义复算应为 ${expectedText}，学生写的是 ${formatSet(claimed)}。`,
  };
}

/* ---------- 对外入口 ---------- */

/** 检查一道题的答案是否可被独立复算，以及是否与给定答案一致。 */
export function checkQuestionAnswer(question: string, steps: string[], answer: string): AnswerCheck {
  const checks = [
    checkSetAnswer(question, answer),
    checkFunctionAnswer(question, steps, answer),
    checkSequenceTermAnswer(question, answer),
    checkSequenceAnswer(question, answer),
    checkEquationAnswer(question, answer),
    checkArithmeticAnswer(question, answer),
  ].filter((check): check is AnswerCheck => check !== null);

  if (checks.length === 0) {
    return {
      status: 'unverified',
      expected: null,
      detail: '本题没有匹配到可独立复算的题型（当前覆盖函数代入、等式链、集合、方程根、等差数列求和）。',
      kind: null,
    };
  }

  const conflict = checks.find((check) => check.status === 'conflict');
  if (conflict) return conflict;
  const verified = checks.find((check) => check.status === 'verified');
  if (verified) return verified;
  return checks[0];
}

/**
 * 学生步骤开头的 (数字) 后面直接跟数字时有歧义：可能是题号，也可能是算式因子。
 * 完整算式成立才算成立；两种读法都不成立才判错。
 * 只有“删掉编号后等式恰好成立”的行无法区分读法，保留为未识别。
 */
function analyzeStudentChain(raw: string): EquationChainCheck {
  // 按完整算式读时不能剥掉开头的 (数字)，否则“完整算式”实际已经是按题号读的结果。
  const full = analyzeEquationChain(raw, { keepParenLabel: true });
  if (!hasAmbiguousLeadingLabel(raw) || full.status === 'consistent') return full;
  const labeled = analyzeEquationChain(raw);
  if (full.status === 'inconsistent' && labeled.status === 'inconsistent') return full;
  return { status: 'unrecognized', segments: [], values: [], recomputed: null, wrongSegmentIndex: null };
}

/** 检查学生某一行是否成立；无法可靠解释时返回 unrecognized。 */
export function checkStudentStep(question: string, quote: string): StepCheck {
  const functionCheck = checkFunctionStep(question, quote);
  if (functionCheck) {
    if (functionCheck.studentValue === null) {
      return {
        status: 'unrecognized',
        expectedValue: formatNumber(functionCheck.expectedValue),
        detail: functionCheck.detail,
      };
    }
    return {
      status: isClose(functionCheck.studentValue, functionCheck.expectedValue) ? 'consistent' : 'inconsistent',
      expectedValue: formatNumber(functionCheck.expectedValue),
      detail: functionCheck.detail,
    };
  }

  const chain = analyzeStudentChain(quote);
  if (chain.status === 'consistent' && chain.recomputed !== null) {
    return {
      status: 'consistent',
      expectedValue: formatNumber(chain.recomputed),
      detail: `这一行的等式链复算成立，结果为 ${formatNumber(chain.recomputed)}。`,
    };
  }
  if (chain.status === 'inconsistent' && chain.recomputed !== null) {
    return {
      status: 'inconsistent',
      expectedValue: formatNumber(chain.recomputed),
      detail: `这一行的等式链不成立；按第一段复算得到 ${formatNumber(chain.recomputed)}。`,
    };
  }

  const setCheck = checkSetStep(question, quote);
  if (setCheck) return setCheck;

  return {
    status: 'unrecognized',
    expectedValue: null,
    detail: '这一行含自然语言、方程变形或规则未覆盖的运算，无法独立复算。',
  };
}

function checkArithmeticClaim(claim: AiClaim): AnswerCheck {
  const chain = analyzeEquationChain(claim.expression);
  if (chain.status === 'unrecognized' || chain.recomputed === null) {
    return {
      status: 'unverified',
      expected: null,
      detail: '这条声明不是可独立求值的等式链，保留为 AI 推断。',
      kind: null,
    };
  }

  const claimed = parseNumericAnswer(claim.claimed);
  const expectedText = formatNumber(chain.recomputed);
  if (chain.status === 'inconsistent') {
    return {
      status: 'conflict',
      expected: expectedText,
      detail: `AI 的表达式「${claim.expression}」本身不成立；按第一段复算得到 ${expectedText}。`,
      kind: null,
    };
  }

  const consistent = claimed !== null && isClose(claimed, chain.recomputed);
  return {
    status: consistent ? 'verified' : 'conflict',
    expected: expectedText,
    detail: consistent
      ? `复算「${claim.expression}」得到 ${expectedText}，与 AI 声明一致。`
      : `复算「${claim.expression}」得到 ${expectedText}，与 AI 声明「${claim.claimed}」不一致。`,
    kind: null,
  };
}

function checkSetClaim(question: string, claim: AiClaim): AnswerCheck {
  const context = parseSetContext(question);
  if (!context) {
    return {
      status: 'unverified',
      expected: null,
      detail: '题干没有提供可用的集合定义，无法复算这条集合结论。',
      kind: null,
    };
  }
  const expected = evaluateSetExpression(context, claim.expression);
  const claimed = parseSetLiteral(claim.claimed);
  if (!expected || !claimed) {
    return {
      status: 'unverified',
      expected: null,
      detail: '这条集合声明无法被解析，保留为 AI 推断。',
      kind: null,
    };
  }
  const expectedText = formatSet(expected);
  return {
    status: compareSets(claimed, expected) ? 'verified' : 'conflict',
    expected: expectedText,
    detail: compareSets(claimed, expected)
      ? `复算「${claim.expression}」得到 ${expectedText}，与 AI 声明一致。`
      : `复算「${claim.expression}」得到 ${expectedText}，与 AI 声明「${claim.claimed}」不一致。`,
    kind: null,
  };
}

/** 逐条核验模型主动声明“可复算”的结论。 */
export function checkAiClaim(question: string, claim: AiClaim): AnswerCheck {
  if (claim.kind === 'set') return checkSetClaim(question, claim);
  if (claim.kind === 'answer') return checkQuestionAnswer(question, [], claim.claimed);
  return checkArithmeticClaim(claim);
}
