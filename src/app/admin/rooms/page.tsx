import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { makeQr, revokeQr, setDoor, setQuiet } from '@/app/admin/actions';
import { GalleryPanel } from '@/app/admin/GalleryPanel';
import { ShotsPanel } from '@/app/admin/ShotsPanel';
import { LiveClaps } from '@/components/LiveClaps';
import { QrSvg } from '@/components/QrSvg';
import { DOOR_LABEL, FLOORS, ROOMS, ROOM_BY_SLUG, type Door } from '@/content/rooms';
import { SITE_URL } from '@/lib/env';
import { QR_STATE_LABEL, formatWindow, qrEventDay, qrState, qrUrl } from '@/lib/qr';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '공간·QR·행사 운영 · 관리실', robots: { index: false, follow: false } };

type SiteNow = { quiet?: boolean; until?: string | null; claps?: number };
type QrMark = { id: string; room_slug: string; code: string; valid_from: string; valid_until: string; label: string | null; revoked_at: string | null };

export default function AdminRoomsPage() {
  return (
    <div className="wrap-wide stack">
      <div className="page-intro">
        <div className="page-intro-text">
          <h1>공간 문패 · 조용 모드 · 현장 QR 운영</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            열일곱 개 공간의 개방 상태와 쪽지 받기 여부, 공통 세션 조용 모드, 현장 도장용 QR 카드, 주방 액자와 스냅숏 보관함을 관리해요.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">운영 설정을 불러오는 중이에요</p>}>
        <RoomsOpsBody />
      </Suspense>
    </div>
  );
}

async function RoomsOpsBody() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    return (
      <p className="note-box">
        집주인만 들어올 수 있는 곳이에요. <Link href="/login?next=/admin/rooms">로그인하기</Link> · <Link href="/">첫 화면으로</Link>
      </p>
    );
  }

  const supabase = await createClient();
  const [roomsRes, marksRes, siteRes] = await Promise.all([
    supabase.from('rooms').select('slug, door_state, accepts_records'),
    supabase
      .from('qr_marks')
      .select('id, room_slug, code, valid_from, valid_until, label, revoked_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('site_now'),
  ]);

  const now = new Date();
  const site = siteRes.error ? null : (siteRes.data as SiteNow | null);
  const quietOn = Boolean(site?.quiet && typeof site.until === 'string');
  const quietLeft = quietOn ? Math.max(1, Math.ceil((Date.parse(site!.until as string) - now.getTime()) / 60_000)) : 0;
  const day = qrEventDay(process.env.QR_EVENT_DAY);
  const openRooms = ROOMS.filter((r) => r.door === 'open');
  const marks = marksRes.error ? null : ((marksRes.data ?? []) as QrMark[]);

  return (
    <div className="admin-grid">
      {/* 1. 조용 모드 */}
      <section className="card stack" aria-labelledby="ops-quiet">
        <h2 id="ops-quiet" style={{ marginTop: 0 }}>
          공통 세션 조용 모드 {quietOn ? <span className="badge">켜짐 · {quietLeft}분 남음</span> : <span className="badge">꺼짐</span>}
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          켜 두면 놀이를 잠시 쉬고 모든 화면 맨 위에 「지금은 거실에 모여 있어요」 띠와 원격 박수 버튼을 띄워요.
        </p>
        {site ? (
          <>
            <p style={{ margin: 0 }}>
              실시간 박수 <strong><LiveClaps initial={Number(site.claps ?? 0)} /></strong>번
            </p>
            <div className="btn-row">
              <form action={setQuiet} className="btn-row">
                <select name="minutes" defaultValue="20" aria-label="조용 모드 시간">
                  <option value="10">10분</option>
                  <option value="20">20분</option>
                  <option value="30">30분</option>
                </select>
                <button className="btn btn-small btn-roof">{quietOn ? '시간 다시 맞추기' : '조용 모드 켜기'}</button>
              </form>
              {quietOn ? (
                <form action={setQuiet} className="inline-form">
                  <input type="hidden" name="minutes" value="0" />
                  <button className="btn btn-small">지금 끄기</button>
                </form>
              ) : null}
            </div>
          </>
        ) : (
          <p className="note-box">조용 모드 표(0010 마이그레이션)를 찾지 못했어요.</p>
        )}
      </section>

      {/* 2. 층별 문패 스위치 */}
      <section className="card stack" aria-labelledby="ops-doors">
        <h2 id="ops-doors" style={{ marginTop: 0 }}>공간 문패와 쪽지 허용 ({ROOMS.length}곳)</h2>
        {FLOORS.map((fl) => {
          const floorRooms = ROOMS.filter((r) => r.floor === fl.id);
          if (!floorRooms.length) return null;
          return (
            <div key={fl.id} className="stack" style={{ gap: 8 }}>
              <h3 style={{ margin: '8px 0 0' }}>{fl.label}</h3>
              {floorRooms.map((room) => {
                const row = (roomsRes.data ?? []).find((x) => x.slug === room.slug);
                const door = (row?.door_state ?? room.door) as Door;
                return (
                  <form key={room.slug} action={setDoor} className="btn-row" style={{ alignItems: 'center' }}>
                    <input type="hidden" name="slug" value={room.slug} />
                    <span style={{ minWidth: 150, fontWeight: 700 }}>{room.name}</span>
                    <select name="door_state" defaultValue={door} aria-label={`${room.name} 문패`} style={{ width: 'auto' }}>
                      {(Object.keys(DOOR_LABEL) as Door[]).map((d) => (
                        <option key={d} value={d}>{DOOR_LABEL[d]}</option>
                      ))}
                    </select>
                    <label className="choice" style={{ padding: 0 }}>
                      <input type="checkbox" name="accepts_records" defaultChecked={row?.accepts_records ?? false} />
                      <span className="small">쪽지 받기</span>
                    </label>
                    <button className="btn btn-small">저장</button>
                  </form>
                );
              })}
            </div>
          );
        })}
      </section>

      {/* 3. 현장 QR 도장 표식 */}
      <section className="card stack" aria-labelledby="ops-qr">
        <h2 id="ops-qr" style={{ marginTop: 0 }}>현장 QR 도장 카드 발급</h2>
        <p className="small muted" style={{ margin: 0 }}>
          행사 날 방에 붙여 두면 초대 손님이 휴대폰 카메라로 찍어 「현장 도장」을 받을 수 있어요.
        </p>
        {marks === null ? (
          <p className="note-box">QR 표(0010 마이그레이션)를 찾지 못했어요.</p>
        ) : (
          <>
            <form action={makeQr} className="btn-row">
              <select name="room" aria-label="방" defaultValue="porch" style={{ width: 'auto' }}>
                {openRooms.map((r) => (
                  <option key={r.slug} value={r.slug}>{r.name}</option>
                ))}
              </select>
              <select name="preset" aria-label="유효 기간" defaultValue="event" style={{ width: 'auto' }}>
                <option value="event">행사 당일 ({day}, KST)</option>
                <option value="test">시험용 (지금부터 24시간)</option>
              </select>
              <input type="text" name="label" maxLength={40} placeholder="카드 메모 (선택)" aria-label="카드 이름" style={{ width: 200 }} />
              <button className="btn btn-small btn-pine">QR 표식 만들기</button>
            </form>
            {!marks.length ? <p className="muted">아직 발급한 QR 표식이 없어요.</p> : null}
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
                      <p className="small" style={{ margin: 0 }}>
                        {formatWindow(m.valid_from, m.valid_until)} <span className="badge">{QR_STATE_LABEL[state]}</span>
                      </p>
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

      {/* 4. 주방 액자 갤러리 & 걷기 사진 보관함 관리 */}
      <GalleryPanel />
      <Suspense fallback={<section className="card"><p className="muted" style={{ margin: 0 }}>걷기 사진 보관함을 확인하는 중</p></section>}>
        <ShotsPanel />
      </Suspense>
    </div>
  );
}
