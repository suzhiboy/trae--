import { knowledgeNodes } from '../data/knowledge';
import type { AttemptStatus, VariantErrorVerdict } from '../types';
import { normalizeAnswer } from './normalize';

/**
 * 变式答错后的错因对比。
 * 只做“两次 AI 诊断是否指向同一知识点”的证据对照，不把结论升级成已核验。
 */

export interface ErrorFingerprint {
  status: AttemptStatus;
  knowledgeNodeId: string | null;
  knowledgePoint: string;
  reason: string;
}

export interface VariantComparison {
  verdict: VariantErrorVerdict;
  basis: 'same-node' | 'same-point' | 'different-node' | 'different-point' | 'insufficient';
  detail: string;
}

function nodeLabel(nodeId: string): string {
  return knowledgeNodes.find((node) => node.id === nodeId)?.label ?? nodeId;
}

function pointKey(point: string): string {
  return normalizeAnswer(point).replace(/[\s，,。；;：:、]/g, '');
}

export function compareVariantError(
  original: ErrorFingerprint,
  variant: ErrorFingerprint,
): VariantComparison {
  if (variant.status === 'unknown') {
    return {
      verdict: 'undetermined',
      basis: 'insufficient',
      detail: '变式诊断本身证据不足或与本地复算冲突，无法判断是否仍是同一错因。',
    };
  }
  if (variant.status === 'correct') {
    return {
      verdict: 'undetermined',
      basis: 'insufficient',
      detail: '变式已被判为正确，不需要比较错因。',
    };
  }

  const originalNode = original.knowledgeNodeId;
  const variantNode = variant.knowledgeNodeId;
  if (originalNode && variantNode) {
    if (originalNode === variantNode) {
      return {
        verdict: 'same-error',
        basis: 'same-node',
        detail: `两次诊断都指向「${nodeLabel(originalNode)}」；这是 AI 对知识点的映射，不是独立证明。`,
      };
    }
    return {
      verdict: 'different-error',
      basis: 'different-node',
      detail: `原诊断指向「${nodeLabel(originalNode)}」，变式诊断指向「${nodeLabel(variantNode)}」；原错因未复现，但出现了新的问题。`,
    };
  }

  const originalPoint = pointKey(original.knowledgePoint);
  const variantPoint = pointKey(variant.knowledgePoint);
  if (originalPoint && variantPoint) {
    if (originalPoint === variantPoint) {
      return {
        verdict: 'same-error',
        basis: 'same-point',
        detail: `两次 AI 诊断的知识点文字一致：「${original.knowledgePoint}」；仍需人工核对。`,
      };
    }
    return {
      verdict: 'different-error',
      basis: 'different-point',
      detail: `原诊断知识点「${original.knowledgePoint}」，变式诊断「${variant.knowledgePoint}」；原错因未复现，但出现了新的问题。`,
    };
  }

  return {
    verdict: 'undetermined',
    basis: 'insufficient',
    detail: '至少一次诊断没有可对比的知识点，无法判断是否仍是同一错因。',
  };
}
