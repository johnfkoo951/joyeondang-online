// 초대 코드와 철회 번호. 헷갈리는 글자(0 O 1 I L U)를 뺀 알파벳으로 4자씩 끊는다.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function makeCode(groups = 3, size = 4): string {
  const out: string[] = [];
  const n = CODE_ALPHABET.length;
  const limit = 256 - (256 % n); // 치우침 없이 고르기
  while (out.length < groups * size) {
    const bytes = new Uint8Array(groups * size * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && out.length < groups * size) out.push(CODE_ALPHABET[b % n]);
    }
  }
  const chunks: string[] = [];
  for (let i = 0; i < groups; i++) chunks.push(out.slice(i * size, (i + 1) * size).join(''));
  return chunks.join('-');
}

/** DB의 hash_code()와 같은 정규화(하이픈·공백 제거, 대문자) */
export function normalizeCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export const HANGUL_KEYBOARD_NOTE = '한글 자판으로 들어온 것 같아요. 영문 자판으로 바꿔 다시 적어 주세요.';
/** 화면이 영어일 때(lib/messages-en이 옮긴다) */
export const HANGUL_KEYBOARD_NOTE_EN = 'It looks like it was typed with a Korean keyboard. Please switch to English letters and type it again.';

/**
 * 코드가 모자랄 때 보일 안내(길이가 되면 null). 한글 자판인 채로 치면 정규화에서 글자가 모두 지워져
 * 「다시 확인」만 나오고 손님은 코드가 틀린 줄 안다: 한글(자모 포함)이 섞여 있으면 자판을 알려 준다.
 */
export function shortCodeNote(raw: string, min: number, note: string): string | null {
  if (normalizeCode(raw).length >= min) return null;
  return /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(raw) ? HANGUL_KEYBOARD_NOTE : note;
}
