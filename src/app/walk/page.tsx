import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { T } from '@/components/i18n/T';
import { WalkClient } from '@/components/WalkClient';
import { WalkLoading } from '@/components/walk/WalkLoading';
import { dollCss } from '@/content/dolls';
import { ROLE_LABEL, canUse } from '@/lib/access';
import { shellConfigured } from '@/lib/house-shell';
import { canOpenShell } from '@/lib/house-shell-gate';
import { loadMyLook } from '@/lib/look-server';
import { getDoorStates, getLantern } from '@/lib/public-data';
import { previewForRequest } from '@/lib/preview-request';
import { getViewer } from '@/lib/viewer';
import { skyOf } from '@/walk/sky';

export const metadata: Metadata = { title: '집 안 걷기' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function WalkPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<div className="walk-root"><WalkLoading /></div>}>
      <WalkLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function WalkLoader({ searchParams }: Props) {
  // 손님이면 실제 집을 받게 되므로 요청마다 사람을 확인한다
  await connection();
  const [viewer, doors, lantern] = await Promise.all([getViewer(), getDoorStates(), getLantern()]);
  // 실측 1층 시험 지도 고르기: 데이터가 설정돼 있고, 목록에 있는 관리자(또는 이 컴퓨터 미리보기)일 때만
  const shellMap = shellConfigured() && (await canOpenShell(viewer.role));
  if (!canUse(viewer.role, 'walk')) {
    // 링크로 받은 하늘(?sky=)은 로그인을 다녀와도 남게 돌아올 주소에 싣는다
    const sp = await searchParams;
    const want = skyOf(typeof sp.sky === 'string' ? sp.sky : undefined);
    const back = want === 'day' ? '/walk' : `/walk?sky=${want}`;
    return (
      <div className="wrap stack">
        <h1><T ko="집 안 걷기" en="Walk the house" /></h1>
        <p className="note-box">
          <T ko="초대받은 분께 열려 있어요." en="This is open to invited guests." />{' '}
          <Link href={`/login?next=${encodeURIComponent(back)}`}><T ko="들어가기" en="Enter" /></Link>
        </p>
      </div>
    );
  }
  // 손님 이상(또는 이 맥의 로컬 미리보기)이면 실제 집·함께 걷기·가족 방 이름표를 받아 본다. 서버 쪽이 한 번 더 확인한다.
  const guest = canUse(viewer.role, 'realHouse') || (await previewForRequest());
  // 내 캐릭터 겉모습(프로필에 저장한 것, 없으면 인형 색으로 만든 기본 인형)
  const look = await loadMyLook(viewer);
  return (
    <WalkClient
      doors={doors}
      name={viewer.name ?? ROLE_LABEL[viewer.role]}
      nickname={viewer.name ?? '손님'}
      role={viewer.role}
      dollColor={dollCss(viewer.dollColor)}
      lantern={lantern}
      canStamp={canUse(viewer.role, 'stamps')}
      realHouse={guest}
      together={guest}
      look={look}
      signedIn={viewer.signedIn}
      shellMap={shellMap}
      // 사이트 하늘(시간과 날씨): 환경 변수 WALK_SKY. 바꾸면 다시 배포해야 모두에게 보인다
      sky={skyOf(process.env.WALK_SKY)}
      // 밤하늘 안내의 첫 문장 대신 쓰는 집주인의 한 줄(WALK_SKY_NOTE, 80자까지, 그림 글자를 반으로 자르지 않게 글자 단위로).
      // 글은 저장소가 아니라 서버 설정에만 두고, 가족 이름이 들어갈 수 있어 손님에게만 넘긴다(로그인 전 방문자의 페이지에는 싣지 않는다)
      skyNote={guest ? Array.from(process.env.WALK_SKY_NOTE?.trim() ?? '').slice(0, 80).join('') || undefined : undefined}
    />
  );
}
