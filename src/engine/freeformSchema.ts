import type { AiClaim, ClaimKind, FreeformAiResult, OcrResult } from '../types';

const claimKinds = new Set<ClaimKind>(['arithmetic', 'equation', 'set', 'answer', 'quote']);
const confidences = new Set(['high', 'medium', 'low']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return allowEmpty || trimmed ? trimmed : null;
}

function stringList(value: unknown, maxItems: number, maxLength: number, allowEmpty = false): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .slice(0, maxItems)
    .map((item) => text(item, maxLength, allowEmpty))
    .filter((item): item is string => item !== null);
  return allowEmpty || items.length > 0 ? items : null;
}

function parseClaims(value: unknown): AiClaim[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const claims: AiClaim[] = [];
  for (const item of value.slice(0, 8)) {
    const entry = record(item);
    if (!entry) return null;
    const kind = entry.kind;
    if (typeof kind !== 'string' || !claimKinds.has(kind as ClaimKind)) return null;
    const expression = text(entry.expression, 300);
    const claimed = text(entry.claimed, 200, true);
    if (expression === null || claimed === null) return null;
    claims.push({ kind: kind as ClaimKind, expression, claimed });
  }
  return claims;
}

function parseVariant(value: unknown): { stem: string; answer: string } | null {
  const entry = record(value);
  if (!entry) return null;
  const stem = text(entry.stem, 300);
  const answer = text(entry.answer, 200);
  if (stem === null || answer === null) return null;
  return { stem, answer };
}

function parseIndex(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/** 严格解析模型返回；任何结构性不合格都返回 null，由调用方降级为“证据不足”。 */
export function parseFreeformAiResult(
  value: unknown,
  allowedNodeIds: Set<string>,
): FreeformAiResult | null {
  const entry = record(value);
  if (!entry) return null;

  const confidence = typeof entry.confidence === 'string' && confidences.has(entry.confidence)
    ? entry.confidence as 'high' | 'medium' | 'low'
    : null;
  if (!confidence) return null;

  const insufficientEvidence = entry.insufficientEvidence === true;
  const uncertainty = text(entry.uncertainty, 400, true);
  if (uncertainty === null) return null;

  if (insufficientEvidence) {
    return {
      correctAnswer: text(entry.correctAnswer, 200, true) ?? '',
      standardSteps: stringList(entry.standardSteps, 8, 300, true) ?? [],
      firstWrongStepIndex: null,
      stepQuote: text(entry.stepQuote, 300, true) ?? '',
      reason: text(entry.reason, 400, true) ?? '证据不足，未生成确定结论',
      knowledgePoint: text(entry.knowledgePoint, 80, true) ?? '',
      knowledgeNodeId: null,
      variant: parseVariant(entry.variant) ?? { stem: '', answer: '' },
      confidence,
      claims: parseClaims(entry.claims) ?? [],
      insufficientEvidence: true,
      uncertainty: uncertainty || '题目或步骤信息不足，无法可靠定位错因。',
    };
  }

  const correctAnswer = text(entry.correctAnswer, 200);
  const standardSteps = stringList(entry.standardSteps, 8, 300);
  const firstWrongStepIndex = parseIndex(entry.firstWrongStepIndex);
  const stepQuote = text(entry.stepQuote, 300, true);
  const reason = text(entry.reason, 400);
  const knowledgePoint = text(entry.knowledgePoint, 80);
  const variant = parseVariant(entry.variant);
  const claims = parseClaims(entry.claims);
  if (
    correctAnswer === null
    || standardSteps === null
    || firstWrongStepIndex === undefined
    || stepQuote === null
    || reason === null
    || knowledgePoint === null
    || variant === null
    || claims === null
  ) {
    return null;
  }
  if (firstWrongStepIndex !== null && !stepQuote) return null;

  const nodeId = typeof entry.knowledgeNodeId === 'string' && allowedNodeIds.has(entry.knowledgeNodeId)
    ? entry.knowledgeNodeId
    : null;

  return {
    correctAnswer,
    standardSteps,
    firstWrongStepIndex,
    stepQuote,
    reason,
    knowledgePoint,
    knowledgeNodeId: nodeId,
    variant,
    confidence,
    claims,
    insufficientEvidence: false,
    uncertainty,
  };
}

/** 图片识别结果的结构校验。 */
export function parseOcrResult(value: unknown): OcrResult | null {
  const entry = record(value);
  if (!entry) return null;
  const question = text(entry.question, 1200, true);
  const finalAnswer = text(entry.finalAnswer, 300, true);
  const steps = stringList(entry.steps, 20, 300, true);
  const uncertainFields = stringList(entry.uncertainFields, 3, 20, true);
  const confidence = typeof entry.confidence === 'string' && confidences.has(entry.confidence)
    ? entry.confidence as 'high' | 'medium' | 'low'
    : null;
  if (question === null || finalAnswer === null || steps === null || uncertainFields === null || !confidence) {
    return null;
  }
  if (!question && !finalAnswer && steps.length === 0) return null;
  return {
    question,
    finalAnswer,
    steps,
    uncertainFields: uncertainFields.filter((field) => ['question', 'finalAnswer', 'steps'].includes(field)),
    confidence,
  };
}
