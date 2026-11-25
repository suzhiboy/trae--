import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { expertise } from '../data/site';
import { gsap } from '../animations/motion';
import { initMagnetic } from '../animations/initMagnetic';
import TextRoll from './TextRoll';

export default function Expertise() {
  const [active, setActive] = useState(0);
  const [face, setFace] = useState(-1);
  const root = useRef<HTMLElement>(null);
  const magnetic = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations = Array.from(root.current?.querySelectorAll<HTMLElement>('.expertise-detail') || []).map((detail, index) =>
      gsap.to(detail, { height: index === active ? 'auto' : 0, opacity: index === active ? 1 : 0, duration: reduced ? 0.01 : 0.8, ease: 'power4.inOut', overwrite: true }),
    );
    return () => animations.forEach((animation) => animation.kill());
  }, [active]);

  useEffect(() => {
    const animations = Array.from(root.current?.querySelectorAll<HTMLElement>('.face-variant') || []).map((variant, index) =>
      gsap.to(variant, { opacity: index === face + 1 ? 1 : 0, duration: 0.35, overwrite: true }),
    );
    return () => animations.forEach((animation) => animation.kill());
  }, [face]);

  useEffect(() => {
    if (!root.current) return;
    const context = gsap.context(() => {
      gsap.from('.expertise-word', {
        yPercent: 110,
        opacity: 0,
        stagger: 0.16,
        duration: 1,
        ease: 'expo.out',
        scrollTrigger: { trigger: '.expertise-title', start: 'top 85%', once: true },
      });
    }, root);
    return () => context.revert();
  }, []);

  useEffect(() => magnetic.current ? initMagnetic(magnetic.current) : undefined, []);

  return (
    <section className="expertise section-shell" id="expertise" ref={root} aria-labelledby="expertise-heading">
      <div className="section-heading">
        <div><span className="section-index">03 / EXPERTISE</span><h2 id="expertise-heading" className="expertise-title display-font">
          <span className="word-mask"><span className="expertise-word">Evidence.</span></span>
          <span className="word-mask"><span className="expertise-word">Locate.</span></span>
          <span className="word-mask"><span className="expertise-word">Verify.</span></span>
        </h2></div>
        <span className="section-count" data-counter="8" data-counter-pad="4">0000</span>
      </div>

      <div className="expertise__intro">
        <div className="expertise-face" aria-hidden="true">
          <svg viewBox="0 0 180 180" fill="none">
            <circle cx="90" cy="90" r="72" stroke="currentColor" strokeWidth="1.5" />
            <path d="M90 18V32M90 148V162M18 90H32M148 90H162" stroke="currentColor" />
            <g className="face-variant"><path d="M55 72h16M109 72h16M62 112c16 10 40 10 56 0" stroke="currentColor" strokeWidth="2" /></g>
            <g className="face-variant"><path d="M52 66l20 8M128 66l-20 8M65 116c15-8 35-8 50 0" stroke="currentColor" strokeWidth="2" /></g>
            <g className="face-variant"><circle cx="63" cy="72" r="7" stroke="currentColor" strokeWidth="2" /><circle cx="117" cy="72" r="7" stroke="currentColor" strokeWidth="2" /><path d="M58 108c20 20 44 20 64 0" stroke="currentColor" strokeWidth="2" /></g>
            <g className="face-variant"><path d="M55 72h16M109 72h16M65 120h50M75 100l10-10 10 10" stroke="currentColor" strokeWidth="2" /></g>
          </svg>
        </div>
        <p data-reveal>从题目输入到路径输出，每一层都保留证据、边界和下一步。可信度来自可以复查，而不是复杂的视觉包装。</p>
      </div>

      <div className="expertise-list">
        {expertise.map((item, index) => {
          const expanded = active === index;
          return (
            <article className={`expertise-item ${expanded ? 'is-open' : ''}`} key={item.id} onMouseEnter={() => setFace(index % 3)} onMouseLeave={() => setFace(-1)}>
              <button
                className="expertise-trigger"
                onClick={() => setActive(expanded ? -1 : index)}
                onFocus={() => setFace(index % 3)}
                onBlur={() => setFace(-1)}
                aria-expanded={expanded}
                aria-controls={`expertise-${item.id}`}
                id={`expertise-trigger-${item.id}`}
              >
                <span className="expertise-item__index">{(index + 1).toString().padStart(4, '0')}</span>
                <span className="expertise-item__title">{item.title}<small>{item.english}</small></span>
                <Plus className="expertise-plus" strokeWidth={1.2} />
              </button>
              <div className="expertise-detail" id={`expertise-${item.id}`} role="region" aria-labelledby={`expertise-trigger-${item.id}`} aria-hidden={!expanded}>
                <div className="expertise-detail__inner">
                  <figure data-image-reveal><img src={item.image} alt={`${item.title}抽象结构插图`} loading="lazy" /></figure>
                  <div className="expertise-detail__copy">
                    <p>{item.summary}</p>
                    <div className="expertise-lists">
                      <div><h4>Capabilities</h4><ul>{item.capabilities.map((entry) => <li key={entry}>{entry}</li>)}</ul></div>
                      <div><h4>Services</h4><ul>{item.services.map((entry) => <li key={entry}>{entry}</li>)}</ul></div>
                    </div>
                    <div className="expertise-actions">
                      <a href="#compare" tabIndex={expanded ? 0 : -1} className="outline-button roll-trigger"><TextRoll text="LIVE DEMO" /></a>
                      <a href="#methodology" tabIndex={expanded ? 0 : -1} className="outline-button roll-trigger"><TextRoll text="DETAILS" /></a>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="expertise-outro">
        <p data-reveal>不是给出更多内容，而是把该先理解的内容排在前面。</p>
        <a href="#compare" ref={magnetic} className="solid-button roll-trigger"><TextRoll text="COMPARE TWO DRAFTS" /></a>
      </div>
    </section>
  );
}
