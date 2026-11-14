// 앱 로그인 코드의 모양(화면과 서버가 함께 쓴다). 헷갈리는 글자(0 O 1 I)를 뺀 32글자 가운데 여섯 자.
// 손님은 띄어 쓰거나 하이픈을 넣거나 소문자로 쳐도 된다. 보일 때는 세 자씩 띄운다(ABC DEF).

export const HANDOFF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const HANDOFF_LEN = 6;
/** 코드가 살아 있는 시간(ms) */
export const HANDOFF_TTL_MS = 5 * 60_000;

/** 손님이 친 글을 코드로: 대문자로, 띄어쓰기·하이픈을 빼고, 글자표 밖이 있거나 길이가 틀리면 null */
export function normalizeHandoffCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== HANDOFF_LEN) return null;
  for (const ch of s) if (!HANDOFF_ALPHABET.includes(ch)) return null;
  return s;
}

/** 보이는 모양: ABC DEF */
export function formatHandoffCode(code: string): string {
  return code.length === HANDOFF_LEN ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
