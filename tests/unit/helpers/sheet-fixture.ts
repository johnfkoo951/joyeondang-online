// 시험용 그림: 색 원과 네모로 만든 사람 다섯이 한 줄로 선 방향 그림 시트(캔버스 없이 코드로 만든다).
// 사람은 머리(머리카락 색 원 + 살갗 색 얼굴)와 몸(옷 색 네모)과 다리(네모 둘). 얼굴이 머리의 어느 쪽에 놓이는지가 보는 쪽이다.

export type Rgba = { data: Uint8Array; w: number; h: number };
export type Color = readonly [number, number, number];
export type View = 'front' | 'fq' | 'side' | 'bq' | 'back';

export const SKIN: Color = [242, 200, 170];
export const HAIR: Color = [70, 45, 30];
export const DRESS: Color = [200, 60, 60];
export const SHOES: Color = [40, 40, 44];

export function blank(w: number, h: number): Rgba {
  return { data: new Uint8Array(w * h * 4), w, h };
}

export function px(img: Rgba, x: number, y: number): [number, number, number, number] {
  const i = (y * img.w + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function put(img: Rgba, x: number, y: number, c: Color, a: number): void {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = a;
}

/** 네모(양 끝 포함) */
export function rect(img: Rgba, x0: number, y0: number, x1: number, y1: number, c: Color, a = 255): void {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) put(img, x, y, c, a);
}

/** 타원. only를 주면 이미 그 색(예: 머리)인 화소 위에만 그린다 */
export function disc(img: Rgba, cx: number, cy: number, rx: number, ry: number, c: Color, a = 255, only?: Color): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
    if (only) {
      const [r, g, b, al] = x >= 0 && y >= 0 && x < img.w && y < img.h ? px(img, x, y) : [0, 0, 0, 0];
      if (al < 255 || r !== only[0] || g !== only[1] || b !== only[2]) continue;
    }
    put(img, x, y, c, a);
  }
}

/** 얼굴이 머리 가운데에서 치우친 정도(머리 반지름 대비)와 얼굴 크기. 왼쪽을 보는 그림 기준 */
const FACE: Record<View, { dx: number; rx: number; ry: number } | null> = {
  front: { dx: 0, rx: 0.7, ry: 0.6 },
  fq: { dx: -0.25, rx: 0.62, ry: 0.6 },
  side: { dx: -0.55, rx: 0.42, ry: 0.55 },
  bq: { dx: -0.86, rx: 0.12, ry: 0.3 },
  back: null,
};

/** 머리를 민 사람의 안경알 자리(머리 가운데에서, 머리 반지름 대비). 왼쪽을 보는 그림 기준. 뒤쪽 그림에서는 보이지 않는다 */
const GLASSES: Record<View, readonly number[]> = { front: [-0.5, 0.5], fq: [-0.75, -0.2], side: [-0.7], bq: [], back: [] };

/**
 * 사람 하나를 (left, top)에서 w×h 크기로 그린다. 머리는 위 절반, 몸과 다리는 아래 절반.
 * turn이 'right'면 얼굴이 오른쪽으로 치우친다. skew는 얼굴 치우침에 곱하는 값(0이면 어느 쪽을 보는지 알 수 없는 그림).
 * bald면 머리를 민 사람: 머리 전체가 살갗 색이고 얼굴 쪽에 안경(어두운 원 둘)만 있다.
 */
export function person(img: Rgba, left: number, top: number, w: number, h: number, view: View, turn: 'left' | 'right' = 'left', skew = 1, bald = false): void {
  const cx = left + w / 2, r = Math.min(w / 2 - 1, h * 0.24), hy = top + r;
  rect(img, cx - w * 0.3, top + h * 0.46, cx + w * 0.3, top + h * 0.84, DRESS);
  rect(img, cx - w * 0.2, top + h * 0.84, cx - w * 0.04, top + h - 1, SHOES);
  rect(img, cx + w * 0.04, top + h * 0.84, cx + w * 0.2, top + h - 1, SHOES);
  disc(img, cx, hy, r, r, bald ? SKIN : HAIR);
  const dir = turn === 'left' ? 1 : -1;
  if (bald) {
    for (const ex of GLASSES[view]) disc(img, cx + ex * r * skew * dir, hy + r * 0.15, 0.22 * r, 0.22 * r, HAIR, 255, SKIN);
    return;
  }
  const f = FACE[view];
  if (f) disc(img, cx + f.dx * r * skew * dir, hy + r * 0.15, f.rx * r, f.ry * r, SKIN, 255, HAIR);
}

export const VIEWS: readonly View[] = ['front', 'fq', 'side', 'bq', 'back'];

export type SheetOptions = {
  /** 비스듬·옆 그림이 보는 쪽 */
  turn?: 'left' | 'right';
  /** 얼굴 치우침에 곱하는 값(0이면 보는 쪽을 알 수 없다) */
  skew?: number;
  heights?: number[];
  /** 왼쪽부터 그릴 방향들(기본은 앞, 앞 비스듬, 옆, 뒤 비스듬, 뒤) */
  order?: readonly View[];
  /** 머리를 민 사람(머리 전체가 살갗 색) */
  bald?: boolean;
};

/** 사람들이 한 줄로 선 시트. 발은 같은 선에 놓인다 */
export function sheet(opts: SheetOptions = {}): Rgba & { lefts: number[]; base: number } {
  const order = opts.order ?? VIEWS;
  const hs = opts.heights ?? order.map(() => 120);
  const w = 60, gap = 30;
  const base = 20 + Math.max(...hs);
  const img = blank(gap + order.length * (w + gap), base + 20);
  const lefts = order.map((_, i) => gap + i * (w + gap));
  order.forEach((view, i) => person(img, lefts[i], base - hs[i], w, hs[i], view, opts.turn ?? 'left', opts.skew ?? 1, opts.bald ?? false));
  return { ...img, lefts, base };
}

/** 가장 가까운 화소를 고르는 크기 조절(시험에서 진짜 줄이기를 대신한다) */
export function resizeNearest(img: Rgba, w: number, h: number): Rgba {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.min(img.h - 1, Math.floor(((y + 0.5) * img.h) / h)) * img.w + Math.min(img.w - 1, Math.floor(((x + 0.5) * img.w) / w))) * 4;
    out.data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
  }
  return out;
}

/** 알파가 min 이상인 화소의 테두리 상자(양 끝 포함)와 화소 수. 없으면 null */
export function bounds(img: Rgba, min = 128, x0 = 0, x1 = img.w - 1): { x0: number; x1: number; y0: number; y1: number; n: number } | null {
  const b = { x0: Infinity, x1: -1, y0: Infinity, y1: -1, n: 0 };
  for (let y = 0; y < img.h; y++) for (let x = x0; x <= x1; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] < min) continue;
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.n++;
  }
  return b.n ? b : null;
}
