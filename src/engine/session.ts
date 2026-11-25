import { knowledgeNodes } from '../data/knowledge';
import type {
  DiagnosisRecord,
  DiagnosisSummary,
  PracticeAttempt,
  SessionReport,
} from '../types';
import { buildLearningPath } from './diagnose';

const validNodeIds = new Set(knowledgeNodes.map((node) => node.id));
const nodeLabels = new Map(knowledgeNodes.map((node) => [node.id, node.label]));

function pointKey(point: string): string {
  return point.trim().toLowerCase().replace(/[\s，,。；;：:、]/g, '');
}

/** 汇总任意题（含内置题与 AI 任意题）的诊断，合并去重薄弱点。 */
export function summarizeDiagnoses(records: DiagnosisRecord[]): DiagnosisSummary {
  const counted = records.filter(
    (record) => record.status === 'diagnosed' || record.status === 'process-error',
  );
  const weakNodeIds: string[] = [];
  const weakLabels = new Set<string>();

  for (const record of counted) {
    const ids = [
      ...record.weakNodeIds,
      ...(record.knowledgeNodeId ? [record.knowledgeNodeId] : []),
    ];
    for (const id of ids) {
      if (!validNodeIds.has(id) || weakNodeIds.includes(id)) continue;
      weakNodeIds.push(id);
      weakLabels.add(nodeLabels.get(id) ?? id);
    }
  }

  const weakPoints = new Map<string, string>();
  for (const record of counted) {
    const point = record.knowledgePoint.trim();
    if (!point || weakLabels.has(point)) continue;
    const key = pointKey(point);
    if (key && !weakPoints.has(key)) weakPoints.set(key, point);
  }

  const countStatus = (status: DiagnosisRecord['status']) =>
    records.filter((record) => record.status === status).length;

  return {
    total: records.length,
    correct: countStatus('correct'),
    diagnosed: countStatus('diagnosed'),
    processError: countStatus('process-error'),
    unknown: countStatus('unknown'),
    weakNodeIds,
    weakKnowledgePoints: [...weakPoints.values()],
    learningPathIds: buildLearningPath(weakNodeIds),
  };
}

export function summarizeSession(attempts: PracticeAttempt[]): SessionReport {
  const answeredAttempts = attempts.filter((attempt) => attempt.kind === 'answered');
  const countStatus = (status: string) => answeredAttempts.filter(
    (attempt) => attempt.diagnosis?.status === status,
  ).length;
  const correct = countStatus('correct');
  const weakNodeIds = [...new Set(
    answeredAttempts.flatMap((attempt) => attempt.diagnosis?.weakNodeIds ?? []),
  )];

  return {
    total: attempts.length,
    answered: answeredAttempts.length,
    correct,
    diagnosed: countStatus('diagnosed'),
    processError: countStatus('process-error'),
    unknown: countStatus('unknown'),
    skipped: attempts.filter((attempt) => attempt.kind === 'skipped').length,
    accuracy: answeredAttempts.length === 0 ? 0 : (correct / answeredAttempts.length) * 100,
    averageSeconds: answeredAttempts.length === 0
      ? 0
      : answeredAttempts.reduce((total, attempt) => total + attempt.elapsedSeconds, 0) / answeredAttempts.length,
    weakNodeIds,
    learningPathIds: buildLearningPath(weakNodeIds),
    attempts: [...attempts],
  };
}
