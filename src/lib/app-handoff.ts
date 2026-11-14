import 'server-only';
import { createHmac, randomInt } from 'node:crypto';
import { HANDOFF_ALPHABET, HANDOFF_LEN, HANDOFF_TTL_MS, normalizeHandoffCode } from './app-handoff-code';

// 홈 화면 앱 로그인 이어받기(0027). 사파리에서 로그인한 사람이 짧은 코드를 받고, 홈 화면 앱에 넣으면 같은 사람으로 들어간다.
// 코드 모양은 app-handoff-code.ts. 해시(서버 비밀로 HMAC)만 저장하고 5분 뒤·한 번 쓰면 끝난다.
// 저장은 HandoffStore로 갈아 끼운다(시험은 메모리, 실제는 Supabase 비밀 키: app-handoff-server.ts).

/** 한 사람이 HANDOFF_WINDOW_MS 안에 받을 수 있는 코드 수 */
export const HANDOFF_PER_USER = 5;
export const HANDOFF_WINDOW_MS = 10 * 60_000;

/** 새 코드(암호학적 난수) */
export function newHandoffCode(pick: (n: number) => number = (n) => randomInt(n)): string {
  let out = '';
  for (let i = 0; i < HANDOFF_LEN; i++) out += HANDOFF_ALPHABET[pick(HANDOFF_ALPHABET.length)];
  return out;
}

/** 저장할 해시(서버 비밀로 HMAC-SHA256, 16진 64자) */
export function hashHandoffCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(`app-handoff:${code}`).digest('hex');
}

export type HandoffStore = {
  /** since(ISO) 뒤에 이 사람이 받은 코드 수 */
  recentCount(userId: string, sinceIso: string): Promise<number>;
  insert(row: { code_hash: string; user_id: string; expires_at: string }): Promise<void>;
  /** 살아 있고 쓰지 않은 코드를 쓴 것으로 표시하고 그 사람 id를 돌려준다(한 번의 UPDATE). 없으면 null */
  claim(codeHash: string, nowIso: string): Promise<string | null>;
  /** 방금(usedIso에) 쓴 것으로 표시한 코드를 다시 쓸 수 있게 되돌린다(세션을 만들지 못했을 때). 끝난 코드는 그대로 */
  release(codeHash: string, usedIso: string): Promise<void>;
  /** before(ISO)보다 먼저 끝난 코드를 지운다 */
  purge(beforeIso: string): Promise<void>;
};

export type CreateResult = { ok: true; code: string; expiresAt: string } | { ok: false; why: 'busy' };

/** 로그인한 사람에게 새 코드를 준다. 너무 자주 받으면 busy */
export async function createHandoff(
  store: HandoffStore,
  userId: string,
  secret: string,
  now = Date.now(),
  code = newHandoffCode(),
): Promise<CreateResult> {
  // 끝난 코드는 세는 창(10분)이 다 지난 뒤에 지운다: 일찍 지우면 「10분에 다섯 번」이 「5분에 다섯 번」이 된다
  await store.purge(new Date(now - HANDOFF_WINDOW_MS).toISOString()).catch(() => undefined);
  const recent = await store.recentCount(userId, new Date(now - HANDOFF_WINDOW_MS).toISOString());
  if (recent >= HANDOFF_PER_USER) return { ok: false, why: 'busy' };
  const expiresAt = new Date(now + HANDOFF_TTL_MS).toISOString();
  await store.insert({ code_hash: hashHandoffCode(code, secret), user_id: userId, expires_at: expiresAt });
  return { ok: true, code, expiresAt };
}

export type Claimed = { userId: string; codeHash: string; usedIso: string };

/**
 * 앱이 넣은 코드로 그 사람을 찾는다(쓴 것으로 표시). 틀렸거나 끝났거나 이미 썼으면 null.
 * 그 뒤 세션을 만들지 못하면 부르는 쪽이 store.release(codeHash, usedIso)로 코드를 되돌린다
 */
export async function claimHandoff(store: HandoffStore, raw: unknown, secret: string, now = Date.now()): Promise<Claimed | null> {
  const code = normalizeHandoffCode(raw);
  if (!code) return null;
  const codeHash = hashHandoffCode(code, secret);
  const usedIso = new Date(now).toISOString();
  const userId = await store.claim(codeHash, usedIso);
  return userId ? { userId, codeHash, usedIso } : null;
}

/**
 * 한 주소(IP)에서 코드를 너무 많이 시도하지 못하게 막는다. 이 서버 인스턴스 안에서만 세는 가벼운 막음이다
 * (코드가 32^6가지이고 5분·한 번이라 이것만으로도 맞히기 어렵다). 허용이면 true.
 * 기억하는 주소 수에는 상한(cap)이 있다: 넘으면 가장 오래 안 온 주소부터 잊는다. 지난 기록 비우기는 sweepEvery번에 한 번만
 */
export function makeAttemptGate(max = 10, windowMs = 10 * 60_000, cap = 5000, sweepEvery = 200) {
  const seen = new Map<string, number[]>();
  let calls = 0;
  return (key: string, now = Date.now()): boolean => {
    if (++calls % sweepEvery === 0) for (const [k, v] of seen) if (!v.some((t) => now - t < windowMs)) seen.delete(k);
    const list = (seen.get(key) ?? []).filter((t) => now - t < windowMs);
    // 다시 넣어 순서를 「최근에 온 주소가 뒤」로 둔다(상한을 넘으면 앞에서부터 잊는다)
    seen.delete(key);
    if (list.length >= max) {
      seen.set(key, list);
      return false;
    }
    list.push(now);
    seen.set(key, list);
    while (seen.size > cap) {
      const oldest = seen.keys().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
    return true;
  };
}
