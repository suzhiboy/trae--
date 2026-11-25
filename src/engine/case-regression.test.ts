import { describe, expect, it } from 'vitest';
import { diagnoseAttempt } from './attempt';

const functionQuestionId = 'function-negative-input';

describe('回归 1：正确的中间步骤不能被判错', () => {
  it('集合题写对 A∩B 后继续取补集，整题应判为正确', () => {
    const result = diagnoseAttempt({
      questionId: 'set-complement-intersection',
      finalAnswer: '{1,2,5,6}',
      steps: ['A∩B={3,4}', 'U\\(A∩B)={1,2,5,6}'],
    });

    expect(result.status).toBe('correct');
    expect(result.isCorrect).toBe(true);
    expect(result.firstWrongStepIndex).toBeNull();
    expect(result.focusStepIndex).toBeNull();
    expect(result.weakNodeIds).toEqual([]);
    expect(result.learningPathIds).toEqual([]);
  });

  it('集合题停在交集并把它当最终答案，才提示还差补集，且不把正确中间步骤标红', () => {
    const result = diagnoseAttempt({
      questionId: 'set-complement-intersection',
      finalAnswer: '{3,4}',
      steps: ['A∩B={3,4}'],
    });

    expect(result.status).toBe('diagnosed');
    expect(result.matchedPatternId).toBe('complement-after-intersection-omitted');
    expect(result.firstWrongStepIndex).toBeNull();
    expect(result.focusStepIndex).toBe(0);
    expect(result.stepQuote).toBe('A∩B={3,4}');
    expect(result.evidence).toContain('还差');
  });

  it('过程已经算出补集、最终答案却抄成交集时，不判成漏掉补集', () => {
    const result = diagnoseAttempt({
      questionId: 'set-complement-intersection',
      finalAnswer: '{3,4}',
      steps: ['A∩B={3,4}', 'U\\(A∩B)={1,2,5,6}'],
    });

    expect(result.status).toBe('unknown');
    expect(result.firstWrongStepIndex).toBeNull();
    expect(result.focusStepIndex).toBeNull();
    expect(result.weakNodeIds).toEqual([]);
    expect(result.evidence).toContain('过程');
  });
});

describe('回归 2：同一份推导的常见写法得到一致判断', () => {
  it.each([
    ['f(-1)=1-2+3', 0],
    ['f(-1)=1-2+3=2', 0],
  ])('步骤 %s 应定位到实际出现符号错误的第 %i 行', (step, expectedIndex) => {
    const result = diagnoseAttempt({
      questionId: functionQuestionId,
      finalAnswer: '2',
      steps: [step],
    });

    expect(result.status).toBe('diagnosed');
    expect(result.matchedPatternId).toBe('negative-linear-term-sign');
    expect(result.firstWrongStepIndex).toBe(expectedIndex);
    expect(result.focusStepIndex).toBe(expectedIndex);
    expect(result.stepQuote).toBe(step);
    expect(result.evidence).toContain('一次项');
    expect(result.evidence).toContain('-2×(-1)=+2');
  });

  it('先写正确代入、下一行才把符号写错时，定位到下一行', () => {
    const result = diagnoseAttempt({
      questionId: functionQuestionId,
      finalAnswer: '2',
      steps: ['f(-1)=(-1)^2-2×(-1)+3', '=1-2+3=2'],
    });

    expect(result.status).toBe('diagnosed');
    expect(result.matchedPatternId).toBe('negative-linear-term-sign');
    expect(result.firstWrongStepIndex).toBe(1);
    expect(result.stepQuote).toBe('=1-2+3=2');
    expect(result.evidence).toContain('-2×(-1)=+2');
  });

  it.each([
    'f(-1)=1+2+3=6',
    'f(-1)=(-1)^2-2×(-1)+3=1+2+3=6',
    'f(-1)=(-1)^2-2(-1)+3',
  ])('整行写成正确算式 %s 时不得误判', (step) => {
    const result = diagnoseAttempt({
      questionId: functionQuestionId,
      finalAnswer: '6',
      steps: [step],
    });

    expect(result.status).toBe('correct');
    expect(result.firstWrongStepIndex).toBeNull();
    expect(result.focusStepIndex).toBeNull();
  });

  it('最终答案正确但过程出现明确符号错误时，结果与过程分开反馈', () => {
    const result = diagnoseAttempt({
      questionId: functionQuestionId,
      finalAnswer: '6',
      steps: ['f(-1)=1-2+3'],
    });

    expect(result.status).toBe('process-error');
    expect(result.firstWrongStepIndex).toBe(0);
    expect(result.reason).toContain('结果');
    expect(result.processNote).toContain('结果正确');
    expect(result.processNote).toContain('需要检查');
  });
});

describe('回归 3：相同的错答，可能来自不同的错误', () => {
  const jia = diagnoseAttempt({
    questionId: functionQuestionId,
    finalAnswer: '2',
    steps: ['f(-1)=1-2+3=2'],
  });
  const yi = diagnoseAttempt({
    questionId: functionQuestionId,
    finalAnswer: '2',
    steps: ['f(-1)=1+2+3', '1+2+3=2'],
  });
  const answerOnly = diagnoseAttempt({
    questionId: functionQuestionId,
    finalAnswer: '2',
    steps: [],
  });

  it('甲：定位代入行，说明一次项符号', () => {
    expect(jia.status).toBe('diagnosed');
    expect(jia.matchedPatternId).toBe('negative-linear-term-sign');
    expect(jia.firstWrongStepIndex).toBe(0);
    expect(jia.stepQuote).toBe('f(-1)=1-2+3=2');
    expect(jia.reason).toContain('符号');
  });

  it('乙：定位最后的加法行，说明代入本身正确', () => {
    expect(yi.status).toBe('diagnosed');
    expect(yi.matchedPatternId).toBe('final-addition-error');
    expect(yi.firstWrongStepIndex).toBe(1);
    expect(yi.stepQuote).toBe('1+2+3=2');
    expect(yi.reason).toContain('加法');
    expect(yi.evidence).toContain('代入');
  });

  it('两份草稿得到不同结论、不同改正建议', () => {
    expect(jia.reason).not.toBe(yi.reason);
    expect(jia.correctedStep).not.toBe(yi.correctedStep);
    expect(jia.steps).not.toEqual(yi.steps);
  });

  it('只填 2、不写步骤时只给待确认原因，不标红任何一行', () => {
    expect(answerOnly.status).toBe('unknown');
    expect(answerOnly.firstWrongStepIndex).toBeNull();
    expect(answerOnly.focusStepIndex).toBeNull();
    expect(answerOnly.stepQuote).toBeNull();
    expect(answerOnly.confidence).toBe('low');
    expect(answerOnly.alternativePatternIds).toEqual(
      expect.arrayContaining(['negative-linear-term-sign', 'final-addition-error']),
    );
    expect(answerOnly.probe).toContain('-2x');
    expect(answerOnly.weakNodeIds).toEqual([]);
  });

  it('步骤里只有自然语言时保留原句，说明不确定并给出追问', () => {
    const result = diagnoseAttempt({
      questionId: functionQuestionId,
      finalAnswer: '2',
      steps: ['我不太会代入'],
    });

    expect(result.status).toBe('unknown');
    expect(result.firstWrongStepIndex).toBeNull();
    expect(result.focusStepIndex).toBeNull();
    expect(result.stepQuote).toBe('我不太会代入');
    expect(result.evidence).toContain('原句');
    expect(result.probe).toBeTruthy();
    expect(result.weakNodeIds).toEqual([]);
  });
});
