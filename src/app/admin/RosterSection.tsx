import Link from 'next/link';
import { addRoster, revokeRoster, setRosterEmail } from '@/app/admin/actions';
import { InviteButton } from '@/components/InviteButton';
import { RosterRename } from '@/components/RosterRename';
import { filterByTag, readTagFilter, rosterTags, tagHref, tagOf, type RosterTag, type TagFilter } from '@/lib/roster-tags';
import rosterCss from './roster.module.css';

// ───────── 승인함의 명단 칸(집주인만 보는 화면). 데이터는 승인함이 집주인의 세션으로 읽어 넘긴다.
// 행사 초대 코드(0018)로 들어온 줄은 이름 옆에 그 코드의 이름표(예: 행사 이름)를 태그로 달고, 그 태그로 거른다(주소의 ?tag=).
// 태그는 줄의 event_code_id와 코드 이름표만으로 정하므로 이미 들어온 줄에도 붙는다(src/lib/roster-tags.ts).

export type RosterRow = {
  id: string;
  display_name: string;
  role: string;
  slot: string | null;
  email: string | null;
  claimed_by: string | null;
  revoked_at: string | null;
  event_code_id?: string | null;
};

/** labels: 행사 코드 id → 이름표(readLabels). tag: 주소의 ?tag= 값 */
export function RosterSection({ rows, labels, tag }: { rows: RosterRow[]; labels: Map<string, string>; tag: unknown }) {
  const tags = rosterTags(rows, labels);
  const filter = readTagFilter(tag, tags);
  const shown = filterByTag(rows, filter, labels);
  const untagged = rows.length - tags.reduce((n, t) => n + t.count, 0);
  return (
    <section className="card stack" aria-labelledby="roster">
      <h2 id="roster" style={{ marginTop: 0 }}>명단 {rows.length}</h2>
      <p className="small muted">구글 이메일을 넣어 두면 그 사람은 그 구글 계정으로 로그인만 하면 바로 들어와요(따로 보낼 것 없음). 이메일을 모를 때만 초대 링크를 만들어 보내요.</p>
      <form action={addRoster} className="btn-row">
        <input type="text" name="display_name" placeholder="이름" required aria-label="이름" />
        <select name="role" aria-label="역할" defaultValue="guest">
          <option value="guest">초대 손님</option>
          <option value="family">가족</option>
        </select>
        <select name="slot" aria-label="회차" defaultValue="">
          <option value="">회차 없음</option>
          <option value="15">15시</option>
          <option value="16">16시</option>
          <option value="17">17시</option>
          <option value="11">11시</option>
          <option value="online">온라인</option>
          <option value="family">가족</option>
        </select>
        <input type="email" name="email" placeholder="구글 이메일(넣으면 로그인만 하면 바로)" aria-label="구글 이메일" />
        <button className="btn btn-small btn-pine">명단에 넣기</button>
      </form>
      {tags.length ? <TagFilterBar tags={tags} filter={filter} total={rows.length} untagged={untagged} /> : null}
      <table className="plain">
        <thead>
          <tr><th>이름</th><th>역할</th><th>회차</th><th>이어짐</th><th /></tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const t = tagOf(r, labels);
            return (
              <tr key={r.id}>
                <td>
                  {r.display_name}{r.revoked_at ? <span className="muted small"> (뺌)</span> : null}
                  {t ? <span className={`badge ${rosterCss.tag}`} title="이 행사 초대 코드로 들어온 분">{t.label}</span> : null}
                  {!r.revoked_at ? <> <RosterRename id={r.id} name={r.display_name} /></> : null}
                </td>
                <td>{r.role}</td>
                <td>{r.slot ?? ''}</td>
                <td>{r.claimed_by ? '계정과 이어짐' : r.email ? '구글 로그인하면 바로 들어와요' : '이메일이나 초대 링크 필요'}</td>
                <td>
                  {!r.claimed_by && !r.revoked_at && !r.email ? (
                    <form action={setRosterEmail} className="inline-form">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="email" name="email" placeholder="구글 이메일" aria-label={`${r.display_name} 구글 이메일`} required />
                      <button className="btn btn-small btn-pine">이메일 넣기</button>
                    </form>
                  ) : null}
                  {!r.claimed_by && !r.revoked_at && !r.email ? <InviteButton rosterId={r.id} /> : null}
                  {!r.revoked_at && r.role !== 'admin' ? (
                    <form action={revokeRoster} className="inline-form">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn btn-small">명단에서 빼기</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!shown.length ? <p className="muted" style={{ margin: 0 }}>이 태그로 걸러진 줄이 없어요.</p> : null}
    </section>
  );
}

/** 명단을 행사 태그로 거르는 칩: 모두 · 행사마다(많이 달린 것부터) · 태그 없음. 주소(?tag=)로 걸러 고친 뒤에도 그대로 남는다 */
function TagFilterBar({ tags, filter, total, untagged }: { tags: RosterTag[]; filter: TagFilter; total: number; untagged: number }) {
  const item = (f: TagFilter, text: string, n: number) => (
    <Link key={f} className="chip" href={tagHref(f)} aria-current={filter === f ? 'page' : undefined}>
      {text} <span className={rosterCss.count}>{n}</span>
    </Link>
  );
  return (
    <nav className={rosterCss.tagBar} aria-label="명단을 행사 태그로 거르기">
      {item('all', '모두', total)}
      {tags.map((t) => item(t.id, t.label, t.count))}
      {item('none', '태그 없음', untagged)}
    </nav>
  );
}
