import { gsap, ScrollTrigger } from './motion';

interface KillableAnimation {
  kill: () => void;
}

export function initPractice(root: HTMLElement, reducedMotion: boolean) {
  const animations: KillableAnimation[] = [];
  const exiting: HTMLElement[] = [];
  let refreshFrame = 0;

  const refresh = () => {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
  observer?.observe(root);

  const exitQuestion = () => {
    if (reducedMotion) return;
    const question = root.querySelector<HTMLElement>('[data-practice-question]');
    const stage = question?.parentElement;
    if (!question || !stage) return;

    const clone = question.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-practice-question');
    clone.setAttribute('aria-hidden', 'true');
    clone.classList.add('practice-question-exit');
    clone.style.top = `${question.offsetTop}px`;
    clone.style.left = `${question.offsetLeft}px`;
    clone.style.width = `${question.offsetWidth}px`;
    clone.querySelectorAll<HTMLElement>('[data-testid], [id]').forEach((element) => {
      element.removeAttribute('data-testid');
      element.removeAttribute('id');
    });
    clone.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach((element) => {
      element.disabled = true;
      element.tabIndex = -1;
    });
    stage.appendChild(clone);
    exiting.push(clone);
    animations.push(gsap.to(clone, {
      y: -56,
      autoAlpha: 0,
      duration: 0.35,
      ease: 'power2.in',
      onComplete: () => {
        clone.remove();
        const index = exiting.indexOf(clone);
        if (index >= 0) exiting.splice(index, 1);
      },
    }));
  };

  const enterQuestion = () => {
    const question = root.querySelector<HTMLElement>('[data-practice-question]');
    if (!question) return;
    animations.push(gsap.fromTo(
      question,
      reducedMotion
        ? { opacity: 0 }
        : { clipPath: 'inset(0 0 100% 0)', opacity: 0.35 },
      {
        clipPath: 'inset(0 0 0% 0)',
        opacity: 1,
        duration: reducedMotion ? 0.2 : 0.8,
        ease: reducedMotion ? 'none' : 'power4.inOut',
        clearProps: 'clipPath,opacity',
      },
    ));
    refresh();
  };

  const enterDiagnosis = () => {
    const lines = root.querySelectorAll<HTMLElement>('.practice-diagnosis-line__content');
    if (lines.length > 0) {
      animations.push(gsap.fromTo(
        lines,
        reducedMotion ? { opacity: 0 } : { yPercent: 110, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: reducedMotion ? 0.2 : 0.65,
          stagger: reducedMotion ? 0 : 0.07,
          ease: 'power4.out',
          clearProps: 'transform,opacity',
        },
      ));
    }

    const wrongStep = root.querySelector<HTMLElement>('.practice-step.is-wrong');
    if (wrongStep && !reducedMotion) {
      const flash = gsap.timeline();
      flash.to(wrongStep, { boxShadow: '0 0 0 3px rgba(234, 56, 76, 0.72)', duration: 0.12 })
        .to(wrongStep, { boxShadow: '0 0 0 1px rgba(234, 56, 76, 0)', duration: 0.22 });
      animations.push(flash);
    }
    refresh();
  };

  refresh();

  return {
    exitQuestion,
    enterQuestion,
    enterDiagnosis,
    destroy: () => {
      cancelAnimationFrame(refreshFrame);
      observer?.disconnect();
      animations.forEach((animation) => animation.kill());
      exiting.forEach((element) => element.remove());
      gsap.killTweensOf(root.querySelectorAll('[data-practice-question], .practice-diagnosis-line__content, .practice-step'));
    },
  };
}

export type PracticeAnimationController = ReturnType<typeof initPractice>;
