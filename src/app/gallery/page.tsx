import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { DocTitle } from '@/components/DocTitle';
import { HouseLookbook } from '@/components/gallery/HouseLookbook';
import { T } from '@/components/i18n/T';
import { SHOTS_PRIVACY_LINE_EN } from '@/lib/page-words';
import { SHOTS_PRIVACY_LINE } from '@/lib/shots-pick';
import { getViewer } from '@/lib/viewer';
import { GalleryClient } from './GalleryClient';

export const metadata: Metadata = { title: '갤러리 · 사진첩', robots: { index: false } };

// 내 갤러리(본인 스냅숏) + 누구나 볼 수 있는 조연당 그림 화보
export default function GalleryPage() {
  return (
    <div className="wrap-wide stack">
      <DocTitle en="Gallery · Photo album" />
      <div className="page-intro">
        <div className="page-intro-text">
          <h1><T ko="갤러리와 사진첩" en="Gallery and photo album" /></h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            <T
              ko="조연당 구석구석을 그린 공간 화보와, 집 안을 3D로 걸으며 찍은 나만의 스냅숏 보관함을 함께 모았어요."
              en="A lookbook of pictures of every corner of Joyeondang, together with your own box of snapshots from walking the house in 3D."
            />
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-roof" href="/walk"><T ko="3D 걷기에서 사진 찍기" en="Take photos on a 3D walk" /></Link>
          <Link className="btn" href="/avatar"><T ko="내 캐릭터 꾸미기" en="Dress up my character" /></Link>
        </div>
      </div>

      <Suspense
        fallback={
          <>
            <HouseLookbook />
            <p className="muted"><T ko="내 사진 보관함을 확인하는 중이에요" en="Checking your photo box" /></p>
          </>
        }
      >
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
      <>
        <HouseLookbook />
        <section className="card stack" aria-labelledby="my-shots-head">
          <h2 id="my-shots-head" style={{ marginTop: 0 }}><T ko="내가 찍은 걷기 스냅숏 보관함" en="My walk snapshot box" /></h2>
          <p className="note-box" style={{ margin: 0 }}>
            <T
              ko="로그인하면 집 안을 걷다가 찍은 사진(60장까지 담겨요)이 이 보관함에 차곡차곡 모여요. 로그인하지 않고 찍은 사진은 그 기기에 바로 내려받아져요."
              en="Sign in, and the photos you take while walking the house (up to 60) pile up neatly in this box. Photos taken without signing in download straight to that device."
            />{' '}
            <T ko={SHOTS_PRIVACY_LINE} en={SHOTS_PRIVACY_LINE_EN} />{' '}
            <Link href="/login?next=/gallery"><T ko="들어가기" en="Sign in" /></Link>
          </p>
        </section>
      </>
    );
  }
  return (
    <>
      <section className="card stack" aria-labelledby="my-shots-head">
        <h2 id="my-shots-head" style={{ marginTop: 0 }}><T ko="내가 찍은 걷기 스냅숏" en="My walk snapshots" /></h2>
        <p className="muted" style={{ margin: 0 }}>
          <T
            ko="걷다가 F2(휴대폰은 위 줄의 사진기 단추)로 찍은 사진이에요. 60장까지 담겨요."
            en="Photos you took with F2 while walking (on a phone, the camera button in the top row). It holds up to 60."
          />{' '}
          <T ko={SHOTS_PRIVACY_LINE} en={SHOTS_PRIVACY_LINE_EN} />{' '}
          <Link href="/walk"><T ko="걷기로 돌아가기" en="Back to the walk" /></Link>
        </p>
        <GalleryClient />
      </section>
      <HouseLookbook />
    </>
  );
}
