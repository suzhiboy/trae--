import { useEffect, useState } from 'react';
import { ClipboardPaste, Download, FileUp, Trash2, Users } from 'lucide-react';
import { getPracticeGroup } from '../data/practiceGroups';
import {
  aggregateTeacherRows,
  mergeTeacherRows,
  parseCsv,
  parseStoredRows,
  REPORT_CSV_HEADERS,
  rowsFromFreeformRecords,
  rowsFromSessionReport,
  toCsv,
  type ReportRow,
} from '../engine/teacher';
import { HISTORY_STORAGE_KEY, parseHistory } from '../hooks/usePracticeSession';
import { useStudentId } from '../hooks/useStudentId';
import { loadFreeformRecords } from '../services/freeformRecords';
import { downloadCsvFile } from '../services/downloadCsv';
import StudentIdField from './report/StudentIdField';

const TEACHER_ROWS_KEY = 'kd:teacher:v1:rows';

function loadRows(): ReportRow[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(TEACHER_ROWS_KEY);
    return raw ? parseStoredRows(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export default function TeacherPanel() {
  const [rows, setRows] = useState<ReportRow[]>(loadRows);
  const [paste, setPaste] = useState('');
  const [notice, setNotice] = useState('');
  const [studentId, setStudentId] = useStudentId();
  const summary = aggregateTeacherRows(rows);

  useEffect(() => {
    try {
      window.localStorage.setItem(TEACHER_ROWS_KEY, JSON.stringify(rows));
    } catch {
      // 存储不可用时，汇总仍保留在当前页面。
    }
  }, [rows]);

  const importPaste = () => {
    const parsed = parseCsv(paste);
    if (parsed.rows.length === 0) {
      setNotice(parsed.errors[0] ?? '没有可导入的有效行。请检查表头和内容。');
      return;
    }
    setRows((current) => mergeTeacherRows(current, parsed.rows));
    setNotice([
      `导入 ${parsed.rows.length} 行`,
      parsed.invalidRows > 0 ? `忽略 ${parsed.invalidRows} 行格式错误` : '',
      '数据只保存在本机。',
    ].filter(Boolean).join('；'));
    setPaste('');
  };

  const importLocal = () => {
    const id = studentId.trim();
    if (!id) {
      setNotice('先填写本机学生编号，再导入本机记录；系统不会替你编造编号。');
      return;
    }

    let localRows: ReportRow[] = [];
    try {
      const history = parseHistory(window.localStorage.getItem(HISTORY_STORAGE_KEY));
      localRows = history.flatMap((entry) => rowsFromSessionReport(
        entry.report,
        getPracticeGroup(entry.groupId)?.title ?? '错题重练',
        id,
        entry.completedAt,
      ));
    } catch {
      // 历史损坏时忽略这部分，仍可导入自由诊断记录。
    }
    localRows = [...localRows, ...rowsFromFreeformRecords(loadFreeformRecords(), id)];

    if (localRows.length === 0) {
      setNotice('本机没有已完成的练习报告或自由诊断记录。先完成一组题或一次任意题诊断。');
      return;
    }
    setRows((current) => mergeTeacherRows(current, localRows));
    setNotice(`已导入本机 ${localRows.length} 条真实记录（学生编号 ${id}）。`);
  };

  const exportRows = () => {
    if (rows.length === 0) return;
    downloadCsvFile(`knowledge-detective-teacher-${Date.now()}.csv`, toCsv(rows));
  };

  const clearRows = () => {
    setRows([]);
    setNotice('已清空教师视图的本机数据。');
  };

  return (
    <section className="teacher section-shell" id="teacher" data-testid="teacher-section" aria-labelledby="teacher-title">
      <div className="section-heading">
        <div>
          <span className="section-index">TEACHER VIEW / LOCAL ONLY</span>
          <h2 id="teacher-title" data-reveal>全班最常见的错因，<br />从真实报告里来。</h2>
        </div>
        <span className="section-count">0004</span>
      </div>

      <div className="teacher-intro">
        <p>
          把学生导出的 CSV 粘贴进来，或只导入本机已完成的报告。按错因聚合，
          显示最常见的 3 个错因和对应学生编号。没有数据时显示为空，不生成任何虚构学生。
        </p>
        <span><Users aria-hidden="true" />NO LOGIN / LOCAL STORAGE</span>
      </div>

      <div className="teacher-grid">
        <div className="teacher-import">
          <div className="teacher-block-title">
            <ClipboardPaste aria-hidden="true" />
            <span>粘贴导入</span>
          </div>
          <textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder={`${REPORT_CSV_HEADERS.join(',')}\n2026001,builtin,function-negative-input,已知 f(x)=x²-2x+3，求 f(-1),,diagnosed,一次项符号写错,pattern:function-negative-input:symbol,,function-value,rule,...`}
            rows={8}
            spellCheck={false}
            aria-label="粘贴 CSV 报告"
          />
          <div className="teacher-actions">
            <button type="button" className="solid-button" onClick={importPaste} disabled={!paste.trim()}>
              <FileUp aria-hidden="true" />导入 CSV
            </button>
            <button type="button" className="outline-button" onClick={importLocal}>
              <FileUp aria-hidden="true" />导入本机记录
            </button>
            <button type="button" className="practice-text-button" onClick={clearRows} disabled={rows.length === 0}>
              <Trash2 aria-hidden="true" />清空
            </button>
            <button type="button" className="practice-text-button" onClick={exportRows} disabled={rows.length === 0}>
              <Download aria-hidden="true" />导出汇总 CSV
            </button>
          </div>

          <StudentIdField
            value={studentId}
            onChange={setStudentId}
            label="本机学生编号（导入本机记录用）"
            hint="只保存在当前浏览器，不会上传；导出时也可在各报告区单独填写。"
          />

          <p className="teacher-notice" role="status">{notice}</p>
        </div>

        <div className="teacher-summary">
          <div className="teacher-block-title">
            <span>聚合结果</span>
            <small>只统计 diagnosed / process-error</small>
          </div>

          <div className="teacher-metrics">
            <div><span>学生数</span><strong>{summary.studentCount}</strong></div>
            <div><span>有效记录</span><strong>{summary.knownCauseRows}</strong></div>
            <div><span>证据不足</span><strong>{summary.unknownRows}</strong></div>
            <div><span>正确 / 跳过</span><strong>{summary.unclassifiedRows}</strong></div>
          </div>

          <div className="teacher-causes">
            <h3>最常见的 3 个错因</h3>
            {summary.topCauses.length === 0 ? (
              <p className="teacher-empty">
                {rows.length === 0
                  ? '还没有导入报告。导入真实 CSV 后，这里才会出现统计。'
                  : '当前记录里没有已确认的错因；证据不足、正确和跳过的记录不计入。'}
              </p>
            ) : (
              summary.topCauses.map((cause, index) => (
                <article key={cause.causeKey} className="teacher-cause">
                  <span className="teacher-cause__rank">0{index + 1}</span>
                  <div>
                    <h4>{cause.label}</h4>
                    {cause.sampleReason && <p>典型描述：{cause.sampleReason}</p>}
                    <div className="teacher-cause__students">
                      <span>学生</span>
                      {cause.studentIds.map((id) => <b key={id}>{id}</b>)}
                    </div>
                    <small>
                      {cause.studentIds.length} 名学生 · {cause.records} 条记录
                      {cause.knowledgePoints.length > 0 ? ` · ${cause.knowledgePoints.join('、')}` : ''}
                    </small>
                  </div>
                </article>
              ))
            )}
          </div>

          <p className="teacher-boundary">
            聚合只依据报告里的真实字段，不推断学生身份，也不把证据不足的记录算成错因。
            数据仅存在本机 localStorage，清空后不可恢复。
          </p>
        </div>
      </div>
    </section>
  );
}
