import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { previewForRequest } from '@/lib/preview-request';
import { getViewer } from '@/lib/viewer';
import { loadWhoDeck } from '@/lib/who-deck';

// 「누구의 문장일까」 카드 묶음. 명단에 있는 손님(로그인)에게만 준다. 그 밖에는 있는지조차 알리지 않게 404(/api/family-rooms와 같은 틀).
// 환경 변수가 없거나 깨졌어도 404: 놀이는 지어낸 연습판으로 논다.
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

export async function GET() {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳혀 두지 않게)
  await connection();
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse') && !(await previewForRequest())) return new Response('Not found', HIDDEN);
  const deck = loadWhoDeck();
  if (!deck) return new Response('Not found', HIDDEN);
  return Response.json({ deck }, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
