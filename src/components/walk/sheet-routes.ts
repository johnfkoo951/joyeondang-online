// 걷기 화면 위 시트로 여는 페이지들(방 쪽지·게시판, 수첩, 갤러리, 사진 캐릭터, 전시, 작은 놀이, 방명록)의 주소 판단.
// 시트 주소는 src/app/walk/@sheet/(..)… 폴더와 같아야 한다(가로채는 경로가 있는 곳만 시트로 뜬다).
// React·Next에 기대지 않아 단위 시험으로 본다(tests/unit/walk-sheet.test.ts).

export type SheetKind = 'room' | 'notebook' | 'gallery' | 'avatar' | 'exhibit' | 'games' | 'guestbook';

/** 시트로 뜨는 주소면 그 종류, 아니면 null. 방은 /room/<slug>, 전시는 /exhibit 와 /exhibit/<slug> */
export function sheetKind(pathname: string): SheetKind | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (/^\/room\/[^/]+$/.test(p)) return 'room';
  if (p === '/notebook') return 'notebook';
  if (p === '/gallery') return 'gallery';
  if (p === '/avatar') return 'avatar';
  if (p === '/games') return 'games';
  if (p === '/guestbook') return 'guestbook';
  if (p === '/exhibit' || /^\/exhibit\/[^/]+$/.test(p)) return 'exhibit';
  return null;
}

/** 방 주소의 slug(/room/<slug>) */
export function roomSlugOf(pathname: string): string | null {
  const m = /^\/room\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** 시트 머리 이름(방 밖). [한국어, 영어] */
export const SHEET_TITLES: Readonly<Record<Exclude<SheetKind, 'room'>, readonly [ko: string, en: string]>> = {
  notebook: ['내 수첩', 'My notebook'],
  gallery: ['내 갤러리', 'My gallery'],
  avatar: ['내 캐릭터 만들기', 'Make my character'],
  games: ['작은 놀이', 'Mini games'],
  guestbook: ['방명록', 'Guestbook'],
  exhibit: ['전시', 'Exhibit'],
};

/**
 * 시트 머리에 붙는 이름. 방은 방 이름(모르면 「방」). roomName은 부르는 쪽이 지금 말로 준다.
 * lang을 주지 않으면 한국어
 */
export function sheetTitle(pathname: string, roomName: (slug: string) => string | undefined, lang: 'ko' | 'en' = 'ko'): string {
  const kind = sheetKind(pathname);
  const at = lang === 'en' ? 1 : 0;
  if (kind === 'room') {
    const slug = roomSlugOf(pathname);
    return (slug && roomName(slug)) || (lang === 'en' ? 'Room' : '방');
  }
  return kind ? SHEET_TITLES[kind][at] : '';
}

export type SheetLink = { kind: 'close' } | { kind: 'sheet'; to: string } | { kind: 'none' };

export function sheetLink(href: string, here: string): SheetLink {
  let url: URL;
  let now: URL;
  try {
    now = new URL(here);
    url = new URL(href, now);
  } catch {
    return { kind: 'none' };
  }
  if (url.origin !== now.origin) return { kind: 'none' };
  if (url.pathname === now.pathname && url.search === now.search && url.hash) return { kind: 'none' };
  if ((url.pathname.replace(/\/+$/, '') || '/') === '/walk') return { kind: 'close' };
  if (sheetKind(url.pathname)) return { kind: 'sheet', to: `${url.pathname}${url.search}${url.hash}` };
  return { kind: 'none' };
}
