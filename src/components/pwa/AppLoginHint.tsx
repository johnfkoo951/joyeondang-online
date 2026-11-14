'use client';
import Link from 'next/link';
import { T } from '@/components/i18n/T';
import { useIOSStandalone } from './pwa-store';

// 로그인 화면 위에 붙는 안내(아이폰·아이패드 홈 화면 앱에서만). 그 앱은 사파리와 저장소가 따로라,
// 구글 로그인이 사파리 쪽에서 끝나고 앱은 그대로 남는다. 사파리에서 코드를 받아 넣는 길로 보낸다.
export function AppLoginHint() {
  const iosApp = useIOSStandalone();
  if (!iosApp) return null;
  return (
    <section className="note-box stack" aria-label="App sign-in" style={{ margin: 0 }}>
      <p style={{ margin: 0 }}>
        <strong>
          <T ko="홈 화면 앱에서는 코드로 로그인해요." en="In the home-screen app, sign in with a code." />
        </strong>{' '}
        <T
          ko="여기서 구글 로그인을 누르면 사파리에서 끝나고 이 앱은 그대로예요. 사파리에서 로그인해 여섯 글자 코드를 받아 여기에 넣어 주세요."
          en="Google sign-in here finishes in Safari, not in this app. Sign in on Safari, get a six-character code, and enter it here."
        />
      </p>
      <div className="btn-row">
        <Link className="btn btn-roof" href="/app-link">
          <T ko="코드로 로그인" en="Sign in with a code" />
        </Link>
      </div>
    </section>
  );
}
