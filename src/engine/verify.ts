import { knowledgeNodes } from '../data/knowledge';
import type {
  AiClaim,
  FreeformAiDiagnosis,
  FreeformAiResult,
  FreeformVerification,
  VerificationState,
  VerifiedClaim,
} from '../types';
import { normalizeAnswer } from './normalize';
import {
  checkAiClaim,
  checkQuestionAnswer,
  checkStudentStep,
  formatNumber,
  isClose,
  isNoSolutionAnswer,
  parseNumericAnswer,
} from './calcVerifiers';

export interface FreeformInput {
  question: string;
  finalAnswer: string;
  steps: string[];
}

const validNodeIds = new Set(knowledgeNodes.map((node) => node.id));

function normalizeQuote(text: string): string {
  return normalizeAnswer(text).replace(/[。；;：:，,、\s]/g, '');
}

/** 解集顺序无关：x=3或x=2 与 x=2或x=3 视为同一答案。 */
export function normalizeSolutionAnswer(answer: string): string {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return '';
  if (normalized.includes('{')) return normalized;

  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^[a-z][0-9]?=/, ''));

  if (parts.length > 1) return parts.sort().join(',');
  return parts[0] ?? normalized;
}

export function answersEquivalent(left: string, right: string): boolean {
  // “无解”类答案按语义比较，与本地求根核验共用同一套认定：无解表述之间互相等价，
  // 但绝不与任何具体数值或解集等价。
  const leftNoSolution = isNoSolutionAnswer(left);
  const rightNoSolution = isNoSolutionAnswer(right);
  if (leftNoSolution || rightNoSolution) return leftNoSolution && rightNoSolution;

  const leftNormalized = normalizeAnswer(left);
  const rightNormalized = normalizeAnswer(right);
  const multiValue = leftNormalized.includes(',') || rightNormalized.includes(',');
  if (!multiValue) {
    const leftNumber = parseNumericAnswer(left);
    const rightNumber = parseNumericAnswer(right);
    if (leftNumber !== null && rightNumber !== null) return isClose(leftNumber, rightNumber);
  }
  return normalizeSolutionAnswer(left) === normalizeSolutionAnswer(right);
}

function findQuoteIndex(steps: string[], quote: string): number | null {
  const normalized = normalizeQuote(quote);
  if (!normalized) return null;

  const exact = steps.findIndex((step) => normalizeQuote(step) === normalized);
  if (exact !== -1) return exact;
  if (normalized.length < 4) return null;

  const contained = steps.findIndex((step) => {
    const normalizedStep = normalizeQuote(step);
    return normalizedStep.length >= 4
      && (normalizedStep.includes(normalized) || normalized.includes(normalizedStep));
  });
  return contained === -1 ? null : contained;
}

interface ResolvedIndex {
  index: number | null;
  quote: string;
  conflict: string | null;
  note: string | null;
}

function resolveStudentStep(steps: string[], ai: FreeformAiResult): ResolvedIndex {
  const rawIndex = ai.firstWrongStepIndex;
  const quote = ai.stepQuote.trim();

  if (quote) {
    const found = findQuoteIndex(steps, quote);
    if (found !== null) {
      const canonicalQuote = steps[found];
      if (rawIndex === null) {
        return {
          index: found,
          quote: canonicalQuote,
          conflict: null,
          note: 'AI 没有给序号，按引用原句定位。',
        };
      }
      if (rawIndex === found + 1 || rawIndex === found) {
        return { index: found, quote: canonicalQuote, conflict: null, note: null };
      }
      return {
        index: found,
        quote: canonicalQuote,
        conflict: `AI 给的序号是第 ${rawIndex} 步，但引用原句实际在第 ${found + 1} 步；以引用原句为准。`,
        note: null,
      };
    }

    if (rawIndex !== null && rawIndex >= 1 && rawIndex <= steps.length) {
      return {
        index: rawIndex - 1,
        quote: steps[rawIndex - 1],
        conflict: 'AI 引用的原句不在学生步骤中；已按序号取对应原文，错误定位需复核。',
        note: null,
      };
    }
    if (rawIndex !== null && rawIndex >= 0 && rawIndex < steps.length) {
      return {
        index: rawIndex,
        quote: steps[rawIndex],
        conflict: 'AI 引用的原句不在学生步骤中；已按 0 起序号取对应原文，错误定位需复核。',
        note: null,
      };
    }
    return {
      index: null,
      quote,
      conflict: 'AI 引用的原句不在学生步骤中，且序号越界；不能据此定位错误步骤。',
      note: null,
    };
  }

  if (rawIndex !== null) {
    if (rawIndex >= 1 && rawIndex <= steps.length) {
      return {
        index: rawIndex - 1,
        quote: steps[rawIndex - 1],
        conflict: null,
        note: 'AI 未引用原句，按 1 起序号取对应学生步骤。',
      };
    }
    if (rawIndex >= 0 && rawIndex < steps.length) {
      return {
        index: rawIndex,
        quote: steps[rawIndex],
        conflict: null,
        note: 'AI 未引用原句，按 0 起序号取对应学生步骤。',
      };
    }
    return {
      index: null,
      quote: '',
      conflict: `AI 给的错误步骤序号 ${rawIndex} 越界，学生只有 ${steps.length} 步。`,
      note: null,
    };
  }

  return { index: null, quote: '', conflict: null, note: null };
}

function addClaim(map: Map<string, VerifiedClaim>, claim: VerifiedClaim): void {
  const key = `${claim.kind}:${normalizeQuote(claim.expression)}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, claim);
    return;
  }
  const priority = (value: VerificationState): number =>
    value === 'conflict' ? 3 : value === 'verified' ? 2 : 1;
  if (priority(claim.status) > priority(existing.status)) map.set(key, claim);
}

function claimFromCheck(
  kind: VerifiedClaim['kind'],
  expression: string,
  claimed: string,
  check: { status: VerificationState; expected: string | null; detail: string },
): VerifiedClaim {
  return {
    kind,
    expression,
    claimed,
    recomputed: check.expected,
    status: check.status,
    detail: check.detail,
  };
}

function capConfidence(
  aiConfidence: 'high' | 'medium' | 'low',
  verification: FreeformVerification,
): 'high' | 'medium' | 'low' {
  if (verification.conclusion === 'conflict' || verification.conclusion === 'insufficient') return 'low';
  if (verification.verifiedCount === 0) return 'low';
  return aiConfidence === 'high' ? 'medium' : aiConfidence;
}

/**
 * 把模型结论与学生原文、题干条件逐条对照，生成可展示的三态核验结果。
 * 任何冲突都以本地复算为准；无法复算的结论只标“AI 推断，未核验”。
 */
export function buildAiDiagnosis(input: FreeformInput, ai: FreeformAiResult): FreeformAiDiagnosis {
  const claims = new Map<string, VerifiedClaim>();
  const steps = input.steps.map((step) => step.trim()).filter(Boolean);
  const resolved = resolveStudentStep(steps, ai);

  if (resolved.conflict) {
    addClaim(claims, {
      kind: 'index',
      expression: ai.stepQuote || (ai.firstWrongStepIndex !== null ? `第 ${ai.firstWrongStepIndex} 步` : '错误步骤'),
      claimed: ai.firstWrongStepIndex !== null ? String(ai.firstWrongStepIndex) : '未给出',
      recomputed: resolved.index !== null ? String(resolved.index + 1) : null,
      status: 'conflict',
      detail: resolved.conflict,
    });
  } else if (resolved.index !== null) {
    addClaim(claims, {
      kind: 'index',
      expression: resolved.quote,
      claimed: ai.firstWrongStepIndex !== null ? String(ai.firstWrongStepIndex) : '未给出',
      recomputed: String(resolved.index + 1),
      status: 'verified',
      detail: resolved.note ?? 'AI 引用的原句与步骤序号一致。',
    });
  }

  if (resolved.index !== null && resolved.quote) {
    const stepCheck = checkStudentStep(input.question, resolved.quote);
    const aiClaimsWrongStep = ai.firstWrongStepIndex !== null;

    if (aiClaimsWrongStep && stepCheck.status === 'consistent') {
      addClaim(claims, {
        kind: 'student-step',
        expression: resolved.quote,
        claimed: 'AI 指出的错误步骤',
        recomputed: stepCheck.expectedValue,
        status: 'conflict',
        detail: `AI 说这一步是第一个错误步骤，但本地复算表明这一步成立：${stepCheck.detail}`,
      });
    } else if (stepCheck.status === 'inconsistent') {
      addClaim(claims, {
        kind: 'student-step',
        expression: resolved.quote,
        claimed: 'AI 指出的错误步骤',
        recomputed: stepCheck.expectedValue,
        status: 'verified',
        detail: stepCheck.detail,
      });
    } else if (stepCheck.status === 'consistent') {
      addClaim(claims, {
        kind: 'student-step',
        expression: resolved.quote,
        claimed: 'AI 引用的步骤',
        recomputed: stepCheck.expectedValue,
        status: 'verified',
        detail: stepCheck.detail,
      });
    } else {
      addClaim(claims, {
        kind: 'student-step',
        expression: resolved.quote,
        claimed: 'AI 指出的错误步骤',
        recomputed: null,
        status: 'unverified',
        detail: stepCheck.detail,
      });
    }

    if (ai.firstWrongStepIndex === null) {
      addClaim(claims, {
        kind: 'index',
        expression: resolved.quote,
        claimed: 'AI 未给错误步骤',
        recomputed: `第 ${resolved.index + 1} 步`,
        status: 'conflict',
        detail: 'AI 没有给出错误步骤序号，却引用了学生原句；需要复核它是否认为这一步有误。',
      });
    }
  }

  const aiAnswerCheck = checkQuestionAnswer(input.question, steps, ai.correctAnswer);
  addClaim(
    claims,
    claimFromCheck('final-answer', 'AI 正确答案', ai.correctAnswer, aiAnswerCheck),
  );
  const adoptedAnswer = aiAnswerCheck.status === 'conflict' && aiAnswerCheck.expected
    ? aiAnswerCheck.expected
    : ai.correctAnswer;

  const studentAnswerCheck = input.finalAnswer.trim()
    ? checkQuestionAnswer(input.question, steps, input.finalAnswer)
    : null;
  if (studentAnswerCheck) {
    addClaim(claims, {
      kind: 'final-answer',
      expression: '学生最终答案',
      claimed: input.finalAnswer,
      recomputed: studentAnswerCheck.expected,
      status: studentAnswerCheck.status === 'unverified' ? 'unverified' : 'verified',
      detail: studentAnswerCheck.status === 'conflict'
        ? `学生最终答案未通过本地复算：${studentAnswerCheck.detail}`
        : studentAnswerCheck.detail,
    });
    if (ai.firstWrongStepIndex === null && studentAnswerCheck.status === 'conflict') {
      addClaim(claims, {
        kind: 'final-answer',
        expression: 'AI 判定学生答案正确',
        claimed: '正确',
        recomputed: studentAnswerCheck.expected,
        status: 'conflict',
        detail: `AI 认为最终答案正确，但本地复算判定不成立：${studentAnswerCheck.detail}`,
      });
    }
  }

  let lastStandardValue: number | null = null;
  const standardSteps = ai.standardSteps.slice(0, 6);
  for (let stepIndex = 0; stepIndex < standardSteps.length; stepIndex += 1) {
    const step = standardSteps[stepIndex];
    const stepCheck = checkStudentStep(input.question, step);
    if (stepCheck.status === 'inconsistent') {
      addClaim(claims, {
        kind: 'standard-step',
        expression: step,
        claimed: step,
        recomputed: stepCheck.expectedValue,
        status: 'conflict',
        detail: `AI 给出的标准解法这一步不成立：${stepCheck.detail}`,
      });
    } else if (stepCheck.status === 'consistent') {
      // 只有标准解法的最后一步才代表最终结果；中间函数值不能拿来和答案比较。
      if (stepIndex === standardSteps.length - 1 && stepCheck.expectedValue !== null) {
        lastStandardValue = parseNumericAnswer(stepCheck.expectedValue);
      }
      addClaim(claims, {
        kind: 'standard-step',
        expression: step,
        claimed: stepCheck.expectedValue ?? '成立',
        recomputed: stepCheck.expectedValue,
        status: 'verified',
        detail: stepCheck.detail,
      });
    } else {
      addClaim(claims, {
        kind: 'standard-step',
        expression: step,
        claimed: step,
        recomputed: null,
        status: 'unverified',
        detail: '标准解法这一步含自然语言、方程变形或规则未覆盖的运算，无法独立复算。',
      });
    }
  }
  const adoptedNumber = parseNumericAnswer(adoptedAnswer);
  if (lastStandardValue !== null && adoptedNumber !== null && !isClose(lastStandardValue, adoptedNumber)) {
    addClaim(claims, {
      kind: 'final-answer',
      expression: '标准解法最后一步',
      claimed: adoptedAnswer,
      recomputed: formatNumber(lastStandardValue),
      status: 'conflict',
      detail: `标准解法最后一步复算得到 ${formatNumber(lastStandardValue)}，与答案 ${adoptedAnswer} 不一致。`,
    });
  }

  for (const claim of ai.claims) {
    if (claim.kind === 'quote') {
      const found = findQuoteIndex(steps, claim.expression);
      addClaim(claims, {
        kind: 'quote',
        expression: claim.expression,
        claimed: claim.claimed,
        recomputed: found !== null ? `第 ${found + 1} 步` : null,
        status: found !== null ? 'verified' : 'conflict',
        detail: found !== null
          ? `引用的原句在学生第 ${found + 1} 步中找到。`
          : '引用的原句不在学生步骤中。',
      });
      continue;
    }
    const check = checkAiClaim(input.question, claim as AiClaim);
    addClaim(
      claims,
      claimFromCheck(claim.kind, claim.expression, claim.claimed, check),
    );
  }

  const claimList = [...claims.values()];
  // 引用/序号属于结构校验，不能把它们算成“数学结论已核验”。
  const mathematicalClaims = claimList.filter(
    (claim) => claim.kind !== 'index' && claim.kind !== 'quote',
  );
  const conflictCount = claimList.filter((claim) => claim.status === 'conflict').length;
  const verifiedCount = mathematicalClaims.filter((claim) => claim.status === 'verified').length;
  const unverifiedCount = mathematicalClaims.filter((claim) => claim.status === 'unverified').length;

  let conclusion: FreeformVerification['conclusion'];
  if (ai.insufficientEvidence) conclusion = 'insufficient';
  else if (conflictCount > 0) conclusion = 'conflict';
  else if (verifiedCount > 0 && unverifiedCount > 0) conclusion = 'partial';
  else if (verifiedCount > 0) conclusion = 'consistent';
  else conclusion = 'unverifiable';

  const verification: FreeformVerification = {
    claims: claimList,
    verifiedCount,
    conflictCount,
    unverifiedCount,
    conclusion,
  };

  let status: FreeformAiDiagnosis['status'];
  if (ai.insufficientEvidence || conclusion === 'conflict') {
    status = 'unknown';
  } else if (ai.firstWrongStepIndex === null && !resolved.conflict) {
    status = studentAnswerCheck?.status === 'verified' ? 'correct' : 'unknown';
  } else if (studentAnswerCheck?.status === 'verified') {
    status = 'process-error';
  } else {
    status = 'diagnosed';
  }

  const knowledgeNodeId = ai.knowledgeNodeId && validNodeIds.has(ai.knowledgeNodeId)
    ? ai.knowledgeNodeId
    : null;

  let reason = ai.reason;
  if (conclusion === 'conflict') {
    reason = `AI 结论与本地复算冲突，已按复算结果更正。AI 原结论：${ai.reason}`;
  } else if (conclusion === 'insufficient') {
    reason = `证据不足：${ai.uncertainty || ai.reason}`;
  } else if (conclusion === 'unverifiable') {
    reason = `${ai.reason}（AI 推断，未核验）`;
  } else if (conclusion === 'partial') {
    reason = `${ai.reason}（部分结论已核验，其余为 AI 推断）`;
  }

  return {
    source: 'ai',
    status,
    correctAnswer: adoptedAnswer,
    aiCorrectAnswer: ai.correctAnswer,
    standardSteps: ai.standardSteps,
    firstWrongStepIndex: resolved.index,
    stepQuote: resolved.quote,
    reason,
    aiReason: ai.reason,
    knowledgePoint: ai.knowledgePoint,
    knowledgeNodeId,
    variant: ai.variant,
    confidence: capConfidence(ai.confidence, verification),
    aiConfidence: ai.confidence,
    verification,
    uncertainty: ai.uncertainty,
  };
}
