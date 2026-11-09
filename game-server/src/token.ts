// 걷기 화면이 /api/game-token에서 받아 오는 짧은 출입증을 확인한다.
// 형식: base64url(JSON payload) + '.' + base64url(HMAC-SHA256(비밀값, 앞의 base64url 글자 그대로))
// payload = { sub, name, color, role, exp, look? }, exp는 유닉스 초. look은 프로필의 캐릭터 겉모습(공간이 cleanLook으로 다시 고친다). 서명은 사이트(src/lib/game-token.ts)가 노드 crypto로 한다.
// 이 파일은 다른 파일을 가져오지 않는다(노드 단위 시험에서도 그대로 불러 서명 형식이 같은지 본다).

export type TokenRole = 'guest' | 'family' | 'admin';
export type TokenPayload = { sub: string; name: string; color: string; role: TokenRole; exp: number; look?: unknown };
export type TokenCheck = { ok: true; payload: TokenPayload } | { ok: false; reason: 'bad' | 'expired' };

const ROLES: readonly string[] = ['guest', 'family', 'admin'];
const B64URL = /^[A-Za-z0-9_-]+$/;
const enc = new TextEncoder();

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const keys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    keys.set(secret, k);
  }
  return k;
}

function isPayload(v: unknown): v is TokenPayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.sub === 'string' && p.sub.length > 0 && p.sub.length <= 64 &&
    typeof p.name === 'string' && p.name.length <= 64 &&
    typeof p.color === 'string' && p.color.length <= 16 &&
    typeof p.role === 'string' && ROLES.includes(p.role) &&
    typeof p.exp === 'number' && Number.isFinite(p.exp) &&
    // 겉모습은 없거나 작은 객체만(모양 검사는 공간이 한다)
    (p.look === undefined || (typeof p.look === 'object' && p.look !== null && !Array.isArray(p.look) && JSON.stringify(p.look).length <= 400))
  );
}

/**
 * 출입증을 확인한다. 서명 비교는 WebCrypto verify(시간 일정)로 한다.
 * 모양이 틀리거나 서명이 맞지 않으면 'bad', 서명은 맞는데 exp가 지났으면 'expired'.
 */
export async function verifyToken(token: string, secret: string, nowMs: number = Date.now()): Promise<TokenCheck> {
  if (!secret || typeof token !== 'string' || token.length > 1200) return { ok: false, reason: 'bad' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'bad' };
  const [body, sig] = parts;
  if (!B64URL.test(body) || !B64URL.test(sig) || sig.length !== 43) return { ok: false, reason: 'bad' };
  let good = false;
  try {
    good = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
  } catch {
    return { ok: false, reason: 'bad' };
  }
  if (!good) return { ok: false, reason: 'bad' };
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return { ok: false, reason: 'bad' };
  }
  if (!isPayload(payload)) return { ok: false, reason: 'bad' };
  if (payload.exp * 1000 <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
