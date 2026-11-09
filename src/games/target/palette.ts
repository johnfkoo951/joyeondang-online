// 놀이방 색. 강조색은 사이트 색 토큰(globals.css)을 그대로 읽고, 못 읽으면 밝은 토큰 값을 쓴다.
// 벽지·마루처럼 넓은 면은 늘 밝은 낮 방 색으로 두고 어두운 테마는 조명으로 저녁을 만든다.

export type Palette = {
  roof: string;
  pine: string;
  lamp: string;
  focus: string;
  season: string;
  oak: string;
  paper: string;
  ink: string;
  /** 넓은 면 */
  wallA: string;
  wallB: string;
  side: string;
  ceiling: string;
  floor: string[];
  duck: string;
  beak: string;
  ballPaper: string;
  dark: boolean;
};

const FALLBACK = {
  roof: '#a9553a',
  pine: '#3e5b47',
  lamp: '#d9a441',
  focus: '#2f6f8f',
  season: '#c8743a',
  oak: '#9b7247',
  ink: '#2a2622',
};

function token(style: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const v = style?.getPropertyValue(name).trim();
  return v && /^#[0-9a-f]{3,8}$|^rgb/i.test(v) ? v : fallback;
}

export function readPalette(el: HTMLElement, theme: 'light' | 'dark'): Palette {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = getComputedStyle(el);
  } catch {
    style = null;
  }
  const t = (k: keyof typeof FALLBACK) => token(style, `--${k}`, FALLBACK[k]);
  return {
    roof: t('roof'),
    pine: t('pine'),
    lamp: t('lamp'),
    focus: t('focus'),
    season: t('season'),
    oak: '#9b7247',
    paper: '#fbf6ec',
    ink: '#2a2622',
    wallA: '#f6ecd6',
    wallB: '#dcebe3',
    side: '#f3ead9',
    ceiling: '#f8f3ea',
    floor: ['#c99f72', '#bf9468', '#d1a97c', '#c49a6d'],
    duck: '#f4c542',
    beak: '#e8893a',
    ballPaper: '#fbf7ee',
    dark: theme === 'dark',
  };
}
