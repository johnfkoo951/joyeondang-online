// 행사 초대 코드(0018_event_codes.sql). 발표 같은 자리에서 청중이 코드(QR) 하나로 한꺼번에 들어온다.
// 들어오는 쪽(초대장 폼, 구글에서 돌아오는 곳)과 관리 화면이 함께 쓰는 순수 함수만 둔다(node --test 로 바로 돈다).
// 누가 들어오는지는 DB가 판정한다: 여기서는 순서(사람별 초대 먼저)와 결과를 사람이 읽는 말로 바꾸는 일, 관리 화면의 입력을
// DB와 같은 범위로 맞추는 일만 한다.

/** claim_invite와 claim_event_code의 결과를 한데 모은 것 */
export type ClaimOutcome =
  | 'guest'
  | 'family'
  | 'admin' // 들어왔다(이번에, 또는 이미)
  | 'invalid' // 없는 코드, 끝난 사람별 초대
  | 'taken' // 사람별 초대가 이미 다른 계정과 이어져 있다
  | 'already' // 이 계정은 이미 다른 이름으로 들어와 있다(사람별 초대)
  | 'ended' // 행사 코드가 끝났거나 거둬졌다
  | 'full' // 행사 코드의 자리가 다 찼다
  | 'blocked' // 명단에서 뺀 계정
  | 'login' // 로그인이 풀렸다
  | 'error'; // 확인하지 못했다(연결·서버)

export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

const FROM_DB: Record<string, ClaimOutcome> = {
  guest: 'guest',
  family: 'family',
  admin: 'admin',
  invalid: 'invalid',
  taken: 'taken',
  already: 'already',
  ended: 'ended',
  full: 'full',
  blocked: 'blocked',
  login_required: 'login',
};

function fromDb(value: unknown): ClaimOutcome {
  return (typeof value === 'string' && FROM_DB[value]) || 'invalid';
}

/** 함수가 아직 없다(0018을 올리기 전): PostgREST가 스키마에서 못 찾음(PGRST202), Postgres의 undefined_function(42883) */
export function missingFunction(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

export function joinedRole(outcome: ClaimOutcome): outcome is 'guest' | 'family' | 'admin' {
  return outcome === 'guest' || outcome === 'family' || outcome === 'admin';
}

/**
 * 코드 하나로 들어오기: 사람별 초대(claim_invite)를 먼저, 그 답이 invalid일 때만 행사 코드(claim_event_code).
 * 행사 코드 함수가 아직 없으면(0018 전) 사람별 초대의 답(invalid)을 그대로 돌려준다.
 */
export async function claimAnyCode(rpc: Rpc, code: string): Promise<ClaimOutcome> {
  const invite = await rpc('claim_invite', { p_code: code });
  if (invite.error) return 'error';
  const first = fromDb(invite.data);
  if (first !== 'invalid') return first;
  const event = await rpc('claim_event_code', { p_code: code });
  if (event.error) return missingFunction(event.error) ? 'invalid' : 'error';
  return fromDb(event.data);
}

export type ClaimNote = { ok: boolean; message: string };

/** 초대장 폼에 보일 말 */
export function claimNote(outcome: ClaimOutcome): ClaimNote {
  if (joinedRole(outcome)) return { ok: true, message: CLAIM_OK };
  return { ok: false, message: CLAIM_TROUBLE[outcome] };
}

const CLAIM_OK = '확인됐어요. 어서 오세요.';
const CLAIM_OK_EN = "You're confirmed. Welcome in.";

type Trouble = Exclude<ClaimOutcome, 'guest' | 'family' | 'admin'>;
const CLAIM_TROUBLE: Record<Trouble, string> = {
  invalid: '쓸 수 없는 초대 코드예요. 기간이 지났거나 잘못 적었을 수 있어요.',
  taken: '이 초대 코드는 이미 다른 계정과 이어져 있어요. 가족에게 알려 주세요.',
  already: '이 계정은 이미 다른 이름으로 들어와 있어요.',
  ended: '이 행사 초대 코드는 받는 시간이 끝났어요. 행사를 연 분께 알려 주세요.',
  full: '이 행사 초대 코드는 자리가 다 찼어요. 행사를 연 분께 알려 주세요.',
  blocked: '이 계정은 지금 들어올 수 없어요. 가족에게 알려 주세요.',
  login: '로그인이 풀린 것 같아요. 다시 들어와 주세요.',
  error: '확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
};
// 화면이 영어일 때(같은 뜻). 서버 액션은 한국어를 돌려주고, 화면이 lib/messages-en으로 옮긴다
const CLAIM_TROUBLE_EN: Record<Trouble, string> = {
  invalid: "This invite code can't be used. It may have expired or been typed wrong.",
  taken: 'This invite code is already linked to another account. Please let the family know.',
  already: 'This account is already in under another name.',
  ended: 'This event invite code has closed. Please let the event organizer know.',
  full: 'This event invite code is full. Please let the event organizer know.',
  blocked: "This account can't come in right now. Please let the family know.",
  login: 'You seem to be signed out. Please sign in again.',
  error: "We couldn't check it. Please try again in a moment.",
};

/** 이 파일이 내는 초대 말(한국어 → 영어). 초대장 폼이 서버가 돌려준 말을 옮길 때 쓴다(lib/messages-en) */
export const CLAIM_WORDS_EN: Readonly<Record<string, string>> = {
  [CLAIM_OK]: CLAIM_OK_EN,
  ...Object.fromEntries((Object.keys(CLAIM_TROUBLE) as Trouble[]).map((k) => [CLAIM_TROUBLE[k], CLAIM_TROUBLE_EN[k]])),
};

/** 구글에서 돌아온 직후 한 번 보여 줄 결과의 이름(쿠키 값). 들어왔으면 역할, 아니면 invite_<까닭> */
export function flashKey(outcome: ClaimOutcome): string {
  return joinedRole(outcome) ? outcome : `invite_${outcome}`;
}

/** 로그인 직후 한 번 보여 줄 말(수첩과 초대장 화면이 같이 쓴다). 역할은 로그인 결과(sync_my_roster)이기도 하다 */
export const FLASH_WORD: Record<string, string> = {
  guest: '확인됐어요. 어서 오세요.',
  family: '가족으로 들어왔어요.',
  admin: '집주인으로 들어왔어요.',
  visitor: '구글 계정으로 들어왔어요. 아직 명단에서 찾지 못해서 확인이 필요해요.',
  invite_invalid: '초대 코드를 쓸 수 없었어요. 기간이 지났거나 잘못 적었을 수 있어요.',
  invite_taken: '이 초대 코드는 이미 다른 계정과 이어져 있어요.',
  invite_already: '이 계정은 이미 다른 이름으로 들어와 있어요.',
  invite_ended: CLAIM_TROUBLE.ended,
  invite_full: CLAIM_TROUBLE.full,
  invite_blocked: CLAIM_TROUBLE.blocked,
  invite_login: CLAIM_TROUBLE.login,
  invite_error: '초대 코드를 확인하지 못했어요. 아래에서 코드를 한 번 더 넣어 주세요.',
};

/** FLASH_WORD의 영어(같은 열쇠). 화면이 영어일 때 같은 자리에 보인다 */
export const FLASH_WORD_EN: Record<string, string> = {
  guest: CLAIM_OK_EN,
  family: 'You came in as family.',
  admin: 'You came in as the host.',
  visitor: "You came in with your Google account. We couldn't find you on the guest list yet, so we need to check.",
  invite_invalid: "The invite code couldn't be used. It may have expired or been typed wrong.",
  invite_taken: 'This invite code is already linked to another account.',
  invite_already: CLAIM_TROUBLE_EN.already,
  invite_ended: CLAIM_TROUBLE_EN.ended,
  invite_full: CLAIM_TROUBLE_EN.full,
  invite_blocked: CLAIM_TROUBLE_EN.blocked,
  invite_login: CLAIM_TROUBLE_EN.login,
  invite_error: "We couldn't check the invite code. Please enter it once more below.",
};

// ───────── 들어오기 전에 엿보기(event_code_peek): 행사 코드면 이름표와 상태, 아니면 null

export type EventPeek = { label: string; state: 'open' | 'ended' | 'full' };

export function asEventPeek(data: unknown): EventPeek | null {
  if (!data || typeof data !== 'object') return null;
  const { label, state } = data as Record<string, unknown>;
  if (typeof label !== 'string' || !label.trim()) return null;
  if (state !== 'open' && state !== 'ended' && state !== 'full') return null;
  return { label: label.slice(0, 40), state };
}

// ───────── 관리 화면: 만들기 입력(DB admin_create_event_code와 같은 범위)

export const EVENT_HOURS = [1, 2, 3, 4, 6, 8, 12, 24, 48, 72] as const;
export const EVENT_HOURS_DEFAULT = 4;
export const EVENT_PEOPLE_MAX = 500;
export const EVENT_PEOPLE_DEFAULT = 120;

export function eventHours(raw: unknown): number {
  const n = Number(raw);
  return (EVENT_HOURS as readonly number[]).includes(n) ? n : EVENT_HOURS_DEFAULT;
}

export function eventPeople(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return EVENT_PEOPLE_DEFAULT;
  return Math.min(n, EVENT_PEOPLE_MAX);
}

const KST_DAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** 이름표: 빈칸을 하나로, 40자까지. 비었으면 「11월 12일 행사」(한국 시간 오늘) */
export function eventLabel(raw: unknown, now: Date): string {
  const label = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  if (label) return label;
  const parts = Object.fromEntries(KST_DAY.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.month}월 ${parts.day}일 행사`;
}

/** 끝나는 때를 한국 시간으로(예: 11. 12. 21:30) */
export function formatKst(iso: string): string {
  return KST_TIME.format(new Date(iso));
}

/** 손님이 찍을 주소. 코드는 4자씩 끊어 읽기 쉽게(들어오는 쪽이 하이픈을 지우고 맞춰 본다) */
export function joinLink(site: string, code: string): string {
  return `${site.replace(/\/+$/, '')}/join?c=${encodeURIComponent(code)}`;
}

// ───────── 관리 화면: 목록(admin_event_codes)

export type EventRow = {
  id: string;
  label: string;
  expires_at: string;
  max_uses: number;
  used: number;
  revoked_at: string | null;
  created_at: string;
  /** 그 코드로 들어와 지금 명단에 남아 있는 사람 수 */
  active: number;
};

export type EventState = 'open' | 'full' | 'ended' | 'revoked';

export const EVENT_STATE_LABEL: Record<EventState, string> = {
  open: '받는 중',
  full: '자리가 다 참',
  ended: '끝남',
  revoked: '거둠',
};

export function eventState(row: Pick<EventRow, 'expires_at' | 'revoked_at' | 'used' | 'max_uses'>, now: Date): EventState {
  if (row.revoked_at) return 'revoked';
  if (now.getTime() >= Date.parse(row.expires_at)) return 'ended';
  if (row.used >= row.max_uses) return 'full';
  return 'open';
}

export function asEventRows(data: unknown): EventRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.expires_at !== 'string') return [];
    return [{
      id: o.id,
      label: o.label,
      expires_at: o.expires_at,
      max_uses: Number(o.max_uses) || 0,
      used: Number(o.used) || 0,
      revoked_at: typeof o.revoked_at === 'string' ? o.revoked_at : null,
      created_at: typeof o.created_at === 'string' ? o.created_at : o.expires_at,
      active: Number(o.active) || 0,
    }];
  });
}
