import { connection } from 'next/server';
import { noFunction } from '@/lib/avatar/assets';
import { characterWire, readAdminQuery, readCharacterRows, readCounts } from '@/lib/avatar/admin-rules';
import { adminJson, adminSession } from '@/lib/avatar/admin-server';

// 캐릭터 관리 콘솔의 목록(집주인만, 0024).
//   GET /api/admin/characters?filter=all|model_problem|model_making|model_ready|model_none|pic_problem
//                             &role=admin|family|guest|visitor&maker=<만든 서비스>&q=<이름>&mine=1&limit=24&before=<ISO>&before_id=<id>
//   → {ok, items: [캐릭터 한 줄], counts: {거르기마다 수, roles, makers}, next: {before, before_id} | null}
// 판정은 DB의 admin_characters·admin_character_counts가 집주인 세션으로 한다(is_admin()을 먼저 본다). 원본 사진 경로는 오지 않는다.
export async function GET(request: Request) {
  await connection();
  const gate = await adminSession();
  if (gate instanceof Response) return gate;
  const q = readAdminQuery(new URL(request.url).searchParams);
  const [list, counts] = await Promise.all([
    gate.supabase.rpc('admin_characters', {
      p_filter: q.filter, p_role: q.role, p_maker: q.maker, p_query: q.q, p_mine: q.mine,
      p_limit: q.limit + 1, p_before: q.before, p_before_id: q.beforeId,
    }),
    gate.supabase.rpc('admin_character_counts', { p_mine: q.mine }),
  ]);
  if (list.error) {
    return adminJson({ ok: false, reason: noFunction(list.error) ? 'db_old' : 'error' }, 503);
  }
  const rows = readCharacterRows(list.data);
  const items = rows.slice(0, q.limit);
  const last = items[items.length - 1];
  return adminJson({
    ok: true,
    // 화면은 DB 모양을 같은 readCharacterRows로 읽는다(characterWire)
    items: items.map(characterWire),
    counts: counts.error ? null : readCounts(counts.data),
    next: rows.length > q.limit && last ? { before: last.createdAt, before_id: last.id } : null,
  });
}
