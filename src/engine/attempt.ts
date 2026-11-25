import { questionRules } from '../data/practiceRules';
import type {
  AttemptDiagnosis,
  DiagnoseAttemptInput,
  ErrorPattern,
  QuestionRule,
} from '../types';
import { buildLearningPath, diagnose } from './diagnose';
import { normalizeAnswer } from './normalize';
import { analyzeFunctionSteps } from './stepAnalysis';

interface PatternDiagnosisOptions {
  firstWrongStepIndex?: number | null;
  focusStepIndex?: number | null;
  stepQuote?: string | null;
  stepDetail?: string | null;
  processNote?: string | null;
}

function patternDiagnosis(
  pattern: ErrorPattern,
  status: 'diagnosed' | 'process-error',
  options: PatternDiagnosisOptions = {},
): AttemptDiagnosis {
  const {
    firstWrongStepIndex = null,
    focusStepIndex = null,
    stepQuote = null,
    stepDetail = null,
    processNote = null,
  } = options;
  const fromSteps = focusStepIndex !== null;
  const stepText = stepDetail ?? pattern.stepEvidence ?? pattern.evidence;
  const evidence = fromSteps
    ? firstWrongStepIndex !== null
      ? `第 ${firstWrongStepIndex + 1} 步与错误特征吻合。${stepText}`
      : stepText
    : `${pattern.evidence}仅凭最终答案推断，需补充过程确认。`;

  const weakNodeIds = [pattern.weakNodeId];
  return {
    isCorrect: false,
    status,
    source: 'rules',
    reason: status === 'process-error' ? `结果正确，但${pattern.reason}` : pattern.reason,
    evidence,
    weakNodeIds,
    learningPathIds: buildLearningPath(weakNodeIds),
    steps: [...pattern.steps],
    confidence: fromSteps ? 'high' : 'medium',
    firstWrongStepIndex,
    focusStepIndex,
    stepQuote,
    matchedPatternId: pattern.id,
    correctedStep: pattern.correction,
    alternativePatternIds: [],
    probe: pattern.probe ?? null,
    processNote,
  };
}

function correctDiagnosis(rule: QuestionRule): AttemptDiagnosis {
  return {
    isCorrect: true,
    status: 'correct',
    source: 'rules',
    reason: '答案正确，暂未发现本题相关薄弱点',
    evidence: rule.correctEvidence,
    weakNodeIds: [],
    learningPathIds: [],
    steps: [
      '保留本次解题过程，作为同类题的复习样例。',
      '改变题目中的一个数字再做一遍，检查方法是否稳定。',
      '继续用逆运算或代回验算，本题不需要生成薄弱知识点。',
    ],
    confidence: 'high',
    firstWrongStepIndex: null,
    focusStepIndex: null,
    stepQuote: null,
    matchedPatternId: null,
    correctedStep: null,
    alternativePatternIds: [],
    probe: null,
    processNote: null,
  };
}

function stepShowsCorrectResult(step: string, rule: QuestionRule): boolean {
  const normalized = normalizeAnswer(step);
  const rightHandSide = normalized.includes('=')
    ? normalized.slice(normalized.lastIndexOf('=') + 1)
    : normalized;
  return rule.correctAnswers.some((answer) => answer.length > 0 && rightHandSide === answer);
}

function answerPatternsFor(rule: QuestionRule, normalizedAnswer: string): ErrorPattern[] {
  return rule.errorPatterns.filter((pattern) => pattern.answers.includes(normalizedAnswer));
}

function ambiguousAnswerDiagnosis(
  rule: QuestionRule,
  finalAnswer: string,
  patterns: ErrorPattern[],
  quote: string | null,
  quoteIndex: number | null,
): AttemptDiagnosis {
  const probes = patterns.map((pattern) => pattern.probe).filter((probe): probe is string => !!probe);
  const probe = probes.join(' 或 ') || '你能补写一行代入式或等式吗？';
  return {
    isCorrect: false,
    status: 'unknown',
    source: 'rules',
    reason: '同一个错答至少对应两种可能原因',
    evidence: `只凭最终答案「${finalAnswer}」无法区分：${patterns.map((pattern) => pattern.reason).join('；')}。${quote && quoteIndex !== null ? `第 ${quoteIndex + 1} 步「${quote}」只能确认这个等式不成立，尚不能确定是哪一种原因。` : '请补充一行代入式或计算等式，再提交一次。'}`,
    weakNodeIds: [],
    learningPathIds: [],
    steps: [
      '先不把当前结论当作已确认的知识漏洞。',
      '补写一行代入式，再补一行“左边=右边”的计算等式。',
      `先回答：${probe}`,
    ],
    confidence: 'low',
    firstWrongStepIndex: quoteIndex,
    focusStepIndex: quoteIndex,
    stepQuote: quote,
    matchedPatternId: null,
    correctedStep: null,
    alternativePatternIds: patterns.map((pattern) => pattern.id),
    probe,
    processNote: null,
  };
}

function unknownStepDiagnosis(
  rule: QuestionRule,
  finalAnswer: string,
  quote: string,
  quoteIndex: number,
): AttemptDiagnosis {
  return {
    isCorrect: false,
    status: 'unknown',
    source: 'rules',
    reason: '这一步暂时无法可靠解释',
    evidence: `已保留你的原句「${quote}」，但当前规则无法仅凭这句话判断它错在哪。请补写一行可计算的等式，或回答下面的追问。`,
    weakNodeIds: [],
    learningPathIds: [],
    steps: [
      '不把这段自然语言改写成系统猜测的结论。',
      '把这一步写成“左边=右边”的算式，再提交一次。',
      '如果无法写成等式，先回答下面的追问，让老师进一步核对。',
    ],
    confidence: 'low',
    firstWrongStepIndex: null,
    focusStepIndex: null,
    stepQuote: quote,
    matchedPatternId: null,
    correctedStep: null,
    alternativePatternIds: [],
    probe: '你能把这一步改写成“左边=右边”的等式吗？',
    processNote: null,
  };
}

function processMismatchDiagnosis(quote: string, index: number): AttemptDiagnosis {
  return {
    isCorrect: false,
    status: 'process-error',
    source: 'rules',
    reason: '结果正确，但这一步与正确答案不一致',
    evidence: `第 ${index + 1} 步「${quote}」不成立；最终答案虽然正确，仍建议检查这一步。`,
    weakNodeIds: [],
    learningPathIds: [],
    steps: [
      '保留已经正确的最终结果。',
      '单独核对被标记的这一行，重新代入或计算一次。',
      '再写一行等式，让这一步也能被验证。',
    ],
    confidence: 'medium',
    firstWrongStepIndex: index,
    focusStepIndex: index,
    stepQuote: quote,
    matchedPatternId: null,
    correctedStep: null,
    alternativePatternIds: [],
    probe: null,
    processNote: '结果正确，但这一步需要检查。',
  };
}

export function diagnoseAttempt({
  questionId,
  finalAnswer,
  steps,
}: DiagnoseAttemptInput): AttemptDiagnosis {
  const rule = questionRules[questionId];
  const studentSteps = Array.isArray(steps)
    ? steps.map((step) => (typeof step === 'string' ? step : ''))
    : [];
  const normalizedFinalAnswer = normalizeAnswer(finalAnswer);
  const finalAnswerIsCorrect = rule?.correctAnswers.includes(normalizedFinalAnswer) ?? false;

  if (!rule) {
    const base = diagnose(questionId, finalAnswer);
    return {
      ...base,
      status: 'unknown',
      weakNodeIds: [],
      learningPathIds: [],
      firstWrongStepIndex: null,
      focusStepIndex: null,
      stepQuote: null,
      matchedPatternId: null,
      correctedStep: null,
      alternativePatternIds: [],
      probe: null,
      processNote: null,
    };
  }

  // 1. 代入求值题：逐行验证等式，区分代入符号错误与最后一步加法错误。
  if (rule.stepModel?.kind === 'function-substitution') {
    const analysis = analyzeFunctionSteps(studentSteps, rule.stepModel);

    if (analysis.finding) {
      const pattern = rule.errorPatterns.find((item) => item.id === analysis.finding?.patternId);
      if (pattern) {
        const status = finalAnswerIsCorrect ? 'process-error' : 'diagnosed';
        return patternDiagnosis(pattern, status, {
          firstWrongStepIndex: analysis.finding.index,
          focusStepIndex: analysis.finding.index,
          stepQuote: analysis.finding.quote,
          stepDetail: analysis.finding.detail,
          processNote: status === 'process-error' ? '结果正确，但这一步需要检查。' : null,
        });
      }
    }

    if (analysis.mismatch) {
      if (finalAnswerIsCorrect) {
        return processMismatchDiagnosis(analysis.mismatch.quote, analysis.mismatch.index);
      }
      const patterns = answerPatternsFor(rule, normalizedFinalAnswer);
      if (patterns.length > 0) {
        return ambiguousAnswerDiagnosis(
          rule,
          finalAnswer,
          patterns,
          analysis.mismatch.quote,
          analysis.mismatch.index,
        );
      }
    }

    if (
      !finalAnswerIsCorrect
      && analysis.sawSubstitution
      && analysis.reachedValue !== null
      && Math.abs(analysis.reachedValue - rule.stepModel.expectedValue) < 1e-9
    ) {
      return {
        isCorrect: false,
        status: 'unknown',
        source: 'rules',
        reason: '过程已算出正确值，但最终答案不一致',
        evidence: `步骤中的代入与计算得到 ${rule.stepModel.expectedValue}，最终答案却填了 ${finalAnswer.trim() || '空'}。可能只是抄写或最后一步转录有误，暂不据此判定知识点薄弱。`,
        weakNodeIds: [],
        learningPathIds: [],
        steps: [
          '核对最终答案是否与草稿最后一行一致。',
          '如果草稿正确，只改正最终答案后再提交一次。',
          '如果草稿还有未写出的步骤，补写最后一行等式。',
        ],
        confidence: 'medium',
        firstWrongStepIndex: null,
        focusStepIndex: null,
        stepQuote: null,
        matchedPatternId: null,
        correctedStep: null,
        alternativePatternIds: [],
        probe: '你最后写下的答案和草稿里的结果一致吗？',
        processNote: null,
      };
    }

    if (!finalAnswerIsCorrect && analysis.unrecognized) {
      return unknownStepDiagnosis(rule, finalAnswer, analysis.unrecognized.quote, analysis.unrecognized.index);
    }

    if (finalAnswerIsCorrect) return correctDiagnosis(rule);
  }

  // 2. 通用步骤签名：只把真正不成立的步骤标红；漏做最后一步只指向该行，不判错。
  for (let stepIndex = 0; stepIndex < studentSteps.length; stepIndex += 1) {
    const normalizedStep = normalizeAnswer(studentSteps[stepIndex]);
    if (!normalizedStep) continue;
    const matches = rule.errorPatterns.filter((pattern) => pattern.stepSignatures.includes(normalizedStep));

    for (const pattern of matches) {
      if (pattern.terminalOnly) {
        if (finalAnswerIsCorrect) continue;
        const laterProgress = studentSteps
          .slice(stepIndex + 1)
          .some((later) => stepShowsCorrectResult(later, rule));
        if (laterProgress) continue;
        return patternDiagnosis(pattern, 'diagnosed', {
          firstWrongStepIndex: null,
          focusStepIndex: stepIndex,
          stepQuote: studentSteps[stepIndex],
        });
      }

      const status = finalAnswerIsCorrect ? 'process-error' : 'diagnosed';
      return patternDiagnosis(pattern, status, {
        firstWrongStepIndex: stepIndex,
        focusStepIndex: stepIndex,
        stepQuote: studentSteps[stepIndex],
        processNote: status === 'process-error' ? '结果正确，但这一步需要检查。' : null,
      });
    }
  }

  const base = diagnose(questionId, finalAnswer);
  if (base.isCorrect) return correctDiagnosis(rule);

  // 3. 草稿已经写出正确答案、最终答案却不同：优先提示抄写/转录，不猜知识点。
  if (studentSteps.some((step) => stepShowsCorrectResult(step, rule))) {
    return {
      isCorrect: false,
      status: 'unknown',
      source: 'rules',
      reason: '过程已出现正确结果，最终答案可能抄写有误',
      evidence: '解题过程中已经写出正确结果，但最终答案与它不一致。请先核对是否抄错，再决定是否需要知识点复习。',
      weakNodeIds: [],
      learningPathIds: [],
      steps: [
        '对照最后一行等式与最终答案输入框。',
        '只改正抄写不一致的一处，再重新提交。',
        '如果过程本身也不确定，补写一行验算。',
      ],
      confidence: 'medium',
      firstWrongStepIndex: null,
      focusStepIndex: null,
      stepQuote: null,
      matchedPatternId: null,
      correctedStep: null,
      alternativePatternIds: [],
      probe: '你草稿里的最后结果和最终答案输入框一致吗？',
      processNote: null,
    };
  }

  const answerPatterns = answerPatternsFor(rule, normalizedFinalAnswer);
  if (answerPatterns.length === 1) {
    return patternDiagnosis(answerPatterns[0], 'diagnosed');
  }
  if (answerPatterns.length > 1) {
    return ambiguousAnswerDiagnosis(rule, finalAnswer, answerPatterns, null, null);
  }

  return {
    ...base,
    status: 'unknown',
    weakNodeIds: [],
    learningPathIds: [],
    firstWrongStepIndex: null,
    focusStepIndex: null,
    stepQuote: null,
    matchedPatternId: null,
    correctedStep: null,
    alternativePatternIds: [],
    probe: null,
    processNote: null,
  };
}
