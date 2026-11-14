// 종이 인형 색(수첩에서 고른다). 그림이 확정되면 인형 모양도 여기서 고르게 한다.
// en: 화면이 영어일 때의 이름(한국어 label은 그대로)
import type { Accessory, HairStyle } from '@/walk/look';

export const DOLL_COLORS: { id: string; label: string; en: string; css: string }[] = [
  { id: 'spring', label: '봄 분홍', en: 'Spring pink', css: '#e8b4c2' },
  { id: 'summer', label: '여름 녹색', en: 'Summer green', css: '#9cc39a' },
  { id: 'autumn', label: '가을 주황', en: 'Autumn orange', css: '#e3a671' },
  { id: 'winter', label: '겨울 청회색', en: 'Winter blue-gray', css: '#a9b8c4' },
  { id: 'cream', label: '크림', en: 'Cream', css: '#efe2c4' },
  { id: 'ink', label: '먹색', en: 'Charcoal', css: '#5a544d' },
];
export const DOLL_DEFAULT = '#c98a5a';
export function dollCss(id: string | null | undefined): string {
  return DOLL_COLORS.find((c) => c.id === id)?.css ?? DOLL_DEFAULT;
}

// ───────── 3D 인형 꾸미기의 고르는 이름(걷기 화면의 캐릭터 창과 「내 캐릭터」 화면이 같은 이름을 쓴다)
// 값(머리 모양·소품 열쇠, 색 코드)은 walk/look.ts가 정한다. 색 이름은 그 목록과 같은 차례다(HAIR_COLORS, CLOTH_COLORS).

/** 한국어와 영어 이름 한 쌍 */
export type DollName = { ko: string; en: string };

export const HAIR_NAMES: Readonly<Record<HairStyle, DollName>> = {
  short: { ko: '짧은 머리', en: 'Short' },
  bob: { ko: '단발', en: 'Bob' },
  long: { ko: '긴 머리', en: 'Long' },
  curly: { ko: '곱슬', en: 'Curly' },
  bun: { ko: '올림머리', en: 'Bun' },
  cap: { ko: '캡 모자', en: 'Cap' },
};
export const ACC_NAMES: Readonly<Record<Accessory, DollName>> = {
  none: { ko: '없음', en: 'None' },
  glasses: { ko: '안경', en: 'Glasses' },
  hat: { ko: '밀짚모자', en: 'Straw hat' },
  bow: { ko: '리본', en: 'Bow' },
  headphones: { ko: '헤드폰', en: 'Headphones' },
  scarf: { ko: '목도리', en: 'Scarf' },
};
/** 머리색 이름(HAIR_COLORS와 같은 차례) */
export const HAIR_COLOR_NAMES: readonly DollName[] = [
  { ko: '검은 갈색', en: 'Black-brown' },
  { ko: '진한 갈색', en: 'Dark brown' },
  { ko: '갈색', en: 'Brown' },
  { ko: '밝은 갈색', en: 'Light brown' },
  { ko: '금빛', en: 'Golden' },
  { ko: '은회색', en: 'Silver gray' },
  { ko: '초록', en: 'Green' },
  { ko: '붉은 갈색', en: 'Auburn' },
];
/** 옷 색 이름(CLOTH_COLORS와 같은 차례) */
export const CLOTH_NAMES: readonly DollName[] = [
  { ko: '숲 초록', en: 'Forest green' },
  { ko: '벽돌', en: 'Brick' },
  { ko: '살구 갈색', en: 'Apricot brown' },
  { ko: '남색', en: 'Navy' },
  { ko: '하늘 파랑', en: 'Sky blue' },
  { ko: '겨자', en: 'Mustard' },
  { ko: '보라', en: 'Purple' },
  { ko: '크림', en: 'Cream' },
  { ko: '먹색', en: 'Charcoal' },
  { ko: '분홍', en: 'Pink' },
];
