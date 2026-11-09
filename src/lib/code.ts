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
