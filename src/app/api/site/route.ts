import { connection } from 'next/server';
import { supabaseReady } from '@/lib/env';
import { shortMemo } from '@/lib/short-memo';
import { createAnonClient } from '@/lib/supabase/server';

// 사이트 전체 상태(조용 모드, 박수 수). 누구에게나 같은 답이라 CDN이 5초 동안 나눠 준다.
// 함수가 아직 없거나(마이그레이션 전) DB가 답하지 않으면 「조용하지 않음」으로 답한다.
const HEADERS = { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10', 'X-Robots-Tag': 'noindex' };
const CALM = { quiet: false, until: null, claps: 0 };
type SiteNow = { quiet: boolean; until: string | null; claps: number };

// 주소 뒤에 아무 쿼리나 붙이면 CDN 캐시를 비켜 간다. 그래도 요청마다 DB에 가지 않게 서버 안에서도 5초 기억한다
// (성공한 답만. 못 읽은 답은 기억하지 않아 다음 요청이 다시 묻는다).
const siteNow = shortMemo<SiteNow>(5000, async () => {
  const { data, error } = await createAnonClient().rpc('site_now');
  if (error || !data || typeof data !== 'object') return null;
  const d = data as { quiet?: unknown; until?: unknown; claps?: unknown };
  return {
    quiet: d.quiet === true,
    until: typeof d.until === 'string' ? d.until : null,
    claps: typeof d.claps === 'number' ? d.claps : 0,
  };
});

export async function GET() {
  await connection();
  if (!supabaseReady()) return Response.json(CALM, { headers: HEADERS });
  try {
    return Response.json((await siteNow()) ?? CALM, { headers: HEADERS });
  } catch {
    return Response.json(CALM, { headers: HEADERS });
  }
}
