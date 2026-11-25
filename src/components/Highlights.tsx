import { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type Swiper from 'swiper';
import 'swiper/css';
import { highlights } from '../data/site';
import { gsap } from '../animations/motion';
import TextRoll from './TextRoll';

export default function Highlights() {
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let swiper: Swiper | null = null;
    let previousTranslate = 0;
    let run = 0;
    let cancelled = false;
    let inView = false;

    const teardown = () => {
      swiper?.destroy(true, true);
      swiper = null;
      previousTranslate = 0;
    };

    const setup = async () => {
      if (!inView) return;
      const current = ++run;
      teardown();
      const nativeScroll = !desktop.matches || reducedMotion.matches;
      element.classList.toggle('native-scroll', nativeScroll);
      if (nativeScroll) return;

      // 桌面端滚动到附近才加载 Swiper；移动端走原生横向滚动，不下载该模块。
      const [{ default: SwiperCtor }, { FreeMode }] = await Promise.all([
        import('swiper'),
        import('swiper/modules'),
      ]);
      if (cancelled || current !== run) return;

      swiper = new SwiperCtor(element, {
        modules: [FreeMode],
        slidesPerView: 1.15,
        spaceBetween: 18,
        freeMode: { enabled: true, momentum: true, momentumRatio: 0.7 },
        breakpoints: { 900: { slidesPerView: 2.25 }, 1280: { slidesPerView: 2.65 } },
        on: {
          setTranslate(instance) {
            const delta = instance.translate - previousTranslate;
            previousTranslate = instance.translate;
            // 拖拽速度映射到 -8°～8°；松手后回正。
            const skew = Math.max(-8, Math.min(8, delta * 0.16));
            gsap.to(element.querySelectorAll('.highlight-card'), { skewX: skew, duration: 0.25, overwrite: true });
          },
          touchEnd() {
            gsap.to(element.querySelectorAll('.highlight-card'), { skewX: 0, duration: 0.8, ease: 'elastic.out(1, 0.45)' });
          },
          transitionEnd() {
            gsap.to(element.querySelectorAll('.highlight-card'), { skewX: 0, duration: 0.6, ease: 'expo.out' });
          },
        },
      });
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'undefined') {
      inView = true;
      void setup();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        inView = true;
        observer?.disconnect();
        void setup();
      }, { rootMargin: '300px' });
      observer.observe(element);
    }
    desktop.addEventListener('change', setup);
    reducedMotion.addEventListener('change', setup);
    return () => {
      cancelled = true;
      run += 1;
      observer?.disconnect();
      desktop.removeEventListener('change', setup);
      reducedMotion.removeEventListener('change', setup);
      teardown();
      gsap.killTweensOf(element.querySelectorAll('.highlight-card'));
    };
  }, []);

  return (
    <section className="highlights section-shell" id="highlights" aria-labelledby="highlights-title">
      <div className="section-heading">
        <div><span className="section-index">01 / EVIDENCE</span><h2 id="highlights-title" data-reveal>三条证据，不是一句猜测。</h2></div>
        <span className="section-count" data-counter="3" data-counter-pad="4">0000</span>
      </div>
      <div className="highlights-viewport" ref={viewport} data-cursor="DRAG">
        <div className="swiper-wrapper">
          {highlights.map((item, index) => (
            <article className="swiper-slide highlight-card" key={item.id}>
              <a href={item.id === 'path' ? '#methodology' : '#works'} className="roll-trigger" data-cursor="VIEW">
                <figure className="highlight-card__image" data-image-reveal>
                  <img src={item.image} alt={`${item.title}抽象技术插图`} width={1280} height={719} loading="lazy" decoding="async" />
                  <span className="highlight-card__tag"><i className="status-dot" />{item.tag}</span>
                </figure>
                <div className="highlight-card__meta"><span>{item.kind}</span><ArrowUpRight className="card-arrow" strokeWidth={1.2} /></div>
                <h3><TextRoll text={item.title} /></h3>
                <p>{item.description}</p>
                <span className="card-number">000{index + 1} / 0003</span>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
