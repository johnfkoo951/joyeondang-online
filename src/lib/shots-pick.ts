// 걷기 사진 갤러리에서 여러 장 고르기와 한 번에 지우기(순수 함수, node --test 로 바로 돈다).
// 실제로 지우는 일(저장소·표)은 src/lib/shots.ts의 deleteShots가 이 순서를 따라 한다. 누구의 사진을 지울 수 있는지는
// DB가 정한다(0004 정책: 본인 것만. 집주인이 지우는 길은 0022와 src/lib/shots-admin-rules.ts).

/**
 * 갤러리와 개인정보 안내에 같이 쓰는 한 줄: 누가 보는지, 집주인이 무엇을 할 수 있는지.
 * 집주인은 누구의 사진이든(가족·집주인 것도) 사람마다 언제든 지울 수 있고, 행사마다는 그 행사로 들어온 손님 사진이다(0022).
 */
export const SHOTS_PRIVACY_LINE = '나만 볼 수 있어요. 집주인은 사진을 보지 않지만, 필요하면 사람마다 또는 행사마다 한꺼번에 지울 수 있어요.';

export type KeyLike = { key: string; isComposing?: boolean; keyCode?: number; defaultPrevented?: boolean };

/**
 * 고르는 중에 눌린 키를 어떻게 할지. 'stop': 고르기를 끝낸다, 'hold': 지우는 중이라 끝내지 않고 잡기만 한다,
 * 'pass': 이 화면의 몫이 아니다(Esc가 아님, 한글 조합 중, 이미 다른 곳이 처리함, 크게 보기 같은 창이 떠 있음).
 * 'stop'과 'hold'는 기본 동작을 막아 걷기 시트가 함께 닫히지 않게 한다. 창이 떠 있는지는 Esc일 때만 묻는다.
 */
export function pickKey(e: KeyLike, o: { busy: boolean; dialogOpen: () => boolean }): 'pass' | 'hold' | 'stop' {
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return 'pass';
  if (o.dialogOpen()) return 'pass';
  return o.busy ? 'hold' : 'stop';
}

/** 한 번에 보내는 장수(저장소 지우기와 표 지우기를 이만큼씩 묶는다) */
export const DELETE_BATCH = 20;

type Item = { id: string; path: string };

/** 하나를 고르거나 푼다(새 Set을 돌려준다) */
export function togglePick(picked: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(picked);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** 지금 목록의 사진을 모두 고른다 */
export function pickAll(items: readonly { id: string }[]): Set<string> {
  return new Set(items.map((s) => s.id));
}

/** 목록에 남아 있는 것만 고른 채로 둔다(다른 창이나 집주인이 지운 사진은 뺀다) */
export function keepPicked(picked: ReadonlySet<string>, items: readonly { id: string }[]): Set<string> {
  const live = new Set(items.map((s) => s.id));
  return new Set([...picked].filter((id) => live.has(id)));
}

/** 목록의 사진을 모두 골랐는가(사진이 없으면 아니다) */
export function allPicked(picked: ReadonlySet<string>, items: readonly { id: string }[]): boolean {
  return items.length > 0 && items.every((s) => picked.has(s.id));
}

/** 고른 순서가 아니라 목록 순서(최신 순)로, 같은 사진은 한 번만 */
export function pickedInOrder<T extends { id: string }>(items: readonly T[], picked: ReadonlySet<string>): T[] {
  const seen = new Set<string>();
  return items.filter((s) => picked.has(s.id) && !seen.has(s.id) && seen.add(s.id));
}

export type DeleteOps = {
  /** 저장소에서 파일들을 지운다. 요청이 성공하면 true(이미 없는 파일도 성공으로 친다) */
  removeFiles: (paths: string[]) => Promise<boolean>;
  /** 표에서 줄들을 뺀다. 요청이 성공하면 true(이미 없는 줄도 성공으로 친다) */
  removeRows: (ids: string[]) => Promise<boolean>;
};

/**
 * 여러 장을 묶음마다 지운다: 파일을 먼저 지우고, 그게 되면 표에서 뺀다(한 장 지우기와 같은 순서).
 * 파일 지우기가 안 되면 그 묶음의 표 줄은 그대로 둔다(갤러리에 남아 다시 지울 수 있다). 파일은 지웠는데 표 빼기가
 * 안 되면 그 줄도 남는다: 다시 지우면 파일은 이미 없으니 표만 빠진다. 한 묶음이 안 돼도 다음 묶음은 해 본다.
 * 지운 사진의 id를 목록 순서대로 돌려준다(나머지는 그대로 남아 있다).
 */
export async function deleteInBatches(list: readonly Item[], ops: DeleteOps, size = DELETE_BATCH): Promise<string[]> {
  const seen = new Set<string>();
  const items = list.filter((s) => s && typeof s.id === 'string' && typeof s.path === 'string' && !seen.has(s.id) && seen.add(s.id));
  const step = Math.max(1, Math.floor(size));
  const done: string[] = [];
  for (let i = 0; i < items.length; i += step) {
    const part = items.slice(i, i + step);
    let ok = false;
    try {
      ok = (await ops.removeFiles(part.map((s) => s.path))) && (await ops.removeRows(part.map((s) => s.id)));
    } catch {
      ok = false;
    }
    if (ok) done.push(...part.map((s) => s.id));
  }
  return done;
}

/** 지우기 전에 묻는 말 */
export function pickedDeleteAsk(n: number): string {
  return `${n}장을 지울까요? 되돌릴 수 없어요.`;
}

/** 지운 뒤의 말. 덜 지웠으면 남은 장수와 할 일을 알린다(남은 사진은 고른 채로 둔다) */
export function pickedDeleteResult(asked: number, done: number): string {
  if (asked <= 0) return '';
  if (done >= asked) return `${asked}장을 지웠어요.`;
  if (done <= 0) return `지우지 못했어요. 고른 ${asked}장은 그대로 있어요. 잠시 뒤에 다시 지워 주세요.`;
  return `${asked}장 가운데 ${done}장을 지웠어요. 남은 ${asked - done}장은 고른 채로 두었어요. 잠시 뒤에 다시 지워 주세요.`;
}

// ───────── 화면이 영어일 때(같은 뜻, 같은 차례). 한국어 말은 위 그대로다
/** SHOTS_PRIVACY_LINE의 영어 */
export const SHOTS_PRIVACY_LINE_EN = 'Only you can see them. The host never looks at your photos, but can delete them all at once, per person or per event, if needed.';

const photos = (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'}`;

/** pickedDeleteAsk의 영어 */
export function pickedDeleteAskEn(n: number): string {
  return `Delete ${photos(n)}? This can’t be undone.`;
}

/** pickedDeleteResult의 영어 */
export function pickedDeleteResultEn(asked: number, done: number): string {
  if (asked <= 0) return '';
  if (done >= asked) return `Deleted ${photos(asked)}.`;
  if (done <= 0) {
    return asked === 1
      ? 'Couldn’t delete it. The photo you picked is still here. Please try again in a moment.'
      : `Couldn’t delete them. The ${asked} photos you picked are still here. Please try again in a moment.`;
  }
  const left = asked - done;
  return `Deleted ${done} of ${asked} photos. The other ${photos(left)} ${left === 1 ? 'is' : 'are'} still picked. Please try again in a moment.`;
}

/** 지금 말의 묻는 말과 결과 말(갤러리 화면이 같은 이름으로 쓴다) */
export function pickWords(lang: 'ko' | 'en'): { pickedDeleteAsk: (n: number) => string; pickedDeleteResult: (asked: number, done: number) => string } {
  return lang === 'en'
    ? { pickedDeleteAsk: pickedDeleteAskEn, pickedDeleteResult: pickedDeleteResultEn }
    : { pickedDeleteAsk, pickedDeleteResult };
}
