import { questions } from '../data/knowledge';
import { questionRules } from '../data/practiceRules';
import type { FreeformRuleResult, Question } from '../types';
import { diagnoseAttempt } from './attempt';
import { normalizeAnswer } from './normalize';

function normalizeQuestionText(text: string): string {
  return normalizeAnswer(text)
    .replace(/[\s，,。；;：:、？?！!"'“”‘’（）()【】[\]]/g, '');
}

/** 只做保守匹配：完全一致，或长题干互相包含；避免把“求 f(-1)”误认成某道题。 */
export function matchBuiltinQuestion(text: string): Question | null {
  const normalized = normalizeQuestionText(text);
  if (!normalized) return null;

  for (const question of questions) {
    if (normalizeQuestionText(question.stem) === normalized) return question;
  }

  for (const question of questions) {
    const stem = normalizeQuestionText(question.stem);
    if (stem.length < 10 || normalized.length < 6) continue;
    if (normalized.includes(stem)) return question;
    if (stem.includes(normalized) && normalized.length / stem.length > 0.6) return question;
  }

  return null;
}

/** 命中内置题时，完整复用原有规则引擎，不经过模型。 */
export function buildRuleResult(
  question: Question,
  finalAnswer: string,
  steps: string[],
): FreeformRuleResult {
  return {
    source: 'rules',
    question,
    diagnosis: diagnoseAttempt({ questionId: question.id, finalAnswer, steps }),
  };
}

/** 规则结果对应的变式与答案；没有匹配到具体错因时为 null。 */
export function ruleVariant(result: FreeformRuleResult): { stem: string; answer: string } | null {
  const patternId = result.diagnosis.matchedPatternId;
  if (!patternId) return null;
  const pattern = questionRules[result.question.id]?.errorPatterns.find((item) => item.id === patternId);
  if (!pattern) return null;
  const answer = pattern.variant.options.find((option) => option.id === pattern.variant.correctOptionId);
  return answer ? { stem: pattern.variant.stem, answer: answer.text } : null;
}
