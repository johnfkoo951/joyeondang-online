import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ROOMS, ROOM_BY_SLUG } from '@/content/rooms';
import type { Scope } from '@/lib/access';
import { authorLabel, rosterNames } from '@/lib/author-label';
import { signNotePhotos } from '@/lib/notes-media';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';
import { RecordsConsole, type AdminRecordItem } from './RecordsConsole';

export const metadata: Metadata = { title: '글·방명록 관리 · 관리실', robots: { index: false, follow: false } };

export default function AdminRecordsPage() {
  return (
    <div className="wrap-wide stack">
      <div className="page-intro">
        <div className="page-intro-text">
          <h1>방명록 · 쪽지 · 문장 전체 관리</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            승인 대기 중인 새 글뿐 아니라 이미 걸린 글의 공개 범위를 바꾸거나 숨기고, 숨긴 글을 다시 걸어 줄 수 있어요.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">기록을 불러오는 중이에요</p>}>
        <RecordsBody />
      </Suspense>
    </div>
  );
}

async function RecordsBody() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    return (
      <p className="note-box">
        집주인만 들어올 수 있는 곳이에요. <Link href="/login?next=/admin/records">로그인하기</Link> · <Link href="/">첫 화면으로</Link>
      </p>
    );
  }

  const supabase = await createClient();
  const [recRes, rosterRes] = await Promise.all([
    supabase
      .from('records')
      .select('id, room_slug, format, body, author_id, author_name, requested_visibility, visibility, status, created_at, marks_person, marks_minor, media_path')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('roster').select('display_name, claimed_by, revoked_at'),
  ]);

  const names = rosterNames(rosterRes.data);
  const raw = recRes.data ?? [];
  const photos = await signNotePhotos(raw.filter((r) => r.media_path).map((r) => String(r.id)));

  const items: AdminRecordItem[] = raw.map((r) => {
    const who = authorLabel(String(r.author_name ?? '손님'), names.get(String(r.author_id ?? '')));
    return {
      id: String(r.id),
      room_slug: String(r.room_slug),
      room_name: ROOM_BY_SLUG.get(String(r.room_slug))?.name ?? String(r.room_slug),
      format: String(r.format ?? 'note'),
      body: String(r.body ?? ''),
      author_shown: who.shown,
      author_roster: who.roster ?? null,
      author_warn: Boolean(who.warn),
      requested_visibility: (r.requested_visibility as Scope) ?? 'guests',
      visibility: (r.visibility as Scope) ?? 'guests',
      status: String(r.status ?? 'submitted'),
      marks_person: Boolean(r.marks_person),
      marks_minor: Boolean(r.marks_minor),
      has_media: Boolean(r.media_path),
      photo: photos.get(String(r.id)) ?? null,
      created_at: String(r.created_at ?? new Date().toISOString()),
    };
  });

  const roomOptions = ROOMS.filter((rm) => Boolean(rm.question) || rm.slug === 'study').map((rm) => ({
    slug: rm.slug,
    name: rm.name,
  }));

  return <RecordsConsole items={items} rooms={roomOptions} />;
}
