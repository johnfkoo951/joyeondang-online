import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DocTitle } from '@/components/DocTitle';
import { T } from '@/components/i18n/T';
import { NamedRegion } from '@/components/NamedRegion';
import { LetteringPreview } from '@/components/LetteringPreview';
import { RecordList, type RecordRow } from '@/components/RecordList';
import { EXHIBIT_SECTIONS, SECTION_BY_SLUG, type ExhibitSection } from '@/content/exhibit-sections';
import { ROOM_BY_SLUG } from '@/content/rooms';
import { SCOPE_LABEL, type Scope } from '@/lib/access';
import { supabaseReady } from '@/lib/env';
import { viewPiece } from '@/lib/exhibit';
import { SECTION_EN } from '@/lib/page-words';
import { placeName } from '@/lib/place-names';
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

/** 칸 제목(지금 말). 영어 제목이 없으면 한국어 */
const titleEn = (s: ExhibitSection) => SECTION_EN[s.slug]?.title ?? s.title;

/** 닫힌 칸의 영어 안내(누구에게 열리는지) */
const LOCKED_EN: Record<Scope, string> = {
  public: 'Anyone can see this part.',
  guests: 'Invited guests can see this part.',
  family: 'Only the family can see this part.',
};

// 쪽 껍데기는 그 경로의 모든 링크가 함께 쓴다: 주소마다 다른 값(params)은 Suspense 안에서 읽는다.
// 원고(볼트 노트에서 온 글)는 옮기지 않는다: lang="ko"로 둔다
export default function SectionPage({ params }: Props) {
  return (
    <article className="wrap stack">
      <p className="small">
        <Link href="/exhibit"><T ko="← 전시 일곱 칸" en="← All seven parts" /></Link>
      </p>
      <Suspense fallback={<p className="muted"><T ko="전시 칸을 여는 중이에요" en="Opening this part" /></p>}>
        <SectionView params={params} />
      </Suspense>
    </article>
  );
}

async function SectionView({ params }: Props) {
  const { slug } = await params;
  const section = SECTION_BY_SLUG.get(slug);
  if (!section) notFound();
  const i = EXHIBIT_SECTIONS.indexOf(section);
  const prev = EXHIBIT_SECTIONS[i - 1];
  const next = EXHIBIT_SECTIONS[i + 1];
  const room = section.room ? ROOM_BY_SLUG.get(section.room) : undefined;
  return (
    <>
      <DocTitle en={titleEn(section)} />
      <p className="muted small" style={{ margin: 0 }}><T ko={`전시 ${section.order} / 7`} en={`Exhibit ${section.order} / 7`} /></p>
      <h1><T ko={section.title} en={titleEn(section)} /></h1>
      <Suspense fallback={<p className="muted"><T ko="원고를 펼치는 중이에요" en="Unfolding the manuscript" /></p>}>
        <SectionBody section={section} />
      </Suspense>
      {section.slug === 'house' || section.slug === 'works' ? <LetteringPreview /> : null}
      {room ? (
        <p className="small">
          <T
            ko={<>그림 집에서는 <Link href={`/room/${room.slug}`}>{room.name}</Link>에 걸려 있어요.</>}
            en={<>In the picture house, it hangs in the <Link href={`/room/${room.slug}`}>{placeName('en', room.name)}</Link>.</>}
          />
        </p>
      ) : null}
      <NamedRegion as="nav" className="btn-row" ko="이전, 다음 칸" en="Previous and next parts">
        {prev ? <Link className="btn btn-small" href={`/exhibit/${prev.slug}`}><T ko={`← ${prev.title}`} en={`← ${titleEn(prev)}`} /></Link> : null}
        {next ? <Link className="btn btn-small" href={`/exhibit/${next.slug}`}><T ko={`${next.title} →`} en={`${titleEn(next)} →`} /></Link> : null}
      </NamedRegion>
    </>
  );
}

async function SectionBody({ section }: { section: ExhibitSection }) {
  const viewer = await getViewer();
  const view = viewPiece(section.slug, viewer.role);
  return (
    <div className="stack">
      {view.state === 'open' ? (
        // 원고는 동기화 도구가 볼트 노트에서 HTML로 바꾸며 개인정보 검사를 통과한 것만 들어온다.
        <div className="prose" lang="ko" dangerouslySetInnerHTML={{ __html: view.piece.html }} />
      ) : view.state === 'locked' ? (
        <p className="note-box">
          <T ko={`이 칸은 ${SCOPE_LABEL[view.visibility]} 볼 수 있어요.`} en={LOCKED_EN[view.visibility]} />{' '}
          {viewer.signedIn ? null : <Link href={`/login?next=/exhibit/${section.slug}`}><T ko="들어가기" en="Sign in" /></Link>}
        </p>
      ) : (
        <p className="note-box">
          <T
            ko={`이 칸의 글과 사진을 준비하고 있어요. 현장에서는 ${section.onsite}에 놓여요.`}
            en={`We’re preparing the words and photos for this part. At the event, it’s part of ${SECTION_EN[section.slug]?.onsite ?? 'the house exhibit'}.`}
          />
        </p>
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
      <h2><T ko="소나무에 걸린 종이" en="Notes on the pine tree" /></h2>
      <RecordList rows={rows} empty={<T ko="아직 걸린 종이가 없어요." en="No notes hung yet." />} />
    </section>
  );
}
