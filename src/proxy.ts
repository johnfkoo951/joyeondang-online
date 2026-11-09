import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Next 16 Proxy(구 Middleware). 하는 일은 하나: 만료가 가까운 Supabase 세션을 새로 고친다.
// 권한 판정은 여기서 하지 않는다(서버 컴포넌트와 DB 정책이 한다).
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // 세션 쿠키가 없는 구경꾼은 Supabase 왕복을 건너뛴다.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
  if (!url || !key || !hasSession) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  // createServerClient 바로 다음에 부른다. 사이에 다른 일을 끼우지 않는다(공식 예제 규칙).
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|art/|exhibit-media/|icon|apple-icon|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
};
