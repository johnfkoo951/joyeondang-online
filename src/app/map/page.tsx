/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { DocTitle } from '@/components/DocTitle';
import { T } from '@/components/i18n/T';
import { HouseLine } from '@/components/i18n/HouseLine';
import { StampRallyMap } from '@/components/stamp-map/StampRallyMap';
import { ROOMS } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { placeName } from '@/lib/place-names';
import { getDoorStates } from '@/lib/public-data';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '도장 투어 · 집 지도' };

type Props = { searchParams: Promise<{ spot?: string }> };

export default function MapPage({ searchParams }: Props) {
  return (
    <div className="art-poster-page wrap-wide stack">
      <DocTitle en="Stamp tour · House map" />
      <img src="/web/collage/edge-tl-v2.webp" alt="" aria-hidden="true" className="art-page-edge art-page-edge-tl" />
      <img src="/web/collage/edge-tr-v2.webp" alt="" aria-hidden="true" className="art-page-edge art-page-edge-tr" />

      <header className="art-page-head">
        <div className="art-page-head-text">
          <p className="art-eyebrow">STAMP RALLY · 13 DOORS</p>
          <h1 className="art-display-title"><T ko="조연당 도장 투어" en="Joyeondang stamp tour" /></h1>
          <p className="art-serif-lead">
            <T
              ko="마당 세 아치부터 1층 거실, 2층 박공방까지 열세 곳을 다녀오면 한지 콜라주 지도 위에 나만의 전각 인장이 하나씩 찍혀요."
              en="Visit 13 spots, from the three arches in the yard to the 1F living room and the 2F gable rooms, and your own carved seal lands on the hanji collage map, one by one."
            />
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn art-fill-pill" href="/walk"><T ko="3D 집 안 걷기" en="Walk the house in 3D" /></Link>
          <Link className="btn art-outline-pill" href="/games"><T ko="작은 놀이" en="Mini games" /></Link>
          <Link className="btn art-outline-pill" href="/guestbook"><T ko="방명록" en="Guestbook" /></Link>
        </div>
      </header>

      <Suspense
        fallback={
          <StampRallyMap
            initialStamps={[]}
            doors={{}}
            canStamp={false}
            signedIn={false}
            nickname="손님"
            role="public"
          />
        }
      >
        <LiveRally searchParams={searchParams} />
      </Suspense>

      <section className="art-dashed-section stack" aria-labelledby="list">
        <div style={{ display: 'grid', gap: 4 }}>
          <p className="art-eyebrow">TEXT DIRECTORY</p>
          <h2 id="list" className="art-hand-h2"><T ko="한 줄 방 목록" en="Rooms in one list" /></h2>
          <p className="small muted" style={{ margin: 0 }}>
            <T ko="지도 그림 없이 글자 목록으로 바로 들어가실 수 있어요." en="Skip the picture map and go straight in from this text list." />
          </p>
        </div>
        <ol className="room-text-list">
          {ROOMS.map((r) => (
            <li key={r.slug}>
              <Link href={`/room/${r.slug}`}><strong><T ko={r.name} en={placeName('en', r.name)} /></strong></Link>{' '}
              <span className="muted small"><HouseLine text={r.line} /></span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

async function LiveRally({ searchParams }: Props) {
  const [sp, doors, viewer] = await Promise.all([searchParams, getDoorStates(), getViewer()]);
  let stamps: string[] = [];
  if (supabaseReady() && canUse(viewer.role, 'stamps')) {
    const supabase = await createClient();
    const { data } = await supabase.from('stamps').select('item');
    stamps = (data ?? []).map((s) => String(s.item));
  }
  return (
    <StampRallyMap
      initialStamps={stamps}
      doors={doors}
      canStamp={canUse(viewer.role, 'stamps')}
      signedIn={viewer.signedIn}
      nickname={viewer.name ?? '손님'}
      role={viewer.role}
      initialSpot={typeof sp?.spot === 'string' ? sp.spot : undefined}
    />
  );
}
