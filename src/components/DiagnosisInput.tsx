import { BrainCircuit, ListChecks, PenLine, Zap } from 'lucide-react';
import { questions } from '../data/knowledge';

interface Props {
  questionId: string | null;
  answer: string;
  analyzing: boolean;
  onQuestionChange: (id: string) => void;
  onAnswerChange: (v: string) => void;
  onDiagnose: (qId: string, ans: string, stem: string) => void;
}

const PRESET_WRONG_ANSWERS: Record<string, string> = {
  'negative-power-parentheses': '-9',
  'distributive-expression': '2x+3',
  'fraction-add': '2/5',
  'linear-equation-basic': '8',
  'function-value': '6',
  'negative-power-precedence': '9',
};

export default function DiagnosisInput({
  questionId,
  answer,
  analyzing,
  onQuestionChange,
  onAnswerChange,
  onDiagnose,
}: Props) {
  const current = questions.find((q) => q.id === questionId) ?? null;
  const canRun = !!current && answer.trim().length > 0 && !analyzing;

  const quickDemo = () => {
    const q = questions[0];
    onQuestionChange(q.id);
    onAnswerChange(PRESET_WRONG_ANSWERS[q.id]);
    onDiagnose(q.id, PRESET_WRONG_ANSWERS[q.id], q.stem);
  };

  return (
    <section className="glass relative overflow-hidden p-5">
      {/* 顶部光带 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

      <div className="section-title mb-4">
        <BrainCircuit className="h-4 w-4 text-cyan-300" />
        AI 智能诊断输入
      </div>

      {/* 题目选择 */}
      <label className="mb-1.5 block text-xs font-medium text-slate-400">
        <ListChecks className="mr-1 inline h-3.5 w-3.5 text-slate-500" />
        选择题目
      </label>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {questions.map((q) => {
          const selected = q.id === questionId;
          return (
            <button
              key={q.id}
              onClick={() => onQuestionChange(q.id)}
              className={`rounded-xl border px-3 py-2 text-left text-xs transition-all duration-200 ${
                selected
                  ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200 shadow-glow'
                  : 'border-line bg-slate-900/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-200'
              }`}
            >
              <span className={`mr-1 font-mono ${selected ? 'text-cyan-300' : 'text-slate-500'}`}>
                {q.id.toUpperCase()}
              </span>
              {q.difficulty}
            </button>
          );
        })}
      </div>

      {/* 题目展示 */}
      <div
        className={`mb-4 min-h-[76px] rounded-xl border border-line p-3.5 transition-colors ${
          current ? 'bg-slate-900/60' : 'bg-slate-900/20'
        }`}
      >
        {current ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span className="chip border-indigo-400/30 bg-indigo-400/10 text-indigo-300">
                {current.subject}
              </span>
              <span className="chip border-slate-600/40 bg-slate-800/60 text-slate-400">
                {current.difficulty}
              </span>
            </div>
            <p className="font-mono text-sm leading-relaxed text-slate-100">{current.stem}</p>
          </>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-slate-600">
            请先在上方选择一道题目
          </p>
        )}
      </div>

      {/* 错误答案输入 */}
      <label className="mb-1.5 block text-xs font-medium text-slate-400">
        <PenLine className="mr-1 inline h-3.5 w-3.5 text-slate-500" />
        学生的错误答案
      </label>
      <input
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="例如：2/5"
        disabled={!current}
        className="mb-4 w-full rounded-xl border border-line bg-slate-900/60 px-3.5 py-2.5 font-mono text-sm text-white placeholder-slate-600 outline-none transition-all focus:border-cyan-400/60 focus:shadow-glow disabled:opacity-40"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canRun && current) {
            onDiagnose(current.id, answer.trim(), current.stem);
          }
        }}
      />

      {/* 操作按钮 */}
      <div className="flex gap-2.5">
        <button
          onClick={() => current && canRun && onDiagnose(current.id, answer.trim(), current.stem)}
          disabled={!canRun}
          className="relative flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-glow-violet transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
        >
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              侦探分析中…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Zap className="h-4 w-4" />
              开始漏洞侦探
            </span>
          )}
          {analyzing && (
            <span className="absolute inset-x-0 top-0 h-1/3 animate-scan bg-gradient-to-b from-transparent via-white/25 to-transparent" />
          )}
        </button>
        <button
          onClick={quickDemo}
          disabled={analyzing}
          className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3.5 py-2.5 text-xs font-medium text-cyan-300 transition-all hover:bg-cyan-400/20 disabled:opacity-40"
          title="使用预设题目 + 预设错误答案一键演示"
        >
          一键体验
        </button>
      </div>
    </section>
  );
}
