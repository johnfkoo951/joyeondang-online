import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DocTitle } from '@/components/DocTitle';
import { T } from '@/components/i18n/T';
import { HouseLine } from '@/components/i18n/HouseLine';
import { NoteForm } from '@/components/NoteForm';
import { RecordList, type RecordRow } from '@/components/RecordList';
import { RoomGames } from '@/components/RoomGames';
import { RoomWebExhibits } from '@/components/RoomWebExhibits';
import { RoomVisitTracker } from '@/components/stamp-map/RoomVisitTracker';
import { SECTION_BY_SLUG } from '@/content/exhibit-sections';
import { DOOR_LABEL, ROOMS, ROOM_BY_SLUG, acceptsNotes, type Room } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { attachPhotos } from '@/lib/notes-media';
import { DOOR_EN, SECTION_EN } from '@/lib/page-words';
import { placeName } from '@/lib/place-names';
import { getDoorStates } from '@/lib/public-data';
import { SPOT_BY_SLUG, walkHrefForSpot } from '@/lib/stamp-rally';
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

function roomIllustration(room: Room): string {
  if (room.slug === 'photozone') return '/web/collage/collage-character-v2.webp';
  if (room.slug === 'porch' || room.slug === 'entrance') return '/web/collage/cutout-walk-v2.webp';
  if (room.slug === 'pine' || room.slug === 'lantern') return '/web/collage/cutout-stamp-v2.webp';
  if (room.slug === 'study' || room.slug === 'guest' || room.slug === 'atelier') return '/web/collage/collage-writing-v2.webp';
  if (room.slug === 'living') return '/web/collage/collage-house-poster-v2.webp';
  if (room.game || room.floor === 'second') return '/web/collage/collage-games-v2.webp';
  return '/web/collage/cutout-exhibit-v2.webp';
}

export default function RoomPage({ params }: Props) {
  return (
    <div className="wrap stack">
      <div className="btn-row">
        <Link className="btn btn-small" href="/map"><T ko="← 도장 투어 맵" en="← Stamp tour map" /></Link>
        <Link className="btn btn-small" href="/games"><T ko="작은 놀이" en="Mini games" /></Link>
        <Link className="btn btn-small" href="/guestbook"><T ko="방명록" en="Guestbook" /></Link>
      </div>
      <Suspense fallback={<p className="muted"><T ko="방 문을 여는 중이에요" en="Opening the room door" /></p>}>
        <RoomBody params={params} />
      </Suspense>
    </div>
  );
}

async function RoomBody({ params }: Props) {
  const { slug } = await params;
  const room = ROOM_BY_SLUG.get(slug);
  if (!room) notFound();
  const sections = (room.exhibit ?? []).map((s) => SECTION_BY_SLUG.get(s)).filter(Boolean);
  const art = roomIllustration(room);
  const spot = SPOT_BY_SLUG.get(slug);

  return (
    <>
      <DocTitle en={placeName('en', room.name)} />
      <div className="art-cutout-hero">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 방 콜라주 컷아웃 */}
        <img src={art} alt="" className="art-cutout-hero-img" />
        <div className="stack" style={{ gap: 8 }}>
          <p className="art-eyebrow">JOYEONDANG SPACE</p>
          <h1 className="art-display-title"><T ko={room.name} en={placeName('en', room.name)} /></h1>
          <p className="art-serif-lead"><HouseLine text={room.line} /></p>
          {spot ? (
            <div className="btn-row" style={{ marginTop: 6 }}>
              <Link className="btn art-fill-pill btn-small" href={walkHrefForSpot(spot)}>
                <T ko="3D 집 안에서 이 공간 가 보기" en="See this space in the 3D house" />
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {sections.length ? (
        <p className="small">
          <T ko="이 방과 이어진 전시:" en="Exhibit for this room:" />{' '}
          {sections.map((s, i) => (
            <span key={s!.slug}>
              {i ? ' · ' : ''}
              <Link href={`/exhibit/${s!.slug}`}><T ko={s!.title} en={SECTION_EN[s!.slug]?.title ?? s!.title} /></Link>
            </span>
          ))}
        </p>
      ) : null}
      <Suspense fallback={<p className="muted"><T ko="방 안을 둘러보는 중이에요" en="Looking around the room" /></p>}>
        <RoomLive room={room} />
      </Suspense>
    </>
  );
}

async function RoomLive({ room }: { room: Room }) {
  const [viewer, doors] = await Promise.all([getViewer(), getDoorStates()]);
  const door = doors[room.slug] ?? room.door;
  if (door !== 'open') {
    return (
      <p className="card">
        <T ko="문패: " en="Door sign: " /><strong><T ko={DOOR_LABEL[door]} en={DOOR_EN[door]} /></strong>
        {room.opens ? <> · <HouseLine text={room.opens} /></> : ''}
      </p>
    );
  }

  let records: RecordRow[] = [];
  let hasServerStamp = false;
  if (supabaseReady()) {
    const supabase = await createClient();
    const [recRes, stampRes] = await Promise.all([
      room.question ? supabase.rpc('room_records', { p_room: room.slug, p_limit: 50 }) : Promise.resolve({ data: null }),
      canUse(viewer.role, 'stamps')
        ? supabase.from('stamps').select('item').eq('item', `room:${room.slug}`).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (room.question) {
      records = room.photo ? await attachPhotos((recRes.data ?? []) as RecordRow[]) : ((recRes.data ?? []) as RecordRow[]);
    }
    hasServerStamp = Boolean(stampRes.data);
  }
  const canWrite = canUse(viewer.role, 'write') && acceptsNotes(room, door);

  return (
    <div className="stack">
      <RoomVisitTracker
        slug={room.slug}
        name={room.name}
        canStamp={canUse(viewer.role, 'stamps')}
        initialStamped={hasServerStamp}
      />

      <RoomWebExhibits room={room.slug} />

      <RoomGames
        room={room.slug}
        nickname={viewer.name ?? '손님'}
        role={viewer.role}
        canStamp={canUse(viewer.role, 'stamps')}
        pendingName={room.game}
      />

      {room.question ? (
        <section className="stack" aria-labelledby="q">
          <h2 id="q"><HouseLine text={room.question} /></h2>
          {room.slug === 'photozone' ? (
            <p className="small">
              <T ko="찍은 사진으로 내 걷기 캐릭터도 만들 수 있어요." en="You can also make your walking character from the photo you take." />{' '}
              <Link href="/avatar"><T ko="내 사진으로 캐릭터 꾸미기" en="Make a character from my photo" /></Link>
            </p>
          ) : null}
          {canWrite ? (
            <NoteForm room={room.slug} photo={Boolean(room.photo)} />
          ) : (
            <WhyCannotWrite signedIn={viewer.signedIn} ready={viewer.ready} />
          )}
          <h2><T ko="걸린 쪽지" en="Notes left here" /></h2>
          <RecordList
            rows={records}
            empty={
              viewer.role === 'public'
                ? <T ko="아직 인터넷에 걸린 쪽지가 없어요." en="No notes are posted online yet." />
                : <T ko="아직 걸린 쪽지가 없어요." en="No notes are up yet." />
            }
          />
        </section>
      ) : null}
    </div>
  );
}

function WhyCannotWrite({ signedIn, ready }: { signedIn: boolean; ready: boolean }) {
  if (!ready) return <p className="note-box"><T ko="쪽지 받기는 곧 열려요." en="Notes open soon." /></p>;
  if (!signedIn) {
    return (
      <p className="note-box">
        <T
          ko={<>초대 명단에 계신 분은 <Link href="/login">들어와서</Link> 쪽지를 남길 수 있어요. 구경과 체험 도장 찍기는 그대로 하실 수 있어요.</>}
          en={<>Guests on the invitation list can <Link href="/login">sign in</Link> and leave a note. You can still look around and collect trial stamps.</>}
        />
      </p>
    );
  }
  return (
    <p className="note-box">
      <T
        ko={<>명단에서 아직 찾지 못했어요. <Link href="/notebook">수첩</Link>에서 초대 코드를 넣거나 가족에게 확인을 부탁해 주세요.</>}
        en={<>We haven’t found you on the guest list yet. Enter your invite code in your <Link href="/notebook">notebook</Link>, or ask the family to check.</>}
      />
    </p>
  );
}
