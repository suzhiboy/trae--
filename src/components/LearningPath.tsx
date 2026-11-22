import { Route, Target } from 'lucide-react';
import type { DiagnosisResult } from '../types';
import { knowledgeNodes } from '../data/knowledge';

const stepThemes = [
  {
    ring: 'from-cyan-400 to-sky-500',
    chip: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300',
    num: 'text-cyan-300',
  },
  {
    ring: 'from-indigo-400 to-violet-500',
    chip: 'border-indigo-400/40 bg-indigo-400/10 text-indigo-300',
    num: 'text-indigo-300',
  },
  {
    ring: 'from-violet-400 to-fuchsia-500',
    chip: 'border-violet-400/40 bg-violet-400/10 text-violet-300',
    num: 'text-violet-300',
  },
];

export default function LearningPath({
  result,
  expanded = false,
}: {
  result: DiagnosisResult | null;
  expanded?: boolean;
}) {
  const hasPath = !!result && !result.isCorrect && result.steps.length > 0;

  return (
    <section className="glass relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />

      <div className="section-title mb-4">
        <Route className="h-4 w-4 text-indigo-300" />
        三步学习路径
        {hasPath && (
          <span className="chip ml-auto border-indigo-400/30 bg-indigo-400/10 text-indigo-300">
            个性化生成
          </span>
        )}
      </div>

      {!hasPath && (
        <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-slate-700/60 text-sm text-slate-600">
          {result?.isCorrect
            ? '答案全部正确，无需补习 🎉'
            : '完成诊断后，这里会生成个性化补习路线'}
        </div>
      )}

      {hasPath && (
        <div className={`grid grid-cols-1 gap-3 ${expanded ? '' : 'md:grid-cols-3'}`}>
          {result!.steps.slice(0, 3).map((step, i) => {
            const theme = stepThemes[i % stepThemes.length];
            const nodeId = result!.learningPathIds[i];
            const node = knowledgeNodes.find((n) => n.id === nodeId);
            const [title, goal] = step.includes('：')
              ? [step.split('：')[0], step.split('：').slice(1).join('：')]
              : [step, ''];
            return (
              <div
                key={`${step}-${i}`}
                className="group relative animate-fade-up overflow-hidden rounded-xl border border-line bg-slate-900/50 p-4 transition-all duration-300 hover:border-indigo-400/40 hover:shadow-glow-violet"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${theme.ring} opacity-70`}
                />
                <div className="mb-2 flex items-center justify-between">
                  <span className={`font-display text-2xl font-extrabold ${theme.num} opacity-90`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {node && (
                    <span className={`chip ${theme.chip}`}>
                      <Target className="h-3 w-3" />
                      {node.label}
                    </span>
                  )}
                </div>
                <div className="mb-1 text-sm font-semibold text-white">{title}</div>
                <p className="text-xs leading-relaxed text-slate-400">
                  {goal || node?.description || '完成该知识点的针对性练习'}
                </p>
                {expanded && node && (
                  <p className="mt-2 border-t border-line pt-2 text-[11px] text-slate-500">
                    知识点说明：{node.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
