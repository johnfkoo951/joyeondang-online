import * as THREE from 'three';

// 그림 파일 없이 캔버스로 만드는 재질. 같은 씨앗이면 늘 같은 무늬가 나온다.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function finish(c: HTMLCanvasElement, repeat: [number, number] = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

/** 마루: 판자 줄과 결 */
export function planks(tones: string[], seed = 7, grain = 'rgba(0,0,0,0.12)') {
  const [c, g] = canvas(512, 512);
  const r = rng(seed);
  const rows = 8;
  const rh = 512 / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 200;
    while (x < 512) {
      const len = 160 + r() * 220;
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      g.fillRect(x, i * rh, len, rh);
      g.strokeStyle = grain;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        const y = i * rh + 4 + r() * (rh - 8);
        g.moveTo(x, y);
        g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.7, y + (r() - 0.5) * 6, x + len, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x, i * rh, 2, rh);
      x += len;
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, i * rh, 512, 2);
  }
  return finish(c);
}

/** 돌·타일 바닥: 줄눈 격자 */
export function tiles(base: string, grout: string, n = 4, seed = 3) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  const s = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = base;
    g.fillRect(i * s, j * s, s, s);
    g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.1})`;
    g.fillRect(i * s, j * s, s, s);
  }
  g.strokeStyle = grout;
  g.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke();
  }
  return finish(c);
}

/** 벽: 아래 띠(허리판·돌 밑단)와 위 칠. silver면 띠 위에 은빛 선 */
export function bandWall(top: string, band: string, bandRatio: number, silver?: string) {
  const [c, g] = canvas(16, 256);
  g.fillStyle = top;
  g.fillRect(0, 0, 16, 256);
  const y = 256 * (1 - bandRatio);
  g.fillStyle = band;
  g.fillRect(0, y, 16, 256 - y);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, y - 3, 16, 3);
  if (silver) {
    g.fillStyle = silver;
    g.fillRect(0, y - 6, 16, 3);
    g.fillRect(0, 6, 16, 2);
  }
  const t = finish(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 한지: 은은한 섬유 */
export function hanji(base: string, seed = 11) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,100,70,0.10)';
  for (let i = 0; i < 160; i++) {
    g.beginPath();
    const x = r() * 256, y = r() * 256;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 50, y + (r() - 0.5) * 50);
    g.stroke();
  }
  return finish(c);
}

/** 잔디: 잔점 */
export function lawn(base: string, seed = 5) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,230,0.08)' : 'rgba(0,30,0,0.10)';
    g.fillRect(r() * 256, r() * 256, 2, 3);
  }
  return finish(c);
}

/** 러그: 테두리 있는 직물 */
export function rug(base: string, border: string) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = border;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = base;
  g.fillRect(18, 18, 220, 220);
  g.strokeStyle = border;
  g.lineWidth = 3;
  g.strokeRect(34, 34, 188, 188);
  g.strokeRect(70, 70, 116, 116);
  return finish(c);
}

/** 종이 인형 자리: 위가 둥근 종이 카드(그림이 확정되면 이 텍스처를 그림으로 바꾼다) */
export function dollCard(color: string) {
  const [c, g] = canvas(128, 288);
  const path = new Path2D();
  path.moveTo(10, 278);
  path.lineTo(10, 64);
  path.arc(64, 64, 54, Math.PI, 0);
  path.lineTo(118, 278);
  path.closePath();
  g.fillStyle = '#fbf6ec';
  g.fill(path);
  g.save();
  g.translate(64, 150);
  g.scale(0.84, 0.92);
  g.translate(-64, -150);
  g.fillStyle = color;
  g.fill(path);
  g.restore();
  g.setLineDash([6, 6]);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  g.stroke(path);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 바닥 그림자 */
export function blob() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** 회벽: 잔 얼룩과 흙손 자국. 색 지도와 요철 지도로 함께 쓴다. */
export function plaster(base: string, seed = 21, strength = 0.06) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = r() * 256, y = r() * 256, s = 2 + r() * 14;
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${strength * r()})` : `rgba(0,0,0,${strength * r()})`;
    g.beginPath();
    g.ellipse(x, y, s, s * (0.4 + r() * 0.6), r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

/** 하늘: 위는 맑은 파랑, 지평선 쪽은 따뜻한 회백색 */
export function sky(top: string, horizon: string) {
  const [c, g] = canvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.75, horizon);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
