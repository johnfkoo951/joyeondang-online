'use server';
import { canSee } from '@/lib/access';
import { APP_VERSION } from '@/lib/app-version';
import { cleanVoiceDraft, voiceRoom } from '@/lib/room-voice';
import { latestStamp } from '@/lib/room-voice-ledger';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

export type SaveVoiceResult = { ok: true; updatedAt: string; version: string; hash: string } | { ok: false; error: string };

/**
 * 한 방의 내 의견을 통째로 저장한다(쓰는 대로 화면이 부른다). 버전·방 지문·본 항목은 화면이 아니라 서버가 적는다.
 * 권한은 DB(save_room_voice)가 최종 판정하고, 여기서는 가족이 아니면 DB까지 가지 않는다.
 */
export async function saveRoomVoice(slug: string, draft: unknown): Promise<SaveVoiceResult> {
  const viewer = await getViewer();
  if (!viewer.ready) return { ok: false, error: 'not_ready' };
  if (!canSee(viewer.role, 'family')) return { ok: false, error: 'not_allowed' };
  const room = typeof slug === 'string' ? voiceRoom(slug) : null;
  if (!room) return { ok: false, error: 'invalid_room' };
  const clean = cleanVoiceDraft(draft);
  const stamp = latestStamp(room.slug);
  const seen = room.items.map((i) => i.id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_room_voice', {
    p_room: room.slug,
    p_marks: clean.marks,
    p_notes: clean.notes,
    p_answers: clean.answers,
    p_status: clean.status,
    p_seen: seen,
    p_room_hash: stamp?.hash ?? '',
    p_app_version: APP_VERSION,
  });
  if (error) {
    const known = /not_allowed|invalid_\w+|too_large/.exec(error.message)?.[0];
    return { ok: false, error: known ?? 'save_failed' };
  }
  const at = (data as { updatedAt?: unknown } | null)?.updatedAt;
  return { ok: true, updatedAt: typeof at === 'string' ? at : new Date().toISOString(), version: APP_VERSION, hash: stamp?.hash ?? '' };
}
