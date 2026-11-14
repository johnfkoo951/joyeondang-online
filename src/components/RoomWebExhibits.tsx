'use client';
import { useMemo, useState } from 'react';
import { T } from '@/components/i18n/T';
import { ExhibitModal } from '@/components/walk/ExhibitModal';
import { ROOM_EXHIBITS } from '@/content/room-exhibits';

// 방의 전시·아카이브 카드. 카드 글(머리말, 제목, 소개)은 가족이 쓴 전시라 옮기지 않는다(lang="ko"), 단추만 화면 말

export function RoomWebExhibits({ room }: { room: string }) {
  const exhibits = useMemo(
    () => Object.values(ROOM_EXHIBITS).filter((ex) => ex.room === room),
    [room],
  );
  const [openId, setOpenId] = useState<string | null>(null);

  if (!exhibits.length) return null;

  return (
    <section className="stack" aria-labelledby="room-exhibits">
      <h2 id="room-exhibits"><T ko="이 방의 전시와 아카이브" en="Exhibits and archives in this room" /></h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
        {exhibits.map((ex) => (
          <article key={ex.id} className="card stack" style={{ justifyContent: 'space-between' }}>
            <div className="stack" style={{ gap: 6 }} lang="ko">
              <span className="small muted" style={{ fontWeight: 700 }}>{ex.kicker}</span>
              <h3 style={{ margin: 0, fontSize: 18 }}>{ex.title}</h3>
              <p className="small" style={{ margin: 0 }}>{ex.lead}</p>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-pine btn-small" onClick={() => setOpenId(ex.id)}>
                <T ko={`아카이브 열기 (${ex.cards.length})`} en={`Open the archive (${ex.cards.length})`} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {openId ? <ExhibitModal exhibitId={openId} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}
