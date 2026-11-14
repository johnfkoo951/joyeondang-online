import type { ModelProvider } from '@/lib/avatar/consent';
import { CHAR_FILE, MODEL_FILE, VER_PARAM, toVer } from '@/lib/avatar/model-version';
import { isUuid, modelBlocked } from '@/lib/avatar/rules';

// 캐릭터 관리 콘솔(/admin/characters, 집주인 전용)의 규칙(순수 함수). 화면·라우트·node --test가 함께 쓴다.
// 판정(집주인인지, 동의 근거, 주인의 셈)은 DB 함수가 한다(supabase/migrations/0024_admin_characters.sql). 여기서는
// 요청을 읽고, DB의 답을 화면에 줄 모양과 쉬운 말로 바꾸고, 버릴 목록을 비우는 차례를 정한다.
// 원본 사진은 이 콘솔 어디에도 나오지 않는다(DB가 경로를 주지 않고, 관리자용 읽기는 그림과 모형만 한다).

// ───────── 거르기와 요청 읽기

export const ADMIN_FILTERS = [
  { id: 'all', label: '전부' },
  { id: 'model_problem', label: '3D 문제' },
  { id: 'model_making', label: '3D 만드는 중' },
  { id: 'model_ready', label: '3D 다 됨' },
  { id: 'model_none', label: '3D 없음' },
  { id: 'pic_problem', label: '그림 문제' },
] as const;
export type AdminFilter = (typeof ADMIN_FILTERS)[number]['id'];
const FILTER_IDS: readonly string[] = ADMIN_FILTERS.map((f) => f.id);

export const OWNER_ROLES = ['admin', 'family', 'guest', 'visitor'] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];
export const ROLE_WORD: Record<OwnerRole, string> = { admin: '집주인', family: '가족', guest: '손님', visitor: '명단 밖' };

/** 한 번에 읽는 캐릭터 수(휴대폰에서 그림을 너무 많이 받지 않게) */
export const PAGE_SIZE = 24;
/** 검색어 상한(글자) */
export const QUERY_MAX = 40;

export type AdminQuery = {
  filter: AdminFilter;
  role: OwnerRole | null;
  maker: string | null;
  q: string | null;
  mine: boolean;
  limit: number;
  before: string | null;
  beforeId: string | null;
};

const MAKER = /^[A-Za-z0-9._:-]{1,64}$/;

/** 목록 요청의 주소 칸. 모양이 틀린 값은 버린다(거르기는 전부, 나머지는 없음) */
export function readAdminQuery(sp: URLSearchParams): AdminQuery {
  const filter = sp.get('filter') ?? 'all';
  const role = sp.get('role') ?? '';
  const maker = sp.get('maker') ?? '';
  const q = (sp.get('q') ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX);
  const limit = Number.parseInt(sp.get('limit') ?? '', 10);
  const before = sp.get('before') ?? '';
  const beforeId = sp.get('before_id') ?? '';
  const at = before && Number.isFinite(Date.parse(before)) ? new Date(Date.parse(before)).toISOString() : null;
  return {
    filter: FILTER_IDS.includes(filter) ? (filter as AdminFilter) : 'all',
    role: (OWNER_ROLES as readonly string[]).includes(role) ? (role as OwnerRole) : null,
    maker: MAKER.test(maker) ? maker : null,
    q: q || null,
    mine: sp.get('mine') === '1',
    limit: Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : PAGE_SIZE,
    before: at && isUuid(beforeId) ? at : null,
    beforeId: at && isUuid(beforeId) ? beforeId : null,
  };
}

/** 화면이 목록을 부르는 주소 */
export function listHref(q: Partial<AdminQuery>): string {
  const sp = new URLSearchParams();
  if (q.filter && q.filter !== 'all') sp.set('filter', q.filter);
  if (q.role) sp.set('role', q.role);
  if (q.maker) sp.set('maker', q.maker);
  if (q.q) sp.set('q', q.q);
  if (q.mine) sp.set('mine', '1');
  if (q.limit && q.limit !== PAGE_SIZE) sp.set('limit', String(q.limit));
  if (q.before && q.beforeId) {
    sp.set('before', q.before);
    sp.set('before_id', q.beforeId);
  }
  const s = sp.toString();
  return `/api/admin/characters${s ? `?${s}` : ''}`;
}

// ───────── 목록 줄

export const PIC_STATUSES = ['pending', 'queued', 'drawing', 'ready', 'rejected', 'failed'] as const;
export type PicStatus = (typeof PIC_STATUSES)[number];
export const MODEL_STATES = ['none', 'waiting', 'making', 'stuck', 'ready', 'failed'] as const;
export type ModelState = (typeof MODEL_STATES)[number];

/** 캐릭터 한 줄(admin_characters의 답을 고른 것). 원본 사진은 있는지(hasOriginal)만 안다 */
export type CharacterRow = {
  id: string;
  ownerId: string;
  ownerName: string | null;
  nickname: string | null;
  role: OwnerRole;
  removed: boolean;
  eventLabel: string | null;
  createdAt: string;
  status: PicStatus;
  reason: string | null;
  slot: number | null;
  kept: boolean;
  worn: boolean;
  hasOriginal: boolean;
  /** 그림의 차례(관리자용 그림 주소의 ?v=. 다시 그리면 바뀐다) */
  picVer: number;
  model: ModelState;
  maker: string | null;
  modelReason: string | null;
  modelAttempts: number;
  modelTries: number;
  via: 'meshy' | 'trellis' | null;
  modelVer: number;
  /** 다시 만드는 동안 이전 모형이 보인다 */
  prev: boolean;
  byAdmin: boolean;
  askedAt: string | null;
  /** 관리자가 그림을 다시 그리는 중(그동안 걷기에는 옛 그림이 보인다) */
  redrawing: boolean;
};

const str = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const iso = (v: unknown): string | null => {
  const t = v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const count = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/** admin_characters의 답을 읽는다. 모양이 이상한 줄은 뺀다. 원본 경로 같은 모르는 칸은 옮기지 않는다 */
export function readCharacterRows(raw: unknown): CharacterRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CharacterRow[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const createdAt = iso(o.created_at);
    if (!isUuid(o.id) || !isUuid(o.owner_id) || !createdAt) continue;
    if (!(PIC_STATUSES as readonly unknown[]).includes(o.status)) continue;
    const role = (OWNER_ROLES as readonly unknown[]).includes(o.owner_role) ? (o.owner_role as OwnerRole) : 'visitor';
    const model = (MODEL_STATES as readonly unknown[]).includes(o.model_state) ? (o.model_state as ModelState) : 'none';
    out.push({
      id: o.id,
      ownerId: o.owner_id,
      ownerName: str(o.owner_name, 40),
      nickname: str(o.nickname, 40),
      role,
      removed: o.owner_removed === true,
      eventLabel: str(o.event_label, 40),
      createdAt,
      status: o.status as PicStatus,
      reason: typeof o.reason === 'string' && /^[a-z_]{1,32}$/.test(o.reason) ? o.reason : null,
      slot: typeof o.slot === 'number' && Number.isInteger(o.slot) && o.slot >= 1 && o.slot <= 9 ? o.slot : null,
      kept: o.kept === true,
      worn: o.worn === true,
      hasOriginal: o.has_original === true,
      picVer: toVer(o.pic_ver) ?? 1,
      model,
      maker: typeof o.model_maker === 'string' && MAKER.test(o.model_maker) ? o.model_maker : null,
      modelReason: typeof o.model_reason === 'string' && /^[a-z_]{1,32}$/.test(o.model_reason) ? o.model_reason : null,
      modelAttempts: count(o.model_attempts),
      modelTries: count(o.model_tries),
      via: o.model_via === 'meshy' || o.model_via === 'trellis' ? o.model_via : null,
      modelVer: toVer(o.model_ver) ?? 1,
      prev: o.model_prev === true,
      byAdmin: o.model_by_admin === true,
      askedAt: iso(o.model_asked_at),
      redrawing: o.redrawing === true,
    });
  }
  return out;
}

/**
 * 목록 라우트가 보내는 한 줄: readCharacterRows가 읽는 DB 모양(snake_case) 그대로, 읽은 칸만 다시 쓴다.
 * 라우트가 거른 줄을 화면이 같은 readCharacterRows로 한 번 더 거르므로 두 쪽의 모양이 같아야 한다
 * (예전에는 라우트가 화면 모양(camelCase)으로 보내 화면이 모든 줄을 버렸다: 수는 보이는데 목록이 비었다)
 */
export function characterWire(r: CharacterRow): Record<string, unknown> {
  return {
    id: r.id, owner_id: r.ownerId, owner_name: r.ownerName, nickname: r.nickname, owner_role: r.role, owner_removed: r.removed,
    event_label: r.eventLabel, created_at: r.createdAt, status: r.status, reason: r.reason, slot: r.slot, kept: r.kept, worn: r.worn,
    has_original: r.hasOriginal, pic_ver: r.picVer, model_state: r.model, model_maker: r.maker, model_reason: r.modelReason,
    model_attempts: r.modelAttempts, model_tries: r.modelTries, model_via: r.via, model_ver: r.modelVer, model_prev: r.prev,
    model_by_admin: r.byAdmin, model_asked_at: r.askedAt, redrawing: r.redrawing,
  };
}

export type Counts = Record<AdminFilter, number> & { roles: Partial<Record<OwnerRole, number>>; makers: Record<string, number> };

/** admin_character_counts의 답. 모양이 이상하면 null(칩에 수를 붙이지 않는다) */
export function readCounts(raw: unknown): Counts | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const pick = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const roles: Partial<Record<OwnerRole, number>> = {};
  for (const r of OWNER_ROLES) if (r in pick(o.roles)) roles[r] = count(pick(o.roles)[r]);
  const makers: Record<string, number> = {};
  for (const [k, n] of Object.entries(pick(o.makers))) if (MAKER.test(k)) makers[k] = count(n);
  const c = Object.fromEntries(ADMIN_FILTERS.map((f) => [f.id, count(o[f.id])])) as Record<AdminFilter, number>;
  return { ...c, roles, makers };
}

// ───────── 쉬운 말

export const PIC_WORD: Record<PicStatus, string> = {
  pending: '사진 올리는 중',
  queued: '그릴 차례 기다림',
  drawing: '그리는 중',
  ready: '다 그림',
  rejected: '그리지 않음',
  failed: '그리지 못함',
};

/** stuck: 기다린 지 15분, 또는 일꾼이 잡은 지 30분이 넘었다(DB의 admin_model_state. 30분은 다시 만들기가 받는 때와 같다) */
export const MODEL_WORD: Record<ModelState, string> = {
  none: '3D 없음',
  waiting: '3D 차례 기다림',
  making: '3D 만드는 중',
  stuck: '3D가 멈춘 것 같아요',
  ready: '3D 있음',
  failed: '3D 못 만듦',
};

const PIC_REASON: Record<string, string> = {
  child: '아이로 보일 수 있는 사진이라 그리지 않았어요',
  no_person: '사진에서 사람을 찾지 못했어요',
  many_people: '사진에 여러 사람이 있어요',
  unclear: '사진을 잘 알아보지 못했어요',
  blocked: '그림 서비스가 받지 않은 사진이에요',
  stale_upload: '사진을 다 올리지 못하고 멈췄어요',
  timeout: '그리다 시간이 넘었어요',
  bad_original: '원본 사진 파일이 이상해요',
  bad_job: '작업 기록이 이상해요',
  bad_output: '그린 그림이 이상해서 버렸어요',
  http_error: '그림 서비스가 답하지 않았어요',
  storage_error: '저장소를 읽지 못했어요',
};

const MODEL_REASON: [RegExp, string][] = [
  [/^(glb_|bad_output$|too_big$|service_failed$)/, '3D 결과가 이상해서 버렸어요'],
  [/^(meshy_rejected|meshy_input|blocked|bad_input)$/, '3D 서비스가 이 그림을 받지 않았어요'],
  [/^bad_char$/, '그림 파일이 이상해요'],
  [/^bad_job$/, '작업 기록이 이상해요'],
  [/^reconsent$/, '3D 만드는 곳이 바뀌어 보내지 않았어요'],
  [/^(timeout|attempts)$/, '여러 번 해도 끝나지 않았어요'],
  [/^(service_down|daily_cap|download_failed|meshy_)/, '3D 서비스 쪽 사정으로 못 만들었어요'],
];

/** 실패 까닭을 쉬운 말로. 모르는 까닭은 그대로 두지 않고 뭉뚱그린다 */
export function reasonWord(reason: string | null, kind: 'pic' | 'model'): string | null {
  if (!reason) return null;
  if (kind === 'pic') return PIC_REASON[reason] ?? '그리지 못했어요';
  return MODEL_REASON.find(([re]) => re.test(reason))?.[1] ?? '3D를 만들지 못했어요';
}

/** 3D 동의 근거(DB의 admin_avatar_remake_model과 조작 기록) */
export const CONSENT_WORD: Record<string, string> = {
  owner_admin: '집주인의 캐릭터',
  owner_meshy: '이 그림의 Meshy 동의',
  told_by_owner: '본인에게 들었음(집주인 확인)',
  local: '우리 컴퓨터(바깥으로 보내지 않음)',
};

export const ACTION_WORD: Record<string, string> = {
  remake_model: '3D 다시 만들기',
  forget_model: '3D 지우기',
  redraw: '그림 다시 그리기',
  forget: '캐릭터 지우기',
  redraw_done: '다시 그린 그림이 다 됨',
  redraw_back: '다시 그리지 못해 원래 그림으로 돌림(원본 사진은 없어짐)',
  redraw_rejected: '다시 그리기가 사진 살피기에서 거절됨(캐릭터 없어짐)',
};

/** 그림 다시 그리기가 끝난 갈래: DB 트리거가 남겨 한 사람(actor)이 없다 */
const OUTCOME_ACTIONS: readonly string[] = ['redraw_done', 'redraw_back', 'redraw_rejected'];

/** 주인 이름 한 줄: 명단 이름(이름표가 다르면 함께) */
export function ownerLine(r: Pick<CharacterRow, 'ownerName' | 'nickname'>): string {
  const name = r.ownerName ?? '이름 없음';
  return r.nickname && r.nickname !== r.ownerName ? `${name} (${r.nickname})` : name;
}

// ───────── 조작

export const ADMIN_OPS = ['remake_model', 'forget_model', 'redraw', 'forget'] as const;
export type AdminOp = (typeof ADMIN_OPS)[number];

/** 조작 요청의 본문 {op, told?}. 그 밖은 null */
export function readOp(body: unknown): { op: AdminOp; told: boolean } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  if (!(ADMIN_OPS as readonly unknown[]).includes(o.op)) return null;
  if (o.told !== undefined && typeof o.told !== 'boolean') return null;
  return { op: o.op as AdminOp, told: o.told === true };
}

/** 이 줄에서 지금 보이는 3D가 있는가(다 된 것, 다시 만드는 동안의 이전 모형) */
export function hasShownModel(r: Pick<CharacterRow, 'status' | 'model' | 'prev'>): boolean {
  return r.status === 'ready' && (r.model === 'ready' || r.prev);
}

/**
 * 지금 3D를 만드는 곳(provider)으로 다시 해도 같은 실패로 굳은 그림인가. DB의 admin_avatar_remake_model도 같은 판정으로
 * 거절한다(model_blocked, 0021의 avatar_model_blocked와 rules.ts의 modelBlocked가 같은 목록)
 */
export function modelBlockedFor(r: Pick<CharacterRow, 'model' | 'modelReason'>, provider: ModelProvider): boolean {
  return r.model === 'failed' && modelBlocked(r.modelReason, provider);
}

/**
 * 화면에 놓을 단추. DB가 거절할 단추는 두지 않는다.
 *   remake_model  3D 만들기/다시 만들기: 만드는 중(잡은 지 30분 안)이 아니고, 지금 만드는 곳으로 다시 해도 같은 실패로 굳지 않았을 때
 *   forget_model  3D 지우기: 3D나 요청이 있을 때
 *   redraw        그림 다시 그리기: 원본이 있고, 3D를 기다리거나 만드는 중이 아닐 때(DB의 model_busy)
 *   forget        캐릭터 지우기(그리는 중이어도)
 * 파일을 지우는 조작은 서버 비밀 키가 있을 때만(store)
 */
export function opsFor(r: CharacterRow, o: { modelsOn: boolean; store: boolean; provider: ModelProvider }): AdminOp[] {
  const ops: AdminOp[] = [];
  const ready = r.status === 'ready';
  if (ready && o.modelsOn && r.model !== 'making' && !modelBlockedFor(r, o.provider)) ops.push('remake_model');
  if (ready && o.store && (r.model !== 'none' || r.prev)) ops.push('forget_model');
  if (ready && o.store && r.hasOriginal && !['waiting', 'making', 'stuck'].includes(r.model)) ops.push('redraw');
  if (o.store && ['pending', 'queued', 'drawing', 'ready'].includes(r.status)) ops.push('forget');
  return ops;
}

/**
 * 3D 까닭 줄에 붙이는 다음 할 일. 다시 해도 같은 실패로 굳은 그림은 「3D 다시 만들기」 단추가 없다:
 * 그림을 다시 그려 새 그림을 만들면 다시 할 수 있다(원본 사진이 있을 때). 그 밖에는 null
 */
export function modelNextStep(r: CharacterRow, o: { store: boolean; provider: ModelProvider }): string | null {
  if (!modelBlockedFor(r, o.provider)) return null;
  return r.hasOriginal && o.store
    ? '그림 다시 그리기로 새 그림을 만들면 3D를 다시 할 수 있어요.'
    : '이 그림으로는 3D를 다시 만들 수 없어요. 다른 그림으로 해 주세요.';
}

/** 3D 단추의 글: 지금 보이는 3D나 요청이 없으면 「3D 만들기」, 있으면 「3D 다시 만들기」 */
export function remakeLabel(r: Pick<CharacterRow, 'model' | 'prev'>): string {
  return r.model === 'none' && !r.prev ? '3D 만들기' : '3D 다시 만들기';
}

export const OP_LABEL: Record<AdminOp, string> = {
  remake_model: '3D 다시 만들기',
  forget_model: '3D 지우기',
  redraw: '그림 다시 그리기',
  forget: '캐릭터 지우기',
};

/**
 * 바깥 3D 서비스(Meshy)로 보내려면 집주인의 「본인에게 들었어요」 확인이 있어야 하는가. DB가 같은 판정을 한 번 더 한다
 * (주인이 관리자이거나 그 그림의 요청 줄에 meshy 동의가 있으면 필요 없다. 우리 컴퓨터는 바깥으로 보내지 않는다)
 */
export function needsTold(r: Pick<CharacterRow, 'role' | 'removed' | 'via'>, provider: ModelProvider): boolean {
  if (provider !== 'meshy') return false;
  if (r.role === 'admin' && !r.removed) return false;
  return r.via !== 'meshy';
}

/** 「본인에게 들었어요」 확인 글 */
export const TOLD_LINE = '본인에게 이 그림을 Meshy(미국)로 보내도 된다고 들었어요.';

/**
 * 이 그림이 지금 주인의 3D 요청 수(0021의 avatar_quota models: 요청이 있고 실패하지 않은 줄)에 들어 있는가.
 * 들어 있지 않은 그림에 관리자가 3D를 만들면 주인의 3D 한 번이 하나 는다(DB는 0021의 셈을 다시 정의하지 않는다)
 */
export function countsForOwner(r: Pick<CharacterRow, 'askedAt' | 'model'>): boolean {
  return r.askedAt !== null && r.model !== 'failed';
}

/** 누르면 그 자리에서 한 번 더 묻는 글 */
export function confirmText(op: AdminOp, r: CharacterRow, provider: ModelProvider): string {
  switch (op) {
    case 'remake_model': {
      const again = r.model !== 'none' || r.prev;
      const where = provider === 'trellis'
        ? `이 캐릭터 그림으로 우리 컴퓨터에서 3D를 ${again ? '다시 ' : ''}만들어요(바깥으로 보내지 않아요).`
        : `이 캐릭터 그림을 Meshy(미국)로 보내 3D를 ${again ? '다시 ' : ''}만들어요. 사진 원본은 보내지 않아요.`;
      const keep = hasShownModel(r) ? ' 지금 3D는 새 3D가 될 때까지 그대로 보여요.' : '';
      // 주인의 셈: 집주인 자신의 캐릭터는 한도가 없다. 그 밖에는 이 3D가 주인의 3D 한 번이 된다(손님·가족은 한 번)
      const owner = r.role === 'admin' && !r.removed
        ? ''
        : countsForOwner(r)
          ? ' 이 그림은 이미 주인의 3D 한 번으로 세고 있어요(그대로예요).'
          : ' 이 3D는 주인의 3D 한 번으로 세요. 주인이 다른 그림으로 3D를 새로 요청하지 못할 수 있어요(주인이 이 그림을 지우면 돌아와요).';
      const paid = provider === 'meshy' ? ' 주인의 돈이 든 시도에는 세지 않지만, 모두가 함께 쓰는 하루 Meshy 상한에는 들어요.' : '';
      return `${where}${keep}${owner}${paid} ${provider === 'trellis' ? '만들까요?' : '보낼까요?'}`;
    }
    case 'forget_model':
      return '이 캐릭터의 3D를 지워요. 걷기에서는 그림으로 보여요. 되돌릴 수 없어요. 지울까요?';
    case 'redraw':
      return '원본 사진을 외부 AI 서비스(OpenAI)로 다시 보내 그림을 다시 그려요. 다 그릴 때까지 걷기에는 지금 그림이 보여요. '
        + '다 그리면 같은 캐릭터로 새 그림이 보이고 3D와 ★ 표시는 없어져요(여러 방향 그림은 새로 그려요). '
        + '그리다 실패하면(서비스 문제 포함) 지금 그림으로 돌아오지만 원본 사진은 없어져요. '
        + `사진 살피기에서 거절되면 이 캐릭터와 원본 사진이 없어져요${r.worn ? '(지금 입고 있어서 종이 인형으로 돌아가요)' : ''}. 다시 그릴까요?`;
    case 'forget':
      return `이 캐릭터를 지워요(그림, 여러 방향 그림, 3D. 본인이 지울 때와 같아요${r.status === 'ready' ? '. 원본 사진은 본인이 지울 때까지 남아요' : ''}).`
        + `${r.worn ? ' 지금 입고 있어서 종이 인형으로 돌아가요.' : ''} 되돌릴 수 없어요. 지울까요?`;
  }
}

/** 확인의 「예」 단추 글 */
export function confirmYes(op: AdminOp, provider: ModelProvider): string {
  if (op === 'remake_model') return provider === 'trellis' ? '3D 만들기' : '보내기';
  if (op === 'redraw') return '다시 그리기';
  return '지우기';
}

const FAIL_WORD: Record<string, string> = {
  not_found: '캐릭터를 찾지 못했어요. 이미 지웠을 수도 있어요.',
  not_ready: '다 그린 그림만 할 수 있어요.',
  busy: '지금 3D를 만드는 중이에요(일꾼이 잡은 지 30분이 안 됐어요). 끝나거나 30분이 지나면 다시 해 주세요.',
  model_blocked: '이 그림으로는 3D를 만들 수 없었어요(다시 해도 같은 실패가 나요). 그림을 다시 그리면 할 수 있어요.',
  model_busy: '3D를 기다리거나 만드는 중이라 지금은 그림을 다시 그릴 수 없어요. 3D가 끝나거나 3D를 지운 뒤에 해 주세요.',
  worker_down: '그림 일꾼이 5분 넘게 소식이 없어 지금은 다시 그리지 않았어요. 일꾼이 돌아오면 해 주세요.',
  consent_needed: 'Meshy로 보내려면 본인에게 들었는지 확인해 주세요.',
  no_model: '지울 3D가 없어요.',
  no_original: '원본 사진이 없어 다시 그릴 수 없어요.',
  model_off: '3D 만들기를 잠시 쉬고 있어요.',
  store_off: '서버 비밀 키가 없어 파일을 지울 수 없어요. 지우지 않았어요.',
  db_old: '아직 쓸 수 없어요. DB에 캐릭터 관리(0024)가 들어가면 열려요.',
  bad_request: '다시 눌러 주세요.',
};
export function failWord(reason: string): string {
  return FAIL_WORD[reason] ?? '지금은 하지 못했어요. 잠시 뒤 다시 해 주세요.';
}

/** 거절 까닭 → 상태 코드 */
function failStatus(reason: string): number {
  if (reason === 'not_found') return 404;
  if (reason === 'bad_request') return 400;
  if (reason === 'error' || reason === 'db_old' || reason === 'store_off' || reason === 'model_off') return 503;
  return 409;
}

export type OpReply = { status: number; body: { ok: boolean; reason?: string; message: string; consent?: string } };

export function opFail(reason: string): OpReply {
  return { status: failStatus(reason), body: { ok: false, reason, message: failWord(reason) } };
}

/** 조작 함수의 답(jsonb) → 화면에 줄 답 */
export function opReply(op: AdminOp, data: unknown): OpReply {
  const o = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!o) return opFail('error');
  if (o.ok !== true) return opFail(typeof o.reason === 'string' && /^[a-z_]{1,32}$/.test(o.reason) ? o.reason : 'error');
  switch (op) {
    case 'remake_model': {
      const consent = typeof o.consent === 'string' && o.consent in CONSENT_WORD ? o.consent : undefined;
      const keep = o.prev === true ? ' 지금 3D는 새 3D가 될 때까지 보여요.' : '';
      return {
        status: 200,
        body: { ok: true, consent, message: `3D 만들기를 맡겼어요(근거: ${consent ? CONSENT_WORD[consent] : '확인됨'}). 몇 분 걸려요.${keep}` },
      };
    }
    case 'forget_model':
      return { status: 200, body: { ok: true, message: '3D를 지웠어요.' } };
    case 'redraw':
      return {
        status: 200,
        body: { ok: true, message: '다시 그리기를 맡겼어요. 그동안 지금 그림이 보이고, 다 그리면 같은 캐릭터로 새 그림이 보여요(다른 화면에는 1분쯤 안에).' },
      };
    case 'forget':
      return {
        status: 200,
        body: { ok: true, message: o.worn === true ? '캐릭터를 지웠어요. 입고 있던 캐릭터라 종이 인형으로 돌렸어요.' : '캐릭터를 지웠어요.' },
      };
  }
}

/** 조작마다 부르는 DB 함수(모두 집주인 세션으로. 함수가 is_admin()을 먼저 본다) */
export const OP_FN: Record<AdminOp, string> = {
  remake_model: 'admin_avatar_remake_model',
  forget_model: 'admin_avatar_forget_model',
  redraw: 'admin_avatar_redraw',
  forget: 'admin_avatar_forget',
};

// ───────── 관리자용 그림·모형 읽기

/**
 * 관리자용 읽기의 캐시. 모든 사람의 그림과 3D를 집주인 휴대폰에 오래 두지 않는다(지운 캐릭터가 남지 않게):
 * 그림은 1분(거르기를 바꿀 때마다 다시 받지 않을 만큼), 3D는 남기지 않는다(누를 때만 받는다)
 */
export const ADMIN_IMAGE_CACHE = 'private, max-age=60';
export const ADMIN_MODEL_CACHE = 'private, no-store';

export type FileKind = 'char' | 'model';
export type FileRef = { path: string; ver: number };

/** admin_character_file의 답. 경로는 그 캐릭터의 그림·모형 자리와 꼭 같아야 한다(원본 사진 자리는 받지 않는다) */
export function readFileRef(raw: unknown, id: string, kind: FileKind): FileRef | null {
  if (!isUuid(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ver = toVer(o.ver);
  const m = typeof o.path === 'string' ? (kind === 'char' ? CHAR_FILE : MODEL_FILE).exec(o.path) : null;
  if (ver === null || !m || m[2] !== id) return null;
  return { path: o.path as string, ver };
}

/** 관리자용 그림(small이면 작은 그림)·모형 주소. 판이 붙어 있어 오래 캐시한다 */
export function adminFileHref(id: string, kind: FileKind, ver: number, small = false): string {
  const base = `/api/admin/characters/${id}/${kind === 'char' ? 'image' : 'model'}?${VER_PARAM}=${ver}`;
  return kind === 'char' && small ? `${base}&s=s` : base;
}

// ───────── 버릴 목록 비우기(서버가 비밀 키로)

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** 사이트가 만드는 모양의 경로(DB의 avatar_trash_path_ok와 같다). 그 밖의 경로는 저장소에서 지우지 않는다 */
export const TRASH_FILE = new RegExp(
  `^${UUID}/(chars/${UUID}\\.png|views/${UUID}\\.v1[ls]\\.webp|models/${UUID}\\.v1\\.glb|originals/${UUID}\\.(jpg|png|webp))$`,
);

export type DrainResult = { removed: number; left: boolean };
export type DrainIo = {
  /** 지울 경로(오래된 것부터). 못 읽으면 null */
  list: (limit: number) => Promise<unknown[] | null>;
  /** 저장소에서 지운다. 실패하면 false */
  remove: (paths: string[]) => Promise<boolean>;
  /** 목록에서 뺀다. 실패하면 false */
  done: (paths: string[]) => Promise<boolean>;
};

/**
 * 버릴 목록을 비운다(한 번에 100개씩 rounds번까지). 모양이 틀린 경로는 지우지 않고 목록에서만 뺀다.
 * 저장소에서 지운 뒤에 목록에서 뺀다: 중간에 끊겨도 경로가 목록에 남아 다음에 마저 지운다(없는 파일 지우기는 실패가 아니다).
 * left: 아직 남았을 수 있다(못 읽음, 못 지움, 끝까지 못 감)
 */
export async function drainTrash(io: DrainIo, rounds = 5): Promise<DrainResult> {
  const BATCH = 100;
  let removed = 0;
  for (let k = 0; k < rounds; k++) {
    const got = await io.list(BATCH);
    if (!got) return { removed, left: true };
    const paths = got.filter((p): p is string => typeof p === 'string');
    if (!paths.length) return { removed, left: false };
    const ok = paths.filter((p) => TRASH_FILE.test(p));
    const bad = paths.filter((p) => !TRASH_FILE.test(p));
    if (ok.length && !(await io.remove(ok))) return { removed, left: true };
    if (!(await io.done([...ok, ...bad]))) return { removed: removed + ok.length, left: true };
    removed += ok.length;
    if (got.length < BATCH) return { removed, left: false };
  }
  return { removed, left: true };
}

// ───────── 조작 기록

export type LogRow = {
  at: string;
  actor: string | null;
  avatarId: string;
  ownerName: string | null;
  nickname: string | null;
  action: string;
  consent: string | null;
  detail: Record<string, unknown>;
};

export function readLogRows(raw: unknown): LogRow[] {
  if (!Array.isArray(raw)) return [];
  const out: LogRow[] = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const at = iso(o.at);
    if (!at || !isUuid(o.avatar_id) || typeof o.action !== 'string' || !(o.action in ACTION_WORD)) continue;
    out.push({
      at,
      actor: str(o.actor_name, 40),
      avatarId: o.avatar_id,
      ownerName: str(o.owner_name, 40),
      nickname: str(o.owner_nickname, 40),
      action: o.action,
      consent: typeof o.consent === 'string' && o.consent in CONSENT_WORD ? o.consent : null,
      detail: o.detail && typeof o.detail === 'object' && !Array.isArray(o.detail) ? (o.detail as Record<string, unknown>) : {},
    });
  }
  return out;
}

/** 기록 라우트가 보내는 한 줄: readLogRows가 읽는 DB 모양 그대로(화면이 같은 함수로 한 번 더 읽는다. characterWire와 같은 까닭) */
export function logWire(l: LogRow): Record<string, unknown> {
  return {
    at: l.at, actor_name: l.actor, avatar_id: l.avatarId, owner_name: l.ownerName, owner_nickname: l.nickname,
    action: l.action, consent: l.consent, detail: l.detail,
  };
}

/** 기록 한 줄의 글: 「3D 다시 만들기 · 근거: 본인에게 들었음(집주인 확인)」, 다시 그리기의 끝은 까닭까지 */
export function logLine(l: LogRow): string {
  const parts = [ACTION_WORD[l.action] ?? l.action];
  if (l.consent) parts.push(`근거: ${CONSENT_WORD[l.consent]}`);
  if (l.action === 'forget' && l.detail.worn === true) parts.push('입고 있던 캐릭터(종이 인형으로)');
  if ((l.action === 'redraw_back' || l.action === 'redraw_rejected') && typeof l.detail.reason === 'string') {
    parts.push(`까닭: ${reasonWord(l.detail.reason, 'pic')}`);
  }
  return parts.join(' · ');
}

/** 기록 한 줄의 「누가」: 명단 이름. 다시 그리기의 끝은 그림 일꾼이 남긴다 */
export function actorWord(l: Pick<LogRow, 'actor' | 'action'>): string {
  return l.actor ?? (OUTCOME_ACTIONS.includes(l.action) ? '그림 일꾼' : '집주인');
}
