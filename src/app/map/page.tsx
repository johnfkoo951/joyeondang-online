import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { DOOR_LABEL, FLOORS, ROOMS, type Door } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { getDoorStates } from '@/lib/public-data';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '집 지도' };

export default function MapPage() {
  return (
    <div className="wrap-wide">
      <h1>집 지도</h1>
      <p className="lead">
        집을 옆에서 자른 듯 층층이 그린 지도예요. 실제 도면은 아니에요. 방을 누르면 들어가요.
      </p>
      <p>
        <Link className="btn btn-roof" href="/walk">3D로 걸어서 둘러보기</Link>
      </p>
      <Suspense fallback={<House doors={{}} stamps={new Set()} />}>
        <LiveHouse />
      </Suspense>
      <h2 id="list">한 줄 목록</h2>
      <ol className="stack" style={{ paddingLeft: 20 }}>
        {ROOMS.map((r) => (
          <li key={r.slug}>
            <Link href={`/room/${r.slug}`}>{r.name}</Link> <span className="muted small">{r.line}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function LiveHouse() {
  const [doors, viewer] = await Promise.all([getDoorStates(), getViewer()]);
  let stamps = new Set<string>();
  if (supabaseReady() && canUse(viewer.role, 'stamps')) {
    const supabase = await createClient();
    const { data } = await supabase.from('stamps').select('item');
    stamps = new Set((data ?? []).map((s) => String(s.item)));
  }
  return <House doors={doors} stamps={stamps} />;
}

function House({ doors, stamps }: { doors: Record<string, Door>; stamps: Set<string> }) {
  return (
    <div className="house" aria-label="조연당 단면 지도">
      <div className="roof-band" aria-hidden="true" />
      {FLOORS.map((floor) => {
        const rooms = ROOMS.filter((r) => r.floor === floor.id);
        if (!rooms.length) return null;
        return (
          <section key={floor.id} className={`floor ${floor.id === 'yard' ? 'yard' : ''}`} aria-label={floor.label}>
            <div className="floor-label">
              <span>{floor.label}</span>
              {floor.note ? <span className="small muted">{floor.note}</span> : null}
            </div>
            <div className="rooms">
              {rooms.map((room) => {
                const door = doors[room.slug] ?? room.door;
                const stamped = stamps.has(`room:${room.slug}`);
                return (
                  <Link key={room.slug} href={`/room/${room.slug}`} className="room-card" data-door={door}>
                    <span className="name">{room.name}</span>
                    <span className="door" data-door={door}>{DOOR_LABEL[door]}</span>
                    {door !== 'open' && room.opens ? <span className="small muted">{room.opens}</span> : null}
                    {stamped ? <span className="stamp-mark">도장 받음</span> : null}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
