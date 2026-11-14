// 하늘 고르기: 집 배치는 그대로 두고 하늘, 빛, 안개, 바깥 풍경 색만 바꾼다(시간과 날씨를 바꾼 시험 지도).
// 사이트 기본값은 서버 환경 변수 WALK_SKY이고, 한 사람만 미리 보려면 걷기 주소에 ?sky=stars 처럼 붙인다.
// 방 장면은 방마다 창밖 세계가 따로 있어 바꾸지 않는다(집 세계에만).
// 새 하늘을 더할 때: WalkSky에 이름을 넣고 LOOKS에 값을 채운다(타입 검사와 시험이 빠진 칸을 잡는다).
// three.js 없이 돈다: 시험이 바로 부르고, 그리는 쪽은 night-sky.ts다.

export type WalkSky = 'day' | 'stars';
export const WALK_SKIES: readonly WalkSky[] = ['day', 'stars'];

/** 환경 변수나 주소 값을 하늘 이름으로. 모르는 값은 낮(기본) */
export function skyOf(v: string | null | undefined): WalkSky {
  const s = (v ?? '').trim().toLowerCase();
  return (WALK_SKIES as readonly string[]).includes(s) ? (s as WalkSky) : 'day';
}

/** 주소에 ?sky= 가 있으면 그 하늘(이 화면에서만 보는 미리보기), 없으면 사이트 기본값 */
export function pickSky(siteDefault: WalkSky, search: string): WalkSky {
  const q = new URLSearchParams(search).get('sky');
  return q ? skyOf(q) : siteDefault;
}

/** 이 탭이 기억하는 미리보기 하늘의 열쇠(세션 저장소) */
export const SKY_KEY = 'jy.walk.sky';

/**
 * pickSky에 탭 기억을 더한다: ?sky=로 고른 하늘은 이 탭이 닫힐 때까지 남는다(링크로 받은 밤하늘이
 * 로그인이나 첫 화면을 다녀와도 그대로이게). ?sky=day면 기억을 지운다. 저장소를 못 쓰면 주소만 본다.
 */
export function pickSkyKept(siteDefault: WalkSky, search: string, store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): WalkSky {
  const q = new URLSearchParams(search).get('sky');
  try {
    if (q) {
      const s = skyOf(q);
      if (s === 'day') store?.removeItem(SKY_KEY);
      else store?.setItem(SKY_KEY, s);
      return s;
    }
    const kept = store?.getItem(SKY_KEY);
    return kept ? skyOf(kept) : siteDefault;
  } catch {
    return pickSky(siteDefault, search);
  }
}

export type SkyLook = {
  /** 밤인가: 별을 띄우고 바깥 풍경 색을 낮춘다 */
  night: boolean;
  /** 하늘 배경(위, 지평선). 하늘 구가 없는 실측 지도에서 보인다 */
  background: [string, string];
  fog: string;
  /** 하늘빛(위 색, 땅 색, 세기) */
  hemi: [string, string, number];
  /** 해 자리의 빛(밤에는 달빛 대신 은은한 별빛) 색과 세기. 그림자 방향은 낮과 같다 */
  sun: [string, number];
  /** 주변 반사(집 재질이 비추는 방) 세기 */
  environment: number;
  /** 빛을 받지 않는 바깥 땅에 곱하는 색 */
  landscape: string;
  /** 집 창유리가 스스로 내는 빛(색, 세기) */
  glass: [string, number];
  /** 등 밑 따뜻한 빛 웅덩이를 몇 배로 */
  pools: number;
  /**
   * 하늘 구 색: 꼭대기, 지평선, 지평선 위 옅은 빛, 은하수. 하늘 구와 별 셰이더는 출력 색 공간 변환을 하지 않아
   * 적은 색보다 꽤 어둡게 보인다(밤하늘을 눈으로 맞춘 값이다). 새 하늘은 적은 색이 아니라 화면을 보고 맞춘다
   */
  dome: { zenith: string; horizon: string; glow: string; band: string };
};

const LOOKS: { [K in Exclude<WalkSky, 'day'>]: SkyLook } = {
  // 별이 잘 보이는 맑은 밤: 달 없이 별과 은하수, 마당은 등불과 창빛으로 걸을 만큼 밝게
  stars: {
    night: true,
    background: ['#050a1c', '#1a2650'],
    fog: '#101a36',
    hemi: ['#6f82c4', '#1c1c26', 0.36],
    sun: ['#9db2ff', 0.3],
    environment: 0.08,
    landscape: '#2a3558',
    glass: ['#ffd6a0', 0.16],
    pools: 2.6,
    dome: { zenith: '#04081a', horizon: '#1c2a55', glow: '#3b3556', band: '#8590c2' },
  },
};

/** 낮(기본)은 null: 그리는 쪽이 원래 값을 그대로 쓴다 */
export function skyLook(sky: WalkSky): SkyLook | null {
  return sky === 'day' ? null : LOOKS[sky];
}

/** 같은 씨앗이면 늘 같은 수열(하늘이 볼 때마다 바뀌지 않게) */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** 은하수 띠의 축(이 축에 수직인 큰 원이 띠). 하늘 구 셰이더와 같은 값을 쓴다 */
export const MILKY_WAY_AXIS: [number, number, number] = (() => {
  const v = [0.32, 0.55, -0.77], l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** 별 하나: 하늘 구 위 방향(단위 벡터), 밝기(0~1), 색(0 푸름 ~ 1 노랑), 반짝임 위상 */
export type Star = { x: number; y: number; z: number; mag: number; warm: number; phase: number };

/**
 * 별 count개. 지평선 아래는 버리고, 은하수 띠 가까이는 거의 다 남겨 띠를 따라 별이 짙다.
 * 어두운 별이 훨씬 많다(밝기를 다섯제곱으로 눌러 고른다: 절반 넘게 밝은 별은 열에 하나쯤).
 */
export function starField(count: number, seed = 1129): Star[] {
  const r = lcg(seed), out: Star[] = [];
  const [ax, ay, az] = MILKY_WAY_AXIS;
  while (out.length < count) {
    const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const x = s * Math.cos(t), y = u, z = s * Math.sin(t);
    if (y < -0.04) continue;
    const off = x * ax + y * ay + z * az;
    const keep = 0.42 + 0.58 * Math.exp(-(off * off) / (0.2 * 0.2));
    if (r() > keep) continue;
    out.push({ x, y, z, mag: Math.pow(r(), 5), warm: r(), phase: r() * Math.PI * 2 });
  }
  return out;
}

/** 떨어지는 별똥별: 시작과 끝 방향(단위 벡터), 진행(0~1), 꼬리 길이(진행 비율) */
export type Meteor = { from: [number, number, number]; to: [number, number, number]; p: number; tail: number };

const dirOf = (alt: number, az: number): [number, number, number] => [Math.cos(alt) * Math.sin(az), Math.sin(alt), Math.cos(alt) * Math.cos(az)];

/**
 * 시각 t(초)에 떨어지고 있는 별똥별, 없으면 null. every초 칸마다 하나씩 칸 안 아무 때나 1초 남짓 떨어진다.
 * 시각만으로 정해져 화면을 다시 그리지 않는 동안에도 차례가 밀리지 않는다.
 */
export function meteorAt(t: number, seed = 7, every = 11): Meteor | null {
  if (!Number.isFinite(t) || t < 0) return null;
  const slot = Math.floor(t / every);
  const r = lcg(Math.imul(seed, 7919) + Math.imul(slot, 104729));
  const start = r() * (every - 2);
  const dur = 0.9 + r() * 0.6;
  const local = t - slot * every - start;
  if (local < 0 || local > dur) return null;
  const alt = (38 + r() * 30) * (Math.PI / 180), az = r() * Math.PI * 2;
  const drop = (16 + r() * 14) * (Math.PI / 180), swing = (r() < 0.5 ? -1 : 1) * (8 + r() * 16) * (Math.PI / 180);
  return { from: dirOf(alt, az), to: dirOf(Math.max(0.12, alt - drop), az + swing), p: local / dur, tail: 0.35 };
}
