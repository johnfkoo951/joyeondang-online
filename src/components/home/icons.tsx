type P = { size?: number };
const base = (size = 22) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

/** 전시: 액자 */
export function IconFrame({ size }: P) {
  return (
    <svg {...base(size)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="m6.5 16.5 4-4.5 3 3 2-2 2.5 3.5" />
      <circle cx="9" cy="8.8" r="1.4" />
    </svg>
  );
}

/** 수첩: 끈 달린 공책 */
export function IconBook({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M9 3.5v17M12 8h4M12 11.5h4" />
    </svg>
  );
}

/** 갤러리: 사진기 */
export function IconCamera({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4 8.5A2 2 0 0 1 6 6.5h2.2l1.3-2h5l1.3 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}

/** 줄의 끝: 오른쪽 꺾쇠 */
export function IconChevron({ size = 18 }: P) {
  return (
    <svg {...base(size)}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}
