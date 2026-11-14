import { NextResponse, type NextRequest } from 'next/server';
import { FLASH_COOKIE, INVITE_COOKIE } from '@/lib/cookie-names';
import { claimAnyCode, flashKey } from '@/lib/event-code';
import { safeNext } from '@/lib/origin';
import { createClient } from '@/lib/supabase/server';

// 구글에서 돌아오는 곳. 세션을 만들고, 명단과 맞춰 보고, 초대 코드가 있으면 그 줄에 묶는다.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const forwardedHost = request.headers.get('x-forwarded-host');
  const base = process.env.NODE_ENV === 'development' || !forwardedHost ? url.origin : `https://${forwardedHost}`;

  // 실패하면 들어가기 화면으로 보내되 가려던 곳(next)을 함께 넘긴다: 다시 누르면 그 자리(행사 초대장 등)로 돌아온다.
  // 초대 코드 쿠키는 지우지 않아 다시 들어올 때 그대로 쓴다(15분).
  const retry = (why: string) => NextResponse.redirect(`${base}/login?error=${why}&next=${encodeURIComponent(next)}`);
  const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (oauthError || !code) {
    const busy = url.searchParams.get('error_code') === 'over_request_rate_limit' || /rate limit/i.test(oauthError ?? '');
    return retry(busy ? 'busy' : oauthError ? 'oauth' : 'no_code');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  // 429: 한꺼번에 많이 들어오면 Supabase 인증이 이 서버 주소의 요청을 잠깐 막는다(발표장에서 QR을 함께 찍을 때)
  if (error) return retry(error.status === 429 ? 'busy' : 'exchange');

  let result = String((await supabase.rpc('sync_my_roster')).data ?? 'visitor');
  const invite = request.cookies.get(INVITE_COOKIE)?.value;
  if (invite) {
    // 사람별 초대 링크를 먼저 보고, 아니면 행사 초대 코드(0018)로 받는다.
    // 코드를 확인하지 못했어도 이미 명단에 있는 사람(이메일로 이어짐)이면 그 결과를 그대로 보인다
    const outcome = await claimAnyCode((fn, args) => supabase.rpc(fn, args), invite);
    if (outcome !== 'error' || !['guest', 'family', 'admin'].includes(result)) result = flashKey(outcome);
  }

  const res = NextResponse.redirect(`${base}${next}`);
  res.cookies.delete(INVITE_COOKIE);
  res.cookies.set(FLASH_COOKIE, result.slice(0, 32), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60,
  });
  return res;
}
