// 걷기 화면의 지도 고르기(관리자 전용): 지금 집(house)과 실측 1층 시험 지도(shell). 순수 함수와 작은 구독만 둔다.
// 고른 것은 이 기기에만 기억한다(localStorage). 주소의 ?map=shell / ?map=house가 있으면 그것이 먼저이고, 그 값을 기억한다.
// 관리자가 아니면 화면이 이 값을 묻지 않는다(서버도 실측 지도를 주지 않는다).

export type WalkMap = 'house' | 'shell';
export const WALK_MAP_KEY = 'jy.walk.map.v1';
type StoreLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isMap = (v: unknown): v is WalkMap => v === 'house' || v === 'shell';

/** 주소의 ?map= 값(모르는 값이면 null) */
export function mapFromSearch(search: string): WalkMap | null {
  try {
    const v = new URLSearchParams(search).get('map');
    return isMap(v) ? v : null;
  } catch {
    return null;
  }
}

/** 고른 지도: 주소가 먼저(그리고 기억), 없으면 이 기기에 남은 것, 그것도 없거나 저장소가 막혔으면 집 */
export function syncWalkMap(search: string, store: StoreLike | null): WalkMap {
  const fromUrl = mapFromSearch(search);
  if (fromUrl) {
    try { store?.setItem(WALK_MAP_KEY, fromUrl); } catch { /* 기억만 못 한다 */ }
    return fromUrl;
  }
  try {
    const v = store?.getItem(WALK_MAP_KEY);
    return isMap(v) ? v : 'house';
  } catch {
    return 'house';
  }
}

/** 지도 값을 주소에 싣는다(집이면 뺀다). 다른 query와 #은 그대로 */
export function hrefWithMap(href: string, map: WalkMap): string {
  const u = new URL(href);
  if (map === 'shell') u.searchParams.set('map', 'shell');
  else u.searchParams.delete('map');
  return `${u.pathname}${u.search}${u.hash}`;
}

// ───────── 화면에서: 지금 고른 지도를 읽고 바꾸고, 바뀌면 알린다

const listeners = new Set<() => void>();
const storage = (): StoreLike | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** 지금 고른 지도(주소·기억). 서버에서는 늘 집 */
export function readChosenMap(): WalkMap {
  if (typeof window === 'undefined') return 'house';
  return syncWalkMap(window.location.search, storage());
}

export function subscribeChosenMap(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 지도를 고른다: 기억하고 주소를 맞춘 뒤 알린다(새 세계를 받는 일은 부르는 쪽) */
export function chooseMap(map: WalkMap) {
  try { storage()?.setItem(WALK_MAP_KEY, map); } catch { /* 기억만 못 한다 */ }
  try {
    window.history.replaceState(window.history.state, '', hrefWithMap(window.location.href, map));
  } catch { /* 주소를 못 바꿔도 이번 방문 동안은 바뀐다 */ }
  listeners.forEach((l) => l());
}
