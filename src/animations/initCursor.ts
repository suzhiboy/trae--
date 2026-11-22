export function initCursor(cursor: HTMLElement) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;

  const label = cursor.querySelector<HTMLElement>('[data-cursor-label]');
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;
  let frame = 0;

  const onMove = (event: PointerEvent) => {
    targetX = event.clientX;
    targetY = event.clientY;
    cursor.dataset.visible = 'true';
  };
  const onOver = (event: PointerEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('a, button, [data-cursor]');
    if (!target) return;
    cursor.dataset.active = 'true';
    if (label) label.textContent = target.dataset.cursor || 'OPEN';
  };
  const onOut = (event: PointerEvent) => {
    if ((event.relatedTarget as HTMLElement | null)?.closest?.('a, button, [data-cursor]')) return;
    cursor.dataset.active = 'false';
  };

  const render = () => {
    // 跟随柔和度：0.16 越小越慢，取消动画只需不启动此循环。
    currentX += (targetX - currentX) * 0.16;
    currentY += (targetY - currentY) * 0.16;
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    frame = requestAnimationFrame(render);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onOver);
  document.addEventListener('pointerout', onOut);
  frame = requestAnimationFrame(render);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerover', onOver);
    document.removeEventListener('pointerout', onOut);
  };
}
