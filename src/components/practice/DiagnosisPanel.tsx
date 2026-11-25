import { AlertTriangle, CheckCircle2, FileSearch, Fingerprint, ShieldQuestion } from 'lucide-react';
import { knowledgeNodes } from '../../data/knowledge';
import { questionRules } from '../../data/practiceRules';
import type { PracticeDraft, PracticeAction } from '../../hooks/usePracticeSession';
import type { ErrorPattern, Question } from '../../types';
import type { Dispatch } from 'react';
import VariantCheck from './VariantCheck';

const statusCopy = {
  correct: { title: '本题判定：正确', label: 'CORRECT' },
  diagnosed: { title: '已定位到出错的一步', label: 'DIAGNOSED' },
  'process-error': { title: '结果正确，但这一步需要检查', label: 'PROCESS CHECK' },
  unknown: { title: '证据不足，暂不能确定错因', label: 'NEED MORE EVIDENCE' },
} as const;

const aiCopy = { title: '规则未匹配，AI 补充推断', label: 'AI DIAGNOSIS' } as const;

const confidenceCopy = { high: '高', medium: '中', low: '低' } as const;

function DiagnosisLine({ title, children, className = '' }: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`practice-diagnosis-line ${className}`}>
      <div className="practice-diagnosis-line__content">
        <h4>{title}</h4>
        {children}
      </div>
    </div>
  );
}

export default function DiagnosisPanel({
  question,
  draft,
  verifying,
  dispatch,
}: {
  question: Question;
  draft: PracticeDraft;
  verifying: boolean;
  dispatch: Dispatch<PracticeAction>;
}) {
  const diagnosis = draft.diagnosis;
  if (!diagnosis) {
    return (
      <aside className="practice-diagnosis practice-diagnosis--empty" aria-label="等待诊断">
        <FileSearch aria-hidden="true" />
        <h3>诊断会在这里留下证据。</h3>
        <p>提交后查看结论、推断依据与建议步骤。空答案可退出本题，不会被猜测错因。</p>
      </aside>
    );
  }

  const isAi = diagnosis.source === 'ai';
  const isAmbiguous = diagnosis.status === 'unknown' && diagnosis.alternativePatternIds.length > 0;
  const copy = isAi ? aiCopy : isAmbiguous
    ? { title: '同一错答，有两种待确认的原因', label: 'POSSIBLE CAUSES' }
    : statusCopy[diagnosis.status];
  const pattern = diagnosis.matchedPatternId
    ? questionRules[question.id]?.errorPatterns.find((item) => item.id === diagnosis.matchedPatternId)
    : undefined;
  const alternatives = diagnosis.alternativePatternIds
    .map((id) => questionRules[question.id]?.errorPatterns.find((item) => item.id === id))
    .filter((item): item is ErrorPattern => !!item);
  const canVerify = (diagnosis.status === 'diagnosed' || diagnosis.status === 'process-error') && !!pattern;
  const focusIndex = diagnosis.focusStepIndex;
  const focusTitle = diagnosis.firstWrongStepIndex !== null
    ? '错在哪一行'
    : focusIndex !== null
      ? '这一步是对的，但还差最后一步'
      : '';

  return (
    <aside className={`practice-diagnosis is-${diagnosis.status}`} aria-labelledby="practice-diagnosis-title" aria-live="polite">
      <div className="practice-diagnosis__heading">
        <span>{copy.label}</span>
        {diagnosis.status === 'correct' ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      </div>
      <h3 id="practice-diagnosis-title">{copy.title}</h3>

      <div className="practice-answer-comparison">
        <div><span>你的答案</span><strong>{draft.finalAnswer}</strong></div>
        <div><span>参考答案</span><strong>{question.correctAnswer}</strong></div>
      </div>

      {diagnosis.status === 'process-error' && (
        <div className="practice-result-split">
          <div><CheckCircle2 aria-hidden="true" /><span>结果</span><strong>最终答案正确</strong></div>
          <div><AlertTriangle aria-hidden="true" /><span>过程</span><strong>这一步需要检查</strong></div>
        </div>
      )}

      {diagnosis.stepQuote && focusIndex !== null && (
        <DiagnosisLine title={focusTitle} className={diagnosis.firstWrongStepIndex !== null ? 'is-quote' : 'is-focus'}>
          <blockquote className="practice-step-quote">{diagnosis.stepQuote}</blockquote>
          <small>第 {focusIndex + 1} 步 · 学生原句</small>
        </DiagnosisLine>
      )}

      <DiagnosisLine title="诊断结论">
        <p>{diagnosis.reason}</p>
      </DiagnosisLine>
      <DiagnosisLine title="证据与边界">
        <p>{diagnosis.evidence}</p>
        <small>{isAi ? 'AI 诊断' : '规则诊断'} · 置信度{confidenceCopy[diagnosis.confidence]}</small>
      </DiagnosisLine>

      {diagnosis.correctedStep && diagnosis.firstWrongStepIndex === null && diagnosis.status !== 'process-error' && (
        <DiagnosisLine title={diagnosis.focusStepIndex !== null ? '下一步' : '建议改正'} className="is-correction">
          <p>{diagnosis.correctedStep}</p>
        </DiagnosisLine>
      )}

      {alternatives.length > 0 && (
        <DiagnosisLine title="可能原因（待确认）">
          <ul className="practice-alternatives">
            {alternatives.map((item) => (
              <li key={item.id}><strong>{item.reason}</strong></li>
            ))}
          </ul>
          <small>这些只是候选原因；当前没有足够的草稿证据确认其中任何一个。</small>
        </DiagnosisLine>
      )}

      {diagnosis.probe && (
        <DiagnosisLine title={alternatives.length > 0 ? '先用一个问题区分' : '可进一步确认'} className="is-probe">
          <p><ShieldQuestion aria-hidden="true" />{diagnosis.probe}</p>
        </DiagnosisLine>
      )}

      {diagnosis.weakNodeIds.length > 0 && (
        <DiagnosisLine title="疑似薄弱点">
          <div className="practice-weak-tags">
            {diagnosis.weakNodeIds.map((id) => (
              <span key={id}>{knowledgeNodes.find((node) => node.id === id)?.label ?? id}</span>
            ))}
          </div>
        </DiagnosisLine>
      )}

      <DiagnosisLine title="建议步骤">
        <ol>
          {diagnosis.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
        </ol>
      </DiagnosisLine>

      {canVerify && !verifying && (
        <button
          type="button"
          data-testid="practice-variant"
          className="outline-button practice-variant-entry"
          onClick={() => dispatch({ type: 'OPEN_VARIANT' })}
        >
          <Fingerprint aria-hidden="true" />
          {diagnosis.status === 'process-error' ? '针对这一步做一道变式' : '做一道变式，验证已掌握'}
        </button>
      )}
      {canVerify && verifying && pattern && (
        <VariantCheck questionId={question.id} pattern={pattern} draft={draft} dispatch={dispatch} />
      )}
    </aside>
  );
}
