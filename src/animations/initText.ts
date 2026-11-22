import SplitType from 'split-type';
import { gsap, ScrollTrigger } from './motion';

export function initHeroTitle(element: HTMLElement, reducedMotion: boolean) {
  const split = new SplitType(element, { types: 'lines,chars', lineClass: 'hero-line', charClass: 'hero-char' });
  const copy = element.closest('.hero')?.querySelector('.hero__bottom p');
  const timeline = gsap.timeline();
  timeline.from(split.chars, {
    yPercent: reducedMotion ? 0 : 110,
    opacity: reducedMotion ? 0 : 1,
    duration: reducedMotion ? 0.6 : 1.2,
    stagger: reducedMotion ? 0 : 0.03,
    ease: 'expo.out',
  });
  if (copy) timeline.from(copy, { y: reducedMotion ? 0 : 24, opacity: 0, duration: reducedMotion ? 0.4 : 0.9, ease: 'expo.out' }, reducedMotion ? 0 : 0.35);
  return () => {
    timeline.kill();
    split.revert();
  };
}

export function initReveals(scope: HTMLElement) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splits: SplitType[] = [];
  const context = gsap.context(() => {
    scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => {
      const split = new SplitType(element, { types: 'lines', lineClass: 'reveal-line' });
      splits.push(split);
      split.lines?.forEach((line) => {
        const mask = document.createElement('span');
        mask.className = 'line-mask';
        line.parentNode?.insertBefore(mask, line);
        mask.appendChild(line);
      });
      gsap.from(split.lines, {
        yPercent: reducedMotion ? 0 : 110,
        opacity: 0,
        duration: reducedMotion ? 0.6 : 1,
        stagger: reducedMotion ? 0 : 0.06,
        ease: 'expo.out',
        scrollTrigger: { trigger: element, start: 'top 85%', once: true },
      });
    });

    scope.querySelectorAll<HTMLElement>('[data-image-reveal]').forEach((element) => {
      const image = element.querySelector('img');
      const trigger = { trigger: element, start: 'top 88%', once: true };
      if (reducedMotion) {
        gsap.fromTo(element, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'expo.out', scrollTrigger: trigger });
      } else {
        gsap.fromTo(element, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 1.1, ease: 'power4.inOut', scrollTrigger: trigger });
        if (image) gsap.fromTo(image, { scale: 1.2 }, { scale: 1, duration: 1.2, ease: 'expo.out', scrollTrigger: trigger });
      }
    });

    scope.querySelectorAll<HTMLElement>('[data-counter]').forEach((element) => {
      const target = Number(element.dataset.counter || 0);
      const pad = Number(element.dataset.counterPad || 4);
      const state = { value: 0 };
      gsap.to(state, {
        value: target,
        duration: reducedMotion ? 0.01 : 1.2,
        ease: 'expo.out',
        onUpdate: () => { element.textContent = Math.round(state.value).toString().padStart(pad, '0'); },
        scrollTrigger: { trigger: element, start: 'top 90%', once: true },
      });
    });
  }, scope);

  ScrollTrigger.refresh();
  return () => {
    context.revert();
    splits.forEach((split) => split.revert());
  };
}
