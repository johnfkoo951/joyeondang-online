import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  makeQr, moderate, resolveRequest, revokeQr, setDoor, setQuiet,
} from '@/app/admin/actions';
import { EventCodePanel } from '@/app/admin/EventCodes';
import { GalleryPanel } from '@/app/admin/GalleryPanel';
import { RosterSection } from '@/app/admin/RosterSection';
import { ShotsPanel } from '@/app/admin/ShotsPanel';
import { LiveClaps } from '@/components/LiveClaps';
import { PhotoThumb } from '@/components/PhotoThumb';
import { QrSvg } from '@/components/QrSvg';
import { DOOR_LABEL, ROOMS, ROOM_BY_SLUG, type Door } from '@/content/rooms';
import { SCOPE_LABEL } from '@/lib/access';
import { authorLabel, rosterNames } from '@/lib/author-label';
import { SITE_URL } from '@/lib/env';
import { drainNoteTrash, signNotePhotos } from '@/lib/notes-media';
import { QR_STATE_LABEL, formatWindow, qrEventDay, qrState, qrUrl } from '@/lib/qr';
import { readLabels } from '@/lib/roster-tags';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';
import suiteCss from './admin-suite.module.css';

export const metadata: Metadata = { title: '관리실 허브 · 승인함', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function AdminPage({ searchParams }: Props) {
  return (
    <div className="wrap-wide stack">
      <h1>조연당 관리실 허브</h1>
      <Suspense fallback={<p className="muted">불러오는 중</p>}>
        <AdminBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AdminBody({ searchParams }: Props) {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    return <p className="note-box">집주인만 들어올 수 있는 곳이에요. <Link href="/login?next=/admin">로그인하기</Link> · <Link href="/">첫 화면으로</Link></p>;
  }
  const sp = await searchParams;
  const supabase = await createClient();
  const [queue, requests, roster, rooms, marks, site, codes] = await Promise.all([
    supabase.from('records')
      .select('id, room_slug, body, author_id, author_name, requested_visibility, created_at, marks_person, marks_minor, media_path')
      .eq('status', 'submitted').order('created_at', { ascending: true }).limit(100),
    supabase.from('entry_requests').select('id, typed_name, email, message, created_at')
      .eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('roster').select('id, display_name, role, slot, email, claimed_by, revoked_at, created_at, event_code_id')
      .order('created_at', { ascending: true }),
    supabase.from('rooms').select('slug, door_state, accepts_records'),
    supabase.from('qr_marks').select('id, room_slug, code, valid_from, valid_until, label, revoked_at, created_at')
      .order('created_at', { ascending: false }).limit(100),
    supabase.rpc('site_now'),
    supabase.from('event_codes').select('id, label'),
    drainNoteTrash(),
  ]);

  const rosterRows = roster.data ?? [];
  const activeRoster = rosterRows.filter((r) => !r.revoked_at);
  const linkedRoster = activeRoster.filter((r) => Boolean(r.claimed_by));
  const freeRoster = rosterRows.filter((r) => !r.claimed_by && !r.revoked_at);
  const openDoorCount = ROOMS.filter((rm) => {
    const found = (rooms.data ?? []).find((x) => x.slug === rm.slug);
    return (found?.door_state ?? rm.door) === 'open';
  }).length;

  const labels = readLabels(codes.error ? null : codes.data);
  const names = rosterNames(roster.data);
  const photos = await signNotePhotos((queue.data ?? []).filter((r) => r.media_path).map((r) => r.id as string));
  const now = new Date();
  const pendingNotes = queue.data?.length ?? 0;
  const pendingReqs = requests.data?.length ?? 0;

  return (
    <div className="admin-grid">
      {/* 1. 전체 현황 요약 KPI */}
      <div className={suiteCss.kpiGrid}>
        <Link href="/admin/members" className={suiteCss.kpiCard}>
          <span className={suiteCss.kpiLabel}>활성 멤버</span>
          <strong className={suiteCss.kpiValue}>{activeRoster.length}명</strong>
          <span className={suiteCss.kpiSub}>계정 연결 {linkedRoster.length}명</span>
        </Link>
        <Link href="/admin/members" className={`${suiteCss.kpiCard} ${pendingReqs > 0 ? suiteCss.kpiAlert : ''}`}>
          <span className={suiteCss.kpiLabel}>입장 요청 대기</span>
          <strong className={suiteCss.kpiValue}>{pendingReqs}건</strong>
          <span className={suiteCss.kpiSub}>멤버 관리에서 처리</span>
        </Link>
        <Link href="/admin/records" className={`${suiteCss.kpiCard} ${pendingNotes > 0 ? suiteCss.kpiAlert : ''}`}>
          <span className={suiteCss.kpiLabel}>읽을 쪽지 대기</span>
          <strong className={suiteCss.kpiValue}>{pendingNotes}장</strong>
          <span className={suiteCss.kpiSub}>방명록·소나무·문장</span>
        </Link>
        <Link href="/admin/rooms" className={suiteCss.kpiCard}>
          <span className={suiteCss.kpiLabel}>열린 공간</span>
          <strong className={suiteCss.kpiValue}>{openDoorCount} / {ROOMS.length}</strong>
          <span className={suiteCss.kpiSub}>문패·QR·조용 모드</span>
        </Link>
      </div>

      {/* 2. 전문 관리실 바로 가기 카드 그리드 */}
      <div className={suiteCss.suiteGrid}>
        <Link href="/admin/members" className={suiteCss.suiteCard}>
          <div>
            <span className={suiteCss.suiteTag}>MEMBERS &amp; INVITES</span>
            <h2 className={suiteCss.suiteTitle}>멤버 · 초대 통합 관리</h2>
            <p className={suiteCss.suiteDesc}>이름·역할·회차·메모 수정, 여러 명 일괄 붙여넣기 등록, 복구, CSV 다운로드, 초대 코드 발급</p>
          </div>
          <span className={suiteCss.suiteGo}>멤버 관리 열기 →</span>
        </Link>

        <Link href="/admin/records" className={suiteCss.suiteCard}>
          <div>
            <span className={suiteCss.suiteTag}>MODERATION</span>
            <h2 className={suiteCss.suiteTitle}>방명록 · 쪽지 전체 관리</h2>
            <p className={suiteCss.suiteDesc}>대기 중인 글 승인뿐 아니라 이미 걸린 글의 공개 범위 변경, 검색, 숨김·재게시 관리</p>
          </div>
          <span className={suiteCss.suiteGo}>글 관리 열기 →</span>
        </Link>

        <Link href="/admin/rooms" className={suiteCss.suiteCard}>
          <div>
            <span className={suiteCss.suiteTag}>HOUSE &amp; EVENT OPS</span>
            <h2 className={suiteCss.suiteTitle}>공간 · 조용 모드 · QR 운영</h2>
            <p className={suiteCss.suiteDesc}>17곳 문패 스위치, 공통 세션 조용 모드와 박수, 현장 도장 QR 카드, 주방 액자 관리</p>
          </div>
          <span className={suiteCss.suiteGo}>공간 운영 열기 →</span>
        </Link>

        <div className={suiteCss.suiteCard}>
          <div>
            <span className={suiteCss.suiteTag}>AVATARS &amp; LIVE 3D</span>
            <h2 className={suiteCss.suiteTitle}>3D 캐릭터 &amp; 컨트롤 룸</h2>
            <p className={suiteCss.suiteDesc}>손님들의 2D·3D 캐릭터 모형을 점검하고, 실시간 구획별 멀티뷰 화면을 관제·녹화해요</p>
          </div>
          <div className="btn-row">
            <Link className="btn btn-small btn-pine" href="/admin/characters">캐릭터 관리</Link>
            <Link className="btn btn-small" href="/admin/control">컨트롤 룸 열기</Link>
          </div>
        </div>
      </div>

      {/* 3. 바로 처리할 승인 대기열과 빠른 스위치 */}
      <QuietPanel site={site.error ? null : (site.data as SiteNow | null)} now={now} />

      <section className="card stack" aria-labelledby="q">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 id="q" style={{ margin: 0 }}>읽을 쪽지 대기 {pendingNotes}장</h2>
          <Link className="btn btn-small" href="/admin/records">전체 글·방명록 관리실 →</Link>
        </div>
        {pendingNotes === 0 ? <p className="muted" style={{ margin: 0 }}>새로 승인할 대기 쪽지가 없어요.</p> : null}
        {(queue.data ?? []).map((r) => {
          const who = authorLabel(r.author_name, names.get(r.author_id));
          return (
            <article key={r.id} className="record admin-item">
              {r.media_path ? (
                <div className="admin-photo">
                  {photos.get(r.id) ? (
                    <PhotoThumb thumb={photos.get(r.id)!.thumb} view={photos.get(r.id)!.view} label={`${r.author_name} 님이 붙인 사진`} />
                  ) : (
                    <span className="badge">사진을 불러오지 못했어요</span>
                  )}
                </div>
              ) : null}
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
              <div className="meta">
                <span>{who.shown}</span>
                {who.roster ? <span className={who.warn ? 'badge warn' : 'badge'}>{who.roster}</span> : null}
                <span>{ROOM_BY_SLUG.get(r.room_slug)?.name ?? r.room_slug}</span>
                <span className="badge">요청: {SCOPE_LABEL[r.requested_visibility as keyof typeof SCOPE_LABEL]}</span>
                {r.media_path ? <span className="badge">위치 정보 없음 확인</span> : null}
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
          );
        })}
      </section>

      <section className="card stack" aria-labelledby="req">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 id="req" style={{ margin: 0 }}>들어오고 싶다는 분 {pendingReqs}</h2>
          <Link className="btn btn-small" href="/admin/members">멤버 관리실에서 자세히 보기 →</Link>
        </div>
        {pendingReqs === 0 ? <p className="muted" style={{ margin: 0 }}>대기 중인 입장 요청이 없어요.</p> : null}
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

      <EventCodePanel now={now} />
      <RosterSection rows={roster.data ?? []} labels={labels} tag={sp.tag} />

      <Suspense fallback={<section className="card"><p className="muted" style={{ margin: 0 }}>걷기 사진 칸을 불러오는 중</p></section>}>
        <ShotsPanel />
      </Suspense>

      <section className="card stack" aria-labelledby="doors">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 id="doors" style={{ margin: 0 }}>빠른 문패 스위치</h2>
          <Link className="btn btn-small" href="/admin/rooms">공간·QR 운영실 →</Link>
        </div>
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

      <QrPanel marks={marks.error ? null : ((marks.data ?? []) as QrMark[])} now={now} />
      <GalleryPanel />
    </div>
  );
}

type SiteNow = { quiet?: boolean; until?: string | null; claps?: number };

function QuietPanel({ site, now }: { site: SiteNow | null; now: Date }) {
  if (!site) {
    return (
      <section className="card stack" aria-labelledby="quiet">
        <h2 id="quiet" style={{ marginTop: 0 }}>조용 모드</h2>
        <p className="note-box">아직 쓸 수 없어요. DB에 조용 모드 표(0010 마이그레이션)가 들어가면 열려요.</p>
      </section>
    );
  }
  const on = site.quiet === true && typeof site.until === 'string';
  const left = on ? Math.max(1, Math.ceil((Date.parse(site.until as string) - now.getTime()) / 60_000)) : 0;
  return (
    <section className="card stack" aria-labelledby="quiet">
      <h2 id="quiet" style={{ marginTop: 0 }}>조용 모드 {on ? <span className="badge">켜짐 · {left}분 남음</span> : <span className="badge">꺼짐</span>}</h2>
      <p className="small muted">공통 세션 동안 놀이를 멈추고 모든 화면 맨 위에 「지금은 거실에 모여 있어요」를 띄워요. 멀리 있는 손님은 박수만 보낼 수 있어요. 시간이 지나면 저절로 꺼져요.</p>
      <p style={{ margin: 0 }}>박수 <LiveClaps initial={Number(site.claps ?? 0)} />번 <span className="small muted">(켤 때마다 0부터)</span></p>
      <form action={setQuiet} className="btn-row">
        <select name="minutes" defaultValue="20" aria-label="조용 모드 시간">
          <option value="10">10분</option>
          <option value="20">20분</option>
          <option value="30">30분</option>
        </select>
        <button className="btn btn-small btn-roof">{on ? '이 시간으로 다시 맞추기' : '조용 모드 켜기'}</button>
      </form>
      {on ? (
        <form action={setQuiet}>
          <input type="hidden" name="minutes" value="0" />
          <button className="btn btn-small">지금 끄기</button>
        </form>
      ) : null}
    </section>
  );
}

type QrMark = { id: string; room_slug: string; code: string; valid_from: string; valid_until: string; label: string | null; revoked_at: string | null };

function QrPanel({ marks, now }: { marks: QrMark[] | null; now: Date }) {
  const day = qrEventDay(process.env.QR_EVENT_DAY);
  const open = ROOMS.filter((r) => r.door === 'open');
  return (
    <section className="card stack" aria-labelledby="qr">
      <h2 id="qr" style={{ marginTop: 0 }}>QR 도장</h2>
      <p className="small muted">공개하기로 한 방에만 두세요. QR에는 방과 짧은 코드만 담기고 위치는 묻지 않아요. 카드를 잃어버리면 거두고 새로 만들어요.</p>
      {marks === null ? (
        <p className="note-box">아직 쓸 수 없어요. DB에 QR 표(0010 마이그레이션)가 들어가면 열려요.</p>
      ) : (
        <>
          <form action={makeQr} className="btn-row">
            <select name="room" aria-label="방" defaultValue="porch">
              {open.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
            <select name="preset" aria-label="쓸 수 있는 때" defaultValue="event">
              <option value="event">행사 당일 ({day} 하루, 한국 시간)</option>
              <option value="test">시험 (지금부터 24시간)</option>
            </select>
            <input type="text" name="label" maxLength={40} placeholder="카드 이름(선택)" aria-label="카드 이름" />
            <button className="btn btn-small btn-pine">표식 만들기</button>
          </form>
          {!marks.length ? <p className="muted">아직 만든 표식이 없어요.</p> : null}
          <div className="qr-marks">
            {marks.map((m) => {
              const state = qrState(m, now);
              const url = qrUrl(SITE_URL, m.room_slug, m.code);
              const name = ROOM_BY_SLUG.get(m.room_slug)?.name ?? m.room_slug;
              return (
                <article key={m.id} className="record qr-mark" data-state={state}>
                  <QrSvg text={url} label={`${name} 현장 도장 QR`} />
                  <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                    <p style={{ margin: 0 }}><strong>{name}</strong>{m.label ? ` · ${m.label}` : ''}</p>
                    <p className="small" style={{ margin: 0 }}>{formatWindow(m.valid_from, m.valid_until)} <span className="badge">{QR_STATE_LABEL[state]}</span></p>
                    <p className="qr-url" style={{ margin: 0 }}>{url}</p>
                    {state !== 'revoked' ? (
                      <form action={revokeQr} className="inline-form">
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn btn-small">거두기</button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
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
