import 'server-only';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { stripPhotoMetadata } from '@/lib/avatar/rules';
import { SUPABASE_URL } from '@/lib/env';
import { HOURLY_PHOTOS, NOTE_PHOTO_FAIL, NOTE_PHOTO_REASON, notePhotoHourly } from '@/lib/note-photo-words';
import { checkNotePhoto, isMediaBase, mediaFiles, type NotePhotoCheck } from '@/lib/photo';

// 쪽지 사진의 서버 쪽(기획서 6.5 사진 정화). 비공개 버킷 notes는 서버만 만진다(저장소 정책 없음).
// 올리기 → media 줄 적기 → 기록 넣기(보는 사람 세션, 트리거가 한 번 더 확인) 순서로 하고,
// 보여 줄 때는 이미 볼 수 있는 기록(room_records·my_records가 돌려준 줄)에만 10분짜리 서명 주소를 만든다.

export const NOTES_BUCKET = 'notes';
const SIGN_SECONDS = 600;

/** 비밀 키가 있어야 사진을 받는다(없으면 화면은 글만 받는다) */
export function notesMediaReady(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function admin(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error('notes media is not configured');
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 무작위 32자리 16진 이름. 원래 파일 이름은 쓰지 않는다 */
export function newMediaBase(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export type PreparedPhoto = { view: Uint8Array; thumb: Uint8Array };
export type PrepareResult = { ok: true; photo: PreparedPhoto } | { ok: false; message: string };

// 손님에게 보이는 말은 lib/note-photo-words에 둔다(화면이 영어일 때 같은 열쇠로 옮긴다)
const REASON: Record<Exclude<NotePhotoCheck, { ok: true }>['reason'], string> = NOTE_PHOTO_REASON;

/**
 * 기기가 보낸 두 장을 확인한다: JPEG인지, 용량·긴 변이 맞는지. 메타데이터 조각은 한 번 더 지우고,
 * 지운 뒤에도 무엇이든 남아 있거나 확인할 수 없으면 받지 않는다.
 */
export async function prepareNotePhoto(view: Blob, thumb: Blob): Promise<PrepareResult> {
  const out: Partial<PreparedPhoto> = {};
  for (const [kind, blob] of [['view', view], ['thumb', thumb]] as const) {
    if (!blob.size) return { ok: false, message: REASON.empty };
    // 확인 전에 너무 큰 것은 읽지 않는다
    if (blob.size > (kind === 'view' ? 2 : 0.5) * 1024 * 1024) return { ok: false, message: REASON.too_big };
    const raw = new Uint8Array(await blob.arrayBuffer());
    const clean = stripPhotoMetadata(raw, 'image/jpeg');
    const check = checkNotePhoto(clean, kind);
    if (!check.ok) return { ok: false, message: REASON[check.reason] };
    out[kind] = clean;
  }
  return { ok: true, photo: out as PreparedPhoto };
}

export type StoreResult = { ok: true; base: string } | { ok: false; message: string };

/** 두 장을 올리고 media 줄을 적는다. 하나라도 실패하면 올린 것을 지우고 되돌린다 */
export async function storeNotePhoto(owner: string, photo: PreparedPhoto): Promise<StoreResult> {
  const fail = { ok: false as const, message: NOTE_PHOTO_FAIL };
  let client: SupabaseClient;
  try {
    client = admin();
  } catch {
    return fail;
  }
  const base = newMediaBase();
  const files = mediaFiles(base);
  const bucket = client.storage.from(NOTES_BUCKET);
  try {
    // 한 사람이 한 시간에 올리는 사진 수를 막는다(쪽지로 이어지지 않은 파일은 하루 뒤 버린다)
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await client.from('media').select('path', { count: 'exact', head: true }).eq('owner', owner).gte('created_at', since);
    if (recent.error) return fail;
    if ((recent.count ?? 0) >= HOURLY_PHOTOS) {
      return { ok: false, message: notePhotoHourly(HOURLY_PHOTOS) };
    }
    const a = await bucket.upload(files.view, photo.view, { contentType: 'image/jpeg', upsert: false, cacheControl: '600' });
    if (a.error) return fail;
    const b = await bucket.upload(files.thumb, photo.thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '600' });
    if (b.error) {
      await bucket.remove([files.view]);
      return fail;
    }
    const { error } = await client.from('media').insert({ path: base, owner });
    if (error) {
      await bucket.remove([files.view, files.thumb]);
      return fail;
    }
    return { ok: true, base };
  } catch {
    try { await bucket.remove([files.view, files.thumb]); } catch { /* 버릴 목록이 나중에 치운다 */ }
    return fail;
  }
}

/** 기록을 넣지 못했을 때: 파일과 media 줄을 바로 지운다 */
export async function discardNotePhoto(base: string): Promise<void> {
  if (!isMediaBase(base)) return;
  try {
    const client = admin();
    const f = mediaFiles(base);
    await client.storage.from(NOTES_BUCKET).remove([f.view, f.thumb]);
    await client.from('media').delete().eq('path', base);
    await client.rpc('media_trash_done', { p_paths: [base] });
  } catch {
    // 지우지 못해도 하루 뒤 버릴 목록이 치운다
  }
}

export type PhotoLinks = { thumb: string; view: string };

/**
 * 보는 사람이 이미 볼 수 있는 기록 id들(room_records·my_records의 has_photo 줄)에 대해서만 서명 주소를 만든다.
 * 파일 이름은 서버 안에서만 쓰고 화면으로 내보내지 않는다.
 */
export async function signNotePhotos(ids: string[]): Promise<Map<string, PhotoLinks>> {
  const out = new Map<string, PhotoLinks>();
  const clean = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 200);
  if (!clean.length || !notesMediaReady()) return out;
  try {
    const client = admin();
    const { data, error } = await client.from('records').select('id, media_path').in('id', clean).not('media_path', 'is', null);
    if (error || !data) return out;
    const rows = data.filter((r) => isMediaBase(r.media_path)) as { id: string; media_path: string }[];
    if (!rows.length) return out;
    const paths = rows.flatMap((r) => {
      const f = mediaFiles(r.media_path);
      return [f.thumb, f.view];
    });
    const signed = await client.storage.from(NOTES_BUCKET).createSignedUrls(paths, SIGN_SECONDS);
    if (signed.error || !signed.data) return out;
    const url = new Map(signed.data.filter((s) => s.signedUrl && !s.error).map((s) => [s.path, s.signedUrl]));
    for (const r of rows) {
      const f = mediaFiles(r.media_path);
      const thumb = url.get(f.thumb);
      const view = url.get(f.view);
      if (thumb && view) out.set(r.id, { thumb, view });
    }
  } catch {
    // 사진을 못 보여 줘도 글은 그대로 보인다
  }
  return out;
}

/** 버릴 목록 비우기: 저장소에서 지운 뒤 목록에서 뺀다. 거두기 뒤와 승인함을 열 때 부른다 */
export async function drainNoteTrash(limit = 50): Promise<number> {
  if (!notesMediaReady()) return 0;
  try {
    const client = admin();
    const { data, error } = await client.rpc('media_trash_list', { p_limit: limit });
    if (error || !Array.isArray(data)) return 0;
    const paths = (data as { path: unknown }[]).map((r) => r.path).filter(isMediaBase);
    if (!paths.length) return 0;
    const removed = await client.storage.from(NOTES_BUCKET).remove(paths.flatMap((p) => {
      const f = mediaFiles(p);
      return [f.view, f.thumb];
    }));
    if (removed.error) return 0;
    const done = await client.rpc('media_trash_done', { p_paths: paths });
    return done.error ? 0 : Number(done.data ?? 0);
  } catch {
    return 0;
  }
}

/** room_records·my_records가 돌려준 줄에 사진 주소를 붙인다(has_photo인 줄만, 이미 볼 수 있는 줄만) */
export async function attachPhotos<T extends { id: string; has_photo?: boolean }>(rows: T[]): Promise<(T & { photo?: PhotoLinks })[]> {
  const ids = rows.filter((r) => r.has_photo === true).map((r) => r.id);
  if (!ids.length) return rows;
  const links = await signNotePhotos(ids);
  return rows.map((r) => (links.has(r.id) ? { ...r, photo: links.get(r.id) } : r));
}
