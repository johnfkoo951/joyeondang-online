import { connection } from 'next/server';
import { adminHidden, adminSession, serveAdminFile } from '@/lib/avatar/admin-server';
import { isUuid } from '@/lib/avatar/rules';

// 집주인용 3D 모형(0024, 캐릭터 관리 콘솔의 「3D 보기」).
//   GET /api/admin/characters/<id>/model?v=<판>
// 지금 걷기에 보이는 모형(다 된 것, 또는 다시 만드는 동안의 이전 모형)을 준다. 집주인인지 서버가 보고, 경로와 판은
// DB(admin_character_file, is_admin()을 먼저 본다)가 준다. 파일은 비밀 키로 읽는다. 판이 붙어 있어 오래 캐시한다.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return adminHidden();
  const gate = await adminSession();
  if (gate instanceof Response) return gate;
  return serveAdminFile(gate.supabase, request, id, 'model');
}
