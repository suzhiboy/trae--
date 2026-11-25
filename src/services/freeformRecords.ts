import type { DiagnosisRecord, FreeformResult, FreeformVerification } from '../types';
import { normalizeAnswer } from '../engine/normalize';

export const FREEFORM_RECORDS_KEY = 'kd:freeform:v1:records';
export const FREEFORM_RECORDS_LIMIT = 30;

const statuses = new Set(['correct', 'diagnosed', 'process-error', 'unknown']);
const conclusions = new Set<FreeformVerification['conclusion']>([
  'consistent',
  'partial',
  'conflict',
  'unverifiable',
  'insufficient',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
}

function sanitizeRecord(value: unknown): DiagnosisRecord | null {
  if (!isRecord(value)) return null;
  const id = optionalText(value.id);
  const question = optionalText(value.question);
  const status = typeof value.status === 'string' && statuses.has(value.status)
    ? value.status as DiagnosisRecord['status']
    : null;
  const source = value.source === 'rules' || value.source === 'ai' ? value.source : null;
  if (!id || !question || !status || !source) return null;
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return null;

  return {
    id,
    createdAt: value.createdAt,
    source,
    question,
    finalAnswer: text(value.finalAnswer),
    questionId: optionalText(value.questionId),
    patternId: optionalText(value.patternId),
    status,
    reason: text(value.reason),
    knowledgePoint: text(value.knowledgePoint),
    knowledgeNodeId: optionalText(value.knowledgeNodeId),
    weakNodeIds: stringList(value.weakNodeIds),
    verification: typeof value.verification === 'string' && conclusions.has(value.verification as FreeformVerification['conclusion'])
      ? value.verification as FreeformVerification['conclusion']
      : null,
  };
}

function createRecordId(): string {
  try {
    return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** 同一道题只保留最近一次诊断，避免重复提交把统计刷高。 */
export function addFreeformRecord(
  records: DiagnosisRecord[],
  record: DiagnosisRecord,
): DiagnosisRecord[] {
  const key = normalizeAnswer(record.question);
  return [record, ...records.filter((item) => normalizeAnswer(item.question) !== key)]
    .slice(0, FREEFORM_RECORDS_LIMIT);
}

export function recordFromResult(
  submission: { question: string; finalAnswer: string },
  result: FreeformResult,
): DiagnosisRecord {
  const createdAt = Date.now();
  if (result.source === 'rules') {
    const diagnosis = result.diagnosis;
    return {
      id: createRecordId(),
      createdAt,
      source: 'rules',
      question: result.question.stem,
      finalAnswer: submission.finalAnswer,
      questionId: result.question.id,
      patternId: diagnosis.matchedPatternId,
      status: diagnosis.status,
      reason: diagnosis.reason,
      knowledgePoint: result.question.module,
      knowledgeNodeId: diagnosis.weakNodeIds[0] ?? null,
      weakNodeIds: [...diagnosis.weakNodeIds],
      verification: null,
    };
  }

  return {
    id: createRecordId(),
    createdAt,
    source: 'ai',
    question: submission.question,
    finalAnswer: submission.finalAnswer,
    questionId: null,
    patternId: null,
    status: result.status,
    reason: result.reason,
    knowledgePoint: result.knowledgePoint,
    knowledgeNodeId: result.knowledgeNodeId,
    weakNodeIds: result.knowledgeNodeId ? [result.knowledgeNodeId] : [],
    verification: result.verification.conclusion,
  };
}

export function loadFreeformRecords(): DiagnosisRecord[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(FREEFORM_RECORDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, FREEFORM_RECORDS_LIMIT)
      .map(sanitizeRecord)
      .filter((record): record is DiagnosisRecord => record !== null);
  } catch {
    return [];
  }
}

export function saveFreeformRecords(records: DiagnosisRecord[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FREEFORM_RECORDS_KEY, JSON.stringify(records.slice(0, FREEFORM_RECORDS_LIMIT)));
  } catch {
    // 存储不可用或已满时，记录仍保留在当前页面内。
  }
}
