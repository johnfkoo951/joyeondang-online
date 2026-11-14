'use client';
// 걷기 사진 갤러리(본인만). 브라우저 Supabase 클라이언트로 올리기·목록·지우기·서명 주소.
// 표와 저장소 정책은 supabase/migrations/0004_shots.sql(본인 <uid>/ 아래만, 60장까지).
// 저장소 파일 수 상한은 0014_guards.sql(표 상한보다 조금 넉넉히).
import { orphanPaths } from '@/lib/shots-orphans';
import { deleteInBatches } from '@/lib/shots-pick';
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

/**
 * 로그인한 사람이면 그 id, 아니면 null(내려받기로 대신한다).
 * getUser는 부를 때마다 인증 서버에 묻는다. 발표장처럼 여러 휴대폰이 한 와이파이(같은 주소)로 몰리면 인증 서버의
 * 주소별 한도를 함께 쓰므로, 세션의 서명을 이 기기에서 확인하는 getClaims로 읽는다(사진 저장소 정책이 한 번 더 막는다)
 */
export async function myId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getClaims();
    const sub = data?.claims?.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * 표에 줄이 없는 채 저장소에 남은 내 파일(올리다 끊긴 것)을 치운다. 치운 것이 있으면 true.
 * tableCount는 방금 센 표의 줄 수: 지금 읽은 줄이 그보다 적으면(읽기가 덜 됨) 아무것도 지우지 않는다.
 */
async function sweepOrphans(sb: ReturnType<typeof createClient>, uid: string, tableCount: number): Promise<boolean> {
  try {
    const [files, rows] = await Promise.all([
      sb.storage.from(BUCKET).list(uid, { limit: 200 }),
      sb.from('shots').select('path').limit(200),
    ]);
    if (files.error || rows.error || !files.data || !rows.data || rows.data.length < tableCount) return false;
    const stale = orphanPaths(uid, files.data, rows.data.map((r) => String(r.path)), Date.now());
    if (stale.length === 0) return false;
    const rm = await sb.storage.from(BUCKET).remove(stale);
    return !rm.error;
  } catch {
    return false;
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
  const put = () => sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  let up = await put();
  // 저장소 파일 수 상한에 걸렸을 수 있다: 갤러리에 안 보이는 남은 파일을 치우고 한 번만 다시 올린다
  if (up.error && (await sweepOrphans(sb, uid, count ?? 0))) up = await put();
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

/**
 * 여러 장을 한 번에(고르기). 묶음마다 파일을 먼저 지우고 표에서 뺀다(순서와 실패 처리는 shots-pick의 deleteInBatches).
 * 지운 사진의 id들을 돌려준다. 빠진 것은 그대로 남아 있다(갤러리에 남아 다시 지울 수 있다)
 */
export async function deleteShots(list: Pick<Shot, 'id' | 'path'>[]): Promise<string[]> {
  const sb = createClient();
  return deleteInBatches(list, {
    removeFiles: async (paths) => !(await sb.storage.from(BUCKET).remove(paths)).error,
    removeRows: async (ids) => !(await sb.from('shots').delete().in('id', ids)).error,
  });
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
