import { hiddenAsset, missingAsset, noFunction, type AssetStateClient } from '@/lib/avatar/assets';
import { MODEL_TYPE } from '@/lib/avatar/model';
import { isUuid } from '@/lib/avatar/rules';

// 걷기용 3D 모형 주소의 판 번호(0024). 모형은 같은 자리(<uid>/models/<id>.v1.glb)에 덮어써서, 주소가 같으면 다시 만든 3D가
// 브라우저 캐시의 옛 모형으로 보였다(한 시간까지). 그래서 주소에 판(?v=<판>)을 붙인다.
//   판이 붙은 주소   한 시간 캐시한다(판 없던 때와 같은 수명). 다시 만든 3D는 판이 바뀌어 새 주소라 옛 캐시와 겹치지 않으므로
//                   길게 둘 까닭이 없다. 길게 두면 지운 3D가 본 사람들의 기기에 그만큼 남는다(지우기 약속, forget-cache.ts).
//                   묻는 판이 지금 판이 아니면 지금 판으로 보낸다.
//   판 없는 주소     걷기 엔진과 옛 화면이 묻는다. 지금 판의 주소로 보낸다(302, 남기지 않는다). 브라우저는 판이 붙은 주소를
//                   캐시에서 꺼내므로 다시 만들면 모든 화면이 다음에 받을 때 새 모형을 받는다(캐시 열쇠가 판까지 들어간 주소다).
//   옛 DB(0024 전)  판 함수(avatar_model_shown)가 없다. 지금처럼 판 없이 한 시간 캐시한다(부르는 쪽의 옛 길).
// 판은 DB가 3D가 다 될 때마다 올린다(supabase/migrations/0024_admin_characters.sql의 avatars_model_track).
// 다시 만드는 동안에는 이전 모형이 지금 판으로 보인다(0024의 model_prev). 관리자용 읽기(src/lib/avatar/admin-server.ts)는
// 판이 붙은 주소를 쓰되 캐시는 더 짧다(admin-rules.ts의 ADMIN_IMAGE_CACHE·ADMIN_MODEL_CACHE).

/** 판을 싣는 주소 칸 */
export const VER_PARAM = 'v';
/** 판이 붙은 답: 이 기기의 브라우저에만 한 시간(판 없던 때와 같다. immutable이 아니다) */
export const CACHE_VERSIONED = 'private, max-age=3600';
/** 판이 없는 답(0024 전의 DB): 지금처럼 한 시간 */
export const CACHE_PLAIN = 'private, max-age=3600';
/** 지금 판으로 보내는 답: 남기지 않는다(다음에 물을 때 다시 판을 본다) */
export const CACHE_NONE = 'private, no-store';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** 모형 파일 경로(src/lib/avatar/rules.ts의 modelPath와 같은 모양) */
export const MODEL_FILE = new RegExp(`^(${UUID})/models/(${UUID})\\.v1\\.glb$`);
/** 캐릭터 그림 경로(charPath와 같은 모양) */
export const CHAR_FILE = new RegExp(`^(${UUID})/chars/(${UUID})\\.png$`);

/** 주소의 판: 1 이상의 정수 글자만(앞의 0, 부호, 소수점, 지수 표기, 큰 수는 판이 아니다). 아니면 null */
export function readVer(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,14}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** DB가 준 판: 1 이상의 정수(숫자나 숫자 글자). 아니면 null */
export function toVer(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 1 ? raw : null;
  if (typeof raw === 'string') return readVer(raw);
  if (typeof raw === 'bigint') return raw >= BigInt(1) && raw <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(raw) : null;
  return null;
}

/** 지금 보일 모형: 저장소 경로, 판, 다시 만드는 동안의 이전 모형인가 */
export type Shown = { path: string; ver: number; prev: boolean };

/** avatar_model_shown(0024)의 답. 경로는 그 그림의 모형 자리와 꼭 같아야 한다(아니면 null: 보이지 않는다) */
export function readShown(raw: unknown, id: string): Shown | null {
  if (!isUuid(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ver = toVer(o.ver);
  const m = typeof o.path === 'string' ? MODEL_FILE.exec(o.path) : null;
  if (ver === null || !m || m[2] !== id) return null;
  return { path: o.path as string, ver, prev: o.prev === true };
}

/** 걷기용 모형 주소. 판이 있으면 ?v=<판>(오래 캐시), 없으면 판 없는 주소(지금 판으로 보내진다) */
export function modelHref(id: string, ver: number | null = null): string {
  return `/api/avatar/${id}/model${ver === null ? '' : `?${VER_PARAM}=${ver}`}`;
}

/**
 * 지금 판의 주소로 보내는 답(302). 위치는 같은 사이트 안의 경로만 받는다(바깥 주소로 보내지 않게). 남기지 않는다:
 * 다음에 물을 때 다시 판을 본다
 */
export function toVersion(location: string): Response {
  if (!location.startsWith('/') || location.startsWith('//')) throw new Error('local paths only');
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': CACHE_NONE, 'X-Robots-Tag': 'noindex' },
  });
}

/** 모형 파일 답의 머리 */
export function modelHeaders(size: number, cache: string): Record<string, string> {
  return {
    'Content-Type': MODEL_TYPE,
    'Content-Length': String(size),
    'Cache-Control': cache,
    'X-Robots-Tag': 'noindex',
    'Content-Disposition': 'inline',
  };
}

/** 보는 사람의 세션으로 만든 연결에서 쓰는 만큼만(시험에서 가짜를 넣을 수 있게) */
export type VersionClient = AssetStateClient & {
  rpc: (fn: 'avatar_model_shown' | 'avatar_asset_state', args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  storage: {
    from: (bucket: string) => {
      download: (path: string) => PromiseLike<{ data: { size: number; stream: () => ReadableStream } | null; error: unknown }>;
    };
  };
};

/**
 * 판 번호가 있는 DB(0024)의 모형 답(GET /api/avatar/<id>/model[?v=<판>]). 명단 손님인지는 부르는 쪽이 먼저 본다.
 * 판 함수가 없으면(옛 DB) null: 부르는 쪽이 옛 길(판 없이 한 시간)로 간다.
 * 순서: 지금 보일 모형과 판(DB, 보는 사람의 세션) → 없으면 본문 없는 404(기다리면 생기는지 머리로) → 묻는 판이 지금 판이 아니면 302 →
 * 보는 사람의 세션으로 내려받아(저장소 정책이 한 번 더 막는다) 오래 캐시
 */
export async function versionedModel(client: VersionClient, request: Request, id: string, bucket: string): Promise<Response | null> {
  let res: { data: unknown; error: unknown };
  try {
    res = await client.rpc('avatar_model_shown', { p_id: id });
  } catch {
    return hiddenAsset(null);
  }
  if (res.error) return noFunction(res.error) ? null : hiddenAsset(null);
  const shown = readShown(res.data, id);
  if (!shown) return missingAsset(client, id, 'model');
  const want = readVer(new URL(request.url).searchParams.get(VER_PARAM));
  if (want !== shown.ver) return toVersion(modelHref(id, shown.ver));
  const { data: file, error } = await client.storage.from(bucket).download(shown.path);
  if (error || !file) return hiddenAsset(null);
  return new Response(file.stream(), { headers: modelHeaders(file.size, CACHE_VERSIONED) });
}
