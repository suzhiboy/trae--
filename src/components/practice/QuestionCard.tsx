import { useEffect, useRef, type Dispatch, type KeyboardEvent } from 'react';
import { ArrowRight, Plus, ScanSearch, Trash2 } from 'lucide-react';
import { stemLatex } from '../../data/highSchool';
import { initMagnetic } from '../../animations/initMagnetic';
import type { PracticeAction, PracticeDraft, PracticePhase } from '../../hooks/usePracticeSession';
import type { Question } from '../../types';
import { MixedMath } from '../MathTex';
import TextRoll from '../TextRoll';

export default function QuestionCard({
  question,
  draft,
  phase,
  dispatch,
  isLast,
  onLeaveQuestion,
}: {
  question: Question;
  draft: PracticeDraft;
  phase: PracticePhase;
  dispatch: Dispatch<PracticeAction>;
  isLast: boolean;
  onLeaveQuestion: () => void;
}) {
  const submitButton = useRef<HTMLButtonElement>(null);
  const stepInputs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocus = useRef<number | null>(null);
  const answering = phase === 'answering';
  const diagnosed = phase === 'diagnosed' || phase === 'verifying';
  const canSubmit = answering && draft.finalAnswer.trim().length > 0;

  useEffect(() => submitButton.current ? initMagnetic(submitButton.current) : undefined, []);

  useEffect(() => {
    if (pendingFocus.current === null) return;
    stepInputs.current[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  }, [draft.steps.length]);

  const submit = () => {
    if (canSubmit) dispatch({ type: 'SUBMIT' });
  };

  const answerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.stopPropagation();
    event.preventDefault();
    submit();
  };

  return (
    <article className="practice-question" data-practice-question>
      <div className="practice-question__meta">
        <span>{question.subject} / {question.module}</span>
        <span>{question.difficulty} · 预计 {Math.ceil(question.estimatedSeconds / 60)} 分钟</span>
      </div>
      <h3 className="practice-question__stem">
        <MixedMath text={stemLatex[question.id] ?? question.stem} />
      </h3>

      <div className="practice-field">
        <label htmlFor={`practice-answer-${question.id}`}>最终答案</label>
        <input
          id={`practice-answer-${question.id}`}
          data-testid="practice-final-answer"
          value={draft.finalAnswer}
          onChange={(event) => dispatch({ type: 'EDIT_ANSWER', value: event.target.value })}
          onKeyDown={answerKeyDown}
          placeholder="独立输入答案，Enter 提交"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="practice-steps-heading">
        <div>
          <span>解题步骤</span>
          <small>每行可用 $...$ 输入公式，Enter 新增一行</small>
        </div>
        <button
          type="button"
          className="practice-icon-text"
          onClick={() => {
            pendingFocus.current = draft.steps.length;
            dispatch({ type: 'ADD_STEP', index: draft.steps.length - 1 });
          }}
        >
          <Plus aria-hidden="true" />新增步骤
        </button>
      </div>

      <div className="practice-steps" data-lenis-prevent>
        {draft.steps.map((step, index) => {
          const wrong = draft.diagnosis?.firstWrongStepIndex === index;
          const focused = !wrong && draft.diagnosis?.focusStepIndex === index;
          return (
            <div className={`practice-step${wrong ? ' is-wrong' : ''}${focused ? ' is-focus' : ''}`} key={index}>
              <div className="practice-step__line">
                <label htmlFor={`practice-step-${question.id}-${index}`}>{String(index + 1).padStart(2, '0')}</label>
                <input
                  id={`practice-step-${question.id}-${index}`}
                  ref={(element) => { stepInputs.current[index] = element; }}
                  data-testid={`practice-step-${index}`}
                  value={step}
                  onChange={(event) => dispatch({ type: 'EDIT_STEP', index, value: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.stopPropagation();
                    event.preventDefault();
                    pendingFocus.current = index + 1;
                    dispatch({ type: 'ADD_STEP', index });
                  }}
                  placeholder={index === 0 ? '例如：f(-1)=1-2+3' : '写下这一步的推导'}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={wrong || undefined}
                  aria-describedby={wrong || focused ? `practice-correction-${index}` : undefined}
                />
                <button
                  type="button"
                  className="practice-step__remove"
                  onClick={() => dispatch({ type: 'REMOVE_STEP', index })}
                  aria-label={`删除第 ${index + 1} 步`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
              <div className="practice-step__preview" aria-label={`第 ${index + 1} 步公式预览`}>
                <span>预览</span>
                <MixedMath text={step || '等待输入…'} />
              </div>
              {(wrong || focused) && draft.diagnosis?.correctedStep && (
                <p className="practice-step__correction" id={`practice-correction-${index}`}>
                  <strong>{wrong ? '这一步应为：' : '下一步：'}</strong>
                  <MixedMath text={draft.diagnosis.correctedStep} />
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="practice-question__actions">
        {answering && (
          <>
            <button
              ref={submitButton}
              type="button"
              data-testid="practice-submit"
              className="solid-button practice-submit roll-trigger"
              disabled={!canSubmit}
              onClick={submit}
            >
              <ScanSearch aria-hidden="true" />
              <TextRoll text="提交诊断" />
            </button>
            <button type="button" className="outline-button" onClick={() => { onLeaveQuestion(); dispatch({ type: 'SKIP' }); }}>
              跳过
            </button>
            <button type="button" className="practice-text-button" onClick={() => { onLeaveQuestion(); dispatch({ type: 'UNANSWERED' }); }}>
              我不会
            </button>
          </>
        )}
        {diagnosed && (
          <button
            type="button"
            data-testid="practice-next"
            className="solid-button practice-next"
            onClick={() => { onLeaveQuestion(); dispatch({ type: 'NEXT' }); }}
          >
            {isLast ? '查看本次报告' : '下一题'}<ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
      {phase === 'diagnosed' || phase === 'verifying' ? (
        <p className="practice-edit-note" data-testid="practice-edit">答案和步骤仍可修改；修改后需重新诊断。</p>
      ) : null}
    </article>
  );
}
