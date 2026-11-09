// 이 맥에서만 실제 집을 미리 걸어 보는 스위치. 로그인(명단 매칭)이 열리기 전 검사용이다.
// Vercel에서는 VERCEL=1이 늘 붙으므로 배포된 사이트에서는 어떤 값을 넣어도 켜지지 않는다.
export function localPreview(env: Record<string, string | undefined> = process.env): boolean {
  return env.JY_LOCAL_PREVIEW === '1' && !env.VERCEL && env.NODE_ENV !== 'test';
}
