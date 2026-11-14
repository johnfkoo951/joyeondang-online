// 반려동물 설정의 모양(서버 /api/pet → 화면 → 엔진). 다른 것을 불러오지 않아 서버 라우트와 화면이 가볍게 함께 쓴다.

/** 쉬는 자세의 갈래. sit은 기본 쉬는 자세(rest 모형), 나머지는 고르면 더 받는 모형이다 */
export type PetRest = 'sit' | 'loaf' | 'groom' | 'lie';
/** 더 받을 수 있는 쉬는 자세(설정의 rests 열쇠) */
export const PET_EXTRA_RESTS = ['loaf', 'groom', 'lie'] as const;
export type PetExtraRest = (typeof PET_EXTRA_RESTS)[number];

/** 반려동물이 자주 찾아가는 사람: 걷기 화면에 보이는 이름과 무게(1~3, 클수록 자주) */
export type PetFriend = { n: string; w: number };

/** 화면이 서버에서 받아 엔진에 주는 반려동물. 이름과 친구는 명단 손님 이상에게만 온다 */
export type PetSpec = {
  /** 걷는 자세 모형(GLB): 같은 사이트의 경로 */
  walk: string;
  /** 쉬는(앉은) 자세 모형. 없으면 걷는 자세로 쉰다 */
  rest?: string;
  /** 더 있는 쉬는 자세 모형(식빵 자세·털 고르기·눕기). 없거나 받지 못하면 그 자세 대신 rest로 쉰다 */
  rests?: Partial<Record<PetExtraRest, string>>;
  /** 이름표 글. 없으면 말풍선만 */
  name?: string;
  /** 화면이 영어일 때의 이름표 글(name이 있을 때만). 없으면 영어 화면에도 name 그대로 */
  nameEn?: string;
  /** 크기 배율(모형 파일의 약속 크기에 곱한다, 기본 1) */
  scale?: number;
  /** 서버 시각 - 이 기기 시각(ms). 기기 시계가 틀려도 모든 화면이 같은 칸을 본다 */
  clock?: number;
  /** 자주 찾아가는 사람들(함께 걷기에서 이 이름으로 보이는 사람). 없으면 늘 정해진 일정대로 다닌다 */
  friends?: PetFriend[];
  /** 이 화면 사람이 함께 걷기에서 남에게 보이는 이름(친구 목록과 견준다: 남의 화면과 같은 판단을 하려고) */
  me?: string;
};

/** 같은 사이트의 GLB 경로만(밖의 주소, 상위 폴더, 이중 슬래시는 받지 않는다) */
export const PET_ASSET = /^\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.glb$/;
/** 이름표 글자 수 상한 */
export const PET_NAME_MAX = 20;
/** 크기 배율의 범위 */
export const PET_SCALE_MIN = 0.3;
export const PET_SCALE_MAX = 2;
/** 친구 수 상한, 무게 범위, 이름 글자 수 상한(걷기 이름표와 같은 16자) */
export const PET_FRIENDS_MAX = 8;
export const PET_WEIGHT_MIN = 1;
export const PET_WEIGHT_MAX = 3;
export const PET_FRIEND_NAME_MAX = 16;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** 모형 경로로 받을 수 있는 값인가 */
export const petAsset = (v: unknown): string | null => (typeof v === 'string' && v.length <= 160 && PET_ASSET.test(v) ? v : null);

/** 이름표로 받을 수 있는 글(앞뒤 빈칸을 뗀다). 아니면 null */
export function petName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && [...t].length <= PET_NAME_MAX && !CONTROL.test(t) ? t : null;
}

/** 크기 배율로 받을 수 있는 값. 아니면 null */
export const petScale = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= PET_SCALE_MIN && v <= PET_SCALE_MAX ? v : null;

/** 친구 무게로 받을 수 있는 값(1~3). 아니면 null */
export const petWeight = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= PET_WEIGHT_MIN && v <= PET_WEIGHT_MAX ? v : null;

/** 더 있는 쉬는 자세 목록(열쇠가 맞고 경로가 같은 사이트의 GLB인 것만). 하나도 없으면 null */
export function petRests(v: unknown): Partial<Record<PetExtraRest, string>> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Partial<Record<PetExtraRest, string>> = {};
  for (const k of PET_EXTRA_RESTS) {
    const a = petAsset(o[k]);
    if (a) out[k] = a;
  }
  return Object.keys(out).length ? out : null;
}

/** 걷기 이름으로 받을 수 있는 글(제어문자 없이 1~16자, 앞뒤 빈칸 없음). 아니면 null */
export function petFriendName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t === v && [...t].length <= PET_FRIEND_NAME_MAX && !CONTROL.test(t) ? t : null;
}

/** 친구 목록(이름이 맞는 것만, 같은 이름은 무게가 큰 쪽 하나, 상한까지). 하나도 없으면 null */
export function petFriends(v: unknown): PetFriend[] | null {
  if (!Array.isArray(v)) return null;
  const by = new Map<string, number>();
  for (const item of v.slice(0, PET_FRIENDS_MAX * 2)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const n = petFriendName(o.n);
    const w = petWeight(o.w);
    if (!n || w === null) continue;
    if (!by.has(n) && by.size >= PET_FRIENDS_MAX) continue;
    by.set(n, Math.max(by.get(n) ?? 0, w));
  }
  return by.size ? [...by].map(([n, w]) => ({ n, w })) : null;
}

/** 응답의 pet(그리고 시계 차이)을 엔진 값으로. 모양이 틀리면 null(반려동물 없이 걷는다) */
export function petSpecFrom(v: unknown, clock = 0): PetSpec | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const walk = petAsset(o.walk);
  if (!walk) return null;
  const spec: PetSpec = { walk };
  const rest = petAsset(o.rest);
  if (rest) spec.rest = rest;
  const rests = petRests(o.rests);
  if (rests) spec.rests = rests;
  const name = petName(o.name);
  if (name) {
    spec.name = name;
    const nameEn = petName(o.nameEn);
    if (nameEn) spec.nameEn = nameEn;
  }
  const scale = petScale(o.scale);
  if (scale !== null) spec.scale = scale;
  if (Number.isFinite(clock) && clock !== 0) spec.clock = clock;
  const friends = petFriends(o.friends);
  if (friends) {
    spec.friends = friends;
    const me = petFriendName(o.me);
    if (me) spec.me = me;
  }
  return spec;
}
