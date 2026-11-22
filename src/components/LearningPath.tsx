import { ArrowRight, Route } from 'lucide-react';
import type { DiagnosisResult } from '../types';
import { knowledgeNodes } from '../data/knowledge';

export default function LearningPath({
  result,
  expanded = false,
}: {
  result: DiagnosisResult | null;
  expanded?: boolean;
}) {
  const pathIds = result && !result.isCorrect ? result.learningPathIds : [];
  const hasPath = pathIds.length > 0;

  return (
    <section className="panel p-5" aria-labelledby="learning-path-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="learning-path-title" className="section-title">
          <Route className="h-5 w-5" strokeWidth={1.7} />
          建议补习顺序
        </h2>
        {result?.confidence === 'low' && hasPath && (
          <span className="text-xs font-medium text-vermilion">复习方向 · 尚未确认薄弱</span>
        )}
      </div>

      {!hasPath && (
        <div className="border-t border-line py-5 text-sm text-muted">
          {result?.isCorrect ? '答案正确，本次无需生成补习顺序。' : '完成诊断后，这里会按知识依赖列出补习顺序。'}
        </div>
      )}

      {hasPath && result && (
        <div className="result-enter">
          <ol className="flex flex-wrap items-center gap-y-3 border-y border-line py-4">
            {pathIds.map((id, index) => {
              const node = knowledgeNodes.find((item) => item.id === id);
              const weak = result.weakNodeIds.includes(id);
              return (
                <li key={id} className="flex items-center">
                  {index > 0 && <ArrowRight className="mx-2 h-4 w-4 shrink-0 text-[#AAA69D]" strokeWidth={1.6} />}
                  <div className={`rounded-md border px-3 py-2 ${weak ? 'border-vermilion bg-[#F8E8E1]' : 'border-line bg-white/50'}`}>
                    <div className="flex items-center gap-2 text-sm font-bold text-ink">
                      <span className={weak ? 'text-vermilion' : 'text-muted'}>{index + 1}</span>
                      {node?.label ?? id}
                    </div>
                    <div className={`mt-0.5 text-[11px] font-medium ${weak ? 'text-vermilion' : 'text-muted'}`}>
                      {weak ? '疑似薄弱' : '建议复习'}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className={`mt-4 grid gap-3 ${expanded ? '' : 'md:grid-cols-3'}`}>
            {result.steps.slice(0, 3).map((step, index) => (
              <div key={`${step}-${index}`} className="border-t border-line pt-3">
                <div className="mb-1.5 text-xs font-semibold text-muted">第 {index + 1} 步</div>
                <p className="text-sm leading-relaxed text-ink">{step}</p>
                {expanded && pathIds[index] && (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    对应知识点：{knowledgeNodes.find((node) => node.id === pathIds[index])?.label ?? pathIds[index]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
