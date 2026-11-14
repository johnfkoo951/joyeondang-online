import { SHORTCUTS, type ShortcutId } from './shortcuts';

type Props = { id: ShortcutId; k?: never } | { k: string; id?: never };

/**
 * 메뉴·단추 이름 옆의 단축키 표시(「지도 M」). 키 글자는 단축키 표(shortcuts.ts)에서 읽는다(표에 없는 키는 k로).
 * 키보드 기기에서만 보인다: 손가락 기기에서는 CSS가 숨긴다(걷기 화면의 coarse 판정과 같은 (pointer: coarse) 조건).
 * 화면 낭독기에는 단추의 aria-keyshortcuts로 알리므로 이 글자는 읽지 않게 한다(단추 이름에 「M」이 붙지 않게).
 */
export function KeyHint(p: Props) {
  const key = p.id ? SHORTCUTS[p.id].key : p.k;
  return <kbd className="walk-kbd" aria-hidden="true">{key}</kbd>;
}
