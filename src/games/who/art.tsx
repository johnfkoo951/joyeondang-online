// 종이 인형과 작은 그림. 원시 도형만 쓰고, 색은 사람 카드 색(--doll, who.module.css의 data-color)을 따른다.
import type { ReactNode } from 'react';
import type { WhoIcon } from './logic';
import s from './who.module.css';

/** 사람 카드 그림(24×24 선 그림). 글자색을 따른다 */
export function IconArt({ name, size = 24 }: { name: WhoIcon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={s.icon} aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

const ICONS: Record<WhoIcon, ReactNode> = {
  pen: (
    <>
      <path d="M5 19l1.2-4.4L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L9.4 17.8z" />
      <path d="M13.8 7l3.2 3.2M5 19l4.4-1.2" />
    </>
  ),
  piano: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
      <path d="M8 6v12M12 6v12M16 6v12" />
      <path d="M6.5 6v6.5h3V6M14.5 6v6.5h3V6" className={s.iconFill} />
    </>
  ),
  brush: (
    <>
      <path d="M13.5 4.5l6 6-6.8 6.8-6-6z" />
      <path d="M6.7 11.3l-1.9 1.9c-1.9 1.9-.9 4.6-2.3 6.3 2.6.9 5.5.3 6.9-1.7l1.6-1.6" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c3.2 3.4 3.2 13.6 0 17M12 3.5c-3.2 3.4-3.2 13.6 0 17" />
    </>
  ),
  book: (
    <>
      <path d="M3.5 5.5c3-1.2 6-.8 8.5 1v13c-2.5-1.8-5.5-2.2-8.5-1z" />
      <path d="M20.5 5.5c-3-1.2-6-.8-8.5 1v13c2.5-1.8 5.5-2.2 8.5-1z" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10.5 10 5.5 19.5 4.5 19.5 14 14 19 5 19z" />
      <path d="M5 19l8.5-8.5" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
  heart: <path d="M12 19.5s-7.5-4.6-7.5-10A4 4 0 0 1 12 7.3a4 4 0 0 1 7.5 2.2c0 5.4-7.5 10-7.5 10z" />,
  music: (
    <>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="7" cy="17.5" r="2.2" className={s.iconFill} />
      <circle cx="17" cy="15.5" r="2.2" className={s.iconFill} />
    </>
  ),
  spark: <path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2" />,
};

/** 막대에 꽂힌 종이 인형(64×96). 몸은 사람 색, 가슴에 그 사람 그림 */
export function PaperDoll({ icon }: { icon: WhoIcon }) {
  return (
    <svg viewBox="0 0 64 96" className={s.doll} aria-hidden="true" focusable="false">
      <rect x="30" y="70" width="4" height="26" rx="2" className={s.dollStick} />
      <path d="M22 44 L10 58 M42 44 L54 58" className={s.dollArm} />
      <path d="M25 38 H39 Q41 38 42 40 L49 70 Q49.5 73 46 73 H18 Q14.5 73 15 70 L22 40 Q23 38 25 38 Z" className={s.dollBody} />
      <circle cx="32" cy="23" r="14" className={s.dollHead} />
      <path d="M19 19 Q22 8 32 8.5 Q42 8 45 19 Q38 13.5 32 14 Q26 13.5 19 19 Z" className={s.dollHair} />
      <circle cx="27" cy="24" r="1.8" className={s.dollInk} />
      <circle cx="37" cy="24" r="1.8" className={s.dollInk} />
      <circle cx="23.5" cy="28.5" r="2.6" className={s.dollCheek} />
      <circle cx="40.5" cy="28.5" r="2.6" className={s.dollCheek} />
      <path d="M28.5 30 Q32 33 35.5 30" className={s.dollMouth} />
      <circle cx="32" cy="56" r="9.5" className={s.dollBadge} />
      <g transform="translate(25 49) scale(0.5833)" className={s.dollIcon}>
        {ICONS[icon]}
      </g>
    </svg>
  );
}

/** 문장을 맞히면 오는 작은 별 */
export function StarArt() {
  return (
    <svg viewBox="0 0 24 24" className={s.starArt} aria-hidden="true" focusable="false">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />
    </svg>
  );
}

export function IconNext() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
    </svg>
  );
}
export function IconCheck() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
export function IconDoor() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 4H6v16h8M10 12h10M17 9l3 3-3 3" />
    </svg>
  );
}
export function IconPicture() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4 17.5l5-4.5 3.5 3 3-2.5 4.5 4" />
    </svg>
  );
}
export function SoundArt({ off }: { off: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
      {off ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}
