'use client';
import { useEffect, useRef } from 'react';

export type PigmentToken =
  | '--art-cobalt'
  | '--art-vermilion'
  | '--art-green'
  | '--art-yellow'
  | '--art-orange'
  | '--art-pink';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawCrayonSphere(canvas: HTMLCanvasElement, fillCss: string, seed: number) {
  const N = 260;
  canvas.width = N;
  canvas.height = N;
  const g = canvas.getContext('2d');
  if (!g) return;

  const rnd = mulberry32(seed);
  const R = N / 2 - 4;
  g.clearRect(0, 0, N, N);
  g.save();
  g.beginPath();
  g.arc(N / 2, N / 2, R, 0, Math.PI * 2);
  g.clip();

  // 1. 바탕 안료
  g.fillStyle = fillCss;
  g.fillRect(0, 0, N, N);

  // 2. 사선 오일파스텔·크레용 결 스트로크
  for (let i = 0; i < 340; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const len = 12 + rnd() * 34;
    const ang = -0.68 + (rnd() - 0.5) * 0.42;
    const light = rnd() < 0.52;
    g.strokeStyle = light
      ? `rgba(255, 252, 244, ${0.07 + rnd() * 0.14})`
      : `rgba(20, 14, 8, ${0.05 + rnd() * 0.11})`;
    g.lineWidth = 1.6 + rnd() * 3.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }

  // 3. 미세한 도화지 결 입자
  for (let i = 0; i < 130; i++) {
    g.fillStyle = `rgba(255, 250, 238, ${0.16 + rnd() * 0.28})`;
    g.fillRect(rnd() * N, rnd() * N, 1.5 + rnd() * 2.5, 1.5);
  }

  // 4. 좌상단 광원 3단 판화식 명암
  const sh = g.createRadialGradient(N * 0.35, N * 0.31, 0, N * 0.35, N * 0.31, N * 0.92);
  sh.addColorStop(0, 'rgba(20, 10, 0, 0)');
  sh.addColorStop(0.52, 'rgba(20, 10, 0, 0)');
  sh.addColorStop(0.53, 'rgba(20, 10, 0, 0.15)');
  sh.addColorStop(0.75, 'rgba(20, 10, 0, 0.15)');
  sh.addColorStop(0.76, 'rgba(20, 10, 0, 0.31)');
  sh.addColorStop(1, 'rgba(20, 10, 0, 0.31)');
  g.fillStyle = sh;
  g.fillRect(0, 0, N, N);

  // 5. 크림빛 반짝임 타원
  g.save();
  g.translate(N * 0.33, N * 0.29);
  g.rotate(-0.58);
  g.fillStyle = 'rgba(255, 253, 246, 0.94)';
  g.beginPath();
  g.ellipse(0, 0, N * 0.105, N * 0.062, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.restore();
}

/** 수작업 오일파스텔·크레용 결이 살아 있는 입체 구슬 캔버스 */
export function CrayonOrb({
  token,
  seed,
  className,
}: {
  token: PigmentToken;
  seed: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const paint = () => {
      const el = ref.current;
      if (!el) return;
      const col = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888';
      drawCrayonSphere(el, col, seed);
    };
    paint();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', paint);
    const mo = new MutationObserver(paint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq?.removeEventListener('change', paint);
      mo.disconnect();
    };
  }, [token, seed]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
