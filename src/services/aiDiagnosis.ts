import { knowledgeNodes } from '../data/knowledge';
import { buildLearningPath } from '../engine/diagnose';
import type { AttemptDiagnosis, AiCredential, Question } from '../types';
import { credentialPayload, recordAiFailure, recordAiSuccess } from './aiCredential';

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
 * 自定义 Key 无效时只更新设置状态，不切换站点账户。
 */
export async function fetchAiDiagnosis(
  question: Question,
  finalAnswer: string,
  steps: string[],
  credential: AiCredential | null,
): Promise<AttemptDiagnosis | null> {
  if (!credential || typeof fetch !== 'function') return null;

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
        ...credentialPayload(credential),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let code = 'upstream';
      try {
        const payload: unknown = await response.json();
        if (payload && typeof payload === 'object') {
          const value = (payload as { error?: unknown }).error;
          if (typeof value === 'string') code = value;
        }
      } catch {
        // 错误响应不是 JSON 时按上游失败处理。
      }
      recordAiFailure(
        credential,
        code,
        code === 'custom-key-invalid'
          ? '自定义 API Key 无效或没有权限。'
          : 'AI 请求未完成。',
      );
      return null;
    }

    const payload: unknown = await response.json();
    const result = toDiagnosis(
      payload && typeof payload === 'object'
        ? (payload as { result?: unknown }).result
        : null,
    );
    if (!result) {
      recordAiFailure(credential, 'invalid-schema', '模型返回结构不完整。');
      return null;
    }

    recordAiSuccess(credential);
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
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    recordAiFailure(
      credential,
      name === 'AbortError' ? 'timeout' : 'network',
      name === 'AbortError' ? '模型服务超时。' : '网络中断，请求没有发送成功。',
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
