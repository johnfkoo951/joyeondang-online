import 'server-only';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';
import { gameName } from '@/lib/game-token';
import { petAsset, petName, petRests, petScale, petWeight, PET_FRIENDS_MAX, type PetExtraRest, type PetFriend } from '@/walk/pet-spec';

// 집 안팎을 오가는 반려동물(걷기 화면). 이름이 들어가므로 저장소·공개 묶음에는 없고 서버 환경 변수 PET_JSON에만 있다.
//   PET_JSON={"name":"이름","nameEn":"Name","walk":"/pet-walk.glb","rest":"/pet-rest.glb",
//             "rests":{"loaf":"/pet-loaf.glb","groom":"/pet-groom.glb","lie":"/pet-lie.glb"},
//             "friends":[{"user":"<로그인 사용자 id>","w":3}]}          (rest·rests·name·nameEn·scale·friends는 빼도 된다)
// nameEn은 화면이 영어일 때의 이름표 글이다(name과 같은 범위로만 준다). 없으면 영어 화면에도 name 그대로 보인다.
// friends는 반려동물이 자주 찾아가는 사람(로그인 사용자 id와 무게 1~3). 화면에는 id를 보내지 않고, 그 사람이 지금 걷기 화면에서
// 보이는 이름(출입증 이름과 같은 차례: 이름표 별명 → 명단 이름, gameName으로 다듬은 것)으로 바꿔 보낸다.
// 누구에게 무엇을 주는지(app/api/pet):
// - 모형은 누구에게나 준다(구경하는 집에도 반려동물이 걷는다). 반려동물의 모습은 개인 정보가 아니고, 모형 파일도 이름 없는 공개 파일이다.
// - 이름과 친구는 가족 이름처럼 다뤄 명단 손님 이상에게만 준다(가족 방 이름표와 같은 범위). 구경하는 분은 눌러도 말풍선만 보고,
//   반려동물은 늘 정해진 일정대로 다닌다(구경하는 분은 함께 걷기에 들어오지 않으므로 다른 화면과 어긋나지 않는다).
// 없거나 깨졌으면 반려동물 없이 걷는다(화면은 아무것도 알리지 않는다). 친구 이름을 못 읽으면 친구 없이 다닌다.

/** 로그인 사용자 id(uuid) */
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PetFriendConfig = { user: string; w: number };

export type PetConfig = {
  name: string | null;
  /** 영어 화면의 이름표 글. 있을 때만 이 열쇠가 있다(name이 있을 때만 읽는다) */
  nameEn?: string;
  walk: string;
  /** 쉬는 자세 모형. 없거나 틀렸으면 걷는 자세로 쉰다 */
  rest: string | null;
  /** 더 있는 쉬는 자세 모형. 없으면 null */
  rests: Partial<Record<PetExtraRest, string>> | null;
  /** 크기 배율(0.3~2, 기본 1). 모형의 약속 크기에 곱한다 */
  scale: number;
  /** 자주 찾아가는 사람(로그인 사용자 id와 무게). 서버 밖으로 id를 내보내지 않는다 */
  friends: PetFriendConfig[];
};

/** 응답 모양(화면의 walk/pet-spec.ts petSpecFrom이 다시 한 번 고친다) */
export type PetPayload = {
  pet: {
    walk: string; rest?: string; rests?: Partial<Record<PetExtraRest, string>>; name?: string; nameEn?: string; scale?: number;
    /** 친구의 걷기 이름과 무게(명단 손님 이상에게만) */
    friends?: PetFriend[];
    /** 보는 사람 자신의 걷기 이름(친구가 있을 때만: 자기 화면도 남의 화면과 같은 판단을 하게) */
    me?: string;
  } | null;
  /** 서버 시각(ms): 화면이 기기 시계와의 차이를 재어 모든 화면이 같은 칸을 본다 */
  now: number;
};

function friendsOf(v: unknown): PetFriendConfig[] {
  if (!Array.isArray(v)) return [];
  const out: PetFriendConfig[] = [];
  const seen = new Set<string>();
  for (const item of v.slice(0, PET_FRIENDS_MAX * 2)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const user = typeof o.user === 'string' && USER_ID.test(o.user) ? o.user.toLowerCase() : null;
    const w = petWeight(o.w);
    if (!user || w === null || seen.has(user)) continue;
    seen.add(user);
    out.push({ user, w });
    if (out.length >= PET_FRIENDS_MAX) break;
  }
  return out;
}

/** 환경 변수를 읽는다. 없거나 깨졌거나 걷는 자세 모형 경로가 틀렸으면 null */
export function loadPet(raw = process.env.PET_JSON): PetConfig | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const walk = petAsset(o.walk);
  if (!walk) return null;
  const name = petName(o.name);
  const nameEn = name ? petName(o.nameEn) : null;
  const cfg: PetConfig = { name, walk, rest: petAsset(o.rest), rests: petRests(o.rests), scale: petScale(o.scale) ?? 1, friends: friendsOf(o.friends) };
  if (nameEn) cfg.nameEn = nameEn;
  return cfg;
}

/** 사용자 id → 그 사람의 이름 재료(이름표 별명, 명단 이름). 읽지 못하면 던진다 */
export type FriendLookup = (users: readonly string[]) => Promise<Map<string, { nickname: string | null; roster: string | null }>>;

/**
 * 출입증 이름과 같은 차례로 고친 걷기 이름: whoami()처럼 별명(앞뒤 빈칸만 뗀 것)이 있으면 별명, 없으면 명단 이름, 그것을 gameName으로.
 * 아무것도 없으면(남에게 「손님」으로 보이는 사람) null: 이름으로 가려낼 수 없다
 */
export function friendWalkName(raw: { nickname: string | null; roster: string | null } | undefined): string | null {
  if (!raw) return null;
  const nick = typeof raw.nickname === 'string' ? raw.nickname.replace(/^ +| +$/g, '') : '';
  const name = nick || (typeof raw.roster === 'string' ? raw.roster : '');
  if (!name) return null;
  const n = gameName(name);
  return n === gameName('') ? null : n;
}

/** 친구 id들을 걷기 이름으로(같은 이름은 무게가 큰 쪽 하나). 못 읽은 사람은 뺀다. 조회가 실패하면 빈 목록 */
export async function resolvePetFriends(friends: readonly PetFriendConfig[], lookup: FriendLookup): Promise<PetFriend[]> {
  if (!friends.length) return [];
  let names: Map<string, { nickname: string | null; roster: string | null }>;
  try {
    names = await lookup(friends.map((f) => f.user));
  } catch {
    return [];
  }
  const by = new Map<string, number>();
  for (const f of friends) {
    const n = friendWalkName(names.get(f.user));
    if (n) by.set(n, Math.max(by.get(n) ?? 0, f.w));
  }
  return [...by].map(([n, w]) => ({ n, w }));
}

/** 비밀 키로 프로필 별명과 명단 이름을 읽는다(비밀 키가 없으면 던진다). 명단은 그 사람에게 묶이고 지우지 않은 줄만 */
export const dbFriendLookup: FriendLookup = async (users) => {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error('no key');
  const db = createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [p, r] = await Promise.all([
    db.from('profiles').select('user_id, nickname').in('user_id', [...users]),
    db.from('roster').select('claimed_by, display_name').in('claimed_by', [...users]).is('revoked_at', null),
  ]);
  if (p.error || r.error) throw new Error('lookup');
  const out = new Map<string, { nickname: string | null; roster: string | null }>();
  for (const u of users) out.set(u, { nickname: null, roster: null });
  for (const row of (p.data ?? []) as Array<{ user_id: string; nickname: string | null }>) {
    const e = out.get(String(row.user_id).toLowerCase());
    if (e) e.nickname = row.nickname ?? null;
  }
  for (const row of (r.data ?? []) as Array<{ claimed_by: string; display_name: string | null }>) {
    const e = out.get(String(row.claimed_by).toLowerCase());
    if (e) e.roster = row.display_name ?? null;
  }
  return out;
};

/**
 * 이 맥의 로컬 미리보기에서만 쓰는 이름 표(PET_PREVIEW_NAMES={"<사용자 id>":"지어낸 이름"}): DB 없이 가짜 손님으로 찾아가기를 확인한다.
 * 미리보기가 아니면 부르는 쪽이 쓰지 않는다
 */
export function previewFriendLookup(raw = process.env.PET_PREVIEW_NAMES): FriendLookup | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const table = v as Record<string, unknown>;
  return async (users) => new Map(users.map((u) => {
    const hit = Object.entries(table).find(([k]) => k.toLowerCase() === u);
    return [u, { nickname: null, roster: typeof hit?.[1] === 'string' ? hit[1] : null }] as const;
  }));
}

/** 친구 이름을 잠깐 기억한다(걷기 화면을 열 때마다 DB를 두 번 부르지 않게). 별명을 바꾸면 길어야 이만큼 뒤에 따라온다 */
const CACHE_MS = 60_000;
const FAIL_CACHE_MS = 10_000;
/** 조회를 이만큼만 기다린다(늦으면 친구 없이 다닌다) */
const LOOKUP_TIMEOUT_MS = 2500;
let cached: { key: string; at: number; ttl: number; friends: PetFriend[] } | null = null;

/** 설정의 친구를 걷기 이름으로(잠깐 기억하고, 늦으면 기다리지 않는다) */
export async function petFriendNames(cfg: PetConfig, lookup: FriendLookup, now = Date.now()): Promise<PetFriend[]> {
  if (!cfg.friends.length) return [];
  const key = JSON.stringify(cfg.friends);
  if (cached && cached.key === key && now - cached.at < cached.ttl) return cached.friends;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('late')), LOOKUP_TIMEOUT_MS); });
  const friends = await resolvePetFriends(cfg.friends, (u) => Promise.race([lookup(u), late])).finally(() => clearTimeout(timer));
  // 아무도 읽지 못했으면(키가 없거나 조회가 실패) 짧게만 기억한다
  cached = { key, at: now, ttl: friends.length ? CACHE_MS : FAIL_CACHE_MS, friends };
  return friends;
}

/** 시험용: 기억을 비운다 */
export function forgetPetFriends(): void {
  cached = null;
}

/**
 * 보는 사람에게 줄 것: named(명단 손님 이상)일 때만 이름·친구를 싣는다. me는 보는 사람의 걷기 이름(출입증과 같은 gameName)으로,
 * 친구가 있을 때만 싣는다
 */
export function petPayload(cfg: PetConfig | null, named: boolean, now: number, friends: readonly PetFriend[] = [], me: string | null = null): PetPayload {
  if (!cfg) return { pet: null, now };
  const pet: NonNullable<PetPayload['pet']> = { walk: cfg.walk };
  if (cfg.rest) pet.rest = cfg.rest;
  if (cfg.rests) pet.rests = { ...cfg.rests };
  if (cfg.scale !== 1) pet.scale = cfg.scale;
  if (named && cfg.name) {
    pet.name = cfg.name;
    if (cfg.nameEn) pet.nameEn = cfg.nameEn;
  }
  if (named && friends.length) {
    pet.friends = friends.map((f) => ({ n: f.n, w: f.w }));
    if (me) pet.me = me;
  }
  return { pet, now };
}
