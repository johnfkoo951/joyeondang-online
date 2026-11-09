// 끌어 놓기: 포인터로 끌면 카드가 손가락을 따라오고, 놓은 자리 아래의 [data-drop] 요소를 알려 준다.
// 탭(거의 안 움직임)은 평소 click으로 처리되게 둔다(키보드 Enter·Space도 같은 click). 실제로 끈 뒤 오는 click 하나만 막는다.
import type { PointerEvent as ReactPointerEvent } from 'react';

const dragged = new WeakMap<Element, number>();
const THRESHOLD = 8;
/** 끌기를 마친 뒤 이 시간 안에 오는 click은 끌기의 꼬리로 본다 */
const CLICK_TAIL_MS = 450;

/** 방금 끌기를 마친 요소의 click이면 true(그 click은 무시한다) */
export function wasDragged(el: Element | null): boolean {
  if (!el) return false;
  const t = dragged.get(el);
  if (t === undefined) return false;
  dragged.delete(el);
  return performance.now() - t < CLICK_TAIL_MS;
}

function dropAt(x: number, y: number, self: HTMLElement): HTMLElement | null {
  for (const hit of document.elementsFromPoint(x, y)) {
    if (!(hit instanceof HTMLElement) || self.contains(hit)) continue;
    const d = hit.closest<HTMLElement>('[data-drop]');
    if (d) return d;
  }
  return null;
}

/**
 * onPointerDown에서 부른다. 끌어서 [data-drop] 위에 놓으면 onDrop(그 요소).
 * 끄는 동안 카드에 data-dragging, 아래 놓일 자리에 data-over를 붙인다(모양은 CSS가).
 */
export function beginDrag(e: ReactPointerEvent<HTMLElement>, onDrop: (drop: HTMLElement) => void) {
  if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const el = e.currentTarget;
  const id = e.pointerId;
  const sx = e.clientX;
  const sy = e.clientY;
  let moving = false;
  let over: HTMLElement | null = null;
  try {
    el.setPointerCapture(id);
  } catch {}

  const setOver = (next: HTMLElement | null) => {
    if (next === over) return;
    over?.removeAttribute('data-over');
    next?.setAttribute('data-over', '');
    over = next;
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!moving) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      moving = true;
      el.setAttribute('data-dragging', '');
    }
    ev.preventDefault();
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    setOver(dropAt(ev.clientX, ev.clientY, el));
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    try {
      el.releasePointerCapture(id);
    } catch {}
    if (!moving) return;
    const target = ev.type === 'pointerup' ? dropAt(ev.clientX, ev.clientY, el) : null;
    el.style.transform = '';
    el.removeAttribute('data-dragging');
    setOver(null);
    dragged.set(el, performance.now());
    if (target) onDrop(target);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
