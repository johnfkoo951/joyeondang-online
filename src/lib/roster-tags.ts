// 명단의 행사 태그(관리 화면 전용). 행사 초대 코드(0018)로 들어온 명단 줄은 그 코드의 이름표(event_codes.label,
// 예: 행사 이름)를 태그로 달고, 관리 화면 명단을 그 태그로 거른다. 어느 코드로 들어왔는지는 줄의 roster.event_code_id에
// 이미 적혀 있어 새 칸 없이 이미 들어온 줄에도 그대로 붙는다.
// 태그는 관리 화면에만 보인다: 행사 코드 표는 집주인만 읽고(0018의 event_codes_admin_select), 손님 화면은 이 파일을 쓰지 않는다.
// 순수 함수만 둔다(node --test로 바로 돈다).

export type TagRow = { event_code_id?: string | null };
export type EventLabel = { id: string; label: string };
/** 명단에 한 줄이라도 달린 태그. count: 그 태그가 달린 줄 수(뺀 줄 포함: 명단 표와 같은 셈) */
export type RosterTag = { id: string; label: string; count: number };
/** 거르기: 'all' 모두, 'none' 태그 없는 줄(사람별 초대·이메일·입장 요청으로 들어온 줄), 그 밖은 행사 코드 id */
export type TagFilter = 'all' | 'none' | string;

/** 거르기 값(주소의 ?tag=)으로 쓰는 글자 */
export const NO_TAG = 'none';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 행사 코드 목록(집주인의 세션으로 읽은 id·label). 모양이 이상한 줄과 빈 이름표는 뺀다 */
export function readLabels(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of Array.isArray(raw) ? raw : []) {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (typeof o.id === 'string' && UUID.test(o.id) && label) out.set(o.id, label.slice(0, 40));
  }
  return out;
}

/** 그 줄의 태그(행사 코드의 이름표). 행사 코드로 들어오지 않았거나 그 코드를 찾지 못하면 null */
export function tagOf(row: TagRow, labels: Map<string, string>): { id: string; label: string } | null {
  const id = typeof row.event_code_id === 'string' ? row.event_code_id : null;
  const label = id ? labels.get(id) : undefined;
  return id && label ? { id, label } : null;
}

/** 명단에 달린 태그들: 많이 달린 것부터(같으면 이름표 차례). 달린 줄이 없는 코드는 뺀다 */
export function rosterTags(rows: readonly TagRow[], labels: Map<string, string>): RosterTag[] {
  const count = new Map<string, number>();
  for (const r of rows) {
    const t = tagOf(r, labels);
    if (t) count.set(t.id, (count.get(t.id) ?? 0) + 1);
  }
  return [...count].map(([id, n]) => ({ id, label: labels.get(id) as string, count: n }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

/** 주소의 ?tag= 값을 거르기로. 모르는 값(없는 코드, 모양이 틀림)은 'all'(모두 보인다) */
export function readTagFilter(raw: unknown, tags: readonly RosterTag[]): TagFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === NO_TAG) return 'none';
  return typeof v === 'string' && tags.some((t) => t.id === v) ? v : 'all';
}

/** 거른 명단 줄(차례는 그대로) */
export function filterByTag<T extends TagRow>(rows: readonly T[], filter: TagFilter, labels: Map<string, string>): T[] {
  if (filter === 'all') return [...rows];
  if (filter === 'none') return rows.filter((r) => !tagOf(r, labels));
  return rows.filter((r) => tagOf(r, labels)?.id === filter);
}

/** 거르기 단추의 주소(명단 자리로 바로 내려간다) */
export function tagHref(filter: TagFilter): string {
  return filter === 'all' ? '/admin#roster' : `/admin?tag=${encodeURIComponent(filter)}#roster`;
}
