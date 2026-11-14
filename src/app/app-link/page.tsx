import type { Metadata } from 'next';
import { Suspense } from 'react';
import { T } from '@/components/i18n/T';
import { getViewer } from '@/lib/viewer';
import { AppLinkClient } from './AppLinkClient';

// 앱 로그인(홈 화면 앱 ↔ 사파리). 사파리에서 로그인한 사람은 여기서 여섯 글자 코드를 받고,
// 홈 화면 앱(로그인 안 된 쪽)은 여기서 그 코드를 넣는다. 한 화면이 보는 쪽에 따라 바뀐다.
export const metadata: Metadata = { title: '앱 로그인', robots: { index: false, follow: false } };

export default function AppLinkPage() {
  return (
    <div className="wrap stack">
      <h1 style={{ margin: 0 }}>
        <T ko="앱 로그인" en="App sign-in" />
      </h1>
      <Suspense
        fallback={
          <p className="muted">
            <T ko="계정 상태를 확인하는 중이에요" en="Checking your account…" />
          </p>
        }
      >
        <AppLinkBody />
      </Suspense>
    </div>
  );
}

async function AppLinkBody() {
  const viewer = await getViewer();
  return <AppLinkClient signedIn={viewer.signedIn} name={viewer.name ?? null} />;
}
