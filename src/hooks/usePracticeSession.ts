import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { questions } from '../data/knowledge';
import { getPracticeGroup, type PracticeGroup } from '../data/practiceGroups';
import { questionRules } from '../data/practiceRules';
import { diagnoseAttempt } from '../engine/attempt';
import { summarizeSession } from '../engine/session';
import { activeAiRequest, useAiSettings } from '../services/aiCredential';
import { fetchAiDiagnosis } from '../services/aiDiagnosis';
import type {
  AttemptDiagnosis,
  PracticeAttempt,
  SessionReport,
  VerificationStatus,
} from '../types';

export const ACTIVE_STORAGE_KEY = 'kd:practice:v1:active';
export const HISTORY_STORAGE_KEY = 'kd:practice:v1:history';
export const HISTORY_LIMIT = 20;

export type PracticePhase = 'idle' | 'answering' | 'diagnosed' | 'verifying' | 'summary';

export interface PracticeDraft {
  questionId: string;
  finalAnswer: string;
  steps: string[];
  elapsedSeconds: number;
  diagnosis: AttemptDiagnosis | null;
  verification: VerificationStatus;
  selectedVariantOptionId: string | null;
  variantAttempts: number;
}

export interface PracticeSessionState {
  phase: PracticePhase;
  sessionId: string | null;
  groupId: string | null;
  questionIds: string[];
  currentIndex: number;
  drafts: PracticeDraft[];
  attempts: PracticeAttempt[];
  report: SessionReport | null;
  announcement: string;
}

export interface PracticeHistoryEntry {
  sessionId: string;
  groupId: string;
  completedAt: number;
  report: SessionReport;
}

export type PracticeAction =
  | { type: 'START_GROUP'; groupId: string; questionIds: string[]; sessionId: string }
  | { type: 'EDIT_ANSWER'; value: string }
  | { type: 'EDIT_STEP'; index: number; value: string }
  | { type: 'ADD_STEP'; index: number }
  | { type: 'REMOVE_STEP'; index: number }
  | { type: 'SUBMIT' }
  | { type: 'OPEN_VARIANT' }
  | { type: 'SELECT_VARIANT'; optionId: string }
  | { type: 'NEXT' }
  | { type: 'SKIP' }
  | { type: 'UNANSWERED' }
  | { type: 'TICK' }
  | { type: 'REDO_WRONG'; sessionId: string }
  | { type: 'APPLY_AI'; questionId: string; finalAnswer: string; diagnosis: AttemptDiagnosis };

export const initialPracticeState: PracticeSessionState = {
  phase: 'idle',
  sessionId: null,
  groupId: null,
  questionIds: [],
  currentIndex: 0,
  drafts: [],
  attempts: [],
  report: null,
  announcement: '请选择题组开始练习。',
};

const questionIds = new Set(questions.map((question) => question.id));
const phases = new Set<PracticePhase>(['idle', 'answering', 'diagnosed', 'verifying', 'summary']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDraft(questionId: string): PracticeDraft {
  return {
    questionId,
    finalAnswer: '',
    steps: [''],
    elapsedSeconds: 0,
    diagnosis: null,
    verification: 'not-required',
    selectedVariantOptionId: null,
    variantAttempts: 0,
  };
}

function validQuestionList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && new Set(value).size === value.length
    && value.every((id) => typeof id === 'string' && questionIds.has(id));
}

function freshSession(
  groupId: string,
  sessionId: string,
  sessionQuestionIds: string[],
): PracticeSessionState {
  return {
    phase: 'answering',
    sessionId,
    groupId,
    questionIds: [...sessionQuestionIds],
    currentIndex: 0,
    drafts: sessionQuestionIds.map(createDraft),
    attempts: [],
    report: null,
    announcement: `开始练习，第 1 题，共 ${sessionQuestionIds.length} 题。`,
  };
}

function currentDraft(state: PracticeSessionState): PracticeDraft | null {
  return state.drafts[state.currentIndex] ?? null;
}

function replaceCurrentDraft(
  state: PracticeSessionState,
  draft: PracticeDraft,
  announcement = state.announcement,
): PracticeSessionState {
  const drafts = [...state.drafts];
  drafts[state.currentIndex] = draft;
  return { ...state, drafts, announcement };
}

function clearDraftConclusion(draft: PracticeDraft): PracticeDraft {
  return {
    ...draft,
    diagnosis: null,
    verification: 'not-required',
    selectedVariantOptionId: null,
    variantAttempts: 0,
  };
}

function editDraft(state: PracticeSessionState, draft: PracticeDraft): PracticeSessionState {
  const hadConclusion = !!currentDraft(state)?.diagnosis || state.phase === 'verifying';
  return {
    ...replaceCurrentDraft(state, clearDraftConclusion(draft)),
    phase: 'answering',
    report: null,
    announcement: hadConclusion ? '作答内容已修改，原诊断和变式结果已清除，请重新提交。' : state.announcement,
  };
}

function verificationFor(diagnosis: AttemptDiagnosis): VerificationStatus {
  const canVerify = diagnosis.status === 'diagnosed' || diagnosis.status === 'process-error';
  return canVerify && diagnosis.matchedPatternId ? 'pending' : 'not-required';
}

function toAnsweredAttempt(draft: PracticeDraft): PracticeAttempt {
  return {
    questionId: draft.questionId,
    kind: 'answered',
    finalAnswer: draft.finalAnswer,
    steps: [...draft.steps],
    elapsedSeconds: draft.elapsedSeconds,
    diagnosis: draft.diagnosis,
    verification: draft.verification,
    selectedVariantOptionId: draft.selectedVariantOptionId,
    variantAttempts: draft.variantAttempts,
  };
}

function inactiveAttempt(draft: PracticeDraft, kind: 'skipped' | 'unanswered'): PracticeAttempt {
  return {
    questionId: draft.questionId,
    kind,
    finalAnswer: '',
    steps: [],
    elapsedSeconds: draft.elapsedSeconds,
    diagnosis: null,
    verification: 'not-required',
    selectedVariantOptionId: null,
    variantAttempts: 0,
  };
}

function advance(state: PracticeSessionState, attempt: PracticeAttempt): PracticeSessionState {
  const attempts = [...state.attempts, attempt];
  if (state.currentIndex >= state.questionIds.length - 1) {
    return {
      ...state,
      phase: 'summary',
      attempts,
      report: summarizeSession(attempts),
      announcement: '练习完成，已生成会话报告。',
    };
  }

  const currentIndex = state.currentIndex + 1;
  return {
    ...state,
    phase: 'answering',
    currentIndex,
    attempts,
    report: null,
    announcement: `第 ${currentIndex + 1} 题，共 ${state.questionIds.length} 题。`,
  };
}

export function practiceReducer(
  state: PracticeSessionState,
  action: PracticeAction,
): PracticeSessionState {
  switch (action.type) {
    case 'START_GROUP':
      if (!action.sessionId || !validQuestionList(action.questionIds)) return state;
      return freshSession(action.groupId, action.sessionId, action.questionIds);

    case 'EDIT_ANSWER': {
      const draft = currentDraft(state);
      if (!draft || state.phase === 'idle' || state.phase === 'summary') return state;
      return editDraft(state, { ...draft, finalAnswer: action.value });
    }

    case 'EDIT_STEP': {
      const draft = currentDraft(state);
      if (!draft || state.phase === 'idle' || state.phase === 'summary') return state;
      if (action.index < 0 || action.index >= draft.steps.length) return state;
      const steps = [...draft.steps];
      steps[action.index] = action.value;
      return editDraft(state, { ...draft, steps });
    }

    case 'ADD_STEP': {
      const draft = currentDraft(state);
      if (!draft || state.phase === 'idle' || state.phase === 'summary') return state;
      const steps = [...draft.steps];
      const insertAt = Math.max(0, Math.min(action.index + 1, steps.length));
      steps.splice(insertAt, 0, '');
      return editDraft(state, { ...draft, steps });
    }

    case 'REMOVE_STEP': {
      const draft = currentDraft(state);
      if (!draft || state.phase === 'idle' || state.phase === 'summary') return state;
      if (action.index < 0 || action.index >= draft.steps.length) return state;
      const steps = draft.steps.filter((_, index) => index !== action.index);
      return editDraft(state, { ...draft, steps: steps.length > 0 ? steps : [''] });
    }

    case 'SUBMIT': {
      const draft = currentDraft(state);
      if (!draft || state.phase !== 'answering' || !draft.finalAnswer.trim()) return state;
      const diagnosis = diagnoseAttempt({
        questionId: draft.questionId,
        finalAnswer: draft.finalAnswer,
        steps: draft.steps,
      });
      const nextDraft = {
        ...draft,
        diagnosis,
        verification: verificationFor(diagnosis),
        selectedVariantOptionId: null,
      };
      return {
        ...replaceCurrentDraft(state, nextDraft),
        phase: 'diagnosed',
        announcement: diagnosis.status === 'correct'
          ? '答案正确。'
          : diagnosis.status === 'process-error'
            ? '最终答案正确，但解题过程有误。'
            : diagnosis.status === 'unknown'
              ? '证据不足，暂时无法准确判断错因。'
              : '已生成错因诊断，请查看证据与改正建议。',
      };
    }

    case 'OPEN_VARIANT': {
      const draft = currentDraft(state);
      const canVerify = draft?.diagnosis?.status === 'diagnosed' || draft?.diagnosis?.status === 'process-error';
      if (
        !draft
        || state.phase !== 'diagnosed'
        || !canVerify
        || !draft.diagnosis?.matchedPatternId
      ) return state;
      return { ...state, phase: 'verifying', announcement: '请完成一道变式题，验证是否已纠正。' };
    }

    case 'SELECT_VARIANT': {
      const draft = currentDraft(state);
      const diagnosis = draft?.diagnosis;
      if (!draft || !diagnosis || state.phase !== 'verifying' || !diagnosis.matchedPatternId) return state;
      const pattern = questionRules[draft.questionId]?.errorPatterns.find(
        (item) => item.id === diagnosis.matchedPatternId,
      );
      const option = pattern?.variant.options.find((item) => item.id === action.optionId);
      if (!pattern || !option) return state;
      const corrected = pattern.variant.correctOptionId === option.id;
      return replaceCurrentDraft(
        { ...state, phase: 'verifying' },
        {
          ...draft,
          verification: corrected ? 'corrected' : 'needs-review',
          selectedVariantOptionId: option.id,
          variantAttempts: draft.variantAttempts + 1,
        },
        corrected
          ? draft.variantAttempts === 0
            ? '本次变式首次作答即答对。'
            : `本次变式第 ${draft.variantAttempts + 1} 次尝试答对。`
          : `仍需复习：${option.explanation}`,
      );
    }

    case 'NEXT': {
      const draft = currentDraft(state);
      if (!draft || !draft.diagnosis || (state.phase !== 'diagnosed' && state.phase !== 'verifying')) return state;
      return advance(state, toAnsweredAttempt(draft));
    }

    case 'SKIP':
    case 'UNANSWERED': {
      const draft = currentDraft(state);
      if (!draft || state.phase === 'idle' || state.phase === 'summary') return state;
      return advance(
        state,
        inactiveAttempt(draft, action.type === 'SKIP' ? 'skipped' : 'unanswered'),
      );
    }

    case 'TICK': {
      const draft = currentDraft(state);
      if (!draft || state.phase !== 'answering') return state;
      return replaceCurrentDraft(state, { ...draft, elapsedSeconds: draft.elapsedSeconds + 1 });
    }

    case 'REDO_WRONG': {
      if (state.phase !== 'summary' || !state.report || !action.sessionId) return state;
      const wrongIds = state.report.attempts
        .filter((attempt) => ['diagnosed', 'process-error', 'unknown'].includes(attempt.diagnosis?.status ?? ''))
        .map((attempt) => attempt.questionId);
      if (!validQuestionList(wrongIds)) return state;
      return freshSession('redo', action.sessionId, wrongIds);
    }

    case 'APPLY_AI': {
      const draft = currentDraft(state);
      if (!draft || state.phase !== 'diagnosed') return state;
      if (draft.questionId !== action.questionId || draft.finalAnswer !== action.finalAnswer) return state;
      // 只补充规则无法判断的结论；规则已命中或已被修改时丢弃迟到的 AI 结果。
      if (!draft.diagnosis || draft.diagnosis.status !== 'unknown' || draft.diagnosis.source !== 'rules') return state;
      return {
        ...replaceCurrentDraft(
          state,
          { ...draft, diagnosis: action.diagnosis },
          '规则未匹配到典型错误，已补充 AI 推断，仍需自行核对。',
        ),
        phase: 'diagnosed',
      };
    }

    default:
      return state;
  }
}

function selectedOptionId(diagnosis: AttemptDiagnosis, questionId: string, value: unknown): string | null {
  const canVerify = diagnosis.status === 'diagnosed' || diagnosis.status === 'process-error';
  if (!canVerify || typeof value !== 'string' || !diagnosis.matchedPatternId) return null;
  const pattern = questionRules[questionId]?.errorPatterns.find(
    (item) => item.id === diagnosis.matchedPatternId,
  );
  return pattern?.variant.options.some((option) => option.id === value) ? value : null;
}

function verificationFromSelection(
  diagnosis: AttemptDiagnosis,
  questionId: string,
  optionId: string | null,
): VerificationStatus {
  if (!optionId) return verificationFor(diagnosis);
  const pattern = questionRules[questionId]?.errorPatterns.find(
    (item) => item.id === diagnosis.matchedPatternId,
  );
  if (!pattern) return 'not-required';
  return pattern.variant.correctOptionId === optionId ? 'corrected' : 'needs-review';
}

function sanitizeDraft(value: unknown, expectedQuestionId: string): PracticeDraft | null {
  if (!isRecord(value) || value.questionId !== expectedQuestionId) return null;
  if (typeof value.finalAnswer !== 'string' || !Array.isArray(value.steps)) return null;
  if (!value.steps.every((step) => typeof step === 'string')) return null;
  if (typeof value.elapsedSeconds !== 'number' || !Number.isFinite(value.elapsedSeconds) || value.elapsedSeconds < 0) return null;
  if (value.diagnosis !== null && !isRecord(value.diagnosis)) return null;

  const diagnosis = value.diagnosis === null
    ? null
    : diagnoseAttempt({ questionId: expectedQuestionId, finalAnswer: value.finalAnswer, steps: value.steps });
  const selected = diagnosis ? selectedOptionId(diagnosis, expectedQuestionId, value.selectedVariantOptionId) : null;
  const restoredAttempts = typeof value.variantAttempts === 'number'
    && Number.isFinite(value.variantAttempts)
    && value.variantAttempts >= 0
    ? Math.floor(value.variantAttempts)
    : selected
      ? 1
      : 0;

  return {
    questionId: expectedQuestionId,
    finalAnswer: value.finalAnswer,
    steps: [...value.steps],
    elapsedSeconds: Math.floor(value.elapsedSeconds),
    diagnosis,
    verification: diagnosis ? verificationFromSelection(diagnosis, expectedQuestionId, selected) : 'not-required',
    selectedVariantOptionId: selected,
    variantAttempts: restoredAttempts,
  };
}

function sanitizeAttempt(value: unknown): PracticeAttempt | null {
  if (!isRecord(value) || typeof value.questionId !== 'string' || !questionIds.has(value.questionId)) return null;
  if (value.kind !== 'answered' && value.kind !== 'skipped' && value.kind !== 'unanswered') return null;
  if (typeof value.elapsedSeconds !== 'number' || !Number.isFinite(value.elapsedSeconds) || value.elapsedSeconds < 0) return null;

  if (value.kind !== 'answered') {
    return {
      questionId: value.questionId,
      kind: value.kind,
      finalAnswer: '',
      steps: [],
      elapsedSeconds: Math.floor(value.elapsedSeconds),
      diagnosis: null,
      verification: 'not-required',
      selectedVariantOptionId: null,
      variantAttempts: 0,
    };
  }

  const draft = sanitizeDraft(value, value.questionId);
  if (!draft?.diagnosis) return null;
  return toAnsweredAttempt(draft);
}

export function parseActiveSession(raw: string | null): PracticeSessionState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.phase !== 'string' || !phases.has(value.phase as PracticePhase)) return null;
    if (value.phase === 'idle' || value.phase === 'summary' && !isRecord(value.report)) return null;
    if (typeof value.sessionId !== 'string' || !value.sessionId || typeof value.groupId !== 'string') return null;
    if (!validQuestionList(value.questionIds) || !Array.isArray(value.drafts) || value.drafts.length !== value.questionIds.length) return null;
    const sessionQuestionIds: string[] = value.questionIds;
    if (typeof value.currentIndex !== 'number' || !Number.isInteger(value.currentIndex)) return null;
    if (value.currentIndex < 0 || value.currentIndex >= sessionQuestionIds.length) return null;

    const group = getPracticeGroup(value.groupId);
    if (group && JSON.stringify(group.questionIds) !== JSON.stringify(sessionQuestionIds)) return null;
    if (!group && value.groupId !== 'redo') return null;

    const drafts = value.drafts.map((draft, index) => sanitizeDraft(draft, sessionQuestionIds[index]));
    if (drafts.some((draft) => draft === null)) return null;
    if (!Array.isArray(value.attempts)) return null;
    const attempts = value.attempts.map(sanitizeAttempt);
    if (attempts.some((attempt) => attempt === null)) return null;

    const expectedAttemptCount = value.phase === 'summary' ? sessionQuestionIds.length : value.currentIndex;
    if (attempts.length !== expectedAttemptCount) return null;
    if (!attempts.every((attempt, index) => attempt?.questionId === sessionQuestionIds[index])) return null;

    const cleanDrafts = drafts as PracticeDraft[];
    const cleanAttempts = attempts as PracticeAttempt[];
    const current = cleanDrafts[value.currentIndex];
    let phase = value.phase as PracticePhase;
    if ((phase === 'diagnosed' || phase === 'verifying') && !current.diagnosis) return null;
    if (phase === 'verifying' && (current.diagnosis?.status !== 'diagnosed' || !current.diagnosis.matchedPatternId)) {
      phase = 'diagnosed';
    }

    return {
      phase,
      sessionId: value.sessionId,
      groupId: value.groupId,
      questionIds: [...value.questionIds],
      currentIndex: value.currentIndex,
      drafts: cleanDrafts,
      attempts: cleanAttempts,
      report: phase === 'summary' ? summarizeSession(cleanAttempts) : null,
      announcement: typeof value.announcement === 'string' ? value.announcement : '已恢复上次练习。',
    };
  } catch {
    return null;
  }
}

export function parseHistory(raw: string | null): PracticeHistoryEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.slice(0, HISTORY_LIMIT).flatMap((item): PracticeHistoryEntry[] => {
      if (!isRecord(item) || typeof item.sessionId !== 'string' || typeof item.groupId !== 'string') return [];
      if (typeof item.completedAt !== 'number' || !Number.isFinite(item.completedAt) || Number.isNaN(new Date(item.completedAt).getTime())) return [];
      if (!isRecord(item.report) || !Array.isArray(item.report.attempts)) return [];
      const attempts = item.report.attempts.map(sanitizeAttempt);
      if (attempts.some((attempt) => attempt === null)) return [];
      return [{
        sessionId: item.sessionId,
        groupId: item.groupId,
        completedAt: item.completedAt,
        report: summarizeSession(attempts as PracticeAttempt[]),
      }];
    });
  } catch {
    return [];
  }
}

function readStorage(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 存储不可用或已满时，练习仍保留在当前页面内。
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 与写入失败一样，不影响当前会话。
  }
}

function loadActiveState(): PracticeSessionState {
  return parseActiveSession(readStorage(ACTIVE_STORAGE_KEY)) ?? initialPracticeState;
}

function createSessionId(): string {
  try {
    return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function usePracticeSession() {
  const [state, dispatch] = useReducer(practiceReducer, undefined, loadActiveState);
  const [history, setHistory] = useState<PracticeHistoryEntry[]>(() => parseHistory(readStorage(HISTORY_STORAGE_KEY)));
  // 同一题同一答案只请求一次 AI；失败后保持规则结论，不重试、不打断作答。
  const aiRequested = useRef<Set<string>>(new Set());
  const aiSettings = useAiSettings();

  // 凭证变化后允许同一题重新尝试；Key 本身不出现在请求键或日志里。
  useEffect(() => {
    aiRequested.current.clear();
  }, [aiSettings.mode, aiSettings.enabled, aiSettings.key, aiSettings.providerId, aiSettings.textModel, aiSettings.visionModel]);

  useEffect(() => {
    if (state.phase === 'idle') {
      removeStorage(ACTIVE_STORAGE_KEY);
      return;
    }
    try {
      writeStorage(ACTIVE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // JSON 序列化失败时不阻断作答。
    }
  }, [state]);

  useEffect(() => {
    try {
      writeStorage(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // 历史写入失败不影响当前会话。
    }
  }, [history]);

  useEffect(() => {
    if (state.phase !== 'summary' || !state.report || !state.sessionId || !state.groupId) return;
    const entry: PracticeHistoryEntry = {
      sessionId: state.sessionId,
      groupId: state.groupId,
      completedAt: Date.now(),
      report: state.report,
    };
    setHistory((current) => current.some((item) => item.sessionId === entry.sessionId)
      ? current
      : [entry, ...current].slice(0, HISTORY_LIMIT));
  }, [state.groupId, state.phase, state.report, state.sessionId]);

  useEffect(() => {
    if (state.phase !== 'answering' || !state.sessionId) return;
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => window.clearInterval(timer);
  }, [state.currentIndex, state.phase, state.sessionId]);

  const currentQuestionId = state.drafts[state.currentIndex]?.questionId ?? null;
  const currentDiagnosis = state.drafts[state.currentIndex]?.diagnosis ?? null;
  useEffect(() => {
    if (state.phase !== 'diagnosed' || !currentQuestionId || !currentDiagnosis) return;
    if (currentDiagnosis.status !== 'unknown' || currentDiagnosis.source !== 'rules') return;

    // 自定义模式未启用时宁可不发请求，也不回退到站点账户。
    const credential = activeAiRequest();
    if (!credential) return;

    const draft = state.drafts[state.currentIndex];
    const key = `${state.sessionId}:${state.currentIndex}:${draft.finalAnswer}`;
    if (aiRequested.current.has(key)) return;
    aiRequested.current.add(key);

    const question = questions.find((item) => item.id === draft.questionId);
    if (!question) return;

    let active = true;
    fetchAiDiagnosis(question, draft.finalAnswer, draft.steps, credential).then((diagnosis) => {
      if (!active || !diagnosis) return;
      dispatch({
        type: 'APPLY_AI',
        questionId: draft.questionId,
        finalAnswer: draft.finalAnswer,
        diagnosis,
      });
    });
    return () => {
      active = false;
    };
  }, [
    aiSettings.enabled,
    aiSettings.key,
    aiSettings.mode,
    currentDiagnosis,
    currentQuestionId,
    state.currentIndex,
    state.drafts,
    state.phase,
    state.sessionId,
  ]);

  const startGroup = useCallback((group: PracticeGroup) => {
    dispatch({
      type: 'START_GROUP',
      groupId: group.id,
      questionIds: group.questionIds,
      sessionId: createSessionId(),
    });
  }, []);

  const redoWrong = useCallback(() => {
    dispatch({ type: 'REDO_WRONG', sessionId: createSessionId() });
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return { state, dispatch, history, startGroup, redoWrong, clearHistory };
}
