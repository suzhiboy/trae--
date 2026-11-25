import { cleanStepLine, evaluateExpression } from './stepAnalysis';
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
function cleanLine(raw: string): string {
  return cleanStepLine(raw)
    .replace(/^\\(?:therefore|because)/, '')
    .replace(/^[∴∵]/, '')
    .replace(/^(?:所以|因此|即|则|得|故)[:：]?/, '');
}

function substituteVariable(expression: string, variable: string, value: number): number | null {
  const pattern = new RegExp(`(?<![a-z])${variable}(?![a-z])`, 'g');
  return evaluateExpression(expression.replace(pattern, `(${formatNumber(value)})`));
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
export function analyzeEquationChain(raw: string): EquationChainCheck {
  const line = cleanLine(raw);
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
  const call = parseFunctionCall(quote, model.name);
  if (!call) return null;
  const expected = evaluateFunctionAt(model, call.argument);
  if (expected === null) return null;
  const studentValue = firstValueAfterCall(call.rest);

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

function checkFunctionAnswer(question: string, steps: string[], answer: string): AnswerCheck | null {
  const model = parseFunctionModel(question);
  if (!model) return null;

  let call = parseFunctionCall(question, model.name);
  if (!call) {
    for (const step of steps) {
      call = parseFunctionCall(step, model.name);
      if (call) break;
    }
  }
  if (!call) return null;

  const expected = evaluateFunctionAt(model, call.argument);
  if (expected === null) return null;
  const expectedText = formatNumber(expected);
  const claimed = parseNumericAnswer(answer);
  const consistent = claimed !== null && isClose(claimed, expected);

  return {
    status: consistent ? 'verified' : 'conflict',
    expected: expectedText,
    detail: consistent
      ? `把 ${model.name}(${formatNumber(call.argument)}) 代入题干函数，复算得到 ${expectedText}，与答案一致。`
      : `把 ${model.name}(${formatNumber(call.argument)}) 代入题干函数，复算得到 ${expectedText}，与答案「${answer}」不一致。`,
    kind: 'function',
  };
}

/* ---------- 一元二次 / 一元一次方程 ---------- */

interface EquationModel {
  left: string;
  right: string;
  variable: string;
}

function parseEquationModel(question: string): EquationModel | null {
  const text = normalizeMathText(question);
  const match = /([0-9a-z^+\-*/()]+)\s*=\s*([0-9a-z^+\-*/()]+)/.exec(text);
  if (!match) return null;

  const left = match[1];
  const right = match[2];
  // f(x)=... 是函数定义，不是待解方程。
  if (/^[a-z]\(/.test(left)) return null;
  // x=2、a1=2、s5=40 是答案声明或数列参数，不是可代回检验的方程。
  if (/^[a-z]$/.test(left) && !/[a-z]/.test(right)) return null;
  if (/^[a-z][0-9]+$/.test(left)) return null;

  const variableMatch = /[a-z]/.exec(left + right);
  if (!variableMatch) return null;
  return { left, right, variable: variableMatch[0] };
}

function extractRoots(answer: string): number[] {
  const text = normalizeMathText(answer);
  const roots: number[] = [];
  const parts = text.split(/或|,/).map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const matched = /x\s*[0-9]*\s*=\s*(.+)/.exec(part);
    const expression = (matched ? matched[1] : part)
      .replace(/[（(].*?[）)]/g, '')
      .trim();
    const value = evaluateExpression(expression);
    if (value === null) continue;
    if (!roots.some((root) => isClose(root, value))) roots.push(value);
  }

  if (roots.length > 0) return roots;
  return [];
}

function equationValueAt(model: EquationModel, value: number): number | null {
  const left = substituteVariable(model.left, model.variable, value);
  const right = substituteVariable(model.right, model.variable, value);
  if (left === null || right === null) return null;
  return left - right;
}

/**
 * 只对单变量多项式方程做精确求根：用 x=0,1,-1,2 四点判断是否不超过二次。
 * 含除法、多个字母或三次以上时返回 null，退回逐根代回。
 */
function solvePolynomialEquation(model: EquationModel): number[] | null {
  if (/\//.test(model.left + model.right)) return null;
  const letters = (model.left + model.right).match(/[a-z]/g) ?? [];
  if (letters.some((letter) => letter !== model.variable)) return null;

  const f0 = equationValueAt(model, 0);
  const f1 = equationValueAt(model, 1);
  const fNeg1 = equationValueAt(model, -1);
  const f2 = equationValueAt(model, 2);
  if (f0 === null || f1 === null || fNeg1 === null || f2 === null) return null;

  const a = (f1 + fNeg1) / 2 - f0;
  const b = (f1 - fNeg1) / 2;
  const c = f0;
  if (!isClose(a * 4 + b * 2 + c, f2)) return null;

  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return null;
    return [-c / b];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-9) return [];
  if (Math.abs(discriminant) <= 1e-9) return [-b / (2 * a)];
  const root = Math.sqrt(Math.max(0, discriminant));
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
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

function checkEquationAnswer(question: string, answer: string): AnswerCheck | null {
  const model = parseEquationModel(question);
  if (!model) return null;
  const roots = extractRoots(answer);
  const computed = solvePolynomialEquation(model);

  if (computed) {
    const expected = formatRoots(computed);
    const noSolutionClaimed = roots.length === 0 && /无解|空集|∅/.test(normalizeMathText(answer));
    const consistent = computed.length === 0 ? noSolutionClaimed : sameRoots(roots, computed);
    return {
      status: consistent ? 'verified' : 'conflict',
      expected,
      detail: consistent
        ? `本地求根复算得到 ${expected}，与答案一致。`
        : `本地求根复算得到 ${expected}，与答案「${answer}」不一致。`,
      kind: 'equation',
    };
  }

  if (roots.length === 0) return null;
  const failures: string[] = [];
  for (const root of roots) {
    const value = equationValueAt(model, root);
    if (value === null || !isClose(value, 0)) failures.push(`x=${formatNumber(root)}`);
  }

  if (failures.length === 0) {
    return {
      status: 'verified',
      expected: null,
      detail: `把 ${roots.map((root) => `x=${formatNumber(root)}`).join('、')} 逐一代回原方程，左右两边都相等。`,
      kind: 'equation',
    };
  }

  return {
    status: 'conflict',
    expected: null,
    detail: `把 ${failures.join('、')} 代回原方程，左右两边不相等；这个答案至少有一个根不成立。`,
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
  const claimed = parseNumericAnswer(answer);
  const consistent = claimed !== null && isClose(claimed, expected);

  return {
    status: consistent ? 'verified' : 'conflict',
    expected: expectedText,
    detail: consistent
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
  const claimed = parseNumericAnswer(answer);
  const consistent = claimed !== null && isClose(claimed, expected);

  return {
    status: consistent ? 'verified' : 'conflict',
    expected: expectedText,
    detail: consistent
      ? `用 a_n=a1+(n-1)d 复算：a${n}=${expectedText}，与答案一致。`
      : `用 a_n=a1+(n-1)d 复算：a${n}=${expectedText}，与答案「${answer}」不一致。`,
    kind: 'sequence',
  };
}

/** 纯数字算式题（如“计算 1-2+3”）；含字母的代数式不在此处硬判。 */
function checkArithmeticAnswer(question: string, answer: string): AnswerCheck | null {
  const text = normalizeMathText(question);
  const match = /(?:计算|求)\s*([0-9π+\-*/^().]+)/.exec(text);
  if (!match) return null;
  const expression = match[1];
  if (!/[0-9π]/.test(expression) || !/[+\-*/^]/.test(expression)) return null;

  const expected = evaluateExpression(expression);
  if (expected === null) return null;
  const expectedText = formatNumber(expected);
  const claimed = parseNumericAnswer(answer);
  const consistent = claimed !== null && isClose(claimed, expected);

  return {
    status: consistent ? 'verified' : 'conflict',
    expected: expectedText,
    detail: consistent
      ? `本地复算 ${expression} = ${expectedText}，与答案一致。`
      : `本地复算 ${expression} = ${expectedText}，与答案「${answer}」不一致。`,
    kind: 'arithmetic',
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
  const text = normalizeMathText(raw);
  const labeled = text.includes('=') ? text.slice(text.lastIndexOf('=') + 1) : text;
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

  const chain = analyzeEquationChain(quote);
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
