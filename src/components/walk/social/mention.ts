// 대화창의 @ 멘션: 입력칸에서 「@낱말」 찾기, 고른 이름 넣기, 보낼 멘션 고르기, 글 속 멘션을 굵게 나누기, 고를 사람 찾기.
// 화면(DOM) 없이 시험할 수 있게 따로 둔다(tests/unit/social-mention.test.ts). 아무것도 불러오지 않는다.

export type Person = { sub: string; name: string };

/** 「@낱말」로 보는 가장 긴 낱말(이름표는 16자) */
const QUERY_MAX = 16;

/**
 * 커서 바로 앞의 「@낱말」. 없으면 null. @는 맨 앞이거나 공백 뒤여야 하고(글 속의 메일 주소 같은 @는 아니다),
 * 낱말에는 공백이 없다(이름을 고르면 「@이름 」으로 들어가 끝난다). 한글 조합 중인 글자도 낱말에 든다.
 */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query) || Array.from(query).length > QUERY_MAX) return null;
  return { start: at, query };
}

/** 고른 사람의 이름을 넣는다: start부터 커서까지(「@낱말」)를 「@이름 」으로 바꾸고 커서를 그 뒤로 */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const ins = `@${name} `;
  const rest = text.slice(Math.max(start, caret)).replace(/^ /, '');
  return { text: text.slice(0, start) + ins + rest, caret: start + ins.length };
}

/** 보낼 때: 고른 사람 가운데 글에 「@이름」이 아직 남은 사람만(지웠으면 뺀다), 같은 사람은 한 번, max명까지 */
export function keptMentions(body: string, picked: readonly Person[], max = 5): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of picked) {
    if (seen.has(p.sub) || !body.includes(`@${p.name}`)) continue;
    seen.add(p.sub);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

export type Segment = { text: string; mention?: string };

/** 글 속 「@이름」을 멘션 조각(mention = sub)으로 나눈다. 긴 이름부터 맞춰 본다(「@손님」과 「@손님하나」) */
export function segments(body: string, mentions: readonly Person[]): Segment[] {
  if (mentions.length === 0) return [{ text: body }];
  const names = [...mentions].filter((m) => m.name).sort((a, b) => b.name.length - a.name.length);
  const out: Segment[] = [];
  let plain = '';
  let i = 0;
  while (i < body.length) {
    const hit = body[i] === '@' ? names.find((m) => body.startsWith(`@${m.name}`, i)) : undefined;
    if (hit) {
      if (plain) out.push({ text: plain });
      plain = '';
      out.push({ text: `@${hit.name}`, mention: hit.sub });
      i += hit.name.length + 1;
    } else {
      plain += body[i];
      i += 1;
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}

/** 이 글이 나를 멘션했는가 */
export const mentionsMe = (mentions: readonly Person[], me: string | null | undefined) =>
  Boolean(me) && mentions.some((m) => m.sub === me);

/** @ 고르기 목록: 이름에 그 글자가 든 사람, 그 글자로 시작하는 사람 먼저, 그다음 가나다. 나는 뺀다 */
export function filterPeople<T extends Person>(people: readonly T[], query: string, me?: string | null, max = 8): T[] {
  const q = query.normalize('NFC').toLowerCase();
  const starts = (p: T) => (p.name.toLowerCase().startsWith(q) ? 0 : 1);
  return people
    .filter((p) => p.sub !== me && p.name.normalize('NFC').toLowerCase().includes(q))
    .sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'ko'))
    .slice(0, max);
}
