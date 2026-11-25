import { describe, expect, it } from 'vitest';
import { matchBuiltinQuestion, planFreeformDiagnosis } from './freeform';

describe('规则优先：命中内置题不进入 AI', () => {
  it('内置集合题返回规则计划，不产生 AI 请求', () => {
    const plan = planFreeformDiagnosis(
      '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B',
      '{1,2,3,4}',
      ['A∪B={1,2,3,4}'],
    );

    expect(plan.kind).toBe('rules');
    if (plan.kind === 'rules') {
      expect(plan.result.source).toBe('rules');
      expect(plan.result.diagnosis.status).toBe('correct');
    }
  });

  it('非内置题返回 AI 计划，由调用方决定使用哪份凭证', () => {
    const plan = planFreeformDiagnosis(
      '已知 f(x)=x²-3x+2，求 f(2)',
      '4',
      ['f(2)=4-6+2=4'],
    );

    expect(plan.kind).toBe('ai');
  });
});

describe('内置题匹配：追加运算、条件或新问法后必须退出规则', () => {
  it('追加数学运算后不使用只求 f(-1) 的内置题', () => {
    const plan = planFreeformDiagnosis(
      '已知 f(x)=x²-2x+3，求 f(-1)+f(1)',
      '6',
      ['f(-1)=1+2+3=6', 'f(1)=1-2+3=2'],
    );

    expect(plan.kind).toBe('ai');
  });

  it('追加新问法后不使用内置题', () => {
    const plan = planFreeformDiagnosis(
      '已知 f(x)=x²-2x+3，求 f(-1)，并说明理由',
      '6',
      ['f(-1)=6'],
    );

    expect(plan.kind).toBe('ai');
  });

  it('追加条件后不使用内置题', () => {
    expect(matchBuiltinQuestion('已知 f(x)=x²-2x+3 且 x>0，求 f(-1)')).toBeNull();
  });

  it.each([
    '已知 f(x)=x²-2x+3，求 f(-1)',
    '  已知 f(x)=x²-2x+3, 求 f(-1)。 ',
    '已知 ｆ（ｘ）＝ｘ²－２ｘ＋３，求 ｆ（－１）',
    '已知 f(x)=x²-2x+3，求 f(-1)',
    '已知 f(x)=x²-2x+3，求 f(-1).',
    '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B。',
  ])('仅有空格、全半角逗号或句末句号差异的题干 %j 仍可离线命中', (text) => {
    expect(matchBuiltinQuestion(text)?.id).toBeTruthy();
  });

  it('命中时题号正确：格式差异不改变命中的内置题', () => {
    expect(matchBuiltinQuestion('已知 f(x)=x²-2x+3, 求 f(-1).')?.id).toBe('function-negative-input');
    expect(matchBuiltinQuestion('设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∪B。')?.id)
      .toBe('set-union-basic');
  });

  it.each([
    '已知 f(x)=x²-2x+3，求 f(-1) 再加一',
    '已知 f(x)=x²-2x+3，求 f(-1)的相反数',
    '已知 f(x)=x²-2x+3，求 f(-1)+f(1)',
    '已知 f(x)=x²-2x+3，求 f(-1)!',
    '设 U={1,2,3,4,5}，A={12,3}，B={2,4}，求 A∪B',
    '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∩B',
  ])('题干 %j 追加问法或改变数学含义后不再命中内置题', (text) => {
    expect(matchBuiltinQuestion(text)).toBeNull();
  });

  it('“求 f(-1) 再加一”填 6 走自由题流程，不会被内置题规则判成正确', () => {
    const plan = planFreeformDiagnosis('已知 f(x)=x²-2x+3，求 f(-1) 再加一', '6', ['f(-1)=6']);
    expect(plan.kind).toBe('ai');
  });
});
