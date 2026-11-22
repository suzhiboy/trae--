import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import SplitType from 'split-type';
import { works } from '../data/site';
import { gsap, Observer } from '../animations/motion';
import { RollingNumber } from './RollingDigits';
import TextRoll from './TextRoll';

export default function FeaturedWorks() {
  const [current, setCurrent] = useState(0);
  const [previous, setPrevious] = useState(0);
  const root = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const currentImage = useRef<HTMLDivElement>(null);
  const currentRef = useRef(0);
  const locked = useRef(false);
  const firstRender = useRef(true);
  const work = works[current];

  const goTo = useCallback((index: number) => {
    const next = (index + works.length) % works.length;
    if (locked.current || next === currentRef.current) return;
    locked.current = true;
    setPrevious(currentRef.current);
    currentRef.current = next;
    setCurrent(next);
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      locked.current = false;
      return;
    }
    const split = title.current ? new SplitType(title.current, { types: 'chars', charClass: 'work-char' }) : null;
    const timeline = gsap.timeline({ onComplete: () => { locked.current = false; } });
    if (currentImage.current) timeline.fromTo(currentImage.current, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power4.inOut' }, 0);
    if (split?.chars) timeline.from(split.chars, { yPercent: 110, opacity: 0, stagger: 0.03, duration: 0.9, ease: 'expo.out' }, 0.18);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) timeline.timeScale(100);
    return () => {
      timeline.kill();
      split?.revert();
      locked.current = false;
    };
  }, [current]);

  useEffect(() => {
    if (!root.current) return;
    const observer = Observer.create({
      target: root.current,
      type: 'wheel,touch',
      tolerance: 24,
      preventDefault: false,
      onChangeY(self) {
        if (Math.abs(self.deltaY) < 24) return;
        goTo(currentRef.current + (self.deltaY > 0 ? 1 : -1));
      },
    });
    return () => { observer.kill(); };
  }, [goTo]);

  return (
    <section
      className="featured section-shell"
      id="works"
      ref={root}
      tabIndex={0}
      aria-label="典型诊断项目，使用左右方向键切换"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); goTo(current + 1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(current - 1); }
      }}
    >
      <div className="section-heading">
        <div><span className="section-index">02 / FEATURED WORKS</span><h2 data-reveal>让下一步变得清楚。</h2></div>
        <a href="#expertise" className="text-link roll-trigger"><TextRoll text="ALL CAPABILITIES" /></a>
      </div>

      <div className="featured__layout">
        <div className="featured__visual">
          <div className="featured__image featured__image--previous"><img src={works[previous].image} alt="" aria-hidden="true" /></div>
          <div className="featured__image featured__image--current" ref={currentImage}>
            <img src={work.image} alt={`${work.title}数学结构示意图`} />
          </div>
          <span className="featured__category">{work.category}</span>
        </div>

        <div className="featured__content" aria-live="polite">
          <div className="featured__counter"><RollingNumber value={current + 1} /><span>/ 0005</span></div>
          <div className="work-title-mask"><h3 key={current} ref={title}>{work.title}</h3></div>
          <p className="featured__formula">{work.formula}</p>
          <p className="featured__summary">{work.summary}</p>
          <div className="featured__controls">
            <button onClick={() => goTo(current - 1)} className="roll-trigger" aria-label="上一个项目"><ArrowLeft strokeWidth={1.2} /><TextRoll text="PREV" /></button>
            <button onClick={() => goTo(current + 1)} className="roll-trigger" aria-label="下一个项目"><TextRoll text="NEXT" /><ArrowRight strokeWidth={1.2} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
