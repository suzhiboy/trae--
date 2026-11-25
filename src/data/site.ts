export interface HighlightItem {
  id: string;
  kind: string;
  title: string;
  description: string;
  tag: string;
  image: string;
}

export interface WorkItem {
  id: string;
  title: string;
  category: string;
  formula: string;
  summary: string;
  image: string;
}

export type FreeformCoverage = 'verified' | 'experimental';

export interface ExpertiseItem {
  id: string;
  title: string;
  english: string;
  summary: string;
  image: string;
  builtInCount: number;
  builtInQuestions: string[];
  freeform: FreeformCoverage;
  capabilities: string[];
  services: string[];
}

export const expertiseCoverageNote =
  '内置 12 题覆盖 7 个模块，每个模块 1–2 题。任意题诊断中，只有函数代入、集合运算、一元二次方程求根、等差数列通项与求和能通过本地独立复算；其余结论只标「AI 推断，未核验」。';

export const highlights: HighlightItem[] = [
  {
    id: 'diagnosis',
    kind: 'LIVE DEMO / 0001',
    title: '同一个错答，分开的错因',
    description: '引用草稿原句，区分符号、代入与最后一步加法；证据不足时明确说不确定。',
    tag: '可现场演示',
    image: '/images/highlights/diagnosis.webp',
  },
  {
    id: 'graph',
    kind: 'RULE ENGINE / 0002',
    title: '让证据进入知识依赖',
    description: '只有确认的薄弱点才进入补习路径；候选原因不冒充结论。',
    tag: '规则驱动',
    image: '/images/highlights/graph.webp',
  },
  {
    id: 'path',
    kind: 'VERIFICATION / 0003',
    title: '用一道新题验证',
    description: '做对变式写明“本次变式答对”，并区分首次作答与重试。',
    tag: '学生可自查',
    image: '/images/highlights/path.webp',
  },
];

export const works: WorkItem[] = [
  {
    id: 'function-negative-input',
    title: '函数值求解',
    category: 'FUNCTION / NEGATIVE INPUT',
    formula: 'f(-1) = (-1)² - 2 × (-1) + 3 = 6',
    summary: '同一个错答 2：甲错在一次项符号，乙错在最后的加法。系统分别定位到第 1 行和第 2 行。',
    image: '/images/works/function-negative-input.webp',
  },
  {
    id: 'quadratic-equation-roots',
    title: '一元二次方程',
    category: 'EQUATION / ROOTS',
    formula: 'x² - 5x + 6 = (x - 2)(x - 3)',
    summary: '把因式分解中的符号与系数变形分开检查，避免只记一个最终答案。',
    image: '/images/works/quadratic-equation-roots.webp',
  },
  {
    id: 'same-base-powers',
    title: '幂的运算法则',
    category: 'EXPONENT / STRUCTURE',
    formula: 'a³ · a⁴ = a⁷',
    summary: '同一个 a⁷：有人把指数相加写成相乘，有人把底数相加。系统按草稿原句分别定位。',
    image: '/images/works/same-base-powers.webp',
  },
  {
    id: 'logarithm-evaluation',
    title: '对数定义',
    category: 'LOGARITHM / DEFINITION',
    formula: 'log₂ 8 = 3 ⇔ 2³ = 8',
    summary: '用指数形式交叉验证对数结果，让定义而不是口诀成为判断依据。',
    image: '/images/works/logarithm-evaluation.webp',
  },
  {
    id: 'classical-probability-coins',
    title: '古典概率',
    category: 'PROBABILITY / SAMPLE SPACE',
    formula: 'P = 2 / 4 = 1 / 2',
    summary: '先列出等可能样本空间，再讨论目标事件，保持推断过程可以复查。',
    image: '/images/works/classical-probability-coins.webp',
  },
];

export const expertise: ExpertiseItem[] = [
  {
    id: 'functions',
    title: '函数',
    english: 'FUNCTIONS',
    summary: '内置 1 题：负数代入的函数值求解。任意题可对函数代入做本地复算，符号与加法错误仍标 AI 推断。',
    image: '/images/expertise/functions.webp',
    builtInCount: 1,
    builtInQuestions: ['函数值求解'],
    freeform: 'verified',
    capabilities: ['函数值求解', '负数代入', '符号处理'],
    services: ['规则诊断', '代入复算'],
  },
  {
    id: 'equations',
    title: '方程',
    english: 'EQUATIONS',
    summary: '内置 1 题：一元二次方程求根。任意题可对多项式方程根做代回复算，不检查定义域与增根。',
    image: '/images/expertise/equations.webp',
    builtInCount: 1,
    builtInQuestions: ['一元二次方程'],
    freeform: 'verified',
    capabilities: ['因式分解', '一元二次求根', '系数变形'],
    services: ['规则诊断', '求根复算'],
  },
  {
    id: 'exponents',
    title: '指数与对数',
    english: 'EXPONENTS',
    summary: '内置 2 题：同底数幂相乘与对数定义。任意题的指对运算不在本地复算范围，结论只作 AI 推断。',
    image: '/images/expertise/exponents.webp',
    builtInCount: 2,
    builtInQuestions: ['幂的运算法则', '对数定义'],
    freeform: 'experimental',
    capabilities: ['同底数幂相乘', '对数定义', '指数形式互化'],
    services: ['规则诊断', 'AI 推断'],
  },
  {
    id: 'trigonometry',
    title: '三角函数',
    english: 'TRIGONOMETRY',
    summary: '内置 2 题：角度化弧度与特殊角求值。任意题暂无独立复算，相关结论标为实验性。',
    image: '/images/expertise/trigonometry.webp',
    builtInCount: 2,
    builtInQuestions: ['弧度换算', '特殊角求值'],
    freeform: 'experimental',
    capabilities: ['角度化弧度', '特殊角三角函数值', '同角关系'],
    services: ['规则诊断', 'AI 推断'],
  },
  {
    id: 'sequences',
    title: '数列',
    english: 'SEQUENCES',
    summary: '内置 2 题：等差数列通项与前 n 项和。任意题可对等差数列单项与求和做本地复算。',
    image: '/images/expertise/sequences.webp',
    builtInCount: 2,
    builtInQuestions: ['等差数列通项', '前 n 项和'],
    freeform: 'verified',
    capabilities: ['等差数列通项', '前 n 项和', '项数对应'],
    services: ['规则诊断', '求和复算'],
  },
  {
    id: 'probability',
    title: '概率',
    english: 'PROBABILITY',
    summary: '内置 2 题：古典概率与样本空间。任意题暂无独立复算，相关结论标为实验性。',
    image: '/images/expertise/probability.webp',
    builtInCount: 2,
    builtInQuestions: ['两枚硬币', '六面骰'],
    freeform: 'experimental',
    capabilities: ['古典概率', '样本空间', '边界条件'],
    services: ['规则诊断', 'AI 推断'],
  },
  {
    id: 'sets',
    title: '集合',
    english: 'SETS',
    summary: '内置 2 题：交并补与复合运算。任意题可对集合交、并、补做本地复算。',
    image: '/images/expertise/sets.webp',
    builtInCount: 2,
    builtInQuestions: ['并集', '交集的补集'],
    freeform: 'verified',
    capabilities: ['交集与并集', '补集运算', '德摩根律'],
    services: ['规则诊断', '集合复算'],
  },
];

export const methodSteps = [
  { title: 'Read', chinese: '读取作答', body: '记录题目、最终答案和每一行草稿，不把缺失信息补成结论。' },
  { title: 'Locate', chinese: '定位首个错误', body: '逐行验证等式；正确的中间步骤不判错，漏做最后一步只说“还差一步”。' },
  { title: 'Quote', chinese: '引用草稿证据', body: '引用学生原句，区分符号、代入与加法错误；只确认等式不成立时，准确说到这里。' },
  { title: 'Order', chinese: '组织补习顺序', body: '只把已确认的薄弱点放进知识依赖路径，候选原因保持待确认。' },
  { title: 'Verify', chinese: '变式验证', body: '用一道新题让学生自己验证；一次答对只记录“本次变式答对”，不推断长期掌握。' },
];
