// 조용 모드 그림 둘: 식빵 자세로 앉은 고양이와 박수 손. 바깥 그림 파일 없이 SVG로만 그리고, 색은 사이트 토큰(CSS)을 따른다.

export function LoafCat({ className }: { className?: string }) {
  return (
    <svg className={`loaf-cat ${className ?? ''}`} viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      {/* 꼬리: 몸 옆을 따라 감는다 */}
      <path className="loaf-cat-line" d="M52 41 C60 41 62 34 56 31" fill="none" />
      {/* 식빵 몸통 */}
      <path className="loaf-cat-body" d="M10 42 C9 30 15 21 28 19 C42 17 55 23 56 35 C56.6 39 55 42 52 42 Z" />
      {/* 머리와 귀 */}
      <path className="loaf-cat-body" d="M13 15 L14.5 4.5 L21.5 11 C23.5 10.4 25.5 10.4 27.5 11 L34.5 4.5 L36 15 C38.5 18 38.5 27 33 30.5 C29 33 20 33 16 30.5 C10.5 27 10.5 18 13 15 Z" />
      {/* 감은 눈, 코, 앞발 */}
      <path className="loaf-cat-line" d="M17.5 21 q2.2 2 4.4 0 M27 21 q2.2 2 4.4 0" fill="none" />
      <path className="loaf-cat-nose" d="M23.2 24.5 h2.6 l-1.3 1.6 Z" />
      <path className="loaf-cat-line" d="M18 42 q2 -2.4 4 0 M26 42 q2 -2.4 4 0" fill="none" />
    </svg>
  );
}

export function ClapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="8" width="6" height="12" rx="3" transform="rotate(-18 9 14)" />
      <rect x="12" y="7" width="6" height="12" rx="3" transform="rotate(16 15 13)" />
      <path d="M4.5 4.5 l1.8 1.8 M12 2.5 v2.4 M19.5 4.5 l-1.8 1.8" />
    </svg>
  );
}
