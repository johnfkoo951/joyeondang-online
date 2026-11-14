'use client';
import { useActionState, useMemo, useState } from 'react';
import {
  bulkAddMembersAction,
  createMemberAction,
  setMemberRevokedAction,
  updateMemberAction,
  type MemberActionResult,
} from '@/app/admin/member-actions';
import { InviteButton } from '@/components/InviteButton';
import { ROLE_LABEL, type Role } from '@/lib/access';
import { SLOT_LABELS, VALID_SLOTS, parseBulkMembers, type MemberSlot } from '@/lib/member-admin';
import css from '../admin-suite.module.css';

export type MemberItem = {
  id: string;
  display_name: string;
  role: string;
  slot: string | null;
  email: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
  note: string | null;
  created_at: string;
  tagLabel: string | null;
  recordCount: number;
};

type StateFilter = 'active' | 'linked' | 'unlinked' | 'revoked' | 'all';

const DATE_FMT = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric' });

export function MembersConsole({
  members,
  tagOptions,
}: {
  members: MemberItem[];
  tagOptions: string[];
}) {
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [singleRes, singleFormAction, singlePending] = useActionState<MemberActionResult | null, FormData>(createMemberAction, null);
  const [bulkRes, bulkFormAction, bulkPending] = useActionState<MemberActionResult | null, FormData>(bulkAddMembersAction, null);

  // 검색·다중 필터 상태 (한글 IME 조합 중에도 실시간 반영)
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('active');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [slotFilter, setSlotFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const bulkPreview = useMemo(() => parseBulkMembers(bulkText), [bulkText]);

  const qNorm = query.normalize('NFC').trim().toLowerCase();
  const filtered = useMemo(() => {
    return members.filter((m) => {
      const isRevoked = Boolean(m.revoked_at);
      if (stateFilter === 'active' && isRevoked) return false;
      if (stateFilter === 'linked' && (isRevoked || !m.claimed_by)) return false;
      if (stateFilter === 'unlinked' && (isRevoked || Boolean(m.claimed_by))) return false;
      if (stateFilter === 'revoked' && !isRevoked) return false;

      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (slotFilter === 'none' && m.slot) return false;
      if (slotFilter !== 'all' && slotFilter !== 'none' && m.slot !== slotFilter) return false;
      if (tagFilter === 'none' && m.tagLabel) return false;
      if (tagFilter !== 'all' && tagFilter !== 'none' && m.tagLabel !== tagFilter) return false;

      if (!qNorm) return true;
      const hay = `${m.display_name} ${m.email ?? ''} ${m.note ?? ''} ${m.tagLabel ?? ''}`
        .normalize('NFC')
        .toLowerCase();
      return hay.includes(qNorm);
    });
  }, [members, stateFilter, roleFilter, slotFilter, tagFilter, qNorm]);

  const exportCsv = () => {
    const header = ['이름', '역할', '회차', '이메일', '연결상태', '행사태그', '남긴글수', '관리자메모', '등록일'];
    const escapeCell = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const rows = filtered.map((m) => [
      m.display_name,
      m.role,
      m.slot ?? '',
      m.email ?? '',
      m.revoked_at ? '제외됨' : m.claimed_by ? '계정연결됨' : '미연결',
      m.tagLabel ?? '',
      String(m.recordCount),
      m.note ?? '',
      m.created_at.slice(0, 10),
    ].map(escapeCell).join(','));
    const csv = `﻿${header.join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `joyeondang-members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveEdit = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    setBusyId(id);
    const fd = new FormData(e.currentTarget);
    const res = await updateMemberAction(fd).catch(() => ({ ok: false, message: '저장하지 못했어요.' }));
    setBusyId(null);
    setToast(res.message);
    if (res.ok) setEditingId(null);
  };

  const handleToggleRevoke = async (m: MemberItem) => {
    setBusyId(m.id);
    const res = await setMemberRevokedAction(m.id, !m.revoked_at).catch(() => ({
      ok: false,
      message: '상태를 바꾸지 못했어요.',
    }));
    setBusyId(null);
    setToast(res.message);
  };

  return (
    <div className="stack">
      {/* 1. 새 멤버 추가 / 일괄 등록 카드 */}
      <section className="card stack" aria-labelledby="add-member-head">
        <div className={css.toolbarTop}>
          <h2 id="add-member-head" style={{ margin: 0 }}>새 멤버 등록</h2>
          <div className={css.modeSwitch} role="tablist" aria-label="등록 방식">
            <button
              type="button"
              role="tab"
              aria-selected={addMode === 'single'}
              className={css.modeBtn}
              data-active={addMode === 'single' || undefined}
              onClick={() => setAddMode('single')}
            >
              한 명씩 추가
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addMode === 'bulk'}
              className={css.modeBtn}
              data-active={addMode === 'bulk' || undefined}
              onClick={() => setAddMode('bulk')}
            >
              여러 명 일괄 붙여넣기
            </button>
          </div>
        </div>

        {addMode === 'single' ? (
          <form action={singleFormAction} className="stack">
            <div className={css.editGrid}>
              <input type="text" name="display_name" placeholder="이름 (필수)" required aria-label="이름" />
              <input type="email" name="email" placeholder="구글 이메일 (선택 · 넣으면 자동 매칭)" aria-label="구글 이메일" />
              <select name="role" aria-label="역할" defaultValue="guest">
                <option value="guest">초대 손님 (guest)</option>
                <option value="family">가족 (family)</option>
              </select>
              <select name="slot" aria-label="회차" defaultValue="">
                <option value="">회차 지정 안 함</option>
                {VALID_SLOTS.map((sl) => (
                  <option key={sl} value={sl}>{SLOT_LABELS[sl]}</option>
                ))}
              </select>
              <input
                type="text"
                name="note"
                maxLength={200}
                placeholder="관리자 메모 (선택 · 본인에게는 보이지 않아요)"
                aria-label="관리자 메모"
                className={css.noteSpan}
              />
            </div>
            <div className="btn-row">
              <button type="submit" className="btn btn-pine btn-small" disabled={singlePending}>
                {singlePending ? '등록하는 중…' : '명단에 추가'}
              </button>
              {singleRes ? (
                <span className={singleRes.ok ? 'small' : 'small warn'} role="status">
                  {singleRes.message}
                </span>
              ) : null}
            </div>
          </form>
        ) : (
          <form action={bulkFormAction} className="stack">
            <p className="small muted" style={{ margin: 0 }}>
              한 줄에 한 분씩 <code>이름, 이메일, 역할(손님/가족), 회차(11/15/16/17/online), 메모</code> 순서로 붙여넣어 주세요. 이름만 적으셔도 등록됩니다.
            </p>
            <textarea
              name="bulk_text"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              onCompositionEnd={(e) => setBulkText((e.target as HTMLTextAreaElement).value)}
              placeholder={'김하늘, sky@example.com, 손님, 15, 대학 동기\n박바다, , 가족, family, 사촌'}
              rows={5}
            />
            <div className={css.toolbarTop}>
              <span className="small muted">
                인식된 유효 인원 <strong>{bulkPreview.valid.length}명</strong>
                {bulkPreview.invalidLines.length > 0 ? (
                  <span className="warn"> · 형식 확인 필요: {bulkPreview.invalidLines.join(', ')}번째 줄</span>
                ) : null}
              </span>
              <button
                type="submit"
                className="btn btn-pine btn-small"
                disabled={bulkPending || bulkPreview.valid.length === 0}
              >
                {bulkPending ? '일괄 등록 중…' : `${bulkPreview.valid.length}명 한꺼번에 등록`}
              </button>
            </div>
            {bulkRes ? (
              <p className={bulkRes.ok ? 'small' : 'small warn'} style={{ margin: 0 }} role="status">
                {bulkRes.message}
              </p>
            ) : null}
          </form>
        )}
      </section>

      {/* 2. 검색·다중 필터·CSV 다운로드 바 */}
      <section className={css.toolbar} aria-label="멤버 검색과 필터">
        <div className={css.toolbarTop}>
          <input
            type="search"
            className={css.searchInput}
            placeholder="이름, 이메일, 메모, 행사 태그 검색…"
            aria-label="멤버 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onCompositionEnd={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <div className="btn-row">
            <span className="small muted" style={{ alignSelf: 'center' }}>
              표시 <strong>{filtered.length}</strong> / 전체 {members.length}명
            </span>
            <button type="button" className="btn btn-small" onClick={exportCsv} disabled={filtered.length === 0}>
              CSV 내려받기
            </button>
          </div>
        </div>

        <div className={css.filterRow}>
          <select
            className={css.filterSelect}
            aria-label="연결 상태 필터"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          >
            <option value="active">활성 멤버만</option>
            <option value="linked">계정 연결됨</option>
            <option value="unlinked">미연결 (대기)</option>
            <option value="revoked">제외된 멤버</option>
            <option value="all">제외 포함 전체</option>
          </select>

          <select
            className={css.filterSelect}
            aria-label="역할 필터"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">모든 역할</option>
            <option value="admin">집주인 (admin)</option>
            <option value="family">가족 (family)</option>
            <option value="guest">초대 손님 (guest)</option>
          </select>

          <select
            className={css.filterSelect}
            aria-label="회차 필터"
            value={slotFilter}
            onChange={(e) => setSlotFilter(e.target.value)}
          >
            <option value="all">모든 회차</option>
            {VALID_SLOTS.map((sl) => (
              <option key={sl} value={sl}>{SLOT_LABELS[sl]}</option>
            ))}
            <option value="none">회차 없음</option>
          </select>

          {tagOptions.length > 0 ? (
            <select
              className={css.filterSelect}
              aria-label="행사 초대 코드 태그 필터"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="all">모든 행사 태그</option>
              {tagOptions.map((tg) => (
                <option key={tg} value={tg}>{tg}</option>
              ))}
              <option value="none">행사 태그 없음</option>
            </select>
          ) : null}
        </div>

        {toast ? (
          <p className="small" style={{ margin: 0, fontWeight: 700, color: 'var(--pine)' }} role="status">
            {toast}
          </p>
        ) : null}
      </section>

      {/* 3. 멤버 카드 목록 */}
      <div className={css.memberList}>
        {filtered.length === 0 ? (
          <p className="note-box">조건에 맞는 멤버가 없어요.</p>
        ) : (
          filtered.map((m) => {
            const isEditing = editingId === m.id;
            const isBusy = busyId === m.id;
            const roleName = ROLE_LABEL[(m.role as Role) ?? 'guest'] ?? m.role;
            return (
              <article key={m.id} className={css.memberCard} data-revoked={m.revoked_at ? 'true' : undefined}>
                <div className={css.memberHead}>
                  <div className={css.memberIdentity}>
                    <span className={css.memberName}>{m.display_name}</span>
                    <span className={css.roleBadge} data-role={m.role}>{roleName}</span>
                    {m.slot ? (
                      <span className="badge">{SLOT_LABELS[m.slot as MemberSlot] ?? `${m.slot}시`}</span>
                    ) : null}
                    {m.tagLabel ? <span className="badge">코드: {m.tagLabel}</span> : null}
                    {m.recordCount > 0 ? <span className="badge">글 {m.recordCount}장</span> : null}
                    {m.revoked_at ? (
                      <span className="badge warn">제외됨</span>
                    ) : m.claimed_by ? (
                      <span className={css.statusLinked}>● Google 계정 연결됨</span>
                    ) : m.email ? (
                      <span className={css.statusWaiting}>이메일 대기 ({m.email})</span>
                    ) : (
                      <span className={css.statusWaiting}>초대 링크 또는 이메일 필요</span>
                    )}
                  </div>

                  <div className="btn-row">
                    {!m.claimed_by && !m.revoked_at ? <InviteButton rosterId={m.id} /> : null}
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => setEditingId(isEditing ? null : m.id)}
                    >
                      {isEditing ? '접기' : '정보 수정'}
                    </button>
                    {m.role !== 'admin' ? (
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={isBusy}
                        onClick={() => void handleToggleRevoke(m)}
                      >
                        {m.revoked_at ? '다시 복구' : '명단에서 제외'}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={css.memberMeta}>
                  {m.email ? <span>이메일: {m.email}</span> : null}
                  <span>등록일: {DATE_FMT.format(new Date(m.created_at))}</span>
                  {m.claimed_at ? <span>첫 로그인: {DATE_FMT.format(new Date(m.claimed_at))}</span> : null}
                  {m.note ? <span>메모: {m.note}</span> : null}
                </div>

                {isEditing ? (
                  <form onSubmit={(e) => void handleSaveEdit(e, m.id)} className={css.editGrid}>
                    <input type="hidden" name="id" value={m.id} />
                    <input
                      type="text"
                      name="display_name"
                      defaultValue={m.display_name}
                      required
                      aria-label="이름"
                      placeholder="이름"
                    />
                    <select
                      name="role"
                      defaultValue={m.role === 'family' ? 'family' : 'guest'}
                      disabled={m.role === 'admin'}
                      aria-label="역할"
                    >
                      <option value="guest">초대 손님 (guest)</option>
                      <option value="family">가족 (family)</option>
                    </select>
                    <select name="slot" defaultValue={m.slot ?? ''} aria-label="회차">
                      <option value="">회차 없음</option>
                      {VALID_SLOTS.map((sl) => (
                        <option key={sl} value={sl}>{SLOT_LABELS[sl]}</option>
                      ))}
                    </select>
                    <input
                      type="email"
                      name="email"
                      defaultValue={m.email ?? ''}
                      disabled={Boolean(m.claimed_by)}
                      placeholder={m.claimed_by ? '이미 계정과 연결됨' : '구글 이메일'}
                      aria-label="구글 이메일"
                    />
                    <input
                      type="text"
                      name="note"
                      maxLength={200}
                      defaultValue={m.note ?? ''}
                      placeholder="관리자 메모 (최대 200자)"
                      aria-label="관리자 메모"
                      className={css.noteSpan}
                    />
                    <div className={`btn-row ${css.noteSpan}`}>
                      <button type="submit" className="btn btn-pine btn-small" disabled={isBusy}>
                        {isBusy ? '저장 중…' : '변경사항 저장'}
                      </button>
                      <button type="button" className="btn btn-small" onClick={() => setEditingId(null)}>
                        취소
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
