/* Local diagnoses are hypotheses tied to specific questions and answer patterns. */
(() => {
  "use strict";

  const algebra = {
    example: {
      id: "linear-equation", subject: "初中数学", title: "去括号解方程",
      question: "解方程：2(x − 3) = 10", answer: "x = 6.5"
    },
    aliases: ["2(x-3)=10", "求解方程2(x-3)=10", "解方程2×(x-3)=10", "2×(x-3)=10"],
    correct: 8,
    proof: "把 x = 8 代入左边，2 × (8 − 3) = 10，等式成立。",
    nodes: [
      ["signed", "带符号的乘法", "正数乘负数，积为负数。例如 2 × (−3) = −6。"],
      ["distribution", "乘法分配律", "括号外的因数要乘到括号内的每一项。"],
      ["equality", "等式的性质", "等式两边同时加减同一个数，等式仍然成立。"],
      ["inverse", "逆运算", "用相反的运算抵消未知数旁边的加减项。"],
      ["target", "去括号解方程", "展开括号，再用等式的性质求出未知数。"]
    ],
    edges: [["signed", "distribution"], ["distribution", "target"], ["equality", "inverse"], ["inverse", "target"]],
    cases: [
      {
        value: 6.5, gap: "distribution", root: "去括号时可能漏乘了常数项",
        signals: ["2x-3=10", "2(x-3)=2x-3"], compatible: ["2x=13", "x=13/2"],
        evidence: "如果把 2(x − 3) 展开为 2x − 3，解出的 x 正好是 6.5。这提示你可以先检查括号外的 2 有没有乘到 −3。",
        steps: [
          ["找出括号里的每一项", "把 x − 3 看作 x + (−3)，第二项带着负号。"],
          ["把系数分别乘进去", "写出 2 × x 和 2 × (−3)，再合并成 2x − 6。"],
          ["代回检查", "从 2x − 6 = 10 得到 x = 8。代回原式，左边等于 10。"]
        ],
        quiz: ["3(y − 4) 展开后等于什么？", ["3y − 4", "3y − 12", "3y + 12"], 1, "3 既乘 y，也乘 −4，因此展开后为 3y − 12。"]
      },
      {
        value: 2, gap: "signed", root: "展开括号时可能改变了常数项的符号",
        signals: ["2x+6=10", "2(x-3)=2x+6"], compatible: ["2x=4"], needsSteps: true,
        evidence: "你的步骤里出现了 2x + 6 = 10。原式中第二项是 2 × (−3)，积应为 −6，这一处符号变化能解释后面的 x = 2。",
        steps: [
          ["把减法改写成加法", "在括号内写成 x + (−3)，把负号保留在数上。"],
          ["先判断积的符号", "2 是正数，−3 是负数，所以 2 × (−3) = −6。"],
          ["展开后检验", "展开得到 2x − 6 = 10，解出 x = 8，再代回原式。"]
        ],
        quiz: ["4 × (−5) 等于多少？", ["20", "−1", "−20"], 2, "正数与负数相乘，积为负数，4 × 5 = 20。"]
      },
      {
        value: 2, gap: "inverse", root: "可能混淆了移项时的逆运算",
        signals: ["x=5-3", "x=5-3=2"], compatible: ["x-3=5"],
        evidence: "两边先除以 2，得到 x − 3 = 5。若下一步写成 x = 5 − 3，就会得到 2。展开括号时写错符号也可能得到同一答案，可以用下面的小题区分。",
        steps: [
          ["先保留中间等式", "两边同时除以 2，写出 x − 3 = 5。"],
          ["用逆运算抵消 −3", "等式两边同时加 3，得到 x = 5 + 3。"],
          ["把结果代回", "2 × (8 − 3) = 10，等式成立。若这一步会做，再回看去括号时的符号。"]
        ],
        quiz: ["已知 y − 4 = 7，要单独留下 y，应怎样做？", ["两边同时加 4", "两边同时减 4", "两边同时除以 4"], 0, "两边同时加 4 可以抵消左边的 −4，得到 y = 11。"]
      }
    ]
  };

  const fractions = {
    example: {
      id: "fraction-addition", subject: "初中数学", title: "异分母分数加法",
      question: "计算：1/2 + 1/3", answer: "2/5"
    },
    aliases: ["1/2+1/3", "求1/2+1/3的值", "1/2+1/3=?", "计算1/2+1/3的值"],
    correct: 5 / 6,
    proof: "以 6 为公分母，1/2 = 3/6，1/3 = 2/6，所以它们的和是 5/6。",
    nodes: [
      ["unit", "分数单位", "分母决定每一小份的大小。同一个整体的二分之一与三分之一大小不同。"],
      ["common", "通分", "分子、分母同时乘同一个非零数，把两个分数改写成相同分母。"],
      ["operation", "辨认运算符号", "先读清楚两个分数之间的运算符号，再选择对应的运算法则。"],
      ["add", "同分母加法", "份的大小相同时，分母保持不变，只把分子相加。"],
      ["target", "异分母加法", "先统一分数单位，再把相同大小的份数相加。"]
    ],
    edges: [["unit", "common"], ["unit", "add"], ["common", "target"], ["add", "target"], ["operation", "target"]],
    cases: [
      {
        value: 2 / 5, gap: "common", root: "相加前可能没有统一分数单位",
        signals: ["1/2+1/3=(1+1)/(2+3)", "(1+1)/(2+3)=2/5"],
        evidence: "分别计算分子 1 + 1 和分母 2 + 3，恰好会写出 2/5。两种大小不同的份要先换成同一个分数单位，才能相加。",
        steps: [
          ["比较两份的大小", "同一个整体分成两份和三份，每一份的大小不同。"],
          ["换成相同分母", "2 和 3 的最小公倍数是 6，把 1/2 写成 3/6，把 1/3 写成 2/6。"],
          ["数一共有几份", "3 个六分之一加 2 个六分之一，共有 5 个六分之一。"]
        ],
        quiz: ["计算 1/2 + 1/4 时，可以先把 1/2 改写成什么？", ["1/4", "2/4", "2/2"], 1, "1/2 的分子、分母同时乘 2，数值不变，得到 2/4。"]
      },
      {
        value: 1 / 6, gap: "operation", root: "可能把分数乘法的规则用在了加法上",
        signals: ["1/2+1/3=1/2×1/3", "1/2×1/3=1/6", "(1×1)/(2×3)=1/6"],
        evidence: "上下分别相乘会得到 (1 × 1)/(2 × 3) = 1/6。原式中间是加号，而且两个正分数相加后应比每一个加数都大。",
        steps: [
          ["先圈出运算符号", "读作「二分之一加三分之一」，先确定这是加法。"],
          ["按加法规则通分", "把分数分别改写成 3/6 和 2/6，同分母后相加。"],
          ["检查大小", "结果 5/6 比 1/2 和 1/3 都大，符合两个正数相加的规律。"]
        ],
        quiz: ["哪个算式的结果是 1/6？", ["1/2 + 1/3", "1/2 ÷ 1/3", "1/2 × 1/3"], 2, "乘法才可以把分子和分母分别相乘，得到 (1 × 1)/(2 × 3)。"]
      }
    ]
  };

  const triangle = {
    example: {
      id: "right-triangle", subject: "初中数学", title: "求直角三角形的斜边",
      question: "直角三角形的两条直角边分别为 6 和 8，斜边长是多少？", answer: "100"
    },
    aliases: ["直角三角形的两条直角边分别为6和8求斜边长", "直角三角形两条直角边为6和8求斜边长"],
    correct: 10,
    proof: "6² + 8² = 36 + 64 = 100。斜边长是正数，因此等于 √100 = 10。",
    nodes: [
      ["sides", "辨认直角边", "构成直角的两边是直角边，直角对面的边是斜边。"],
      ["theorem", "勾股定理", "直角三角形的两条直角边的平方和等于斜边的平方。"],
      ["square", "平方", "一个数的平方等于这个数乘自己，例如 6² = 36。"],
      ["sqrt", "算术平方根", "已知正数的平方，取它的算术平方根可以得到这个正数。"],
      ["target", "求斜边长", "先用勾股定理求出斜边的平方，再取正的平方根。"]
    ],
    edges: [["sides", "theorem"], ["square", "theorem"], ["square", "sqrt"], ["theorem", "target"], ["sqrt", "target"]],
    cases: [
      {
        value: 100, gap: "sqrt", root: "可能停在了斜边的平方",
        signals: ["c^2=100", "c=6^2+8^2", "c^2=6^2+8^2=100"], compatible: ["c^2=6^2+8^2", "6^2+8^2=100"],
        evidence: "100 正好等于 6² + 8²。这个数代表斜边长的平方，求边长还需要取算术平方根。",
        steps: [
          ["给未知量起名", "设斜边长为 c，并记下边长 c > 0。"],
          ["区分 c² 和 c", "由勾股定理得到 c² = 100，在这一步保留平方符号。"],
          ["取算术平方根", "c = √100 = 10，边长为 10。"]
        ],
        quiz: ["若边长 d 满足 d² = 81，d 等于多少？", ["9", "81", "−9"], 0, "9² = 81，且边长为正，所以 d = 9。"]
      },
      {
        value: 14, gap: "theorem", root: "可能把两条直角边直接相加了",
        signals: ["c=6+8", "6+8=14", "c=6+8=14"],
        evidence: "6 + 8 = 14。勾股定理中相加的是两条直角边的平方。三角形的两边之和应大于第三边，也可以用来检查这个结果。",
        steps: [
          ["标出三条边", "6 和 8 是直角边，把直角对面的斜边记为 c。"],
          ["写出平方关系", "根据勾股定理写 c² = 6² + 8² = 100。"],
          ["还原长度", "取正的平方根，得到 c = 10，再检查 6 + 8 > 10。"]
        ],
        quiz: ["直角边为 3、4，斜边为 c，哪个等式成立？", ["c = 3 + 4", "c² = 3² + 4²", "c² = 3 × 4"], 1, "勾股定理给出直角边的平方和等于斜边的平方。"]
      }
    ]
  };

  const topics = [algebra, fractions, triangle];
  const examples = topics.map(topic => ({ ...topic.example }));

  function mathText(input) {
    return String(input ?? "").replace(/²/g, "^2").normalize("NFKC").toLowerCase()
      .replace(/[−–]/g, "-").replace(/\*/g, "×").replace(/\s+/g, "");
  }

  function questionKey(input) {
    return mathText(input).replace(/[:，,。?！!]/g, "");
  }

  function finalValue(last, topic) {
    let value = last.replace(/[。.!！]$/, "").replace(/^(?:(?:答案|结果)(?:是|为|等于|=|:)?|答:?)/, "");
    if (topic === algebra) value = value.replace(/^x(?:=|为|等于)/, "");
    if (topic === triangle) value = value.replace(/^(?:斜边长|斜边|c)(?:=|为|是|等于)?/, "");
    value = value.replace(/^=/, "");
    const number = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
    const parts = new RegExp("^(" + number + ")(?:/(" + number + "))?$").exec(value);
    if (!parts) return NaN;
    return Number(parts[1]) / Number(parts[2] ?? 1);
  }

  function supportsWork(clue, work) {
    if (work.length === 0) return !clue.needsSteps;
    // Every submitted step must fit this path; at least one must distinguish it.
    const allowed = [...clue.signals, ...(clue.compatible ?? [])];
    return work.every(line => allowed.includes(line)) && work.some(line => clue.signals.includes(line));
  }

  function message(status, root, evidence) {
    return { status, root, evidence, nodes: [], edges: [], steps: [], quiz: null };
  }

  function diagnose(question, answer) {
    const key = questionKey(question);
    const topic = topics.find(t => [t.example.question, ...t.aliases].some(q => questionKey(q) === key));
    if (!topic) {
      return message("unknown", "这道题暂时没有离线诊断", "可以先选一条示例，体验从错答到知识点的完整诊断。");
    }
    const work = String(answer ?? "").split(/[,，;；。\n→⇒∴]|所以|因此|得到|即得/)
      .map(mathText).filter(Boolean);
    const value = finalValue(work.pop() ?? "", topic);
    if (value === topic.correct) return message("correct", "最终答案正确", topic.proof);

    const clue = topic.cases.find(c => c.value === value && supportsWork(c, work));
    if (!clue) {
      return message("unknown", "现有线索还无法定位", "可在最后一行单独写出最终答案。若已写明，当前离线题库还没有与这份作答相符的错误路径。");
    }
    const [prompt, choices, correctIndex, explanation] = clue.quiz;
    return {
      status: "diagnosed", root: clue.root, evidence: clue.evidence,
      nodes: topic.nodes.map(([id, label, detail]) => ({
        id, label, detail, state: id === "target" ? "target" : id === clue.gap ? "gap" : "foundation"
      })),
      edges: topic.edges.map(edge => [...edge]),
      steps: clue.steps.map(([title, body]) => ({ title, body })),
      quiz: { question: prompt, choices: [...choices], correctIndex, explanation }
    };
  }

  globalThis.DetectiveEngine = { examples, diagnose };
})();
