import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getViewer } from '@/lib/viewer';
import { GalleryClient } from './GalleryClient';

export const metadata: Metadata = { title: '내 갤러리', robots: { index: false } };

// 내 갤러리: 집 안을 걷다가 찍은 사진(본인만 보인다). 실제 집 화면이 담기므로 공개하지 않는다.
export default function GalleryPage() {
  return (
    <div className="wrap stack">
      <h1>내 갤러리</h1>
      <Suspense fallback={<p className="muted">사진을 펼치는 중이에요</p>}>
        <GalleryBody />
      </Suspense>
    </div>
  );
}

async function GalleryBody() {
  await connection();
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    return (
      <p className="note-box">
        로그인하면 집 안을 걷다가 찍은 사진이 여기에 모여요. 로그인하지 않고 찍은 사진은 그 기기에 바로 내려받아져요.{' '}
        <Link href="/login?next=/gallery">들어가기</Link>
      </p>
    );
  }
  return (
    <>
      <p className="muted">
        걷다가 F2(휴대폰은 위 줄의 사진기 단추)로 찍은 사진이에요. 나만 볼 수 있고, 60장까지 담겨요.{' '}
        <Link href="/walk">걷기로 돌아가기</Link>
      </p>
      <GalleryClient />
    </>
  );
}
