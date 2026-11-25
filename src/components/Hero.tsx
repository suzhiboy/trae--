import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight } from 'lucide-react';
import TextRoll from './TextRoll';
import { initHeroTitle } from '../animations/initText';
import { useReducedMotion } from '../hooks/useReducedMotion';

const HeroScene = lazy(() => import('./HeroScene'));

// 静态线框球：移动端、减少动效或 3D 尚未加载时使用，不请求 three.js。
function HeroSceneStatic() {
  const count = 14;
  const nodes = Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 148;
    return {
      x: 250 + Math.cos(angle) * radius,
      y: 250 + Math.sin(angle) * radius * 0.62,
    };
  });
  return (
    <svg className="hero-scene hero-scene--static" viewBox="0 0 500 500" aria-hidden="true" focusable="false">
      <circle cx="250" cy="250" r="155" fill="none" stroke="currentColor" strokeOpacity="0.16" />
      <ellipse cx="250" cy="250" rx="155" ry="58" fill="none" stroke="currentColor" strokeOpacity="0.18" />
      <ellipse cx="250" cy="250" rx="58" ry="155" fill="none" stroke="currentColor" strokeOpacity="0.12" transform="rotate(-32 250 250)" />
      {nodes.map((node, index) => {
        const next = nodes[(index + 3) % count];
        const extra = index % 2 === 0 ? nodes[(index + 7) % count] : null;
        return (
          <g key={index}>
            <line x1={node.x} y1={node.y} x2={next.x} y2={next.y} stroke="currentColor" strokeOpacity="0.24" />
            {extra && <line x1={node.x} y1={node.y} x2={extra.x} y2={extra.y} stroke="currentColor" strokeOpacity="0.12" />}
            <circle cx={node.x} cy={node.y} r="2.6" fill={index % 7 === 0 ? '#ea384c' : '#d1d1d1'} />
          </g>
        );
      })}
    </svg>
  );
}

function useDeferredScene(allowed: boolean) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const load = () => { if (!cancelled) setIdle(true); };
    const handle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(load, { timeout: 2500 })
      : window.setTimeout(load, 1200);
    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [allowed]);
  return idle;
}

export default function Hero({ loaded }: { loaded: boolean }) {
  const title = useRef<HTMLHeadingElement>(null);
  const reducedMotion = useReducedMotion();
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const idle = useDeferredScene(loaded && desktop && !reducedMotion);

  useEffect(() => {
    if (loaded && title.current) return initHeroTitle(title.current, reducedMotion);
  }, [loaded, reducedMotion]);

  return (
    <section className="hero hero--case" id="home" aria-labelledby="hero-title">
      {idle ? (
        <Suspense fallback={<HeroSceneStatic />}>
          <HeroScene />
        </Suspense>
      ) : (
        <HeroSceneStatic />
      )}
      <div className="hero__meta page-grid">
        <span><i className="status-dot" />LOCAL RULE ENGINE / NO AI KEY</span>
        <span>HS MATH / DIAGNOSIS</span>
        <span>CN / 2026</span>
      </div>
      <div className="hero__content page-shell">
        <span className="hero__eyebrow">SAME ANSWER / DIFFERENT EVIDENCE</span>
        <h1 id="hero-title" ref={title} className="hero__title hero__title--case display-font">
          <span>两个人都答了 2，</span>
          <span>他们错在同一步吗？</span>
        </h1>

        <div className="hero__case" aria-hidden="true">
          <div>
            <span>甲 / 最终答案 2</span>
            <code>f(-1)=1-2+3=2</code>
            <b>第 1 行：一次项符号</b>
          </div>
          <div>
            <span>乙 / 最终答案 2</span>
            <code>f(-1)=1+2+3</code>
            <code>1+2+3=2</code>
            <b>第 2 行：最后加法</b>
          </div>
        </div>

        <div className="hero__bottom">
          <p>同一道函数题，同一个最终答案。系统引用草稿里的原句，在可复算的步骤里指出出错的那一行，再用一道新题让学生自己验证。</p>
          <div className="hero__actions">
            <a className="circle-link roll-trigger" href="#compare" data-cursor="VIEW" aria-label="比较两份草稿">
              <ArrowDownRight strokeWidth={1.2} />
              <TextRoll text="比较两份草稿" />
            </a>
            <a className="hero__text-link roll-trigger" href="#practice">
              <TextRoll text="自己写一份" /><ArrowRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
