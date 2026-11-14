// 컨트롤 룸 표시 캔버스(2D)에 글을 얹는다: 맨 위 띠(제목·시각·사람 수·녹화)와 칸마다 이름표(구획 이름, 사람 수, 이름들).
// 녹화는 이 캔버스를 그대로 담으므로, 보이는 것이 곧 남는 것이다. 색은 globals.css 토큰을 읽어 쓴다(밤 모드 포함).

/** 맨 위 띠 높이(CSS px) */
export const HEAD_H = 34;
const FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export type Palette = { wall: string; text: string; dim: string; accent: string; accentText: string; rec: string };

/** 감시 화면처럼 어두운 바탕에 밝은 글씨: 밝은 모드는 잉크색 바탕, 밤 모드는 종이색 바탕 */
export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => cs.getPropertyValue(k).trim();
  const attr = typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined;
  const dark = attr === 'dark' ? true : attr === 'light' ? false : (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return {
    wall: dark ? v('--paper') : v('--ink'),
    text: dark ? v('--ink') : v('--paper'),
    dim: dark ? v('--ink-3') : v('--line-2'),
    accent: v('--lamp'),
    accentText: dark ? v('--paper') : v('--ink'),
    rec: v('--roof'),
  };
}

export type CellLabel = { title: string; count: number; names: readonly string[] };
export type HeadInfo = { left: string; middle: string; right: string; recording: boolean };
type Box = { x: number; y: number; w: number; h: number };

function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

/** 글이 너비 안에 들게 이름을 앞에서부터 붙이고, 남는 사람은 「외 n명」 */
export function fitNames(names: readonly string[], width: number, measure: (s: string) => number): string {
  if (!names.length) return '';
  let out = '';
  for (let i = 0; i < names.length; i++) {
    const next = out ? `${out} · ${names[i]}` : names[i];
    const rest = names.length - i - 1;
    const tail = rest > 0 ? ` 외 ${rest}명` : '';
    if (measure(next + tail) > width) {
      const left = names.length - i;
      return out ? `${out} 외 ${left}명` : `${names.length}명`;
    }
    out = next;
  }
  return out;
}

/** 칸 하나의 이름표. r은 표시 캔버스 화소, s는 CSS px 하나의 화소 수 */
export function drawCell(g: CanvasRenderingContext2D, r: Box, l: CellLabel, s: number, pal: Palette) {
  const big = r.w / s >= 640;
  const fs = (big ? 16 : 12) * s;
  const pad = (big ? 10 : 6) * s;
  const ph = fs + (big ? 10 : 7) * s;
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.textBaseline = 'middle';
  g.font = `600 ${fs}px ${FONT}`;
  // 사람 수(오른쪽 위): 사람이 있으면 등불색
  const cnt = `${l.count}명`;
  const cw = g.measureText(cnt).width + 12 * s;
  g.fillStyle = l.count > 0 ? pal.accent : pal.wall;
  g.globalAlpha = l.count > 0 ? 0.95 : 0.7;
  pill(g, r.x + r.w - pad - cw, r.y + pad, cw, ph, 6 * s);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = l.count > 0 ? pal.accentText : pal.text;
  g.fillText(cnt, r.x + r.w - pad - cw + 6 * s, r.y + pad + ph / 2);
  // 구획 이름(왼쪽 위)
  const room = r.w - pad * 3 - cw - 14 * s;
  let title = l.title;
  while (title.length > 1 && g.measureText(title).width > room) title = title.slice(0, -1);
  if (title !== l.title) title = `${title.slice(0, -1)}…`;
  const tw = g.measureText(title).width + 14 * s;
  g.fillStyle = pal.wall;
  g.globalAlpha = 0.78;
  pill(g, r.x + pad, r.y + pad, tw, ph, 6 * s);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = pal.text;
  g.fillText(title, r.x + pad + 7 * s, r.y + pad + ph / 2);
  // 이름들(아래 띠)
  if (l.names.length) {
    g.font = `500 ${fs * 0.95}px ${FONT}`;
    const line = fitNames(l.names, r.w - pad * 2 - 14 * s, (t) => g.measureText(t).width);
    const lw = Math.min(r.w - pad * 2, g.measureText(line).width + 14 * s);
    g.fillStyle = pal.wall;
    g.globalAlpha = 0.72;
    pill(g, r.x + pad, r.y + r.h - pad - ph, lw, ph, 6 * s);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = pal.text;
    g.fillText(line, r.x + pad + 7 * s, r.y + r.h - pad - ph / 2);
  }
  g.restore();
}

/** 맨 위 띠: 왼쪽 제목·시각, 가운데 사람 수, 오른쪽 상태(녹화 중이면 빨간 점과 걸린 시간) */
export function drawHead(g: CanvasRenderingContext2D, width: number, s: number, info: HeadInfo, pal: Palette) {
  const h = HEAD_H * s;
  g.save();
  g.fillStyle = pal.wall;
  g.fillRect(0, 0, width, h);
  g.textBaseline = 'middle';
  g.font = `600 ${14 * s}px ${FONT}`;
  g.fillStyle = pal.text;
  g.textAlign = 'left';
  g.fillText(info.left, 12 * s, h / 2);
  g.textAlign = 'center';
  g.fillText(info.middle, width / 2, h / 2);
  g.textAlign = 'right';
  if (info.recording) {
    const tw = g.measureText(info.right).width;
    g.fillStyle = pal.rec;
    g.beginPath();
    g.arc(width - 12 * s - tw - 10 * s, h / 2, 5 * s, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = info.recording ? pal.text : pal.dim;
  g.fillText(info.right, width - 12 * s, h / 2);
  g.restore();
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 2026-11-12 14:03:22 (이 기기 시각) */
export function clockText(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
