import { describe, expect, it, vi } from 'vitest';
import type { FreeformVariantCandidate, VerifiedFreeformVariant } from '../types';
import type { RejectedVariant } from './variant';
import { collectVerifiedVariants, normalizeVariantStem, verifyVariantCandidate } from './variant';

function isVerified(result: VerifiedFreeformVariant | RejectedVariant): result is VerifiedFreeformVariant {
  return 'verification' in result;
}

describe('变式复算：只有能从题干独立算对的题才展示', () => {
  it('函数代入变式：答案 3 通过复算', () => {
    const result = verifyVariantCandidate({
      stem: '已知 f(x)=x²-2x+3，求 f(2)',
      answer: '3',
    });

    expect(isVerified(result)).toBe(true);
    if (isVerified(result)) {
      expect(result.verification.kind).toBe('function');
      expect(result.verification.expected).toBe('3');
    }
  });

  it('函数代入变式：答案 4 与复算冲突，直接丢弃', () => {
    const result = verifyVariantCandidate({
      stem: '已知 f(x)=x²-2x+3，求 f(2)',
      answer: '4',
    });

    expect(isVerified(result)).toBe(false);
    if (!isVerified(result)) {
      expect(result.detail).toContain('不一致');
      expect(result.expected).toBe('3');
    }
  });

  it('集合变式：A∩B={2} 通过复算', () => {
    const result = verifyVariantCandidate({
      stem: '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∩B',
      answer: '{2}',
    });

    expect(isVerified(result)).toBe(true);
    if (isVerified(result)) {
      expect(result.verification.kind).toBe('set');
      expect(result.verification.expected).toBe('{2}');
    }
  });

  it('一元二次方程变式：求根结果一致才保留', () => {
    const result = verifyVariantCandidate({
      stem: '解方程 x²-7x+12=0',
      answer: 'x=3或x=4',
    });

    expect(isVerified(result)).toBe(true);
    if (isVerified(result)) {
      expect(result.verification.kind).toBe('equation');
      expect(result.verification.expected).toBe('x=3或x=4');
    }
  });

  it('等差数列求和变式：S₄=32 通过复算', () => {
    const result = verifyVariantCandidate({
      stem: '等差数列 {aₙ} 中，a₁=2，公差 d=4，求前 4 项和 S₄',
      answer: '32',
    });

    expect(isVerified(result)).toBe(true);
    if (isVerified(result)) {
      expect(result.verification.kind).toBe('sequence');
      expect(result.verification.expected).toBe('32');
    }
  });

  it('等差数列单项变式：求 a₈ 也能独立复算', () => {
    const result = verifyVariantCandidate({
      stem: '等差数列 {aₙ} 中，a₁=3，公差 d=2，求 a₈',
      answer: '17',
    });

    expect(isVerified(result)).toBe(true);
    if (isVerified(result)) {
      expect(result.verification.expected).toBe('17');
    }
  });

  it('纯数字算式变式：计算 1-2+3 通过复算', () => {
    const result = verifyVariantCandidate({
      stem: '计算 1-2+3',
      answer: '2',
    });

    expect(isVerified(result)).toBe(true);
    if (isVerified(result)) {
      expect(result.verification.kind).toBe('arithmetic');
      expect(result.verification.expected).toBe('2');
    }
  });

  it('三角函数题暂不能独立复算，不展示而不是标“大概对”', () => {
    const result = verifyVariantCandidate({
      stem: '计算 sin(π/6)+cos(π/3)',
      answer: '1',
    });

    expect(isVerified(result)).toBe(false);
    if (!isVerified(result)) {
      expect(result.detail).toContain('未展示');
    }
  });

  it('缺题干或答案的候选直接丢弃', () => {
    expect(isVerified(verifyVariantCandidate({ stem: '', answer: '3' }))).toBe(false);
    expect(isVerified(verifyVariantCandidate({ stem: '已知 f(x)=x²-2x+3，求 f(2)', answer: '' }))).toBe(false);
  });
});

describe('变式收集：复算不通过就补充生成，最多两轮', () => {
  const validOne: FreeformVariantCandidate = {
    stem: '已知 f(x)=x²-2x+3，求 f(2)',
    answer: '3',
  };
  const wrong: FreeformVariantCandidate = {
    stem: '已知 f(x)=x²-2x+3，求 f(3)',
    answer: '4',
  };
  const validTwo: FreeformVariantCandidate = {
    stem: '设 U={1,2,3,4,5}，A={1,2,3}，B={2,4}，求 A∩B',
    answer: '{2}',
  };

  it('首轮一真一假，第二轮补生成后凑齐 2 道', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce([validOne, wrong])
      .mockResolvedValueOnce([validTwo]);
    const result = await collectVerifiedVariants(request, { target: 2, maxRounds: 2 });

    expect(result.verified).toHaveLength(2);
    expect(result.verified.map((item) => item.answer)).toEqual(['3', '{2}']);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].candidate.answer).toBe('4');
    expect(result.rounds).toBe(2);
    expect(result.exhausted).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toEqual(expect.arrayContaining([validOne.stem, wrong.stem]));
  });

  it('两轮都凑不齐时如实标记 exhausted，不拿未通过题凑数', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce([wrong])
      .mockResolvedValueOnce([wrong]);
    const result = await collectVerifiedVariants(request, { target: 2, maxRounds: 2 });

    expect(result.verified).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.exhausted).toBe(true);
  });

  it('重复题干只保留一次，并传给补生成作为排除项', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce([validOne, { ...validOne }])
      .mockResolvedValueOnce([validTwo]);
    const result = await collectVerifiedVariants(request, { target: 2, maxRounds: 2 });

    expect(result.verified).toHaveLength(2);
    const secondCallExclude = request.mock.calls[1][1] as string[];
    expect(secondCallExclude).toContain(validOne.stem);
    expect(normalizeVariantStem(secondCallExclude[0])).toBe(normalizeVariantStem(validOne.stem));
  });

  it('已有排除题干不重复使用', async () => {
    const request = vi.fn().mockResolvedValueOnce([validOne, validTwo]);
    const result = await collectVerifiedVariants(request, {
      target: 2,
      maxRounds: 1,
      excludeStems: [validOne.stem],
    });

    expect(result.verified).toHaveLength(1);
    expect(result.verified[0].answer).toBe('{2}');
    expect(result.exhausted).toBe(true);
  });

  it('补充生成失败时保留已通过的题，并给出错误提示', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce([validOne])
      .mockRejectedValueOnce(new Error('network'));
    const result = await collectVerifiedVariants(request, { target: 2, maxRounds: 2 });

    expect(result.verified).toHaveLength(1);
    expect(result.requestError).toBe('network');
    expect(result.exhausted).toBe(true);
  });
});
