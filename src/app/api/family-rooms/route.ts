import { connection } from 'next/server';
import { canUse } from '@/lib/access';
import { loadFamilyRooms } from '@/lib/family-rooms';
import { previewForRequest } from '@/lib/preview-request';
import { getViewer } from '@/lib/viewer';

// 가족 방 이름표. 명단에 있는 손님(로그인)에게만 준다. 그 밖에는 있는지조차 알리지 않게 404(/api/house와 같은 틀).
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

export async function GET() {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳혀 두지 않게)
  await connection();
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'realHouse') && !(await previewForRequest())) return new Response('Not found', HIDDEN);
  return Response.json({ rooms: loadFamilyRooms() }, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
