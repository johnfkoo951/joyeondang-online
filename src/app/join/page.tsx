import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { signInWithGoogle } from '@/app/actions';
import { ClaimForm } from '@/components/JoinForms';
import { InAppBanner } from '@/components/InAppBanner';
import { normalizeCode } from '@/lib/code';
import { SITE_URL, supabaseReady } from '@/lib/env';
import { detectInApp } from '@/lib/inapp';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '초대장 열기' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// 카톡으로 받은 초대 링크(/join?c=XXXX-XXXX-XXXX)가 닿는 곳.
// 코드는 주소에 실려 있어서 Safari·Chrome으로 옮겨 열어도 그대로 따라간다.
export default function JoinPage({ searchParams }: Props) {
  return (
    <div className="wrap stack">
      <h1>초대장 열기</h1>
      <Suspense fallback={<p className="muted">초대장을 펼치는 중이에요</p>}>
        <JoinBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function JoinBody({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = typeof sp.c === 'string' ? sp.c : '';
  const code = normalizeCode(raw).slice(0, 24);
  const ua = (await headers()).get('user-agent') ?? '';
  const kind = detectInApp(ua);
  const viewer = await getViewer();

  if (!code) {
    return (
      <p className="lead">
        초대 링크를 다시 눌러 주세요. 코드만 받으셨다면 <Link href="/notebook">수첩</Link>에서 넣을 수 있어요.
      </p>
    );
  }
  if (!supabaseReady()) return <p className="note-box">들어가는 문은 곧 열려요. 그동안 <Link href="/map">집을 둘러보세요</Link>.</p>;
  if (viewer.signedIn) {
    return (
      <div className="stack">
        <p className="lead">구글 계정으로 들어와 계세요. 이 초대장을 지금 계정에 이을게요.</p>
        <ClaimForm initialCode={code} />
      </div>
    );
  }
  if (kind) {
    return <InAppBanner kind={kind} href={`${SITE_URL}/join?c=${encodeURIComponent(code)}`} ua={ua} />;
  }
  return (
    <form action={signInWithGoogle} className="stack">
      <p className="lead">초대해 주셔서 고마워요. 구글 계정으로 들어오면 이 초대장이 그 계정과 이어져요.</p>
      <input type="hidden" name="invite" value={code} />
      <input type="hidden" name="next" value="/notebook" />
      <button className="btn btn-roof">Google 계정으로 들어가기</button>
      <p className="small muted">초대장 하나는 한 사람의 계정 하나와 이어져요. 가족 여러 분이 오시면 각자 받은 링크로 들어와 주세요.</p>
    </form>
  );
}
