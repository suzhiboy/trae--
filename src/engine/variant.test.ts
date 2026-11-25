import { describe, expect, it, vi } from 'vitest';
import type { FreeformVariantCandidate, VerifiedFreeformVariant } from '../types';
import type { RejectedVariant } from './variant';
import { collectVerifiedVariants, judgeVariantAnswer, normalizeVariantStem, verifyVariantCandidate } from './variant';

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

  it('三次方程只给一个根时不能通过变式筛选', () => {
    const result = verifyVariantCandidate({
      stem: '解方程 x³-x=0',
      answer: 'x=1',
    });

    expect(isVerified(result)).toBe(false);
    if (!isVerified(result)) {
      expect(result.detail).toContain('未展示');
    }
  });

  it('四个采样点吻合也不足以证明次数：四次方程不会被当成二次', () => {
    const result = verifyVariantCandidate({
      stem: '解方程 x⁴-2x³+2x=0',
      answer: 'x=0',
    });

    expect(isVerified(result)).toBe(false);
  });

  it('小数系数方程按 0.5x=2 复算：x=4 通过，x=0.4 丢弃', () => {
    const correct = verifyVariantCandidate({ stem: '解方程 0.5x=2', answer: 'x=4' });
    expect(isVerified(correct)).toBe(true);
    if (isVerified(correct)) {
      expect(correct.verification.kind).toBe('equation');
      expect(correct.verification.expected).toBe('x=4');
    }

    expect(isVerified(verifyVariantCandidate({ stem: '解方程 0.5x=2', answer: 'x=0.4' }))).toBe(false);
  });

  it('无实数解的变式可以被本地复算通过', () => {
    const result = verifyVariantCandidate({ stem: '解方程 x²+1=0', answer: '无实数解' });

    expect(isVerified(result)).toBe(true);
    if (isVerified(result)) {
      expect(result.verification.expected).toBe('无实数解');
    }
  });

  it('不支持的表达式不从中间截取，候选不展示', () => {
    const result = verifyVariantCandidate({ stem: '解方程 √(x+1)=2', answer: 'x=1' });

    expect(isVerified(result)).toBe(false);
  });

  it.each([
    ['解方程 πx+1=3', 'x=2'],
    ['解方程 x²=8', 'x=2√2'],
    ['解方程 2|x|-3=0', 'x=1.5'],
  ])('未知符号出现在 %s 中时，x=… 不因局部截取而通过', (stem, answer) => {
    expect(isVerified(verifyVariantCandidate({ stem, answer }))).toBe(false);
  });

  it('缩放后的 x²-1=0：完整解集通过，x=0 或只填 x=1 都被拒绝', () => {
    const full = verifyVariantCandidate({ stem: '解方程 0.00001x²-0.00001=0', answer: 'x=-1或x=1' });
    expect(isVerified(full)).toBe(true);
    if (isVerified(full)) expect(full.verification.expected).toBe('x=-1或x=1');

    expect(isVerified(verifyVariantCandidate({ stem: '解方程 0.00001x²-0.00001=0', answer: 'x=0' }))).toBe(false);
    expect(isVerified(verifyVariantCandidate({ stem: '解方程 0.00001x²-0.00001=0', answer: 'x=1' }))).toBe(false);
  });

  it('缩放后的无实根与重根方程仍能通过筛选', () => {
    const none = verifyVariantCandidate({ stem: '解方程 0.00001x²+0.00001=0', answer: '无实数解' });
    expect(isVerified(none)).toBe(true);
    const repeated = verifyVariantCandidate({ stem: '解方程 0.00001(x-1)²=0', answer: 'x=1' });
    expect(isVerified(repeated)).toBe(true);
  });

  it('函数变式的中间值不舍入：f(1)×3 的答案是 1', () => {
    expect(isVerified(verifyVariantCandidate({ stem: '已知 f(x)=x/3，求 f(1)×3', answer: '1' }))).toBe(true);
    expect(isVerified(verifyVariantCandidate({ stem: '已知 f(x)=x/3，求 f(1)×3', answer: '0.999999' }))).toBe(false);
  });
});

describe('变式作答判分：与候选筛选共用无解语义', () => {
  const noRealRoots = verifyVariantCandidate({ stem: '解方程 x²+1=0', answer: '无实数解' });
  const realRoots = verifyVariantCandidate({ stem: '解方程 x²-1=0', answer: 'x=-1或x=1' });

  it('先确认两道变式确实通过了本地复算筛选', () => {
    expect(isVerified(noRealRoots)).toBe(true);
    expect(isVerified(realRoots)).toBe(true);
  });

  it.each(['无实数解', '无解', '∅'])('对无实根变式提交“%s”判对', (answer) => {
    if (!isVerified(noRealRoots)) throw new Error('变式未通过筛选');
    expect(judgeVariantAnswer(noRealRoots, answer)).toEqual({ correct: true });
  });

  it('提交“不是无解”判错', () => {
    if (!isVerified(noRealRoots)) throw new Error('变式未通过筛选');
    expect(judgeVariantAnswer(noRealRoots, '不是无解').correct).toBe(false);
  });

  it('对有实根的变式提交“无解”“∅”判错，提交完整解集判对', () => {
    if (!isVerified(realRoots)) throw new Error('变式未通过筛选');
    expect(judgeVariantAnswer(realRoots, '无解').correct).toBe(false);
    expect(judgeVariantAnswer(realRoots, '∅').correct).toBe(false);
    expect(judgeVariantAnswer(realRoots, 'x=1或x=-1')).toEqual({ correct: true });
  });
});

describe('第三轮：变式候选筛选与作答判分', () => {
  it.each([
    ['已知 f(x)=2x，求 2f(3)', '6'],
    ['已知 f(x)=2x，求 f(2)!', '4'],
    ['已知 f(x)=2x，求 f(2)!', '24'],
    ['解方程 0.0000000000001x²+x=0', 'x=0'],
    ['解方程 x²+10000000000000x=0', 'x=0'],
    ['2x=4', 'x=2(3)'],
    ['2x=4', 'x=2 或 xyz'],
  ])('候选「%s」答案「%s」被筛选拒绝', (stem, answer) => {
    expect(isVerified(verifyVariantCandidate({ stem, answer }))).toBe(false);
  });

  it('通过筛选的函数变式：作答 2f(3) 与 12 判对，6 判错', () => {
    const variant = verifyVariantCandidate({ stem: '已知 f(x)=2x，求 2f(3)', answer: '12' });
    if (!isVerified(variant)) throw new Error('变式未通过筛选');

    expect(judgeVariantAnswer(variant, '2f(3)')).toEqual({ correct: true });
    expect(judgeVariantAnswer(variant, '12')).toEqual({ correct: true });
    expect(judgeVariantAnswer(variant, '6').correct).toBe(false);
  });

  it('通过筛选的方程变式：作答 x=±1 判对，漏根判错', () => {
    const variant = verifyVariantCandidate({ stem: '解方程 x²-1=0', answer: 'x=-1或x=1' });
    if (!isVerified(variant)) throw new Error('变式未通过筛选');

    expect(judgeVariantAnswer(variant, 'x=±1')).toEqual({ correct: true });
    expect(judgeVariantAnswer(variant, 'x=1').correct).toBe(false);
  });

  it('正确答案带句末句号时，页面判分不因字符串比较判错', () => {
    const variant = verifyVariantCandidate({ stem: '解方程 x²-5x+6=0', answer: 'x=2或x=3' });
    if (!isVerified(variant)) throw new Error('变式未通过筛选');

    expect(judgeVariantAnswer(variant, 'x=2或x=3。')).toEqual({ correct: true });
    expect(judgeVariantAnswer(variant, 'x=3或x=2。')).toEqual({ correct: true });
    expect(judgeVariantAnswer(variant, 'x=2。').correct).toBe(false);
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
