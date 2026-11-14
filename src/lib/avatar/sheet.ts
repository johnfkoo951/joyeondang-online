// 방향 그림 시트(같은 캐릭터의 다섯 방향을 한 줄에 그린 그림)를 사람 하나씩 잘라 걷기용 묶음으로 놓는 계산(순수 함수).
// RGBA 바이트 배열만 다룬다. PNG·WebP를 읽고 쓰는 일과 크기 조절은 일꾼(worker/avatar)이 한다.
// 다른 파일을 가져오지 않고, 지울 수 있는 타입 문법만 쓴다(일꾼이 이 .ts를 그대로 불러온다).
// 수치는 시험 시트들로 맞춘 값이다. 바꿀 때는 tests/unit/avatar-sheet.test.ts와 진짜 시트로 다시 본다.

/** 화소 넷(R, G, B, A)이 줄지어 있는 그림 */
export type Rgba = { data: Uint8Array; w: number; h: number };

/** 칸 순서. 걷기 엔진의 칸 번호, 비전 모델 스키마(prompt.ts의 SHEET_VIEWS_SCHEMA)의 낱말과 같아야 한다 */
export const VIEW_ORDER = ['front', 'three_quarter_front', 'side', 'three_quarter_back', 'back'] as const;
export type ViewName = (typeof VIEW_ORDER)[number];
export const VIEW_COUNT = 5;
/** 묶음 v1의 칸 크기 [가로, 세로]. 가로:세로 2:3. l은 큰 것, s는 손가락으로 쓰는 기기용 */
export const VIEW_CELLS = { l: [384, 576], s: [256, 384] } as const;
/** 시트를 그려 달라고 하는 크기(가로로 긴 그림). 돌아오는 크기는 달라도 받는다 */
export const SHEET_SIZE = '1536x1024';

/** 불투명으로 치는 알파(덩이 찾기, 테두리 상자) */
const SOLID = 128;
/** 색을 믿을 수 있는 알파(색 번짐의 씨앗, 알파 띠의 씨앗) */
const FIRM = 200;

// ───────── 덩이 찾기

/** 이어진 화소 덩이 하나: 넓이, 테두리 상자(양 끝 포함), 무게중심 */
export type Region = { id: number; area: number; x0: number; x1: number; y0: number; y1: number; cx: number; cy: number };
/** 사람 한 명: 가장 큰 덩이에 귀걸이 같은 작은 덩이(members)를 붙인 것. 상자는 붙인 것까지 덮는다 */
export type Figure = Region & { members: number[] };
export type Found = {
  /** 화소마다 덩이 번호(−1은 투명) */
  label: Int32Array;
  /** 읽는 순서(윗줄부터, 줄 안에서는 왼쪽부터) */
  figs: Figure[];
  /** 줄마다 사람 수. 한 줄에 다섯이면 [5] */
  rows: number[];
  /** 사람만큼 큰데 want에 밀려 버린 덩이 수(누구에게도 붙지 않은 것). 0이 아니면 사람이 더 그려진 시트일 수 있다 */
  spare: number;
};

/** 알파가 SOLID 이상인 화소의 이어진 덩이들(위아래·좌우로 이어짐) */
function components(img: Rgba): { label: Int32Array; comps: Region[] } {
  const { data, w, h } = img;
  const label = new Int32Array(w * h).fill(-1);
  const comps: Region[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] < SOLID) continue;
    const id = comps.length;
    let top = 0, area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, sx = 0, sy = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const p = stack[--top];
      const x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && label[p - 1] === -1 && data[(p - 1) * 4 + 3] >= SOLID) { label[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && label[p + 1] === -1 && data[(p + 1) * 4 + 3] >= SOLID) { label[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && label[p - w] === -1 && data[(p - w) * 4 + 3] >= SOLID) { label[p - w] = id; stack[top++] = p - w; }
      if (y < h - 1 && label[p + w] === -1 && data[(p + w) * 4 + 3] >= SOLID) { label[p + w] = id; stack[top++] = p + w; }
    }
    comps.push({ id, area, x0, x1, y0, y1, cx: sx / area, cy: sy / area });
  }
  return { label, comps };
}

/**
 * 시트에서 사람을 찾는다. 가장 큰 덩이의 12% 이상인 덩이가 사람이다(want보다 많으면 큰 것부터 want개).
 * 나머지 덩이(떨어져 그려진 귀걸이·머리핀)는 중심이 어느 사람의 상자(조금 넓힌 것) 안에 있으면 가까운 사람에게 붙이고,
 * 어디에도 들지 않는 덩이(바탕의 얼룩)와 12화소도 안 되는 점은 버린다. 버린 것 가운데 사람만큼 큰 것은 spare에 센다.
 */
export function findFigures(img: Rgba, want = 0): Found {
  const { label, comps } = components(img);
  const big = comps.reduce((m, c) => Math.max(m, c.area), 0);
  let figs: Figure[] = comps.filter((c) => c.area >= big * 0.12).map((c) => ({ ...c, members: [c.id] }));
  const extra = new Set<number>();
  if (want > 0 && figs.length > want) {
    figs.sort((a, b) => b.area - a.area);
    for (const f of figs.slice(want)) extra.add(f.id);
    figs = figs.slice(0, want);
  }
  const taken = new Set(figs.map((f) => f.id));
  let spare = 0;
  for (const c of comps) {
    if (taken.has(c.id) || c.area < 12) continue;
    let best: Figure | null = null;
    let bestD = Infinity;
    for (const f of figs) {
      const main = comps[f.id]; // 붙이는 동안에도 본래 몸의 상자로 잰다
      const mx = (main.x1 - main.x0) * 0.06, my = (main.y1 - main.y0) * 0.03;
      if (c.cx < main.x0 - mx || c.cx > main.x1 + mx || c.cy < main.y0 - my || c.cy > main.y1 + my) continue;
      const d = Math.hypot(c.cx - main.cx, c.cy - main.cy);
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best) {
      best.members.push(c.id);
      best.x0 = Math.min(best.x0, c.x0); best.x1 = Math.max(best.x1, c.x1);
      best.y0 = Math.min(best.y0, c.y0); best.y1 = Math.max(best.y1, c.y1);
    } else if (extra.has(c.id)) {
      spare++;
    }
  }
  // 줄(위아래)로 묶고 줄 안에서는 왼쪽부터. 무게중심 높이가 사람 키의 절반 안이면 같은 줄이다
  const med = figs.map((f) => f.y1 - f.y0).sort((a, b) => a - b)[Math.floor(figs.length / 2)] || 1;
  figs.sort((a, b) => a.cy - b.cy);
  const rows: Figure[][] = [];
  for (const f of figs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].cy - f.cy) < med * 0.5) row.push(f);
    else rows.push([f]);
  }
  return { label, figs: rows.flatMap((r) => r.sort((a, b) => a.cx - b.cx)), rows: rows.map((r) => r.length), spare };
}

// ───────── 한 사람 잘라 내기

const smooth = (a: number, lo: number, hi: number): number => {
  const t = Math.max(0, Math.min(1, (a - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/**
 * 한 사람만 남긴 조각. 남의 화소와 몸 둘레의 흐린 광채는 투명으로 만들고(알파 96 아래는 0, 176 위는 255로 부드럽게 잇는다),
 * 투명해진 화소에는 가까운 몸 색을 번지게 채운다(줄이거나 늘릴 때 가장자리에 어두운 테가 생기지 않게).
 * 돌려주는 x0, y0은 시트에서 조각이 놓였던 자리다.
 */
export function cutFigure(img: Rgba, label: Int32Array, fig: Figure, pad = 4): Rgba & { x0: number; y0: number } {
  const { data, w, h } = img;
  const x0 = Math.max(0, fig.x0 - pad), y0 = Math.max(0, fig.y0 - pad);
  const x1 = Math.min(w - 1, fig.x1 + pad), y1 = Math.min(h - 1, fig.y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Uint8Array(cw * ch * 4);
  const mine = new Set(fig.members);
  // 이 사람의 덩이 화소와 그 둘레 2화소(부드러운 가장자리)만 남긴다
  const grow = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (mine.has(label[(y + y0) * w + x + x0])) grow[y * cw + x] = 1;
  for (let pass = 0; pass < 2; pass++) {
    const src = new Uint8Array(grow);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      if (src[k]) continue;
      if ((x > 0 && src[k - 1]) || (x < cw - 1 && src[k + 1]) || (y > 0 && src[k - cw]) || (y < ch - 1 && src[k + cw])) grow[k] = 1;
    }
  }
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = ((y + y0) * w + x + x0) * 4, d = (y * cw + x) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2];
    out[d + 3] = grow[y * cw + x] ? Math.round(smooth(data[s + 3], 96, 176) * 255) : 0;
  }
  bleed(out, cw, ch, 16);
  return { data: out, w: cw, h: ch, x0, y0 };
}

/**
 * 알파가 FIRM 아래인 화소의 색을 가까운 또렷한 화소의 색으로 채운다(알파는 그대로). 한 번에 한 화소씩 passes번 번진다:
 * 채울 화소는 그때까지 색이 정해진 이웃 여덟의 평균을 받는다.
 * 텍스처를 줄이거나 늘릴 때 투명 화소의 색(보통 검정)이 가장자리에 섞여 어두운 테가 되는 것을 막는다.
 */
export function bleed(rgba: Uint8Array, w: number, h: number, passes: number): void {
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = rgba[i * 4 + 3] >= FIRM ? 1 : 0;
  // 그림 전체를 번번이 훑지 않고, 방금 색이 정해진 화소의 이웃(다음에 채울 자리)만 따라간다
  const queued = new Uint8Array(w * h);
  const around = (i: number, visit: (j: number) => void): void => {
    const x = i % w, y = (i - x) / w;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) visit(yy * w + xx);
    }
  };
  let front: number[] = [];
  const enqueue = (j: number): void => {
    if (!known[j] && !queued[j]) { queued[j] = 1; front.push(j); }
  };
  for (let i = 0; i < w * h; i++) if (known[i]) around(i, enqueue);
  for (let pass = 0; pass < passes && front.length; pass++) {
    const batch = front;
    for (const i of batch) {
      let r = 0, g = 0, b = 0, n = 0;
      around(i, (j) => {
        if (known[j]) { r += rgba[j * 4]; g += rgba[j * 4 + 1]; b += rgba[j * 4 + 2]; n++; }
      });
      rgba[i * 4] = r / n; rgba[i * 4 + 1] = g / n; rgba[i * 4 + 2] = b / n;
    }
    for (const i of batch) known[i] = 1; // 같은 번에 채운 화소끼리는 서로의 색을 받지 않는다
    front = [];
    for (const i of batch) around(i, enqueue);
  }
}

/** 좌우를 뒤집은 그림(오른쪽을 보는 그림을 왼쪽을 보게) */
export function mirror(img: Rgba): Rgba {
  const { data, w, h } = img;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = (y * w + (w - 1 - x)) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
  }
  return { data: out, w, h };
}

/** 불투명 화소의 테두리 상자(양 끝 포함)와 몸 중심선: 아래 45%의 가로 무게중심(머리카락이나 든 물건에 끌리지 않게 다리 쪽으로 잰다) */
type Box = { x0: number; x1: number; y0: number; y1: number; w: number; h: number; axis: number };
function box(img: Rgba): Box {
  const { data, w, h } = img;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] < SOLID) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return { x0: 0, x1: w - 1, y0: 0, y1: h - 1, w, h, axis: (w - 1) / 2 }; // 빈 그림: 판 전체로 친다
  let sx = 0, n = 0;
  for (let y = Math.floor(y1 - (y1 - y0) * 0.45); y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (data[(y * w + x) * 4 + 3] >= SOLID) { sx += x; n++; }
  }
  return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, axis: n ? sx / n : (x0 + x1) / 2 };
}

// ───────── 보는 쪽 가리기(살갗 색으로)

export type Side = 'left' | 'right';
export type Facing = {
  /** 앞모습 얼굴 한가운데의 살갗 색. 못 찾으면 null */
  ref: [number, number, number] | null;
  /** [앞 비스듬, 옆, 뒤 비스듬]이 보는 쪽(그림에서 코가 가리키는 쪽). 못 가리면 null */
  sides: [Side | null, Side | null, Side | null];
  /** 그림마다 머리에서 살갗이 차지하는 몫. 앞 > 옆 > 뒤로 줄어야 순서가 맞다 */
  shares: number[];
  /** 그림마다 살갗이 머리 가운데에서 치우친 정도(왼쪽 −, 오른쪽 +, 머리 폭 대비) */
  offsets: number[];
};

/** 앞모습 얼굴 한가운데(눈과 볼 사이)에서 가장 흔한 색 */
function skinRef(img: Rgba): [number, number, number] | null {
  const { data, w, h } = img;
  const hist = new Map<number, number>();
  for (let y = Math.floor(h * 0.26); y < h * 0.36; y++) for (let x = Math.floor(w * 0.38); x < w * 0.62; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < FIRM) continue;
    const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  let best = 0, bk = -1;
  for (const [k, n] of hist) if (n > best) { best = n; bk = k; }
  return bk < 0 ? null : [((bk >> 10) & 31) * 8 + 4, ((bk >> 5) & 31) * 8 + 4, (bk & 31) * 8 + 4];
}

/** 머리(위 46%)에서 살갗 색이 치우친 쪽(왼쪽 −, 오른쪽 +, 머리 폭 대비)과 살갗 몫 */
function skinOffset(img: Rgba, ref: [number, number, number], tol = 42): { d: number; share: number } {
  const { data, w, h } = img;
  let sx = 0, sn = 0, ax = 0, an = 0, x0 = w, x1 = 0;
  for (let y = 0; y < h * 0.46; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < SOLID) continue;
    ax += x; an++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (Math.hypot(data[i] - ref[0], data[i + 1] - ref[1], data[i + 2] - ref[2]) < tol) { sx += x; sn++; }
  }
  return { d: sn && an ? (sx / sn - ax / an) / Math.max(1, x1 - x0) : 0, share: an ? sn / an : 0 };
}

/**
 * 잘라 낸 다섯 그림(읽는 순서)에서 비스듬·옆 그림이 보는 쪽을 가린다.
 * 옆모습은 얼굴(살갗)이 머리의 앞쪽에, 머리카락이 뒤쪽에 몰린다. 그 치우침에서 앞모습의 치우침(가르마 같은 것)을 빼고 본다.
 * 넘어야 하는 치우침: 옆 0.08, 앞 비스듬 0.02, 뒤 비스듬 0.06(뒤 비스듬은 살갗이 조금뿐이라 흔들린다). 못 가린 비스듬은 옆을 따른다.
 */
export function facingSides(figs: Rgba[]): Facing {
  const ref = figs.length ? skinRef(figs[0]) : null;
  if (!ref || figs.length < VIEW_COUNT) return { ref, sides: [null, null, null], shares: [], offsets: [] };
  const o = figs.map((f) => skinOffset(f, ref));
  const rel = (i: number): number => o[i].d - o[0].d;
  const side = (v: number, min: number): Side | null => (Math.abs(v) >= min ? (v < 0 ? 'left' : 'right') : null);
  const s = side(rel(2), 0.08);
  return {
    ref,
    sides: [side(rel(1), 0.02) ?? s, s, side(rel(3), 0.06) ?? s],
    shares: o.map((v) => v.share),
    offsets: o.map((v) => v.d),
  };
}

// ───────── 시트 검사와 방향 정하기

export type SheetCheck = { ok: true } | { ok: false; reason: 'sheet_count' | 'sheet_rows' | 'sheet_edge' | 'sheet_heights' | 'sheet_wide' };

/** 한 그림의 폭이 다섯의 폭 가운뎃값의 이 배를 넘으면 둘이 붙은 덩이로 본다 */
const WIDE_OF_MID = 1.5;

/**
 * 묶음으로 만들 수 있는 시트인가: 사람이 딱 다섯이고(사람만 한 덩이가 남아도 안 된다: 여섯을 그렸다면 어느 다섯이 맞는지 모른다),
 * 한 줄이고, 누구도 판의 가장자리에 닿지 않고(잘린 그림), 키가 15% 넘게 다르지 않고(같은 크기로 그려 달라고 했다),
 * 누구도 키의 0.9배보다 넓지 않다(둘이 붙어 한 덩이가 됐거나 팔을 벌렸다).
 */
export function checkSheet(found: Pick<Found, 'figs' | 'rows' | 'spare'>, size?: { w: number; h: number }): SheetCheck {
  const { figs, rows } = found;
  if (figs.length !== VIEW_COUNT || found.spare > 0) return { ok: false, reason: 'sheet_count' };
  if (rows.length !== 1) return { ok: false, reason: 'sheet_rows' };
  // 판의 가장자리에 닿은 사람은 잘린 그림이다(다섯을 다 넣지 못해 옆구리나 정수리, 발끝이 판 밖으로 나갔다).
  // 그대로 쓰면 그 방향으로 볼 때마다 한쪽이 수직으로 잘린 캐릭터가 보인다. 시트 크기를 받았을 때만 본다
  if (size && figs.some((f) => f.x0 <= 0 || f.y0 <= 0 || f.x1 >= size.w - 1 || f.y1 >= size.h - 1)) return { ok: false, reason: 'sheet_edge' };
  const hs = figs.map((f) => f.y1 - f.y0 + 1);
  const tall = Math.max(...hs);
  if ((tall - Math.min(...hs)) / tall > 0.15) return { ok: false, reason: 'sheet_heights' };
  const ws = figs.map((f) => f.x1 - f.x0 + 1);
  if (ws.some((w, i) => w > hs[i] * 0.9)) return { ok: false, reason: 'sheet_wide' };
  // 사람을 여섯 그리고 이웃 둘이 붙으면 덩이는 다섯이다. 몸이 좁은 캐릭터는 둘이 붙어도 키의 0.9배를 넘지 않으므로
  // 다섯의 폭 가운뎃값과도 견준다(제대로 그린 시트는 가장 넓은 그림이 가운뎃값의 1.1배 안쪽이고, 붙은 덩이는 1.7배를 넘는다).
  // 사람 수를 비전 모델의 답과 견주지는 않는다: 아이를 안은 캐릭터처럼 한 덩이에 둘이 든 그림을 다섯으로 세는 쪽이 맞다
  const mid = [...ws].sort((a, b) => a - b)[VIEW_COUNT >> 1];
  if (ws.some((w) => w > mid * WIDE_OF_MID)) return { ok: false, reason: 'sheet_wide' };
  return { ok: true };
}

/** 비전 모델이 본 그림 하나: 방향과 코가 가리키는 쪽 */
export type SeenView = { view: ViewName; nose: Side | 'none' };

/** 비전 모델의 JSON 답을 읽는다. 모양이 조금이라도 다르면 null(답이 없는 것으로 친다) */
export function parseSheetViews(raw: unknown): SeenView[] | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const list = (data as { figures?: unknown }).figures;
  if (!Array.isArray(list) || list.length === 0 || list.length > 12) return null;
  const out: SeenView[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') return null;
    const { view, nose } = item as { view?: unknown; nose?: unknown };
    if (typeof view !== 'string' || !(VIEW_ORDER as readonly string[]).includes(view)) return null;
    if (nose !== 'left' && nose !== 'right' && nose !== 'none') return null;
    out.push({ view: view as ViewName, nose });
  }
  return out;
}

/** full: 다섯 방향을 다 쓴다(flip은 [앞 비스듬, 옆, 뒤 비스듬]을 좌우로 뒤집을지). frontback: 앞·뒤 그림만 쓴다 */
export type ViewsPlan = { redraw: false; mode: 'full' | 'frontback'; flip: [boolean, boolean, boolean] };

/**
 * 순서가 정해진 다섯 그림에서, 살갗 색으로 가린 것(code)과 비전 모델의 답(seen, 없으면 null)으로 옆·비스듬 그림이 보는 쪽을 정한다.
 * (순서가 맞는지는 planSheet가 먼저 본다.)
 * - 살갗 몫이 앞 > 옆 > 뒤로 줄지 않으면 살갗 색 판정을 쓰지 않는다. 머리를 민 캐릭터는 머리 전체가 살갗 색이라
 *   「살갗이 몰린 쪽이 얼굴」이 통하지 않고, 눈·안경이 있는 쪽의 살갗이 줄어 오히려 반대쪽으로 읽힌다(진짜 시트에서 확인).
 * - 옆모습이 보는 쪽: 둘이 같으면 그쪽, 한쪽만 말하면 그쪽, 둘이 다르면 정하지 않는다.
 *   거꾸로 뒤집힌 옆모습은 뒤로 걷는 것처럼 보여서, 모를 때는 앞·뒤 그림만 쓰는 편(frontback)이 낫다.
 * - 비스듬 그림은 옆모습과 같은 쪽을 본다고 본다(그렇게 그려 달라고 했고, 시험 시트가 모두 그랬다).
 *   살갗 색 판정과 비전 답이 둘 다 반대쪽이라고 할 때만 반대로 본다. 비스듬 그림에서는 둘 다 가끔 틀려서 하나만으로는 뒤집지 않는다.
 */
export function decideViews(code: Pick<Facing, 'sides' | 'shares'>, seen: SeenView[] | null): ViewsPlan {
  const five = seen !== null && seen.length === VIEW_COUNT;
  const s = code.shares;
  const sharesOk = s.length === VIEW_COUNT && s[0] > s[2] && s[2] > s[4];
  /** 살갗 색 판정([앞 비스듬, 옆, 뒤 비스듬] 가운데 k번째). 살갗 몫이 순서와 맞지 않으면 없는 것으로 친다 */
  const mine = (k: 0 | 1 | 2): Side | null => (sharesOk ? code.sides[k] : null);
  /** 비전 모델이 본 i번째 그림의 코가 가리키는 쪽 */
  const theirs = (i: 1 | 2 | 3): Side | null => (five && seen[i].nose !== 'none' ? seen[i].nose : null);
  const a = mine(1), b = theirs(2);
  const side = a && b ? (a === b ? a : null) : (a ?? b);
  if (!side) return { redraw: false, mode: 'frontback', flip: [false, false, false] };
  const other: Side = side === 'left' ? 'right' : 'left';
  const turned = (k: 0 | 2): Side => (mine(k) === other && theirs(k === 0 ? 1 : 3) === other ? other : side);
  return { redraw: false, mode: 'full', flip: [turned(0) === 'right', side === 'right', turned(2) === 'right'] };
}

/** 뒷모습의 살갗 몫이 옆모습의 이만큼을 넘으면 「뒤에는 살갗이 거의 없다」고 보지 않는다(진짜 시트는 0~0.21, 거꾸로 그린 시트는 0.7 안팎) */
const BACK_SKIN_MAX = 0.35;

/**
 * 살갗 몫이 다섯 그림에서 차례로 줄고 뒷모습에는 살갗이 거의 없는가. 그려진 순서가 앞 → 뒤라는 강한 표시다.
 * (앞·옆·뒤 셋만 견주면 이웃 칸이 바뀐 시트와, 거꾸로 그려 첫 그림의 머리카락 색을 살갗으로 잡은 시트가 통과한다.)
 */
export function sharesInOrder(shares: number[]): boolean {
  if (shares.length !== VIEW_COUNT) return false;
  for (let i = 1; i < VIEW_COUNT; i++) if (!(shares[i - 1] > shares[i])) return false;
  return shares[4] <= shares[2] * BACK_SKIN_MAX;
}

/**
 * 비전 모델이 다섯 방향을 하나씩 봤다면, 칸 순서로 놓는 차례(order[k] = k번 칸에 놓을 그림의 번호). 같은 방향을 둘 봤거나 다섯이 아니면 null.
 */
export function seenOrder(seen: SeenView[] | null): number[] | null {
  if (!seen || seen.length !== VIEW_COUNT) return null;
  const order = VIEW_ORDER.map((name) => seen.findIndex((v) => v.view === name));
  return order.every((i) => i >= 0) ? order : null;
}

export type SheetPlan =
  /** 순서를 믿을 수 없다: 이 시트는 버리고 다시 그린다 */
  | { act: 'redraw'; facing: Facing }
  /** 지금은 확인할 길이 없다(비전 답이 없고 살갗 색으로도 순서를 볼 수 없다): 시트 탓이 아니니 나중에 다시 해 본다 */
  | { act: 'wait'; facing: Facing }
  /** 쓴다. views는 묶음에 넣을 다섯 그림(순서를 바로잡고, 오른쪽을 보는 것은 뒤집은 것). order는 칸마다 놓은 그림의 원래 번호 */
  | { act: 'use'; views: Rgba[]; mode: 'full' | 'frontback'; flip: [boolean, boolean, boolean]; order: number[]; facing: Facing };

/**
 * 잘라 낸 다섯 그림(그려진 순서)과 비전 모델의 답으로 시트를 어떻게 쓸지 정한다. 순서를 먼저 확인하고, 그다음 보는 쪽을 가린다.
 * 순서의 근거는 둘이다: 비전 모델이 본 방향 이름(시험에서 틀린 적이 없다)과 살갗 몫이 앞에서 뒤로 줄어드는 것(sharesInOrder).
 * - 비전이 약속한 순서대로 봤다 → 그대로 쓴다.
 * - 비전이 다섯 방향을 다른 순서로 봤다 → 그려진 순서가 살갗 몫으로도 맞다면 둘이 어긋나므로 다시 그리고, 아니면 비전이 본 대로 순서를 바로잡아 쓴다
 *   (다시 그리지 않는다. 바로잡은 뒤의 살갗 색 판정은 새 앞모습에서 다시 한다).
 * - 비전 답이 뒤죽박죽(같은 방향이 둘, 다섯이 아님) → 살갗 몫으로 순서가 맞으면 살갗 색 판정만으로 쓴다. 아니어도 비전이 첫 그림을 앞,
 *   끝 그림을 뒤라고 봤다면 앞·뒤 그림만으로 묶음을 만든다(frontback. 가운데 그림 하나를 헷갈렸다고 멀쩡한 시트를 버리고 다시 그리지 않는다:
 *   머리를 민 캐릭터는 살갗 몫을 쓸 수 없어 이 길이 아니면 같은 답이 되풀이될 때마다 그리기 수만 쓰고 실패로 남는다). 양 끝도 다르면 다시 그린다.
 * - 비전 답이 없다 → 살갗 몫으로 순서가 맞으면 살갗 색 판정만으로 쓰고, 아니면 기다린다(머리를 민 캐릭터는 비전 답이 있어야 한다).
 */
export function planSheet(cuts: Rgba[], seen: SeenView[] | null): SheetPlan {
  const base = facingSides(cuts);
  const strong = sharesInOrder(base.shares);
  const keep = (figs: Rgba[], facing: Facing, answer: SeenView[] | null, order: number[]): SheetPlan => {
    const plan = decideViews(facing, answer);
    return { act: 'use', views: arrangeViews(figs, plan), mode: plan.mode, flip: plan.flip, order, facing };
  };
  const asDrawn = cuts.map((_, i) => i);
  if (cuts.length !== VIEW_COUNT) return { act: 'redraw', facing: base };
  if (seen === null) return strong ? keep(cuts, base, null, asDrawn) : { act: 'wait', facing: base };
  const order = seenOrder(seen);
  if (order === null) {
    if (strong) return keep(cuts, base, null, asDrawn);
    const ends = seen.length === VIEW_COUNT && seen[0].view === VIEW_ORDER[0] && seen[VIEW_COUNT - 1].view === VIEW_ORDER[VIEW_COUNT - 1];
    if (!ends) return { act: 'redraw', facing: base };
    const flip: [boolean, boolean, boolean] = [false, false, false];
    return { act: 'use', views: arrangeViews(cuts, { mode: 'frontback', flip }), mode: 'frontback', flip, order: asDrawn, facing: base };
  }
  if (order.every((v, i) => v === i)) return keep(cuts, base, seen, asDrawn);
  if (strong) return { act: 'redraw', facing: base };
  const figs = order.map((i) => cuts[i]);
  return keep(figs, facingSides(figs), order.map((i) => seen[i]), order);
}

/**
 * 잘라 낸 다섯 그림을 묶음에 넣을 다섯 그림으로 바꾼다. full이면 오른쪽을 보는 비스듬·옆 그림을 뒤집어 모두 왼쪽을 보게 하고,
 * frontback이면 앞 그림을 앞 비스듬·옆 자리에, 뒤 그림을 뒤 비스듬 자리에 그대로 넣는다(엔진은 두 경우를 구분하지 않는다).
 */
export function arrangeViews(cuts: Rgba[], plan: Pick<ViewsPlan, 'mode' | 'flip'>): Rgba[] {
  if (plan.mode === 'frontback') return [cuts[0], cuts[0], cuts[0], cuts[4], cuts[4]];
  return cuts.map((c, i) => (i >= 1 && i <= 3 && plan.flip[i - 1] ? mirror(c) : c));
}

// ───────── 묶음 v1에 놓기
// 한 줄에 다섯 칸. 그림의 키는 칸 높이의 95%, 발끝은 칸 아래에서 1.4% 위, 몸 중심선이 칸 가운데.
// 걷기 엔진이 칸마다 같은 자리에 같은 크기로 그리므로, 방향이 바뀌어도 키와 발 높이가 튀지 않아야 한다.

const FIG_H = 0.95;
const FOOT = 0.014;
/** 칸 좌우에 비워 두는 폭(칸 폭 대비). 옆 칸으로 색이 넘어가지 않게 */
const PAD = 0.02;
/** 색을 번지게 채운 띠에 남기는 알파. 0이면 브라우저가 그 화소의 색을 버려서 번진 색이 사라진다 */
export const ALPHA_FLOOR = 12;

/** 칸 안에서 그림 하나가 놓일 자리: 이 크기(w×h)로 줄여 왼쪽 위를 (ox, oy)에 둔다 */
export type Slot = { w: number; h: number; ox: number; oy: number };

/**
 * 다섯 그림이 칸에 놓일 크기와 자리. 모두 같은 키로 맞추고, 가장 넓은 그림이 칸을 넘으면 다섯을 같은 비율로 줄인다(shrink < 1).
 * 크기 조절(줄이기)은 부르는 쪽이 한다. 그 결과를 composeAtlas에 넘긴다.
 */
export function layoutAtlas(figs: Rgba[], cellW: number, cellH: number): { slots: Slot[]; shrink: number } {
  const boxes = figs.map(box);
  const figH = Math.round(cellH * FIG_H), pad = Math.round(cellW * PAD);
  const shrink = Math.min(1, ...boxes.map((b) => (cellW - 2 * pad) / (b.w * (figH / b.h))));
  const footY = cellH - Math.round(cellH * FOOT);
  const slots = figs.map((f, i) => {
    const b = boxes[i], s = (figH / b.h) * shrink;
    let ox = Math.round(cellW / 2 - b.axis * s);
    // 중심선을 가운데에 두되 몸이 칸 밖으로 나가지 않게 민다
    ox = Math.max(pad - Math.round(b.x0 * s), Math.min(cellW - pad - Math.round((b.x1 + 1) * s), ox));
    return { w: Math.max(1, Math.round(f.w * s)), h: Math.max(1, Math.round(f.h * s)), ox, oy: footY - Math.round((b.y1 + 1) * s) };
  });
  return { slots, shrink };
}

/** 그림을 판의 (ox, oy)에 그대로 옮겨 놓는다(판 밖은 잘린다) */
export function paste(canvas: Rgba, piece: Rgba, ox: number, oy: number): void {
  for (let y = Math.max(0, -oy); y < piece.h && y + oy < canvas.h; y++) {
    const x = Math.max(0, -ox);
    const n = Math.min(piece.w, canvas.w - ox) - x;
    if (n <= 0) continue;
    const s = (y * piece.w + x) * 4;
    canvas.data.set(piece.data.subarray(s, s + n * 4), ((y + oy) * canvas.w + x + ox) * 4);
  }
}

/** 또렷한 화소(알파 FIRM 이상)에서 reach 화소 안쪽인 곳(대각선도 한 걸음) */
function dilate(alpha: Uint8Array, w: number, h: number, reach: number): Uint8Array {
  // 가로로 넓히고 세로로 넓히면 대각선까지 한 걸음으로 치는 넓히기와 같다
  const seed = new Uint8Array(w * h), wide = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) seed[k] = alpha[k] >= FIRM ? 1 : 0;
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) { if (seed[y * w + x]) last = x; if (x - last <= reach) wide[y * w + x] = 1; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (seed[y * w + x]) last = x; if (last - x <= reach) wide[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (wide[y * w + x]) last = y; if (y - last <= reach) out[y * w + x] = 1; }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (wide[y * w + x]) last = y; if (last - y <= reach) out[y * w + x] = 1; }
  }
  return out;
}

/**
 * 크기를 맞춘 다섯 그림(pieces[i]는 slots[i]의 크기)을 한 줄 묶음으로 놓는다.
 * 칸마다 몸 바깥으로 색을 번지게 채우고(칸 폭의 1/40 화소) 그 띠에 옅은 알파를 남긴다. 띠 밖은 색도 알파도 0이다.
 * 번진 색이 있어야 걷기 화면에서 줄여 그릴 때 가장자리에 어두운 테가 생기지 않는다.
 */
export function composeAtlas(pieces: Rgba[], slots: Slot[], cellW: number, cellH: number): Rgba {
  const n = pieces.length;
  const atlas = new Uint8Array(cellW * n * cellH * 4);
  const reach = Math.max(4, Math.round(cellW / 40));
  for (let i = 0; i < n; i++) {
    const cell: Rgba = { data: new Uint8Array(cellW * cellH * 4), w: cellW, h: cellH };
    paste(cell, pieces[i], slots[i].ox, slots[i].oy);
    const before = new Uint8Array(cellW * cellH);
    for (let k = 0; k < cellW * cellH; k++) before[k] = cell.data[k * 4 + 3];
    bleed(cell.data, cellW, cellH, reach);
    const band = dilate(before, cellW, cellH, reach);
    for (let k = 0; k < cellW * cellH; k++) {
      if (band[k]) cell.data[k * 4 + 3] = Math.max(cell.data[k * 4 + 3], ALPHA_FLOOR);
      // 띠 밖이라도 이미 보이는 화소(알파 SOLID 이상)는 지우지 않는다: 작은 묶음으로 줄이면 가는 선(끈, 삐친 머리카락 한 올)이
      // 또렷한 화소 없이 알파 120~199로만 남는데, 몸에서 떨어진 그런 선까지 지우면 작은 묶음에서만 선이 끊긴다
      else if (before[k] < SOLID) cell.data[k * 4] = cell.data[k * 4 + 1] = cell.data[k * 4 + 2] = cell.data[k * 4 + 3] = 0;
    }
    for (let y = 0; y < cellH; y++) {
      atlas.set(cell.data.subarray(y * cellW * 4, (y + 1) * cellW * 4), (y * cellW * n + i * cellW) * 4);
    }
  }
  return { data: atlas, w: cellW * n, h: cellH };
}
