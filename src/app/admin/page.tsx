import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { addRoster, moderate, resolveRequest, revokeRoster, setDoor, setRosterEmail } from '@/app/admin/actions';
import { InviteButton } from '@/components/InviteButton';
import { DOOR_LABEL, ROOMS, ROOM_BY_SLUG, type Door } from '@/content/rooms';
import { SCOPE_LABEL } from '@/lib/access';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '승인함', robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <div className="wrap-wide stack">
      <h1>승인함</h1>
      <Suspense fallback={<p className="muted">불러오는 중</p>}>
        <AdminBody />
      </Suspense>
    </div>
  );
}

async function AdminBody() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    return <p className="note-box">집주인만 들어올 수 있는 곳이에요. <Link href="/">첫 화면으로</Link></p>;
  }
  const supabase = await createClient();
  const [queue, requests, roster, rooms] = await Promise.all([
    supabase.from('records')
      .select('id, room_slug, body, author_name, requested_visibility, created_at, marks_person, marks_minor')
      .eq('status', 'submitted').order('created_at', { ascending: true }).limit(100),
    supabase.from('entry_requests').select('id, typed_name, email, message, created_at')
      .eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('roster').select('id, display_name, role, slot, email, claimed_by, revoked_at, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('rooms').select('slug, door_state, accepts_records'),
  ]);
  const freeRoster = (roster.data ?? []).filter((r) => !r.claimed_by && !r.revoked_at);

  return (
    <div className="admin-grid">
      <section className="card stack" aria-labelledby="q">
        <h2 id="q" style={{ marginTop: 0 }}>읽을 종이 {queue.data?.length ?? 0}장</h2>
        {(queue.data ?? []).map((r) => (
          <article key={r.id} className="record admin-item">
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
            <div className="meta">
              <span>{r.author_name}</span>
              <span>{ROOM_BY_SLUG.get(r.room_slug)?.name ?? r.room_slug}</span>
              <span className="badge">요청: {SCOPE_LABEL[r.requested_visibility as keyof typeof SCOPE_LABEL]}</span>
              {r.marks_person ? <span className="badge">사람이 나와요</span> : null}
              {r.marks_minor ? <span className="badge warn">아이가 나와요</span> : null}
            </div>
            <div className="btn-row">
              {r.requested_visibility === 'public' ? <ModButton id={r.id} action="approve" visibility="public" label="인터넷에 걸기" /> : null}
              {r.requested_visibility === 'public' || r.requested_visibility === 'guests' ? (
                <ModButton id={r.id} action="approve" visibility="guests" label="손님 모두에게" />
              ) : null}
              <ModButton id={r.id} action="approve" visibility="family" label="가족만" />
              <ModButton id={r.id} action="hide" label="숨김" />
            </div>
          </article>
        ))}
      </section>

      <section className="card stack" aria-labelledby="req">
        <h2 id="req" style={{ marginTop: 0 }}>들어오고 싶다는 분 {requests.data?.length ?? 0}</h2>
        {(requests.data ?? []).map((q) => (
          <article key={q.id} className="record admin-item">
            <p style={{ margin: 0 }}><strong>{q.typed_name}</strong> <span className="muted small">{q.email}</span></p>
            {q.message ? <p className="small" style={{ margin: 0 }}>{q.message}</p> : null}
            <form action={resolveRequest} className="btn-row">
              <input type="hidden" name="id" value={q.id} />
              <select name="roster_id" aria-label="명단에서 고르기" defaultValue="">
                <option value="">새 이름으로 추가</option>
                {freeRoster.map((r) => (
                  <option key={r.id} value={r.id}>{r.display_name}{r.slot ? ` (${r.slot})` : ''}</option>
                ))}
              </select>
              <input type="text" name="new_name" placeholder="새로 추가할 때 이름" defaultValue={q.typed_name} />
              <button className="btn btn-small btn-pine" name="action" value="approve">들이기</button>
              <button className="btn btn-small" name="action" value="reject">거절</button>
            </form>
          </article>
        ))}
      </section>

      <section className="card stack" aria-labelledby="roster">
        <h2 id="roster" style={{ marginTop: 0 }}>명단 {roster.data?.length ?? 0}</h2>
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
        <table className="plain">
          <thead>
            <tr><th>이름</th><th>역할</th><th>회차</th><th>이어짐</th><th /></tr>
          </thead>
          <tbody>
            {(roster.data ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.display_name}{r.revoked_at ? <span className="muted small"> (뺌)</span> : null}</td>
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
            ))}
          </tbody>
        </table>
      </section>

      <section className="card stack" aria-labelledby="doors">
        <h2 id="doors" style={{ marginTop: 0 }}>문패</h2>
        {ROOMS.map((room) => {
          const row = (rooms.data ?? []).find((x) => x.slug === room.slug);
          const door = (row?.door_state ?? room.door) as Door;
          return (
            <form key={room.slug} action={setDoor} className="btn-row">
              <input type="hidden" name="slug" value={room.slug} />
              <span style={{ minWidth: 140 }}>{room.name}</span>
              <select name="door_state" defaultValue={door} aria-label={`${room.name} 문패`}>
                {(Object.keys(DOOR_LABEL) as Door[]).map((d) => <option key={d} value={d}>{DOOR_LABEL[d]}</option>)}
              </select>
              <label className="choice"><input type="checkbox" name="accepts_records" defaultChecked={row?.accepts_records ?? false} /> 쪽지 받기</label>
              <button className="btn btn-small">바꾸기</button>
            </form>
          );
        })}
      </section>
    </div>
  );
}

function ModButton({ id, action, visibility, label }: { id: string; action: string; visibility?: string; label: string }) {
  return (
    <form action={moderate} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      {visibility ? <input type="hidden" name="visibility" value={visibility} /> : null}
      <button className={`btn btn-small ${action === 'approve' ? 'btn-pine' : ''}`}>{label}</button>
    </form>
  );
}
