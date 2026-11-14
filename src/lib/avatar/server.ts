import 'server-only';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { assetOff } from '@/lib/avatar/assets';
import { readModelProvider, readTrainingOptOut, type ModelProvider } from '@/lib/avatar/consent';
import { isUuid, readTotalCap } from '@/lib/avatar/rules';
import { SUPABASE_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

// AI 사진 캐릭터의 서버 쪽. Supabase 비밀 키는 이 파일과 라우트에서만 읽는다.
// 그리기는 여기서 하지 않는다: 원본을 올리고 줄에 세우면 Mac Studio의 일꾼(worker/avatar)이 그린다.

export const AVATAR_BUCKET = 'avatars';

export function avatarConfig() {
  return { totalCap: readTotalCap(process.env.AVATAR_DAILY_CAP_TOTAL) };
}

/**
 * 3D 모형을 만드는 곳(환경 변수 AVATAR_MODEL_PROVIDER: meshy | trellis, 기본 meshy). 동의 글과 3D 확인 글이 이것을 본다.
 * 일꾼이 쓰는 3D 서비스와 같게 둔다(바꿀 때는 둘을 함께)
 */
export function modelProvider(): ModelProvider {
  return readModelProvider(process.env.AVATAR_MODEL_PROVIDER);
}

/**
 * Meshy에 학습 제외를 요청해 답을 받았는가(환경 변수 MESHY_TRAINING_OPTOUT=1). 동의 글·3D 확인·개인정보 화면의 Meshy 학습
 * 한 문장이 이것을 따른다. 답을 받기 전에는 켜지 않는다(약관대로 학습에 쓸 수 있다고 알린다)
 */
export function meshyTrainingOptOut(): boolean {
  return readTrainingOptOut(process.env.MESHY_TRAINING_OPTOUT);
}

/** 3D 요청을 받는가(AVATAR_MODELS=0이면 쉰다. 이미 만든 3D는 그대로 준다) */
export function modelsOn(): boolean {
  return !assetOff('model');
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
