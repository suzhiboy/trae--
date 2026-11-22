import { useMemo } from 'react';
import katex from 'katex';

function render(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: false,
  });
}

/** 渲染纯 LaTeX 公式 */
export function MathTex({
  tex,
  block = false,
  className = '',
}: {
  tex: string;
  block?: boolean;
  className?: string;
}) {
  const html = useMemo(() => render(tex, block), [tex, block]);
  return (
    <span
      className={`katex-wrap ${block ? 'block overflow-x-auto py-1' : ''} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** 渲染含 $...$ 行内公式的混合文本（无公式时按原样输出） */
export function MixedMath({ text, className = '' }: { text: string; className?: string }) {
  const parts = useMemo(() => text.split(/(\$[^$]+\$)/g), [text]);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith('$') && part.endsWith('$') && part.length > 2 ? (
          <MathTex key={i} tex={part.slice(1, -1)} />
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
