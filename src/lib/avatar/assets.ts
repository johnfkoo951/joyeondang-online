// 걷기용 파생 파일(방향 그림 묶음 /views, 3D 모형 /model)이 없을 때의 답을 한곳에서 정한다.
// 발표 자리처럼 손님 수십 명이 한꺼번에 걸으면, 같은 사진 캐릭터의 없는 파일을 손님마다 몇 번씩 다시 묻게 된다.
// 그래서 본문 없는 404에 머리 X-Avatar-Asset을 붙인다:
//   pending  아직 만드는 중이라 나중에 생길 수 있다. 걷기 엔진은 사이를 두고 다시 묻는다
//            (src/walk/avatar.ts: 묶음은 VIEWS_RECHECK_MS 45·90·180·360초 뒤, 모형은 MODEL_RECHECK_MS 40·90·240·600초 뒤와
//            그 뒤 원하는 동안 MODEL_SLOW_MS 4분마다)
//   none     만들 계획이 없다(그런 그림이 없음, 볼 수 없음, 실패로 굳음, 동의 전 옛 캐릭터, 기능이 꺼짐). 그 화면에서 다시 묻지 않는다
//   (없음)   알 수 없다(DB가 잠깐 안 됨 등). 걷기 엔진은 머리가 없던 옛 서버 때처럼 한다
// 무엇이 pending이고 none인지는 DB의 avatar_asset_state()가 정한다(supabase/migrations/0016_avatar_models.sql).

export type AssetKind = 'views' | 'model';
export type AssetHint = 'pending' | 'none';
export const ASSET_HEADER = 'X-Avatar-Asset';

/**
 * DB의 avatar_asset_state() 답을 머리 값으로. ready는 경로 함수가 길을 주지 않은 바로 뒤에 생긴 것이라
 * 조금 뒤 다시 물으면 된다(pending). 모르는 답은 null(머리를 붙이지 않는다)
 */
export function assetHint(raw: unknown): AssetHint | null {
  if (raw === 'pending' || raw === 'ready') return 'pending';
  if (raw === 'none') return 'none';
  return null;
}

/**
 * 운영 사이트의 끄기 스위치(일꾼과 같은 이름): AVATAR_VIEWS=0이면 방향 그림 묶음, AVATAR_MODELS=0이면 3D 모형을
 * 더 만들지 않는다고 보고 없는 파일을 none으로 알린다(DB에 묻지 않는다). 이미 있는 파일은 그대로 준다
 */
export function assetOff(kind: AssetKind, env: Record<string, string | undefined> = process.env): boolean {
  return (kind === 'views' ? env.AVATAR_VIEWS : env.AVATAR_MODELS) === '0';
}

/**
 * DB 함수가 아직 없다는 오류인가(그 마이그레이션을 올리기 전). PostgREST는 PGRST202, Postgres는 42883으로 알린다.
 * 경로 함수가 없으면 그 파일을 만드는 기능 자체가 아직 없으므로 none이다
 */
export function noFunction(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'PGRST202' || code === '42883';
}

/** 본문 없는 404. 브라우저에 남기지 않고 색인하지 않는다. 머리 값을 알면 붙인다 */
export function hiddenAsset(hint: AssetHint | null): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (hint) headers[ASSET_HEADER] = hint;
  return new Response(null, { status: 404, headers });
}

/** 보는 사람의 세션으로 만든 연결에서 쓰는 만큼만 받는다(시험에서 가짜를 넣을 수 있게) */
export type AssetStateClient = {
  rpc: (
    fn: 'avatar_asset_state',
    args: { p_id: string; p_kind: AssetKind },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * 경로 함수가 길을 주지 않았을 때(명단 손님이 물었는데 파일이 없다): 기다리면 생기는지 DB에 물어 404에 붙인다.
 * 기능을 꺼 두었으면 묻지 않고 none. DB 함수가 없거나(0016을 올리기 전) 오류면 머리 없이(알 수 없음)
 */
export async function missingAsset(
  client: AssetStateClient,
  id: string,
  kind: AssetKind,
  env: Record<string, string | undefined> = process.env,
): Promise<Response> {
  if (assetOff(kind, env)) return hiddenAsset('none');
  try {
    const { data, error } = await client.rpc('avatar_asset_state', { p_id: id, p_kind: kind });
    return hiddenAsset(error ? null : assetHint(data));
  } catch {
    return hiddenAsset(null);
  }
}
