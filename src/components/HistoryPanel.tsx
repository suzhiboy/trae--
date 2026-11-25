import { CheckCircle2, History, Trash2, XCircle } from 'lucide-react';
import { getPracticeGroup } from '../data/practiceGroups';
import type { PracticeHistoryEntry } from '../hooks/usePracticeSession';

export default function HistoryPanel({
  history,
  onClear,
}: {
  history: PracticeHistoryEntry[];
  onClear: () => void;
}) {
  return (
    <section className="practice-history" aria-labelledby="practice-history-title">
      <div className="practice-subheading">
        <div>
          <h2 id="practice-history-title"><History aria-hidden="true" />会话历史</h2>
          <p>仅保存在当前浏览器，最多保留最近 20 组</p>
        </div>
        {history.length > 0 && (
          <button type="button" onClick={onClear}><Trash2 aria-hidden="true" />清空历史</button>
        )}
      </div>

      {history.length === 0 ? (
        <p className="practice-history__empty">完成一个题组后，这里会保存整组统计与学习路径。</p>
      ) : (
        <div className="practice-history__list" data-lenis-prevent>
          {history.map((item) => {
            const group = getPracticeGroup(item.groupId);
            const unanswered = item.report.attempts.filter((attempt) => attempt.kind === 'unanswered').length;
            return (
              <article key={item.sessionId}>
                {item.report.weakNodeIds.length === 0 ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                <div className="practice-history__session">
                  <h3>{group?.title ?? '错题重练'}<span>{item.report.total} 题会话</span></h3>
                  <time dateTime={new Date(item.completedAt).toISOString()}>
                    {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(item.completedAt)}
                  </time>
                </div>
                <div className="practice-history__stats">
                  <span>正确率 <b>{Math.round(item.report.accuracy)}%</b></span>
                  <span>答对 {item.report.correct}/{item.report.answered}</span>
                  <span>薄弱 {item.report.weakNodeIds.length}</span>
                  <span>跳过 {item.report.skipped} · 不会 {unanswered}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
