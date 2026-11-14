import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { NO_DOOR_PATH, missingDoor } from '@/lib/known-path';

// Next 16 Proxy(구 Middleware). 하는 일은 둘: 만료가 가까운 Supabase 세션을 새로 고치고,
// 없는 방·전시 이름은 쪽이 그려지기 전에 404로 돌린다(쪽 본문이 Suspense 안에서 주소를 읽어, 여기서 거르지 않으면 200이 된다).
// 권한 판정은 여기서 하지 않는다(서버 컴포넌트와 DB 정책이 한다).
export async function proxy(request: NextRequest) {
  if (missingDoor(request.nextUrl.pathname)) return NextResponse.rewrite(new URL(NO_DOOR_PATH, request.url));
  // The sub-application owns its authentication and /shuttle-scoped cookie.
  if (request.nextUrl.pathname === '/shuttle' || request.nextUrl.pathname.startsWith('/shuttle/')) {
    const headers = new Headers(request.headers);
    headers.delete('cookie');
    const shuttle = request.cookies.get('shuttle_session');
    if (shuttle) headers.set('cookie', `shuttle_session=${encodeURIComponent(shuttle.value)}`);
    return NextResponse.next({ request: { headers } });
  }
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

// /api/site는 누구에게나 같은 답을 CDN이 잠깐 나눠 주므로 세션 쿠키를 건드리지 않게 뺀다.
// 정적 파일(그림·글꼴·3D 모형 glb)은 세션을 새로 고칠 일이 없어 거치지 않는다.
// 방·전시 주소는 이름이 그림 확장자로 끝나도 거친다(첫 규칙의 확장자 제외에만 맡기면 그런 없는 이름이 200으로 나간다).
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|art/|exhibit-media/|api/site|icon|apple-icon|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|glb)$).*)',
    '/room/:path*',
    '/exhibit/:path*',
    '/games/:path*',
    '/play/:path*',
  ],
};
