import { describe, expect, it } from 'vitest';
import { planFreeformDiagnosis } from './freeform';

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
