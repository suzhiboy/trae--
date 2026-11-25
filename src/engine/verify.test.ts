import { describe, expect, it } from 'vitest';
import { knowledgeNodes } from '../data/knowledge';
import type { FreeformAiResult } from '../types';
import { buildRuleResult, matchBuiltinQuestion, ruleVariant } from './freeform';
import { parseFreeformAiResult } from './freeformSchema';
import { answersEquivalent, buildAiDiagnosis } from './verify';

const allowedNodeIds = new Set(knowledgeNodes.map((node) => node.id));

function aiResult(overrides: Partial<FreeformAiResult> = {}): FreeformAiResult {
  return {
    correctAnswer: '6',
    standardSteps: ['f(-1)=(-1)^2-2(-1)+3=1+2+3=6'],
    firstWrongStepIndex: 1,
    stepQuote: 'f(-1)=1-2+3=2',
    reason: '一次项代入时把 -2×(-1) 写成了 -2',
    knowledgePoint: '函数值求解',
    knowledgeNodeId: 'function-value',
    variant: { stem: '已知 f(x)=x²-2x+3，求 f(2)', answer: '3' },
    confidence: 'high',
    claims: [],
    insufficientEvidence: false,
    uncertainty: '',
    ...overrides,
  };
}

const functionInput = {
  question: '已知 f(x)=x²-2x+3，求 f(-1)',
  finalAnswer: '2',
  steps: ['f(-1)=1-2+3=2'],
};

describe('核验层：AI 算错时以本地复算为准', () => {
  it('AI 把正确答案也算成 2 时，复算纠正为 6，并标出冲突', () => {
    const result = buildAiDiagnosis(functionInput, aiResult({
      correctAnswer: '2',
      standardSteps: ['f(-1)=1-2+3=2'],
    }));

    expect(result.correctAnswer).toBe('6');
    expect(result.aiCorrectAnswer).toBe('2');
    expect(result.verification.conclusion).toBe('conflict');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'final-answer',
        expression: 'AI 正确答案',
        status: 'conflict',
        recomputed: '6',
      }),
    ]));
    expect(result.verification.claims.some(
      (claim) => claim.kind === 'standard-step' && claim.status === 'conflict',
    )).toBe(true);
    expect(result.firstWrongStepIndex).toBe(0);
    expect(result.status).toBe('unknown');
    expect(result.confidence).toBe('low');
    expect(result.reason).toContain('复算');
  });

  it('AI 主动声明的算术结论也会逐条复算', () => {
    const result = buildAiDiagnosis(functionInput, aiResult({
      claims: [
        { kind: 'arithmetic', expression: '1-2+3=6', claimed: '6' },
        { kind: 'arithmetic', expression: '1+2+3=6', claimed: '6' },
      ],
    }));

    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'conflict', recomputed: '2' }),
      expect.objectContaining({ status: 'verified', recomputed: '6' }),
    ]));
  });
});

describe('核验层：AI 正确时给出已核验标记', () => {
  it('函数代入错误定位正确、正确答案 6 通过复算', () => {
    const result = buildAiDiagnosis(functionInput, aiResult());

    expect(result.correctAnswer).toBe('6');
    expect(result.status).toBe('diagnosed');
    expect(result.verification.conclusion).toBe('consistent');
    expect(result.verification.claims.some(
      (claim) => claim.kind === 'student-step' && claim.status === 'verified',
    )).toBe(true);
    expect(result.verification.claims.some(
      (claim) => claim.expression === 'AI 正确答案' && claim.status === 'verified',
    )).toBe(true);
    expect(result.confidence).toBe('medium');
  });

  it('集合题：A∪B 的复算结果与 AI 答案一致', () => {
    const result = buildAiDiagnosis(
      {
        question: '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B',
        finalAnswer: '{2}',
        steps: ['A∪B={2}'],
      },
      aiResult({
        correctAnswer: '{1,2,3,4}',
        standardSteps: ['A∪B={1,2,3,4}'],
        stepQuote: 'A∪B={2}',
        reason: '把并集误作交集',
        knowledgePoint: '集合运算',
        knowledgeNodeId: 'set-operations',
      }),
    );

    expect(result.status).toBe('diagnosed');
    expect(result.verification.conclusion).toBe('consistent');
    expect(result.verification.claims.some(
      (claim) => claim.expression === 'AI 正确答案' && claim.status === 'verified',
    )).toBe(true);
  });
});

describe('核验层：无法复算时只标记为 AI 推断', () => {
  it('不等式证明含自然语言，不能冒充已核验', () => {
    const result = buildAiDiagnosis(
      {
        question: '证明：对于任意实数 x，x²+1>0',
        finalAnswer: '证明成立',
        steps: ['因为 x²≥0，所以 x²+1>0'],
      },
      aiResult({
        correctAnswer: '证明成立',
        standardSteps: ['x²≥0', 'x²+1>0'],
        stepQuote: '因为 x²≥0，所以 x²+1>0',
        reason: '不等式推理缺少依据',
        knowledgePoint: '不等式',
        knowledgeNodeId: null,
        confidence: 'medium',
      }),
    );

    expect(result.verification.conclusion).toBe('unverifiable');
    expect(result.status).toBe('diagnosed');
    expect(result.confidence).toBe('low');
    expect(result.reason).toContain('未核验');
    expect(result.verification.claims.filter(
      (claim) => claim.status === 'unverified',
    ).length).toBeGreaterThan(0);
  });
});

describe('核验层：引用与冲突', () => {
  it('AI 引用的原句不在学生步骤中时标冲突', () => {
    const result = buildAiDiagnosis(functionInput, aiResult({
      firstWrongStepIndex: 2,
      stepQuote: 'f(-1)=1+2+3',
    }));

    expect(result.verification.conclusion).toBe('conflict');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'index', status: 'conflict' }),
    ]));
    expect(result.status).toBe('unknown');
  });

  it('AI 指出的步骤经复算成立时，应与其结论冲突', () => {
    const result = buildAiDiagnosis(
      {
        question: '已知 f(x)=x²-2x+3，求 f(-1)',
        finalAnswer: '6',
        steps: ['f(-1)=(-1)^2-2(-1)+3=6'],
      },
      aiResult({
        firstWrongStepIndex: 1,
        stepQuote: 'f(-1)=(-1)^2-2(-1)+3=6',
      }),
    );

    expect(result.verification.conclusion).toBe('conflict');
    expect(result.verification.claims.some(
      (claim) => claim.kind === 'student-step' && claim.status === 'conflict',
    )).toBe(true);
  });
});

describe('核验层：方程根与数列求和', () => {
  it('二次方程的错误根被本地求根纠正', () => {
    const result = buildAiDiagnosis(
      {
        question: '解方程 x²-5x+6=0',
        finalAnswer: 'x=2或x=4',
        steps: ['(x-2)(x-3)=0', 'x=2或x=4'],
      },
      aiResult({
        correctAnswer: 'x=2或x=4',
        standardSteps: ['(x-2)(x-3)=0', 'x=2或x=3'],
        firstWrongStepIndex: 2,
        stepQuote: 'x=2或x=4',
        reason: '因式分解后根写错',
        knowledgePoint: '一元二次方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(result.correctAnswer).toBe('x=2或x=3');
    expect(result.verification.conclusion).toBe('conflict');
    expect(result.verification.claims.some(
      (claim) => claim.recomputed === 'x=2或x=3',
    )).toBe(true);
  });

  it('等差数列求和的错误答案被公式复算纠正', () => {
    const result = buildAiDiagnosis(
      {
        question: '等差数列 {aₙ} 中，a₁=2，公差 d=3，求前 5 项和 S₅',
        finalAnswer: '35',
        steps: ['S5=35'],
      },
      aiResult({
        correctAnswer: '35',
        standardSteps: ['S5=40'],
        firstWrongStepIndex: 1,
        stepQuote: 'S5=35',
        reason: '求和公式使用错误',
        knowledgePoint: '等差数列求和',
        knowledgeNodeId: 'arithmetic-sequence',
      }),
    );

    expect(result.correctAnswer).toBe('40');
    expect(result.verification.conclusion).toBe('conflict');
    expect(result.verification.claims.some(
      (claim) => claim.recomputed === '40',
    )).toBe(true);
  });

  it('集合运算的错误答案被集合复算纠正', () => {
    const result = buildAiDiagnosis(
      {
        question: '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B',
        finalAnswer: '{2}',
        steps: ['A∪B={2}'],
      },
      aiResult({
        correctAnswer: '{2}',
        standardSteps: ['A∪B={1,2,3,4}'],
        stepQuote: 'A∪B={2}',
        reason: '并集误作交集',
        knowledgePoint: '集合运算',
        knowledgeNodeId: 'set-operations',
      }),
    );

    expect(result.correctAnswer).toBe('{1,2,3,4}');
    expect(result.verification.conclusion).toBe('conflict');
    expect(result.verification.claims.some(
      (claim) => claim.kind === 'student-step' && claim.status === 'verified' && claim.recomputed === '{1,2,3,4}',
    )).toBe(true);
  });
});

describe('AI 结果结构校验', () => {
  it('接受完整结构', () => {
    expect(parseFreeformAiResult(aiResult(), allowedNodeIds)).not.toBeNull();
  });

  it('拒绝缺字段、非整数序号和未知 claim 类型', () => {
    const valid = aiResult();
    expect(parseFreeformAiResult({ ...valid, reason: undefined }, allowedNodeIds)).toBeNull();
    expect(parseFreeformAiResult({ ...valid, firstWrongStepIndex: 1.5 }, allowedNodeIds)).toBeNull();
    expect(parseFreeformAiResult({
      ...valid,
      claims: [{ kind: 'unknown', expression: 'x', claimed: 'y' }],
    }, allowedNodeIds)).toBeNull();
  });

  it('证据不足时允许空答案与空步骤，但保留不确定性说明', () => {
    const parsed = parseFreeformAiResult({
      ...aiResult(),
      correctAnswer: '',
      standardSteps: [],
      firstWrongStepIndex: null,
      stepQuote: '',
      reason: '',
      knowledgePoint: '',
      variant: { stem: '', answer: '' },
      insufficientEvidence: true,
      uncertainty: '题目图片不完整，无法确认学生写了什么。',
    }, allowedNodeIds);

    expect(parsed).not.toBeNull();
    expect(parsed?.insufficientEvidence).toBe(true);
    expect(parsed?.uncertainty).toContain('不完整');
  });
});

describe('内置题优先规则', () => {
  it('函数题命中内置题，并走原规则诊断', () => {
    const question = matchBuiltinQuestion('已知 f(x)=x²-2x+3，求 f(-1)');
    expect(question?.id).toBe('function-negative-input');

    const result = buildRuleResult(question!, '2', ['f(-1)=1-2+3=2']);
    expect(result.source).toBe('rules');
    expect(result.diagnosis.status).toBe('diagnosed');
    expect(result.diagnosis.matchedPatternId).toBe('negative-linear-term-sign');
    expect(ruleVariant(result)).not.toBeNull();
  });

  it('集合题命中内置题', () => {
    const question = matchBuiltinQuestion('设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B');
    expect(question?.id).toBe('set-union-basic');
  });

  it('不在题库中的短题不会被误认成内置题', () => {
    expect(matchBuiltinQuestion('求 f(2)')).toBeNull();
    expect(matchBuiltinQuestion('设 A={1,2}，B={2,3}，求 A∪B')).toBeNull();
  });
});

describe('答案等价归一化', () => {
  it('解集顺序无关', () => {
    expect(answersEquivalent('x=3或x=2', 'x=2或x=3')).toBe(true);
  });

  it('集合顺序无关', () => {
    expect(answersEquivalent('{3,2,1}', '{1,2,3}')).toBe(true);
  });

  it('数值与分数等价', () => {
    expect(answersEquivalent('1/2', '0.5')).toBe(true);
    expect(answersEquivalent('6', 'f(-1)=6')).toBe(true);
  });
});
