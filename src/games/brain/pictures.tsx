// 그림 카드와 작은 아이콘. 원시 도형만, 색은 CSS 모듈 클래스(사이트 색 토큰)로만 칠한다.
import type { ReactNode } from 'react';
import type { KidsDrawerId, Picture } from './bank';
import s from './brain.module.css';

const L = s.pLine;

/** 어린아이 판 그림 카드(64×64) */
export function Pic({ name }: { name: Picture | KidsDrawerId }) {
  return (
    <svg viewBox="0 0 64 64" className={s.pic} aria-hidden="true" focusable="false">
      {PICS[name]}
    </svg>
  );
}

const PICS: Record<Picture | KidsDrawerId, ReactNode> = {
  book: (
    <>
      <path className={s.pPaper} d="M6 16 Q19 11 32 17 V52 Q19 46 6 51 Z" />
      <path className={s.pPaper} d="M58 16 Q45 11 32 17 V52 Q45 46 58 51 Z" />
      <circle className={s.pLamp} cx="46" cy="27" r="5" />
      <path className={s.pPine} d="M37 44 L44 34 L52 44 Z" />
      <path className={L} d="M6 16 Q19 11 32 17 Q45 11 58 16 V51 Q45 46 32 52 Q19 46 6 51 Z M32 17 V52 M12 25 H25 M12 32 H25 M12 39 H22" />
    </>
  ),
  books: (
    <>
      <rect className={s.pRoof} x="10" y="42" width="44" height="11" rx="2" />
      <rect className={s.pFocus} x="14" y="31" width="38" height="11" rx="2" />
      <rect className={s.pPine} x="8" y="20" width="40" height="11" rx="2" />
      <path className={L} d="M10 42 H54 V53 H10 Z M14 31 H52 V42 H14 Z M8 20 H48 V31 H8 Z M44 42 V53 M18 31 V42 M40 20 V31" />
    </>
  ),
  laptop: (
    <>
      <rect className={s.pFocus} x="13" y="14" width="38" height="26" rx="3" />
      <path className={s.pPaper} d="M6 46 H58 L54 52 H10 Z" />
      <path className={L} d="M13 14 H51 V40 H13 Z M6 46 H58 L54 52 H10 Z M13 40 L8 46 M51 40 L56 46 M27 49 H37" />
      <path className={s.pLine2} d="M20 22 H36 M20 28 H44 M20 33 H30" />
    </>
  ),
  phone: (
    <>
      <rect className={s.pPaper} x="20" y="6" width="24" height="52" rx="5" />
      <rect className={s.pFocus} x="24" y="13" width="16" height="34" rx="2" />
      <path className={L} d="M25 6 H39 Q44 6 44 11 V53 Q44 58 39 58 H25 Q20 58 20 53 V11 Q20 6 25 6 Z M29 9.5 H35" />
      <circle className={s.pInk} cx="32" cy="52.5" r="2" />
    </>
  ),
  paint: (
    <>
      <path className={s.pPaper} d="M32 10 C14 10 6 22 8 34 C10 46 22 54 32 52 C38 51 36 44 41 43 C48 42 56 40 56 30 C56 18 46 10 32 10 Z" />
      <circle className={s.pRoof} cx="20" cy="26" r="4.5" />
      <circle className={s.pLamp} cx="31" cy="19" r="4.5" />
      <circle className={s.pPine} cx="43" cy="24" r="4.5" />
      <circle className={s.pFocus} cx="19" cy="39" r="4.5" />
      <path className={L} d="M32 10 C14 10 6 22 8 34 C10 46 22 54 32 52 C38 51 36 44 41 43 C48 42 56 40 56 30 C56 18 46 10 32 10 Z" />
      <path className={s.pOak} d="M58 40 L44 56 L41 53 L55 37 Z" />
      <path className={L} d="M58 40 L44 56 L41 53 L55 37 Z" />
    </>
  ),
  music: (
    <>
      <ellipse className={s.pRoof} cx="20" cy="47" rx="8" ry="6" transform="rotate(-20 20 47)" />
      <ellipse className={s.pRoof} cx="46" cy="41" rx="8" ry="6" transform="rotate(-20 46 41)" />
      <path className={s.pInk} d="M26 14 L54 8 V16 L26 22 Z" />
      <path className={L} d="M27 46 V14 L54 8 V40 M26 22 L54 16" />
    </>
  ),
  read: (
    <>
      <rect className={s.pTone} x="14" y="8" width="36" height="48" rx="3" />
      <rect className={s.pPaper} x="22" y="18" width="20" height="10" rx="1.5" />
      <path className={L} d="M14 8 H50 V56 H14 Z M20 8 V56 M22 18 H42 V28 H22 Z" />
    </>
  ),
  screen: (
    <>
      <rect className={s.pTone} x="8" y="10" width="48" height="32" rx="3" />
      <path className={s.pPaper} d="M14 16 H50 V36 H14 Z" />
      <path className={L} d="M8 10 H56 V42 H8 Z M26 42 L22 54 H42 L38 42" />
      <circle className={s.pTone} cx="32" cy="26" r="5" />
    </>
  ),
  make: (
    <>
      <circle className={s.pTone} cx="24" cy="34" r="16" />
      <circle className={s.pPaper} cx="18" cy="30" r="3.5" />
      <circle className={s.pPaper} cx="27" cy="25" r="3.5" />
      <circle className={s.pPaper} cx="20" cy="41" r="3.5" />
      <path className={L} d="M40 34 A16 16 0 1 1 40 33.9" />
      <ellipse className={s.pInk} cx="47" cy="48" rx="6" ry="4.5" transform="rotate(-20 47 48)" />
      <path className={L} d="M52 46 V14 Q57 20 60 24" />
    </>
  ),
};

type IconName = 'soundOn' | 'soundOff' | 'check' | 'cross' | 'next' | 'star' | 'drawers' | 'kid' | 'again' | 'door' | 'play';

/** 단추 아이콘(24×24, 글자색을 따른다) */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" className={s.icon} aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

const ICONS: Record<IconName, ReactNode> = {
  soundOn: <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z M16.5 8.5 Q19 12 16.5 15.5 M19 6 Q23 12 19 18" />,
  soundOff: <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z M17 9 L22 15 M22 9 L17 15" />,
  check: <path d="M5 12.5 L10 17 L19 7" />,
  cross: <path d="M6 6 L18 18 M18 6 L6 18" />,
  next: <path d="M5 12 H18 M13 7 L18 12 L13 17" />,
  star: <path d="M12 3 L14.6 9 L21 9.4 L16 13.5 L17.7 20 L12 16.4 L6.3 20 L8 13.5 L3 9.4 L9.4 9 Z" />,
  drawers: <path d="M4 4 H20 V20 H4 Z M4 9.3 H20 M4 14.6 H20 M9.3 4 V20 M14.6 4 V20" />,
  kid: <path d="M12 3 A9 9 0 1 0 12.01 3 M8.5 10 V10.5 M15.5 10 V10.5 M8 14.5 Q12 18 16 14.5" />,
  again: <path d="M5 12 A7 7 0 1 0 7.5 6.6 M7.5 2.8 V6.8 H3.5" />,
  door: <path d="M14 4 H6 V20 H14 M10 12 H20 M17 9 L20 12 L17 15" />,
  play: <path d="M8 5.5 V18.5 L19 12 Z" />,
};
