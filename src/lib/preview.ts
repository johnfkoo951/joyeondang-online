// 이 컴퓨터에서만 실제 집을 미리 걸어 보는 스위치. 로그인(명단 매칭)이 열리기 전 검사용이다.
// 켜면 로그인 없이 손님 전용 데이터(실제 집, 가족 방 이름표)가 나가므로 두 겹으로 막는다.
// 1) 알려진 호스팅 환경(아래 목록)에서는 어떤 값을 넣어도 켜지지 않는다.
// 2) 서버를 이 컴퓨터 주소 127.0.0.1에만 묶어 띄웠을 때만 켜진다(`npm run preview:local` = next start -H 127.0.0.1).
//    그냥 `next start`는 모든 주소에 열려 같은 와이파이의 다른 기기도 받을 수 있으므로, 그렇게 띄우면 스위치가 꺼진 채다.
//    묶인 주소는 Next가 서버를 띄우며 적어 두는 값(__NEXT_PRIVATE_ORIGIN)에서 읽는다. 그 값이 없으면(읽을 수 없으면) 끈다.
//    IPv6의 ::1은 받지 않는다: Next는 모든 IPv6 주소에 묶은 서버(-H ::)도 그 값을 [::1]로 적어, 둘을 가릴 수 없다.
const HOSTED = ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'CF_PAGES', 'NETLIFY', 'AWS_LAMBDA_FUNCTION_NAME', 'K_SERVICE', 'RENDER', 'FLY_APP_NAME'];

/** 서버가 이 컴퓨터 주소(127.0.0.1)에만 묶여 있는가 */
function loopbackOnly(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

let warned = false;

export function localPreview(env: Record<string, string | undefined> = process.env): boolean {
  if (env.JY_LOCAL_PREVIEW !== '1' || env.NODE_ENV === 'test' || HOSTED.some((k) => env[k])) return false;
  if (loopbackOnly(env.__NEXT_PRIVATE_ORIGIN)) return true;
  if (!warned) {
    warned = true;
    console.warn('[preview] JY_LOCAL_PREVIEW는 서버를 -H 127.0.0.1로 띄웠을 때만 켜져요(npm run preview:local). 지금은 꺼진 채예요.');
  }
  return false;
}

/**
 * 미리보기는 요청 주소(Host)도 이 컴퓨터일 때만: 다른 사이트가 DNS 재바인딩으로 127.0.0.1의 미리보기 서버를 부르면
 * Host가 그 사이트 이름으로 오므로 막힌다
 */
export function loopbackHost(host: string | null | undefined): boolean {
  return typeof host === 'string' && /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/i.test(host.trim());
}
