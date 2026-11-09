import 'server-only';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { isUuid, readTotalCap } from '@/lib/avatar/rules';
import { SUPABASE_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

// AI 사진 캐릭터의 서버 쪽. Supabase 비밀 키는 이 파일과 라우트에서만 읽는다.
// 그리기는 여기서 하지 않는다: 원본을 올리고 줄에 세우면 Mac Studio의 일꾼(worker/avatar)이 그린다.

export const AVATAR_BUCKET = 'avatars';

export function avatarConfig() {
  return { totalCap: readTotalCap(process.env.AVATAR_DAILY_CAP_TOTAL) };
}

/** 비밀 키가 있어야 만들기를 연다(없으면 화면에 「준비 중」). AVATAR_ENABLED=0 이면 잠근다 */
export function avatarReady(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) && process.env.AVATAR_ENABLED !== '0';
}

/** 일꾼이 이만큼 조용하면 「쉬는 중」으로 본다 */
export const WORKER_QUIET_MS = 10 * 60 * 1000;

/**
 * 서버 전용 관리자 연결(Supabase 비밀 키). 원본을 올리고 줄에 세울 때만 쓴다.
 * 읽기·지우기는 보는 사람의 세션으로 해서 RLS가 한 번 더 막게 한다.
 */
export function createAvatarAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error('avatar admin client is not configured');
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type ActiveAvatar = { avatarId: string; imagePath: string; url: string };

/**
 * 그 사람이 지금 쓰는 캐릭터(걷기·함께 걷기 연결용). 부르는 사람이 명단 손님일 때만 값이 나온다.
 * url은 같은 사이트의 /api/avatar/<id>(명단 손님에게만 그림을 준다).
 */
export async function activeAvatarPath(userId: string): Promise<ActiveAvatar | null> {
  if (!isUuid(userId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('avatar_image_path', { p_user: userId });
  if (error || typeof data !== 'string') return null;
  const m = /^[0-9a-f-]{36}\/chars\/([0-9a-f-]{36})\.png$/.exec(data);
  if (!m || !isUuid(m[1])) return null;
  return { avatarId: m[1], imagePath: data, url: `/api/avatar/${m[1]}` };
}
