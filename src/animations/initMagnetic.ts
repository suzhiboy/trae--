import { gsap } from './motion';

export function initMagnetic(element: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches) return () => undefined;

  const onMove = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    // 感应半径 80px、最大偏移 12px，可在这里调整。
    if (distance > 80) {
      gsap.to(element, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.35)', overwrite: true });
      return;
    }
    const strength = (1 - distance / 80) * 12;
    gsap.to(element, { x: (x / Math.max(distance, 1)) * strength, y: (y / Math.max(distance, 1)) * strength, duration: 0.3, overwrite: true });
  };
  const reset = () => gsap.to(element, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.35)' });

  window.addEventListener('pointermove', onMove, { passive: true });
  element.addEventListener('pointerleave', reset);
  return () => {
    window.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerleave', reset);
    gsap.killTweensOf(element);
  };
}
