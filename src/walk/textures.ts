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

/**
 * 다 쓴 캔버스 텍스처의 원본 2D 캔버스를 비운다. three의 dispose는 GPU 쪽만 놓아서, 그냥 두면 쓰레기 수거가
 * 돌 때까지 옛 장면의 캔버스 화소가 새 장면 것과 겹쳐 남는다(집 장면 하나에 십여 MB). 캔버스 텍스처가 아니면 그냥 지나간다.
 * 복제본은 같은 캔버스를 나눠 쓰므로, 그 캔버스를 쓰는 텍스처를 모두 놓은 뒤(장면을 정리할 때)에만 부른다.
 */
export function releaseCanvas(d: unknown) {
  const t = d as { isCanvasTexture?: boolean; image?: { width: number; height: number } | null } | null | undefined;
  if (!t?.isCanvasTexture || !t.image) return;
  t.image.width = 0;
  t.image.height = 0;
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

/** 발밑 그림자의 두 겹: 넓고 옅은 원의 가운데 짙기, 작고 진한 원의 가운데 짙기와 크기(넓은 원에 대한 몫) */
export const BLOB = { wide: 0.25, core: 0.55, coreSize: 0.44 } as const;

/**
 * 발밑 그림자: 넓고 옅은 원 위에 작고 진한 원을 겹쳐 한 장에 담는다. 옅은 원 하나만 있으면 캐릭터가 바닥에서 조금 떠 보인다:
 * 발 바로 밑이 가장 어두워야 바닥에 붙는다. 두 겹을 한 텍스처에 그려 그리기 호출은 그대로 하나다
 */
export function blob() {
  const S = 128, h = S / 2;
  const [c, g] = canvas(S, S);
  const ring = (r0: number, r1: number, alpha: number) => {
    const grad = g.createRadialGradient(h, h, r0, h, h, r1);
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  };
  ring(4, h - 4, BLOB.wide);
  ring(h * BLOB.coreSize * 0.25, h * BLOB.coreSize, BLOB.core);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/**
 * 판 가장자리를 넘는 무늬는 반대쪽에도 그려 이음매 없이 되풀이되게 한다(타일 경계에 반쪽 얼룩이 잘려 줄로 보이지 않게).
 * draw는 (x, y)를 중심으로 반지름 r 안에 그린다.
 */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
    draw(x + ox, y + oy);
  }
}

/**
 * 회벽: 고운 모래 마감. 흐린 큰 얼룩(아주 옅게)과 잔 모래알, 흙손 자국 몇 줄. 색 지도와 요철 지도로 함께 쓴다.
 * 예전에는 지름 수 cm의 얼룩 900개가 1.6m마다 되풀이되어 벽이 때 탄 것처럼 보였다: 얼룩은 크고 옅게, 결은 잘게.
 */
export function plaster(base: string, seed = 21, strength = 0.06) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // 흐린 큰 얼룩: 색이 고르지 않은 손 미장 느낌(가장자리는 이어 그린다)
  for (let i = 0; i < 14; i++) {
    const x = r() * S, y = r() * S, rad = 70 + r() * 120, light = r() > 0.5;
    const a = strength * (0.35 + r() * 0.35);
    wrapped(S, x, y, rad, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, rad);
      grad.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  // 흙손 자국: 옅은 호 몇 줄
  g.lineWidth = 6;
  for (let i = 0; i < 10; i++) {
    const x = r() * S, y = r() * S, rad = 40 + r() * 60, a0 = r() * Math.PI * 2;
    g.strokeStyle = `rgba(255,255,255,${strength * 0.5})`;
    wrapped(S, x, y, rad + 6, (px, py) => { g.beginPath(); g.arc(px, py, rad, a0, a0 + 0.8 + r() * 0.6); g.stroke(); });
  }
  // 잔 모래알(1~2 화소): 가까이 보면 결이 보이고 멀리서는 고르게 섞인다
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S, s = r() > 0.85 ? 2 : 1;
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${strength * (0.8 + r())})` : `rgba(0,0,0,${strength * (0.6 + r())})`;
    g.fillRect(x, y, s, s);
  }
  return finish(c);
}

/**
 * 돌: 잔 반점이 박힌 석회석·화강석. joints면 돌을 쌓은 줄눈(한 단 rows칸, 줄마다 엇갈린 돌)까지 그린다.
 * 판 한 장이 엔진의 실제 크기 UV 한 칸(1.6m)이라, 줄눈 rows=8이면 한 단이 그 여덟째 몫이다.
 */
export function stone(base: string, seed = 31, opt: { joints?: boolean; rows?: number; joint?: string } = {}) {
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  if (opt.joints) {
    // 돌마다 조금씩 다른 톤
    const rows = opt.rows ?? 8;
    const rh = S / rows;
    for (let j = 0; j < rows; j++) {
      let x = -(j % 2) * (S / 6) - r() * 20;
      while (x < S) {
        const len = 34 + r() * 50;
        const tone = (r() - 0.5) * 0.16;
        g.fillStyle = tone > 0 ? `rgba(255,255,255,${tone})` : `rgba(0,0,0,${-tone})`;
        g.fillRect(x, j * rh, len, rh);
        // 줄눈: 아래·오른쪽은 짙게, 위는 밝게(돌 모서리가 둥글게 보인다)
        g.fillStyle = opt.joint ?? 'rgba(60,50,40,0.55)';
        g.fillRect(x + len - 2, j * rh, 2, rh);
        x += len;
      }
      g.fillStyle = opt.joint ?? 'rgba(60,50,40,0.55)';
      g.fillRect(0, j * rh + rh - 2, S, 2);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, j * rh, S, 1);
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const x = r() * S, y = r() * S, rad = 30 + r() * 50, a = 0.025 + r() * 0.03, light = r() > 0.5;
      wrapped(S, x, y, rad, (px, py) => {
        const grad = g.createRadialGradient(px, py, 0, px, py, rad);
        grad.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      });
    }
  }
  // 잔 반점: 줄눈 돌은 또렷하게, 다듬은 돌(기둥·보)은 아주 옅게(가까이서 거친 콘크리트처럼 보이지 않게)
  const k = opt.joints ? 0.6 : 0.35;
  for (let i = 0; i < (opt.joints ? 2600 : 1800); i++) {
    const v = r();
    g.fillStyle = v > 0.7 ? `rgba(255,255,255,${0.22 * k})` : v > 0.35 ? `rgba(0,0,0,${0.12 * k})` : `rgba(90,80,70,${0.16 * k})`;
    g.fillRect(r() * S, r() * S, r() > 0.8 ? 2 : 1, 1);
  }
  return finish(c);
}

/**
 * 기와 처마(가로 8줄 × 세로 4단): 둥근 수키와가 골(암키와) 사이에 솟고, 단마다 윗단이 아랫단을 덮어 그늘이 진다.
 * u는 처마를 따라, v는 비탈을 따라 반복한다(한 칸 = 수키와 하나와 골 하나).
 */
export function roofTiles(seed = 61) {
  const W = 256, H = 256, cols = 8, rows = 4;
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const tones = ['#b4593b', '#a64f34', '#bf6446', '#9e4a30', '#b0603f'];
  const cw = W / cols, rh = H / rows;
  g.fillStyle = '#7d3a26';
  g.fillRect(0, 0, W, H);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * cw, y = j * rh;
    // 골(암키와): 가운데가 조금 어둡게 오목하다
    const pan = g.createLinearGradient(x, 0, x + cw, 0);
    const tone = tones[Math.floor(r() * tones.length)];
    pan.addColorStop(0, tone);
    pan.addColorStop(0.5, 'rgba(90,40,25,1)');
    pan.addColorStop(1, tone);
    g.fillStyle = pan;
    g.globalAlpha = 0.55;
    g.fillRect(x, y, cw, rh);
    g.globalAlpha = 1;
    // 수키와: 둥근 원통(가운데 밝고 양 끝 어둡다)
    const cx = x + cw / 2, half = cw * 0.36;
    const cov = g.createLinearGradient(cx - half, 0, cx + half, 0);
    const t2 = tones[Math.floor(r() * tones.length)];
    cov.addColorStop(0, 'rgba(70,30,18,1)');
    cov.addColorStop(0.35, t2);
    cov.addColorStop(0.55, '#d98a64');
    cov.addColorStop(0.8, t2);
    cov.addColorStop(1, 'rgba(70,30,18,1)');
    g.fillStyle = cov;
    g.fillRect(cx - half, y, half * 2, rh);
    // 윗단 끝이 아랫단을 덮는 그늘과 끝 마구리 빛
    const sh = g.createLinearGradient(0, y, 0, y + rh * 0.3);
    sh.addColorStop(0, 'rgba(40,15,8,0.55)');
    sh.addColorStop(1, 'rgba(40,15,8,0)');
    g.fillStyle = sh;
    g.fillRect(x, y, cw, rh * 0.3);
    g.fillStyle = 'rgba(255,220,190,0.18)';
    g.fillRect(cx - half, y + rh - 3, half * 2, 2);
  }
  return finish(c);
}

/** 따뜻한 빛 웅덩이: 가운데가 밝고 가장자리에서 사라지는 원(더하기 섞기로 벽·바닥에 얹는다) */
export function glow(color = '255,170,90') {
  const S = 128, h = S / 2;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, `rgba(${color},0.3)`);
  grad.addColorStop(0.3, `rgba(${color},0.14)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 그림 묶음 한 장(가로 4칸 × 세로 2칸): 0~3은 1층(따뜻한 유화·식물), 4~7은 2층(먹 산수·매화·달항아리·대나무) */
export const ART = { cols: 4, rows: 2, warm: [0, 1, 2, 3], ink: [4, 5, 6, 7] } as const;

/** 액자 그림 묶음. 글자는 넣지 않는다(뜻이 읽히는 글은 쓰지 않는다) */
export function artAtlas(seed = 77) {
  const C = 256, W = C * ART.cols, H = C * ART.rows;
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const TAU = Math.PI * 2;
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % ART.cols) * C, Math.floor(i / ART.cols) * C);
    g.beginPath();
    g.rect(0, 0, C, C);
    g.clip();
    draw();
    g.restore();
  };
  const fillGrad = (stops: Array<[number, string]>, y0 = 0, y1 = C) => {
    const grad = g.createLinearGradient(0, y0, 0, y1);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, C, C);
  };
  /** 물결 능선 하나를 아래 끝까지 칠한다 */
  const ridge = (base: number, amp: number, freq: number, phase: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, C);
    for (let x = 0; x <= C; x += 4) g.lineTo(x, base + amp * Math.sin(x * freq + phase) + amp * 0.4 * Math.sin(x * freq * 2.7 + phase * 1.7));
    g.lineTo(C, C);
    g.closePath();
    g.fill();
  };
  const hanji = () => {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, C, C);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(140,120,90,${0.04 + r() * 0.05})`;
      g.fillRect(r() * C, r() * C, 1 + r() * 6, 1);
    }
  };
  const seal = (x: number, y: number) => {
    g.fillStyle = '#b03a2e';
    g.fillRect(x, y, 14, 14);
    g.strokeStyle = 'rgba(255,240,230,0.8)';
    g.lineWidth = 1.5;
    g.strokeRect(x + 3, y + 3, 8, 8);
  };
  // 0: 노을 진 언덕
  cell(0, () => {
    fillGrad([[0, '#f0b77a'], [0.5, '#f6deb6'], [1, '#ead2a6']]);
    g.fillStyle = 'rgba(255,244,214,0.95)';
    g.beginPath(); g.arc(C * 0.68, C * 0.4, 20, 0, TAU); g.fill();
    ridge(C * 0.55, 10, 0.03, 1.2, '#b08c5a');
    ridge(C * 0.64, 12, 0.022, 3.1, '#8a7346');
    ridge(C * 0.74, 9, 0.035, 0.4, '#6c6a42');
    ridge(C * 0.86, 7, 0.028, 2.2, '#4f5136');
  });
  // 1: 정물(꽃병과 과일)
  cell(1, () => {
    fillGrad([[0, '#6b4430'], [1, '#4a2e20']]);
    g.fillStyle = '#7a5236'; g.fillRect(0, C * 0.72, C, C * 0.28);
    g.fillStyle = '#e9dcc3';
    g.beginPath(); g.ellipse(C * 0.42, C * 0.58, 38, 46, 0, 0, TAU); g.fill();
    g.fillRect(C * 0.42 - 14, C * 0.3, 28, 40);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(C * 0.42 - 16, C * 0.55, 8, 22, 0, 0, TAU); g.fill();
    for (const [x, y, rad, col] of [[0.66, 0.7, 17, '#d9822b'], [0.76, 0.72, 14, '#b8452f'], [0.6, 0.76, 13, '#8a9a3c'], [0.24, 0.75, 15, '#c9a23a']] as const) {
      g.fillStyle = col;
      g.beginPath(); g.arc(C * x, C * y, rad, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.beginPath(); g.arc(C * x - rad * 0.35, C * y - rad * 0.35, rad * 0.3, 0, TAU); g.fill();
    }
    // 꽃병에 꽂힌 마른 가지
    g.strokeStyle = '#3d2a1c'; g.lineWidth = 2;
    for (const a of [-0.5, -0.15, 0.25]) { g.beginPath(); g.moveTo(C * 0.42, C * 0.3); g.lineTo(C * 0.42 + Math.sin(a) * 70, C * 0.3 - Math.cos(a) * 70); g.stroke(); }
  });
  // 2: 식물 그림(잎 연구)
  cell(2, () => {
    g.fillStyle = '#f2ead8'; g.fillRect(0, 0, C, C);
    g.strokeStyle = '#4d6b3c'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(C * 0.5, C * 0.92); g.bezierCurveTo(C * 0.46, C * 0.6, C * 0.56, C * 0.4, C * 0.5, C * 0.1); g.stroke();
    for (let i = 0; i < 9; i++) {
      const t = 0.15 + i * 0.085, s = i % 2 ? 1 : -1;
      g.save();
      g.translate(C * (0.5 + 0.02 * Math.sin(i)), C * (0.92 - t * 0.85));
      g.rotate(s * (0.9 - i * 0.04));
      g.fillStyle = ['#6f8f5c', '#86a46f', '#5d7d4d'][i % 3];
      g.beginPath(); g.ellipse(s * 26, 0, 30 - i * 1.5, 11, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(240,240,220,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 52, 0); g.stroke();
      g.restore();
    }
  });
  // 3: 색면(따뜻한 두 칸)
  cell(3, () => {
    g.fillStyle = '#c99f62'; g.fillRect(0, 0, C, C);
    g.fillStyle = 'rgba(160,62,40,0.85)'; g.fillRect(C * 0.12, C * 0.1, C * 0.76, C * 0.46);
    g.fillStyle = 'rgba(236,206,140,0.9)'; g.fillRect(C * 0.12, C * 0.62, C * 0.76, C * 0.28);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 40; i++) g.fillRect(C * 0.12, C * 0.1 + r() * C * 0.8, C * 0.76, 1);
  });
  // 4: 먹 산수(겹친 봉우리와 안개, 작은 소나무)
  cell(4, () => {
    hanji();
    ridge(C * 0.42, 34, 0.028, 0.6, 'rgba(70,70,68,0.22)');
    ridge(C * 0.55, 26, 0.036, 2.4, 'rgba(50,50,48,0.35)');
    const mist = g.createLinearGradient(0, C * 0.58, 0, C * 0.72);
    mist.addColorStop(0, 'rgba(239,230,210,0)'); mist.addColorStop(0.5, 'rgba(239,230,210,0.85)'); mist.addColorStop(1, 'rgba(239,230,210,0)');
    g.fillStyle = mist; g.fillRect(0, C * 0.58, C, C * 0.14);
    ridge(C * 0.78, 16, 0.045, 4.1, 'rgba(30,30,30,0.55)');
    g.strokeStyle = 'rgba(25,25,25,0.85)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(C * 0.2, C * 0.8); g.lineTo(C * 0.22, C * 0.62); g.stroke();
    for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(25,25,25,0.7)'; g.beginPath(); g.ellipse(C * 0.22, C * (0.63 + k * 0.045), 16 - k * 3, 4, 0, 0, TAU); g.fill(); }
    seal(C * 0.8, C * 0.86);
  });
  // 5: 매화(굵은 가지와 흰·분홍 꽃)
  cell(5, () => {
    hanji();
    g.strokeStyle = '#2b2622'; g.lineCap = 'round';
    const branch = (x0: number, y0: number, x1: number, y1: number, w: number) => { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 10, (y0 + y1) / 2 - 12, x1, y1); g.stroke(); };
    branch(C * 0.05, C * 0.95, C * 0.55, C * 0.35, 9);
    branch(C * 0.55, C * 0.35, C * 0.9, C * 0.12, 4);
    branch(C * 0.35, C * 0.6, C * 0.25, C * 0.25, 4);
    branch(C * 0.6, C * 0.34, C * 0.75, C * 0.55, 3);
    for (let i = 0; i < 26; i++) {
      const t = r();
      const x = C * (0.1 + t * 0.78) + (r() - 0.5) * 30, y = C * (0.9 - t * 0.75) + (r() - 0.5) * 30;
      g.fillStyle = r() > 0.4 ? '#f7f1ea' : '#f2b8c2';
      for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 3, 0, TAU); g.fill(); }
      g.fillStyle = '#b5523b'; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
    }
    seal(C * 0.82, C * 0.84);
  });
  // 6: 달항아리
  cell(6, () => {
    fillGrad([[0, '#dcd8cf'], [1, '#c6c0b4']]);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath(); g.ellipse(C * 0.5, C * 0.86, 70, 10, 0, 0, TAU); g.fill();
    const jar = g.createRadialGradient(C * 0.43, C * 0.42, 10, C * 0.5, C * 0.55, 90);
    jar.addColorStop(0, '#fbf8f1'); jar.addColorStop(0.7, '#ece4d4'); jar.addColorStop(1, '#d3c8b4');
    g.fillStyle = jar;
    g.beginPath(); g.ellipse(C * 0.5, C * 0.42, 66, 52, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(C * 0.5, C * 0.66, 62, 50, 0, 0, TAU); g.fill();
    g.fillRect(C * 0.5 - 26, C * 0.15, 52, 16);
    g.fillRect(C * 0.5 - 24, C * 0.82, 48, 10);
  });
  // 7: 대나무
  cell(7, () => {
    hanji();
    g.fillStyle = 'rgba(35,40,35,0.85)';
    for (const [x, w] of [[0.3, 9], [0.48, 7], [0.62, 10]] as const) {
      for (let y = 0; y < C; y += 46) g.fillRect(C * x, y, w, 42);
    }
    g.fillStyle = 'rgba(35,40,35,0.8)';
    for (let i = 0; i < 18; i++) {
      g.save();
      g.translate(C * (0.3 + r() * 0.4), C * (0.1 + r() * 0.7));
      g.rotate((r() - 0.5) * 2.4);
      g.beginPath(); g.ellipse(18, 0, 20, 3.2, 0, 0, TAU); g.fill();
      g.restore();
    }
    seal(C * 0.1, C * 0.84);
  });
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 깔개 묶음(2칸 × 2칸): 0 화문석, 1 빈티지 러너, 2 현관 매트, 3 줄무늬 양모 */
export const RUGS = { cols: 2, rows: 2, hwamun: 0, runner: 1, doormat: 2, wool: 3 } as const;

export function rugAtlas(seed = 83) {
  const C = 256, W = C * RUGS.cols, H = C * RUGS.rows;
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % RUGS.cols) * C, Math.floor(i / RUGS.cols) * C);
    g.beginPath(); g.rect(0, 0, C, C); g.clip();
    draw();
    g.restore();
  };
  // 0: 화문석(왕골 결 위에 붉고 푸른 띠, 가운데 꽃 무늬)
  cell(RUGS.hwamun, () => {
    g.fillStyle = '#d6bd86'; g.fillRect(0, 0, C, C);
    for (let y = 0; y < C; y += 2) { g.fillStyle = y % 4 ? 'rgba(255,240,200,0.18)' : 'rgba(110,80,40,0.16)'; g.fillRect(0, y, C, 1); }
    // 띠와 꽃은 왕골에 물들인 차분한 색(먹 빛 남색·붉은 갈색)으로, 가늘게
    for (const [inset, col, lw] of [[10, '#7d3a2c', 3], [17, '#33405a', 2], [22, '#7d3a2c', 2]] as const) { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(inset, inset, C - inset * 2, C - inset * 2); }
    const flower = (x: number, y: number, s: number) => {
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        g.fillStyle = p % 2 ? 'rgba(125,58,44,0.85)' : 'rgba(150,84,58,0.8)';
        g.beginPath(); g.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.6, s * 0.32, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(51,64,90,0.9)'; g.beginPath(); g.arc(x, y, s * 0.38, 0, Math.PI * 2); g.fill();
    };
    flower(C / 2, C / 2, 15);
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) flower(C * x, C * y, 7);
  });
  // 1: 빈티지 러너(긴 쪽으로 늘여 깔아도 어색하지 않게 세로로 이어지는 무늬)
  cell(RUGS.runner, () => {
    g.fillStyle = '#7a2e24'; g.fillRect(0, 0, C, C);
    g.fillStyle = '#2b3550'; g.fillRect(0, 0, 30, C); g.fillRect(C - 30, 0, 30, C);
    g.fillStyle = '#e3cfa8'; g.fillRect(30, 0, 3, C); g.fillRect(C - 33, 0, 3, C);
    for (let y = 16; y < C; y += 32) {
      g.fillStyle = '#d9a441';
      g.beginPath(); g.moveTo(C / 2, y - 12); g.lineTo(C / 2 + 26, y); g.lineTo(C / 2, y + 12); g.lineTo(C / 2 - 26, y); g.closePath(); g.fill();
      g.fillStyle = '#2b3550'; g.beginPath(); g.arc(C / 2, y, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(227,207,168,0.6)'; g.fillRect(8, y - 1, 14, 2); g.fillRect(C - 22, y - 1, 14, 2);
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * C, r() * C, 2, 1); }
  });
  // 2: 현관 매트(야자 섬유)
  cell(RUGS.doormat, () => {
    g.fillStyle = '#9c7a4f'; g.fillRect(0, 0, C, C);
    for (let i = 0; i < 4000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(60,40,20,0.18)' : 'rgba(230,200,150,0.14)'; g.fillRect(r() * C, r() * C, 1, 2 + r() * 3); }
    g.strokeStyle = '#4a3624'; g.lineWidth = 14; g.strokeRect(7, 7, C - 14, C - 14);
  });
  // 3: 줄무늬 양모
  cell(RUGS.wool, () => {
    const cols = ['#e9dcc4', '#c9973f', '#8e3b2e', '#e9dcc4', '#6f7243'];
    for (let y = 0, i = 0; y < C; i++) { const h = 12 + (i % 3) * 8; g.fillStyle = cols[i % cols.length]; g.fillRect(0, y, C, h); y += h; }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.07})`; g.fillRect(r() * C, r() * C, 2, 1); }
  });
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 하늘: 위는 맑은 파랑, 지평선 쪽은 따뜻한 회백색 */
/**
 * 헤링본 마루: 폭 1, 길이 r인 판자가 가로·세로로 엇갈려 계단처럼 이어진다. 무늬는 2r × 2r 칸마다 되풀이되므로 한 장이 그 칸이다
 * (r = 5면 한 장 1m에 판자 폭 0.1m). 같은 판자는 이어지는 칸에서도 같은 색이다.
 */
export function herringbone(tones: string[], seed = 9, r = 5) {
  const S = 512, P = 2 * r, u = S / P;
  const [c, g] = canvas(S, S);
  const rand = rng(seed);
  const tone = Array.from({ length: P * 2 }, () => tones[Math.floor(rand() * tones.length)]);
  const shade = Array.from({ length: P * 2 }, () => rand() - 0.5);
  const grain = Array.from({ length: P * 2 }, () => Array.from({ length: 5 }, () => [rand(), rand() - 0.5] as const));
  const plank = (x: number, y: number, w: number, h: number, id: number) => {
    const X = x * u, Y = y * u, Wd = w * u, Ht = h * u;
    // 판자 색은 가운데 색에 반쯤만 섞는다(판자마다 색이 너무 달라 얼룩덜룩하지 않게)
    g.fillStyle = tones[0];
    g.fillRect(X, Y, Wd, Ht);
    g.globalAlpha = 0.5;
    g.fillStyle = tone[id];
    g.fillRect(X, Y, Wd, Ht);
    g.globalAlpha = 1;
    const s = shade[id];
    g.fillStyle = s > 0 ? `rgba(255,240,220,${s * 0.1})` : `rgba(40,20,5,${-s * 0.12})`;
    g.fillRect(X, Y, Wd, Ht);
    // 결: 판자 길이 방향으로 가는 선 몇 줄
    g.strokeStyle = 'rgba(70,38,16,0.13)';
    g.lineWidth = 1;
    const along = w > h;
    for (const [t, bend] of grain[id]) {
      g.beginPath();
      if (along) {
        const yy = Y + 3 + t * (Ht - 6);
        g.moveTo(X, yy);
        g.bezierCurveTo(X + Wd * 0.35, yy + bend * 4, X + Wd * 0.7, yy - bend * 4, X + Wd, yy);
      } else {
        const xx = X + 3 + t * (Wd - 6);
        g.moveTo(xx, Y);
        g.bezierCurveTo(xx + bend * 4, Y + Ht * 0.35, xx - bend * 4, Y + Ht * 0.7, xx, Y + Ht);
      }
      g.stroke();
    }
    // 이음매: 가늘고 짙게, 위·왼쪽 모서리에 옅은 빛
    g.strokeStyle = 'rgba(38,18,6,0.55)';
    g.lineWidth = 1.6;
    g.strokeRect(X + 0.8, Y + 0.8, Wd - 1.6, Ht - 1.6);
    g.strokeStyle = 'rgba(255,236,210,0.14)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(X + 2, Y + Ht - 2.5); g.lineTo(X + 2, Y + 2.5); g.lineTo(X + Wd - 2, Y + 2.5); g.stroke();
  };
  // 가로 판자 H(k, m) = [k − r·m, +r] × [k + r·m, +1], 세로 판자 V(k, m) = [k + r − r·m, +1] × [k + 1 − r + r·m, +r].
  // (k, m)과 (k + r, m ± 1)은 한 장 건너 같은 판자다: 판자 번호 = (k − r·m) mod 2r
  for (let m = -2; m <= 2; m++) for (let k = -2 * P; k <= 3 * P; k++) {
    const id = (((k - r * m) % P) + P) % P;
    const hx = k - r * m, hy = k + r * m;
    if (hx < P && hx + r > 0 && hy < P && hy + 1 > 0) plank(hx, hy, r, 1, id);
    const vx = k + r - r * m, vy = k + 1 - r + r * m;
    if (vx < P && vx + 1 > 0 && vy < P && vy + r > 0) plank(vx, vy, 1, r, P + id);
  }
  return finish(c);
}

/** 윤이 나는 짙은 돌 바닥: 한 장에 큰 판 2×2, 가는 줄눈, 판을 비스듬히 가로지르는 은빛 결 */
export function polishedStone(base: string, vein: string, seed = 45) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = `rgba(255,255,255,${0.008 + r() * 0.03})`;
    g.fillRect((i * S) / 2, (j * S) / 2, S / 2, S / 2);
  }
  // 흐린 구름 무늬
  for (let i = 0; i < 16; i++) {
    const x = r() * S, y = r() * S, rad = 50 + r() * 110, a = 0.025 + r() * 0.03, light = r() > 0.45;
    wrapped(S, x, y, rad, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, rad);
      grad.addColorStop(0, light ? `rgba(200,205,212,${a})` : `rgba(0,0,0,${a * 1.5})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  // 결: 가는 곡선이 비스듬히(가장자리를 넘으면 반대편에서 이어 그린다)
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const pts: Array<[number, number]> = [];
    let x = r() * S, y = r() * S;
    const ang = 0.5 + r() * 0.5;
    for (let k = 0; k < 9; k++) {
      pts.push([x, y]);
      x += Math.cos(ang) * 40 + (r() - 0.5) * 22;
      y += Math.sin(ang) * 40 + (r() - 0.5) * 22;
    }
    const width = 0.6 + r() * 1.6, alpha = 0.12 + r() * 0.2;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.strokeStyle = vein;
      g.globalAlpha = alpha;
      g.lineWidth = width;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  // 줄눈(판 둘레): 짙은 선 옆에 옅은 빛 한 줄
  for (const p of [0, S / 2]) {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(p, 0, 2, S);
    g.fillRect(0, p, S, 2);
    g.fillStyle = 'rgba(210,214,220,0.08)';
    g.fillRect(p + 2, 0, 1, S);
    g.fillRect(0, p + 2, S, 1);
  }
  return finish(c);
}

/** 미색 벽지: 너비 0.1m의 아주 옅은 세로 줄과 작은 마름모 무늬(한 장이 실제 크기 UV 한 칸 1.6m). 멀리서는 고른 미색이다 */
export function wallpaper(base: string, seed = 25) {
  const S = 512, band = 32;
  const [c, g] = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < S / band; i++) {
    if (i % 2) {
      g.fillStyle = 'rgba(255,252,244,0.22)';
      g.fillRect(i * band, 0, band, S);
    }
    g.fillStyle = 'rgba(150,118,74,0.10)';
    g.fillRect(i * band, 0, 1, S);
  }
  // 어두운 줄 가운데에 반 칸씩 엇갈린 작은 마름모
  g.fillStyle = 'rgba(176,141,87,0.16)';
  for (let i = 0; i < S / band; i += 2) for (let j = 0; j < 8; j++) {
    const x = i * band + band / 2, y = j * 64 + (i % 4 ? 32 : 0) + 16;
    g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.closePath(); g.fill();
  }
  // 종이 결
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
    g.fillRect(r() * S, r() * S, 1, 1);
  }
  return finish(c);
}

/**
 * 1층 징두리판: 월넛 틀(가로대·세로대) 안에 도드라진 판. 한 장이 실제 크기 UV 한 칸(1.6m)이고 판은 0.4m마다,
 * 높이는 밑에서 0.16~0.78m(그 위는 손잡이 띠 자리). 판자를 이은 무늬보다 짜임새가 정돈되어 보인다.
 */
export function panelWainscot(frame: string, panel: string, seed = 43) {
  const S = 512, px = S / 1.6;
  const [c, g] = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = frame;
  g.fillRect(0, 0, S, S);
  // 틀의 가로결
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 70; i++) { const y = r() * S; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y + (r() - 0.5) * 3); g.stroke(); }
  const y0 = S - 0.78 * px, y1 = S - 0.16 * px, stile = 0.07 * px, step = 0.4 * px;
  for (let i = 0; i < 4; i++) {
    const x0 = i * step + stile / 2, x1 = (i + 1) * step - stile / 2;
    // 판: 조금 밝은 결, 세로결
    g.fillStyle = panel;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = 'rgba(40,20,8,0.12)';
    for (let k = 0; k < 9; k++) { const x = x0 + r() * (x1 - x0); g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + 3, y0 + 40, x - 3, y1 - 40, x, y1); g.stroke(); }
    // 둘레 깎은 면: 위·왼쪽은 빛, 아래·오른쪽은 그늘(판이 도드라져 보인다)
    const bev = 7;
    g.fillStyle = 'rgba(255,226,190,0.16)';
    g.fillRect(x0, y0, x1 - x0, bev);
    g.fillRect(x0, y0, bev, y1 - y0);
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(x0, y1 - bev, x1 - x0, bev);
    g.fillRect(x1 - bev, y0, bev, y1 - y0);
    g.strokeStyle = 'rgba(20,10,4,0.6)';
    g.lineWidth = 2;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  return finish(c);
}

/** 문짝: 월넛 틀(양옆·가운데 세로대, 가로대 넷) 안에 도드라진 판 2열 × 3단. 문 면 하나에 한 장이 맞는다 */
export function panelDoor(frame: string, panel: string, seed = 31) {
  const W = 256, H = 512;
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  g.fillStyle = frame;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = r() * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 3, H); g.stroke(); }
  const side = W * 0.13, mid = W * 0.08, colW = (W - side * 2 - mid) / 2;
  // 단 높이(위에서부터): 작은 윗판, 긴 가운데 판, 아랫판. 가로대는 윗단 0.07, 가운데 0.05, 손잡이 띠 0.09, 아래 0.11(높이에 대한 몫)
  const rows: Array<[number, number]> = [[0.07, 0.2], [0.25, 0.6], [0.69, 0.89]];
  for (const [t0, t1] of rows) for (let k = 0; k < 2; k++) {
    const x0 = side + k * (colW + mid), x1 = x0 + colW, y0 = t0 * H, y1 = t1 * H;
    g.fillStyle = panel;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = 'rgba(40,20,8,0.12)';
    for (let i = 0; i < 6; i++) { const x = x0 + r() * (x1 - x0); g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (r() - 0.5) * 2, y1); g.stroke(); }
    const bev = 6;
    g.fillStyle = 'rgba(255,226,190,0.16)';
    g.fillRect(x0, y0, x1 - x0, bev);
    g.fillRect(x0, y0, bev, y1 - y0);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x0, y1 - bev, x1 - x0, bev);
    g.fillRect(x1 - bev, y0, bev, y1 - y0);
    g.strokeStyle = 'rgba(20,10,4,0.6)';
    g.lineWidth = 2;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 그림등 빛: 위 가운데가 밝고 아래와 양옆으로 사라진다(더하기 섞기로 그림과 둘레 벽에 얹는다) */
export function wash(color = '255,214,160') {
  const W = 128, H = 256;
  const [c, g] = canvas(W, H);
  const grad = g.createRadialGradient(W / 2, 4, 0, W / 2, 4, H);
  grad.addColorStop(0, `rgba(${color},0.46)`);
  grad.addColorStop(0.22, `rgba(${color},0.24)`);
  grad.addColorStop(0.6, `rgba(${color},0.07)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.22, 'rgba(0,0,0,1)');
  side.addColorStop(0.78, 'rgba(0,0,0,1)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
