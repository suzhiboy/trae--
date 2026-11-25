import { questions } from '../data/knowledge';
import type { DiagnosisRecord, SessionReport } from '../types';

/**
 * 教师视图的本地 CSV 层：只处理真实报告，不做跨学生推断，也不上传任何数据。
 */

export const REPORT_CSV_HEADERS = [
  'studentId',
  'source',
  'questionId',
  'question',
  'patternId',
  'status',
  'errorCause',
  'errorCauseKey',
  'knowledgePoint',
  'weakNodeIds',
  'verification',
  'createdAt',
] as const;

export type ReportHeader = typeof REPORT_CSV_HEADERS[number];

export interface ReportRow {
  studentId: string;
  source: 'builtin' | 'freeform';
  questionId: string;
  question: string;
  patternId: string;
  status: string;
  errorCause: string;
  errorCauseKey: string;
  knowledgePoint: string;
  weakNodeIds: string;
  verification: string;
  createdAt: string;
}

export interface TeacherCause {
  causeKey: string;
  label: string;
  sampleReason: string;
  records: number;
  studentIds: string[];
  knowledgePoints: string[];
}

export interface TeacherSummary {
  totalRows: number;
  studentCount: number;
  knownCauseRows: number;
  unknownRows: number;
  unclassifiedRows: number;
  topCauses: TeacherCause[];
}

export interface ParseResult {
  rows: ReportRow[];
  invalidRows: number;
  errors: string[];
}

const statuses = new Set([
  'correct',
  'diagnosed',
  'process-error',
  'unknown',
  'skipped',
  'unanswered',
]);

const headerAliases: Record<ReportHeader, string[]> = {
  studentId: ['studentid', '学号', '学生编号', '编号'],
  source: ['source', '来源'],
  questionId: ['questionid', '题号', '题目编号'],
  question: ['question', '题目', '题干'],
  patternId: ['patternid', '错因编号', '模式编号'],
  status: ['status', '状态', '结论'],
  errorCause: ['errorcause', '错因', '原因', '诊断结论'],
  errorCauseKey: ['errorcausekey', '错因键', '原因键'],
  knowledgePoint: ['knowledgepoint', '知识点'],
  weakNodeIds: ['weaknodeids', '薄弱点', '薄弱知识点'],
  verification: ['verification', '变式', '变式验证'],
  createdAt: ['createdat', '时间', '导出时间'],
};

function cleanKey(value: string): string {
  return value.trim().replace(/[\s，,。；;：:、]/g, '').toLowerCase();
}

export function buildCauseKey(input: {
  questionId?: string;
  patternId?: string;
  knowledgePoint?: string;
  reason?: string;
}): string {
  if (input.questionId?.trim() && input.patternId?.trim()) {
    return `pattern:${input.questionId.trim()}:${input.patternId.trim()}`;
  }
  if (input.knowledgePoint?.trim()) {
    return `kp:${cleanKey(input.knowledgePoint)}`;
  }
  if (input.reason?.trim()) {
    return `reason:${cleanKey(input.reason)}`;
  }
  return '';
}

function causeLabel(row: ReportRow): string {
  if (row.errorCauseKey.startsWith('kp:')) {
    return row.knowledgePoint.trim() || row.errorCause.trim() || row.errorCauseKey;
  }
  return row.errorCause.trim() || row.knowledgePoint.trim() || row.errorCauseKey;
}

export function rowKey(row: ReportRow): string {
  return [
    row.studentId,
    row.questionId,
    row.question,
    row.errorCauseKey,
    row.status,
  ].join('|');
}

export function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: ReportRow[]): string {
  const lines = [REPORT_CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(REPORT_CSV_HEADERS.map((header) => escapeCsv(row[header] ?? '')).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function headerIndex(cells: string[]): Map<ReportHeader, number> | null {
  const normalized = cells.map((cell) => cell.trim().toLowerCase());
  const map = new Map<ReportHeader, number>();
  for (const header of REPORT_CSV_HEADERS) {
    const aliases = headerAliases[header];
    const index = normalized.findIndex((cell) => aliases.includes(cell));
    if (index !== -1) map.set(header, index);
  }
  return map.has('studentId') ? map : null;
}

function isHeaderRow(cells: string[]): boolean {
  const first = cells[0]?.trim().toLowerCase() ?? '';
  return headerAliases.studentId.includes(first);
}

function cell(cells: string[], map: Map<ReportHeader, number>, header: ReportHeader): string {
  const index = map.get(header);
  return index === undefined ? '' : (cells[index] ?? '').trim();
}

export function parseCsv(text: string): ParseResult {
  const table = parseCsvTable(text);
  const errors: string[] = [];
  if (table.length === 0) {
    return { rows: [], invalidRows: 0, errors: ['没有可解析的 CSV 内容。'] };
  }

  let map = headerIndex(table[0]);
  if (!map) {
    return {
      rows: [],
      invalidRows: table.length,
      errors: ['第一行需要表头，至少包含 studentId（或“学号”）。'],
    };
  }

  const rows: ReportRow[] = [];
  let invalidRows = 0;
  let start = 1;

  for (let index = start; index < table.length; index += 1) {
    const cells = table[index];
    if (isHeaderRow(cells)) {
      const nextMap = headerIndex(cells);
      if (nextMap) map = nextMap;
      continue;
    }

    const studentId = cell(cells, map, 'studentId').slice(0, 40);
    const status = cell(cells, map, 'status');
    const question = cell(cells, map, 'question').slice(0, 500);
    const questionId = cell(cells, map, 'questionId').slice(0, 80);
    const errorCause = cell(cells, map, 'errorCause').slice(0, 400);
    const knowledgePoint = cell(cells, map, 'knowledgePoint').slice(0, 80);

    if (!studentId || !statuses.has(status) || (!question && !questionId && !errorCause && !knowledgePoint)) {
      invalidRows += 1;
      if (errors.length < 5) {
        errors.push(`第 ${index + 1} 行缺少学生编号、有效状态或题目信息，未导入。`);
      }
      continue;
    }

    const patternId = cell(cells, map, 'patternId').slice(0, 80);
    const errorCauseKey = (cell(cells, map, 'errorCauseKey')
      || buildCauseKey({ questionId, patternId, knowledgePoint, reason: errorCause }))
      .slice(0, 240);
    const sourceValue = cell(cells, map, 'source').toLowerCase();
    const source = sourceValue === 'builtin' ? 'builtin' : 'freeform';

    rows.push({
      studentId,
      source,
      questionId,
      question,
      patternId,
      status,
      errorCause,
      errorCauseKey,
      knowledgePoint,
      weakNodeIds: cell(cells, map, 'weakNodeIds').slice(0, 300),
      verification: cell(cells, map, 'verification').slice(0, 80),
      createdAt: cell(cells, map, 'createdAt').slice(0, 40),
    });
  }

  return { rows, invalidRows, errors };
}

export function mergeTeacherRows(existing: ReportRow[], incoming: ReportRow[]): ReportRow[] {
  const seen = new Set(existing.map(rowKey));
  const merged = [...existing];
  for (const row of incoming) {
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

/** 读取本机缓存的教师视图数据；结构不合格的条目直接丢弃。 */
export function parseStoredRows(value: unknown): ReportRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ReportRow[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const studentId = typeof row.studentId === 'string' ? row.studentId.slice(0, 40) : '';
    const status = typeof row.status === 'string' ? row.status : '';
    if (!studentId || !statuses.has(status)) return [];
    const text = (key: ReportHeader) => typeof row[key] === 'string' ? row[key] as string : '';
    return [{
      studentId,
      source: row.source === 'builtin' ? 'builtin' : 'freeform',
      questionId: text('questionId'),
      question: text('question'),
      patternId: text('patternId'),
      status,
      errorCause: text('errorCause'),
      errorCauseKey: text('errorCauseKey'),
      knowledgePoint: text('knowledgePoint'),
      weakNodeIds: text('weakNodeIds'),
      verification: text('verification'),
      createdAt: text('createdAt'),
    }];
  });
}

export function aggregateTeacherRows(rows: ReportRow[], top = 3): TeacherSummary {
  const groups = new Map<string, {
    label: string;
    sampleReason: string;
    records: number;
    students: Set<string>;
    points: Set<string>;
  }>();
  let unknownRows = 0;
  let knownCauseRows = 0;

  for (const row of rows) {
    if (row.status === 'unknown') {
      unknownRows += 1;
      continue;
    }
    if ((row.status !== 'diagnosed' && row.status !== 'process-error') || !row.errorCauseKey) {
      continue;
    }
    knownCauseRows += 1;
    const existing = groups.get(row.errorCauseKey);
    if (existing) {
      existing.records += 1;
      existing.students.add(row.studentId);
      if (row.knowledgePoint) existing.points.add(row.knowledgePoint);
      continue;
    }
    groups.set(row.errorCauseKey, {
      label: causeLabel(row),
      sampleReason: row.errorCause,
      records: 1,
      students: new Set([row.studentId]),
      points: new Set(row.knowledgePoint ? [row.knowledgePoint] : []),
    });
  }

  const topCauses = [...groups.entries()]
    .map(([causeKey, group]) => ({
      causeKey,
      label: group.label,
      sampleReason: group.sampleReason !== group.label ? group.sampleReason : '',
      records: group.records,
      studentIds: [...group.students].sort((left, right) => left.localeCompare(right)),
      knowledgePoints: [...group.points],
    }))
    .sort((left, right) => (
      right.studentIds.length - left.studentIds.length
      || right.records - left.records
      || left.label.localeCompare(right.label, 'zh-CN')
    ))
    .slice(0, top);

  return {
    totalRows: rows.length,
    studentCount: new Set(rows.map((row) => row.studentId)).size,
    knownCauseRows,
    unknownRows,
    unclassifiedRows: rows.length - knownCauseRows - unknownRows,
    topCauses,
  };
}

export function rowsFromSessionReport(
  report: SessionReport,
  groupTitle: string,
  studentId: string,
  completedAt = Date.now(),
): ReportRow[] {
  const createdAt = new Date(completedAt).toISOString();
  return report.attempts.map((attempt) => {
    const question = questions.find((item) => item.id === attempt.questionId);
    const diagnosis = attempt.diagnosis;
    const status = diagnosis?.status ?? attempt.kind;
    const errorCause = diagnosis?.reason
      ?? (attempt.kind === 'skipped' ? '跳过，未作答' : attempt.kind === 'unanswered' ? '学生标记不会' : '未生成诊断');
    const knowledgePoint = question?.module ?? groupTitle;
    const patternId = diagnosis?.matchedPatternId ?? '';
    const errorCauseKey = diagnosis
      ? buildCauseKey({
        questionId: attempt.questionId,
        patternId,
        knowledgePoint,
        reason: errorCause,
      })
      : '';

    return {
      studentId,
      source: 'builtin' as const,
      questionId: attempt.questionId,
      question: question?.stem ?? attempt.questionId,
      patternId,
      status,
      errorCause,
      errorCauseKey,
      knowledgePoint,
      weakNodeIds: diagnosis?.weakNodeIds.join('|') ?? '',
      verification: attempt.verification,
      createdAt,
    };
  });
}

export function rowsFromFreeformRecords(
  records: DiagnosisRecord[],
  studentId: string,
): ReportRow[] {
  return records.map((record) => ({
    studentId,
    source: 'freeform' as const,
    questionId: record.questionId ?? '',
    question: record.question,
    patternId: record.patternId ?? '',
    status: record.status,
    errorCause: record.reason,
    errorCauseKey: buildCauseKey({
      questionId: record.questionId ?? undefined,
      patternId: record.patternId ?? undefined,
      knowledgePoint: record.knowledgePoint,
      reason: record.reason,
    }),
    knowledgePoint: record.knowledgePoint,
    weakNodeIds: record.weakNodeIds.join('|'),
    verification: record.verification ?? '',
    createdAt: new Date(record.createdAt).toISOString(),
  }));
}
