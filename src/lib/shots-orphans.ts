// 걷기 사진: 표(public.shots)에 줄이 없는 채 저장소에만 남은 내 파일을 가려낸다.
// 올린 뒤 표에 적기 전에 끊기면 이런 파일이 남는다. 갤러리에는 안 보여 손님이 지울 수 없는데 저장소 장수 상한
// (0014_guards.sql)에는 세어지므로, 올리기가 거절되면 이것부터 치운다.

export type StoredFile = { name: string; created_at?: string | null };

/** 올린 지 이만큼 지나지 않은 파일은 건드리지 않는다(다른 창이 지금 올리고 표에 적는 중일 수 있다) */
export const ORPHAN_MIN_AGE_MS = 10 * 60_000;

/** 치워도 되는 파일의 경로들(<uid>/<이름>). 표에 있는 것, 방금 올린 것, 올린 때를 모르는 것은 남긴다 */
export function orphanPaths(
  uid: string, files: readonly StoredFile[], known: readonly string[], nowMs: number, minAgeMs: number = ORPHAN_MIN_AGE_MS,
): string[] {
  const keep = new Set(known);
  const out: string[] = [];
  for (const f of files) {
    if (!f || typeof f.name !== 'string' || !f.name.endsWith('.jpg')) continue;
    const path = `${uid}/${f.name}`;
    if (keep.has(path)) continue;
    const at = typeof f.created_at === 'string' ? Date.parse(f.created_at) : NaN;
    if (!Number.isFinite(at) || nowMs - at < minAgeMs) continue;
    out.push(path);
  }
  return out;
}
