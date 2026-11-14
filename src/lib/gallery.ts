import 'server-only';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';
import { GALLERY_TEXT, MANIFEST_FILE, artKey, emptyManifest, readManifestDoc, type GalleryItem, type ManifestDoc, type ManifestEntry } from '@/lib/gallery-manifest';

// 부엌 사진 갤러리의 서버 쪽. 비공개 버킷 gallery(supabase/migrations/0023_gallery.sql)는 서버(비밀 키)만 만진다(저장소 정책 없음):
// 전시 목록 manifest.json과 그림(images/…). 손님 확인은 부르는 쪽(/api/gallery, 관리 화면)이 먼저 한다.
// 보여 줄 때는 지금 걸린 액자 id의 그림에만 세 시간짜리 서명 주소를 만든다. 버킷 안 경로는 화면으로 내보내지 않는다.

export const GALLERY_BUCKET = 'gallery';
const SIGN_SECONDS = 3 * 60 * 60;

/** 비밀 키가 있어야 목록을 읽고 쓴다(없으면 모든 액자가 「곧 전시해요」) */
export function galleryStoreReady(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function admin(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error('gallery store is not configured');
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 파일이 없다는 답인가(목록을 아직 만들지 않았다) */
function missing(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: string; message?: string } | null;
  return Boolean(e) && (e!.status === 404 || e!.statusCode === '404' || /not.?found/i.test(e!.message ?? ''));
}

/**
 * 전시 목록을 읽은 결과. 못 읽었으면 까닭: unready(비밀 키 없음), unreachable(버킷이 없거나 연결 오류),
 * broken(파일이 있는데 깨졌다: JSON이 아니거나 모양이 틀리거나 너무 크다)
 */
export type ManifestRead = { ok: true; doc: ManifestDoc } | { ok: false; why: 'unready' | 'unreachable' | 'broken' };

/** 내려받은 결과 → 읽은 목록. 파일이 아직 없으면 빈 목록 */
export async function manifestFrom(got: { data: Blob | null; error: unknown }): Promise<ManifestRead> {
  if (got.error || !got.data) return missing(got.error) ? { ok: true, doc: emptyManifest() } : { ok: false, why: 'unreachable' };
  if (got.data.size > GALLERY_TEXT.bytes) return { ok: false, why: 'broken' };
  const doc = readManifestDoc(await got.data.text());
  return doc ? { ok: true, doc } : { ok: false, why: 'broken' };
}

/**
 * 전시 목록을 읽는다. 쓰기 전에 꼭 이것으로 읽고, ok가 아니면 쓰지 않는다(잠깐 못 읽었거나 깨진 목록을 새 줄 하나만 든 목록으로
 * 덮어쓰지 않게)
 */
export async function readManifest(): Promise<ManifestRead> {
  if (!galleryStoreReady()) return { ok: false, why: 'unready' };
  try {
    return await manifestFrom(await admin().storage.from(GALLERY_BUCKET).download(MANIFEST_FILE));
  } catch {
    return { ok: false, why: 'unreachable' };
  }
}

/**
 * 목록 가운데 지금 걸린 액자(ids)의 줄에 서명 주소를 붙인다. 주소를 못 만든 줄은 뺀다(그 액자는 「곧 전시해요」).
 * 줄마다 그림 열쇠(버킷 경로를 다진 값)를 함께 준다: 서명 주소는 받을 때마다 바뀌어도 그림이 같으면 열쇠는 같다
 */
export async function signGallery(entries: ReadonlyMap<string, ManifestEntry>, ids: ReadonlySet<string>): Promise<GalleryItem[]> {
  const rows = [...entries].filter(([id]) => ids.has(id));
  if (!rows.length || !galleryStoreReady()) return [];
  try {
    const paths = [...new Set(rows.flatMap(([, e]) => (e.thumb ? [e.image, e.thumb] : [e.image])))];
    const { data, error } = await admin().storage.from(GALLERY_BUCKET).createSignedUrls(paths, SIGN_SECONDS);
    if (error || !data) return [];
    const url = new Map(data.filter((s) => s.path && s.signedUrl && !s.error).map((s) => [s.path as string, s.signedUrl]));
    const out: GalleryItem[] = [];
    for (const [id, e] of rows) {
      const image = url.get(e.image);
      if (!image) continue;
      const thumb = e.thumb ? url.get(e.thumb) : undefined;
      const key = await artKey(e.image, e.thumb);
      out.push({ id, key, title: e.title, desc: e.desc, image, ...(thumb ? { thumb } : {}) });
    }
    return out;
  } catch {
    return [];
  }
}

/** 손님 화면에 줄 전시 목록(지금 걸린 액자 id만). 목록이 없거나 못 읽거나 깨졌으면 빈 목록(모두 「곧 전시해요」) */
export async function galleryItems(ids: ReadonlySet<string>): Promise<GalleryItem[]> {
  if (!ids.size) return [];
  const read = await readManifest();
  return read.ok ? signGallery(read.doc.entries, ids) : [];
}

/** 목록 파일을 통째로 쓴다(관리 화면, 내용은 editManifest로 만든다). 성공하면 true */
export async function writeManifest(text: string): Promise<boolean> {
  try {
    const body = new Blob([text], { type: 'application/json' });
    const { error } = await admin().storage.from(GALLERY_BUCKET).upload(MANIFEST_FILE, body, { contentType: 'application/json', upsert: true, cacheControl: '0' });
    return !error;
  } catch {
    return false;
  }
}

/** 무작위 32자리 16진 이름(원래 파일 이름은 쓰지 않는다) */
function newBase(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 관리 화면이 올린 그림 한 쌍(보기용, 작은 그림)의 경로 */
export function galleryFiles(base: string): { image: string; thumb: string } {
  return { image: `images/${base}.jpg`, thumb: `images/${base}-t.jpg` };
}

/** 관리 화면이 올린 그림인가(지울 때 이 모양만 지운다: 손으로 올린 다른 파일은 건드리지 않는다) */
export function isOwnGalleryFile(path: string): boolean {
  return /^images\/[0-9a-f]{32}(-t)?\.jpg$/.test(path);
}

/** 확인을 마친 JPEG 두 장(보기용, 작은 그림)을 올린다. 하나라도 실패하면 올린 것을 지우고 null */
export async function storeGalleryPhoto(view: Uint8Array, thumb: Uint8Array): Promise<{ image: string; thumb: string } | null> {
  let bucket;
  try {
    bucket = admin().storage.from(GALLERY_BUCKET);
  } catch {
    return null;
  }
  const files = galleryFiles(newBase());
  try {
    const a = await bucket.upload(files.image, view, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
    if (a.error) return null;
    const b = await bucket.upload(files.thumb, thumb, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
    if (b.error) {
      await bucket.remove([files.image]);
      return null;
    }
    return files;
  } catch {
    try { await bucket.remove([files.image, files.thumb]); } catch { /* 남은 파일은 목록에 없어 보이지 않는다 */ }
    return null;
  }
}

/** 관리 화면이 올렸던 그림을 지운다(목록에서 뺀 뒤). 실패해도 목록에 없으니 보이지 않는다 */
export async function removeGalleryFiles(paths: readonly string[]): Promise<void> {
  const own = paths.filter(isOwnGalleryFile);
  if (!own.length) return;
  try {
    await admin().storage.from(GALLERY_BUCKET).remove(own);
  } catch {
    // 남은 파일은 목록에 없어 손님에게 보이지 않는다
  }
}
