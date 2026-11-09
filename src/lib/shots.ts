'use client';
// 걷기 사진 갤러리(본인만). 브라우저 Supabase 클라이언트로 올리기·목록·지우기·서명 주소.
// 표와 저장소 정책은 supabase/migrations/0004_shots.sql(본인 <uid>/ 아래만, 60장까지).
import { createClient } from '@/lib/supabase/client';

export type Shot = { id: string; path: string; w: number; h: number; place: string; created_at: string };
export const SHOTS_MAX = 60;
const BUCKET = 'shots';
/** 서명 주소가 살아 있는 시간(초) */
const SIGN_S = 60 * 30;

export type UploadResult = { ok: true; shot: Shot } | { ok: false; reason: 'full' | 'auth' | 'error' };

async function size(blob: Blob): Promise<{ w: number; h: number }> {
  try {
    const b = await createImageBitmap(blob);
    const s = { w: b.width, h: b.height };
    b.close();
    return s;
  } catch {
    return { w: 1, h: 1 };
  }
}

/** 로그인한 사람이면 그 id, 아니면 null(내려받기로 대신한다) */
export async function myId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function uploadShot(blob: Blob, place: string): Promise<UploadResult> {
  const sb = createClient();
  const uid = await myId();
  if (!uid) return { ok: false, reason: 'auth' };
  const { count, error: countErr } = await sb.from('shots').select('id', { count: 'exact', head: true });
  if (countErr) return { ok: false, reason: 'error' };
  if ((count ?? 0) >= SHOTS_MAX) return { ok: false, reason: 'full' };
  const { w, h } = await size(blob);
  const path = `${uid}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) return { ok: false, reason: 'error' };
  const { data, error } = await sb
    .from('shots')
    .insert({ path, w, h, place: place.slice(0, 40) })
    .select('id, path, w, h, place, created_at')
    .single();
  if (error || !data) {
    // 표에 못 올렸으면 파일도 거둔다(상한에 걸렸을 때 등)
    await sb.storage.from(BUCKET).remove([path]);
    return { ok: false, reason: error?.message.includes('shots_full') ? 'full' : 'error' };
  }
  return { ok: true, shot: data as Shot };
}

/** 최신 순 */
export async function listShots(): Promise<Shot[] | null> {
  const { data, error } = await createClient()
    .from('shots')
    .select('id, path, w, h, place, created_at')
    .order('created_at', { ascending: false })
    .limit(SHOTS_MAX + 10);
  return error ? null : ((data ?? []) as Shot[]);
}

/** 파일을 먼저 지우고 표에서 뺀다 */
export async function deleteShot(s: Pick<Shot, 'id' | 'path'>): Promise<boolean> {
  const sb = createClient();
  const rm = await sb.storage.from(BUCKET).remove([s.path]);
  if (rm.error) return false;
  const { error } = await sb.from('shots').delete().eq('id', s.id);
  return !error;
}

/** 격자에 띄울 주소들(path → 주소) */
export async function viewUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await createClient().storage.from(BUCKET).createSignedUrls(paths, SIGN_S);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

/** 내려받기 주소: 서버가 그 이름으로 내려보내게 한다 */
export async function downloadUrl(path: string, fileName: string): Promise<string | null> {
  const { data } = await createClient().storage.from(BUCKET).createSignedUrl(path, 120, { download: fileName });
  return data?.signedUrl ?? null;
}
