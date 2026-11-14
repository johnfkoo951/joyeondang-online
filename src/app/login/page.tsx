/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { signInWithGoogle } from '@/app/actions';
import { InAppBanner } from '@/components/InAppBanner';
import { LoginInviteField } from '@/components/JoinForms';
import { LangRegion } from '@/components/LangAttrs';
import { T } from '@/components/i18n/T';
import { AppLoginHint } from '@/components/pwa/AppLoginHint';
import { ROLE_LABEL, ROLE_LABEL_EN } from '@/lib/access';
import { SITE_URL, supabaseReady } from '@/lib/env';
import { detectInApp } from '@/lib/inapp';
import { LOGIN_ERROR_EN } from '@/lib/messages-en';
import { nameLang } from '@/lib/name-lang';
import { safeNext } from '@/lib/origin';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '로그인 · 들어가기' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// 주소의 error 값으로 보이는 말. 영어는 lib/messages-en의 LOGIN_ERROR_EN(같은 열쇠)
const ERROR_WORD: Record<string, string> = {
  oauth: '구글에서 돌아오지 못했어요. 다시 눌러 주세요.',
  exchange: '로그인을 마치지 못했어요. 같은 브라우저에서 다시 눌러 주세요.',
  no_code: '로그인을 마치지 못했어요. 다시 눌러 주세요.',
  not_ready: '로그인은 곧 열려요.',
  busy: '들어오는 분이 한꺼번에 몰려 잠깐 막혔어요. 10초쯤 뒤에 다시 눌러 주세요.',
};

export default function LoginPage({ searchParams }: Props) {
  return (
    <div className="wrap stack">
      <div className="login-poster-card">
        <img src="/web/collage/collage-house-poster-v2.webp" alt="" className="login-poster-art" />
        <div className="stack">
          <p className="small muted" style={{ margin: 0, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            SIGN IN TO JOYEONDANG
          </p>
          <h1 style={{ margin: 0 }}><T ko="조연당 로그인" en="Sign in to Joyeondang" /></h1>
          <p className="lead" style={{ margin: 0 }}>
            <T
              ko="초대 명단에 계신 분은 Google 계정으로 로그인해 이름표를 달고, 방명록·쪽지와 정식 전각 도장을 남기실 수 있어요. 구경과 작은 놀이는 로그인 없이도 열려 있어요."
              en="If you are on the guest list, sign in with Google to wear a name tag and leave guestbook messages, notes and official carved stamps. Looking around and the mini games are open without signing in."
            />
          </p>
        </div>
      </div>

      {/* 아이폰 홈 화면 앱에서만: 구글 로그인 대신 코드로 이어 받기 */}
      <AppLoginHint />

      <Suspense fallback={<p className="muted"><T ko="계정 상태를 확인하는 중이에요" en="Checking your account" /></p>}>
        <LoginBody searchParams={searchParams} />
      </Suspense>

      <p className="small muted">
        <T
          ko="구글 계정에서는 이메일 주소로 명단을 맞춰 봐요. 행사 초대 코드로 들어오면 구글 계정 이름을 명단 이름으로 적어요. 연락처, 사진, 위치는 받지 않아요."
          en="With a Google account, we match you with the guest list by your email address. If you come in with an event invite code, we write your Google account name on the guest list as your name. We don't take contacts, photos or location."
        />{' '}
        <Link href="/privacy"><T ko="개인정보 안내" en="Privacy" /></Link>
      </p>
    </div>
  );
}

async function LoginBody({ searchParams }: Props) {
  const [sp, ua, viewer] = await Promise.all([
    searchParams,
    headers().then((h) => h.get('user-agent') ?? ''),
    getViewer(),
  ]);
  const next = safeNext(typeof sp.next === 'string' ? sp.next : undefined);
  const error = typeof sp.error === 'string' ? ERROR_WORD[sp.error] : undefined;
  const errorEn = typeof sp.error === 'string' ? LOGIN_ERROR_EN[sp.error] : undefined;

  if (viewer.signedIn) {
    return (
      <LangRegion as="section" className="card stack" label={['현재 로그인된 계정', 'Signed-in account']}>
        <p style={{ margin: 0 }}>
          <T
            ko={<>지금 <strong>{viewer.name ?? '손님'}</strong> 님({ROLE_LABEL[viewer.role]})으로 로그인되어 있어요.</>}
            en={<>You&apos;re signed in as <strong lang={nameLang(viewer.name)}>{viewer.name ?? 'Guest'}</strong> ({ROLE_LABEL_EN[viewer.role]}).</>}
          />
        </p>
        <div className="btn-row">
          <Link className="btn btn-roof" href={next !== '/' ? next : '/notebook'}>
            {next !== '/' ? <T ko="보던 화면으로 이어 가기" en="Back to where you were" /> : <T ko="내 수첩 열기" en="Open my notebook" />}
          </Link>
          <Link className="btn" href="/walk"><T ko="집 안 걷기" en="Walk the house" /></Link>
          {viewer.role === 'admin' ? <Link className="btn btn-pine" href="/admin"><T ko="관리실 열기" en="Open admin" /></Link> : null}
          <form action="/auth/signout" method="post" className="inline-form">
            <button type="submit" className="btn"><T ko="로그아웃" en="Sign out" /></button>
          </form>
        </div>
      </LangRegion>
    );
  }

  const kind = detectInApp(ua);
  if (kind) {
    const href = `${SITE_URL}/login?next=${encodeURIComponent(next)}`;
    return <InAppBanner kind={kind} href={href} ua={ua} />;
  }
  if (!supabaseReady()) {
    return (
      <div className="card stack">
        <p className="note-box" style={{ margin: 0 }}>
          <T
            ko="로그인 서버 연결을 준비 중이에요. 지금은 로그인 없이 집 안 걷기와 도장 투어, 작은 놀이를 즐기실 수 있어요."
            en="We're still connecting the sign-in server. For now you can walk the house, do the stamp tour and play the mini games without signing in."
          />
        </p>
        <div className="btn-row">
          <Link className="btn btn-roof" href="/walk"><T ko="집 안 걷기" en="Walk the house" /></Link>
          <Link className="btn" href="/map"><T ko="도장 투어 맵" en="Stamp tour map" /></Link>
        </div>
      </div>
    );
  }
  return (
    <form action={signInWithGoogle} className="card stack">
      <input type="hidden" name="next" value={next} />
      {error ? <p className="warn" role="alert" style={{ margin: 0 }}><T ko={error} en={errorEn ?? <span lang="ko">{error}</span>} /></p> : null}
      {/* 초대 코드 칸: 자리 글(placeholder)이 화면 말을 따르도록 화면 쪽 조각으로 그린다 */}
      <LoginInviteField />
      <div className="btn-row">
        <button type="submit" className="btn btn-roof login-google-btn">
          <GoogleMark />
          <T ko={<span>Google 계정으로 로그인</span>} en={<span>Sign in with Google</span>} />
        </button>
        <Link className="btn" href="/"><T ko="로그인 없이 둘러보기" en="Look around without signing in" /></Link>
      </div>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.6 12.23c0-.72-.06-1.4-.19-2.06H12v3.9h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z" fill="currentColor" opacity="0.95" />
      <path d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A9.99 9.99 0 0 0 12 22Z" fill="currentColor" opacity="0.8" />
      <path d="M6.4 13.93a6.02 6.02 0 0 1 0-3.86V7.49H3.07a9.99 9.99 0 0 0 0 9.02l3.33-2.58Z" fill="currentColor" opacity="0.65" />
      <path d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2A9.99 9.99 0 0 0 3.07 7.49l3.33 2.58C7.19 7.71 9.4 5.95 12 5.95Z" fill="currentColor" opacity="0.88" />
    </svg>
  );
}
