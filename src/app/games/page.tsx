import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GamesHub } from '@/components/games/GamesHub';
import { canUse } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '작은 놀이' };

type Props = { searchParams?: Promise<{ play?: string }> };

export default function GamesPage({ searchParams }: Props = {}) {
  return (
    <div className="wrap-wide stack">
      <Suspense
        fallback={
          <GamesHub
            nickname="손님"
            role="public"
            canStamp={false}
            initialStamps={[]}
          />
        }
      >
        <GamesLive searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function GamesLive({ searchParams }: Props) {
  const [viewer, sp] = await Promise.all([
    getViewer(),
    searchParams ? searchParams : Promise.resolve({} as { play?: string }),
  ]);
  let stamps: string[] = [];
  if (supabaseReady() && canUse(viewer.role, 'stamps')) {
    const supabase = await createClient();
    const { data } = await supabase.from('stamps').select('item');
    stamps = (data ?? []).map((s) => String(s.item));
  }
  return (
    <GamesHub
      nickname={viewer.name ?? '손님'}
      role={viewer.role}
      canStamp={canUse(viewer.role, 'stamps')}
      initialStamps={stamps}
      initialPlay={typeof sp?.play === 'string' ? sp.play : undefined}
    />
  );
}
