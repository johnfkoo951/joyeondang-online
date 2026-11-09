import { NextResponse, type NextRequest } from 'next/server';
import { FLASH_COOKIE, INVITE_COOKIE } from '@/lib/cookie-names';
import { safeNext } from '@/lib/origin';
import { createClient } from '@/lib/supabase/server';

// 구글에서 돌아오는 곳. 세션을 만들고, 명단과 맞춰 보고, 초대 코드가 있으면 그 줄에 묶는다.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const forwardedHost = request.headers.get('x-forwarded-host');
  const base = process.env.NODE_ENV === 'development' || !forwardedHost ? url.origin : `https://${forwardedHost}`;

  const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (oauthError || !code) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(oauthError ? 'oauth' : 'no_code')}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${base}/login?error=exchange`);

  let result = String((await supabase.rpc('sync_my_roster')).data ?? 'visitor');
  const invite = request.cookies.get(INVITE_COOKIE)?.value;
  if (invite) {
    const { data } = await supabase.rpc('claim_invite', { p_code: invite });
    if (typeof data === 'string') result = data === 'invalid' || data === 'taken' || data === 'already' ? `invite_${data}` : data;
  }

  const res = NextResponse.redirect(`${base}${next}`);
  res.cookies.delete(INVITE_COOKIE);
  res.cookies.set(FLASH_COOKIE, result.slice(0, 32), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60,
  });
  return res;
}
