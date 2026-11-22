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

export interface ExpertiseItem {
  id: string;
  title: string;
  english: string;
  summary: string;
  image: string;
  capabilities: string[];
  services: string[];
}

const image = (prompt: string) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=landscape_16_9`;

export const highlights: HighlightItem[] = [
  {
    id: 'diagnosis',
    kind: 'FIELD NOTES / 0001',
    title: '从一个错答，倒推知识断点',
    description: '把答案、规则证据与可能错因放在同一条可检查的证据链上。',
    tag: '诊断笔记',
    image: image('monochrome engineering sketch of mathematical error analysis, chalk diagrams and connected proof steps on black paper, precise thin white lines, subtle red marker, no readable text, editorial photography'),
  },
  {
    id: 'graph',
    kind: 'LAST PROJECT / 0002',
    title: '可交互知识依赖图谱',
    description: '让前置知识、疑似薄弱点与建议复习路径在同一张图里对齐。',
    tag: '已完成',
    image: image('dark precise knowledge graph network, connected nodes and thin technical lines, monochrome graphite palette, one small red node, isometric composition, no readable text'),
  },
  {
    id: 'path',
    kind: 'IN PROGRESS / 0003',
    title: '按依赖顺序组织复习',
    description: '不是给出更多题，而是先说明哪一个知识点值得回头。',
    tag: '迭代中',
    image: image('layered transparent technical planes representing a learning sequence, dark architectural visualization, precise white edges, sparse red accents, no readable text'),
  },
];

export const works: WorkItem[] = [
  {
    id: 'function-negative-input',
    title: '函数值求解',
    category: 'FUNCTION / NEGATIVE INPUT',
    formula: 'f(-1) = (-1)² - 2 × (-1) + 3 = 6',
    summary: '从错答 2 识别一次项符号处理这一可能原因，并回到函数概念与代入过程。',
    image: image('mathematical function curve and negative coordinate system drawn as precise white line engraving on matte black, minimal red coordinate point, high contrast, no readable text'),
  },
  {
    id: 'quadratic-equation-roots',
    title: '一元二次方程',
    category: 'EQUATION / ROOTS',
    formula: 'x² - 5x + 6 = (x - 2)(x - 3)',
    summary: '把因式分解、根与前置运算之间的关系拆开，避免只记一个最终答案。',
    image: image('parabola intersecting axis at two points, monochrome architectural math diagram on black, fine grid, precise thin lines, one red intersection, no readable text'),
  },
  {
    id: 'same-base-powers',
    title: '幂的运算法则',
    category: 'EXPONENT / STRUCTURE',
    formula: 'a³ · a⁴ = a⁷',
    summary: '区分同底数幂相乘与指数相加的结构，展示规则匹配的直接证据。',
    image: image('stacked cubic geometric blocks representing exponent operations, dark isometric technical rendering, monochrome with a single red plane, no readable text'),
  },
  {
    id: 'logarithm-evaluation',
    title: '对数定义',
    category: 'LOGARITHM / DEFINITION',
    formula: 'log₂ 8 = 3 ⇔ 2³ = 8',
    summary: '用指数形式交叉验证对数结果，让定义而不是口诀成为判断依据。',
    image: image('exponential spiral and logarithmic grid, precise white technical linework on dark graphite, restrained composition, tiny red node, no readable text'),
  },
  {
    id: 'classical-probability-coins',
    title: '古典概率',
    category: 'PROBABILITY / SAMPLE SPACE',
    formula: 'P = 2 / 4 = 1 / 2',
    summary: '先列出等可能样本空间，再讨论目标事件，保持推断过程可以复查。',
    image: image('two geometric coins and four sample space quadrants, minimal monochrome 3d technical composition on black, one red quadrant, no readable text'),
  },
];

export const expertise: ExpertiseItem[] = [
  ['functions', '函数', 'FUNCTIONS', '从解析式、定义域与代入过程定位函数理解断点。', ['函数概念', '函数值', '图象性质'], ['规则诊断', '路径复习']],
  ['equations', '方程', 'EQUATIONS', '把方程求解还原为因式分解、等式变形与运算检查。', ['一元二次', '因式分解', '根的关系'], ['错因假设', '同类验证']],
  ['exponents', '指数与对数', 'EXPONENTS', '在指数与对数两种表示之间建立可验证的转换。', ['幂运算', '指数函数', '对数定义'], ['规则匹配', '步骤提示']],
  ['trigonometry', '三角函数', 'TRIGONOMETRY', '连接角度、弧度、定义与图象，呈现完整依赖关系。', ['弧度制', '特殊角', '图象性质'], ['图谱导航', '前置定位']],
  ['sequences', '数列', 'SEQUENCES', '用首项、公差与通项结构解释数列答案的形成过程。', ['数列概念', '等差数列', '数列求和'], ['公式解释', '有序复习']],
  ['probability', '概率', 'PROBABILITY', '从样本空间出发核对事件与等可能条件。', ['样本空间', '古典概率', '条件概率'], ['证据展示', '变式追问']],
  ['sets', '集合', 'SETS', '以集合语言和运算关系支撑后续函数与概率学习。', ['集合表示', '集合关系', '交并补运算'], ['课程定位', '依赖梳理']],
  ['diagnosis', '诊断规则', 'DIAGNOSIS', '明确区分规则证据、错因假设与尚待验证的判断。', ['答案匹配', '错因模式', '置信等级'], ['本地推断', '历史记录']],
].map(([id, title, english, summary, capabilities, services], index) => ({
  id: id as string,
  title: title as string,
  english: english as string,
  summary: summary as string,
  capabilities: capabilities as string[],
  services: services as string[],
  image: image(`abstract monochrome technical illustration for ${english}, layered mathematical structures and fine white lines on black, one small red detail, variation ${index + 1}, no readable text`),
}));

export const methodSteps = [
  { title: 'Interaction & Behavior', chinese: '读取作答行为', body: '记录题目与最终答案，保留原始输入，不把未知信息补成确定结论。' },
  { title: 'Interfaces & Visual Language', chinese: '呈现诊断证据', body: '把正确答案、学生答案、可能原因和推断依据放在同一阅读顺序里。' },
  { title: 'Components & Logic', chinese: '匹配诊断规则', body: '将错答映射到可解释的错因模式；证据不足时降低置信度。' },
  { title: 'Structure & Direction', chinese: '组织补习顺序', body: '沿知识依赖反向梳理前置点，给出可以执行的复习顺序。' },
  { title: 'Inputs & Signals', chinese: '收集后续信号', body: '通过中间步骤、变式题与历史记录继续验证，而不是一次性下结论。' },
];
