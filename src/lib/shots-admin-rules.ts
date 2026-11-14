// 걷기 사진 지우기(0022_shots_admin_delete.sql)의 사이트 쪽 순수 함수(node --test 로 바로 돈다):
// 관리 화면이 받는 장수·행사 합계·남은 정리 읽기, 묻는 말과 결과 말, 저장소 정리(버릴 목록 비우기와 폴더 훑기)의 순서와
// 저장소 경로 모양 확인. 누가 지울 수 있는지, 누구의 사진인지는 DB가 판정한다(tests/sql/rls.test.mjs의 0022 묶음).
// 집주인은 사진을 보지 않는다: 화면으로 가는 것은 사람마다 장수와 합계뿐이다(경로·장소·찍은 때는 받지 않는다).
// 경로는 서버의 저장소 정리(src/lib/shots-admin.ts가 연결을 넣어 부른다)에서만 다룬다.
import { missingFunction } from '@/lib/event-code';

export type ShotRole = 'guest' | 'family' | 'admin';

/** admin_shot_counts() 한 줄 */
export type ShotCount = {
  /** 사진을 가진 계정 id */
  user: string;
  /** 그 계정에 이어진 명단 이름(없으면 명단 밖) */
  name: string | null;
  role: ShotRole | null;
  /** 명단에서 뺀 줄인가 */
  removed: boolean;
  /** 들어온 행사 초대 코드(없으면 사람별 초대·이메일·입장 요청으로 들어왔거나 명단 밖) */
  eventId: string | null;
  eventLabel: string | null;
  shots: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLES: readonly string[] = ['guest', 'family', 'admin'];

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** 0 이상의 정수(아니면 0) */
const whole = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** 사람 줄은 DB가 많은 순으로 이만큼까지 준다(0022 admin_shot_counts의 limit과 같다) */
export const PEOPLE_SHOWN = 500;

/** DB가 준 사람 줄들을 읽는다. 모양이 틀린 줄과 장수가 없는 줄은 뺀다 */
export function asShotCounts(data: unknown): ShotCount[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    const shots = Math.floor(Number(o.shots));
    if (!isUuid(o.user_id) || !Number.isFinite(shots) || shots < 1) return [];
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : null;
    const eventId = isUuid(o.event_code_id) ? o.event_code_id : null;
    return [{
      user: o.user_id,
      name,
      role: typeof o.role === 'string' && ROLES.includes(o.role) ? (o.role as ShotRole) : null,
      removed: o.removed === true,
      eventId,
      eventLabel: eventId && typeof o.event_label === 'string' && o.event_label.trim() ? o.event_label.trim().slice(0, 40) : null,
      shots,
    }];
  });
}

export type EventShots = { id: string; label: string; people: number; shots: number };

/**
 * 행사마다 합계(admin_shot_events). DB가 행사마다 지우기(admin_shots_forget_event)와 같은 범위로 센 그대로다:
 * 그 코드로 들어온 손님 줄(명단에서 뺀 줄 포함, 가족·집주인으로 올린 줄 제외). 사람 줄이 500줄에서 잘려도 합계는 맞다.
 * 모양이 틀린 줄과 사진이 없는 줄은 뺀다. 순서는 DB가 정한 대로(사진이 많은 행사부터).
 */
export function asShotEvents(data: unknown): EventShots[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    const shots = whole(o.shots);
    if (!isUuid(o.id) || shots < 1) return [];
    const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 40) : '행사';
    return [{ id: o.id, label, people: whole(o.people), shots }];
  });
}

/**
 * 모두 합친 수와 저장소 정리가 남은 수(admin_shot_totals).
 * files: 저장소에서 아직 지우지 못한 파일, folders: 아직 훑지 못한 사람 폴더, waiting: 그 가운데 막 올라온 파일을 기다리느라
 * 10분 뒤로 미룬 폴더
 */
export type ShotTotals = { people: number; shots: number; files: number; folders: number; waiting: number };

export function asShotTotals(data: unknown): ShotTotals {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { people: 0, shots: 0, files: 0, folders: 0, waiting: 0 };
  const o = data as Record<string, unknown>;
  const folders = whole(o.folders);
  return { people: whole(o.people), shots: whole(o.shots), files: whole(o.files), folders, waiting: Math.min(whole(o.waiting), folders) };
}

/** 사람 줄이 잘렸을 때의 말(DB가 많은 순으로 PEOPLE_SHOWN줄까지 준다). 다 보이면 빈 말 */
export function peopleNote(shown: number, total: number): string {
  if (total <= shown) return '';
  return `사진이 많은 순으로 ${shown}명만 보여요(모두 ${total}명). 몇 분을 지우고 나면 다음 분들이 보여요. 행사마다 지우기는 여기 보이지 않는 분까지 지워요.`;
}

/** 사람 줄에 보일 이름 */
export function personName(row: Pick<ShotCount, 'name'>): string {
  return row.name ?? '명단에 없는 분';
}

/** 사람마다 지우기 전에 묻는 말 */
export function forgetPersonAsk(row: Pick<ShotCount, 'name' | 'shots'>): string {
  const who = row.name ? `「${row.name}」 님의` : '명단에 없는 분의';
  return `${who} 사진 ${row.shots}장을 모두 지울까요? 되돌릴 수 없어요.`;
}

/** 행사마다 지우기 전에 묻는 말(이름표 끝 글자에 따라 조사가 바뀌지 않게 「코드로」). 수는 DB가 센 합계 */
export function forgetEventAsk(e: Pick<EventShots, 'label' | 'people' | 'shots'>): string {
  return `「${e.label}」 코드로 들어온 손님 ${e.people}명의 사진 ${e.shots}장을 모두 지울까요? 되돌릴 수 없어요.`;
}

/** 서버 비밀 키가 없을 때(파일을 지울 수 없으면 표 줄도 지우지 않는다) */
export const SHOTS_NOT_READY = '서버 비밀 키가 없어 지금은 지울 수 없어요. 사진 파일까지 지울 수 있을 때 열려요.';
/** 비밀 키는 있는데 그 키로 저장소에 닿지 않을 때(키가 바뀌었거나 틀렸다, 저장소가 잠깐 답하지 않는다) */
export const SHOTS_KEY_BROKEN = '서버 비밀 키로 저장소에 닿지 않아 지금은 지울 수 없어요. 키를 확인하거나 잠시 뒤 다시 열어 주세요.';

type DbError = { code?: string } | null | undefined;

/** 칸을 불러오지 못했을 때의 말: 0022를 올리기 전, 관리자가 아님(42501 admin_only), 그 밖(끊김·시간 넘김) */
export function panelTrouble(error: DbError): string {
  if (missingFunction(error)) return '아직 쓸 수 없어요. DB에 걷기 사진 지우기(0022 마이그레이션)가 들어가면 열려요.';
  if (error?.code === '42501') return '집주인만 볼 수 있는 칸이에요.';
  return '걷기 사진 칸을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
}

/** 지우기 함수가 오류를 냈을 때의 말(표 줄은 하나도 지워지지 않았다) */
export function forgetTrouble(error: DbError): string {
  if (missingFunction(error)) return '아직 쓸 수 없어요. DB에 0022 마이그레이션이 들어가면 열려요.';
  if (error?.code === '42501') return '집주인만 지울 수 있어요.';
  return '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.';
}

export type ForgetKind = 'user' | 'event';
export type ForgetResult = { found: boolean; people: number; shots: number };

/** 지우기 함수의 답을 읽는다: 사람마다는 지운 장수(정수), 행사마다는 {found, people, shots} */
export function readForget(kind: ForgetKind, data: unknown): ForgetResult {
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v)) || 0);
  if (kind === 'user') return { found: true, people: n(data) > 0 ? 1 : 0, shots: n(data) };
  if (!data || typeof data !== 'object') return { found: false, people: 0, shots: 0 };
  const o = data as Record<string, unknown>;
  return { found: o.found === true, people: n(o.people), shots: n(o.shots) };
}

/**
 * 저장소 정리의 결과. removed: 저장소에서 지운 파일 수, left: 아직 남았을 수 있다,
 * failed: 저장소나 DB에 닿지 못해 멈췄다(false인데 left면 정한 시간을 다 써서 멈춘 것이다)
 */
export type CleanResult = { removed: number; left: boolean; failed: boolean };

function cleanTail(c: CleanResult): string {
  if (!c.left) return '';
  return c.failed
    ? ' 저장소에 닿지 않아 파일을 다 지우지 못했어요. 잠시 뒤 「지금 마저 지우기」를 눌러 주세요.'
    : ' 저장소의 파일은 이어서 지우고 있어요. 남은 수는 이 칸에 보여요.';
}

/** 지운 뒤의 말. 저장소 정리가 덜 끝났으면 왜(시간을 다 씀, 저장소에 닿지 않음)와 할 일을 붙인다 */
export function forgetDoneText(kind: ForgetKind, r: ForgetResult, c: CleanResult): string {
  if (!r.found) return '그 행사 초대 코드를 찾지 못했어요.';
  if (r.shots === 0) return `지울 사진이 없었어요. 이미 지워졌을 수 있어요.${cleanTail(c)}`;
  const head = kind === 'event' ? `손님 ${r.people}명의 사진 ${r.shots}장을 지웠어요.` : `사진 ${r.shots}장을 지웠어요.`;
  return `${head}${cleanTail(c)}`;
}

/** 「지금 마저 지우기」 뒤의 말 */
export function cleanDoneText(c: CleanResult): string {
  const done = c.removed > 0 ? `저장소에서 파일 ${c.removed}개를 지웠어요.` : '';
  if (!c.left) return done || '지금 지울 파일이 없어요.';
  const lead = done ? `${done} ` : '';
  return c.failed ? `${lead}저장소에 닿지 않아 다 지우지 못했어요. 잠시 뒤 다시 눌러 주세요.` : `${lead}남은 것은 이어서 지우고 있어요.`;
}

/** 저장소 정리가 남았을 때 관리 칸에 보일 말. canClean: 비밀 키로 지금 지울 수 있다(아니면 이어서 지운다고 말하지 않는다) */
export function pendingText(t: Pick<ShotTotals, 'files' | 'folders' | 'waiting'>, canClean: boolean): string {
  const parts: string[] = [];
  if (t.files > 0) parts.push(`지울 파일 ${t.files}개`);
  if (t.folders > 0) parts.push(`남은 파일이 있는지 살펴볼 사람 ${t.folders}명`);
  if (!parts.length) return '';
  const wait = t.waiting > 0 ? ` 그 가운데 ${t.waiting}명은 막 올라가던 파일이 있어 10분 뒤에 다시 살펴봐요.` : '';
  const how = canClean ? ' 이 화면을 열 때마다 이어서 지워요.' : '';
  return `저장소 정리가 남았어요: ${parts.join(', ')}.${wait}${how}`;
}

// ───────── 저장소 정리(서버가 비밀 키로). src/lib/shots-admin.ts가 연결을 넣어 부른다.

/**
 * 비밀 키로 지워도 되는 경로: 한 사람의 폴더 바로 아래, 사이트가 만드는 이름(src/lib/shots.ts uploadShot).
 * 0022의 shots_path_ok와 같은 모양이다(그쪽은 폴더가 그 사진 주인의 id인지까지 본다).
 * 비밀 키는 저장소 정책을 거치지 않으므로 다른 모양(다른 폴더로 넘어가는 .., 하위 폴더, 다른 확장자)은 지우지 않는다.
 */
export const SHOT_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{1,120}\.jpg$/;

export function isShotPath(p: unknown): p is string {
  return typeof p === 'string' && SHOT_PATH.test(p);
}

/** 누른 자리에서 정리를 기다리는 시간. 그 뒤는 응답을 보낸 뒤(after) 이어서 한다 */
export const CLEAN_NOW_MS = 6_000;
/** 응답을 보낸 뒤(after) 이어서 정리하는 시간 */
export const CLEAN_AFTER_MS = 40_000;
/** 버릴 목록을 한 번에 읽는 수(0022 shots_trash_list는 500까지 준다) */
export const TRASH_LIMIT = 100;
/** 막 올라온 파일은 건드리지 않는다(지금 올리고 표에 적는 중일 수 있다). shots-orphans의 ORPHAN_MIN_AGE_MS, 0022의 10분과 같다 */
export const SWEEP_MIN_AGE_MS = 10 * 60_000;
/** 폴더를 나열할 때 한 쪽의 줄 수와 쪽 수(한 사람 폴더는 0014 상한으로 보통 70개 안이다) */
export const FOLDER_PAGE = 100;
export const FOLDER_PAGES = 10;
/** 훑을 차례를 한 번에 읽는 수, 그중 한꺼번에 훑는 폴더 수, 차례를 읽는 횟수의 상한 */
export const SWEEP_BATCH = 20;
export const SWEEP_PARALLEL = 4;
export const SWEEP_ROUNDS = 50;

/** 한 폴더를 훑은 것: old 오래된 파일, young 막 올라온 파일(둘 다 사이트 모양 경로), partial 끝까지 읽지 못함 */
export type FolderRead = { old: string[]; young: string[]; partial: boolean };

export type CleanOps = {
  /** 버릴 목록 앞쪽(최대 limit개). 읽지 못하면 null */
  list: (limit: number) => Promise<unknown[] | null>;
  /** 저장소에서 지운다. 요청이 성공하면 true(이미 없는 파일도 성공) */
  remove: (paths: string[]) => Promise<boolean>;
  /** 버릴 목록에서 뺀다. 성공하면 true */
  done: (paths: string[]) => Promise<boolean>;
  /** 훑을 차례가 된 폴더(계정 id)들. 읽지 못하면 null */
  folders: (limit: number) => Promise<unknown[] | null>;
  /** 저장소에서 한 사람 폴더의 한 쪽(offset부터 limit줄, 이름순). 읽지 못하면 null */
  page: (uid: string, offset: number, limit: number) => Promise<unknown[] | null>;
  /** 훑은 결과를 DB에 넘긴다(표 줄 없는 old를 버릴 목록에, 차례에서 빼거나 미룸). 성공하면 true */
  swept: (uid: string, read: FolderRead) => Promise<boolean>;
};

/** 지금 시각과 멈출 시각(밀리초) */
export type Clock = { now: () => number; until: number };

async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * 저장소가 나열한 한 폴더의 줄들에서 사이트가 만든 모양의 파일만 골라 오래된 것과 막 올라온 것으로 나눈다.
 * 하위 폴더(id 없음), 다른 모양(다른 확장자 등), 올린 때를 모르는 것은 뺀다(건드리지 않는다).
 */
export function splitFolder(uid: string, entries: readonly unknown[], nowMs: number, minAgeMs = SWEEP_MIN_AGE_MS): Omit<FolderRead, 'partial'> {
  const old: string[] = [];
  const young: string[] = [];
  if (!isUuid(uid)) return { old, young };
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const f = e as Record<string, unknown>;
    if (typeof f.id !== 'string' || !f.id || typeof f.name !== 'string') continue;
    const path = `${uid}/${f.name}`;
    if (!isShotPath(path)) continue;
    const at = typeof f.created_at === 'string' ? Date.parse(f.created_at) : NaN;
    if (!Number.isFinite(at)) continue;
    (nowMs - at >= minAgeMs ? old : young).push(path);
  }
  return { old, young };
}

/** 한 사람 폴더를 쪽마다 끝까지(FOLDER_PAGES쪽까지) 읽는다. 읽지 못하면 null */
export async function readFolder(page: CleanOps['page'], uid: string, nowMs: number): Promise<FolderRead | null> {
  const old: string[] = [];
  const young: string[] = [];
  for (let k = 0; k < FOLDER_PAGES; k++) {
    const got = await attempt(() => page(uid, k * FOLDER_PAGE, FOLDER_PAGE));
    if (!Array.isArray(got)) return null;
    const s = splitFolder(uid, got, nowMs);
    old.push(...s.old);
    young.push(...s.young);
    if (got.length < FOLDER_PAGE) return { old: [...new Set(old)], young: [...new Set(young)], partial: false };
  }
  return { old: [...new Set(old)], young: [...new Set(young)], partial: true };
}

/**
 * 버릴 목록을 비운다: 읽고 → 저장소에서 지우고 → 지운 것만 목록에서 뺀다. 저장소 지우기가 안 되면 목록은 그대로 두고 멈춘다
 * (다음 차례에 다시). 모양이 틀린 경로는 저장소를 건드리지 않고 목록에서만 뺀다(남겨 두면 다음 차례도 막힌다).
 */
export async function drainTrash(ops: Pick<CleanOps, 'list' | 'remove' | 'done'>, clock: Clock): Promise<CleanResult> {
  let removed = 0;
  for (;;) {
    if (clock.now() >= clock.until) return { removed, left: true, failed: false };
    const listed = await attempt(() => ops.list(TRASH_LIMIT));
    if (!Array.isArray(listed)) return { removed, left: true, failed: true };
    if (listed.length === 0) return { removed, left: false, failed: false };
    const good = [...new Set(listed.filter(isShotPath))];
    const bad = [...new Set(listed.filter((p): p is string => typeof p === 'string' && !isShotPath(p)))];
    if (good.length && !(await attempt(() => ops.remove(good)))) return { removed, left: true, failed: true };
    if (!(await attempt(() => ops.done([...good, ...bad])))) return { removed, left: true, failed: true };
    removed += good.length;
    if (listed.length < TRASH_LIMIT) return { removed, left: false, failed: false };
  }
}

/**
 * 차례가 된 폴더를 훑는다: 저장소에서 나열해 DB에 넘긴다(표 줄 없는 오래된 파일이 버릴 목록에 오른다).
 * 한 번에 SWEEP_PARALLEL개씩. 하나라도 읽거나 넘기지 못하면 멈춘다(그 폴더는 차례에 남는다).
 */
export async function sweepFolders(ops: Pick<CleanOps, 'folders' | 'page' | 'swept'>, clock: Clock): Promise<Omit<CleanResult, 'removed'>> {
  for (let round = 0; round < SWEEP_ROUNDS; round++) {
    if (clock.now() >= clock.until) return { left: true, failed: false };
    const listed = await attempt(() => ops.folders(SWEEP_BATCH));
    if (!Array.isArray(listed)) return { left: true, failed: true };
    const uids = [...new Set(listed.filter(isUuid))];
    for (let i = 0; i < uids.length; i += SWEEP_PARALLEL) {
      if (clock.now() >= clock.until) return { left: true, failed: false };
      const oks = await Promise.all(uids.slice(i, i + SWEEP_PARALLEL).map(async (uid) => {
        const read = await readFolder(ops.page, uid, clock.now());
        return read !== null && (await attempt(() => ops.swept(uid, read))) === true;
      }));
      if (oks.includes(false)) return { left: true, failed: true };
    }
    if (listed.length < SWEEP_BATCH || uids.length === 0) return { left: false, failed: false };
  }
  return { left: true, failed: false };
}

/**
 * 저장소 정리: 버릴 목록 비우기 → 차례가 된 폴더 훑기 → 다시 버릴 목록 비우기.
 * 알고 있는 경로(지운 사진의 파일)를 먼저 지우고, 폴더에서 찾은 것(표 줄 없이 남은 파일)을 이어서 지운다.
 * 정한 시각(clock.until)이 되면 멈추고 남았다고 알린다(다음 차례에 이어서). 저장소나 DB에 닿지 못하면 그 자리에서 멈춘다
 * (버릴 목록과 훑을 차례는 그대로 남는다).
 */
export async function cleanStorage(ops: CleanOps, clock: Clock): Promise<CleanResult> {
  const first = await drainTrash(ops, clock);
  if (first.left) return first;
  const swept = await sweepFolders(ops, clock);
  const second = await drainTrash(ops, clock);
  return { removed: first.removed + second.removed, left: swept.left || second.left, failed: swept.failed || second.failed };
}
