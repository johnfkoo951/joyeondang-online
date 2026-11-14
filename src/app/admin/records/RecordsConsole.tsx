'use client';
import { useMemo, useState } from 'react';
import { moderate } from '@/app/admin/actions';
import { PhotoThumb } from '@/components/PhotoThumb';
import { SCOPE_LABEL, type Scope } from '@/lib/access';
import css from '../admin-suite.module.css';

export type AdminRecordItem = {
  id: string;
  room_slug: string;
  room_name: string;
  format: string;
  body: string;
  author_shown: string;
  author_roster: string | null;
  author_warn: boolean;
  requested_visibility: Scope;
  visibility: Scope;
  status: string;
  marks_person: boolean;
  marks_minor: boolean;
  has_media: boolean;
  photo: { thumb: string; view: string } | null;
  created_at: string;
};

const STATUS_NAMES: Record<string, string> = {
  submitted: '승인 대기',
  approved: '걸림 (게시됨)',
  hidden: '숨김',
  rejected: '거절됨',
};

const DATE_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function RecordsConsole({
  items,
  rooms,
}: {
  items: AdminRecordItem[];
  rooms: { slug: string; name: string }[];
}) {
  const [statusTab, setStatusTab] = useState<'all' | 'submitted' | 'approved' | 'hidden'>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const qNorm = query.normalize('NFC').trim().toLowerCase();
  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (statusTab !== 'all' && r.status !== statusTab) return false;
      if (roomFilter !== 'all' && r.room_slug !== roomFilter) return false;
      if (!qNorm) return true;
      const hay = `${r.body} ${r.author_shown} ${r.author_roster ?? ''} ${r.room_name}`
        .normalize('NFC')
        .toLowerCase();
      return hay.includes(qNorm);
    });
  }, [items, statusTab, roomFilter, qNorm]);

  const counts = useMemo(() => ({
    submitted: items.filter((i) => i.status === 'submitted').length,
    approved: items.filter((i) => i.status === 'approved').length,
    hidden: items.filter((i) => i.status === 'hidden' || i.status === 'rejected').length,
  }), [items]);

  return (
    <div className="stack">
      <div className={css.kpiGrid}>
        <div className={`${css.kpiCard} ${counts.submitted > 0 ? css.kpiAlert : ''}`}>
          <span className={css.kpiLabel}>승인 대기</span>
          <strong className={css.kpiValue}>{counts.submitted}</strong>
          <span className={css.kpiSub}>새로 들어온 글</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiLabel}>현재 걸린 글</span>
          <strong className={css.kpiValue}>{counts.approved}</strong>
          <span className={css.kpiSub}>방명록·소나무·서재</span>
        </div>
        <div className={css.kpiCard}>
          <span className={css.kpiLabel}>숨김 보관</span>
          <strong className={css.kpiValue}>{counts.hidden}</strong>
          <span className={css.kpiSub}>언제든 다시 걸기 가능</span>
        </div>
      </div>

      <section className={css.toolbar} aria-label="기록 필터와 검색">
        <div className={css.toolbarTop}>
          <div className={css.modeSwitch} role="tablist" aria-label="기록 상태">
            {([
              ['all', `전체 (${items.length})`],
              ['submitted', `승인 대기 (${counts.submitted})`],
              ['approved', `걸림 (${counts.approved})`],
              ['hidden', `숨김 (${counts.hidden})`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={statusTab === id}
                className={css.modeBtn}
                data-active={statusTab === id || undefined}
                onClick={() => setStatusTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            type="search"
            className={css.searchInput}
            placeholder="내용, 작성자, 방 이름 검색…"
            aria-label="글 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onCompositionEnd={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </div>

        <div className={css.filterRow}>
          <select
            className={css.filterSelect}
            aria-label="공간 필터"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
          >
            <option value="all">모든 공간</option>
            {rooms.map((rm) => (
              <option key={rm.slug} value={rm.slug}>{rm.name}</option>
            ))}
          </select>
          <span className="small muted">표시 {filtered.length}건</span>
        </div>
      </section>

      <div className={css.memberList}>
        {filtered.length === 0 ? (
          <p className="note-box">조건에 맞는 글이 없어요.</p>
        ) : (
          filtered.map((r) => (
            <article key={r.id} className="record admin-item" data-status={r.status}>
              {r.has_media ? (
                <div className="admin-photo">
                  {r.photo ? (
                    <PhotoThumb thumb={r.photo.thumb} view={r.photo.view} label={`${r.author_shown} 님이 붙인 사진`} />
                  ) : (
                    <span className="badge">사진 주소를 불러오지 못했어요</span>
                  )}
                </div>
              ) : null}

              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>

              <div className="meta">
                <strong>{r.author_shown}</strong>
                {r.author_roster ? <span className={r.author_warn ? 'badge warn' : 'badge'}>{r.author_roster}</span> : null}
                <span>{r.room_name}</span>
                <span>{DATE_FMT.format(new Date(r.created_at))}</span>
                <span className="badge">{STATUS_NAMES[r.status] ?? r.status}</span>
                <span className="badge">현재 범위: {SCOPE_LABEL[r.visibility] ?? r.visibility}</span>
                <span className="badge">요청 범위: {SCOPE_LABEL[r.requested_visibility] ?? r.requested_visibility}</span>
                {r.marks_person ? <span className="badge">인물 포함</span> : null}
                {r.marks_minor ? <span className="badge warn">아이 포함</span> : null}
              </div>

              <div className="btn-row">
                {r.requested_visibility === 'public' ? (
                  <ModAction id={r.id} action="approve" visibility="public" label="인터넷 공개로 걸기" active={r.status === 'approved' && r.visibility === 'public'} />
                ) : null}
                {r.requested_visibility === 'public' || r.requested_visibility === 'guests' ? (
                  <ModAction id={r.id} action="approve" visibility="guests" label="초대 손님까지 걸기" active={r.status === 'approved' && r.visibility === 'guests'} />
                ) : null}
                <ModAction id={r.id} action="approve" visibility="family" label="가족만 보기" active={r.status === 'approved' && r.visibility === 'family'} />
                {r.status !== 'hidden' ? <ModAction id={r.id} action="hide" label="숨기기" /> : null}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function ModAction({
  id,
  action,
  visibility,
  label,
  active,
}: {
  id: string;
  action: string;
  visibility?: string;
  label: string;
  active?: boolean;
}) {
  return (
    <form action={moderate} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      {visibility ? <input type="hidden" name="visibility" value={visibility} /> : null}
      <button className={`btn btn-small ${active ? 'btn-roof' : action === 'approve' ? 'btn-pine' : ''}`}>
        {active ? `✓ ${label}` : label}
      </button>
    </form>
  );
}
