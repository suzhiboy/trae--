import { describe, expect, it } from 'vitest';
import type { ErrorFingerprint } from './variantReview';
import { compareVariantError } from './variantReview';

function fingerprint(overrides: Partial<ErrorFingerprint> = {}): ErrorFingerprint {
  return {
    status: 'diagnosed',
    knowledgeNodeId: 'function-value',
    knowledgePoint: '函数值求解',
    reason: '一次项代入时把 -2×(-1) 写成了 -2',
    ...overrides,
  };
}

describe('变式再诊断：同一错因 / 新问题 / 无法判断', () => {
  it('两个诊断指向同一知识节点时，判为错因很可能仍在', () => {
    const result = compareVariantError(fingerprint(), fingerprint());

    expect(result.verdict).toBe('same-error');
    expect(result.basis).toBe('same-node');
    expect(result.detail).toContain('函数值求解');
    expect(result.detail).toContain('不是独立证明');
  });

  it('知识节点不同时，判为原错因未复现但出现新问题', () => {
    const result = compareVariantError(
      fingerprint(),
      fingerprint({
        knowledgeNodeId: 'set-operations',
        knowledgePoint: '集合运算',
        reason: '把交集当成并集',
      }),
    );

    expect(result.verdict).toBe('different-error');
    expect(result.basis).toBe('different-node');
    expect(result.detail).toContain('函数值求解');
    expect(result.detail).toContain('集合运算');
    expect(result.detail).toContain('原错因未复现');
  });

  it('没有节点 ID 时用知识点文字比较，忽略空格与标点', () => {
    const result = compareVariantError(
      fingerprint({ knowledgeNodeId: null, knowledgePoint: '函数 值求解' }),
      fingerprint({ knowledgeNodeId: null, knowledgePoint: '函数值求解。' }),
    );

    expect(result.verdict).toBe('same-error');
    expect(result.basis).toBe('same-point');
  });

  it('知识点文字不同时判为新问题', () => {
    const result = compareVariantError(
      fingerprint({ knowledgeNodeId: null, knowledgePoint: '函数值求解' }),
      fingerprint({ knowledgeNodeId: null, knowledgePoint: '集合运算' }),
    );

    expect(result.verdict).toBe('different-error');
    expect(result.basis).toBe('different-point');
  });

  it('变式诊断证据不足时，不硬判同一错因', () => {
    const result = compareVariantError(
      fingerprint(),
      fingerprint({ status: 'unknown' }),
    );

    expect(result.verdict).toBe('undetermined');
    expect(result.basis).toBe('insufficient');
    expect(result.detail).toContain('证据不足');
  });

  it('缺少可对比知识点时保持无法判断', () => {
    const result = compareVariantError(
      fingerprint({ knowledgeNodeId: null, knowledgePoint: '' }),
      fingerprint({ knowledgeNodeId: null, knowledgePoint: '' }),
    );

    expect(result.verdict).toBe('undetermined');
  });

  it('节点 ID 优先于知识点文字：节点不同就不冒充同一错因', () => {
    const result = compareVariantError(
      fingerprint({ knowledgeNodeId: 'function-value', knowledgePoint: '函数值求解' }),
      fingerprint({ knowledgeNodeId: 'set-operations', knowledgePoint: '函数值求解' }),
    );

    expect(result.verdict).toBe('different-error');
    expect(result.basis).toBe('different-node');
  });
});
