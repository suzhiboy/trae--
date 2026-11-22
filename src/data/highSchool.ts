import type { KnowledgeEdge, KnowledgeNode } from '../types';

/* ============================================================
 * 高中数学 · 前端扩展数据
 * 说明：题库（questions）与诊断引擎归队员 B 维护，本文件只提供
 * 高中课程结构、知识图谱扩展节点、展示层 LaTeX 与复习建议，
 * 不参与引擎的规则匹配，也不修改 B 的任何文件。
 * ============================================================ */

/* ---------- 年级标识 ---------- */
export interface GradeInfo {
  id: string;
  name: string;
  stage: string;
  focus: string;
  modules: string[];
  accent: string;
}

export const gradeLevels: GradeInfo[] = [
  {
    id: 'g10',
    name: '高一',
    stage: '必修 · 第一/二册',
    focus: '集合语言与函数主线，打好代数与三角基础',
    modules: ['集合', '函数', '指数与对数', '三角函数'],
    accent: 'from-cyan-400/30 to-sky-500/10 text-cyan-300 border-cyan-400/40',
  },
  {
    id: 'g11',
    name: '高二',
    stage: '选择性必修',
    focus: '数列与概率统计，训练抽象建模与运算能力',
    modules: ['数列', '概率'],
    accent: 'from-indigo-400/30 to-violet-500/10 text-indigo-300 border-indigo-400/40',
  },
  {
    id: 'g12',
    name: '高三',
    stage: '一轮 / 二轮复习',
    focus: '全模块漏洞扫描，围绕错题做针对性补强',
    modules: ['综合诊断', '错题追踪'],
    accent: 'from-violet-400/30 to-fuchsia-500/10 text-violet-300 border-violet-400/40',
  },
];

/* ---------- 知识模块 ---------- */
export interface HSModule {
  id: string;
  name: string;
  grade: string;
  desc: string;
  formula: string;
}

export const hsModules: HSModule[] = [
  {
    id: 'set',
    name: '集合',
    grade: '高一',
    desc: '集合的表示、关系与交并补运算',
    formula: 'A \\cup B = \\{x \\mid x \\in A \\text{ 或 } x \\in B\\}',
  },
  {
    id: 'function',
    name: '函数',
    grade: '高一',
    desc: '概念、单调性、奇偶性与零点',
    formula: 'f(x)=2x+1,\\quad f(3)=7',
  },
  {
    id: 'exp-log',
    name: '指数与对数',
    grade: '高一',
    desc: '指数幂运算、对数运算与两类函数',
    formula: '\\log_a(MN)=\\log_a M+\\log_a N',
  },
  {
    id: 'trig',
    name: '三角函数',
    grade: '高一',
    desc: '任意角、弧度制、图象与恒等变换',
    formula: '\\sin^2\\theta+\\cos^2\\theta=1',
  },
  {
    id: 'sequence',
    name: '数列',
    grade: '高二',
    desc: '等差、等比数列与求和方法',
    formula: 'a_n=a_1+(n-1)d',
  },
  {
    id: 'probability',
    name: '概率',
    grade: '高二',
    desc: '随机事件、古典概型与条件概率',
    formula: 'P(A \\mid B)=\\dfrac{P(AB)}{P(B)}',
  },
];

/* ---------- 高中知识图谱（展示层扩展，引擎不读取） ---------- */
export const hsNodes: KnowledgeNode[] = [
  // 集合
  { id: 'hs-set-concept', label: '集合的概念与表示', description: '理解元素的确定性、互异性与无序性，会用列举法和描述法表示集合。', group: '集合' },
  { id: 'hs-set-relation', label: '集合间的基本关系', description: '掌握子集、真子集与集合相等的判定，能数出有限集的子集个数。', group: '集合' },
  { id: 'hs-set-ops', label: '集合的基本运算', description: '熟练求交集、并集与补集，并能借助数轴与 Venn 图处理含参问题。', group: '集合' },
  // 函数
  { id: 'hs-func-concept', label: '函数的概念与表示', description: '理解对应关系与定义域、值域，掌握解析法、图象法与分段函数。', group: '函数' },
  { id: 'hs-func-props', label: '单调性与奇偶性', description: '会用定义证明单调性，结合奇偶性分析图象对称性并求参数。', group: '函数' },
  { id: 'hs-func-zero', label: '函数零点与方程的根', description: '理解零点存在性定理，会把方程根的问题转化为函数图象交点问题。', group: '函数' },
  // 指数与对数
  { id: 'hs-exp-ops', label: '指数与指数幂运算', description: '掌握根式与分数指数幂的互化，熟练进行指数幂的化简求值。', group: '指数与对数' },
  { id: 'hs-exp-func', label: '指数函数', description: '掌握指数函数的图象与性质，能比较大小并解决简单应用问题。', group: '指数与对数' },
  { id: 'hs-log-ops', label: '对数与对数运算', description: '理解对数的定义，熟练运用对数运算法则与换底公式。', group: '指数与对数' },
  { id: 'hs-log-func', label: '对数函数', description: '掌握对数函数的图象与性质，理解它与指数函数互为反函数。', group: '指数与对数' },
  // 三角函数
  { id: 'hs-trig-angle', label: '任意角与弧度制', description: '把角推广到任意角，掌握弧度制与角度制的互化及弧长公式。', group: '三角函数' },
  { id: 'hs-trig-def', label: '三角函数的定义', description: '用单位圆定义正弦、余弦与正切，能判断各象限三角函数值的符号。', group: '三角函数' },
  { id: 'hs-trig-identity', label: '同角关系与诱导公式', description: '运用同角三角函数基本关系与诱导公式进行化简与求值。', group: '三角函数' },
  { id: 'hs-trig-graph', label: '三角函数的图象与性质', description: '掌握 y=sin x、y=cos x、y=tan x 的图象，会求周期、单调区间与最值。', group: '三角函数' },
  // 数列
  { id: 'hs-seq-concept', label: '数列的概念', description: '理解数列是定义在正整数集上的函数，会由通项公式或递推关系写出各项。', group: '数列' },
  { id: 'hs-seq-arith', label: '等差数列', description: '掌握等差数列的通项公式与前 n 项和公式，会用等差中项性质解题。', group: '数列' },
  { id: 'hs-seq-geo', label: '等比数列', description: '掌握等比数列的通项公式与前 n 项和公式，注意公比 q=1 的讨论。', group: '数列' },
  { id: 'hs-seq-sum', label: '数列求和', description: '掌握公式法、错位相减法与裂项相消法等常见求和策略。', group: '数列' },
  // 概率
  { id: 'hs-prob-event', label: '随机事件与概率', description: '理解随机事件、频率与概率的关系，掌握互斥事件的概率加法公式。', group: '概率' },
  { id: 'hs-prob-classical', label: '古典概型', description: '识别古典概型的等可能性，会用列举与计数求基本事件的概率。', group: '概率' },
  { id: 'hs-prob-conditional', label: '条件概率', description: '理解条件概率的意义，会运用公式 P(A|B)=P(AB)/P(B) 求解。', group: '概率' },
];

export const hsEdges: KnowledgeEdge[] = [
  // 集合
  { source: 'hs-set-concept', target: 'hs-set-relation' },
  { source: 'hs-set-relation', target: 'hs-set-ops' },
  // 函数
  { source: 'hs-func-concept', target: 'hs-func-props' },
  { source: 'hs-func-props', target: 'hs-func-zero' },
  // 指数与对数
  { source: 'hs-exp-ops', target: 'hs-exp-func' },
  { source: 'hs-exp-ops', target: 'hs-log-ops' },
  { source: 'hs-log-ops', target: 'hs-log-func' },
  { source: 'hs-exp-func', target: 'hs-log-func' },
  // 三角函数
  { source: 'hs-trig-angle', target: 'hs-trig-def' },
  { source: 'hs-trig-def', target: 'hs-trig-identity' },
  { source: 'hs-trig-identity', target: 'hs-trig-graph' },
  // 数列
  { source: 'hs-seq-concept', target: 'hs-seq-arith' },
  { source: 'hs-seq-arith', target: 'hs-seq-geo' },
  { source: 'hs-seq-arith', target: 'hs-seq-sum' },
  { source: 'hs-seq-geo', target: 'hs-seq-sum' },
  // 概率
  { source: 'hs-prob-event', target: 'hs-prob-classical' },
  { source: 'hs-prob-classical', target: 'hs-prob-conditional' },
  // 跨模块衔接（展示层）
  { source: 'hs-func-props', target: 'hs-exp-func' },
  { source: 'hs-func-props', target: 'hs-trig-graph' },
  { source: 'hs-func-concept', target: 'hs-seq-concept' },
];

/* ---------- 节点补充资料：核心公式 + 复习建议 ---------- */
export interface NodeExtra {
  latex?: string;
  tips: string[];
}

const genericTips = ['重做 3 道同类题并总结易错点', '把解题步骤讲给同学听，确认真正理解'];

export const nodeExtras: Record<string, NodeExtra> = {
  /* 引擎可命中的薄弱点（题干仍由队员 B 的题库提供，这里只补充展示资料） */
  'negative-power': {
    latex: '(-a)^2=a^2 \\neq -a^2',
    tips: ['对比 (-3)^2 与 -3^2 各写一个例子并标出底数', '完成 3 道负数乘方口算并口头说明符号来源'],
  },
  'operation-precedence': {
    latex: '-3^2=-(3^2)=-9',
    tips: ['用“先乘方、后符号”复述 -3^2 的运算顺序', '再算 -2^2 与 (-2)^2，检查是否稳定掌握'],
  },
  'distributive-property': {
    latex: 'a(b+c)=ab+ac',
    tips: ['化简 3(y+4) 并检查每一项都乘了括号外的因数', '取 x=1 验证 2(x+3) 与 2x+6 相等'],
  },
  'common-denominator': {
    latex: '\\dfrac{1}{2}+\\dfrac{1}{3}=\\dfrac{3}{6}+\\dfrac{2}{6}=\\dfrac{5}{6}',
    tips: ['练习 1/3+1/4，先找公分母 12 再相加', '检查结果是否大于每个加数，做合理性检验'],
  },
  'linear-equation': {
    latex: '2x+5=13 \\Rightarrow 2x=8 \\Rightarrow x=4',
    tips: ['练习 3x+2=11，最后把未知数系数化为 1', '把解代回原方程，验证两边相等'],
  },
  'function-value': {
    latex: 'f(3)=2\\times 3+1=7',
    tips: ['求 g(2)（g(x)=3x-2），注意保留常数项', '完整写出代入过程，再检查每一项'],
  },

  /* 高中模块节点 */
  'hs-set-concept': { latex: 'A=\\{1,2,3\\},\\quad B=\\{x \\mid x>0\\}', tips: genericTips },
  'hs-set-relation': { latex: 'A \\subseteq B \\Leftrightarrow \\forall x \\in A,\\, x \\in B', tips: genericTips },
  'hs-set-ops': { latex: '\\complement_U(A \\cup B)=(\\complement_U A) \\cap (\\complement_U B)', tips: genericTips },
  'hs-func-concept': { latex: 'f:\\, x \\mapsto y,\\quad x \\in D', tips: genericTips },
  'hs-func-props': { latex: 'x_1<x_2 \\Rightarrow f(x_1)<f(x_2)', tips: genericTips },
  'hs-func-zero': { latex: 'f(a)\\,f(b)<0 \\Rightarrow \\exists\\, x_0 \\in (a,b)', tips: genericTips },
  'hs-exp-ops': { latex: 'a^{\\frac{m}{n}}=\\sqrt[n]{a^{m}}', tips: genericTips },
  'hs-exp-func': { latex: 'y=a^{x}\\,(a>0,\\,a \\neq 1)', tips: genericTips },
  'hs-log-ops': { latex: '\\log_a b=\\dfrac{\\log_c b}{\\log_c a}', tips: genericTips },
  'hs-log-func': { latex: 'y=\\log_a x \\Leftrightarrow x=a^{y}', tips: genericTips },
  'hs-trig-angle': { latex: '\\pi\\ \\text{rad}=180^{\\circ}', tips: genericTips },
  'hs-trig-def': { latex: '\\sin\\alpha=\\dfrac{y}{r},\\ \\cos\\alpha=\\dfrac{x}{r}', tips: genericTips },
  'hs-trig-identity': { latex: '\\sin^2\\alpha+\\cos^2\\alpha=1', tips: genericTips },
  'hs-trig-graph': { latex: 'y=\\sin x,\\quad T=2\\pi', tips: genericTips },
  'hs-seq-concept': { latex: 'a_n=f(n),\\quad n \\in \\mathbb{N}^{*}', tips: genericTips },
  'hs-seq-arith': { latex: 'S_n=\\dfrac{n(a_1+a_n)}{2}', tips: genericTips },
  'hs-seq-geo': { latex: 'a_n=a_1 q^{\\,n-1}', tips: genericTips },
  'hs-seq-sum': { latex: '\\sum_{k=1}^{n} k=\\dfrac{n(n+1)}{2}', tips: genericTips },
  'hs-prob-event': { latex: 'P(A \\cup B)=P(A)+P(B)', tips: genericTips },
  'hs-prob-classical': { latex: 'P(A)=\\dfrac{|A|}{|\\Omega|}', tips: genericTips },
  'hs-prob-conditional': { latex: 'P(A \\mid B)=\\dfrac{P(AB)}{P(B)}', tips: genericTips },
};

/* ---------- 题干 LaTeX 展示覆盖（不修改题库，仅前端渲染层） ---------- */
export const stemLatex: Record<string, string> = {
  'negative-power-parentheses': '计算 $(-3)^2$',
  'distributive-expression': '化简 $2(x+3)$',
  'fraction-add': '计算 $\\dfrac{1}{2}+\\dfrac{1}{3}$',
  'linear-equation-basic': '解方程 $2x+5=13$',
  'function-value': '已知 $f(x)=2x+1$，求 $f(3)$',
  'negative-power-precedence': '计算 $-3^2$',
};

/* ---------- 追问验证：薄弱节点 → 可再次验证的题目 ---------- */
export const relatedQuestionIds: Record<string, string[]> = {
  'negative-power': ['negative-power-precedence', 'negative-power-parentheses'],
  'operation-precedence': ['negative-power-precedence', 'negative-power-parentheses'],
  'distributive-property': ['distributive-expression'],
  'parentheses-removal': ['distributive-expression'],
  'common-denominator': ['fraction-add'],
  'fraction-addition': ['fraction-add'],
  'linear-equation': ['linear-equation-basic'],
  'function-value': ['function-value', 'linear-equation-basic'],
};
