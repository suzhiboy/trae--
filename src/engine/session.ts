import type { PracticeAttempt, SessionReport } from '../types';
import { buildLearningPath } from './diagnose';

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
