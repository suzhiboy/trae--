import { knowledgeEdges, knowledgeNodes, questions } from '../data/knowledge';
import type { DiagnosisResult } from '../types';

interface ErrorPattern {
  answers: string[];
  weakNodeId: string;
  reason: string;
  evidence: string;
  steps: [string, string, string];
}

interface QuestionRule {
  targetNodeId: string;
  correctAnswers: string[];
  correctEvidence: string;
  errorPattern: ErrorPattern;
}

const rules: Record<string, QuestionRule> = {
  'negative-power-parentheses': {
    targetNodeId: 'negative-power',
    correctAnswers: ['9'],
    correctEvidence: '(-3)² = (-3) × (-3) = 9，两个负数相乘结果为正。',
    errorPattern: {
      answers: ['-9'],
      weakNodeId: 'negative-power',
      reason: '可能混淆了负数平方与平方前的负号',
      evidence: '错答 -9 与把 (-3)² 误读为 -(3²) 的结果一致；正确展开应为 (-3) × (-3) = 9。仅凭最终答案仍需结合解题过程确认。',
      steps: [
        '先复习正负数与有理数乘法，确认 (-3) × (-3) = 9。',
        '复习乘方的意义，指出 (-3)² 的底数是 -3、指数是 2。',
        '对比 (-3)² 与 -3²，重做原题并验算结果。',
      ],
    },
  },
  'distributive-expression': {
    targetNodeId: 'distributive-property',
    correctAnswers: ['2x+6', '2*x+6', '6+2x', '6+2*x'],
    correctEvidence: '括号外的 2 分别乘 x 和 3，得到 2x+6；交换相加的两项也得到等价结果。',
    errorPattern: {
      answers: ['2x+3', '2*x+3'],
      weakNodeId: 'distributive-property',
      reason: '可能不完整使用了分配律，漏乘括号内的常数项',
      evidence: '如果括号外的 2 只乘 x、没有乘 3，就会得到 2x+3，与本次错答吻合。仅凭最终答案仍需结合展开过程确认。',
      steps: [
        '先复习有理数乘法和分配律，把 2 分别乘 x 与 3。',
        '练习化简 3(y+4)，写出 3y+12，并检查两项都乘了 3。',
        '重做原题，取 x=1 比较 2(x+3) 与 2x+6，确认两式相等。',
      ],
    },
  },
  'fraction-add': {
    targetNodeId: 'fraction-addition',
    correctAnswers: ['5/6'],
    correctEvidence: '1/2=3/6，1/3=2/6，所以 1/2+1/3=3/6+2/6=5/6。',
    errorPattern: {
      answers: ['2/5'],
      weakNodeId: 'common-denominator',
      reason: '可能没有理解异分母分数相加前需要通分',
      evidence: '把分子 1+1、分母 2+3 分别相加会恰好得到 2/5，与本次错答吻合；这提示可能未统一分数单位，仍需结合过程确认。',
      steps: [
        '复习分数基本性质，把 1/2 和 1/3 分别改写为 3/6 和 2/6。',
        '练习 1/3+1/4，先找公分母 12，再把分子相加。',
        '重做原题，并检查结果 5/6 是否大于原来的两个加数。',
      ],
    },
  },
  'linear-equation-basic': {
    targetNodeId: 'linear-equation',
    correctAnswers: ['4', 'x=4'],
    correctEvidence: '两边同时减 5 得 2x=8，再同时除以 2 得 x=4；代回原方程，两边均为 13。',
    errorPattern: {
      answers: ['8', 'x=8'],
      weakNodeId: 'linear-equation',
      reason: '可能在移项后忘记除以未知数的系数',
      evidence: '两边减 5 后是 2x=8；如果直接把 8 当作 x 的值，就会得到本次错答。该错误路径能解释答案，但仍需结合解题步骤确认。',
      steps: [
        '复习等式基本性质，两边同时减 5，保留等式 2x=8。',
        '练习解 3x+2=11，最后两边同时除以 3，把未知数系数化为 1。',
        '重做原题，把 x=4 代入原方程，验证等式两边都是 13。',
      ],
    },
  },
  'function-value': {
    targetNodeId: 'function-value',
    correctAnswers: ['7', 'f(3)=7'],
    correctEvidence: '把 x=3 代入整个解析式，f(3)=2×3+1=7，常数项 +1 不能遗漏。',
    errorPattern: {
      answers: ['6', 'f(3)=6'],
      weakNodeId: 'function-value',
      reason: '可能在函数代入后遗漏了常数项',
      evidence: '只计算 2×3 而不加常数项 1，恰好得到 6，与本次错答吻合。仅凭最终答案仍需结合代入过程确认。',
      steps: [
        '复习函数概念，说明 f(3) 是把 x=3 代入整个解析式。',
        '练习已知 g(x)=3x-2 求 g(2)，保留常数项并得到 4。',
        '重做原题，完整写出 f(3)=2×3+1=7，再检查每一项。',
      ],
    },
  },
  'negative-power-precedence': {
    targetNodeId: 'operation-precedence',
    correctAnswers: ['-9'],
    correctEvidence: '原式没有括号，应先计算 3²=9，再取相反数，所以 -3²=-9。',
    errorPattern: {
      answers: ['9'],
      weakNodeId: 'operation-precedence',
      reason: '可能没有理解乘方与负号的运算优先级',
      evidence: '把原式误当成 (-3)² 会得到 9，与本次错答吻合；原式的底数是 3，负号应在乘方之后处理，仍需结合过程确认。',
      steps: [
        '按路径复习乘方意义与负数乘方，区分底数 3 和底数 -3。',
        '对比 (-3)²=9 与 -3²=-(3²)=-9，标出两式的底数。',
        '重做原题，再计算 -2² 和 (-2)²，检查是否掌握运算顺序。',
      ],
    },
  },
};

const nodeIds = new Set(knowledgeNodes.map((node) => node.id));
const nodeLabels = new Map(knowledgeNodes.map((node) => [node.id, node.label]));
const prerequisiteIds = new Map(knowledgeNodes.map((node) => [node.id, [] as string[]]));

for (const edge of knowledgeEdges) {
  if (prerequisiteIds.has(edge.target) && nodeIds.has(edge.source)) {
    prerequisiteIds.get(edge.target)?.push(edge.source);
  }
}

function normalizeAnswer(answer: string): string {
  return answer
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/\s+/g, '')
    .replace(/^(?:答案|结果|答)(?:是|为)?[:=]?/, '')
    .replace(/^=/, '')
    .replace(/^\+(?=\d)/, '');
}

export function buildLearningPath(weakNodeIds: string[]): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      throw new Error(`知识图谱存在循环依赖：${nodeId}`);
    }

    visiting.add(nodeId);
    for (const prerequisiteId of prerequisiteIds.get(nodeId) ?? []) {
      visit(prerequisiteId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    path.push(nodeId);
  }

  for (const nodeId of weakNodeIds) {
    if (nodeIds.has(nodeId)) visit(nodeId);
  }

  return path;
}

function correctResult(rule: QuestionRule): DiagnosisResult {
  return {
    isCorrect: true,
    source: 'rules',
    reason: '答案正确，暂未发现本题相关薄弱点',
    evidence: rule.correctEvidence,
    weakNodeIds: [],
    learningPathIds: [],
    steps: [
      '保留本次解题过程，作为同类题的复习样例。',
      '改变题目中的一个数字再做一遍，检查方法是否稳定。',
      '继续用代入或逆运算验算，本题不需要生成薄弱知识点。',
    ],
    confidence: 'high',
  };
}

function unknownResult(rule?: QuestionRule): DiagnosisResult {
  const targetLabel = rule ? nodeLabels.get(rule.targetNodeId) : undefined;
  return {
    isCorrect: false,
    source: 'rules',
    reason: '暂时无法准确判断错误根因',
    evidence: rule
      ? '当前答案未匹配本题已知的典型错误模式。请补充中间解题步骤，避免仅凭一个陌生错答推断确定错因。'
      : '本地题库中未找到该题目，无法使用已有规则诊断。请选择题库中的题目或补充更多题目信息。',
    weakNodeIds: [],
    learningPathIds: rule ? buildLearningPath([rule.targetNodeId]) : [],
    steps: rule
      ? [
          '先核对原题和答案，确认没有漏写符号、系数或常数项。',
          `可以检查「${targetLabel}」，但这只是复习方向，并不表示已确认该知识点薄弱。`,
          '写出至少一步中间过程后重新诊断，以便缩小错误原因。',
        ]
      : [
          '请核对题目是否已加入本地题库，以及题目编号是否正确。',
          '写出完整的题目和关键解题步骤，避免信息不足。',
          '将题目和步骤交给老师进一步检查，不把当前结果视为确定的知识漏洞。',
        ],
    confidence: 'low',
  };
}

export function diagnose(questionId: string, studentAnswer: string): DiagnosisResult {
  const question = questions.find((item) => item.id === questionId);
  const rule = question ? rules[questionId] : undefined;
  if (!rule) return unknownResult();

  const normalizedAnswer = normalizeAnswer(studentAnswer);
  if (rule.correctAnswers.includes(normalizedAnswer)) {
    return correctResult(rule);
  }

  const pattern = rule.errorPattern;
  if (!pattern.answers.includes(normalizedAnswer)) {
    return unknownResult(rule);
  }

  const weakNodeIds = [pattern.weakNodeId];
  return {
    isCorrect: false,
    source: 'rules',
    reason: pattern.reason,
    evidence: pattern.evidence,
    weakNodeIds,
    learningPathIds: buildLearningPath(weakNodeIds),
    steps: [...pattern.steps],
    confidence: 'high',
  };
}
