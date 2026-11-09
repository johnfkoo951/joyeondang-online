// 걷기 화면 아이콘. 선 굵기만 다른 단순한 그림이라 글자색(currentColor)을 따른다.
type P = { size?: number };
const base = (size = 20) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

/** 1인칭: 눈 */
export function IconEye({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 3인칭: 사람 뒤에서 보기 */
export function IconPerson({ size }: P) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20.5c.8-4 3.4-6.2 6.5-6.2s5.7 2.2 6.5 6.2" />
    </svg>
  );
}

export function IconMap({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  );
}

export function IconHelp({ size }: P) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function IconExit({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M14 4.5h4.5v15H14" />
      <path d="M10 8.5 6.5 12l3.5 3.5M6.5 12H15" />
    </svg>
  );
}

export function IconClose({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** 불러오는 화면의 집 그림 */
export function IconHouse({ size = 56 }: P) {
  return (
    <svg {...base(size)} strokeWidth={1.6}>
      <path d="M2.5 11.5 12 4l9.5 7.5" />
      <path d="M5 10v9.5h14V10" />
      <path d="M9.5 19.5v-4.2a2.5 2.5 0 0 1 5 0v4.2" />
    </svg>
  );
}

/** 길 찾기: 갈림길 표지판 */
export function IconRoute({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M12 21v-9M12 6V3" />
      <path d="M5 6h12l2.5 3L17 12H5Z" />
    </svg>
  );
}

/** 점프: 위로 뛰는 화살표와 바닥 */
export function IconJump({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

/** 말하기: 말풍선 */
export function IconChat({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5Z" />
    </svg>
  );
}

/** 함께 걷기: 두 사람 */
export function IconPeople({ size }: P) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8" r="2.8" />
      <path d="M3.5 19.5c.6-3.4 2.8-5.3 5.5-5.3s4.9 1.9 5.5 5.3" />
      <path d="M15.5 5.6a2.6 2.6 0 0 1 0 5M17 14.4c1.9.5 3.1 2.2 3.5 5.1" />
    </svg>
  );
}

/** 메뉴: 세 줄 */
export function IconMenu({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** 사진 찍기: 사진기 */
export function IconCamera({ size }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.3" />
    </svg>
  );
}
