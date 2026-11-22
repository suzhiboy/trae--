import { gsap } from './motion';

export function initMethodology(section: HTMLElement) {
  if (!window.matchMedia('(min-width: 900px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => undefined;
  }

  const pin = section.querySelector<HTMLElement>('.methodology-pin');
  if (!pin) return () => undefined;
  const layers = gsap.utils.toArray<HTMLElement>(section.querySelectorAll('.method-layer'));
  const steps = gsap.utils.toArray<HTMLElement>(section.querySelectorAll('.method-step'));

  const context = gsap.context(() => {
    let active = 0;
    const activate = (index: number) => {
      if (index === active) return;
      active = index;
      layers.forEach((layer, layerIndex) => {
        gsap.to(layer, { opacity: layerIndex === index ? 1 : 0.3, borderColor: layerIndex === index ? '#fafafa' : 'rgba(255,255,255,0.18)', duration: 0.35, overwrite: 'auto' });
      });
      steps.forEach((step, stepIndex) => {
        gsap.to(step, { autoAlpha: stepIndex === index ? 1 : 0, y: stepIndex === index ? 0 : stepIndex < index ? -24 : 24, duration: 0.45, ease: 'expo.out', overwrite: 'auto' });
      });
    };

    gsap.set(layers, { z: 0, opacity: 0.3, borderColor: 'rgba(255,255,255,0.18)' });
    gsap.set(layers[0], { opacity: 1, borderColor: '#fafafa' });
    gsap.set(steps, { autoAlpha: 0, y: 24 });
    gsap.set(steps[0], { autoAlpha: 1, y: 0 });

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: pin,
        start: 'top top',
        // 滚动距离 300vh；当前步骤严格对齐 snap 后的层编号。
        end: '+=300%',
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        snap: { snapTo: 1 / (layers.length - 1), duration: { min: 0.2, max: 0.6 }, delay: 0.08, ease: 'power4.inOut' },
        onUpdate: (self) => activate(Math.round(self.progress * (layers.length - 1))),
      },
    });

    timeline.to(layers, {
      z: (index) => index * 78,
      x: (index) => index * 8,
      y: (index) => index * -10,
      duration: 0.9,
      stagger: 0.06,
      ease: 'power4.inOut',
    }, 0);
  }, section);

  return () => context.revert();
}
