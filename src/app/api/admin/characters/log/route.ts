import { connection } from 'next/server';
import { noFunction } from '@/lib/avatar/assets';
import { logWire, readLogRows } from '@/lib/avatar/admin-rules';
import { adminJson, adminSession } from '@/lib/avatar/admin-server';
import { isUuid } from '@/lib/avatar/rules';

// 캐릭터 관리 콘솔의 조작 기록(집주인만, 0024): 누가, 언제, 어느 캐릭터, 주인, 무엇을, 동의 근거.
//   GET /api/admin/characters/log?limit=50&id=<캐릭터 id>   → {ok, rows: [...]}
// 기록 표는 집주인도 직접 읽지 못한다. DB의 admin_avatar_log가 is_admin()을 먼저 보고 준다.
export async function GET(request: Request) {
  await connection();
  const gate = await adminSession();
  if (gate instanceof Response) return gate;
  const sp = new URL(request.url).searchParams;
  const n = Number.parseInt(sp.get('limit') ?? '', 10);
  const id = sp.get('id');
  const { data, error } = await gate.supabase.rpc('admin_avatar_log', {
    p_limit: Number.isInteger(n) && n >= 1 && n <= 200 ? n : 50,
    p_avatar: isUuid(id) ? id : null,
  });
  if (error) return adminJson({ ok: false, reason: noFunction(error) ? 'db_old' : 'error' }, 503);
  // 화면은 DB 모양을 같은 readLogRows로 읽는다(logWire)
  return adminJson({ ok: true, rows: readLogRows(data).map(logWire) });
}
