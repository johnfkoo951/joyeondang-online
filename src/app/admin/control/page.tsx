import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ControlRoom } from '@/components/control/ControlRoom';
import { previewForRequest } from '@/lib/preview-request';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '컨트롤 룸', robots: { index: false, follow: false } };

// 컨트롤 룸: 집 구획마다 고정 카메라 화면(관전 연결)과 녹화. 집주인과 가족만(서버가 역할을 본다).
// 이 맥의 로컬 미리보기(127.0.0.1에만 묶인 서버)는 걷기 화면과 같이 연다. 관전 출입증·집 데이터도 서버가 한 번 더 확인한다
export default function ControlPage() {
  return (
    <Suspense fallback={<p className="wrap muted">불러오는 중</p>}>
      <ControlGate />
    </Suspense>
  );
}

async function ControlGate() {
  // 요청마다 누가 묻는지 본다(빌드 때 굳히지 않게)
  await connection();
  const viewer = await getViewer();
  const allowed = viewer.role === 'admin' || viewer.role === 'family' || (await previewForRequest());
  if (!allowed) {
    return (
      <div className="wrap stack">
        <h1>컨트롤 룸</h1>
        <p className="note-box">집주인과 가족만 들어올 수 있는 곳이에요. <Link href="/">첫 화면으로</Link></p>
      </div>
    );
  }
  return <ControlRoom backHref={viewer.role === 'admin' ? '/admin' : null} />;
}
