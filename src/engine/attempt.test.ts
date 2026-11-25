import { describe, expect, it } from 'vitest';
import { questions } from '../data/knowledge';
import { questionRules } from '../data/practiceRules';
import { diagnoseAttempt } from './attempt';
import { diagnose } from './diagnose';
import { normalizeAnswer } from './normalize';

const patternCases = questions.flatMap((question) => {
  const rule = questionRules[question.id];
  return rule.errorPatterns.map((pattern) => {
    const firstAnswer = pattern.answers[0];
    return {
      questionId: question.id,
      correctAnswer: question.correctAnswer,
      pattern,
      answerIsUnique: rule.errorPatterns.filter((item) => item.answers.includes(firstAnswer)).length === 1,
    };
  });
});

describe('diagnoseAttempt 的 25 个错误模式', () => {
  it('包含每题两个以上模式，函数题新增“最后加法”模式', () => {
    expect(patternCases).toHaveLength(25);
    expect(questionRules['function-negative-input'].errorPatterns).toHaveLength(3);
  });

  it.each(patternCases)('$questionId / $pattern.id 可通过最终答案命中或列为待确认原因', ({
    questionId,
    pattern,
    answerIsUnique,
  }) => {
    const answer = pattern.answers[0];
    const result = diagnoseAttempt({
      questionId,
      finalAnswer: answer,
      steps: [],
    });

    if (answerIsUnique) {
      expect(result.status).toBe('diagnosed');
      expect(result.isCorrect).toBe(false);
      expect(result.confidence).toBe('medium');
      expect(result.firstWrongStepIndex).toBeNull();
      expect(result.matchedPatternId).toBe(pattern.id);
      expect(result.correctedStep).toBe(pattern.correction);
      expect(result.weakNodeIds).toEqual([pattern.weakNodeId]);
      expect(result.evidence).toContain('仅凭最终答案推断，需补充过程确认');
    } else {
      expect(result.status).toBe('unknown');
      expect(result.firstWrongStepIndex).toBeNull();
      expect(result.focusStepIndex).toBeNull();
      expect(result.alternativePatternIds).toContain(pattern.id);
      expect(result.weakNodeIds).toEqual([]);
    }

    const legacyResult = diagnose(questionId, answer);
    expect(legacyResult.confidence).toBe('medium');
    if (answerIsUnique) expect(legacyResult.reason).toBe(pattern.reason);
  });

  it.each(patternCases)('$questionId / $pattern.id 可通过步骤命中', ({ questionId, pattern }) => {
    const result = diagnoseAttempt({
      questionId,
      finalAnswer: pattern.answers[0],
      steps: ['先记录已知条件', pattern.stepSignatures[0]],
    });

    expect(result.status).toBe('diagnosed');
    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBe('high');
    expect(result.matchedPatternId).toBe(pattern.id);
    expect(result.correctedStep).toBe(pattern.correction);
    if (pattern.terminalOnly) {
      expect(result.firstWrongStepIndex).toBeNull();
      expect(result.focusStepIndex).toBe(1);
    } else {
      expect(result.firstWrongStepIndex).toBe(1);
      expect(result.focusStepIndex).toBe(1);
      expect(result.evidence).toContain('第 2 步');
    }
  });

  it.each(patternCases)('$questionId / $pattern.id 正确答案配错误步骤标记过程错误', ({
    questionId,
    correctAnswer,
    pattern,
  }) => {
    const result = diagnoseAttempt({
      questionId,
      finalAnswer: correctAnswer,
      steps: [pattern.stepSignatures[0]],
    });

    if (pattern.terminalOnly) {
      expect(result.status).toBe('correct');
      expect(result.firstWrongStepIndex).toBeNull();
      return;
    }

    expect(result.status).toBe('process-error');
    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBe('high');
    expect(result.firstWrongStepIndex).toBe(0);
    expect(result.matchedPatternId).toBe(pattern.id);
    expect(result.weakNodeIds).toEqual([pattern.weakNodeId]);
  });

  it('答案正确时，终态型中间步骤不判错，仍选择真正不成立的步骤', () => {
    const patterns = questionRules['set-union-basic'].errorPatterns;
    const terminalPattern = patterns.find((item) => item.terminalOnly);
    const errorPattern = patterns.find((item) => !item.terminalOnly);
    expect(terminalPattern).toBeTruthy();
    expect(errorPattern).toBeTruthy();

    const result = diagnoseAttempt({
      questionId: 'set-union-basic',
      finalAnswer: '{1,2,3,4}',
      steps: [terminalPattern!.stepSignatures[0], errorPattern!.stepSignatures[0]],
    });

    expect(result.status).toBe('process-error');
    expect(result.firstWrongStepIndex).toBe(1);
    expect(result.matchedPatternId).toBe(errorPattern!.id);
  });
});

describe('diagnoseAttempt 的正确、未知与归一化边界', () => {
  it('正确答案且没有错误步骤时为 correct', () => {
    const result = diagnoseAttempt({
      questionId: 'radian-conversion',
      finalAnswer: '\\frac{5\\pi}{6}',
      steps: ['150°=150×π/180'],
    });

    expect(result.status).toBe('correct');
    expect(result.isCorrect).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.firstWrongStepIndex).toBeNull();
    expect(result.matchedPatternId).toBeNull();
    expect(result.correctedStep).toBeNull();
    expect(result.weakNodeIds).toEqual([]);
    expect(result.learningPathIds).toEqual([]);
  });

  it.each(['陌生错答', '', '   ', '。'])('陌生或空答案 %j 返回 unknown 且不编造知识点', (answer) => {
    const result = diagnoseAttempt({
      questionId: 'function-negative-input',
      finalAnswer: answer,
      steps: [],
    });

    expect(result.status).toBe('unknown');
    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.firstWrongStepIndex).toBeNull();
    expect(result.matchedPatternId).toBeNull();
    expect(result.correctedStep).toBeNull();
    expect(result.weakNodeIds).toEqual([]);
    expect(result.learningPathIds).toEqual([]);
  });

  it('未知题目返回 unknown 且不编造学习路径', () => {
    const result = diagnoseAttempt({ questionId: 'missing', finalAnswer: '2', steps: [] });
    expect(result.status).toBe('unknown');
    expect(result.weakNodeIds).toEqual([]);
    expect(result.learningPathIds).toEqual([]);
  });

  it('集合顺序、常见 π 和根号写法使用同一归一化函数', () => {
    expect(normalizeAnswer('{4, 1, 3, 2}')).toBe(normalizeAnswer('{1,2,3,4}'));
    expect(normalizeAnswer('\\frac{5\\pi}{6}')).toBe('5π/6');
    expect(normalizeAnswer('\\sqrt{3}/2')).toBe(normalizeAnswer('√3/2'));
    expect(diagnose('set-union-basic', 'A∪B={4,3,2,1}').isCorrect).toBe(true);
    expect(diagnose('radian-conversion', '答案：\\frac{5\\pi}{6}').isCorrect).toBe(true);
    expect(diagnose('same-base-powers', 'Ａ＾７').isCorrect).toBe(true);
  });
});
