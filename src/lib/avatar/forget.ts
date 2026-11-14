import { VIEW_SIZES, isUuid, modelPath, viewsPath } from '@/lib/avatar/rules';

// 캐릭터를 지울 때 저장소에서 무엇을 어떤 순서로 지우는지 한곳에서 정한다.
// 걷기 화면의 지우기(DELETE /api/avatar/<id>)와 「내 캐릭터」 화면의 지우기가 함께 쓴다.
// 지우는 길을 새로 낼 때도 여기를 거친다: 캐릭터 그림에서 나온 파생 파일(방향 그림 묶음, 3D 모형)이 저장소에 남지 않게.
// DB가 무엇을 비우는지는 avatar_forget(p_part)과 같아야 한다(supabase/migrations/0016_avatar_models.sql).

export type ForgetPart = 'original' | 'character' | 'both';

/** 지울 줄에서 읽어 온 것. 보는 사람의 세션으로 읽으므로 내 줄만 온다 */
export type ForgetRow = {
  id: string;
  user_id: string;
  status: string;
  original_path: string | null;
  image_path: string | null;
};

export type ForgetFiles = {
  /** DB에 적기 전에 지울 파일. 못 지우면 DB는 그대로 둔다(다시 누르면 된다) */
  before: string[];
  /** DB에 적은 뒤 한 번 더 지울 파일(방향 그림 묶음과 3D 모형) */
  after: string[];
};

/** 그림 하나에서 나온 파생 파일(방향 그림 묶음 두 크기와 3D 모형)의 경로. 줄의 id 모양이 이상하면 짓지 않는다 */
export function derivedFiles(row: Pick<ForgetRow, 'id' | 'user_id'>): string[] {
  if (!isUuid(row.user_id) || !isUuid(row.id)) return [];
  return [...VIEW_SIZES.map((size) => viewsPath(row.user_id, row.id, size)), modelPath(row.user_id, row.id)];
}

/**
 * 지울 파일 목록.
 * - 원본: 원본을 지우라고 했거나, 아직 그리는 중이라 작업째 거둘 때(DB가 원본 경로를 비우므로 파일도 지금 지워야 남지 않는다).
 * - 캐릭터 그림과 파생 파일(방향 그림 묶음, 3D 모형): 그림을 지우라고 했을 때. 파생 파일은 그림에서 나온 것이라 늘 그림과 함께 지운다.
 *   파생 파일의 경로는 줄에 적혀 있지 않고 규칙으로 정해진다. 아직 안 만들어 파일이 없어도 저장소는 실패로 치지 않는다.
 */
export function forgetFiles(row: ForgetRow, part: ForgetPart): ForgetFiles {
  const inFlight = row.status === 'pending' || row.status === 'queued' || row.status === 'drawing';
  const character = part === 'character' || part === 'both';
  const derived = character ? derivedFiles(row) : [];
  const before = [
    part !== 'character' || inFlight ? row.original_path : null,
    character ? row.image_path : null,
    ...derived,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return { before, after: derived };
}

/** 보는 사람의 세션으로 만든 연결에서 쓰는 만큼만 받는다(시험에서 가짜를 넣을 수 있게) */
export type ForgetClient = {
  rpc: (
    fn: 'avatar_forget',
    args: { p_id: string; p_part: ForgetPart },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  storage: { from: (bucket: string) => { remove: (paths: string[]) => PromiseLike<{ error: unknown }> } };
};

export type ForgetResult = 'done' | 'files_failed' | 'record_failed';

/**
 * 지우기 한 번. 순서가 중요하다.
 * 1. 파일을 먼저 지운다. 실패하면 DB는 그대로라 다시 누르면 된다. 없는 파일은 실패가 아니다.
 * 2. DB에 적는다(avatar_forget). 이때부터 그 그림과 파생 파일은 누구에게도 열리지 않고, 일꾼이 뒤늦게 묶음이나 모형을
 *    정리하려 하면 DB가 거절한다(그러면 일꾼이 방금 올린 파일을 스스로 거둔다).
 * 3. 파생 파일을 한 번 더 지운다. 1과 2 사이에 일꾼이 묶음이나 모형을 막 올리고 정리까지 마쳤을 수 있다.
 *    지우기는 이미 끝났으므로 여기서 실패해도 조용히 넘어간다
 *    (남았다면 avatar_views_strays()·avatar_model_strays()로 찾아 치운다).
 */
export async function forgetAvatar(
  client: ForgetClient,
  bucketName: string,
  row: ForgetRow,
  part: ForgetPart,
): Promise<ForgetResult> {
  const files = forgetFiles(row, part);
  const bucket = client.storage.from(bucketName);
  if (files.before.length) {
    const { error } = await bucket.remove(files.before);
    if (error) return 'files_failed';
  }
  const { data: done, error } = await client.rpc('avatar_forget', { p_id: row.id, p_part: part });
  if (error || done !== true) return 'record_failed';
  if (files.after.length) {
    try {
      await bucket.remove(files.after);
    } catch {
      // 위 3번: 조용히 넘어간다
    }
  }
  return 'done';
}
