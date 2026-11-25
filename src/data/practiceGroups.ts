import { questions } from './knowledge';

export interface PracticeGroup {
  id: string;
  title: string;
  english: string;
  description: string;
  questionIds: string[];
}

export const practiceGroups: PracticeGroup[] = [
  {
    id: 'set',
    title: '集合',
    english: 'SETS',
    description: '交、并、补与复合运算',
    questionIds: ['set-union-basic', 'set-complement-intersection'],
  },
  {
    id: 'function',
    title: '函数与方程',
    english: 'FUNCTIONS',
    description: '负数代入与一元二次方程',
    questionIds: ['function-negative-input', 'quadratic-equation-roots'],
  },
  {
    id: 'exp-log',
    title: '指数与对数',
    english: 'EXP / LOG',
    description: '幂的运算法则与对数定义',
    questionIds: ['same-base-powers', 'logarithm-evaluation'],
  },
  {
    id: 'trig',
    title: '三角函数',
    english: 'TRIGONOMETRY',
    description: '弧度换算与特殊角求值',
    questionIds: ['radian-conversion', 'special-angle-sum'],
  },
  {
    id: 'sequence',
    title: '数列',
    english: 'SEQUENCES',
    description: '等差数列通项与前 n 项和',
    questionIds: ['arithmetic-sequence-term', 'arithmetic-sequence-sum'],
  },
  {
    id: 'probability',
    title: '概率',
    english: 'PROBABILITY',
    description: '样本空间与古典概率',
    questionIds: ['classical-probability-coins', 'classical-probability-die'],
  },
  {
    id: 'mixed',
    title: '综合 5 题',
    english: 'MIXED PRACTICE',
    description: '函数、指对、三角、数列、概率各 1 题',
    questionIds: [
      'function-negative-input',
      'logarithm-evaluation',
      'special-angle-sum',
      'arithmetic-sequence-term',
      'classical-probability-die',
    ],
  },
];

export function getPracticeGroup(groupId: string | null): PracticeGroup | null {
  return practiceGroups.find((group) => group.id === groupId) ?? null;
}

export function getGroupQuestions(group: PracticeGroup) {
  return group.questionIds.map((questionId) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question) throw new Error(`题组包含未知题目：${questionId}`);
    return question;
  });
}

export function getGroupDifficulty(group: PracticeGroup): string {
  return [...new Set(getGroupQuestions(group).map((question) => question.difficulty))].join(' / ');
}

export function getGroupMinutes(group: PracticeGroup): number {
  const seconds = getGroupQuestions(group).reduce((total, question) => total + question.estimatedSeconds, 0);
  return Math.max(1, Math.ceil(seconds / 60));
}
