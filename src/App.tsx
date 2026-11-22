import { useCallback, useEffect, useRef, useState } from 'react';
import Loader from './components/Loader';
import Menu from './components/Menu';
import Hero from './components/Hero';
import Highlights from './components/Highlights';
import FeaturedWorks from './components/FeaturedWorks';
import Expertise from './components/Expertise';
import Methodology from './components/Methodology';
import Footer from './components/Footer';
import CustomCursor from './components/CustomCursor';
import { useLenis } from './hooks/useLenis';
import { initReveals } from './animations/initText';
import { ScrollTrigger } from './animations/motion';

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const complete = useCallback(() => setLoaded(true), []);
  const lenis = useLenis(loaded);

  useEffect(() => {
    document.body.style.overflow = loaded ? '' : 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !root.current) return;
    const cleanup = initReveals(root.current);
    let disposed = false;
    document.fonts.ready.then(() => { if (!disposed) ScrollTrigger.refresh(); });
    return () => { disposed = true; cleanup(); };
  }, [loaded]);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <>
      {!loaded && <Loader onComplete={complete} />}
      <CustomCursor />
      <Menu lenis={lenis} />
      <div ref={root}>
        <main>
          <Hero loaded={loaded} />
          <Highlights />
          <FeaturedWorks />
          <Expertise />
          <Methodology />
        </main>
        <Footer />
      </div>
    </>
  );
}
