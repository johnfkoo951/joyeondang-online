import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EXHIBIT_SECTIONS } from '@/content/exhibit-sections';
import { viewPiece } from '@/lib/exhibit';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '전시' };

export default function ExhibitIndex() {
  return (
    <div className="wrap">
      <h1>조연당과 다섯 사람</h1>
      <p className="lead">
        집과 사람의 이야기를 일곱 칸에 나눠 걸었어요. 11월 28일 집 안 전시와 같은 글이에요.
      </p>
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

const STATE_WORD: Record<string, string> = { empty: '준비 중', locked: '초대 손님께 열려요', open: '' };

function SectionList({ states }: { states: Record<string, string> }) {
  return (
    <ol className="sections">
      {EXHIBIT_SECTIONS.map((s) => (
        <li key={s.slug}>
          <Link className="section-link reveal" href={`/exhibit/${s.slug}`}>
            <span className="num">{s.order}</span>
            <span>{s.title}</span>
            <span className="small muted">{STATE_WORD[states[s.slug] ?? 'empty']}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
