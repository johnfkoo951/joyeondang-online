import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { RecordList, type RecordRow } from '@/components/RecordList';
import { EXHIBIT_SECTIONS, SECTION_BY_SLUG, type ExhibitSection } from '@/content/exhibit-sections';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { SCOPE_LABEL } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { viewPiece } from '@/lib/exhibit';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return EXHIBIT_SECTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: SECTION_BY_SLUG.get(slug)?.title ?? '전시' };
}

export default async function SectionPage({ params }: Props) {
  const { slug } = await params;
  const section = SECTION_BY_SLUG.get(slug);
  if (!section) notFound();
  const i = EXHIBIT_SECTIONS.indexOf(section);
  const prev = EXHIBIT_SECTIONS[i - 1];
  const next = EXHIBIT_SECTIONS[i + 1];
  const room = section.room ? ROOM_BY_SLUG.get(section.room) : undefined;
  return (
    <article className="wrap stack">
      <p className="small">
        <Link href="/exhibit">← 전시 일곱 칸</Link>
      </p>
      <p className="muted small" style={{ margin: 0 }}>전시 {section.order} / 7</p>
      <h1>{section.title}</h1>
      <Suspense fallback={<p className="muted">원고를 펼치는 중이에요</p>}>
        <SectionBody section={section} />
      </Suspense>
      {room ? (
        <p className="small">
          그림 집에서는 <Link href={`/room/${room.slug}`}>{room.name}</Link>에 걸려 있어요.
        </p>
      ) : null}
      <nav className="btn-row" aria-label="이전, 다음 칸">
        {prev ? <Link className="btn btn-small" href={`/exhibit/${prev.slug}`}>← {prev.title}</Link> : null}
        {next ? <Link className="btn btn-small" href={`/exhibit/${next.slug}`}>{next.title} →</Link> : null}
      </nav>
    </article>
  );
}

async function SectionBody({ section }: { section: ExhibitSection }) {
  const viewer = await getViewer();
  const view = viewPiece(section.slug, viewer.role);
  return (
    <div className="stack">
      {view.state === 'open' ? (
        // 원고는 동기화 도구가 볼트 노트에서 HTML로 바꾸며 개인정보 검사를 통과한 것만 들어온다.
        <div className="prose" dangerouslySetInnerHTML={{ __html: view.piece.html }} />
      ) : view.state === 'locked' ? (
        <p className="note-box">
          이 칸은 {SCOPE_LABEL[view.visibility]} 볼 수 있어요.{' '}
          {viewer.signedIn ? null : <Link href={`/login?next=/exhibit/${section.slug}`}>들어가기</Link>}
        </p>
      ) : (
        <p className="note-box">이 칸의 글과 사진을 준비하고 있어요. 현장에서는 {section.onsite}에 놓여요.</p>
      )}
      {section.slug === 'messages' ? <Messages /> : null}
    </div>
  );
}

async function Messages() {
  if (!supabaseReady()) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc('room_records', { p_room: 'pine', p_limit: 30 });
  const rows = ((data ?? []) as RecordRow[]).filter((r) => r.status === 'approved');
  return (
    <section className="stack">
      <h2>소나무에 걸린 종이</h2>
      <RecordList rows={rows} empty="아직 걸린 종이가 없어요." />
    </section>
  );
}
