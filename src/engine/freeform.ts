import { questions } from '../data/knowledge';
import { questionRules } from '../data/practiceRules';
import type { FreeformRuleResult, Question } from '../types';
import { diagnoseAttempt } from './attempt';
import { normalizeAnswer } from './normalize';

/**
 * 只做保守的格式归一化：全半角、大小写、空白、全半角逗号、集合元素顺序和句末句号。
 * 运算符、数学括号、集合元素分隔符和 ! 都保留，它们会改变题目的数学含义。
 */
function normalizeQuestionText(text: string): string {
  return normalizeAnswer(text)
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[,，]/g, ',')
    .replace(/[。.]+$/, '');
}

/**
 * 仅当完整题干归一化后与题库题干完全相等时才复用内置题。
 * 不做子串或包含匹配：任何追加的运算、条件或新问法都会改变题目，必须走自由题流程。
 */
export function matchBuiltinQuestion(text: string): Question | null {
  const normalized = normalizeQuestionText(text);
  if (!normalized) return null;

  for (const question of questions) {
    if (normalizeQuestionText(question.stem) === normalized) return question;
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

/** 规则优先：命中内置题时直接返回规则结果，任何 AI 凭证都不会被使用。 */
export type FreeformDiagnosisPlan =
  | { kind: 'rules'; result: FreeformRuleResult }
  | { kind: 'ai' };

export function planFreeformDiagnosis(
  question: string,
  finalAnswer: string,
  steps: string[],
): FreeformDiagnosisPlan {
  const builtin = matchBuiltinQuestion(question);
  return builtin
    ? { kind: 'rules', result: buildRuleResult(builtin, finalAnswer, steps) }
    : { kind: 'ai' };
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
