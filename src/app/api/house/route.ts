import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { loadRealHouse } from '@/lib/house-world';
import { localPreview } from '@/lib/preview';
import { getViewer } from '@/lib/viewer';

// 실제 집 걷기 데이터. 명단에 있는 손님(로그인)에게만 준다. 그 밖에는 있는지조차 알리지 않게 404.
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

export async function GET() {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳혀 두면 손님에게도 404가 나간다)
  await connection();
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse') && !localPreview()) return new Response('Not found', HIDDEN);
  const world = loadRealHouse();
  if (!world) return new Response('Not found', HIDDEN);
  return Response.json(world, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
