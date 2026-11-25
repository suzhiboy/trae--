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

function sortSetElements(answer: string): string {
  return answer.replace(/\{([^{}]*)\}/g, (_, contents: string) => {
    if (!contents.includes(',')) return `{${contents}}`;
    return `{${contents.split(',').sort().join(',')}}`;
  });
}

export function normalizeAnswer(answer: string): string {
  const normalized = String(answer ?? '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => {
      const exponent = [...digits].map((digit) => superscriptDigits[digit]).join('');
      return `^${exponent}`;
    })
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\*\*/g, '^')
    .replace(/[；;、]/g, ',')
    .replace(/或/g, ',')
    // 空白两侧都是数字或符号时按隐含乘法处理；直接删掉会把“2 3”拼成 23。
    // 左括号不在此列，f (x) 这类写法删掉空白后仍是函数调用。
    .replace(/([0-9a-zπ.)])\s+([0-9a-zπ])/g, '$1*$2')
    .replace(/\s+/g, '')
    .replace(/\$/g, '')
    .replace(/\\(?:left|right)/g, '')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\cup/g, '∪')
    .replace(/\\cap/g, '∩')
    .replace(/\\setminus/g, '\\')
    .replace(/\\pi/g, 'π')
    .replace(/[𝜋𝝅𝞹]/g, 'π')
    .replace(/\\[d]?frac\{([^{}]+)\}\{([^{}]+)\}/g, (whole: string, numerator: string, denominator: string, offset: number, source: string) => {
      // 分子可以是“数字×单个符号”的单项式（如 5π）；分母只能是单个数字或符号，
      // 因为 a/2π 会被读成 (a/2)·π，与 a/(2π) 不同。
      const numeratorFactor = /^(?:\d+(?:\.\d+)?[a-zπ]?|[a-zπ])$/;
      const denominatorAtom = /^(?:\d+(?:\.\d+)?|[a-zπ])$/;
      const bare = numeratorFactor.test(numerator) && denominatorAtom.test(denominator)
        ? `${numerator}/${denominator}`
        : `(${numerator})/(${denominator})`;
      // 分数整体处在除数或指数位置时，a/b 必须再加一层括号，否则会被外层运算拆开。
      const before = source.slice(0, offset);
      const needsGroup = /[/^]/.test(source[offset - 1] ?? '') || source[offset + whole.length] === '^';
      // 分数前面紧挨着另一个因子（数字、符号，或另一个分数）时补上乘号，
      // 否则相邻的数字会被拼接成另一个数（1/2 后接 1/3 变成 1/21/3）。
      // 单遍替换里看到的是原字符串，前一个分数此时还是 \frac{..}{..} 的形式。
      const joined = !needsGroup && /(?:[0-9a-zπ.)]|\\[d]?frac\{[^{}]*\}\{[^{}]*\})$/.test(before);
      return `${joined ? '*' : ''}${needsGroup ? `(${bare})` : bare}`;
    })
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\sqrt\(([^()]+)\)/g, '√($1)')
    .replace(/\\sqrt([0-9a-z]+)/g, '√$1')
    .replace(/sqrt\(([^()]+)\)/g, '√($1)')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/√\(([^()]+)\)/g, '√$1')
    .replace(/^(?:答案|结果|答|解集)(?:是|为)?[:=]?/, '')
    .replace(/^=/, '')
    .replace(/^\+(?=\d)/, '')
    // 只去掉句末标点。英文句点和 ! 不动：它们可能属于数字（3.5、3!）。
    .replace(/[。；;？?]+$/, '');

  return sortSetElements(normalized);
}
