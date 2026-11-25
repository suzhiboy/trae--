import { useState } from 'react';
import { ArrowRight, CheckCircle2, FlaskConical, RotateCcw, ScanSearch, ShieldQuestion } from 'lucide-react';
import { questions } from '../data/knowledge';
import { stemLatex } from '../data/highSchool';
import { questionRules } from '../data/practiceRules';
import { diagnoseAttempt } from '../engine/attempt';
import type { AttemptDiagnosis, ErrorPattern } from '../types';
import { MixedMath } from './MathTex';
import TextRoll from './TextRoll';

const QUESTION_ID = 'function-negative-input';
const question = questions.find((item) => item.id === QUESTION_ID)!;
const patterns = questionRules[QUESTION_ID].errorPatterns;

interface DraftState {
  finalAnswer: string;
  steps: string[];
  submitted: boolean;
}

type Side = 'jia' | 'yi';

const demoDrafts: Record<Side, DraftState> = {
  jia: {
    finalAnswer: '2',
    steps: ['f(-1)=1-2+3=2'],
    submitted: true,
  },
  yi: {
    finalAnswer: '2',
    steps: ['f(-1)=1+2+3', '1+2+3=2'],
    submitted: true,
  },
};

function cloneDraft(draft: DraftState): DraftState {
  return { ...draft, steps: [...draft.steps] };
}

function statusLabel(diagnosis: AttemptDiagnosis): string {
  if (diagnosis.status === 'correct') return '本题判定：正确';
  if (diagnosis.status === 'process-error') return '结果正确，但这一步需要检查';
  if (diagnosis.status === 'unknown') return '待确认，不判定薄弱点';
  if (diagnosis.firstWrongStepIndex !== null) {
    return `已定位：第 ${diagnosis.firstWrongStepIndex + 1} 行`;
  }
  if (diagnosis.focusStepIndex !== null) {
    return `第 ${diagnosis.focusStepIndex + 1} 行正确，但还差一步`;
  }
  return '已定位错因';
}

function PatternList({ ids }: { ids: string[] }) {
  const items = ids
    .map((id) => patterns.find((pattern) => pattern.id === id))
    .filter((pattern): pattern is ErrorPattern => !!pattern);
  if (items.length === 0) return null;
  return (
    <div className="compare-alternatives">
      <span>可能原因（待确认）</span>
      <ul>
        {items.map((pattern) => <li key={pattern.id}>{pattern.reason}</li>)}
      </ul>
    </div>
  );
}

function DraftDiagnosis({ diagnosis }: { diagnosis: AttemptDiagnosis }) {
  return (
    <div className={`compare-diagnosis is-${diagnosis.status}`} data-testid="compare-diagnosis">
      <div className="compare-diagnosis__status">
        <span>{diagnosis.status === 'correct' ? 'CORRECT' : diagnosis.status === 'unknown' ? 'NEED MORE EVIDENCE' : 'DIAGNOSED'}</span>
        <b>{statusLabel(diagnosis)}</b>
      </div>
      <h3>{diagnosis.reason}</h3>
      {diagnosis.stepQuote && (
        <blockquote>
          <span>学生原句</span>
          {diagnosis.stepQuote}
        </blockquote>
      )}
      <p className="compare-diagnosis__evidence">{diagnosis.evidence}</p>
      {diagnosis.processNote && <p className="compare-diagnosis__note">{diagnosis.processNote}</p>}
      <PatternList ids={diagnosis.alternativePatternIds} />
      {diagnosis.probe && (
        <div className="compare-probe">
          <span>先回答这个问题</span>
          <p>{diagnosis.probe}</p>
        </div>
      )}
      {diagnosis.correctedStep && (
        <div className="compare-next">
          <span>下一步</span>
          <p>{diagnosis.correctedStep}</p>
        </div>
      )}
    </div>
  );
}

function DraftCard({
  side,
  draft,
  onEdit,
  onSubmit,
}: {
  side: Side;
  draft: DraftState;
  onEdit: (patch: Partial<Pick<DraftState, 'finalAnswer' | 'steps'>>) => void;
  onSubmit: () => void;
}) {
  const diagnosis = draft.submitted
    ? diagnoseAttempt({ questionId: QUESTION_ID, finalAnswer: draft.finalAnswer, steps: draft.steps })
    : null;
  const label = side === 'jia' ? '甲' : '乙';

  return (
    <article className={`compare-card compare-card--${side}`} data-testid={`compare-card-${side}`}>
      <header className="compare-card__header">
        <div>
          <span>演示草稿 / DEMO DRAFT</span>
          <strong>{label}</strong>
        </div>
        <label className="compare-card__answer">
          <span>最终答案</span>
          <input
            value={draft.finalAnswer}
            data-testid={`compare-answer-${side}`}
            onChange={(event) => onEdit({ finalAnswer: event.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </header>

      <div className="compare-lines">
        {draft.steps.map((step, index) => {
          const wrong = diagnosis?.firstWrongStepIndex === index;
          const focus = !wrong && diagnosis?.focusStepIndex === index;
          return (
            <label
              className={`compare-line${wrong ? ' is-wrong' : ''}${focus ? ' is-focus' : ''}`}
              key={`${side}-${index}`}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <input
                value={step}
                data-testid={`compare-step-${side}-${index}`}
                onChange={(event) => {
                  const steps = [...draft.steps];
                  steps[index] = event.target.value;
                  onEdit({ steps });
                }}
                autoComplete="off"
                spellCheck={false}
                aria-label={`${label} 的第 ${index + 1} 行草稿`}
              />
              {wrong && <b>错在这里</b>}
              {focus && <b>还差一步</b>}
            </label>
          );
        })}
      </div>

      <div className="compare-card__actions">
        <button type="button" className="outline-button" onClick={onSubmit} data-testid={`compare-submit-${side}`}>
          <ScanSearch aria-hidden="true" />重新诊断
        </button>
        <span>{draft.submitted ? '结论来自正式诊断引擎' : '已修改，旧结论已清除'}</span>
      </div>

      {diagnosis ? (
        <DraftDiagnosis diagnosis={diagnosis} />
      ) : (
        <p className="compare-waiting">改完后点“重新诊断”，系统会重新定位，不会保留旧的高亮。</p>
      )}
    </article>
  );
}

export default function CompareSection() {
  const [drafts, setDrafts] = useState<Record<Side, DraftState>>({
    jia: cloneDraft(demoDrafts.jia),
    yi: cloneDraft(demoDrafts.yi),
  });
  const [answerOnly, setAnswerOnly] = useState(false);

  const edit = (side: Side, patch: Partial<Pick<DraftState, 'finalAnswer' | 'steps'>>) => {
    setDrafts((current) => ({ ...current, [side]: { ...current[side], ...patch, submitted: false } }));
  };
  const submit = (side: Side) => {
    setDrafts((current) => ({ ...current, [side]: { ...current[side], submitted: true } }));
  };
  const reset = () => {
    setDrafts({ jia: cloneDraft(demoDrafts.jia), yi: cloneDraft(demoDrafts.yi) });
    setAnswerOnly(false);
  };
  const answerOnlyDiagnosis = answerOnly
    ? diagnoseAttempt({ questionId: QUESTION_ID, finalAnswer: '2', steps: [] })
    : null;

  return (
    <section className="compare section-shell" id="compare" data-testid="compare-section" aria-labelledby="compare-title">
      <div className="section-heading">
        <div>
          <span className="section-index">COMPARE / LIVE DEMO</span>
          <h2 id="compare-title" data-reveal>同一个答案，错因不一定相同。</h2>
        </div>
        <span className="section-count">0002</span>
      </div>

      <div className="compare-intro">
        <p>两份草稿都答 2，但出错的位置不同。它们都走正式诊断引擎；改任意一行，再点“重新诊断”。样例明确标注为演示草稿。</p>
        <button type="button" className="practice-text-button" onClick={reset}>
          <RotateCcw aria-hidden="true" />恢复演示草稿
        </button>
      </div>

      <div className="compare-question">
        <span>题目 / QUESTION</span>
        <strong><MixedMath text={stemLatex[QUESTION_ID]} /></strong>
        <small>参考答案：{question.correctAnswer}</small>
      </div>

      <div className="compare-grid">
        <DraftCard
          side="jia"
          draft={drafts.jia}
          onEdit={(patch) => edit('jia', patch)}
          onSubmit={() => submit('jia')}
        />
        <DraftCard
          side="yi"
          draft={drafts.yi}
          onEdit={(patch) => edit('yi', patch)}
          onSubmit={() => submit('yi')}
        />
      </div>

      <div className="compare-answer-only">
        <div className="compare-answer-only__lead">
          <span><FlaskConical aria-hidden="true" />对照实验</span>
          <h3>如果只填 2、不写步骤？</h3>
          <p>系统不会挑一种原因硬猜，也不会标红任何一行。</p>
        </div>
        {!answerOnly ? (
          <button type="button" className="outline-button" onClick={() => setAnswerOnly(true)}>
            <ShieldQuestion aria-hidden="true" />查看证据不足时会发生什么
          </button>
        ) : answerOnlyDiagnosis && (
          <div className="compare-answer-only__result" data-testid="compare-answer-only-result">
            <span>证据不足 / NEED MORE EVIDENCE</span>
            <p>{answerOnlyDiagnosis.evidence}</p>
            <PatternList ids={answerOnlyDiagnosis.alternativePatternIds} />
            {answerOnlyDiagnosis.probe && (
              <div className="compare-probe">
                <span>先用一个问题区分</span>
                <p>{answerOnlyDiagnosis.probe}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="compare-footer">
        <p><CheckCircle2 aria-hidden="true" />服务端模型不是前提：以上判定全部由本地规则完成。</p>
        <a href="#practice" className="text-link roll-trigger">
          <TextRoll text="自己写一份" /><ArrowRight aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
