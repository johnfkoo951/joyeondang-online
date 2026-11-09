// 박공 아래 잼의 그림(글자를 못 읽어도 알아보게). 색은 currentColor나 CSS 변수.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const, ...p });

export const IconSound = (p: P & { off?: boolean }) => {
  const { off, ...rest } = p;
  return (
    <svg {...base(rest)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
      {off ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
};
export const IconStop = (p: P) => (
  <svg {...base(p)} fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const IconPlay = (p: P) => (
  <svg {...base(p)} fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
);
export const IconDoor = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4H6v16h8M10 12h10M17 9l3 3-3 3" />
  </svg>
);
export const IconEar = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10a5 5 0 1 1 10 0c0 3-3 4-3 6.5A2.5 2.5 0 0 1 9 17" />
    <path d="M10 10a2 2 0 1 1 4 0" />
  </svg>
);
export const IconHand = (p: P) => (
  <svg {...base(p)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5A5.5 5.5 0 0 1 5 16.5L4 13a1.5 1.5 0 0 1 2.6-1.4L8 13.5" />
  </svg>
);
export const IconNote = (p: P) => (
  <svg {...base(p)} fill="currentColor"><path d="M9 17.5a3 3 0 1 1-2-2.8V5l11-2v11.5a3 3 0 1 1-2-2.8V6.4L9 7.7z" /></svg>
);
export const IconStar = (p: P & { on?: boolean }) => {
  const { on, ...rest } = p;
  return (
    <svg {...base(rest)} fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  );
};

/** 판정 얼굴: good = 웃음, early = 왼쪽으로 기운 화살, late = 오른쪽, miss = 물음 */
export const Face = ({ kind, ...p }: P & { kind: 'good' | 'early' | 'late' | 'miss' | 'extra' }) => (
  <svg {...base(p)} viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="currentColor" opacity={0.18} />
    <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth={2} />
    {kind === 'good' ? (
      <g fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <path d="M10.5 13.5h.01M21.5 13.5h.01" strokeWidth={3.2} />
        <path d="M10 18.5c3.5 4 8.5 4 12 0" />
      </g>
    ) : kind === 'early' || kind === 'late' ? (
      <path d={kind === 'early' ? 'M20 10l-7 6 7 6M13 16h10' : 'M12 10l7 6-7 6M19 16H9'} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <g fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
        <path d="M12.5 12.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3" />
        <path d="M16 22.5h.01" strokeWidth={3.4} />
      </g>
    )}
  </svg>
);

/** 큰 북(받아 치기 단추 안 그림) */
export const DrumArt = ({ hit }: { hit?: boolean }) => (
  <svg viewBox="0 0 200 170" width="100%" height="100%" aria-hidden="true" focusable="false">
    <ellipse cx="100" cy="128" rx="84" ry="26" fill="var(--jam-drum-side)" />
    <rect x="16" y="58" width="168" height="70" fill="var(--jam-drum-side)" />
    <path d="M16 70 L50 126 L84 70 L118 126 L152 70 L184 116" fill="none" stroke="var(--jam-drum-cord)" strokeWidth="5" strokeLinejoin="round" />
    <ellipse cx="100" cy="58" rx="84" ry="26" fill="var(--jam-drum-rim)" />
    <ellipse cx="100" cy="58" rx="76" ry="21" fill={hit ? 'var(--jam-drum-hit)' : 'var(--jam-drum-skin)'} />
    <ellipse cx="82" cy="52" rx="26" ry="6" fill="#fff" opacity="0.28" />
  </svg>
);
