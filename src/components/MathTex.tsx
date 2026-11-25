import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

// KaTeX 单独成 chunk：公式进入视口前只显示纯文本，首屏不下载 KaTeX。
const MathTexCore = lazy(() => import('./MathTexCore'));

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return { ref, visible };
}

/** 渲染纯 LaTeX 公式；进入视口后才加载 KaTeX。 */
export function MathTex({
  tex,
  block = false,
  className = '',
}: {
  tex: string;
  block?: boolean;
  className?: string;
}) {
  const { ref, visible } = useInView<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      className={`katex-wrap ${block ? 'block overflow-x-auto py-1' : ''} ${className}`}
    >
      {visible
        ? <Suspense fallback={<span className="katex-fallback">{tex}</span>}><MathTexCore tex={tex} displayMode={block} /></Suspense>
        : <span className="katex-fallback">{tex}</span>}
    </span>
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
