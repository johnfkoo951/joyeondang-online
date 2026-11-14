'use server';
import { canUse } from '@/lib/access';
import { keepStoredTitle, ownsAvatar } from '@/lib/look-server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';
import { cleanLook, photoId } from '@/walk/look';

// 캐릭터 겉모습 저장(명단 손님부터). 받은 값은 믿지 않고 계약(cleanLook)으로 고쳐서 내 profiles 행에만 쓴다.
// 화면을 다시 그리지 않는다(걷기 화면은 이미 바뀐 모습을 그리고 있다).

export type SaveLookResult = { ok: boolean };

export async function saveMyLook(look: unknown): Promise<SaveLookResult> {
  const viewer = await getViewer();
  if (!canUse(viewer.role, 'stamps')) return { ok: false };
  const clean = cleanLook(look);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (typeof uid !== 'string' || !uid) return { ok: false };
  // 사진 캐릭터는 내가 만든 그림일 때만 건다(남의 그림 주소를 내 겉모습으로 저장하지 못하게)
  const id = photoId(clean);
  if (id !== null && !(await ownsAvatar(supabase, id))) return { ok: false };
  // 칭호 칸이 없는 겉모습(칭호를 모르는 화면)은 저장된 칭호를 지키고, 칸이 있으면(빈 글이어도) 그대로 쓴다
  const final = await keepStoredTitle(supabase, uid, look, clean);
  const { error } = await supabase.from('profiles').upsert({ user_id: uid, look: final, updated_at: new Date().toISOString() });
  return { ok: !error };
}
