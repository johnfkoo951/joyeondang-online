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

export const metadata: Metadata = { title: '집 안 걷기' };

export default function WalkPage() {
  return (
    <Suspense fallback={<div className="walk-root"><WalkLoading /></div>}>
      <WalkLoader />
    </Suspense>
  );
}

async function WalkLoader() {
  // 손님이면 실제 집을 받게 되므로 요청마다 사람을 확인한다
  await connection();
  const [viewer, doors, lantern] = await Promise.all([getViewer(), getDoorStates(), getLantern()]);
  // 실측 1층 시험 지도 고르기: 데이터가 설정돼 있고, 목록에 있는 관리자(또는 이 컴퓨터 미리보기)일 때만
  const shellMap = shellConfigured() && (await canOpenShell(viewer.role));
  if (!canUse(viewer.role, 'walk')) {
    return (
      <div className="wrap stack">
        <h1><T ko="집 안 걷기" en="Walk the house" /></h1>
        <p className="note-box">
          <T ko="초대받은 분께 열려 있어요." en="This is open to invited guests." />{' '}
          <Link href="/login?next=/walk"><T ko="들어가기" en="Enter" /></Link>
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
    />
  );
}
