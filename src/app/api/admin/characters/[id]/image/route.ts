import { connection } from 'next/server';
import { adminHidden, adminSession, serveAdminFile } from '@/lib/avatar/admin-server';
import { isUuid } from '@/lib/avatar/rules';

// 집주인용 캐릭터 그림(0024).
//   GET /api/admin/characters/<id>/image?v=<그린 차례>[&s=s]   s=s: 작은 그림(WebP), 없으면 그린 그림(PNG) 그대로
// 집주인인지 서버가 보고, 경로는 DB(admin_character_file, is_admin()을 먼저 본다)가 그 캐릭터의 줄에서 지어 준다(부르는 쪽은 id만).
// 파일은 비밀 키로 읽는다. 다시 그리면 판(v)이 바뀌어 새 그림을 받는다. 원본 사진을 내보내는 길은 없다.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return adminHidden();
  const gate = await adminSession();
  if (gate instanceof Response) return gate;
  return serveAdminFile(gate.supabase, request, id, 'char');
}
