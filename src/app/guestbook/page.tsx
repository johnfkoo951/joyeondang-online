import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DocTitle } from '@/components/DocTitle';
import { GuestbookStudio, type WallItem } from '@/components/guestbook/GuestbookStudio';
import type { RecordRow } from '@/components/RecordList';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { attachPhotos } from '@/lib/notes-media';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '방명록 · 글 남기기' };

const NOTE_ROOMS = ['living', 'pine', 'study', 'porch', 'photozone'] as const;

type Props = { searchParams?: Promise<{ room?: string }> };

export default function GuestbookPage({ searchParams }: Props = {}) {
  return (
    <div className="wrap-wide stack">
      <DocTitle en="Guestbook · Leave a note" />
      <Suspense
        fallback={
          <GuestbookStudio
            canWrite={false}
            signedIn={false}
            ready={false}
            nickname={null}
            wall={[]}
          />
        }
      >
        <GuestbookLive searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function GuestbookLive({ searchParams }: Props) {
  const [viewer, sp] = await Promise.all([
    getViewer(),
    searchParams ? searchParams : Promise.resolve({} as { room?: string }),
  ]);

  let wall: WallItem[] = [];
  if (supabaseReady()) {
    const supabase = await createClient();
    const lists = await Promise.all(
      NOTE_ROOMS.map(async (slug) => {
        const { data } = await supabase.rpc('room_records', { p_room: slug, p_limit: 25 });
        const raw = (data ?? []) as RecordRow[];
        const room = ROOM_BY_SLUG.get(slug);
        const withMedia = room?.photo ? await attachPhotos(raw) : raw;
        return withMedia.map((r) => ({
          ...r,
          roomSlug: slug,
          roomName: room?.name ?? slug,
        }));
      }),
    );
    wall = lists.flat().sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  return (
    <GuestbookStudio
      canWrite={canUse(viewer.role, 'write')}
      signedIn={viewer.signedIn}
      ready={viewer.ready}
      nickname={viewer.name ?? null}
      initialRoom={typeof sp?.room === 'string' ? sp.room : undefined}
      wall={wall}
    />
  );
}
