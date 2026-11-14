// 방·전시·단독 놀이 주소가 가리키는 이름이 있는가.
// 없는 이름을 응답이 시작되기 전에(proxy) 걸러 404로 답하게 하는 판정이다.
import { SECTION_BY_SLUG } from '@/content/exhibit-sections';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { resolveGameSlug } from '@/lib/game-routes';

/** 방·전시·단독 놀이 주소인데 그런 이름이 없으면 true. 다른 주소는 모두 false(그대로 지나간다) */
export function missingDoor(pathname: string): boolean {
  const m = /^\/(room|exhibit|games|play)\/([^/]+)\/?$/.exec(pathname);
  if (!m) return false;
  let slug: string;
  try {
    slug = decodeURIComponent(m[2]);
  } catch {
    return true;
  }
  if (m[1] === 'games' || m[1] === 'play') {
    return resolveGameSlug(slug) === null;
  }
  if (m[1] === 'exhibit' && m[2] === 'lettering') return false;
  return m[1] === 'room' ? !ROOM_BY_SLUG.has(slug) : !SECTION_BY_SLUG.has(slug);
}

/** 없는 이름일 때 대신 그릴 주소. 어느 쪽과도 맞지 않아 「이 문은 없어요」가 404로 나간다 */
export const NO_DOOR_PATH = '/_no-such-door';
