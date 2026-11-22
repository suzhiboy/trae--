import { useEffect, useRef } from 'react';
import { initCursor } from '../animations/initCursor';

export default function CustomCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => cursor.current ? initCursor(cursor.current) : undefined, []);
  return <div className="custom-cursor" ref={cursor} data-visible="false" data-active="false"><span data-cursor-label /></div>;
}
