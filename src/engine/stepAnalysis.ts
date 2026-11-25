import type { FunctionSubstitutionModel, SubstitutionTermModel } from '../types';

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'lparen' }
  | { type: 'rparen' };

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

export type LineFindingKind =
  | 'neutral'
  | 'correct'
  | 'substitution-sign'
  | 'arithmetic'
  | 'mismatch'
  | 'unrecognized';

export interface StepFinding {
  kind: LineFindingKind;
  patternId: string | null;
  label: string | null;
  detail: string | null;
  value: number | null;
}

export interface FunctionStepFinding extends StepFinding {
  index: number;
  quote: string;
}

export interface FunctionStepsResult {
  finding: FunctionStepFinding | null;
  mismatch: FunctionStepFinding | null;
  unrecognized: FunctionStepFinding | null;
  reachedValue: number | null;
  sawSubstitution: boolean;
}

function isClose(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  let previous: 'value' | 'op' | 'lparen' | null = null;

  const pushValue = (token: Token) => {
    if (previous === 'value') tokens.push({ type: 'op', value: '*' });
    tokens.push(token);
    previous = 'value';
  };

  while (index < input.length) {
    const char = input[index];

    if (/[0-9.]/.test(char)) {
      const match = /^\d*\.?\d+/.exec(input.slice(index));
      if (!match) return null;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return null;
      pushValue({ type: 'number', value });
      index += match[0].length;
      continue;
    }

    if (char === 'π') {
      pushValue({ type: 'number', value: Math.PI });
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

  return tokens;
}

function parseTokens(tokens: Token[]): number | null {
  let index = 0;

  const peek = (): Token | undefined => tokens[index];

  const isOp = (token: Token | undefined, values: string[]): boolean =>
    token?.type === 'op' && values.includes(token.value);

  function parseExpression(): number {
    let value = parseTerm();
    while (isOp(peek(), ['+', '-'])) {
      const operator = (tokens[index] as { type: 'op'; value: '+' | '-' }).value;
      index += 1;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (isOp(peek(), ['*', '/'])) {
      const operator = (tokens[index] as { type: 'op'; value: '*' | '/' }).value;
      index += 1;
      const right = parseUnary();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }

  function parseUnary(): number {
    if (isOp(peek(), ['+', '-'])) {
      const operator = (tokens[index] as { type: 'op'; value: '+' | '-' }).value;
      index += 1;
      const value = parseUnary();
      return operator === '-' ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    if (isOp(peek(), ['^'])) {
      index += 1;
      const exponent = parseUnary();
      return base ** exponent;
    }
    return base;
  }

  function parsePrimary(): number {
    const token = tokens[index];
    if (!token) throw new Error('表达式不完整');
    if (token.type === 'number') {
      index += 1;
      return token.value;
    }
    if (token.type === 'lparen') {
      index += 1;
      const value = parseExpression();
      if (tokens[index]?.type !== 'rparen') throw new Error('括号不匹配');
      index += 1;
      return value;
    }
    throw new Error('缺少数字');
  }

  try {
    const value = parseExpression();
    if (index !== tokens.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/** 只接受有限算式；包含字母或自然语言时返回 null，由调用方保留原文并说明不确定。 */
export function evaluateExpression(input: string): number | null {
  const expression = String(input ?? '')
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '');
  if (!expression || /[^0-9.+\-*/^()π]/.test(expression)) return null;
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return null;
  return parseTokens(tokens);
}

/**
 * 去掉开头的 (数字) 题号。判断依据是它后面的下一个非空白字符：
 * 是运算符、等号或左括号时，(数字) 是算式因子（如 (2)+3、(2) + 3），必须保留。
 */
export function stripParenLabel(line: string): string {
  const match = /^\s*\(\s*\d+\s*\)(\s*)(.?)/.exec(line);
  if (!match) return line;
  const next = match[2];
  if (next === '' || '+-*/^=('.includes(next)) return line;
  return line.slice(match[0].length - next.length);
}

export interface CleanStepOptions {
  /** 保留开头的 (数字)。需要按“完整算式”判断一行时使用。 */
  keepParenLabel?: boolean;
}

export function cleanStepLine(raw: string, options: CleanStepOptions = {}): string {
  const line = String(raw ?? '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => superscriptDigits[digit]).join('')}`)
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/');

  return (options.keepParenLabel ? line : stripParenLabel(line))
    // 题号必须在删空格前处理：先删空格会把“1. 1.5+2”变成“1.1.5+2”，无法再区分题号与小数。
    .replace(/^\s*\d+\s*、\s*/, '')
    .replace(/^\s*\d+\s*\)\s*/, '')
    // 点号后紧跟数字时是小数（1.5），不能当作题号删除。
    .replace(/^\s*\d+\s*\.(?!\d)\s*/, '')
    .replace(/\s+/g, '')
    .replace(/\$/g, '')
    .replace(/^(?:解|答|步骤|第\d+步)[:：]?/, '')
    .toLowerCase();
}

/**
 * 开头的 (数字) 后面（可隔空白）直接跟数字时含义有歧义：可能是题号「(2) 1.5+2」，
 * 也可能是隐含乘法「(2)3」。调用方不能只靠删掉编号后等式成立来证明这一步正确。
 */
export function hasAmbiguousLeadingLabel(raw: string): boolean {
  return /^\s*[（(]\s*\d+\s*[)）]\s*[0-9]/.test(String(raw ?? ''));
}

function splitSegments(body: string): string[] {
  return body.split('=').filter((segment) => segment.length > 0);
}

/** 把表达式拆成顶层加减项，用于识别“只有某一项的符号被写反”。 */
export function parseSumTerms(input: string): number[] | null {
  const expression = String(input ?? '').replace(/\s+/g, '');
  if (!expression) return null;

  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      continue;
    }
    if (depth !== 0 || (char !== '+' && char !== '-') || index === 0) continue;
    const previous = expression[index - 1];
    if (previous === '^' || previous === '*' || previous === '/' || previous === '(') continue;
    parts.push(expression.slice(start, index));
    start = index;
  }
  parts.push(expression.slice(start));

  const values = parts.map((part) => evaluateExpression(part));
  if (values.some((value) => value === null)) return null;
  return values as number[];
}

function detectSignFlip(expression: string, terms: SubstitutionTermModel[]): SubstitutionTermModel | null {
  const values = parseSumTerms(expression);
  if (!values || values.length !== terms.length) return null;

  let flipped: SubstitutionTermModel | null = null;
  for (let index = 0; index < terms.length; index += 1) {
    const expected = terms[index];
    const actual = values[index];
    if (!isClose(Math.abs(actual), Math.abs(expected.value))) return null;
    const sameSign = (actual >= 0) === (expected.value >= 0);
    if (sameSign) continue;
    if (flipped) return null;
    flipped = expected;
  }
  return flipped;
}

function neutralFinding(): StepFinding {
  return { kind: 'neutral', patternId: null, label: null, detail: null, value: null };
}

/** 分析一行函数代入/化简，只对可计算的等式做判断。 */
export function analyzeFunctionLine(
  raw: string,
  model: FunctionSubstitutionModel,
  previousValue: number | null,
): StepFinding {
  const line = cleanStepLine(raw);
  if (!line) return neutralFinding();

  const left = model.left.toLowerCase();
  const anchored = line.includes(left);
  const continued = !anchored && line.startsWith('=');

  if (!anchored && !continued) {
    // 独立的等式只有明显不成立时才计入；单行算式可能只是草稿，不据此判错。
    const segments = splitSegments(line);
    if (segments.length < 2) {
      return evaluateExpression(line) === null
        ? { kind: 'unrecognized', patternId: null, label: null, detail: null, value: null }
        : neutralFinding();
    }
    const values = segments.map((segment) => evaluateExpression(segment));
    if (values.some((value) => value === null)) return neutralFinding();
    const numbers = values as number[];
    if (!numbers.every((value) => isClose(value, numbers[0]))) {
      return {
        kind: 'arithmetic',
        patternId: model.arithmeticPatternId,
        label: null,
        detail: model.arithmeticHint,
        value: null,
      };
    }
    return neutralFinding();
  }

  let body = line;
  if (anchored) {
    const at = line.indexOf(left);
    body = line.slice(at + left.length);
    if (!body.startsWith('=')) return neutralFinding();
    body = body.slice(1);
  } else {
    body = line.slice(1);
  }

  const segments = splitSegments(body);
  if (segments.length === 0) return neutralFinding();

  for (const segment of segments) {
    const flipped = detectSignFlip(segment, model.terms);
    if (flipped) {
      return {
        kind: 'substitution-sign',
        patternId: flipped.patternId,
        label: flipped.label,
        detail: `${flipped.label}：${flipped.hint}`,
        value: null,
      };
    }
  }

  const values = segments.map((segment) => evaluateExpression(segment));
  const first = values[0];
  if (first === null) {
    return { kind: 'unrecognized', patternId: null, label: null, detail: null, value: null };
  }

  const reference = anchored ? model.expectedValue : previousValue;
  if (reference !== null && !isClose(first, reference)) {
    if (anchored) {
      return { kind: 'mismatch', patternId: null, label: null, detail: null, value: null };
    }
    return {
      kind: 'arithmetic',
      patternId: model.arithmeticPatternId,
      label: null,
      detail: model.arithmeticHint,
      value: null,
    };
  }

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value !== null && !isClose(value, first)) {
      return {
        kind: 'arithmetic',
        patternId: model.arithmeticPatternId,
        label: null,
        detail: model.arithmeticHint,
        value: null,
      };
    }
  }

  return { kind: 'correct', patternId: null, label: null, detail: null, value: first };
}

export function analyzeFunctionSteps(
  steps: string[],
  model: FunctionSubstitutionModel,
): FunctionStepsResult {
  let previousValue: number | null = null;
  let sawSubstitution = false;
  let mismatch: FunctionStepFinding | null = null;
  let unrecognized: FunctionStepFinding | null = null;

  for (let index = 0; index < steps.length; index += 1) {
    const finding = analyzeFunctionLine(steps[index], model, previousValue);
    const located: FunctionStepFinding = { ...finding, index, quote: steps[index] };

    if (finding.kind === 'substitution-sign' || finding.kind === 'arithmetic') {
      return { finding: located, mismatch, unrecognized, reachedValue: previousValue, sawSubstitution };
    }
    if (finding.kind === 'mismatch' && !mismatch) mismatch = located;
    if (finding.kind === 'unrecognized' && !unrecognized) unrecognized = located;
    if (finding.kind === 'correct' && finding.value !== null) {
      previousValue = finding.value;
      sawSubstitution = true;
    }
  }

  return { finding: null, mismatch, unrecognized, reachedValue: previousValue, sawSubstitution };
}
