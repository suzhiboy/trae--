import { Download } from 'lucide-react';
import { toCsv, type ReportRow } from '../../engine/teacher';
import { useStudentId } from '../../hooks/useStudentId';
import { downloadCsvFile, safeFilenamePart } from '../../services/downloadCsv';
import StudentIdField from './StudentIdField';

export default function CsvExportBar({
  buildRows,
  filenamePrefix,
  note = 'CSV 只包含真实作答，不上传服务器。',
  testId,
}: {
  buildRows: (studentId: string) => ReportRow[];
  filenamePrefix: string;
  note?: string;
  testId?: string;
}) {
  const [studentId, setStudentId] = useStudentId();
  const trimmed = studentId.trim();

  const exportCsv = () => {
    if (!trimmed) return;
    const rows = buildRows(trimmed);
    if (rows.length === 0) return;
    const filename = `${safeFilenamePart(filenamePrefix)}-${safeFilenamePart(trimmed)}.csv`;
    downloadCsvFile(filename, toCsv(rows));
  };

  return (
    <div className="csv-export-bar">
      <StudentIdField
        value={studentId}
        onChange={setStudentId}
        label="学生编号（仅本机）"
      />
      <button
        type="button"
        className="outline-button"
        onClick={exportCsv}
        disabled={!trimmed}
        data-testid={testId}
      >
        <Download aria-hidden="true" />导出 CSV
      </button>
      <small>{trimmed ? note : '先填写学号/编号；系统不会编造编号，也不会上传。'}</small>
    </div>
  );
}
