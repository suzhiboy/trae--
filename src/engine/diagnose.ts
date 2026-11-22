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
  'function-negative-input': {
    targetNodeId: 'function-value',
    correctAnswers: ['6', 'f(-1)=6'],
    correctEvidence: 'f(-1)=(-1)²-2×(-1)+3=1+2+3=6，代入后 -2x 的值为 +2。',
    errorPattern: {
      answers: ['2', 'f(-1)=2'],
      weakNodeId: 'function-value',
      reason: '负数代入函数时，可能没有正确处理一次项的符号',
      evidence: '如果代入 x=-1 后仍把 -2x 算成 -2，就会得到 1-2+3=2，与本次错答吻合。该模式只是错因假设，仍需结合代入过程确认。',
      steps: [
        '复习函数值求解，把 x=-1 用括号代入解析式的每一个 x。',
        '单独计算 -2×(-1)=+2，再按顺序合并 1+2+3。',
        '追问：若 g(x)=x²-4x+1，求 g(-2)，并写出 -4x 代入后的符号。',
      ],
    },
  },
  'quadratic-equation-roots': {
    targetNodeId: 'quadratic-equation',
    correctAnswers: [
      'x=2,x=3',
      'x=3,x=2',
      '2,3',
      '3,2',
      'x1=2,x2=3',
      'x1=3,x2=2',
      '{2,3}',
      '{3,2}',
    ],
    correctEvidence: 'x²-5x+6=(x-2)(x-3)，所以 x=2 或 x=3；两根之和为 5、两根之积为 6。',
    errorPattern: {
      answers: [
        'x=-2,x=-3',
        'x=-3,x=-2',
        '-2,-3',
        '-3,-2',
        'x1=-2,x2=-3',
        'x1=-3,x2=-2',
        '{-2,-3}',
        '{-3,-2}',
      ],
      weakNodeId: 'quadratic-equation',
      reason: '一元二次方程求根时，可能混淆了因式分解中的符号',
      evidence: '把原式误分解为 (x+2)(x+3) 会得到 -2、-3，但展开后是 x²+5x+6，并非原多项式。错答与该路径吻合，仍需结合分解步骤确认。',
      steps: [
        '复习因式分解，寻找和为 -5、积为 6 的两个数 -2 和 -3。',
        '写出 (x-2)(x-3)，重新展开检查是否等于 x²-5x+6。',
        '追问：用因式分解求 x²-7x+12=0 的根，并用两根之和、之积检查。',
      ],
    },
  },
  'same-base-powers': {
    targetNodeId: 'power-rules',
    correctAnswers: ['a^7'],
    correctEvidence: '同底数幂相乘，底数不变、指数相加：a³·a⁴=a^(3+4)=a^7。',
    errorPattern: {
      answers: ['a^12'],
      weakNodeId: 'power-rules',
      reason: '同底数幂相乘时，可能把指数相加误用为指数相乘',
      evidence: '指数 3×4=12 恰好得到 a^12；但 a³·a⁴ 表示 3 个 a 与 4 个 a 相乘，共 7 个 a。仅凭结果仍需结合列式确认。',
      steps: [
        '复习幂的意义，把 a³·a⁴ 展开为 (a·a·a)·(a·a·a·a)。',
        '归纳同底数幂乘法法则：底数不变，指数相加，而不是相乘。',
        '追问：计算 a²·a⁵，并用展开式解释为什么结果是 a^7。',
      ],
    },
  },
  'logarithm-evaluation': {
    targetNodeId: 'log-definition',
    correctAnswers: ['3', 'log_2(8)=3', 'log2(8)=3', 'log28=3'],
    correctEvidence: '设 log₂8=x，则 2^x=8=2³，所以 x=3。',
    errorPattern: {
      answers: ['4', 'log_2(8)=4', 'log2(8)=4', 'log28=4'],
      weakNodeId: 'log-definition',
      reason: '对数求值时，可能把对数误解为真数除以底数',
      evidence: '8÷2=4 与本次错答吻合；但 log₂8 要寻找的是“2 的多少次方等于 8”，不是做除法。该解释仍需结合转化步骤确认。',
      steps: [
        '复习对数定义，把 log₂8=x 转化为指数式 2^x=8。',
        '将 8 写成 2³，比较底数相同的指数得到 x=3。',
        '追问：计算 log₃9，先写出对应的指数式，再给出结果。',
      ],
    },
  },
  'arithmetic-sequence-term': {
    targetNodeId: 'arithmetic-sequence',
    correctAnswers: ['11', 'a5=11'],
    correctEvidence: '等差数列通项为 aₙ=a₁+(n-1)d，所以 a₅=3+(5-1)×2=11。',
    errorPattern: {
      answers: ['13', 'a5=13'],
      weakNodeId: 'arithmetic-sequence',
      reason: '使用等差数列通项时，可能把间隔数 n-1 误算为 n',
      evidence: '直接计算 3+5×2 会得到 13，与本次错答吻合；从第 1 项到第 5 项只有 4 个公差间隔。仍需结合项数计算过程确认。',
      steps: [
        '复习数列项与序号，逐项写出 3、5、7、9、11，观察四个间隔。',
        '使用 aₙ=a₁+(n-1)d，代入 a₁=3、n=5、d=2。',
        '追问：等差数列首项为 4、公差为 3，求第 4 项，并说明有几个公差间隔。',
      ],
    },
  },
  'classical-probability-coins': {
    targetNodeId: 'classical-probability',
    correctAnswers: ['1/2', '0.5', '50%'],
    correctEvidence: '样本空间为 {正正, 正反, 反正, 反反}，四个结果等可能，其中两个恰好一枚正面，概率为 2/4=1/2。',
    errorPattern: {
      answers: ['1/3'],
      weakNodeId: 'classical-probability',
      reason: '求古典概率时，可能把不等可能的正面个数当作等可能基本结果',
      evidence: '把“0、1、2 枚正面”三种情况直接视为等可能，会得到 1/3；但“恰好一枚正面”包含正反、反正两个基本结果。该假设需结合样本空间确认。',
      steps: [
        '复习样本空间，按顺序列出正正、正反、反正、反反四个等可能结果。',
        '使用古典概率公式，有利结果为 2 个，全部结果为 4 个。',
        '追问：掷两枚公平硬币，至少出现一枚正面的概率是多少？先列样本空间再计算。',
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

const superscriptDigits: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

function normalizeAnswer(answer: string): string {
  return String(answer ?? '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => {
      const exponent = [...digits].map((digit) => superscriptDigits[digit]).join('');
      return `^${exponent}`;
    })
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/\*\*/g, '^')
    .replace(/[；;、]/g, ',')
    .replace(/或/g, ',')
    .replace(/\s+/g, '')
    .replace(/^(?:答案|结果|答|解集)(?:是|为)?[:=]?/, '')
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
      '继续用逆运算或代回验算，本题不需要生成薄弱知识点。',
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
    confidence: 'medium',
  };
}
