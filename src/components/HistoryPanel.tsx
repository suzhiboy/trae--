import { CheckCircle2, History, Trash2, XCircle } from 'lucide-react';
import type { HistoryItem } from '../App';

export default function HistoryPanel({
  history,
  onClear,
}: {
  history: HistoryItem[];
  onClear: () => void;
}) {
  return (
    <section className="glass relative overflow-hidden p-5">
      <div className="section-title mb-4">
        <History className="h-4 w-4 text-slate-300" />
        诊断历史记录
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="chip ml-auto border-slate-600/50 bg-slate-800/50 text-slate-400 transition-colors hover:border-danger/50 hover:text-danger"
          >
            <Trash2 className="h-3 w-3" />
            清空
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-slate-700/60 text-sm text-slate-600">
          暂无历史记录，去「智能诊断」提交一次错误答案试试
        </div>
      ) : (
        <div className="space-y-2.5">
          {history.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-slate-900/50 px-4 py-3 transition-colors hover:border-slate-500/40"
            >
              {h.isCorrect ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-danger" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm text-slate-200">{h.questionStem}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{h.time}</div>
              </div>
              <span className="chip border-slate-600/50 bg-slate-800/60 font-mono text-slate-300">
                答：{h.studentAnswer}
              </span>
              {!h.isCorrect && (
                <span className="chip border-danger/40 bg-danger/10 text-orange-300">
                  {h.weakCount} 个漏洞
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
