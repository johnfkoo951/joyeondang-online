// 캐릭터 겉모습 계약. 걷기 화면(꾸미기 패널), 엔진(아바타), 게임 서버(다른 사람에게 전달), DB(프로필)가 같은 모양을 쓴다.
// 두 가지 중 하나다: 직접 꾸민 기본 인형(doll) 또는 사진으로 만든 캐릭터 그림(photo, 이미지 세션이 만든다).
// 어느 쪽이든 이름표 위에 뜨는 짧은 칭호(title)를 하나 달 수 있다(내가 쓰는 한 줄, TITLE_MAX자).
// 순수 데이터만(three에 의존하지 않음). 늘 긍정적으로: 고를 수 있는 것은 옷·머리·소품뿐, 몸매·나이 같은 것은 없다.

export const HAIR_STYLES = ['short', 'bob', 'long', 'curly', 'bun', 'cap'] as const;
export const ACCESSORIES = ['none', 'glasses', 'hat', 'bow', 'headphones', 'scarf'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Accessory = (typeof ACCESSORIES)[number];

/** 고를 수 있는 색(사이트 색과 어울리게 정해 둔 것만). 피부색은 여러 톤을 같은 무게로 둔다 */
export const HAIR_COLORS = ['#2b2420', '#4a3426', '#7a5232', '#a8743f', '#c9a36b', '#8c8c8c', '#3e6b4f', '#b4593b'] as const;
export const SKIN_TONES = ['#f6dcc8', '#efcfb2', '#e2b48f', '#c99470', '#a8754f', '#7d5537'] as const;
export const CLOTH_COLORS = ['#3e6b4f', '#b4593b', '#c98a5a', '#2f4a6b', '#6b8fb5', '#e3c45a', '#8a6aa8', '#ece4d6', '#3a3a3a', '#d98ca0'] as const;

export type DollLook = {
  hair: HairStyle;
  hairColor: string;
  skin: string;
  top: string;
  bottom: string;
  acc: Accessory;
};

/** 칭호: 이름표 위에 뜨는 내가 쓴 짧은 한 줄. 없으면 키 자체가 없다 */
export type LookTitle = { title?: string };
export type CharacterLook = ({ kind: 'doll'; doll: DollLook } | { kind: 'photo'; url: string }) & LookTitle;

/** 칭호 글자 수(코드 포인트). 이름표 위 한 줄에 들어가는 길지 않은 문장 */
export const TITLE_MAX = 20;
/** 제어 문자·글자 방향 바꾸기·보이지 않는 글자(이름표를 뒤집거나 숨은 글을 넣지 못하게) */
const TITLE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
/** 칭호를 고친다: 위의 글자를 빼고 공백을 하나로, 앞뒤를 걷고 TITLE_MAX자로 자른다. 글이 아니면 빈 글 */
export function cleanTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.replace(TITLE_CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, TITLE_MAX).join('').trim();
}

export const DEFAULT_DOLL: DollLook = {
  hair: 'short',
  hairColor: HAIR_COLORS[0],
  skin: SKIN_TONES[1],
  top: CLOTH_COLORS[0],
  bottom: CLOTH_COLORS[8],
  acc: 'none',
};

const HEX = /^#[0-9a-f]{6}$/;
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const hex = (v: unknown, list: readonly string[], fallback: string) =>
  typeof v === 'string' && HEX.test(v.toLowerCase()) && list.includes(v.toLowerCase()) ? v.toLowerCase() : fallback;

/** 바깥(저장소, DB, 게임 서버)에서 온 값을 믿지 않고 고칠 수 있는 범위로 맞춘다 */
export function cleanDoll(v: unknown, base: DollLook = DEFAULT_DOLL): DollLook {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return {
    hair: pick(o.hair, HAIR_STYLES, base.hair),
    hairColor: hex(o.hairColor, HAIR_COLORS, base.hairColor),
    skin: hex(o.skin, SKIN_TONES, base.skin),
    top: hex(o.top, CLOTH_COLORS, base.top),
    bottom: hex(o.bottom, CLOTH_COLORS, base.bottom),
    acc: pick(o.acc, ACCESSORIES, base.acc),
  };
}

/** 사진 캐릭터 주소는 우리 사이트의 /api/avatar/<id> 모양만 받는다 */
const PHOTO_URL = /^\/api\/avatar\/[0-9a-f-]{8,40}$/;

export function cleanLook(v: unknown, base: DollLook = DEFAULT_DOLL): CharacterLook {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const title = cleanTitle(o.title);
  const tag = title ? { title } : {};
  if (o.kind === 'photo' && typeof o.url === 'string' && PHOTO_URL.test(o.url)) return { kind: 'photo', url: o.url, ...tag };
  return { kind: 'doll', doll: cleanDoll(o.doll, base), ...tag };
}

/** 칭호만 바꾼 겉모습(빈 글이면 칭호를 뗀다). 겉모습의 나머지는 그대로 */
export function withTitle(look: CharacterLook, title: unknown): CharacterLook {
  return cleanLook({ ...look, title });
}

/**
 * 새 겉모습에 칭호 칸이 아예 없으면 앞의 칭호를 이어 단다(칭호를 모르는 화면이 고른 인형·사진).
 * 칸이 있으면(빈 글이어도) 그것을 따른다: 칭호 칸에서 지운 것이다
 */
export function carryTitle(next: unknown, prev: LookTitle | null | undefined): CharacterLook {
  const o = next && typeof next === 'object' ? (next as Record<string, unknown>) : {};
  return cleanLook('title' in o ? o : { ...o, title: prev?.title });
}

/** 사진 겉모습이 가리키는 그림 id. 인형이면 null */
export function photoId(look: CharacterLook): string | null {
  return look.kind === 'photo' ? look.url.slice(look.url.lastIndexOf('/') + 1) : null;
}

/** 예전 「인형 색」 하나만 있던 사람: 그 색을 윗옷으로 */
export function dollFromColor(color: string | null | undefined): DollLook {
  const c = typeof color === 'string' ? color.toLowerCase() : '';
  return { ...DEFAULT_DOLL, top: (CLOTH_COLORS as readonly string[]).includes(c) ? c : DEFAULT_DOLL.top };
}
