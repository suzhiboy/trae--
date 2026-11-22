import type Lenis from 'lenis';
import { gsap } from './motion';

interface MenuOptions {
  element: HTMLElement;
  open: boolean;
  onClose: () => void;
  lenis: Lenis | null;
}

export function initMenu({ element, open, onClose, lenis }: MenuOptions) {
  const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter((item) => item.tabIndex !== -1);
  const previousFocus = document.activeElement as HTMLElement | null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    if (event.key !== 'Tab') return;
    const items = focusable();
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const columns = element.querySelectorAll('[data-menu-column]');

  if (open) {
    lenis?.stop();
    document.body.classList.add('menu-open');
    // 菜单转场时长 0.8s；列链接错峰间隔 0.05s。减弱动效时只保留透明度变化。
    gsap.set(element, { autoAlpha: 1, clipPath: reducedMotion ? 'inset(0)' : 'inset(0 0 100% 0)' });
    if (!reducedMotion) gsap.to(element, { clipPath: 'inset(0 0 0% 0)', duration: 0.8, ease: 'power4.inOut' });
    gsap.fromTo(columns, { y: reducedMotion ? 0 : 42, opacity: 0 }, { y: 0, opacity: 1, duration: reducedMotion ? 0.25 : 0.9, stagger: reducedMotion ? 0 : 0.05, delay: reducedMotion ? 0 : 0.2, ease: 'expo.out' });
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => focusable()[0]?.focus());
  } else {
    gsap.to(element, { clipPath: reducedMotion ? 'inset(0)' : 'inset(0 0 100% 0)', autoAlpha: 0, duration: reducedMotion ? 0.2 : 0.65, ease: 'power4.inOut' });
  }

  return () => {
    gsap.killTweensOf([element, ...columns]);
    document.removeEventListener('keydown', onKeyDown);
    if (open) {
      lenis?.start();
      document.body.classList.remove('menu-open');
      previousFocus?.focus();
    }
  };
}
