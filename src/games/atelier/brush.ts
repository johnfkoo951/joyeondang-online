// 글과 빛이 드는 곳의 붓(글씨·수채) 공용 계산과 그리기. 판정 계산은 순수 함수라 단위 시험이 바로 부른다.
export type Point = { x: number; y: number; time: number; pressure: number; pointerType: string };
export function brushRadius(p: Point, previous: Point | null, size: number) {
  const speed = previous ? Math.hypot(p.x - previous.x, p.y - previous.y) / Math.max(1, p.time - previous.time) : 0;
  // 필압을 주지 않는 기기는 누르는 동안 0.5(또는 0·1)로 고정해 보낸다. 그때는 마우스처럼 속도로 굵기를 정한다
  const real = p.pointerType === 'pen' ? p.pressure > 0 : p.pointerType === 'touch' && p.pressure > 0 && p.pressure < 1 && p.pressure !== 0.5;
  const pressure = real ? p.pressure : 0.78 / (1 + speed * 0.8);
  return size * (0.18 + Math.max(0, Math.min(1, pressure)) * 0.82);
}
/** 체본 덮인 비율과 바깥으로 벗어난 먹 비율. 체본(옅은 가이드)과 손님 먹은 서로 다른 마스크라 체본이 먹으로 세어지지 않는다 */
export function coverage(guide: Uint8Array, ink: Uint8Array, tolerance: Uint8Array = guide) {
  let expected = 0, covered = 0, painted = 0, outside = 0;
  for (let i = 0; i < guide.length; i++) {
    if (guide[i]) { expected++; if (ink[i]) covered++; }
    if (ink[i]) { painted++; if (!tolerance[i]) outside++; }
  }
  const ratio = expected ? covered / expected : 0;
  const overflow = painted ? outside / painted : 0;
  return { ratio, overflow, complete: expected > 0 && ratio >= 0.6 && overflow <= 0.3 };
}
export function alphaMask(data: Uint8ClampedArray, threshold = 45) {
  const out = new Uint8Array(data.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] >= threshold ? 1 : 0;
  return out;
}
export function dilate(mask: Uint8Array, width: number, radius = 4) {
  const out = new Uint8Array(mask.length), height = mask.length / width;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height) out[yy * width + xx] = 1;
    }
  }
  return out;
}
/** 먹 번짐: 획을 따라 살짝 흔들리는 원을 겹쳐 찍고 가장자리를 흐린다(획 끝 비백은 dryTip) */
export function inkSegment(g: CanvasRenderingContext2D, p: Point, previous: Point | null, size: number) {
  const from = previous ?? p;
  const radius = brushRadius(p, previous, size);
  const distance = Math.hypot(p.x - from.x, p.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.35)));
  g.save(); g.fillStyle = '#272720';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = from.x + (p.x - from.x) * t, y = from.y + (p.y - from.y) * t;
    const jitter = Math.sin(x * 0.6 + y * 0.3) * 0.6;
    g.shadowColor = '#29271d70'; g.shadowBlur = 1.7;
    g.beginPath(); g.ellipse(x + jitter, y - jitter, radius, radius * .88, .1, 0, Math.PI * 2); g.fill();
  }
  g.restore(); return radius;
}
export function dryTip(g: CanvasRenderingContext2D, p: Point, before: Point | null, r: number) {
  if (!before) return;
  const dx = p.x - before.x, dy = p.y - before.y, length = Math.hypot(dx, dy);
  if (length < .5) return;
  const ux = dx / length, uy = dy / length;
  g.save(); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = .4; g.lineWidth = .7;
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.moveTo(p.x - ux * r - uy * i, p.y - uy * r + ux * i);
    g.lineTo(p.x + ux * r * .5 - uy * i, p.y + uy * r * .5 + ux * i); g.stroke();
  }
  g.restore();
}
export function waterSegment(g: CanvasRenderingContext2D, p: Point, previous: Point | null, size: number, color: string, water: number) {
  const from = previous ?? p, r = brushRadius(p, previous, size);
  const step = Math.max(1.2, r * 0.18);
  const n = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / step));
  g.save();
  for (let i = previous ? 1 : 0; i <= n; i++) {
    const x = from.x + (p.x - from.x) * i / n, y = from.y + (p.y - from.y) * i / n;
    // 물이 많을수록 옅고 넓게 번진다
    const spread = r * (1 + water * 0.35);
    const wash = g.createRadialGradient(x, y, 0, x, y, spread);
    wash.addColorStop(0, color + '30');
    wash.addColorStop(0.7, color + '24');
    wash.addColorStop(0.9, color + '38'); // 마르면서 가장자리에 고이는 물감
    wash.addColorStop(1, color + '00');
    g.globalAlpha = 0.16 + (1 - water) * 0.22;
    g.fillStyle = wash;
    g.beginPath(); g.arc(x, y, spread, 0, Math.PI * 2); g.fill();
    if (i % 4 === 0) {
      g.globalAlpha = 0.05; g.fillStyle = color;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + Math.sin(k * 12.9 + x) * r * 0.6, y + Math.cos(k * 7.3 + y) * r * 0.6, 0.8, 0, Math.PI * 2); g.fill(); }
    }
  }
  g.restore();
}
export function downloadCanvas(canvas: HTMLCanvasElement, name: string, text?: string) {
  const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height + (text ? 70 : 0);
  const g = copy.getContext('2d')!; g.fillStyle = '#f5efdf'; g.fillRect(0, 0, copy.width, copy.height); g.drawImage(canvas, 0, 0);
  if (text) { g.fillStyle = '#272720'; g.font = '20px serif'; g.fillText(text, 20, copy.height - 25); }
  copy.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }, 'image/png');
}
