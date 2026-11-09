// 서버와 걷기 화면이 주고받는 짧은 키 JSON. 사이트 쪽 짝은 src/walk/net.ts(같은 이름을 쓴다).
//
// 서버 → 클라
//   {t:'hi', you, players: P[]}   들어온 나에게: 내 id와 이미 있는 사람들(나는 빼고)
//   {t:'j', p: P}                 다른 사람이 들어옴
//   {t:'S', ps: [{id,x,z,y,l,yw,m}, …]}  0.1초 동안 움직인 사람들을 한 번에(좌표는 소수 둘째 자리, 내 것도 들어 있으니 클라가 거른다)
//   {t:'c', id, text, at}         누군가 말함(모두에게, 말한 사람 포함). at = 서버 시각 ms
//   {t:'k', id, look}             누군가 겉모습을 바꿈(모두에게, 바꾼 사람 포함)
//   {t:'l', id}                   나감
//   {t:'full'}                    공간이 가득 참(곧 닫힌다)
//   {t:'bye', why}                서버가 먼저 닫는 까닭: 'replaced'(같은 사람이 다른 창에서 들어옴), 'stale'(오래 소식 없음)
// 클라 → 서버
//   {t:'s', x,z,y,l,yw,m}         내 상태(사람마다 초당 10번까지, 넘으면 버림)
//   {t:'c', text}                 말하기(1.5초에 한 번, 80자)
//   {t:'k', look}                 내 겉모습(10초에 한 번, cleanLook으로 고쳐 받는다. 사진은 /api/avatar/<id> 주소만)
// P = {id, n, c, k?, x?, z?, y?, l?, yw?, m?, b?, ba?}  n 이름, c 색, k 겉모습(출입증이나 't:k'로 받은 것),
//     위치는 첫 상태를 받기 전에는 없다, b·ba 최근 말과 그 시각

export const MAX_PLAYERS = 60;
export const STATE_PER_SEC = 10;
/** 움직임은 모아서 이 간격(ms)마다 한 번에 보낸다({t:'S', ps:[…]}). 사람 수가 늘어도 보내는 메시지 수가 사람 수 × 10번/초에 머문다 */
export const FLUSH_MS = 100;
/** 붙임표(잠들었다 깨어날 때 쓰는 사람 정보)는 말할 때와 이 간격마다만 다시 쓴다 */
export const SAVE_GAP_MS = 5000;
export const CHAT_GAP_MS = 1500;
export const CHAT_MAX = 80;
export const NAME_MAX = 16;
export const BUBBLE_MS = 6000;
/** 이만큼 아무 말이 없으면 끊긴 것으로 보고 정리한다(클라는 가만히 있어도 3초마다 상태를 보낸다) */
export const STALE_MS = 30_000;
export const MAX_MESSAGE = 512;
/** 입구(index.ts)가 확인한 사람 정보를 DO에 넘기는 안쪽 머리글. 바깥에서 온 같은 이름은 입구가 지운다 */
export const PLAYER_HEADER = 'X-Jy-Player';
/** 겉모습 바꾸기 간격(ms) */
export const LOOK_GAP_MS = 10_000;

// 겉모습 검사는 사이트와 같은 계약 파일을 그대로 쓴다(같은 규칙: 고를 수 있는 색·모양만, 사진은 우리 주소만)
import { cleanLook, type CharacterLook } from '../../src/walk/look';
export { cleanLook, type CharacterLook };

/** 닫는 까닭(4000번대 사용자 정의) */
export const CLOSE_REPLACED = 4000;
export const CLOSE_FULL = 4001;
export const CLOSE_STALE = 4002;

export type Pos = { x: number; z: number; y: number; l: 1 | 2; yw: number; m: boolean };
export type WirePlayer = { id: string; n: string; c: string; k?: CharacterLook } & Partial<Pos> & { b?: string; ba?: number };

const r2 = (v: number) => Math.round(v * 100) / 100;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** 제어문자·방향 바꾸기 문자를 빼고 앞뒤 공백을 걷어 max 글자(코드 포인트)로 자른다 */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const s = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, max).join('').trim();
}

export function cleanColor(raw: unknown): string {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : '#c98a5a';
}

/** 받은 상태 메시지를 검사하고 둘째 자리로 줄인다. 범위를 벗어나면 null(버린다) */
export function readState(msg: Record<string, unknown>): Pos | null {
  const { x, z, y, l, yw, m } = msg;
  const num = (v: unknown, lim: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
  if (!num(x, 2000) || !num(z, 2000) || !num(y, 200) || !num(yw, 100)) return null;
  if (l !== 1 && l !== 2) return null;
  if (typeof m !== 'boolean' && m !== 0 && m !== 1) return null;
  // yaw는 -π~π로 감는다
  const tau = Math.PI * 2;
  let a = yw % tau;
  if (a > Math.PI) a -= tau;
  if (a < -Math.PI) a += tau;
  return { x: r2(x), z: r2(z), y: r2(y), l, yw: r2(a), m: Boolean(m) };
}
