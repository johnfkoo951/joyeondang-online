import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { signInWithGoogle } from '@/app/actions';
import { InAppBanner } from '@/components/InAppBanner';
import { SITE_URL, supabaseReady } from '@/lib/env';
import { detectInApp } from '@/lib/inapp';
import { safeNext } from '@/lib/origin';

export const metadata: Metadata = { title: '들어가기' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ERROR_WORD: Record<string, string> = {
  oauth: '구글에서 돌아오지 못했어요. 다시 눌러 주세요.',
  exchange: '로그인을 마치지 못했어요. 같은 브라우저에서 다시 눌러 주세요.',
  no_code: '로그인을 마치지 못했어요. 다시 눌러 주세요.',
  not_ready: '로그인은 곧 열려요.',
};

export default function LoginPage({ searchParams }: Props) {
  return (
    <div className="wrap stack">
      <h1>들어가기</h1>
      <p className="lead">
        초대 명단에 계신 분은 구글 계정으로 들어와 이름표를 달고 쪽지를 남겨요. 구경만 하실 거면 로그인 없이 둘러보세요.
      </p>
      <Suspense fallback={<p className="muted">확인하는 중이에요</p>}>
        <LoginBody searchParams={searchParams} />
      </Suspense>
      <p className="small muted">
        구글 계정에서는 이메일 주소만 명단과 맞춰 보는 데 써요. 연락처, 사진, 위치는 받지 않아요.{' '}
        <Link href="/privacy">자세히</Link>
      </p>
    </div>
  );
}

async function LoginBody({ searchParams }: Props) {
  const sp = await searchParams;
  const ua = (await headers()).get('user-agent') ?? '';
  const next = safeNext(typeof sp.next === 'string' ? sp.next : undefined);
  const error = typeof sp.error === 'string' ? ERROR_WORD[sp.error] : undefined;
  const kind = detectInApp(ua);
  if (kind) {
    const href = `${SITE_URL}/login?next=${encodeURIComponent(next)}`;
    return <InAppBanner kind={kind} href={href} ua={ua} />;
  }
  if (!supabaseReady()) return <p className="note-box">로그인은 곧 열려요. 지금은 둘러보기만 할 수 있어요.</p>;
  return (
    <form action={signInWithGoogle} className="stack">
      <input type="hidden" name="next" value={next} />
      {error ? <p className="warn" role="alert">{error}</p> : null}
      <button className="btn btn-roof">Google 계정으로 들어가기</button>
    </form>
  );
}
