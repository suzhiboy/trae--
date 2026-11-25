import { describe, expect, it } from 'vitest';
import type {
  DiagnosisRecord,
  PracticeAttempt,
  PracticeAttemptKind,
  VerificationStatus,
} from '../types';
import { diagnoseAttempt } from './attempt';
import { summarizeDiagnoses, summarizeSession } from './session';

function answered(
  questionId: string,
  finalAnswer: string,
  steps: string[] = [],
  elapsedSeconds = 10,
  verification: VerificationStatus = 'pending',
): PracticeAttempt {
  return {
    questionId,
    kind: 'answered',
    finalAnswer,
    steps,
    elapsedSeconds,
    diagnosis: diagnoseAttempt({ questionId, finalAnswer, steps }),
    verification,
    selectedVariantOptionId: null,
    variantAttempts: verification === 'corrected' || verification === 'needs-review' ? 1 : 0,
  };
}

function inactive(kind: PracticeAttemptKind, elapsedSeconds: number): PracticeAttempt {
  return {
    questionId: 'set-union-basic',
    kind,
    finalAnswer: '',
    steps: [],
    elapsedSeconds,
    diagnosis: null,
    verification: 'not-required',
    selectedVariantOptionId: null,
    variantAttempts: 0,
  };
}

describe('summarizeSession', () => {
  it('合并所有已匹配薄弱点并去重，包括已纠正记录，学习路径按依赖排序', () => {
    const attempts = [
      answered('function-negative-input', '2', ['f(-1)=1-2+3=2'], 10, 'corrected'),
      answered('function-negative-input', '4', ['f(-1)=-1+2+3'], 12, 'needs-review'),
      answered('logarithm-evaluation', '4', [], 14, 'corrected'),
      answered('arithmetic-sequence-term', '13'),
    ];
    const report = summarizeSession(attempts);

    expect(report.weakNodeIds).toEqual(['function-value', 'log-definition', 'arithmetic-sequence']);
    expect(report.learningPathIds).toEqual([
      'set-basics',
      'function-concept',
      'function-value',
      'power-rules',
      'exponential-function',
      'log-definition',
      'sequence-concept',
      'arithmetic-sequence',
    ]);
    expect(report.attempts).toEqual(attempts);
  });

  it('统计各状态、正确率和实际作答用时，跳过与我不会均不计入分母', () => {
    const attempts = [
      answered('function-negative-input', '6', [], 10, 'not-required'),
      answered('function-negative-input', '2', ['f(-1)=1-2+3'], 20),
      answered('logarithm-evaluation', '3', ['log₂8=8÷2=4'], 30, 'needs-review'),
      answered('radian-conversion', '无法判断', [], 40),
      inactive('skipped', 999),
      inactive('unanswered', 888),
    ];
    const report = summarizeSession(attempts);

    expect(report.total).toBe(6);
    expect(report.answered).toBe(4);
    expect(report.correct).toBe(1);
    expect(report.diagnosed).toBe(1);
    expect(report.processError).toBe(1);
    expect(report.unknown).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.accuracy).toBe(25);
    expect(report.averageSeconds).toBe(25);
  });

  it('process-error 不计入 correct，重复薄弱点只贡献一次', () => {
    const attempts = [
      answered('same-base-powers', 'a^7', ['a³·a⁴=a^(3×4)'], 8, 'corrected'),
      answered('same-base-powers', 'a^12', [], 12),
    ];
    const report = summarizeSession(attempts);

    expect(report.correct).toBe(0);
    expect(report.processError).toBe(1);
    expect(report.diagnosed).toBe(1);
    expect(report.accuracy).toBe(0);
    expect(report.averageSeconds).toBe(10);
    expect(report.weakNodeIds).toEqual(['power-rules']);
    expect(report.learningPathIds).toEqual(['power-rules']);
  });

  it('空会话及只有跳过、我不会的会话不产生非零统计', () => {
    expect(summarizeSession([])).toMatchObject({
      total: 0,
      answered: 0,
      correct: 0,
      accuracy: 0,
      averageSeconds: 0,
      weakNodeIds: [],
      learningPathIds: [],
    });

    const report = summarizeSession([inactive('skipped', 50), inactive('unanswered', 60)]);
    expect(report.total).toBe(2);
    expect(report.answered).toBe(0);
    expect(report.skipped).toBe(1);
    expect(report.accuracy).toBe(0);
    expect(report.averageSeconds).toBe(0);
  });
});

function diagnosisRecord(overrides: Partial<DiagnosisRecord> = {}): DiagnosisRecord {
  return {
    id: 'record-1',
    createdAt: 1,
    source: 'ai',
    question: '已知 f(x)=x²-2x+3，求 f(-1)',
    finalAnswer: '2',
    questionId: null,
    patternId: null,
    status: 'diagnosed',
    reason: '一次项符号写错',
    knowledgePoint: '函数值求解',
    knowledgeNodeId: 'function-value',
    weakNodeIds: [],
    verification: 'consistent',
    ...overrides,
  };
}

describe('summarizeDiagnoses：任意题诊断汇总', () => {
  it('合并节点与知识点文本，去重并只统计已确认错因', () => {
    const summary = summarizeDiagnoses([
      diagnosisRecord(),
      diagnosisRecord({
        id: 'record-2',
        knowledgeNodeId: null,
        weakNodeIds: ['quadratic-equation'],
        knowledgePoint: '因式分解。',
      }),
      diagnosisRecord({
        id: 'record-3',
        knowledgeNodeId: null,
        weakNodeIds: ['quadratic-equation'],
        knowledgePoint: '因式分解',
        status: 'process-error',
      }),
      diagnosisRecord({
        id: 'record-4',
        status: 'unknown',
        knowledgeNodeId: 'log-definition',
        knowledgePoint: '对数定义',
        reason: '证据不足',
      }),
      diagnosisRecord({
        id: 'record-5',
        status: 'correct',
        knowledgeNodeId: 'power-rules',
        knowledgePoint: '幂的运算法则',
      }),
    ]);

    expect(summary.total).toBe(5);
    expect(summary.correct).toBe(1);
    expect(summary.diagnosed).toBe(2);
    expect(summary.processError).toBe(1);
    expect(summary.unknown).toBe(1);
    expect(summary.weakNodeIds).toEqual(['function-value', 'quadratic-equation']);
    expect(summary.weakKnowledgePoints).toEqual(['因式分解。']);
    expect(summary.learningPathIds).toEqual(expect.arrayContaining([
      'function-concept',
      'function-value',
      'factorization',
      'quadratic-equation',
    ]));
  });

  it('没有记录时返回空汇总，不生成补习路径', () => {
    expect(summarizeDiagnoses([])).toEqual({
      total: 0,
      correct: 0,
      diagnosed: 0,
      processError: 0,
      unknown: 0,
      weakNodeIds: [],
      weakKnowledgePoints: [],
      learningPathIds: [],
    });
  });

  it('非法知识节点 ID 不进入薄弱点，也不污染学习路径', () => {
    const summary = summarizeDiagnoses([
      diagnosisRecord({
        knowledgeNodeId: 'not-a-node',
        weakNodeIds: ['also-not-a-node'],
        knowledgePoint: '未知知识点',
      }),
    ]);

    expect(summary.weakNodeIds).toEqual([]);
    expect(summary.learningPathIds).toEqual([]);
    expect(summary.weakKnowledgePoints).toEqual(['未知知识点']);
  });
});
