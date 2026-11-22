import { useEffect, useRef } from 'react';
import { ArrowDownRight } from 'lucide-react';
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
    <section className="hero" id="home" aria-labelledby="hero-title">
      <HeroScene />
      <div className="hero__meta page-grid">
        <span><i className="status-dot" />RULE-BASED DIAGNOSIS</span>
        <span>HIGH SCHOOL MATHEMATICS</span>
        <span>CN / 2026</span>
      </div>
      <div className="hero__content page-shell">
        <h1 id="hero-title" ref={title} className="hero__title display-font">
          <span>KNOWLEDGE</span>
          <span>DETECTIVE</span>
        </h1>
        <div className="hero__bottom">
          <p>从错答找到该先复习的知识点。<br />把复杂知识系统，讲成一条可以检查的证据链。</p>
          <a className="circle-link roll-trigger" href="#highlights" data-cursor="VIEW" aria-label="探索诊断系统">
            <ArrowDownRight strokeWidth={1.2} />
            <TextRoll text="EXPLORE" />
          </a>
        </div>
      </div>
    </section>
  );
}
