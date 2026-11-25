import { knowledgeNodes } from '../data/knowledge';
import { buildLearningPath } from '../engine/diagnose';
import type { AttemptDiagnosis, Question } from '../types';

const ENDPOINT = '/api/diagnose';
const TIMEOUT_MS = 8000;
const validNodeIds = new Set(knowledgeNodes.map((node) => node.id));

interface AiResult {
  reason: string;
  evidence: string;
  steps: string[];
  weakNodeIds: string[];
  confidence: 'high' | 'medium' | 'low';
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function toDiagnosis(value: unknown): AiResult | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const reason = text(record.reason, 400);
  const evidence = text(record.evidence, 400);
  if (!reason || !evidence) return null;

  const steps = Array.isArray(record.steps)
    ? record.steps.map((step) => text(step, 200)).filter(Boolean).slice(0, 3)
    : [];
  const weakNodeIds = Array.isArray(record.weakNodeIds)
    ? [...new Set(record.weakNodeIds.filter((id): id is string => typeof id === 'string' && validNodeIds.has(id)))].slice(0, 3)
    : [];

  return {
    reason,
    evidence,
    steps,
    weakNodeIds,
    // AI 推断只能作为补充证据，置信度不高于 medium。
    confidence: record.confidence === 'low' ? 'low' : 'medium',
  };
}

/**
 * 只在规则诊断为 unknown 时调用：未配置、断网、超时或返回不合格都静默返回 null，页面保留原结论。
 */
export async function fetchAiDiagnosis(
  question: Question,
  finalAnswer: string,
  steps: string[],
): Promise<AttemptDiagnosis | null> {
  if (typeof fetch !== 'function') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: question.id,
        stem: question.stem,
        correctAnswer: question.correctAnswer,
        finalAnswer,
        steps: steps.filter((step) => step.trim()),
        nodes: knowledgeNodes.map((node) => ({ id: node.id, label: node.label })),
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const result = toDiagnosis(
      payload && typeof payload === 'object'
        ? (payload as { result?: unknown }).result
        : null,
    );
    if (!result) return null;

    return {
      isCorrect: false,
      status: 'unknown',
      source: 'ai',
      reason: result.reason,
      evidence: result.evidence,
      weakNodeIds: result.weakNodeIds,
      learningPathIds: buildLearningPath(result.weakNodeIds),
      steps: result.steps.length > 0 ? result.steps : ['核对题干条件与符号，再逐步复算一次。'],
      confidence: result.confidence,
      firstWrongStepIndex: null,
      focusStepIndex: null,
      stepQuote: null,
      matchedPatternId: null,
      correctedStep: null,
      alternativePatternIds: [],
      probe: null,
      processNote: null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
