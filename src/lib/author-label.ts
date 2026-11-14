// 승인함: 쪽지에 찍힌 이름(손님이 고르는 이름표)과 명단 이름을 나란히 보여 주기 위한 계산.
// 이름표는 손님이 자유롭게 바꾸므로, 승인하는 사람은 명단 이름을 함께 봐야 누가 쓴 글인지 안다.

export type RosterRow = { display_name: string; claimed_by: string | null; revoked_at: string | null };
export type RosterName = { name: string; revoked: boolean };
export type AuthorLabel = {
  /** 쪽지에 찍힌 이름 그대로 */
  shown: string;
  /** 명단 이름을 따로 보여 줄 때의 한 줄. 찍힌 이름과 명단 이름이 같으면 null(하나만 보인다) */
  roster: string | null;
  /** 그 한 줄을 눈에 띄게(주의 색으로) 보일지: 찍힌 이름이 명단 이름과 다르거나 명단에서 뺀 사람일 때 */
  warn: boolean;
};

/** 계정 id → 명단 이름. 한 계정에 줄이 둘이면(뺀 줄과 새 줄) 빼지 않은 줄을 쓴다 */
export function rosterNames(rows: readonly RosterRow[] | null | undefined): Map<string, RosterName> {
  const out = new Map<string, RosterName>();
  for (const r of rows ?? []) {
    if (!r.claimed_by) continue;
    const revoked = Boolean(r.revoked_at);
    const prev = out.get(r.claimed_by);
    if (!prev || (prev.revoked && !revoked)) out.set(r.claimed_by, { name: r.display_name, revoked });
  }
  return out;
}

const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

export function authorLabel(authorName: string, entry: RosterName | undefined): AuthorLabel {
  const shown = authorName;
  // 쪽지는 명단 손님만 쓸 수 있다. 계정과 이어진 줄이 없다면 이메일로 명단에 맞았지만 아직 묶이지 않은 손님이다
  // (묶기는 로그인할 때만 돈다: 먼저 들어온 뒤에 명단에 이메일이 올라간 경우). 바깥 사람처럼 보이지 않게 담담히 알린다
  if (!entry) return { shown, roster: '명단과 아직 묶이지 않은 계정', warn: false };
  if (!entry.revoked && norm(entry.name) === norm(authorName)) return { shown, roster: null, warn: false };
  return { shown, roster: `명단: ${entry.name}${entry.revoked ? ' (뺌)' : ''}`, warn: true };
}
