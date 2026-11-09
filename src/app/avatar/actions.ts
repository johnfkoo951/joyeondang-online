'use server';
import { refresh } from 'next/cache';
import { canSee } from '@/lib/access';
import { isUuid } from '@/lib/avatar/rules';
import { AVATAR_BUCKET } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 내 캐릭터 고르기와 지우기. 매번 명단 손님인지 다시 확인하고, 보는 사람의 세션으로만 한다
// (DB 함수와 저장소 정책이 내 것만 건드리게 한 번 더 막는다).

export type ManageState = { ok: boolean; message: string };

type Op = 'choose' | 'unchoose' | 'delete-character' | 'delete-original' | 'delete-both' | 'delete-all-originals';
const OPS = new Set<Op>(['choose', 'unchoose', 'delete-character', 'delete-original', 'delete-both', 'delete-all-originals']);

export async function manageAvatar(_prev: ManageState | null, formData: FormData): Promise<ManageState> {
  const viewer = await getViewer();
  if (!canSee(viewer.role, 'guests')) return { ok: false, message: '명단에 계신 분만 쓸 수 있어요.' };
  const op = String(formData.get('op') ?? '') as Op;
  if (!OPS.has(op)) return { ok: false, message: '다시 눌러 주세요.' };
  const supabase = await createClient();

  if (op === 'unchoose') {
    const { data } = await supabase.rpc('avatar_choose', { p_id: null });
    refresh();
    return data ? { ok: true, message: '종이 인형으로 돌아갔어요.' } : { ok: false, message: '바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  }

  if (op === 'delete-all-originals') {
    const { data: rows } = await supabase.from('avatars').select('id, original_path').not('original_path', 'is', null);
    const list = (rows ?? []) as { id: string; original_path: string | null }[];
    const paths = list.map((r) => r.original_path).filter((p): p is string => typeof p === 'string');
    if (paths.length) {
      const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
      if (error) return { ok: false, message: '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
    }
    for (const r of list) await supabase.rpc('avatar_forget', { p_id: r.id, p_part: 'original' });
    refresh();
    return { ok: true, message: paths.length ? '원본 사진을 모두 지웠어요.' : '남아 있는 원본 사진이 없어요.' };
  }

  const id = formData.get('id');
  if (!isUuid(id)) return { ok: false, message: '다시 눌러 주세요.' };

  if (op === 'choose') {
    const { data } = await supabase.rpc('avatar_choose', { p_id: id });
    refresh();
    return data ? { ok: true, message: '이 캐릭터로 집 안을 걸어요.' } : { ok: false, message: '고르지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  }

  // 지우기: 파일을 먼저 지우고(실패하면 DB는 그대로), 그다음 DB에 적는다
  const part = op === 'delete-original' ? 'original' : op === 'delete-character' ? 'character' : 'both';
  const { data: row } = await supabase.from('avatars').select('id, original_path, image_path').eq('id', id).maybeSingle();
  if (!row) return { ok: false, message: '찾지 못했어요. 이미 지웠을 수도 있어요.' };
  const r = row as { original_path: string | null; image_path: string | null };
  const paths = [
    part !== 'character' ? r.original_path : null,
    part !== 'original' ? r.image_path : null,
  ].filter((p): p is string => typeof p === 'string');
  if (paths.length) {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
    if (error) return { ok: false, message: '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  }
  const { data: done } = await supabase.rpc('avatar_forget', { p_id: id, p_part: part });
  refresh();
  if (!done) return { ok: false, message: '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.' };
  return {
    ok: true,
    message: part === 'original' ? '원본 사진을 지웠어요.' : part === 'character' ? '그림을 지웠어요.' : '그림과 원본 사진을 지웠어요.',
  };
}
