import { describe, expect, it } from 'vitest';
import { questions } from '../data/knowledge';
import type { VerifiedFreeformVariant } from '../types';
import type { RejectedVariant } from './variant';
import { checkQuestionAnswer } from './calcVerifiers';
import { matchBuiltinQuestion } from './freeform';
import { judgeVariantAnswer, verifyVariantCandidate } from './variant';

type Outcome = VerifiedFreeformVariant | RejectedVariant;

function isVerified(outcome: Outcome): outcome is VerifiedFreeformVariant {
  return 'verification' in outcome;
}

function verifiedVariant(stem: string, answer: string): VerifiedFreeformVariant {
  const outcome = verifyVariantCandidate({ stem, answer });
  if (!isVerified(outcome)) throw new Error(`变式未通过筛选：${stem}`);
  return outcome;
}

describe('调用链一：自由题输入 → 题目路由', () => {
  it('12 道内置题在空格、全半角逗号、句末句号的差异下仍命中', () => {
    for (const question of questions) {
      const forms = [
        question.stem,
        question.stem.replace(/，/g, ','),
        `  ${question.stem}。`,
        `${question.stem.replace(/，/g, '，')}.`,
      ];
      for (const form of forms) expect(matchBuiltinQuestion(form)?.id, form).toBe(question.id);
    }
  });

  it('追加问法、运算或阶乘后不再命中内置题', () => {
    for (const question of questions) {
      for (const suffix of [' 再加一', '的相反数', '!']) {
        expect(matchBuiltinQuestion(question.stem + suffix), question.stem + suffix).toBeNull();
      }
    }
  });
});

describe('调用链二：AI 变式候选 → 本地复算筛选', () => {
  it('可复算的内置题答案通过筛选，答案后面多一个字符即被拒绝', () => {
    for (const question of questions) {
      const tampered = verifyVariantCandidate({ stem: question.stem, answer: `${question.correctAnswer}0` });
      expect(isVerified(tampered), `${question.id} ${question.correctAnswer}0`).toBe(false);
    }
  });

  it('超出本地能力的题即使答案正确也不展示', () => {
    const cases: Array<[string, string]> = [
      ['解方程 x³-x=0', 'x=1或x=0或x=-1'],
      ['解方程 πx+1=3', 'x=2/π'],
      ['已知 x²-5x+6=0，求两根之和', '5'],
      ['已知 f(x)=2x，求 f(2)!', '24'],
      ['解方程 0.0000000000001x²+x=0', 'x=0或x=-10000000000000'],
      ['解方程 x²-1e-15=0', 'x=0'],
      ['已知 f(x)=2x，求 f(x+1)', '2x+2'],
      ['解方程 6/x=2', 'x=3'],
    ];

    for (const [stem, answer] of cases) {
      expect(checkQuestionAnswer(stem, [], answer).status, `${stem} | ${answer}`).toBe('unverified');
      expect(isVerified(verifyVariantCandidate({ stem, answer })), stem).toBe(false);
    }
  });
});

describe('调用链三：学生提交变式 → 页面判分', () => {
  const equation = verifiedVariant('解方程 x²-5x+6=0', 'x=2或x=3');
  const functions = verifiedVariant('已知 f(x)=2x，求 2f(3)', '12');
  const union = verifiedVariant('设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B', '{1,2,3,4}');

  it.each(['x=2或x=3', 'x=3,x=2', '2或3', 'x₁=2，x₂=3', 'x=2和x=3。', 'x=(1+1)或x=6/2', 'x=2 或 x=3'])(
    '方程变式的正确写法「%s」判对',
    (answer) => {
      expect(judgeVariantAnswer(equation, answer)).toEqual({ correct: true });
    },
  );

  it.each(['x=2', 'x=2或x=4', '无解', 'x=2(3)', 'x=2或xyz', 'x=1或x=2'])(
    '方程变式的错误或不完整写法「%s」判错',
    (answer) => {
      expect(judgeVariantAnswer(equation, answer).correct).toBe(false);
    },
  );

  it.each(['12', '2f(3)', 'f(3)*2', '4*3', '2×6'])('函数变式的正确写法「%s」判对', (answer) => {
    expect(judgeVariantAnswer(functions, answer)).toEqual({ correct: true });
  });

  it.each(['6', 'f(3)', '24', '不知道'])('函数变式的错误写法「%s」判错', (answer) => {
    expect(judgeVariantAnswer(functions, answer).correct).toBe(false);
  });

  it.each(['{1,2,3,4}', '{4,3,2,1}', 'A∪B={1,2,3,4}', '{1, 2, 3, 4}'])(
    '集合变式的正确写法「%s」判对',
    (answer) => {
      expect(judgeVariantAnswer(union, answer)).toEqual({ correct: true });
    },
  );

  it.each(['{1,2,3}', '{1,2,3,4}0', '{1,2,3,4,5}'])('集合变式的错误写法「%s」判错', (answer) => {
    expect(judgeVariantAnswer(union, answer).correct).toBe(false);
  });
});
