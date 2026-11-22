import { describe, expect, it } from 'vitest';
import { knowledgeEdges, knowledgeNodes, questions } from '../data/knowledge';
import { buildLearningPath, diagnose } from './diagnose';

const typicalCases = [
  {
    questionId: 'negative-power-parentheses',
    answer: '-9',
    weakNodeId: 'negative-power',
    reason: '负数平方',
    path: ['signed-numbers', 'rational-multiplication', 'exponent-meaning', 'negative-power'],
  },
  {
    questionId: 'distributive-expression',
    answer: '2x+3',
    weakNodeId: 'distributive-property',
    reason: '分配律',
    path: ['signed-numbers', 'rational-multiplication', 'distributive-property'],
  },
  {
    questionId: 'fraction-add',
    answer: '2/5',
    weakNodeId: 'common-denominator',
    reason: '通分',
    path: ['fraction-basic-property', 'common-denominator'],
  },
  {
    questionId: 'linear-equation-basic',
    answer: 'x=8',
    weakNodeId: 'linear-equation',
    reason: '系数',
    path: ['equality-properties', 'linear-equation'],
  },
  {
    questionId: 'function-value',
    answer: '6',
    weakNodeId: 'function-value',
    reason: '常数项',
    path: ['function-concept', 'function-value'],
  },
  {
    questionId: 'negative-power-precedence',
    answer: '9',
    weakNodeId: 'operation-precedence',
    reason: '优先级',
    path: [
      'signed-numbers',
      'rational-multiplication',
      'exponent-meaning',
      'negative-power',
      'operation-precedence',
    ],
  },
];

const correctCases = [
  {
    questionId: 'negative-power-parentheses',
    answers: ['9', ' ９ ', '答案：9', '+9'],
  },
  {
    questionId: 'distributive-expression',
    answers: ['2x+6', '2x + 6', '2×x+6', '6+2x'],
  },
  {
    questionId: 'fraction-add',
    answers: ['5/6', ' ５／６ ', '答案为5/6'],
  },
  {
    questionId: 'linear-equation-basic',
    answers: ['4', 'x=4', ' Ｘ ＝ ４ ', '答案：x=4'],
  },
  {
    questionId: 'function-value',
    answers: ['7', 'f(3)=7', 'Ｆ（３）＝７'],
  },
  {
    questionId: 'negative-power-precedence',
    answers: ['-9', '−9', '－9'],
  },
];

describe('六种典型错误模式', () => {
  it.each(typicalCases)('$questionId 能识别 $answer', ({ questionId, answer, weakNodeId, reason, path }) => {
    const result = diagnose(questionId, answer);

    expect(result.isCorrect).toBe(false);
    expect(result.source).toBe('rules');
    expect(result.reason).toContain(reason);
    expect(result.evidence.length).toBeGreaterThan(20);
    expect(result.weakNodeIds).toEqual([weakNodeId]);
    expect(result.learningPathIds).toEqual(path);
    expect(result.steps).toHaveLength(3);
    expect(result.confidence).toBe('high');
  });
});

describe('正确答案保护', () => {
  it.each(correctCases)('$questionId 的正确答案及常见格式不会误判', ({ questionId, answers }) => {
    for (const answer of answers) {
      const result = diagnose(questionId, answer);

      expect(result.isCorrect).toBe(true);
      expect(result.source).toBe('rules');
      expect(result.confidence).toBe('high');
      expect(result.weakNodeIds).toEqual([]);
      expect(result.learningPathIds).toEqual([]);
      expect(result.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe('不确定性与输入边界', () => {
  it.each(typicalCases)('$questionId 的未知错答返回低置信度', ({ questionId, path }) => {
    const result = diagnose(questionId, '无法识别的答案');

    expect(result.isCorrect).toBe(false);
    expect(result.source).toBe('rules');
    expect(result.reason).toBe('暂时无法准确判断错误根因');
    expect(result.confidence).toBe('low');
    expect(result.weakNodeIds).toEqual([]);
    const expectedPath = questionId === 'fraction-add' ? [...path, 'fraction-addition'] : path;
    expect(result.learningPathIds).toEqual(expectedPath);
    expect(result.evidence).toContain('未匹配');
    expect(result.steps).toHaveLength(3);
  });

  it('未知题目不会编造知识点', () => {
    const result = diagnose('not-in-question-bank', '9');

    expect(result.reason).toBe('暂时无法准确判断错误根因');
    expect(result.confidence).toBe('low');
    expect(result.weakNodeIds).toEqual([]);
    expect(result.learningPathIds).toEqual([]);
  });

  it.each(['', '   ', '。'])('空或无效答案 %j 不会产生高置信度诊断', (answer) => {
    const result = diagnose('fraction-add', answer);

    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.weakNodeIds).toEqual([]);
  });
});

describe('学习路径与依赖图', () => {
  it('去重、过滤无效 ID，并保留共享前置节点的一次出现', () => {
    expect(
      buildLearningPath(['negative-power', 'operation-precedence', 'negative-power', 'missing-node']),
    ).toEqual([
      'signed-numbers',
      'rational-multiplication',
      'exponent-meaning',
      'negative-power',
      'operation-precedence',
    ]);
    expect(buildLearningPath(['missing-node'])).toEqual([]);
  });

  it('多个独立薄弱点按依赖顺序合并且不重复', () => {
    expect(buildLearningPath(['linear-equation', 'function-value', 'linear-equation'])).toEqual([
      'equality-properties',
      'linear-equation',
      'function-concept',
      'function-value',
    ]);
  });

  it('14 个节点 ID 唯一，所有边有效且无自环', () => {
    const ids = knowledgeNodes.map((node) => node.id);
    const idSet = new Set(ids);

    expect(knowledgeNodes).toHaveLength(14);
    expect(idSet.size).toBe(14);
    for (const edge of knowledgeEdges) {
      expect(idSet.has(edge.source)).toBe(true);
      expect(idSet.has(edge.target)).toBe(true);
      expect(edge.source).not.toBe(edge.target);
    }
  });

  it('全图无环且所有诊断 ID 都引用真实节点', () => {
    const allIds = knowledgeNodes.map((node) => node.id);
    const idSet = new Set(allIds);
    const path = buildLearningPath(allIds);
    const positions = new Map(path.map((id, index) => [id, index]));

    expect(path).toHaveLength(14);
    for (const edge of knowledgeEdges) {
      expect(positions.get(edge.source)!).toBeLessThan(positions.get(edge.target)!);
    }

    for (const testCase of typicalCases) {
      const diagnosed = diagnose(testCase.questionId, testCase.answer);
      const unknown = diagnose(testCase.questionId, '未知错答');
      for (const id of [...diagnosed.weakNodeIds, ...diagnosed.learningPathIds, ...unknown.learningPathIds]) {
        expect(idSet.has(id)).toBe(true);
      }
    }
  });
});

describe('前端模块导入契约', () => {
  it('导出六道题、图谱和可按题号调用的诊断函数', () => {
    expect(questions).toHaveLength(6);
    expect(knowledgeNodes.length).toBeGreaterThanOrEqual(14);
    expect(knowledgeEdges.length).toBeGreaterThan(0);

    for (const question of questions) {
      const result = diagnose(question.id, question.correctAnswer);
      expect(result.isCorrect).toBe(true);
      expect(result.source).toBe('rules');
    }
  });
});
