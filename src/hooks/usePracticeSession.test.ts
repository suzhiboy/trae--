import { describe, expect, it } from 'vitest';
import { getPracticeGroup } from '../data/practiceGroups';
import {
  initialPracticeState,
  parseActiveSession,
  practiceReducer,
  type PracticeSessionState,
} from './usePracticeSession';

function startFunctionGroup(): PracticeSessionState {
  const group = getPracticeGroup('function')!;
  return practiceReducer(initialPracticeState, {
    type: 'START_GROUP',
    groupId: group.id,
    questionIds: group.questionIds,
    sessionId: 'test-session',
  });
}

function answer(state: PracticeSessionState, value: string, step?: string): PracticeSessionState {
  let next = practiceReducer(state, { type: 'EDIT_ANSWER', value });
  if (step !== undefined) next = practiceReducer(next, { type: 'EDIT_STEP', index: 0, value: step });
  return next;
}

describe('practiceReducer 的诊断、变式与修改失效', () => {
  it('恢复最早错误步骤、变式结果和本题用时，计时在诊断后暂停', () => {
    let state = answer(startFunctionGroup(), '2', 'f(-1)=1-2+3');
    state = practiceReducer(state, { type: 'TICK' });
    state = practiceReducer(state, { type: 'TICK' });
    state = practiceReducer(state, { type: 'SUBMIT' });

    expect(state.phase).toBe('diagnosed');
    expect(state.drafts[0].diagnosis).toMatchObject({
      status: 'diagnosed',
      firstWrongStepIndex: 0,
      matchedPatternId: 'negative-linear-term-sign',
    });

    state = practiceReducer(state, { type: 'OPEN_VARIANT' });
    state = practiceReducer(state, { type: 'SELECT_VARIANT', optionId: 'c' });
    state = practiceReducer(state, { type: 'TICK' });
    expect(state.phase).toBe('verifying');
    expect(state.drafts[0].verification).toBe('corrected');
    expect(state.drafts[0].variantAttempts).toBe(1);
    expect(state.drafts[0].elapsedSeconds).toBe(2);

    const restored = parseActiveSession(JSON.stringify(state));
    expect(restored?.drafts[0]).toMatchObject({
      finalAnswer: '2',
      steps: ['f(-1)=1-2+3'],
      elapsedSeconds: 2,
      verification: 'corrected',
      selectedVariantOptionId: 'c',
      variantAttempts: 1,
    });
    expect(restored?.phase).toBe('verifying');
    expect(restored?.drafts[0].diagnosis?.firstWrongStepIndex).toBe(0);
  });

  it('诊断后的任何答案或步骤修改都会清除旧结论和变式', () => {
    let state = answer(startFunctionGroup(), '2', 'f(-1)=1-2+3');
    state = practiceReducer(state, { type: 'SUBMIT' });
    state = practiceReducer(state, { type: 'OPEN_VARIANT' });
    state = practiceReducer(state, { type: 'SELECT_VARIANT', optionId: 'a' });
    expect(state.drafts[0].verification).toBe('needs-review');
    expect(state.drafts[0].variantAttempts).toBe(1);

    state = practiceReducer(state, { type: 'EDIT_ANSWER', value: '4' });
    expect(state.phase).toBe('answering');
    expect(state.drafts[0].diagnosis).toBeNull();
    expect(state.drafts[0].verification).toBe('not-required');
    expect(state.drafts[0].selectedVariantOptionId).toBeNull();
    expect(state.drafts[0].variantAttempts).toBe(0);

    state = practiceReducer(state, { type: 'SUBMIT' });
    state = practiceReducer(state, { type: 'ADD_STEP', index: 0 });
    expect(state.phase).toBe('answering');
    expect(state.drafts[0].diagnosis).toBeNull();
    expect(state.drafts[0].steps).toHaveLength(2);
  });

  it('最终答案正确但过程有明确错误时，仍开放变式验证', () => {
    let state = answer(startFunctionGroup(), '6', 'f(-1)=1-2+3');
    state = practiceReducer(state, { type: 'SUBMIT' });
    expect(state.drafts[0].diagnosis?.status).toBe('process-error');
    expect(state.drafts[0].diagnosis?.processNote).toContain('结果正确');
    expect(state.drafts[0].verification).toBe('pending');

    state = practiceReducer(state, { type: 'OPEN_VARIANT' });
    expect(state.phase).toBe('verifying');
    state = practiceReducer(state, { type: 'SELECT_VARIANT', optionId: 'c' });
    expect(state.drafts[0].verification).toBe('corrected');
  });

  it('变式首次答对与重试后答对可区分', () => {
    let firstTry = answer(startFunctionGroup(), '2', 'f(-1)=1-2+3');
    firstTry = practiceReducer(firstTry, { type: 'SUBMIT' });
    firstTry = practiceReducer(firstTry, { type: 'OPEN_VARIANT' });
    firstTry = practiceReducer(firstTry, { type: 'SELECT_VARIANT', optionId: 'c' });
    expect(firstTry.drafts[0].variantAttempts).toBe(1);
    expect(firstTry.drafts[0].verification).toBe('corrected');
    expect(firstTry.announcement).toContain('首次');

    let retry = answer(startFunctionGroup(), '2', 'f(-1)=1-2+3');
    retry = practiceReducer(retry, { type: 'SUBMIT' });
    retry = practiceReducer(retry, { type: 'OPEN_VARIANT' });
    retry = practiceReducer(retry, { type: 'SELECT_VARIANT', optionId: 'a' });
    retry = practiceReducer(retry, { type: 'SELECT_VARIANT', optionId: 'c' });
    expect(retry.drafts[0].variantAttempts).toBe(2);
    expect(retry.drafts[0].verification).toBe('corrected');
    expect(retry.announcement).toContain('第 2 次');
  });

  it('错行和最终答案都改对并重新提交后，旧高亮、薄弱点和变式结果全部清除', () => {
    let state = answer(startFunctionGroup(), '2', 'f(-1)=1-2+3=2');
    state = practiceReducer(state, { type: 'SUBMIT' });
    expect(state.drafts[0].diagnosis).toMatchObject({
      status: 'diagnosed',
      firstWrongStepIndex: 0,
      matchedPatternId: 'negative-linear-term-sign',
    });
    expect(state.drafts[0].diagnosis?.weakNodeIds).toEqual(['function-value']);

    state = practiceReducer(state, { type: 'EDIT_ANSWER', value: '6' });
    state = practiceReducer(state, { type: 'EDIT_STEP', index: 0, value: 'f(-1)=1+2+3=6' });
    expect(state.drafts[0].diagnosis).toBeNull();
    expect(state.drafts[0].verification).toBe('not-required');
    expect(state.drafts[0].variantAttempts).toBe(0);

    state = practiceReducer(state, { type: 'SUBMIT' });
    expect(state.drafts[0].diagnosis).toMatchObject({
      status: 'correct',
      isCorrect: true,
      firstWrongStepIndex: null,
      focusStepIndex: null,
      matchedPatternId: null,
      weakNodeIds: [],
      learningPathIds: [],
    });
    expect(state.drafts[0].verification).toBe('not-required');
  });
});

describe('practiceReducer 的会话报告与错题重练', () => {
  it('“我不会”不诊断，报告后只重练 diagnosed/process-error/unknown', () => {
    let state = answer(startFunctionGroup(), '2', 'f(-1)=1-2+3');
    state = practiceReducer(state, { type: 'SUBMIT' });
    state = practiceReducer(state, { type: 'NEXT' });
    state = practiceReducer(state, { type: 'UNANSWERED' });

    expect(state.phase).toBe('summary');
    expect(state.report).toMatchObject({ total: 2, answered: 1, diagnosed: 1, skipped: 0 });
    expect(state.report?.attempts[1]).toMatchObject({ kind: 'unanswered', diagnosis: null });
    expect(state.report?.weakNodeIds).toEqual(['function-value']);

    state = practiceReducer(state, { type: 'REDO_WRONG', sessionId: 'redo-session' });
    expect(state.phase).toBe('answering');
    expect(state.groupId).toBe('redo');
    expect(state.questionIds).toEqual(['function-negative-input']);
    expect(state.attempts).toEqual([]);
    expect(state.report).toBeNull();
  });

  it('持久化校验拒绝未知题目 ID', () => {
    const state = startFunctionGroup();
    const corrupted = { ...state, questionIds: ['missing-question'] };
    expect(parseActiveSession(JSON.stringify(corrupted))).toBeNull();
    expect(parseActiveSession('{not-json')).toBeNull();
  });
});
