import { useEffect, useRef } from 'react';
import { ArrowDownRight, ArrowRight } from 'lucide-react';
import HeroScene from './HeroScene';
import TextRoll from './TextRoll';
import { initHeroTitle } from '../animations/initText';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function Hero({ loaded }: { loaded: boolean }) {
  const title = useRef<HTMLHeadingElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (loaded && title.current) return initHeroTitle(title.current, reducedMotion);
  }, [loaded, reducedMotion]);

  return (
    <section className="hero hero--case" id="home" aria-labelledby="hero-title">
      <HeroScene />
      <div className="hero__meta page-grid">
        <span><i className="status-dot" />LOCAL RULE ENGINE / OFFLINE</span>
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
          <p>同一道函数题，同一个最终答案。系统引用草稿里的原句，指出出错的那一行，再用一道新题让学生自己验证。</p>
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
