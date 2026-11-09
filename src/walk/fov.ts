// 시야각. three.js 없이 계산만 해서 테스트에서 바로 쓴다.
/** 세로 화면(휴대폰)에서는 세로 시야를 넓혀 옆이 너무 좁아 보이지 않게 한다 */
export function fovFor(view: 'first' | 'third', aspect: number): number {
  const base = view === 'first' ? 70 : 55;
  return aspect >= 1 ? base : Math.min(view === 'first' ? 90 : 72, base + (1 - aspect) * 40);
}
