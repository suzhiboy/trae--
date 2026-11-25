import { describe, expect, it } from 'vitest';
import type { DiagnosisRecord } from '../types';
import { addFreeformRecord, FREEFORM_RECORDS_LIMIT } from '../services/freeformRecords';

function record(overrides: Partial<DiagnosisRecord> = {}): DiagnosisRecord {
  return {
    id: 'record-1',
    createdAt: 1,
    source: 'ai',
    question: '已知 f(x)=x²-2x+3，求 f(-1)',
    finalAnswer: '2',
    questionId: null,
    patternId: null,
    status: 'diagnosed',
    reason: '一次项符号写错',
    knowledgePoint: '函数值求解',
    knowledgeNodeId: 'function-value',
    weakNodeIds: ['function-value'],
    verification: 'consistent',
    ...overrides,
  };
}

describe('自由题诊断记录', () => {
  it('同一道题只保留最近一次诊断，新的放在最前', () => {
    const first = record({ id: 'first', finalAnswer: '2' });
    const second = record({ id: 'second', finalAnswer: '6', status: 'correct' });
    const records = addFreeformRecord(addFreeformRecord([], first), second);

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('second');
    expect(records[0].finalAnswer).toBe('6');
  });

  it('题干归一化后相同也视为同一道题', () => {
    const base = record({ id: 'base', question: '求 f(-1)' });
    const padded = record({ id: 'padded', question: ' 求  f(-1) ' });
    const records = addFreeformRecord([base], padded);

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('padded');
  });

  it('不同题目都保留，并限制最大条数', () => {
    let records: DiagnosisRecord[] = [];
    for (let index = 0; index < FREEFORM_RECORDS_LIMIT + 5; index += 1) {
      records = addFreeformRecord(records, record({
        id: `record-${index}`,
        question: `第 ${index} 题：求 f(${index})`,
      }));
    }

    expect(records).toHaveLength(FREEFORM_RECORDS_LIMIT);
    expect(records[0].id).toBe(`record-${FREEFORM_RECORDS_LIMIT + 4}`);
    expect(records.some((item) => item.id === 'record-0')).toBe(false);
  });
});
