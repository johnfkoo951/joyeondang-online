import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Role } from '@/lib/access';
import type { CharacterLook } from '@/walk/look';

// 함께 걷기 서버(game-server/)에 들어가는 짧은 출입증. 형식은 game-server/src/token.ts와 같다:
//   base64url(JSON payload) + '.' + base64url(HMAC-SHA256(GAME_TOKEN_SECRET, 앞의 base64url 글자 그대로))
// payload = { sub, name, color, role, exp, look? }, exp는 유닉스 초. look은 프로필의 캐릭터 겉모습(cleanLook 결과).
// 손님 확인은 부르는 쪽(app/api/game-token)이 먼저 한다.
// role 'observer'는 관전자(관리자·가족만, /api/game-token?observe=1): 게임 서버가 사람 수에 세지 않고 남에게 보이지 않게 하며 받기만 하게 한다.

export type GameRole = Extract<Role, 'guest' | 'family' | 'admin'> | 'observer';
export type GameTokenPayload = { sub: string; name: string; color: string; role: GameRole; exp: number; look?: CharacterLook };

/** 출입증 수명(초). 걷기 화면은 만료 1분 전에 새로 받는다 */
export const GAME_TOKEN_TTL = 600;
const ROLES: readonly string[] = ['guest', 'family', 'admin', 'observer'];

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const mac = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest();

export function signGameToken(payload: GameTokenPayload, secret: string): string {
  if (secret.length < 16) throw new Error('GAME_TOKEN_SECRET이 너무 짧아요');
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(mac(body, secret))}`;
}

/** 시험용(서버는 game-server 쪽에서 확인한다). 맞으면 payload, 위조·모양 틀림·만료면 null */
export function verifyGameToken(token: string, secret: string, nowMs: number = Date.now()): GameTokenPayload | null {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const want = mac(parts[0], secret);
  const got = Buffer.from(parts[1], 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof p.sub !== 'string' || typeof p.name !== 'string' || typeof p.color !== 'string') return null;
    if (typeof p.role !== 'string' || !ROLES.includes(p.role) || typeof p.exp !== 'number') return null;
    if (p.look !== undefined && (!p.look || typeof p.look !== 'object')) return null;
    if (p.exp * 1000 <= nowMs) return null;
    return p as GameTokenPayload;
  } catch {
    return null;
  }
}

/**
 * 사진 겉모습 증표. 붙어 있는 동안 사진 캐릭터로 바꾸면 출입증에는 옛 겉모습이 실려 있으므로,
 * 「이 사람(sub)의 그림(url)이 맞다」를 따로 서명해 겉모습 메시지에 붙인다(game-server/src/token.ts verifyLookProof와 짝).
 *   `${exp}.` + base64url(HMAC-SHA256(GAME_TOKEN_SECRET, `look:${sub}:${url}:${exp}`))
 * 내 그림인지는 부르는 쪽(app/api/game-token/look)이 먼저 확인한다.
 */
export function signLookProof(sub: string, url: string, exp: number, secret: string): string {
  if (secret.length < 16) throw new Error('GAME_TOKEN_SECRET이 너무 짧아요');
  return `${exp}.${b64url(mac(`look:${sub}:${url}:${exp}`, secret))}`;
}

/**
 * 게임 서버에 넘길 사람 구분값. 로그인 id를 그대로 보내지 않고 서명 키로 한 번 감춘다
 * (같은 사람은 늘 같은 값이라 서버가 새로 고침한 앞 연결을 닫을 수 있다).
 */
export function gameSubject(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`sub:${userId}`).digest('base64url').slice(0, 22);
}

/** 이름표: 제어문자를 빼고 16자. 비면 '손님' */
export function gameName(raw: string | null | undefined): string {
  const s = (raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, 16).join('').trim() || '손님';
}
