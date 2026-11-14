import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { DocTitle } from '@/components/DocTitle';
import { T } from '@/components/i18n/T';
import { LetteringPreview } from '@/components/LetteringPreview';
import { EXHIBIT_SECTIONS } from '@/content/exhibit-sections';
import { viewPiece } from '@/lib/exhibit';
import { SECTION_EN, SECTION_STATE } from '@/lib/page-words';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '전시' };

export default function ExhibitIndex() {
  return (
    <div className="wrap">
      <DocTitle en="Exhibit" />
      <h1><T ko="조연당과 다섯 사람" en="Joyeondang and five people" /></h1>
      <p className="lead">
        <T
          ko="집과 사람의 이야기를 일곱 칸에 나눠 걸었어요. 11월 28일 집 안 전시와 같은 글이에요."
          en="The story of the house and its people, hung in seven parts. The same writing as the exhibit inside the house on November 28."
        />
      </p>
      <LetteringPreview />
      <Suspense fallback={<SectionList states={{}} />}>
        <LiveList />
      </Suspense>
    </div>
  );
}

async function LiveList() {
  const viewer = await getViewer();
  const states = Object.fromEntries(EXHIBIT_SECTIONS.map((s) => [s.slug, viewPiece(s.slug, viewer.role).state]));
  return <SectionList states={states} />;
}

// 칸 상태 낱말(준비 중, 초대 손님께 열려요, 열린 칸은 비움)은 lib/page-words의 SECTION_STATE
function SectionList({ states }: { states: Record<string, string> }) {
  return (
    <ol className="sections">
      {EXHIBIT_SECTIONS.map((s) => {
        const word = SECTION_STATE[states[s.slug] ?? 'empty'];
        return (
          <li key={s.slug}>
            <Link className="section-link reveal" href={`/exhibit/${s.slug}`}>
              <span className="num">{s.order}</span>
              <span><T ko={s.title} en={SECTION_EN[s.slug]?.title ?? s.title} /></span>
              <span className="small muted">{word?.ko ? <T ko={word.ko} en={word.en} /> : null}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
