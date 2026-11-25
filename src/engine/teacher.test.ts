import { describe, expect, it } from 'vitest';
import type { DiagnosisRecord, PracticeAttempt } from '../types';
import { diagnoseAttempt } from './attempt';
import { summarizeSession } from './session';
import {
  aggregateTeacherRows,
  buildCauseKey,
  mergeTeacherRows,
  parseCsv,
  parseStoredRows,
  rowKey,
  rowsFromFreeformRecords,
  rowsFromSessionReport,
  toCsv,
  type ReportRow,
} from './teacher';

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    studentId: '001',
    source: 'builtin',
    questionId: 'q1',
    question: '已知 f(x)=x²-2x+3，求 f(-1)',
    patternId: 'symbol',
    status: 'diagnosed',
    errorCause: '一次项符号写错',
    errorCauseKey: 'pattern:q1:symbol',
    knowledgePoint: '函数值求解',
    weakNodeIds: 'function-value',
    verification: 'pending',
    createdAt: '2026-11-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('教师视图 CSV：导出与解析', () => {
  it('导出带 BOM，解析后字段不变，逗号/引号/换行都能还原', () => {
    const original = row({
      question: '已知 f(x)=x²-2x+3，求 f(-1)，并说明"符号"',
      errorCause: '一次项符号写错，\n把 -2×(-1) 写成 -2',
    });
    const csv = toCsv([original]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    const parsed = parseCsv(csv);
    expect(parsed.invalidRows).toBe(0);
    expect(parsed.rows).toEqual([original]);
  });

  it('支持连续粘贴多个带表头的报告块', () => {
    const header = 'studentId,source,questionId,question,patternId,status,errorCause,errorCauseKey,knowledgePoint,weakNodeIds,verification,createdAt';
    const blockA = `${header}\n001,builtin,q1,题目一,p1,diagnosed,符号错,pattern:q1:p1,函数,function-value,pending,2026-11-25`;
    const blockB = `${header}\n002,builtin,q1,题目一,p1,diagnosed,符号错,pattern:q1:p1,函数,function-value,pending,2026-11-25`;
    const parsed = parseCsv(`${blockA}\n${blockB}`);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((item) => item.studentId)).toEqual(['001', '002']);
  });

  it('缺少学生编号、状态或题目的行被明确计为无效', () => {
    const csv = [
      'studentId,status,question,errorCause',
      '001,diagnosed,题目一,符号错',
      ',diagnosed,题目二,符号错',
      '002,not-a-status,题目三,符号错',
      '003,unknown,,',
    ].join('\n');
    const parsed = parseCsv(csv);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.invalidRows).toBe(3);
    expect(parsed.errors[0]).toContain('未导入');
  });

  it('没有表头时拒绝导入，而不是猜列顺序', () => {
    const parsed = parseCsv('001,builtin,q1,题目');
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.invalidRows).toBe(1);
    expect(parsed.errors[0]).toContain('表头');
  });

  it('重复导入同一行会去重', () => {
    const first = row();
    const duplicate = row();
    const merged = mergeTeacherRows([first], [duplicate]);

    expect(merged).toHaveLength(1);
    expect(rowKey(first)).toBe(rowKey(duplicate));
  });

  it('本机缓存的非法行会被丢弃', () => {
    const rows = parseStoredRows([
      row(),
      { studentId: '', status: 'diagnosed' },
      { studentId: '002', status: 'not-a-status' },
      'bad',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe('001');
  });
});

describe('教师视图聚合：Top 3 错因与学生编号', () => {
  it('按不同学生数排序，排除证据不足与正确记录', () => {
    const rows = [
      row({ studentId: '001' }),
      row({ studentId: '002' }),
      row({ studentId: '003' }),
      row({
        studentId: '001',
        patternId: 'addition',
        errorCauseKey: 'pattern:q1:addition',
        errorCause: '最后一步加法写错',
        status: 'process-error',
      }),
      row({
        studentId: '002',
        patternId: 'addition',
        errorCauseKey: 'pattern:q1:addition',
        errorCause: '最后一步加法写错',
        status: 'process-error',
      }),
      row({
        studentId: '003',
        questionId: '',
        patternId: '',
        status: 'diagnosed',
        errorCause: '最后一步加法写错',
        errorCauseKey: 'kp:函数值求解',
        knowledgePoint: '函数值求解',
      }),
      row({ studentId: '003', status: 'unknown', errorCauseKey: 'kp:证据不足' }),
      row({ studentId: '001', status: 'correct', errorCauseKey: '' }),
    ];
    const summary = aggregateTeacherRows(rows);

    expect(summary.studentCount).toBe(3);
    expect(summary.knownCauseRows).toBe(6);
    expect(summary.unknownRows).toBe(1);
    expect(summary.unclassifiedRows).toBe(1);
    expect(summary.topCauses).toHaveLength(3);
    expect(summary.topCauses[0].studentIds).toEqual(['001', '002', '003']);
    expect(summary.topCauses[0].label).toBe('一次项符号写错');
    expect(summary.topCauses[1].studentIds).toEqual(['001', '002']);
    expect(summary.topCauses[2].label).toBe('函数值求解');
    expect(summary.topCauses[2].sampleReason).toBe('最后一步加法写错');
  });

  it('没有有效错因时返回空 Top3，不补默认项', () => {
    const summary = aggregateTeacherRows([
      row({ status: 'unknown' }),
      row({ status: 'skipped', errorCauseKey: '' }),
    ]);

    expect(summary.topCauses).toEqual([]);
    expect(summary.knownCauseRows).toBe(0);
  });
});

describe('报告转 CSV 行', () => {
  it('内置题会话报告保留题号、错因模式与薄弱节点', () => {
    const attempt: PracticeAttempt = {
      questionId: 'function-negative-input',
      kind: 'answered',
      finalAnswer: '2',
      steps: ['f(-1)=1-2+3=2'],
      elapsedSeconds: 20,
      diagnosis: diagnoseAttempt({
        questionId: 'function-negative-input',
        finalAnswer: '2',
        steps: ['f(-1)=1-2+3=2'],
      }),
      verification: 'pending',
      selectedVariantOptionId: null,
      variantAttempts: 0,
    };
    const report = summarizeSession([attempt]);
    const rows = rowsFromSessionReport(report, '函数与方程', '2026001', Date.parse('2026-11-25T00:00:00Z'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentId: '2026001',
      source: 'builtin',
      questionId: 'function-negative-input',
      status: 'diagnosed',
      knowledgePoint: '函数',
    });
    expect(rows[0].errorCauseKey).toContain('pattern:function-negative-input:');
    expect(rows[0].weakNodeIds).toBe('function-value');
    expect(rows[0].createdAt).toBe('2026-11-25T00:00:00.000Z');
  });

  it('自由题记录使用知识点键，保留 AI 核验结论', () => {
    const record: DiagnosisRecord = {
      id: 'r1',
      createdAt: Date.parse('2026-11-25T01:00:00Z'),
      source: 'ai',
      question: '已知 f(x)=x²-3x+2，求 f(2)',
      finalAnswer: '4',
      questionId: null,
      patternId: null,
      status: 'diagnosed',
      reason: '最后一步加法算错',
      knowledgePoint: '函数值求解',
      knowledgeNodeId: 'function-value',
      weakNodeIds: ['function-value'],
      verification: 'consistent',
    };
    const rows = rowsFromFreeformRecords([record], '2026002');

    expect(rows[0]).toMatchObject({
      studentId: '2026002',
      source: 'freeform',
      status: 'diagnosed',
      errorCauseKey: 'kp:函数值求解',
      verification: 'consistent',
    });
    expect(rows[0].weakNodeIds).toBe('function-value');
  });

  it('错因键优先用题号+模式，其次知识点，最后原因文本', () => {
    expect(buildCauseKey({ questionId: 'q1', patternId: 'p1', knowledgePoint: '函数' }))
      .toBe('pattern:q1:p1');
    expect(buildCauseKey({ knowledgePoint: '函数 值求解' })).toBe('kp:函数值求解');
    expect(buildCauseKey({ reason: '符号写错。' })).toBe('reason:符号写错');
    expect(buildCauseKey({})).toBe('');
  });
});
