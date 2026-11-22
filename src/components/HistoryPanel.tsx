import { CheckCircle2, History, Trash2, XCircle } from 'lucide-react';
export interface HistoryItem {
  id: string;
  time: string;
  questionStem: string;
  studentAnswer: string;
  isCorrect: boolean;
  weakCount: number;
}

export default function HistoryPanel({
  history,
  onClear,
}: {
  history: HistoryItem[];
  onClear: () => void;
}) {
  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="history-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 id="history-title" className="section-title">
            <History className="h-5 w-5" strokeWidth={1.7} />
            历史记录
          </h1>
          <p className="mt-1 text-sm text-muted">保留最近 20 次本地诊断</p>
        </div>
        {history.length > 0 && (
          <button onClick={onClear} className="button-secondary !min-h-9 !px-3 !py-1.5">
            <Trash2 className="h-4 w-4" strokeWidth={1.7} />
            清空
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="border-t border-line py-12 text-center text-sm text-muted">
          暂无历史记录，回到「诊断」提交一次答案试试。
        </div>
      ) : (
        <div className="border-t border-line">
          {history.map((item) => (
            <article key={item.id} className="flex flex-col gap-3 border-b border-line py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {item.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ink" strokeWidth={1.7} />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-vermilion" strokeWidth={1.7} />
                )}
                <div className="min-w-0">
                  <h2 className="break-words text-sm font-medium leading-relaxed text-ink">{item.questionStem}</h2>
                  <p className="mt-1 text-xs text-muted">{item.time}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
                <span className="chip border-line bg-white/50 font-mono text-ink">答：{item.studentAnswer}</span>
                <span className={`chip ${item.isCorrect ? 'border-line text-muted' : 'border-vermilion text-vermilion'}`}>
                  {item.isCorrect ? '答案正确' : `${item.weakCount} 个疑似薄弱点`}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
