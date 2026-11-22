import { useEffect, useRef, useState } from 'react';
import { gsap } from '../animations/motion';
import { RollingNumber } from './RollingDigits';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function Loader({ onComplete }: { onComplete: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const state = { value: 0 };
    const timeline = gsap.timeline();
    // 载入展示时长 1.15s；收起时长 0.8s，可按演示节奏调整。
    timeline.to(state, {
      value: 100,
      duration: reducedMotion ? 0.01 : 1.15,
      ease: 'power4.inOut',
      onUpdate: () => setProgress(Math.round(state.value)),
    });
    timeline.to(root.current, {
      clipPath: 'inset(0 0 100% 0)',
      duration: reducedMotion ? 0.01 : 0.8,
      ease: 'power4.inOut',
      onComplete,
    });
    return () => { timeline.kill(); };
  }, [onComplete, reducedMotion]);

  return (
    <div className="loader" ref={root} role="status" aria-label={`载入 ${progress}%`}>
      <div className="loader__top"><span>KNOWLEDGE DETECTIVE</span><span>SYSTEM / INITIALIZING</span></div>
      <RollingNumber value={progress} pad={3} className="loader__number" />
      <div className="loader__bottom"><span>错答 → 证据 → 路径</span><span>000—100</span></div>
    </div>
  );
}
