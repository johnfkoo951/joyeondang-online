import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { resolveRequest } from '@/app/admin/actions';
import { EventCodePanel } from '@/app/admin/EventCodes';
import { VALID_SLOTS, SLOT_LABELS } from '@/lib/member-admin';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';
import css from '../admin-suite.module.css';
import { MembersConsole, type MemberItem } from './MembersConsole';

export const metadata: Metadata = { title: '멤버 관리 · 관리실', robots: { index: false, follow: false } };

export default function AdminMembersPage() {
  return (
    <div className="wrap-wide stack">
      <div className="page-intro">
        <div className="page-intro-text">
          <h1>멤버 · 명단 · 초대 관리</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            초대 명단 검색과 일괄 등록, 역할·회차·이메일·메모 수정, 개인 초대 링크와 행사 초대 코드, 입장 요청 처리를 한곳에서 관리해요.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">멤버 목록을 불러오는 중이에요</p>}>
        <MembersBody />
      </Suspense>
    </div>
  );
}

async function MembersBody() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    return (
      <p className="note-box">
        집주인만 들어올 수 있는 곳이에요. <Link href="/login?next=/admin/members">로그인하기</Link> · <Link href="/">첫 화면으로</Link>
      </p>
    );
  }

  const supabase = await createClient();
  const [rosterRes, reqRes, codesRes, recordsRes] = await Promise.all([
    supabase
      .from('roster')
      .select('id, display_name, role, slot, email, claimed_by, claimed_at, revoked_at, note, created_at, event_code_id')
      .order('created_at', { ascending: false }),
    supabase
      .from('entry_requests')
      .select('id, typed_name, email, message, status, created_at')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('event_codes').select('id, label'),
    supabase.from('records').select('author_id'),
  ]);

  const codeMap = new Map<string, string>();
  if (!codesRes.error && Array.isArray(codesRes.data)) {
    for (const c of codesRes.data) {
      if (typeof c.id === 'string' && typeof c.label === 'string' && c.label.trim()) {
        codeMap.set(c.id, c.label.trim());
      }
    }
  }

  const countByUser = new Map<string, number>();
  for (const rec of recordsRes.data ?? []) {
    const uid = typeof rec.author_id === 'string' ? rec.author_id : '';
    if (uid) countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1);
  }

  const rawRoster = rosterRes.data ?? [];
  const members: MemberItem[] = rawRoster.map((r) => ({
    id: String(r.id),
    display_name: String(r.display_name ?? ''),
    role: String(r.role ?? 'guest'),
    slot: typeof r.slot === 'string' ? r.slot : null,
    email: typeof r.email === 'string' ? r.email : null,
    claimed_by: typeof r.claimed_by === 'string' ? r.claimed_by : null,
    claimed_at: typeof r.claimed_at === 'string' ? r.claimed_at : null,
    revoked_at: typeof r.revoked_at === 'string' ? r.revoked_at : null,
    note: typeof r.note === 'string' ? r.note : null,
    created_at: String(r.created_at ?? new Date().toISOString()),
    tagLabel: typeof r.event_code_id === 'string' ? (codeMap.get(r.event_code_id) ?? null) : null,
    recordCount: typeof r.claimed_by === 'string' ? (countByUser.get(r.claimed_by) ?? 0) : 0,
  }));

  const active = members.filter((m) => !m.revoked_at);
  const linked = active.filter((m) => Boolean(m.claimed_by));
  const familyCount = active.filter((m) => m.role === 'family' || m.role === 'admin').length;
  const guestCount = active.filter((m) => m.role === 'guest').length;
  const revokedCount = members.length - active.length;
  const pendingReqs = (reqRes.data ?? []).filter((q) => q.status === 'pending');
  const freeRoster = rawRoster.filter((r) => !r.claimed_by && !r.revoked_at);
  const tagOptions = [...new Set(members.map((m) => m.tagLabel).filter((v): v is string => Boolean(v)))];

  return (
    <div className="stack">
      {/* KPI 요약 */}
      <div className={css.kpiGrid}>
        <div className={css.kpiCard}>
          <span className={css.kpiLabel}>활성 멤버</span>
          <strong className={css.kpiValue}>{active.length}</strong>
          <span className={css.kpiSub}>전체 등록 {members.length}명</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiLabel}>계정 연결 완료</span>
          <strong className={css.kpiValue}>{linked.length}</strong>
          <span className={css.kpiSub}>미연결 {active.length - linked.length}명</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiLabel}>가족 / 손님</span>
          <strong className={css.kpiValue}>{familyCount} / {guestCount}</strong>
          <span className={css.kpiSub}>제외 {revokedCount}명</span>
        </div>
        <div className={`${css.kpiCard} ${pendingReqs.length > 0 ? css.kpiAlert : ''}`}>
          <span className={css.kpiLabel}>입장 요청 대기</span>
          <strong className={css.kpiValue}>{pendingReqs.length}</strong>
          <span className={css.kpiSub}>승인 또는 명단 연결</span>
        </div>
      </div>

      {/* 입장 요청 대기함 */}
      {pendingReqs.length > 0 ? (
        <section className="card stack" aria-labelledby="pending-req-head">
          <h2 id="pending-req-head" style={{ margin: 0 }}>입장 확인 요청 대기 ({pendingReqs.length}건)</h2>
          {pendingReqs.map((q) => (
            <article key={q.id} className="record admin-item">
              <p style={{ margin: 0 }}>
                <strong>{q.typed_name}</strong>{' '}
                <span className="muted small">{q.email}</span>
              </p>
              {q.message ? <p className="small" style={{ margin: 0 }}>{q.message}</p> : null}
              <form action={resolveRequest} className="btn-row">
                <input type="hidden" name="id" value={q.id} />
                <select name="roster_id" aria-label="기존 명단 줄 연결" defaultValue="">
                  <option value="">새 멤버로 추가</option>
                  {freeRoster.map((r) => (
                    <option key={r.id} value={r.id}>
                      기존 명단 연결: {r.display_name}{r.slot ? ` (${r.slot})` : ''}
                    </option>
                  ))}
                </select>
                <input type="text" name="new_name" placeholder="새로 추가할 이름" defaultValue={q.typed_name} />
                <select name="slot" aria-label="회차" defaultValue="">
                  <option value="">회차 없음</option>
                  {VALID_SLOTS.map((sl) => (
                    <option key={sl} value={sl}>{SLOT_LABELS[sl]}</option>
                  ))}
                </select>
                <button className="btn btn-small btn-pine" name="action" value="approve">승인하기</button>
                <button className="btn btn-small" name="action" value="reject">거절</button>
              </form>
            </article>
          ))}
        </section>
      ) : null}

      {/* 행사 초대 코드 발급·관리 */}
      <EventCodePanel now={new Date()} />

      {/* 멤버 통합 검색·일괄등록·인라인 편집 콘솔 */}
      <MembersConsole members={members} tagOptions={tagOptions} />
    </div>
  );
}
