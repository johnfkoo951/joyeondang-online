// 종이 인형 색(수첩에서 고른다). 그림이 확정되면 인형 모양도 여기서 고르게 한다.
export const DOLL_COLORS: { id: string; label: string; css: string }[] = [
  { id: 'spring', label: '봄 분홍', css: '#e8b4c2' },
  { id: 'summer', label: '여름 녹색', css: '#9cc39a' },
  { id: 'autumn', label: '가을 주황', css: '#e3a671' },
  { id: 'winter', label: '겨울 청회색', css: '#a9b8c4' },
  { id: 'cream', label: '크림', css: '#efe2c4' },
  { id: 'ink', label: '먹색', css: '#5a544d' },
];
export const DOLL_DEFAULT = '#c98a5a';
export function dollCss(id: string | null | undefined): string {
  return DOLL_COLORS.find((c) => c.id === id)?.css ?? DOLL_DEFAULT;
}
