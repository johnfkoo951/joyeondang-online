// 컨트롤 룸 화면 배치: 화면 n개를 벽(가로 w, 세로 h, CSS px)에 16:9 칸으로 가장 크게 늘어놓는다. DOM 없는 계산만.
export type Rect = { x: number; y: number; w: number; h: number };

/** 칸의 가로:세로(화면 계획의 시야각이 이 비율 기준이다) */
export const CELL_ASPECT = 16 / 9;
/** 칸 사이 틈(px) */
export const CELL_GAP = 4;

/**
 * 칸을 가장 크게 하는 열 수로 늘어놓고 벽 가운데에 둔다. 마지막 줄이 덜 차면 그 줄도 가운데로.
 * 좌표는 정수 px(칸 사이에 반 화소 틈이 생기지 않게)
 */
export function gridRects(n: number, w: number, h: number, gap = CELL_GAP, aspect = CELL_ASPECT): Rect[] {
  if (!(n > 0) || !(w > 0) || !(h > 0)) return [];
  let best = { cols: 1, rows: n, cw: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = Math.min((w - gap * (cols - 1)) / cols, ((h - gap * (rows - 1)) / rows) * aspect);
    // 같은 크기면 줄이 적은 쪽(넓은 화면에 맞게)
    if (cw > best.cw + 1e-9) best = { cols, rows, cw };
  }
  const cw = Math.max(1, Math.floor(best.cw));
  const ch = Math.max(1, Math.floor(cw / aspect));
  const totalH = best.rows * ch + gap * (best.rows - 1);
  const top = Math.max(0, Math.floor((h - totalH) / 2));
  const out: Rect[] = [];
  for (let r = 0; r < best.rows; r++) {
    const inRow = Math.min(best.cols, n - r * best.cols);
    const rowW = inRow * cw + gap * (inRow - 1);
    const left = Math.max(0, Math.floor((w - rowW) / 2));
    for (let c = 0; c < inRow; c++) out.push({ x: left + c * (cw + gap), y: top + r * (ch + gap), w: cw, h: ch });
  }
  return out;
}

/** 크게 본 화면: 벽 전체 */
export function fullRect(w: number, h: number): Rect {
  return { x: 0, y: 0, w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

/**
 * 칸 비율이 16:9가 아닐 때의 세로 시야각(도). 16:9에서 가로로 보이던 만큼은 늘 보이게 한다:
 * 더 좁은 칸이면 세로를 넓히고, 더 넓은 칸이면 그대로(옆이 더 보인다)
 */
export function fovForAspect(fov16x9: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= CELL_ASPECT) return fov16x9;
  const t = Math.tan((fov16x9 * Math.PI) / 360) * (CELL_ASPECT / aspect);
  return Math.min(100, (2 * Math.atan(t) * 180) / Math.PI);
}

/** 이 점(CSS px)이 든 칸의 차례. 없으면 -1 */
export function rectAt(rects: readonly Rect[], x: number, y: number): number {
  return rects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}
