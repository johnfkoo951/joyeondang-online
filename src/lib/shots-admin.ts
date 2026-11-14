import 'server-only';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';
import { cleanStorage, type CleanResult } from '@/lib/shots-admin-rules';

// 걷기 사진 지우기(0022)의 서버 쪽. 지우기 자체(누구의 사진을, 관리자인지)는 관리자 세션으로 DB 함수가 한다.
// 여기서는 비밀 키로 저장소를 정리만 한다(걷기 사진 버킷은 본인 정책뿐이라 집주인 세션으로는 남의 파일을 지울 수 없다):
//   버릴 목록에 오른 경로의 파일을 지우고, 훑을 차례가 된 사람 폴더를 나열해 표 줄 없이 남은 파일을 DB에 알린다.
// 경로와 폴더 목록은 서버 안에서만 쓰고 화면으로 내보내지 않는다. 순서와 멈추는 법은 shots-admin-rules의 cleanStorage.

export const SHOTS_BUCKET = 'shots';

/** 비밀 키가 있는가(없으면 관리 화면은 장수만 보이고 지우기 단추를 끈다). 그 키가 실제로 듣는지는 shotsKeyWorks */
export function shotsAdminReady(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function service(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error('shots admin is not configured');
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * 비밀 키로 저장소에 닿는가(키가 바뀌었거나 틀렸으면 아니다). 걷기 사진 버킷의 설정만 한 번 읽는다(사진은 읽지 않는다).
 * 표 줄을 지우기 전에 본다: 파일을 지울 수 없으면 표 줄도 지우지 않는다.
 */
export async function shotsKeyWorks(): Promise<boolean> {
  if (!shotsAdminReady()) return false;
  try {
    const { data, error } = await service().storage.getBucket(SHOTS_BUCKET);
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

/** rpc가 돌려준 줄들에서 한 칸만 꺼낸다(배열이 아니면 null) */
function column(data: unknown, key: string): unknown[] | null {
  if (!Array.isArray(data)) return null;
  return data.map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>)[key] : undefined));
}

/**
 * 저장소 정리: 버릴 목록 비우기와 폴더 훑기를 budgetMs 동안 할 수 있는 만큼 한다(남으면 left).
 * 집주인이 지운 뒤, 「지금 마저 지우기」, 관리 화면을 보낸 뒤(after)에 부른다. 여럿이 함께 돌아도 같은 일을 두 번 할 뿐이다.
 */
export async function cleanShotsStorage(budgetMs: number): Promise<CleanResult> {
  if (!shotsAdminReady()) return { removed: 0, left: true, failed: true };
  try {
    const client = service();
    const bucket = client.storage.from(SHOTS_BUCKET);
    return await cleanStorage({
      list: async (limit) => {
        const { data, error } = await client.rpc('shots_trash_list', { p_limit: limit });
        return error ? null : column(data, 'path');
      },
      remove: async (paths) => !(await bucket.remove(paths)).error,
      done: async (paths) => !(await client.rpc('shots_trash_done', { p_paths: paths })).error,
      folders: async (limit) => {
        const { data, error } = await client.rpc('shots_sweep_list', { p_limit: limit });
        return error ? null : column(data, 'user_id');
      },
      page: async (uid, offset, limit) => {
        const { data, error } = await bucket.list(uid, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
        return error || !Array.isArray(data) ? null : data;
      },
      swept: async (uid, read) => !(await client.rpc('shots_sweep_done', {
        p_user: uid, p_old: read.old, p_young: read.young, p_partial: read.partial,
      })).error,
    }, { now: Date.now, until: Date.now() + budgetMs });
  } catch {
    return { removed: 0, left: true, failed: true };
  }
}
