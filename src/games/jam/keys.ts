// 입력칸 안에서 친 키는 놀이 단축키가 받지 않는다. 한글 조합 중 키도 거른다.
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes((t as HTMLInputElement).type);
}

export const composing = (e: KeyboardEvent): boolean => e.isComposing || e.keyCode === 229;
