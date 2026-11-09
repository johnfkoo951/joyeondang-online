// 공개해도 되는 값만 여기서 읽는다. 비밀 키(SUPABASE_SECRET_KEY)는 이 파일에 두지 않는다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://joyeondang.cmdspace.work';
/** 정식으로 문을 열기 전까지 검색엔진 색인을 막는다 */
export const LAUNCHED = process.env.NEXT_PUBLIC_LAUNCHED === '1';

export function supabaseReady(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}
