import { useEffect, useRef, useState } from 'react';
import SplitType from 'split-type';
import { gsap } from '../animations/motion';
import TextRoll from './TextRoll';

export default function Footer() {
  const brand = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');

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

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copyEmail = async () => {
    const email = 'hello@example.com';
    let succeeded = false;
    try {
      await navigator.clipboard.writeText(email);
      succeeded = true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = email;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        succeeded = document.execCommand('copy');
      } catch {
        succeeded = false;
      } finally {
        textarea.remove();
      }
    }
    setCopyState(succeeded ? 'copied' : 'error');
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <footer className="footer section-shell" id="contact">
      <div className="footer__top"><span>05 / CONTACT</span><span><i className="status-dot" />AVAILABLE FOR DEMOS</span></div>
      <div className="footer__brand-wrap"><div className="footer__brand display-font" ref={brand} aria-label="Detective">DETECTIVE</div></div>
      <div className="footer__grid">
        <div><h2>{language === 'zh' ? '让复杂系统，变得可以理解。' : 'Make complex systems understandable.'}</h2><p>{language === 'zh' ? '从一次问答开始，把证据和下一步讲清楚。' : 'Start with one answer. Make the evidence and next step clear.'}</p></div>
        <div className="footer__links"><h3>CAPABILITIES</h3><a href="#works" className="roll-trigger"><TextRoll text="诊断案例" /></a><a href="#expertise" className="roll-trigger"><TextRoll text="知识领域" /></a><a href="#methodology" className="roll-trigger"><TextRoll text="系统方法" /></a></div>
        <div className="footer__links"><h3>SOCIAL</h3><a href="https://github.com/" target="_blank" rel="noreferrer" className="roll-trigger"><TextRoll text="GitHub" /></a><a href="#highlights" className="roll-trigger"><TextRoll text="Field Notes" /></a><a href="#home" className="roll-trigger"><TextRoll text="Back to Top" /></a></div>
        <div className="footer__contact"><h3>EMAIL</h3><button onClick={copyEmail} className="roll-trigger" aria-live="polite"><TextRoll text={copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'hello@example.com'} /></button><span>{copyState === 'copied' ? '邮箱已复制到剪贴板' : copyState === 'error' ? '复制失败，请手动复制邮箱' : '点击复制演示邮箱'}</span></div>
      </div>
      <div className="footer__bottom">
        <span>© 2026 KNOWLEDGE DETECTIVE</span>
        <button onClick={() => setLanguage((value) => value === 'zh' ? 'en' : 'zh')} className="roll-trigger" aria-label="切换页脚语言"><TextRoll text={language === 'zh' ? 'ENGLISH' : '中文'} /></button>
        <span>{language === 'zh' ? '本地规则 · 清晰证据 · 有序路径' : 'LOCAL RULES · CLEAR EVIDENCE · ORDERED PATHS'}</span>
      </div>
    </footer>
  );
}
