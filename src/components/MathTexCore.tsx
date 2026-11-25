import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function MathTexCore({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode, throwOnError: false, strict: false }),
    [tex, displayMode],
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
