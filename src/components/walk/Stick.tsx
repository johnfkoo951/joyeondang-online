'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  /** -1..1. y>0 위(앞), x>0 오른쪽. 놓으면 (0,0) */
  onChange: (x: number, y: number) => void;
  label: string;
  /** move: 왼쪽 걷기(그대로 전달, 끝까지 밀면 달린다), look: 오른쪽 둘러보기(가운데 작은 떨림은 버리고 부드럽게) */
  tone: 'move' | 'look';
};

const R = 42; // 손잡이가 움직이는 반지름(px)
const DEAD = 0.1;

const shape = (v: number) => {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  const t = (a - DEAD) / (1 - DEAD);
  return Math.sign(v) * t * Math.sqrt(t);
};

// 휴대폰 조이스틱. 손가락마다 pointerId를 따로 잡아서 두 스틱을 동시에 쓸 수 있다.
export function Stick({ onChange, label, tone }: Props) {
  const base = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const report = useRef(onChange);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    report.current = onChange;
  });
  // 스틱이 사라질 때(지도·패널이 열릴 때) 눌린 채로 남지 않게
  useEffect(() => () => report.current(0, 0), []);

  const move = (e: React.PointerEvent) => {
    const r = base.current?.getBoundingClientRect();
    if (!r) return;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    setKnob({ x: dx, y: dy });
    const x = dx / R;
    const y = -dy / R;
    if (tone === 'look') report.current(shape(x), shape(y));
    else report.current(x, y);
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== active.current) return;
    active.current = null;
    setKnob({ x: 0, y: 0 });
    report.current(0, 0);
  };

  return (
    <div
      ref={base}
      className="walk-stick"
      data-tone={tone}
      data-active={knob.x !== 0 || knob.y !== 0 ? 'true' : undefined}
      onPointerDown={(e) => {
        if (active.current !== null) return; // 이미 다른 손가락이 잡고 있다
        active.current = e.pointerId;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 거부돼도 계속 */ }
        e.preventDefault();
        move(e);
      }}
      onPointerMove={(e) => { if (e.pointerId === active.current) move(e); }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      role="application"
    >
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
