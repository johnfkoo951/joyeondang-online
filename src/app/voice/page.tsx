import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { DocTitle } from '@/components/DocTitle';
import { T } from '@/components/i18n/T';
import { VoiceBoard, type VoiceEntry } from '@/components/voice/VoiceBoard';
import { canSee } from '@/lib/access';
import { APP_VERSION } from '@/lib/app-version';
import { loadFamilyRooms } from '@/lib/family-rooms';
import { allVoiceRooms } from '@/lib/room-voice';
import { roomStamps, type StampRoomView } from '@/lib/room-voice-ledger';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '방 의견함', robots: { index: false, follow: false } };

// 가족만 쓰는 방 의견함. 항목은 지금 지어진 방 장면에서 뽑고(lib/room-voice), 방이 바뀐 버전·시각은 장부가 알려 준다.
export default function VoicePage() {
  return (
    <div className="wrap-wide stack">
      <DocTitle en="Room feedback" />
      <h1><T ko="방 의견함" en="Room feedback" /></h1>
      <Suspense fallback={<p className="muted"><T ko="방을 펼치는 중이에요" en="Opening the rooms" /></p>}>
        <VoiceBody />
      </Suspense>
    </div>
  );
}

async function VoiceBody() {
  const viewer = await getViewer();
  if (!viewer.ready) {
    return <p className="note-box"><T ko="의견함은 곧 열려요." en="Room feedback opens soon." /></p>;
  }
  if (!canSee(viewer.role, 'family')) {
    return (
      <div className="card stack">
        <p style={{ margin: 0 }}>
          <T
            ko="방 의견함은 이 집에 사는 가족만 쓰는 곳이에요."
            en="Room feedback is only for the family who lives here."
          />
        </p>
        {!viewer.signedIn ? (
          <div className="btn-row">
            <Link className="btn btn-roof" href="/login?next=/voice"><T ko="로그인" en="Sign in" /></Link>
          </div>
        ) : null}
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('room_voice_list');
  const entries: VoiceEntry[] = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>).map((r) => ({
        room: String(r.room_slug),
        writer: typeof r.writer === 'string' ? r.writer : '',
        mine: r.mine === true,
        marks: (r.marks ?? {}) as VoiceEntry['marks'],
        notes: (r.notes ?? {}) as Record<string, string>,
        answers: (r.answers ?? {}) as Record<string, string>,
        status: r.status === 'done' ? 'done' : 'draft',
        seen: Array.isArray(r.seen_items) ? (r.seen_items as string[]) : [],
        hash: typeof r.room_hash === 'string' ? r.room_hash : '',
        version: typeof r.app_version === 'string' ? r.app_version : '',
        updatedAt: typeof r.updated_at === 'string' ? r.updated_at : '',
      }))
    : [];

  const rooms = allVoiceRooms();
  // 방 주인 이름표는 저장소에 없고 서버 환경 변수에만 있다(가족에게만 보이는 화면이라 그대로 싣는다)
  const owners: Record<string, string> = {};
  for (const fr of loadFamilyRooms()) owners[fr.slug] = fr.owner;
  const stamps: Record<string, StampRoomView> = {};
  for (const r of rooms) {
    const s = roomStamps(r.slug);
    if (s) stamps[r.slug] = s;
  }

  return (
    <VoiceBoard
      rooms={rooms}
      owners={owners}
      stamps={stamps}
      entries={entries}
      appVersion={APP_VERSION}
      loadFailed={Boolean(error)}
    />
  );
}
