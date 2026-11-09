import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { earnStamp } from '@/app/actions';
import { ArtSlot } from '@/components/ArtSlot';
import { NoteForm } from '@/components/NoteForm';
import { RecordList, type RecordRow } from '@/components/RecordList';
import { SECTION_BY_SLUG } from '@/content/exhibit-sections';
import { DOOR_LABEL, ROOMS, ROOM_BY_SLUG, acceptsNotes, type Room } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { getDoorStates } from '@/lib/public-data';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ROOMS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: ROOM_BY_SLUG.get(slug)?.name ?? '방' };
}

export default async function RoomPage({ params }: Props) {
  const { slug } = await params;
  const room = ROOM_BY_SLUG.get(slug);
  if (!room) notFound();
  const sections = (room.exhibit ?? []).map((s) => SECTION_BY_SLUG.get(s)).filter(Boolean);
  return (
    <div className="wrap stack">
      <p className="small">
        <Link href="/map">← 집 지도</Link>
      </p>
      <div className="room-head">
        <h1>{room.name}</h1>
        <p className="lead">{room.line}</p>
      </div>
      <ArtSlot label={`${room.name} 장면`} />
      {room.game ? <p className="note-box">이 방의 놀이 「{room.game}」는 준비 중이에요.</p> : null}
      {sections.length ? (
        <p className="small">
          이 방과 이어진 전시:{' '}
          {sections.map((s, i) => (
            <span key={s!.slug}>
              {i ? ' · ' : ''}
              <Link href={`/exhibit/${s!.slug}`}>{s!.title}</Link>
            </span>
          ))}
        </p>
      ) : null}
      <Suspense fallback={<p className="muted">방 안을 둘러보는 중이에요</p>}>
        <RoomLive room={room} />
      </Suspense>
    </div>
  );
}

async function RoomLive({ room }: { room: Room }) {
  const [viewer, doors] = await Promise.all([getViewer(), getDoorStates()]);
  const door = doors[room.slug] ?? room.door;
  if (door !== 'open') {
    return (
      <p className="card">
        문패: <strong>{DOOR_LABEL[door]}</strong>
        {room.opens ? ` · ${room.opens}` : ''}
      </p>
    );
  }

  let records: RecordRow[] = [];
  if (supabaseReady() && room.question) {
    const supabase = await createClient();
    const { data } = await supabase.rpc('room_records', { p_room: room.slug, p_limit: 50 });
    records = (data ?? []) as RecordRow[];
  }
  const canWrite = canUse(viewer.role, 'write') && acceptsNotes(room, door);

  return (
    <div className="stack">
      {canUse(viewer.role, 'stamps') ? (
        <form action={earnStamp}>
          <input type="hidden" name="room" value={room.slug} />
          <button className="btn btn-small">이 방 도장 찍기</button>
        </form>
      ) : null}

      {room.question ? (
        <section className="stack" aria-labelledby="q">
          <h2 id="q">{room.question}</h2>
          {canWrite ? (
            <NoteForm room={room.slug} />
          ) : (
            <WhyCannotWrite signedIn={viewer.signedIn} ready={viewer.ready} />
          )}
          <h2>걸린 종이</h2>
          <RecordList rows={records} empty={viewer.role === 'public' ? '아직 인터넷에 걸린 종이가 없어요.' : '아직 걸린 종이가 없어요.'} />
        </section>
      ) : null}
    </div>
  );
}

function WhyCannotWrite({ signedIn, ready }: { signedIn: boolean; ready: boolean }) {
  if (!ready) return <p className="note-box">쪽지 받기는 곧 열려요.</p>;
  if (!signedIn) {
    return (
      <p className="note-box">
        초대 명단에 계신 분은 <Link href="/login">들어와서</Link> 쪽지를 남길 수 있어요. 구경은 그대로 계속하셔도 돼요.
      </p>
    );
  }
  return (
    <p className="note-box">
      명단에서 아직 찾지 못했어요. <Link href="/notebook">수첩</Link>에서 초대 코드를 넣거나 가족에게 확인을 부탁해 주세요.
    </p>
  );
}
