import { useEffect, useRef } from 'react';
import { ArrowDown, Braces, Clock3 } from 'lucide-react';
import { initPractice, type PracticeAnimationController } from '../../animations/initPractice';
import { questions } from '../../data/knowledge';
import { getPracticeGroup, type PracticeGroup } from '../../data/practiceGroups';
import { questionRules } from '../../data/practiceRules';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import HistoryPanel from '../HistoryPanel';
import KnowledgeGraph from '../KnowledgeGraph';
import LearningPath from '../LearningPath';
import { RollingNumber } from '../RollingDigits';
import DiagnosisPanel from './DiagnosisPanel';
import GroupPicker from './GroupPicker';
import QuestionCard from './QuestionCard';
import SessionSummary from './SessionSummary';

export default function PracticeSection() {
  const root = useRef<HTMLElement>(null);
  const animations = useRef<PracticeAnimationController | null>(null);
  const reducedMotion = useReducedMotion();
  const { state, dispatch, history, startGroup, redoWrong, clearHistory } = usePracticeSession();
  const currentDraft = state.drafts[state.currentIndex] ?? null;
  const currentQuestion = currentDraft
    ? questions.find((question) => question.id === currentDraft.questionId) ?? null
    : null;
  const groupTitle = getPracticeGroup(state.groupId)?.title ?? '错题重练';
  const patternCount = Object.values(questionRules).reduce((total, rule) => total + rule.errorPatterns.length, 0);

  useEffect(() => {
    if (!root.current) return;
    const controller = initPractice(root.current, reducedMotion);
    animations.current = controller;
    return () => {
      controller.destroy();
      animations.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (state.phase !== 'idle' && state.phase !== 'summary') animations.current?.enterQuestion();
  }, [state.currentIndex, state.sessionId]);

  useEffect(() => {
    if (currentDraft?.diagnosis) animations.current?.enterDiagnosis();
  }, [currentDraft?.diagnosis]);

  const selectGroup = (group: PracticeGroup) => {
    animations.current?.exitQuestion();
    startGroup(group);
  };

  return (
    <section className="practice section-shell" id="practice" data-testid="practice" ref={root} aria-labelledby="practice-title">
      <div className="section-heading">
        <div>
          <span className="section-index">PRACTICE / 12 QUESTIONS · {patternCount} PATTERNS</span>
          <h2 id="practice-title" data-reveal>把错误，变成下一步。</h2>
        </div>
        <span className="section-count">0012</span>
      </div>

      <div className="practice-intro">
        <p>选一个题组，写下最终答案和推导过程。同一个错答的不同原因，会在步骤证据里分开；结论可以修改、复查，再用变式验证。</p>
        <span><Braces aria-hidden="true" />LOCAL RULES / NO GUESSWORK</span>
      </div>

      <GroupPicker activeGroupId={state.groupId} onSelect={selectGroup} />

      {state.phase === 'idle' && (
        <div className="practice-idle">
          <span>READY / 0001</span>
          <h3>从一道题开始，<br />找到真正需要复习的地方。</h3>
          <p>最终答案独立提交；步骤可以逐行展开。证据不足时只提示补充过程，不把陌生错答编造成确定错因。</p>
          <a href="#practice" onClick={(event) => {
            event.preventDefault();
            root.current?.querySelector<HTMLButtonElement>('[data-testid="group-function"]')?.focus();
          }}>选择题组后开始<ArrowDown aria-hidden="true" /></a>
        </div>
      )}

      {state.phase !== 'idle' && state.phase !== 'summary' && currentDraft && currentQuestion && (
        <div className="practice-session">
          <div className="practice-progress">
            <div>
              <span>{groupTitle} / SESSION</span>
              <strong><RollingNumber value={state.currentIndex + 1} /><i>/</i><RollingNumber value={state.questionIds.length} /></strong>
            </div>
            <div className="practice-timer" aria-label={`本题已用时 ${currentDraft.elapsedSeconds} 秒`}>
              <Clock3 aria-hidden="true" />
              <RollingNumber value={currentDraft.elapsedSeconds} />
              <span>SEC</span>
            </div>
          </div>

          <div className="practice-workspace">
            <div className="practice-question-stage">
              <QuestionCard
                key={`${state.sessionId}-${currentQuestion.id}`}
                question={currentQuestion}
                draft={currentDraft}
                phase={state.phase}
                dispatch={dispatch}
                isLast={state.currentIndex === state.questionIds.length - 1}
                onLeaveQuestion={() => animations.current?.exitQuestion()}
              />
            </div>
            <DiagnosisPanel
              question={currentQuestion}
              draft={currentDraft}
              verifying={state.phase === 'verifying'}
              dispatch={dispatch}
            />
          </div>

          {currentDraft.diagnosis && (
            <div className="practice-insights">
              <LearningPath
                weakNodeIds={currentDraft.diagnosis.weakNodeIds}
                learningPathIds={currentDraft.diagnosis.learningPathIds}
                steps={currentDraft.diagnosis.steps}
                confidence={currentDraft.diagnosis.confidence}
                emptyText={currentDraft.diagnosis.status === 'correct'
                  ? '答案正确，本次无需生成补习顺序。'
                  : '补充更多解题证据后，再确定需要复习的路径。'}
              />
              <KnowledgeGraph result={currentDraft.diagnosis} />
            </div>
          )}
        </div>
      )}

      {state.phase === 'summary' && state.report && (
        <SessionSummary report={state.report} groupTitle={groupTitle} onRedoWrong={redoWrong} />
      )}

      <HistoryPanel history={history} onClear={clearHistory} />
      <div className="practice-sr-only" role="status" aria-live="polite" aria-atomic="true">{state.announcement}</div>
    </section>
  );
}
