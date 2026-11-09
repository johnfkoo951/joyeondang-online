import Link from 'next/link';
import { Suspense } from 'react';
import { ArtSlot } from '@/components/ArtSlot';
import { getLantern } from '@/lib/public-data';

export default function Home() {
  return (
    <div className="wrap front">
      <ArtSlot label="조연당 정면 그림" ratio="16 / 10" />
      <div className="stack">
        <h1 className="title">造連堂</h1>
        <p className="sub">짓고, 잇는 집. 조연당에 오신 걸 환영해요.</p>
      </div>
      <div className="btn-row">
        <Link className="btn btn-roof" href="/walk">집 안 걸어 보기</Link>
        <Link className="btn" href="/map">집 지도</Link>
        <Link className="btn" href="/exhibit">전시 보기</Link>
        <Link className="btn" href="/notebook">내 수첩</Link>
      </div>
      <Suspense fallback={<p className="lantern-line muted">석등 불빛을 세는 중이에요</p>}>
        <LanternLine />
      </Suspense>
      <section className="card stack" aria-labelledby="how">
        <h2 id="how" style={{ marginTop: 0 }}>이렇게 놀아요</h2>
        <ol className="stack" style={{ paddingLeft: 20, margin: 0 }}>
          <li>그림 집과 전시는 누구나 둘러볼 수 있어요.</li>
          <li>초대 명단에 계신 분은 구글 계정으로 들어와 이름표를 달고, 방마다 쪽지를 남기고 도장을 모아요.</li>
          <li>남긴 종이는 가족이 읽은 뒤 마당에 걸리고, 집에 불이 하나씩 켜져요.</li>
        </ol>
      </section>
    </div>
  );
}

async function LanternLine() {
  const lantern = await getLantern();
  if (!lantern) {
    return (
      <p className="lantern-line">
        <span className="lamp-dot" aria-hidden="true" /> 석등은 곧 켜져요.
      </p>
    );
  }
  return (
    <p className="lantern-line">
      <span className="lamp-dot" aria-hidden="true" />
      지금까지 {lantern.lit}장의 종이가 석등을 밝혔어요{lantern.today ? ` · 오늘 ${lantern.today}장` : ''}.
    </p>
  );
}
