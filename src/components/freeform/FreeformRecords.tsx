import { Trash2 } from 'lucide-react';
import { knowledgeNodes } from '../../data/knowledge';
import type { DiagnosisRecord, DiagnosisSummary } from '../../types';

const statusLabel: Record<DiagnosisRecord['status'], string> = {
  correct: '正确',
  diagnosed: '已定位错因',
  'process-error': '过程需检查',
  unknown: '证据不足',
};

export default function FreeformRecords({
  records,
  summary,
  onClear,
}: {
  records: DiagnosisRecord[];
  summary: DiagnosisSummary;
  onClear: () => void;
}) {
  if (records.length === 0) return null;

  const weakLabels = [
    ...summary.weakNodeIds.map(
      (id) => knowledgeNodes.find((node) => node.id === id)?.label ?? id,
    ),
    ...summary.weakKnowledgePoints,
  ];
  const pathLabels = summary.learningPathIds.map(
    (id) => knowledgeNodes.find((node) => node.id === id)?.label ?? id,
  );

  return (
    <section className="freeform-records" data-testid="freeform-records" aria-labelledby="freeform-records-title">
      <div className="freeform-section-title">
        <span id="freeform-records-title">本机自由诊断记录</span>
        <small>已诊断 {summary.total} 题 · 仅本机</small>
      </div>

      <div className="freeform-records__metrics">
        <span>正确 {summary.correct}</span>
        <span>已定位 {summary.diagnosed}</span>
        <span>过程需检查 {summary.processError}</span>
        <span>证据不足 {summary.unknown}</span>
        <span>合并薄弱点 {weakLabels.length}</span>
      </div>

      <div className="freeform-records__weak">
        <span>合并薄弱点</span>
        {weakLabels.length > 0
          ? weakLabels.map((label) => <b key={label}>{label}</b>)
          : <em>暂无已确认的薄弱点</em>}
      </div>

      {pathLabels.length > 0 && (
        <p className="freeform-records__path">建议补习顺序：{pathLabels.join(' → ')}</p>
      )}

      <ol className="freeform-records__list">
        {records.slice(0, 5).map((record) => (
          <li key={record.id}>
            <span>{statusLabel[record.status]}</span>
            <div>
              <p>{record.question}</p>
              <small>{record.reason || '未生成结论'}</small>
            </div>
          </li>
        ))}
      </ol>

      <p className="freeform-records__note">
        汇总只合并已确认的薄弱点；证据不足和答案正确的记录不并入。修改当前输入不会删除历史记录。
      </p>

      <button type="button" className="practice-text-button" onClick={onClear}>
        <Trash2 aria-hidden="true" />清空本机记录
      </button>
    </section>
  );
}
