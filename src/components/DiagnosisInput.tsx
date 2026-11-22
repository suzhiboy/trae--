import { ListChecks, PenLine, Play, ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { questions } from '../data/knowledge';
import { stemLatex } from '../data/highSchool';
import { MixedMath } from './MathTex';

interface Props {
  questionId: string | null;
  answer: string;
  analyzing: boolean;
  onQuestionChange: (id: string) => void;
  onAnswerChange: (v: string) => void;
  onDiagnose: (qId: string, ans: string, stem: string) => void;
}

const DEMO_QUESTION_ID = 'function-negative-input';
const DEMO_WRONG_ANSWER = '2';

export default function DiagnosisInput({
  questionId,
  answer,
  analyzing,
  onQuestionChange,
  onAnswerChange,
  onDiagnose,
}: Props) {
  const [demoError, setDemoError] = useState('');
  const current = questions.find((q) => q.id === questionId) ?? null;
  const canRun = !!current && answer.trim().length > 0 && !analyzing;

  const quickDemo = () => {
    const question = questions.find((item) => item.id === DEMO_QUESTION_ID);
    if (!question) {
      setDemoError(`未找到演示题目 ${DEMO_QUESTION_ID}，请检查题库配置。`);
      return;
    }

    setDemoError('');
    onQuestionChange(question.id);
    onAnswerChange(DEMO_WRONG_ANSWER);
    onDiagnose(question.id, DEMO_WRONG_ANSWER, question.stem);
  };

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="diagnosis-input-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="diagnosis-input-title" className="flex items-center gap-2 text-base font-bold text-ink">
          <ScanSearch className="h-5 w-5" strokeWidth={1.7} />
          从一道题开始
        </h2>
        <span className="text-xs text-muted">高中数学 · 6 道题</span>
      </div>

      <label htmlFor="question-select" className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink">
        <ListChecks className="h-4 w-4 text-muted" strokeWidth={1.7} />
        选择题目
      </label>
      <select
        id="question-select"
        value={questionId ?? ''}
        onChange={(event) => {
          setDemoError('');
          onQuestionChange(event.target.value);
        }}
        className="field mb-4"
      >
        <option value="" disabled>请选择一道题</option>
        {questions.map((question) => (
          <option key={question.id} value={question.id}>
            {question.difficulty}｜{question.stem}
          </option>
        ))}
      </select>

      <div className="mb-5 min-h-[108px] border-y border-line py-4">
        {current ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span>{current.subject}</span>
              <span aria-hidden="true">/</span>
              <span>{current.difficulty}</span>
            </div>
            <div className="text-[17px] font-medium leading-relaxed text-ink">
              {stemLatex[current.id] ? (
                <MixedMath text={stemLatex[current.id]} />
              ) : (
                current.stem
              )}
            </div>
          </>
        ) : (
          <p className="flex min-h-[72px] items-center text-sm leading-relaxed text-muted">
            选题后输入答案，或直接点击「一键体验」载入典型错答。
          </p>
        )}
      </div>

      <label htmlFor="student-answer" className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink">
        <PenLine className="h-4 w-4 text-muted" strokeWidth={1.7} />
        学生答案
      </label>
      <input
        id="student-answer"
        value={answer}
        onChange={(event) => onAnswerChange(event.target.value)}
        placeholder="输入最终答案，例如：2"
        disabled={!current}
        className="field font-mono text-base disabled:cursor-not-allowed disabled:opacity-50"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && canRun && current) {
            onDiagnose(current.id, answer.trim(), current.stem);
          }
        }}
      />

      <div className="mt-4 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
        <button
          id="diagnose-submit"
          onClick={() => current && canRun && onDiagnose(current.id, answer.trim(), current.stem)}
          disabled={!canRun}
          className="button-primary"
        >
          <ScanSearch className="h-4 w-4" strokeWidth={1.8} />
          {analyzing ? '正在诊断…' : '开始诊断'}
        </button>
        <button
          id="quick-demo"
          onClick={quickDemo}
          disabled={analyzing}
          className="button-secondary"
          title="载入 f(x)=x²-2x+3，求 f(-1)，并预填错答 2"
        >
          <Play className="h-4 w-4" strokeWidth={1.8} />
          一键体验
        </button>
      </div>

      {demoError && <p className="mt-3 text-sm font-medium text-vermilion" role="alert">{demoError}</p>}
    </section>
  );
}
