import { headers } from 'next/headers';
import { Suspense } from 'react';
import { HomeInstallHint } from '@/components/pwa/HomeInstallHint';
import { FrontArt, LanternNote } from '@/components/home/FrontArt';
import { FrontDoor } from '@/components/home/FrontDoor';
import { FrontRest } from '@/components/home/FrontRest';
import { InAppInvite } from '@/components/home/InAppInvite';
import s from '@/components/home/home.module.css';
import { ROOMS } from '@/content/rooms';
import { canUse } from '@/lib/access';
import { SITE_URL } from '@/lib/env';
import { frontWho, openRooms } from '@/lib/front';
import { detectInApp } from '@/lib/inapp';
import { getDoorStates, getLantern } from '@/lib/public-data';
import { getViewer } from '@/lib/viewer';

// 첫 화면. 손님 대부분이 휴대폰(카카오톡 안 브라우저 포함)으로 처음 여는 곳이라, 표지 바로 아래에 집 안 걷기를 둔다.
// 표지와 석등 숫자는 누구에게나 같아 캐시된 껍데기에 들고, 사람마다 다른 들머리와 그 아래 차례만 요청마다 그린다.
// 손님 이름은 그 사람 화면의 인사에만 쓴다(다른 손님의 이름이나 수는 첫 화면에 내지 않는다).
// front-page: 휴대폰 머리줄의 메뉴 줄을 이 화면에서만 접는 표시(globals.css). 메뉴 넷은 바로 아래 단추와 둘러볼 곳에 그대로 있다.
export default function Home() {
  return (
    <div className={`wrap-wide front-page ${s.home}`}>
      <FrontArt>
        <Suspense fallback={<LanternNote lantern={null} />}>
          <LanternNow />
        </Suspense>
      </FrontArt>
      <Suspense fallback={<FrontDoor who={null} />}>
        <DoorNow />
      </Suspense>
      {/* 휴대폰에서만: 홈 화면에 두기 권유(닫으면 이 기기에서 다시 안 보인다) */}
      <HomeInstallHint />
      <Suspense fallback={<FrontRest who={null} open={null} />}>
        <RestNow />
      </Suspense>
    </div>
  );
}

async function LanternNow() {
  return <LanternNote lantern={await getLantern()} />;
}

/** 지금 보는 사람의 갈래(쿠키를 읽으므로 Suspense 안에서만) */
async function whoNow() {
  const viewer = await getViewer();
  return frontWho({
    signedIn: viewer.signedIn,
    guest: canUse(viewer.role, 'stamps'),
    name: viewer.name,
    pending: viewer.pendingRequest,
  });
}

// 카카오톡 같은 앱 안에서는 구글 로그인이 막힌다: 로그인 전 손님에게 초대 줄 대신 바깥 브라우저로 여는 한 줄을 보인다.
async function DoorNow() {
  const [who, ua] = await Promise.all([whoNow(), headers().then((h) => h.get('user-agent') ?? '')]);
  const kind = who.kind === 'public' ? detectInApp(ua) : null;
  return <FrontDoor who={who} inApp={kind ? <InAppInvite kind={kind} href={`${SITE_URL}/login`} ua={ua} /> : undefined} />;
}

// 둘러볼 곳과 이렇게 놀아요(갈래마다 차례가 다르다). 열린 방 수는 DB 문패를 읽었을 때만 보인다
// (못 읽었으면 기본값을 세어 「지금」처럼 말하지 않는다).
async function RestNow() {
  const [who, doors] = await Promise.all([whoNow(), getDoorStates()]);
  return <FrontRest who={who.kind} open={Object.keys(doors).length ? openRooms(ROOMS, doors) : null} />;
}
