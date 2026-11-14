// 대화상자 안에서 Tab이 돌게 하는 판단. 화면(DOM) 없이 시험할 수 있게 따로 둔다.

/** Tab으로 닿는 것들. 제목처럼 코드로만 초점을 주는 것(tabindex="-1"), 꺼진 단추, 숨은 입력칸은 뺀다. */
export const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab(또는 Shift+Tab)을 그대로 두면 초점이 밖으로 나갈 때, 대신 초점을 줄 항목을 돌려준다. 그대로 둬도 되면 null.
 * items는 문서 순서의 Tab 자리들, isBefore(a, b)는 a가 b보다 문서에서 앞인지.
 * 지금 초점이 Tab 자리가 아니어도(열릴 때 초점을 받는 제목 등) 그 앞·뒤에 Tab 자리가 없으면 돌려보낸다:
 * 맨 처음·맨 끝에서만 막으면 제목에서 Shift+Tab 한 번에 뒤 화면으로 나간다.
 */
export function trapTarget<T>(items: readonly T[], active: T | null, shift: boolean, isBefore: (a: T, b: T) => boolean): T | null {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const at = active === null ? -1 : items.indexOf(active);
  if (at >= 0) {
    if (shift) return at === 0 ? last : null;
    return at === items.length - 1 ? first : null;
  }
  if (active === null) return shift ? last : first;
  if (shift) return isBefore(first, active) ? null : last;
  return isBefore(active, last) ? null : first;
}
