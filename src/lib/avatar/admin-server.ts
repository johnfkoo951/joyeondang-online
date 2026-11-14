import 'server-only';
import { noFunction } from '@/lib/avatar/assets';
import {
  ADMIN_IMAGE_CACHE, ADMIN_MODEL_CACHE, adminFileHref, drainTrash, readFileRef, type DrainResult, type FileKind,
} from '@/lib/avatar/admin-rules';
import { sameOrigin } from '@/lib/avatar/manage';
import { VER_PARAM, modelHeaders, readVer, toVersion } from '@/lib/avatar/model-version';
import { AVATAR_BUCKET, createAvatarAdmin } from '@/lib/avatar/server';
import { SUPABASE_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';

// 캐릭터 관리 콘솔(0024)의 서버 쪽. 집주인인지는 여기서 한 번(빠른 거절), DB 함수가 한 번 더(is_admin()) 본다.
// 비밀 키(SUPABASE_SECRET_KEY)는 두 곳에만 쓴다: 버릴 목록의 파일을 저장소에서 지우기, 집주인이 고른 캐릭터의 그림·모형 읽기.
// 그 경로는 늘 DB가 그 캐릭터의 줄에서 지어 준 것이고(부르는 쪽은 id만 넘긴다), 모양을 한 번 더 본다. 원본 사진은 읽지 않는다.

export const ADMIN_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export function adminJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: ADMIN_HEADERS });
}

/** 있는지조차 알리지 않는 답(집주인이 아닐 때) */
export function adminHidden(): Response {
  return new Response('Not found', { status: 404, headers: ADMIN_HEADERS });
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * 집주인의 세션. 집주인이 아니면 404(있는지 알리지 않는다), 역할을 확인하지 못했으면 503.
 * 고치는 요청(request를 넘긴다)은 다른 사이트에서 몰래 보낸 것이면 404
 */
export async function adminSession(request: Request | null = null): Promise<{ supabase: Client } | Response> {
  if (request && !sameOrigin(request)) return adminHidden();
  const viewer = await getViewer();
  if (viewer.unsure) return adminJson({ ok: false, reason: 'error', message: '지금은 확인하지 못했어요. 잠시 뒤 다시 해 주세요.' }, 503);
  if (viewer.role !== 'admin') return adminHidden();
  return { supabase: await createClient() };
}

/** 파일을 지우고 집주인용으로 읽을 수 있는가(서버 비밀 키). 없으면 콘솔은 목록만 보이고 지우는 단추를 끈다 */
export function adminStoreReady(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/** 버릴 목록 비우기. 조작 뒤와 콘솔을 열 때 부른다(지난번에 못 지운 파일을 마저) */
export async function drainAvatarTrash(): Promise<DrainResult> {
  if (!adminStoreReady()) return { removed: 0, left: true };
  try {
    const client = createAvatarAdmin();
    return await drainTrash({
      list: async (limit) => {
        const { data, error } = await client.rpc('avatar_trash_list', { p_limit: limit });
        // 0024 전의 DB에는 버릴 목록이 없다(비울 것도 없다)
        if (error) return noFunction(error) ? [] : null;
        if (!Array.isArray(data)) return null;
        return (data as { path?: unknown }[]).map((r) => r?.path);
      },
      remove: async (paths) => !(await client.storage.from(AVATAR_BUCKET).remove(paths)).error,
      done: async (paths) => !(await client.rpc('avatar_trash_done', { p_paths: paths })).error,
    });
  } catch {
    return { removed: 0, left: true };
  }
}

/** 작은 그림의 폭(px). 휴대폰 목록에서 큰 그림(1024×1536 PNG)을 여러 장 받지 않게 */
const THUMB_WIDTH = 360;

/** 작은 그림(WebP). 줄일 수 없으면 null(부르는 쪽이 원래 그림을 준다) */
async function thumb(png: Uint8Array): Promise<Uint8Array | null> {
  try {
    const { default: sharp } = await import('sharp');
    const out = await sharp(png).resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80, alphaQuality: 90 }).toBuffer();
    return new Uint8Array(out.buffer, out.byteOffset, out.length);
  } catch {
    return null;
  }
}

/**
 * 집주인용 그림·모형 읽기(GET /api/admin/characters/<id>/image|model?v=<판>). 집주인인지는 부르는 쪽이 먼저 본다.
 * 경로와 판은 DB(admin_character_file, 집주인 세션)가 주고, 파일은 비밀 키로 읽는다. 묻는 판이 지금 판이 아니면 지금 판으로 보낸다(302).
 * 모든 사람의 그림과 3D가 집주인 기기에 오래 남지 않게 캐시는 짧다: 그림은 1분(거르기를 바꿀 때마다 다시 받지 않을 만큼),
 * 3D는 남기지 않는다(ADMIN_IMAGE_CACHE·ADMIN_MODEL_CACHE). 그림은 s=s면 작은 WebP로 준다
 */
export async function serveAdminFile(supabase: Client, request: Request, id: string, kind: FileKind): Promise<Response> {
  const none = () => new Response(null, { status: 404, headers: ADMIN_HEADERS });
  if (!adminStoreReady()) return new Response(null, { status: 503, headers: ADMIN_HEADERS });
  const { data, error } = await supabase.rpc('admin_character_file', { p_id: id, p_kind: kind });
  if (error) return new Response(null, { status: noFunction(error) ? 404 : 503, headers: ADMIN_HEADERS });
  const ref = readFileRef(data, id, kind);
  if (!ref) return none();
  const sp = new URL(request.url).searchParams;
  const small = kind === 'char' && sp.get('s') === 's';
  if (readVer(sp.get(VER_PARAM)) !== ref.ver) return toVersion(adminFileHref(id, kind, ref.ver, small));
  let bytes: Uint8Array;
  try {
    const { data: file, error: readError } = await createAvatarAdmin().storage.from(AVATAR_BUCKET).download(ref.path);
    if (readError || !file) return none();
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return new Response(null, { status: 503, headers: ADMIN_HEADERS });
  }
  if (kind === 'model') {
    return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: modelHeaders(bytes.length, ADMIN_MODEL_CACHE) });
  }
  const shrunk = small ? await thumb(bytes) : null;
  const body = shrunk ?? bytes;
  return new Response(body as Uint8Array<ArrayBuffer>, {
    headers: {
      'Content-Type': shrunk ? 'image/webp' : 'image/png',
      'Content-Length': String(body.length),
      'Cache-Control': ADMIN_IMAGE_CACHE,
      'X-Robots-Tag': 'noindex',
      'Content-Disposition': 'inline',
    },
  });
}
