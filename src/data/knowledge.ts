import type { KnowledgeEdge, KnowledgeNode, Question } from '../types';

export const questions: Question[] = [
  {
    id: 'negative-power-parentheses',
    stem: '计算 (-3)²',
    correctAnswer: '9',
    subject: '初中数学',
    difficulty: '基础',
  },
  {
    id: 'distributive-expression',
    stem: '化简 2(x+3)',
    correctAnswer: '2x+6',
    subject: '初中数学',
    difficulty: '基础',
  },
  {
    id: 'fraction-add',
    stem: '计算 1/2+1/3',
    correctAnswer: '5/6',
    subject: '初中数学',
    difficulty: '基础',
  },
  {
    id: 'linear-equation-basic',
    stem: '解方程 2x+5=13',
    correctAnswer: 'x=4',
    subject: '初中数学',
    difficulty: '基础',
  },
  {
    id: 'function-value',
    stem: '已知 f(x)=2x+1，求 f(3)',
    correctAnswer: '7',
    subject: '初中数学',
    difficulty: '基础',
  },
  {
    id: 'negative-power-precedence',
    stem: '计算 -3²',
    correctAnswer: '-9',
    subject: '初中数学',
    difficulty: '中等',
  },
];

export const knowledgeNodes: KnowledgeNode[] = [
  {
    id: 'signed-numbers',
    label: '正负数',
    description: '理解正号、负号和数的符号，能区分“负数的平方”与“平方的相反数”。',
    group: '有理数',
  },
  {
    id: 'rational-multiplication',
    label: '有理数乘法',
    description: '掌握同号得正、异号得负，并能正确计算含负数的有理数乘法。',
    group: '有理数',
  },
  {
    id: 'exponent-meaning',
    label: '乘方的意义',
    description: '理解乘方表示相同因数的连乘，能辨认底数和指数。',
    group: '有理数',
  },
  {
    id: 'negative-power',
    label: '负数乘方',
    description: '根据底数是否带括号判断负号是否参与乘方，并确定结果的符号。',
    group: '有理数',
  },
  {
    id: 'operation-precedence',
    label: '运算优先级',
    description: '没有括号时先算乘方，再处理作为一元运算符的负号。',
    group: '有理数',
  },
  {
    id: 'distributive-property',
    label: '分配律',
    description: '括号外的因数必须乘括号内的每一项，并保留各项的符号。',
    group: '整式运算',
  },
  {
    id: 'parentheses-removal',
    label: '去括号',
    description: '结合分配律和符号规则去掉括号，再合并同类项。',
    group: '整式运算',
  },
  {
    id: 'fraction-basic-property',
    label: '分数基本性质',
    description: '分数的分子和分母同时乘或除以同一个非零数，分数大小不变。',
    group: '分数',
  },
  {
    id: 'common-denominator',
    label: '通分',
    description: '利用分数基本性质，把异分母分数化成同分母且大小不变的分数。',
    group: '分数',
  },
  {
    id: 'fraction-addition',
    label: '分数加法',
    description: '异分母分数先通分，再保持分母不变、把分子相加。',
    group: '分数',
  },
  {
    id: 'equality-properties',
    label: '等式基本性质',
    description: '等式两边同时加减同一个数，或同时乘除同一个非零数，等式仍成立。',
    group: '方程',
  },
  {
    id: 'linear-equation',
    label: '一元一次方程',
    description: '利用等式基本性质逐步隔离未知数，并将未知数的系数化为 1。',
    group: '方程',
  },
  {
    id: 'function-concept',
    label: '函数概念',
    description: '理解函数表示变量之间的对应关系，f(x) 表示自变量为 x 时的函数值。',
    group: '函数',
  },
  {
    id: 'function-value',
    label: '函数值代入',
    description: '把自变量的值代入解析式的每一个相关位置，再按运算顺序计算。',
    group: '函数',
  },
];

export const knowledgeEdges: KnowledgeEdge[] = [
  { source: 'signed-numbers', target: 'rational-multiplication' },
  { source: 'rational-multiplication', target: 'exponent-meaning' },
  { source: 'exponent-meaning', target: 'negative-power' },
  { source: 'exponent-meaning', target: 'operation-precedence' },
  { source: 'negative-power', target: 'operation-precedence' },
  { source: 'rational-multiplication', target: 'distributive-property' },
  { source: 'distributive-property', target: 'parentheses-removal' },
  { source: 'fraction-basic-property', target: 'common-denominator' },
  { source: 'common-denominator', target: 'fraction-addition' },
  { source: 'equality-properties', target: 'linear-equation' },
  { source: 'function-concept', target: 'function-value' },
];
