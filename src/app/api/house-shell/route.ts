import { connection } from 'next/server';
import { shellHouse } from '@/lib/house-shell';
import { canOpenShell } from '@/lib/house-shell-gate';
import { getViewer } from '@/lib/viewer';

// 실측 1층 시험 지도(벽·문·창·방만 지은 가벼운 걷기 세계). 열 수 있는 계정 목록(HOUSE_SHELL_USERS)에 있는 관리자에게만, 또는 이 컴퓨터 미리보기에서만 준다.
// 그 밖에는 /api/house와 같이 있는지조차 알리지 않게 404. 줄자·스캔·확인 대기 글은 담지 않는다(lib/shell-world.ts).
const HIDDEN = { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } };

export async function GET() {
  // 매 요청마다 누가 묻는지 확인한다(빌드 때 응답을 굳혀 두면 관리자에게도 404가 나간다)
  await connection();
  const viewer = await getViewer();
  if (!(await canOpenShell(viewer.role))) return new Response('Not found', HIDDEN);
  const world = await shellHouse();
  if (!world) return new Response('Not found', HIDDEN);
  return Response.json(world, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
