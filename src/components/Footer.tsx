import { useEffect, useRef } from 'react';
import SplitType from 'split-type';
import { gsap } from '../animations/motion';
import TextRoll from './TextRoll';

export default function Footer() {
  const brand = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!brand.current) return;
    const split = new SplitType(brand.current, { types: 'chars', charClass: 'footer-char' });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tween = gsap.from(split.chars, {
      yPercent: reduced ? 0 : 110,
      opacity: 0,
      stagger: reduced ? 0 : 0.045,
      duration: reduced ? 0.6 : 1.1,
      ease: 'expo.out',
      scrollTrigger: { trigger: brand.current, start: 'top 92%', once: true },
    });
    return () => { tween.kill(); split.revert(); };
  }, []);

  return (
    <footer className="footer section-shell" id="contact">
      <div className="footer__top"><span>05 / EVIDENCE</span><span><i className="status-dot" />LOCAL CORE / NO API KEY REQUIRED</span></div>
      <div className="footer__brand-wrap"><div className="footer__brand display-font" ref={brand} aria-label="Detective">DETECTIVE</div></div>
      <div className="footer__grid">
        <div>
          <h2>同一个答案，给出不同的下一步。</h2>
          <p>从草稿定位到变式验证，核心演示不需要 API Key。模型服务只是可选的补充，不是演示成立的前提；字体与插图在首次加载时需要网络。</p>
        </div>
        <div className="footer__links">
          <h3>DEMO</h3>
          <a href="#compare" className="roll-trigger"><TextRoll text="比较两份草稿" /></a>
          <a href="#practice" className="roll-trigger"><TextRoll text="自己写一份" /></a>
          <a href="#methodology" className="roll-trigger"><TextRoll text="方法说明" /></a>
        </div>
        <div className="footer__links">
          <h3>EVIDENCE</h3>
          <a href="#methodology" className="roll-trigger"><TextRoll text="自动化测试" /></a>
          <a href="#contact" className="roll-trigger"><TextRoll text="真人试用 / 待验证" /></a>
          <a href="#methodology" className="roll-trigger"><TextRoll text="适用边界" /></a>
        </div>
        <div className="footer__contact">
          <h3>STATUS</h3>
          <span>规则引擎：本地运行</span>
          <span>自动化测试：npm test</span>
          <span>真人试用：待验证</span>
          <span>核心演示：不依赖模型</span>
        </div>
      </div>
      <div className="footer__bottom">
        <span>© 2026 KNOWLEDGE DETECTIVE</span>
        <a href="#home" className="roll-trigger"><TextRoll text="BACK TO TOP" /></a>
        <span>本地规则 · 证据优先 · 无需 API Key</span>
      </div>
    </footer>
  );
}
