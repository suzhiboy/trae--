import { describe, expect, it } from 'vitest';
import { knowledgeEdges, knowledgeNodes, questions } from '../data/knowledge';
import { buildLearningPath, diagnose } from './diagnose';

const typicalCases = [
  {
    questionId: 'function-negative-input',
    answer: '2',
    weakNodeId: 'function-value',
    reason: '符号',
    path: ['set-basics', 'function-concept', 'function-value'],
  },
  {
    questionId: 'quadratic-equation-roots',
    answer: 'x=-2或x=-3',
    weakNodeId: 'quadratic-equation',
    reason: '因式分解',
    path: ['set-basics', 'function-concept', 'quadratic-function', 'factorization', 'quadratic-equation'],
  },
  {
    questionId: 'same-base-powers',
    answer: 'a¹²',
    weakNodeId: 'power-rules',
    reason: '指数相乘',
    path: ['power-rules'],
  },
  {
    questionId: 'logarithm-evaluation',
    answer: '4',
    weakNodeId: 'log-definition',
    reason: '除以底数',
    path: ['set-basics', 'function-concept', 'power-rules', 'exponential-function', 'log-definition'],
  },
  {
    questionId: 'arithmetic-sequence-term',
    answer: 'a₅=13',
    weakNodeId: 'arithmetic-sequence',
    reason: '间隔数',
    path: ['sequence-concept', 'arithmetic-sequence'],
  },
  {
    questionId: 'classical-probability-coins',
    answer: '1/3',
    weakNodeId: 'classical-probability',
    reason: '等可能',
    path: ['set-basics', 'sample-space', 'classical-probability'],
  },
];

const correctCases = [
  {
    questionId: 'function-negative-input',
    answers: ['6', 'f(-1)=6', 'Ｆ（－１）＝６', '答案：+6'],
  },
  {
    questionId: 'quadratic-equation-roots',
    answers: ['x=2或x=3', 'x=3或x=2', 'x=2,x=3', 'x₁=2,x₂=3', '解集为{2,3}'],
  },
  {
    questionId: 'same-base-powers',
    answers: ['a^7', 'a⁷', 'a**7', 'Ａ＾７'],
  },
  {
    questionId: 'logarithm-evaluation',
    answers: ['3', 'log_2(8)=3', 'log₂8=3', 'ｌｏｇ₂（８）＝３'],
  },
  {
    questionId: 'arithmetic-sequence-term',
    answers: ['11', 'a5=11', 'ａ₅＝１１', '答案：+11'],
  },
  {
    questionId: 'classical-probability-coins',
    answers: ['1/2', '１／２', '0.5', '50%', '５０％'],
  },
];

describe('六种高中数学典型错误模式', () => {
  it.each(typicalCases)('$questionId 能识别 $answer', ({ questionId, answer, weakNodeId, reason, path }) => {
    const result = diagnose(questionId, answer);

    expect(result.isCorrect).toBe(false);
    expect(result.source).toBe('rules');
    expect(result.reason).toContain(reason);
    expect(result.evidence.length).toBeGreaterThan(20);
    expect(result.weakNodeIds).toEqual([weakNodeId]);
    expect(result.learningPathIds).toEqual(path);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[2]).toContain('追问');
    expect(result.confidence).toBe('medium');
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
    expect(result.learningPathIds).toEqual(path);
    expect(result.evidence).toContain('未匹配');
    expect(result.steps).toHaveLength(3);
  });

  it('未知题目不会编造知识点', () => {
    const result = diagnose('not-in-question-bank', '3');

    expect(result.reason).toBe('暂时无法准确判断错误根因');
    expect(result.confidence).toBe('low');
    expect(result.weakNodeIds).toEqual([]);
    expect(result.learningPathIds).toEqual([]);
  });

  it.each(['', '   ', '。'])('空或无效答案 %j 不会产生高置信度诊断', (answer) => {
    const result = diagnose('classical-probability-coins', answer);

    expect(result.isCorrect).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.weakNodeIds).toEqual([]);
  });

  it.each([undefined, null])('运行时缺失答案 %s 不会导致诊断崩溃', (answer) => {
    const result = diagnose('function-negative-input', answer as unknown as string);

    expect(result.isCorrect).toBe(false);
    expect(result.reason).toBe('暂时无法准确判断错误根因');
    expect(result.confidence).toBe('low');
    expect(result.weakNodeIds).toEqual([]);
  });
});

describe('学习路径与高中知识依赖图', () => {
  it('去重、过滤无效 ID，并保留共享前置节点的一次出现', () => {
    expect(buildLearningPath(['log-definition', 'log-operations', 'log-definition', 'missing-node'])).toEqual([
      'set-basics',
      'function-concept',
      'power-rules',
      'exponential-function',
      'log-definition',
      'log-operations',
    ]);
    expect(buildLearningPath(['missing-node'])).toEqual([]);
  });

  it('多个独立薄弱点按依赖顺序合并且不重复', () => {
    expect(buildLearningPath(['arithmetic-sequence', 'classical-probability', 'arithmetic-sequence'])).toEqual([
      'sequence-concept',
      'arithmetic-sequence',
      'set-basics',
      'sample-space',
      'classical-probability',
    ]);
  });

  it('包含指定的 18 个高中数学知识点，节点 ID 唯一且边有效', () => {
    const expectedLabels = [
      '集合基础',
      '集合运算',
      '函数概念',
      '函数值求解',
      '二次函数',
      '因式分解',
      '一元二次方程',
      '幂的运算法则',
      '指数函数',
      '对数定义',
      '对数运算',
      '弧度制',
      '特殊角三角函数',
      '三角函数性质',
      '数列概念',
      '等差数列',
      '样本空间',
      '古典概率',
    ];
    const ids = knowledgeNodes.map((node) => node.id);
    const idSet = new Set(ids);

    expect(knowledgeNodes.map((node) => node.label)).toEqual(expectedLabels);
    expect(idSet.size).toBe(18);
    for (const edge of knowledgeEdges) {
      expect(idSet.has(edge.source)).toBe(true);
      expect(idSet.has(edge.target)).toBe(true);
      expect(edge.source).not.toBe(edge.target);
    }
  });

  it('全图无环、路径遵循前置依赖且诊断 ID 均有效', () => {
    const allIds = knowledgeNodes.map((node) => node.id);
    const idSet = new Set(allIds);
    const path = buildLearningPath(allIds);
    const positions = new Map(path.map((id, index) => [id, index]));

    expect(path).toHaveLength(18);
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
  it('导出六道高中数学题、图谱和可按题号调用的诊断函数', () => {
    expect(questions).toHaveLength(6);
    expect(knowledgeNodes).toHaveLength(18);
    expect(knowledgeEdges.length).toBeGreaterThan(0);

    for (const question of questions) {
      expect(question.subject).toBe('高中数学');
      const result = diagnose(question.id, question.correctAnswer);
      expect(result.isCorrect).toBe(true);
      expect(result.source).toBe('rules');
    }
  });
});
