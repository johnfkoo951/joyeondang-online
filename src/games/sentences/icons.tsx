// 놀이 안에서만 쓰는 작은 그림(글을 못 읽어도 알아보게). 색은 currentColor.
type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

/** 줄에 걸린 종이 두 장 */
export function WallIcon({ size = 40 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4 10c10 4 30 4 40 0" />
      <rect x="9" y="13" width="13" height="18" rx="1.5" transform="rotate(-4 15 22)" />
      <rect x="26" y="13" width="13" height="20" rx="1.5" transform="rotate(3 32 23)" />
      <path d="M12 20h7M12 24h6M29 21h7M29 25h7M29 29h5" />
    </svg>
  );
}

/** 연필과 원고지 칸 */
export function PenIcon({ size = 40 }: P) {
  return (
    <svg {...base(size)}>
      <rect x="6" y="26" width="30" height="14" rx="1.5" />
      <path d="M16 26v14M26 26v14" />
      <path d="M30 20 40 6l4 3-10 14-5 2z" />
    </svg>
  );
}

/** 창살 빛 무늬 */
export function LightIcon({ size = 40 }: P) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="11" r="5" />
      <path d="M12 2v2M3 11h2M5.6 4.6l1.4 1.4" />
      <path d="M14 22h28l-6 20H8z" />
      <path d="M25 22l-4 20M11 32h28" />
    </svg>
  );
}

export function SoundIcon({ size = 22, on }: P & { on: boolean }) {
  return (
    <svg {...base(size)}>
      <path d="M8 19h7l10-8v26l-10-8H8z" />
      {on ? <path d="M31 17c3 4 3 10 0 14M36 12c6 7 6 17 0 24" /> : <path d="m32 18 10 12M42 18 32 30" />}
    </svg>
  );
}

export function ArrowIcon({ size = 26, dir }: P & { dir: 'left' | 'right' }) {
  return (
    <svg {...base(size)}>
      {dir === 'left' ? <path d="M30 10 16 24l14 14" /> : <path d="m18 10 14 14-14 14" />}
    </svg>
  );
}

export function BackIcon({ size = 22 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M20 12 8 24l12 12M9 24h31" />
    </svg>
  );
}

export function CheckIcon({ size = 22 }: P) {
  return (
    <svg {...base(size)}>
      <path d="m10 25 9 9 19-20" />
    </svg>
  );
}

/** 문으로 나가기(그만하기) */
export function DoorIcon({ size = 22 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M28 8H12v32h16M20 24h20M34 18l6 6-6 6" />
    </svg>
  );
}

/** 다음(▶) */
export function NextIcon({ size = 22 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M16 10v28l22-14z" fill="currentColor" />
    </svg>
  );
}

/** 다시(↻) */
export function AgainIcon({ size = 22 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M39 24a15 15 0 1 1-4.4-10.6" />
      <path d="M39 8v9h-9" />
    </svg>
  );
}
