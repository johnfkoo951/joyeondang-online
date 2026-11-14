import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { stagedHouse } from '@/lib/house-staged';
import { previewForRequest } from '@/lib/preview-request';
import { getViewer } from '@/lib/viewer';

// 실제 집 걷기 데이터. 명단에 있는 손님(로그인)에게만 준다. 그 밖에는 있는지조차 알리지 않게 404.
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

export async function GET() {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳혀 두면 손님에게도 404가 나간다)
  await connection();
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse') && !(await previewForRequest())) return new Response('Not found', HIDDEN);
  // 실제 배치를 걷기 좋게 넓히고 꾸민 세계를 준다(src/walk/staging.ts, 서버 프로세스마다 한 번 손질해 둔다).
  // 꾸밈은 WALK_THEME(기본 결혼식), 부엌 사진 갤러리 액자는 KITCHEN_GALLERY(1일 때만 건다)
  const world = stagedHouse();
  if (!world) return new Response('Not found', HIDDEN);
  return Response.json(world, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
