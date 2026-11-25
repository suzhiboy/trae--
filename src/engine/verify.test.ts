import { describe, expect, it } from 'vitest';
import { knowledgeNodes } from '../data/knowledge';
import type { FreeformAiResult } from '../types';
import { checkQuestionAnswer, checkStudentStep } from './calcVerifiers';
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

describe('核验层：函数步骤的最后一段也必须复算', () => {
  it('第一段算对、最后一段写错时，不会被当成正确步骤', () => {
    const result = buildAiDiagnosis(
      {
        question: '已知 f(x)=x²-3x+2，求 f(2)',
        finalAnswer: '4',
        steps: ['f(2)=4-6+2=4'],
      },
      aiResult({
        correctAnswer: '0',
        standardSteps: ['f(2)=2^2-3*2+2=4-6+2=0'],
        firstWrongStepIndex: 1,
        stepQuote: 'f(2)=4-6+2=4',
        reason: '最后一步加法把 4-6+2 算成了 4',
        knowledgePoint: '函数值求解',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.status).toBe('diagnosed');
    expect(result.firstWrongStepIndex).toBe(0);
    expect(result.verification.claims.some(
      (claim) => claim.kind === 'student-step' && claim.status === 'verified',
    )).toBe(true);
    expect(result.verification.conclusion).not.toBe('conflict');
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

  it('分子分母的括号必须保留，不能被当成无括号算式', () => {
    expect(answersEquivalent('(1+2)/(3+1)', '0.75')).toBe(true);
    expect(answersEquivalent('(1+2)/(3+1)', '1+2/3+1')).toBe(false);
    expect(answersEquivalent('\\frac{1+2}{3+1}', '0.75')).toBe(true);
  });

  it('简单分数、LaTeX 分数与题库别名保持原行为', () => {
    expect(answersEquivalent('\\frac{1}{2}', '0.5')).toBe(true);
    expect(answersEquivalent('\\frac{5\\pi}{6}', '5π/6')).toBe(true);
    expect(answersEquivalent('x=3或x=2', '3,2')).toBe(true);
  });
});

describe('核验层：解集必须完整才可标为已核验', () => {
  it('三次方程只写一个根时不得标记为已核验', () => {
    const result = buildAiDiagnosis(
      { question: '解方程 x³-x=0', finalAnswer: 'x=1', steps: ['x=1'] },
      aiResult({
        correctAnswer: 'x=1',
        standardSteps: ['x(x-1)(x+1)=0', 'x=1或x=-1或x=0'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '只写出了一个根，漏掉另外两个根',
        knowledgePoint: '高次方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(result.correctAnswer).toBe('x=1');
    expect(result.status).toBe('unknown');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'unverified' }),
    ]));
    expect(result.verification.claims.some(
      (claim) => claim.expression === 'AI 正确答案' && claim.status === 'verified',
    )).toBe(false);
  });
});

describe('核验层：函数题只按完整所求表达式复算', () => {
  it('组合表达式 f(1)+f(2) 复算为 6，不覆盖正确的参考答案', () => {
    const result = buildAiDiagnosis(
      {
        question: '已知 f(x)=2x，求 f(1)+f(2)',
        finalAnswer: '6',
        steps: ['f(1)=2', 'f(2)=4', 'f(1)+f(2)=6'],
      },
      aiResult({
        correctAnswer: '6',
        standardSteps: ['f(1)=2', 'f(2)=4', 'f(1)+f(2)=6'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '分别求出两个函数值后相加',
        knowledgePoint: '函数值求解',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.correctAnswer).toBe('6');
    expect(result.aiCorrectAnswer).toBe('6');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'verified', recomputed: '6' }),
    ]));
    expect(result.verification.claims.some((claim) => claim.status === 'conflict')).toBe(false);
  });

  it('单独求 f(1) 仍按单次代入复算为 2', () => {
    const result = buildAiDiagnosis(
      { question: '已知 f(x)=2x，求 f(1)', finalAnswer: '2', steps: ['f(1)=2'] },
      aiResult({
        correctAnswer: '2',
        standardSteps: ['f(1)=2'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '直接代入求值',
        knowledgePoint: '函数值求解',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.correctAnswer).toBe('2');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'verified', recomputed: '2' }),
    ]));
  });

  it('求 f(-1)+f(1) 时按组合表达式复算为 8，不沿用小问答案 6', () => {
    const result = buildAiDiagnosis(
      { question: '已知 f(x)=x²-2x+3，求 f(-1)+f(1)', finalAnswer: '8', steps: [] },
      aiResult({
        correctAnswer: '6',
        standardSteps: ['f(-1)=6', 'f(1)=2', '6+2=8'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '把两个函数值相加',
        knowledgePoint: '函数值求解',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.correctAnswer).toBe('8');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'conflict', recomputed: '8' }),
    ]));
  });

  it('无法完整识别所求表达式时返回未核验，不用学生步骤里的中间值替代最终答案', () => {
    const result = buildAiDiagnosis(
      { question: '已知 f(x)=2x，求 f(x+1)', finalAnswer: '2', steps: ['f(1)=2'] },
      aiResult({
        correctAnswer: '2x+2',
        standardSteps: ['f(x+1)=2(x+1)=2x+2'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '把 x+1 代入解析式',
        knowledgePoint: '函数值求解',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.correctAnswer).toBe('2x+2');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'unverified' }),
    ]));
  });
});

describe('核验层：方程系数与表达式按原样解析', () => {
  it('小数系数 0.5x=2：x=4 通过，x=0.4 判错', () => {
    const correct = buildAiDiagnosis(
      { question: '解方程 0.5x=2', finalAnswer: 'x=4', steps: [] },
      aiResult({
        correctAnswer: 'x=4',
        standardSteps: ['x=4'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '两边同时除以 0.5',
        knowledgePoint: '一元一次方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(correct.correctAnswer).toBe('x=4');
    expect(correct.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'verified', recomputed: 'x=4' }),
    ]));

    const wrong = buildAiDiagnosis(
      { question: '解方程 0.5x=2', finalAnswer: 'x=0.4', steps: [] },
      aiResult({
        correctAnswer: 'x=0.4',
        standardSteps: ['x=0.4'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '把 0.5x 当成 5x 计算',
        knowledgePoint: '一元一次方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(wrong.correctAnswer).toBe('x=4');
    expect(wrong.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'conflict', recomputed: 'x=4' }),
    ]));
  });

  it('遇到不支持的表达式时停止核验，不从中间截取一段继续求根', () => {
    const result = buildAiDiagnosis(
      { question: '解方程 √(x+1)=2', finalAnswer: 'x=3', steps: [] },
      aiResult({
        correctAnswer: 'x=3',
        standardSteps: ['x=3'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '两边平方后求解',
        knowledgePoint: '无理方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(result.correctAnswer).toBe('x=3');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'unverified' }),
    ]));
  });
});

describe('步骤解析：小数开头不能被当成题号', () => {
  it('1.5+2=3.5 判为成立', () => {
    expect(checkStudentStep('', '1.5+2=3.5').status).toBe('consistent');
  });

  it('1.5+2=7 判为不成立', () => {
    expect(checkStudentStep('', '1.5+2=7').status).toBe('inconsistent');
  });

  it.each(['1. 1.5+2=3.5', '1、1.5+2=3.5', '（1）1.5+2=3.5'])(
    '带明确编号的写法 %j 仍能识别',
    (step) => {
      expect(checkStudentStep('', step).status).toBe('consistent');
    },
  );

  it('AI 把 1.5+2=3.5 误判为错误步骤时，最终结论与之冲突', () => {
    const result = buildAiDiagnosis(
      { question: '计算 1.5+2', finalAnswer: '3.5', steps: ['1.5+2=3.5'] },
      aiResult({
        correctAnswer: '3.5',
        standardSteps: ['1.5+2=3.5'],
        firstWrongStepIndex: 1,
        stepQuote: '1.5+2=3.5',
        reason: '小数加法计算错误',
        knowledgePoint: '有理数运算',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.verification.claims.some(
      (claim) => claim.kind === 'student-step' && claim.status === 'conflict',
    )).toBe(true);
  });
});

describe('核验层：无实数解的完整答案匹配', () => {
  it('x²+1=0 提交“无实数解”通过核验', () => {
    const result = buildAiDiagnosis(
      { question: '解方程 x²+1=0', finalAnswer: '无实数解', steps: [] },
      aiResult({
        correctAnswer: '无实数解',
        standardSteps: ['x^2=-1', '无实数解'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '实数的平方非负，方程无实数解',
        knowledgePoint: '一元二次方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(result.status).toBe('correct');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        expression: 'AI 正确答案',
        status: 'verified',
        recomputed: '无实数解',
      }),
    ]));
  });

  it('“不是无解”不能被当成无解', () => {
    const result = buildAiDiagnosis(
      { question: '解方程 x²+1=0', finalAnswer: '不是无解', steps: [] },
      aiResult({
        correctAnswer: '不是无解',
        standardSteps: ['无实数解'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '答案表述不明确',
        knowledgePoint: '一元二次方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'conflict' }),
    ]));
  });

  it('有实根的方程填写“无实数解”仍判错', () => {
    const result = buildAiDiagnosis(
      { question: '解方程 x²-1=0', finalAnswer: '无实数解', steps: [] },
      aiResult({
        correctAnswer: '无实数解',
        standardSteps: ['x=1或x=-1'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '错误地认为方程没有实根',
        knowledgePoint: '一元二次方程',
        knowledgeNodeId: 'quadratic-equation',
      }),
    );

    expect(result.correctAnswer).toBe('x=-1或x=1');
    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ expression: 'AI 正确答案', status: 'conflict', recomputed: 'x=-1或x=1' }),
    ]));
  });
});

/** 只有最终答案的一道题：观察最终诊断对“AI 正确答案”的核验状态。 */
function answerOnlyDiagnosis(question: string, answer: string) {
  return buildAiDiagnosis(
    { question, finalAnswer: answer, steps: [] },
    aiResult({
      correctAnswer: answer,
      standardSteps: [],
      firstWrongStepIndex: null,
      stepQuote: '',
      reason: '按题干直接求解',
      knowledgePoint: '方程与不等式',
      knowledgeNodeId: 'quadratic-equation',
    }),
  );
}

function aiAnswerClaim(result: ReturnType<typeof buildAiDiagnosis>) {
  return result.verification.claims.find((claim) => claim.expression === 'AI 正确答案');
}

describe('第二轮：方程必须整体解析，不能截取局部表达式', () => {
  it('πx+1=3 不会按 x+1=3 求解：x=2 只能是未核验，参考答案不被覆盖', () => {
    const result = answerOnlyDiagnosis('解方程 πx+1=3', 'x=2');

    expect(aiAnswerClaim(result)).toMatchObject({ status: 'unverified', recomputed: null });
    expect(result.correctAnswer).toBe('x=2');
    expect(result.verification.claims.some((claim) => claim.status === 'verified')).toBe(false);
  });

  it.each([
    ['解方程 x=2√2', 'x=3'],
    ['解方程 x²=8', 'x=2√2'],
    ['解方程 2|x|-3=0', 'x=1.5'],
    ['解方程 x²-2x+1=(x-1)!', 'x=1'],
  ])('未知符号出现在 %s 中时整题降级，不判对也不判错', (question, answer) => {
    const result = answerOnlyDiagnosis(question, answer);

    expect(aiAnswerClaim(result)).toMatchObject({ status: 'unverified' });
    expect(result.verification.claims.some((claim) => claim.status === 'conflict')).toBe(false);
    expect(result.verification.claims.some((claim) => claim.status === 'verified')).toBe(false);
  });

  it('对照：小数系数、常规二次方程与根式方程保持上一轮行为', () => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 0.5x=2', 'x=4'))).toMatchObject({ status: 'verified', recomputed: 'x=4' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 x²-5x+6=0', 'x=2或x=3'))).toMatchObject({ status: 'verified' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 √(x+1)=2', 'x=3'))).toMatchObject({ status: 'unverified' });
  });
});

describe('第二轮：方程整体缩放不改变解集判定', () => {
  it.each([
    ['0.00001x²-0.00001=0', 'x=-1或x=1'],
    ['0.00001x²+0.00001=0', '无实数解'],
    ['0.00001(x-1)²=0', 'x=1'],
    ['100000x²-100000=0', 'x=-1或x=1'],
  ])('缩放后的 %s 的完整解集仍是 %s', (question, expected) => {
    expect(aiAnswerClaim(answerOnlyDiagnosis(question, expected))).toMatchObject({
      status: 'verified',
      recomputed: expected,
    });
  });

  it.each(['x=0', 'x=1'])('缩放后的 x²-1=0 填 %s 判错', (answer) => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('0.00001x²-0.00001=0', answer))).toMatchObject({
      status: 'conflict',
      recomputed: 'x=-1或x=1',
    });
  });

  it('对照：未缩放时同样区分两个实根、无实根与重根', () => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 x²-1=0', 'x=-1或x=1'))).toMatchObject({ status: 'verified' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 x²+1=0', '无实数解'))).toMatchObject({ status: 'verified' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 (x-1)²=0', 'x=1'))).toMatchObject({ status: 'verified' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 (x-1)²=0', 'x=1或x=1.0000001'))).not.toMatchObject({ status: 'verified' });
  });
});

describe('第二轮：函数值全程保留计算精度', () => {
  it('f(x)=x/3，求 f(1)×3：1 通过，0.999999 不通过', () => {
    const correct = answerOnlyDiagnosis('已知 f(x)=x/3，求 f(1)×3', '1');
    expect(aiAnswerClaim(correct)).toMatchObject({ status: 'verified', recomputed: '1' });
    expect(correct.correctAnswer).toBe('1');

    const wrong = answerOnlyDiagnosis('已知 f(x)=x/3，求 f(1)×3', '0.999999');
    expect(aiAnswerClaim(wrong)).toMatchObject({ status: 'conflict', recomputed: '1' });
  });

  it('f(x)=3x，求 f(1/3)：实参不舍入，答案 1 通过', () => {
    const result = answerOnlyDiagnosis('已知 f(x)=3x，求 f(1/3)', '1');
    expect(aiAnswerClaim(result)).toMatchObject({ status: 'verified', recomputed: '1' });
  });

  it('AI 把正确答案 1 写成 0.999999 时，最终诊断更正为 1 而不是舍入值', () => {
    const result = buildAiDiagnosis(
      { question: '已知 f(x)=x/3，求 f(1)×3', finalAnswer: '1', steps: ['f(1)=1/3', 'f(1)×3=1'] },
      aiResult({
        correctAnswer: '0.999999',
        standardSteps: ['f(1)=1/3', 'f(1)×3=1'],
        firstWrongStepIndex: null,
        stepQuote: '',
        reason: '把 1/3 近似成 0.333333',
        knowledgePoint: '函数值求解',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.correctAnswer).toBe('1');
    expect(aiAnswerClaim(result)).toMatchObject({ status: 'conflict', recomputed: '1' });
  });
});

describe('第二轮：步骤开头的括号既可能是题号，也可能是算式因子', () => {
  it('(2)+3=5 成立，(2)+3=3 不成立', () => {
    expect(checkStudentStep('', '(2)+3=5').status).toBe('consistent');
    expect(checkStudentStep('', '(2)+3=3').status).toBe('inconsistent');
  });

  it('(2)×3=6 成立', () => {
    expect(checkStudentStep('', '(2)×3=6').status).toBe('consistent');
  });

  it.each(['1.5+2=3.5', '1. 1.5+2=3.5', '1、1.5+2=3.5', '（1）1.5+2=3.5'])(
    '既有编号与小数写法 %j 继续成立',
    (step) => {
      expect(checkStudentStep('', step).status).toBe('consistent');
    },
  );

  it('AI 把 (2)+3=5 指为错误步骤时，最终诊断按完整算式判定该步成立', () => {
    const result = buildAiDiagnosis(
      { question: '计算 (2)+3', finalAnswer: '5', steps: ['(2)+3=5'] },
      aiResult({
        correctAnswer: '5',
        standardSteps: ['(2)+3=5'],
        firstWrongStepIndex: 1,
        stepQuote: '(2)+3=5',
        reason: '括号内计算错误',
        knowledgePoint: '有理数运算',
        knowledgeNodeId: 'function-value',
      }),
    );

    expect(result.verification.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'student-step', status: 'conflict', recomputed: '5' }),
      expect.objectContaining({ kind: 'final-answer', expression: '学生最终答案', status: 'verified', recomputed: '5' }),
    ]));
    expect(result.verification.claims.some(
      (claim) => claim.kind === 'student-step' && claim.status === 'verified',
    )).toBe(false);
  });
});

describe('第二轮：LaTeX 分数保留分组', () => {
  it('\\frac{1}{2π} 等价于 1/(2π)，不等价于 π/2', () => {
    expect(answersEquivalent('\\frac{1}{2π}', '1/(2π)')).toBe(true);
    expect(answersEquivalent('\\frac{1}{2π}', 'π/2')).toBe(false);
  });

  it('分数作为除数时整体加括号：1/\\frac{1}{2} 等价于 2', () => {
    expect(answersEquivalent('1/\\frac{1}{2}', '2')).toBe(true);
    expect(answersEquivalent('1/\\frac{1}{2}', '0.5')).toBe(false);
  });

  it('\\frac{1+2}{3+1} 等价于 0.75，不等价于 1+2/3+1', () => {
    expect(answersEquivalent('\\frac{1+2}{3+1}', '0.75')).toBe(true);
    expect(answersEquivalent('\\frac{1+2}{3+1}', '1+2/3+1')).toBe(false);
  });
});

describe('第二轮：无解答案在三个入口语义一致', () => {
  it('“无实数解”“无解”“∅”互相等价', () => {
    for (const left of ['无实数解', '无解', '∅']) {
      for (const right of ['无实数解', '无解', '∅']) {
        expect(answersEquivalent(left, right)).toBe(true);
      }
    }
  });

  it('“不是无解”与任何无解表述都不等价', () => {
    expect(answersEquivalent('不是无解', '无实数解')).toBe(false);
    expect(answersEquivalent('无解', '不是无解')).toBe(false);
  });

  it('有实根的方程提交“无解”与根不等价', () => {
    expect(answersEquivalent('无解', 'x=1或x=-1')).toBe(false);
    expect(answersEquivalent('∅', 'x=1')).toBe(false);
  });

  it('诊断入口：x²+1=0 的“无解”和“∅”都通过本地求根核验', () => {
    expect(checkQuestionAnswer('解方程 x²+1=0', [], '无解')).toMatchObject({ status: 'verified', expected: '无实数解' });
    expect(checkQuestionAnswer('解方程 x²+1=0', [], '∅')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer('解方程 x²+1=0', [], '不是无解')).toMatchObject({ status: 'conflict' });
  });
});

describe('第三轮：隐式乘法必须从当前字符读取右操作数', () => {
  it('求 2f(3) 复算为 12：AI 给出的 6 被更正', () => {
    const result = answerOnlyDiagnosis('已知 f(x)=2x，求 2f(3)', '6');

    expect(aiAnswerClaim(result)).toMatchObject({ status: 'conflict', recomputed: '12' });
    expect(result.correctAnswer).toBe('12');
  });

  it.each([
    ['2f(3)', '12'],
    ['2*f(3)', '12'],
    ['f(2)f(3)', '24'],
    ['2(f(3)+1)', '14'],
  ])('求 %s 的正确答案 %s 通过', (expression, answer) => {
    expect(aiAnswerClaim(answerOnlyDiagnosis(`已知 f(x)=2x，求 ${expression}`, answer)))
      .toMatchObject({ status: 'verified', recomputed: answer });
  });
});

describe('第三轮：函数末尾的阶乘不是标点', () => {
  it.each(['已知 f(x)=2x，求 f(2)!', '已知 f(x)=2x，求 f(2)!。'])(
    '%s：答案 4 不得标为已核验',
    (question) => {
      const result = answerOnlyDiagnosis(question, '4');

      expect(aiAnswerClaim(result)).toMatchObject({ status: 'unverified' });
      expect(result.verification.claims.some((claim) => claim.status === 'verified')).toBe(false);
    },
  );

  it('正确答案 24 不判冲突，参考答案保留', () => {
    const result = answerOnlyDiagnosis('已知 f(x)=2x，求 f(2)!', '24');

    expect(aiAnswerClaim(result)).toMatchObject({ status: 'unverified' });
    expect(result.verification.claims.some((claim) => claim.status === 'conflict')).toBe(false);
    expect(result.correctAnswer).toBe('24');
  });
});

describe('第三轮：题干给出的方程不等于题目所求', () => {
  it.each([['求两根之和', '5'], ['求两根之积', '6']])(
    '已知 x²-5x+6=0，%s：参考答案 %s 保留，不被根集覆盖',
    (ask, answer) => {
      const result = answerOnlyDiagnosis(`已知 x²-5x+6=0，${ask}`, answer);

      expect(aiAnswerClaim(result)).toMatchObject({ status: 'unverified' });
      expect(result.correctAnswer).toBe(answer);
      expect(result.verification.claims.some(
        (claim) => claim.status === 'verified' || claim.status === 'conflict',
      )).toBe(false);
    },
  );

  it('对照：解方程 x²-5x+6=0 仍给出完整根集', () => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 x²-5x+6=0', 'x=2或x=3')))
      .toMatchObject({ status: 'verified', recomputed: 'x=2或x=3' });
  });

  it('对照：方程在题干、问“方程的解”时仍按求根核验', () => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('已知 x²-5x+6=0，求方程的解', 'x=2或x=3')))
      .toMatchObject({ status: 'verified' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('已知 x²-5x+6=0，求方程的解', 'x=2')))
      .toMatchObject({ status: 'conflict' });
  });

  it('对照：问“x 的值”按求根核验，问别的字母则不适用', () => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('已知 x²-5x+6=0，求x的值', 'x=2或x=3')))
      .toMatchObject({ status: 'verified' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('已知 x²-5x+6=0，求a的值', 'x=2或x=3')))
      .toMatchObject({ status: 'unverified' });
  });
});

describe('第三轮：小系数不能被清除后声称解集完整', () => {
  it('0.0000000000001x²+x=0 只填 x=0：未核验', () => {
    const result = answerOnlyDiagnosis('解方程 0.0000000000001x²+x=0', 'x=0');

    expect(aiAnswerClaim(result)).toMatchObject({ status: 'unverified' });
    expect(result.verification.claims.some((claim) => claim.status === 'verified')).toBe(false);
  });

  it('整体乘以 10¹³ 后结论一致：同样未核验', () => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 x²+10000000000000x=0', 'x=0')))
      .toMatchObject({ status: 'unverified' });
  });

  it('对照：x²+x=0 完整解集通过，只填 x=0 判错', () => {
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 x²+x=0', 'x=0或x=-1'))).toMatchObject({ status: 'verified' });
    expect(aiAnswerClaim(answerOnlyDiagnosis('解方程 x²+x=0', 'x=0')))
      .toMatchObject({ status: 'conflict', recomputed: 'x=-1或x=0' });
  });
});

describe('第三轮：空格不改变步骤编号的识别', () => {
  it.each(['(2)+3=5', '(2) + 3=5', '(2)　+　3=5', '(2) +3=5', '(2)+ 3=5'])('%s 成立', (step) => {
    expect(checkStudentStep('', step).status).toBe('consistent');
  });

  it.each(['(2)+3=3', '(2) + 3=3', '(2)　+ 3=3', '(2) +3=3'])('%s 不成立', (step) => {
    expect(checkStudentStep('', step).status).toBe('inconsistent');
  });

  it.each(['(2)×3=6', '(2) × 3=6'])('%s 成立', (step) => {
    expect(checkStudentStep('', step).status).toBe('consistent');
  });

  it('(数字) 后紧跟数字且两种读法结论不同：保留不确定性', () => {
    expect(checkStudentStep('', '(2) 1.5+2=3.5').status).toBe('unrecognized');
    expect(checkStudentStep('', '(2)1.5+2=3.5').status).toBe('unrecognized');
  });

  it('(数字) 后紧跟数字但完整算式成立：判成立', () => {
    expect(checkStudentStep('', '(2) 3=6').status).toBe('consistent');
    expect(checkStudentStep('', '（1）1.5+2=3.5').status).toBe('consistent');
  });
});

describe('第三轮：相邻 LaTeX 分数保留操作数边界', () => {
  it('\\frac{1}{2}\\frac{1}{3} 等价于 1/6，不等价于 1/63', () => {
    expect(answersEquivalent('\\frac{1}{2}\\frac{1}{3}', '1/6')).toBe(true);
    expect(answersEquivalent('\\frac{1}{2}\\frac{1}{3}', '1/63')).toBe(false);
  });

  it('数字乘分数：2\\frac{1}{3} 等价于 2/3，不等价于 21/3', () => {
    expect(answersEquivalent('2\\frac{1}{3}', '2/3')).toBe(true);
    expect(answersEquivalent('2\\frac{1}{3}', '21/3')).toBe(false);
  });

  it('分数乘括号：\\frac{1}{2}(3+1) 等价于 2', () => {
    expect(answersEquivalent('\\frac{1}{2}(3+1)', '2')).toBe(true);
  });

  it('分数作为除数：\\frac{1}{2}/\\frac{1}{3} 等价于 1.5', () => {
    expect(answersEquivalent('\\frac{1}{2}/\\frac{1}{3}', '1.5')).toBe(true);
    expect(answersEquivalent('\\frac{1}{2}/\\frac{1}{3}', '1/6')).toBe(false);
  });

  it('含 π 的分母不受影响：2\\frac{1}{2π} 等价于 1/π', () => {
    expect(answersEquivalent('2\\frac{1}{2π}', '1/π')).toBe(true);
    expect(answersEquivalent('2\\frac{1}{2π}', 'π')).toBe(false);
  });

  it('空格分隔的两个因子按乘法处理，不拼接数字', () => {
    expect(answersEquivalent('1/2 1/3', '1/6')).toBe(true);
    expect(answersEquivalent('1/2 1/3', '1/63')).toBe(false);
  });
});

describe('第三轮：根答案里的每个分支都必须被完整消费', () => {
  it('2x=4 提交 x=2(3)：不能通过', () => {
    expect(checkQuestionAnswer('2x=4', [], 'x=2(3)')).not.toMatchObject({ status: 'verified' });
  });

  it('2x=4 提交 x=(1+1)：通过', () => {
    expect(checkQuestionAnswer('2x=4', [], 'x=(1+1)')).toMatchObject({ status: 'verified' });
  });

  it('x=2 或 [无法解析的片段]：未核验，不跳过第二项判对', () => {
    const check = checkQuestionAnswer('2x=4', [], 'x=2 或 xyz');

    expect(check).toMatchObject({ status: 'unverified' });
  });

  it('对照：排列不同、省略 x= 的写法与 ± 写法', () => {
    expect(checkQuestionAnswer('解方程 x²-1=0', [], 'x=1或x=-1')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer('解方程 x²-1=0', [], '-1,1')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer('解方程 x²-1=0', [], 'x=±1')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer('解方程 x²-1=0', [], 'x=-1和x=1。')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer('解方程 x²-1=0', [], 'x=-1或x=1.')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer('解方程 x²-1=0', [], 'x=-1或x=1.5')).toMatchObject({ status: 'conflict' });
  });
});

describe('第三轮共用路径：超出能力时后续核验器不得再下结论', () => {
  it.each([
    ['解方程 πx+1=3', 'x=2'],
    ['已知 f(x)=2x，求 f(2)!', '4'],
    ['已知 x²-5x+6=0，求两根之和', '5'],
    ['解方程 0.0000000000001x²+x=0', 'x=0'],
    ['解方程 x³-x=0', 'x=1'],
    ['计算 2+3√2', '5'],
    ['计算 2+3abc', '5'],
  ])('%s / %s：汇总结果只能是未核验', (question, answer) => {
    expect(checkQuestionAnswer(question, [], answer).status).toBe('unverified');
  });

  it.each([
    ['计算 1-2+3', 'abc', '2'],
    ['已知 f(x)=2x，求 f(3)', '不知道', '6'],
    ['等差数列 {aₙ} 中，a₁=3，公差 d=2，求 a₅', 'a₅', '11'],
  ])('%s 的答案解析不出数值：未核验，不判冲突', (question, unparsable, numeric) => {
    // 对照：同一道题的数值答案能通过，说明核验器确实适用。
    expect(checkQuestionAnswer(question, [], numeric).status).toBe('verified');
    expect(checkQuestionAnswer(question, [], unparsable).status).toBe('unverified');
  });
});

describe('第三轮共用路径：作答判分与核验器口径一致', () => {
  it('答案是同一函数的表达式时按同一求值器计算', () => {
    expect(checkQuestionAnswer('已知 f(x)=2x，求 2f(3)', [], '2f(3)')).toMatchObject({ status: 'verified', expected: '12' });
    expect(checkQuestionAnswer('已知 f(x)=2x，求 2f(3)', [], 'f(3)*2')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer('已知 f(x)=2x，求 2f(3)', [], 'f(3)')).toMatchObject({ status: 'conflict' });
  });

  it('答案末尾的中文句号不影响等价判断', () => {
    expect(answersEquivalent('x=2或x=3。', 'x=2或x=3')).toBe(true);
    expect(checkQuestionAnswer('解方程 x²-5x+6=0', [], 'x=2或x=3。')).toMatchObject({ status: 'verified' });
  });

  it('集合答案的花括号外还有字符时不能通过', () => {
    const question = '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B';

    expect(checkQuestionAnswer(question, [], '{1,2,3,4}')).toMatchObject({ status: 'verified', expected: '{1,2,3,4}' });
    expect(checkQuestionAnswer(question, [], '{1,2,3,4}。')).toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer(question, [], '{1,2,3,4}0')).not.toMatchObject({ status: 'verified' });
    expect(checkQuestionAnswer(question, [], '{1,2,3}或{4}')).not.toMatchObject({ status: 'verified' });
  });
});
