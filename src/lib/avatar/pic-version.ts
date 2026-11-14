import { hiddenAsset, missingAsset, noFunction, type AssetStateClient } from '@/lib/avatar/assets';
import { CHAR_FILE, toVer } from '@/lib/avatar/model-version';
import { isUuid, type ViewSize } from '@/lib/avatar/rules';

// 2D 캐릭터 그림(/api/avatar/<id>)과 방향 그림 묶음(/api/avatar/<id>/views?s=)의 판(0024).
// 집주인이 그림을 다시 그리면 같은 주소에 다른 그림이 온다. 예전처럼 한 시간 캐시하면 다른 화면(걷기, 작은 그림)이 한 시간까지
// 옛 그림을 본다. 그래서 답에 판(그 그림을 그린 차례, DB의 queued_at 밀리초)을 ETag로 싣고 짧게 캐시한다:
//   1분 안에는 브라우저가 들고 있는 것을 쓰고, 그 뒤에는 서버에 물어 판이 같으면 304(본문 없음), 다르면 새 그림.
// 주소는 그대로다: 걷기 엔진·작은 그림·접속자 목록이 묻는 주소를 바꾸지 않고, 지운 그림을 그 기기에서 바로 버리는 길
// (forget-cache.ts의 dropCachedAvatar: 같은 주소를 캐시를 건너뛰어 다시 받는다)도 그대로 돈다.
// 3D 모형은 주소에 판을 붙이는 길(model-version.ts)이다: 크고(한 번 받으면 오래 쓴다) 걷기 엔진이 302를 따라간다.
// 판과 경로는 DB 함수가 준다(0024의 avatar_char_shown·avatar_views_shown. 관리자가 다시 그리는 동안은 옛 그림을 준다).
// 그 함수가 없는 옛 DB면 null을 돌려준다: 부르는 쪽이 예전 길(판 없이 한 시간)로 간다.

/** 판(ETag)이 붙은 그림 답: 1분 뒤에는 서버에 다시 묻는다 */
export const PIC_CACHE = 'private, max-age=60';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** 방향 그림 묶음 경로(rules.ts의 viewsPath와 같은 모양) */
const VIEWS_FILE = new RegExp(`^(${UUID})/views/(${UUID})\\.v1([ls])\\.webp$`);

export type PicKind = 'char' | 'views';
export type PicShown = { path: string; ver: number };

/**
 * avatar_char_shown·avatar_views_shown의 답. 경로는 그 그림의 그림 자리(방향 그림이면 그 크기의 자리)와 꼭 같아야 한다
 * (원본 사진 자리, 다른 그림, 다른 크기는 받지 않는다). 아니면 null
 */
export function readPicShown(raw: unknown, id: string, kind: PicKind, size: ViewSize = 'l'): PicShown | null {
  if (!isUuid(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ver = toVer(o.ver);
  if (ver === null || typeof o.path !== 'string') return null;
  const m = (kind === 'char' ? CHAR_FILE : VIEWS_FILE).exec(o.path);
  if (!m || m[2] !== id || (kind === 'views' && m[3] !== size)) return null;
  return { path: o.path, ver };
}

/** 판의 ETag(강한 비교). 그림과 방향 그림은 주소가 달라 서로 섞이지 않지만 글자로도 가른다 */
export function picTag(kind: PicKind, ver: number): string {
  return `"${kind === 'char' ? 'c' : 'v'}${ver}"`;
}

/** If-None-Match가 이 ETag를 가리키는가(여러 값, W/ 붙은 값, *) */
export function tagMatches(header: string | null, tag: string): boolean {
  if (!header) return false;
  return header.split(',').some((t) => {
    const s = t.trim();
    return s === '*' || s === tag || s === `W/${tag}`;
  });
}

/** 판이 붙은 그림 답의 머리 */
export function picHeaders(kind: PicKind, tag: string, size: number): Record<string, string> {
  return {
    'Content-Type': kind === 'char' ? 'image/png' : 'image/webp',
    'Content-Length': String(size),
    'Cache-Control': PIC_CACHE,
    ETag: tag,
    'X-Robots-Tag': 'noindex',
    'Content-Disposition': 'inline',
  };
}

/** 브라우저가 가진 판이 지금 판이다: 본문 없이(304) 다시 1분 */
export function notModified(tag: string): Response {
  return new Response(null, { status: 304, headers: { ETag: tag, 'Cache-Control': PIC_CACHE, 'X-Robots-Tag': 'noindex' } });
}

/** 그림 한 장이 없을 때의 답(있는지조차 알리지 않는다. 0003부터 같은 모양) */
export function hiddenPic(): Response {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

/** 보는 사람의 세션으로 만든 연결에서 쓰는 만큼만(시험에서 가짜를 넣을 수 있게) */
export type PicClient = AssetStateClient & {
  rpc: (
    fn: 'avatar_char_shown' | 'avatar_views_shown' | 'avatar_asset_state',
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  storage: {
    from: (bucket: string) => {
      download: (path: string) => PromiseLike<{ data: { size: number; stream: () => ReadableStream } | null; error: unknown }>;
    };
  };
};

/**
 * 판이 있는 DB(0024)의 그림 답(GET /api/avatar/<id>, /api/avatar/<id>/views?s=). 명단 손님인지는 부르는 쪽이 먼저 본다.
 * 순서: 경로와 판(DB, 보는 사람의 세션) → 없으면 404(방향 그림은 기다리면 생기는지 머리로) → 브라우저가 가진 판과 같으면 304 →
 * 보는 사람의 세션으로 내려받아(저장소 정책이 한 번 더 막는다) ETag와 함께 1분 캐시. 판 함수가 없으면(옛 DB) null
 */
export async function versionedPic(
  client: PicClient, request: Request, id: string, bucket: string, kind: PicKind, size: ViewSize = 'l',
): Promise<Response | null> {
  const none = () => (kind === 'char' ? hiddenPic() : hiddenAsset(null));
  let res: { data: unknown; error: unknown };
  try {
    res = await (kind === 'char'
      ? client.rpc('avatar_char_shown', { p_id: id })
      : client.rpc('avatar_views_shown', { p_id: id, p_size: size }));
  } catch {
    return none();
  }
  if (res.error) return noFunction(res.error) ? null : none();
  const shown = readPicShown(res.data, id, kind, size);
  if (!shown) return kind === 'char' ? hiddenPic() : missingAsset(client, id, 'views');
  const tag = picTag(kind, shown.ver);
  if (tagMatches(request.headers.get('if-none-match'), tag)) return notModified(tag);
  const { data: file, error } = await client.storage.from(bucket).download(shown.path);
  if (error || !file) return none();
  return new Response(file.stream(), { headers: picHeaders(kind, tag, file.size) });
}
