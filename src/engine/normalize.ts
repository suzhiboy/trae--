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
    .replace(/\\[d]?frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\sqrt\(([^()]+)\)/g, '√($1)')
    .replace(/\\sqrt([0-9a-z]+)/g, '√$1')
    .replace(/sqrt\(([^()]+)\)/g, '√($1)')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/√\(([^()]+)\)/g, '√$1')
    .replace(/\(([^()]+)\)\/\(([^()]+)\)/g, '$1/$2')
    .replace(/^(?:答案|结果|答|解集)(?:是|为)?[:=]?/, '')
    .replace(/^=/, '')
    .replace(/^\+(?=\d)/, '');

  return sortSetElements(normalized);
}
