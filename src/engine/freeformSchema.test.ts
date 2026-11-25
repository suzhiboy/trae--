import { describe, expect, it } from 'vitest';
import { knowledgeNodes } from '../data/knowledge';
import { parseFreeformAiResult, parseVariantList } from './freeformSchema';

const allowedNodeIds = new Set(knowledgeNodes.map((node) => node.id));

function rawResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correctAnswer: '6',
    standardSteps: ['f(-1)=1+2+3=6'],
    firstWrongStepIndex: 1,
    stepQuote: 'f(-1)=1-2+3=2',
    reason: '一次项符号写错',
    knowledgePoint: '函数值求解',
    knowledgeNodeId: 'function-value',
    variants: [
      { stem: '已知 f(x)=x²-2x+3，求 f(2)', answer: '3' },
      { stem: '已知 f(x)=x²-2x+3，求 f(0)', answer: '3' },
    ],
    confidence: 'medium',
    claims: [],
    insufficientEvidence: false,
    uncertainty: '',
    ...overrides,
  };
}

describe('任意题结构校验：变式候选', () => {
  it('保留 2 道变式候选，并用第一道兼容旧 variant 字段', () => {
    const result = parseFreeformAiResult(rawResult(), allowedNodeIds);

    expect(result).not.toBeNull();
    expect(result?.variants).toHaveLength(2);
    expect(result?.variants?.[0].answer).toBe('3');
    expect(result?.variant.stem).toBe('已知 f(x)=x²-2x+3，求 f(2)');
  });

  it('旧服务端只返回 variant 时，自动转成单元素列表', () => {
    const result = parseFreeformAiResult(rawResult({
      variants: undefined,
      variant: { stem: '已知 f(x)=x²-2x+3，求 f(1)', answer: '2' },
    }), allowedNodeIds);

    expect(result?.variants).toHaveLength(1);
    expect(result?.variants?.[0].answer).toBe('2');
  });

  it('变式列表含不合格条目时整组丢弃，但保留诊断本身', () => {
    const result = parseFreeformAiResult(rawResult({
      variants: [
        { stem: '已知 f(x)=x²-2x+3，求 f(2)', answer: '3' },
        { stem: '', answer: '3' },
      ],
    }), allowedNodeIds);

    expect(result).not.toBeNull();
    expect(result?.variants).toEqual([]);
  });

  it('没有变式时不拒绝诊断；变式由补充接口单独生成', () => {
    const result = parseFreeformAiResult(rawResult({
      variants: undefined,
      variant: undefined,
    }), allowedNodeIds);

    expect(result).not.toBeNull();
    expect(result?.variants).toEqual([]);
    expect(result?.reason).toBe('一次项符号写错');
  });

  it('证据不足时允许没有变式，但仍保留空列表', () => {
    const result = parseFreeformAiResult(rawResult({
      insufficientEvidence: true,
      variants: [],
      firstWrongStepIndex: null,
      stepQuote: '',
    }), allowedNodeIds);

    expect(result?.insufficientEvidence).toBe(true);
    expect(result?.variants).toEqual([]);
  });

  it('parseVariantList 支持最小数量约束并拒绝空列表', () => {
    expect(parseVariantList([], 1, 3)).toBeNull();
    expect(parseVariantList([
      { stem: '计算 1+2', answer: '3' },
      { stem: '计算 2+3', answer: '5' },
    ], 2, 3)).toHaveLength(2);
    expect(parseVariantList('not-an-array')).toBeNull();
    expect(parseVariantList(undefined)).toBeNull();
  });
});
