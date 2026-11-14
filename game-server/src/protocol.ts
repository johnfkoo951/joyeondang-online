// 서버와 걷기 화면이 주고받는 짧은 키 JSON. 사이트 쪽 짝은 src/walk/net.ts(같은 이름을 쓴다).
//
// 서버 → 클라
//   {t:'hi', you, players: P[], o?} 들어온 나에게: 내 id와 이미 있는 사람들(나는 빼고). o: 1이면 관전자로 들어왔다
//   {t:'j', p: P}                 다른 사람이 들어옴
//   {t:'S', ps: [{id,x,z,y,l,yw,m,j?,st?}, …]}  0.1초 동안 움직인 사람들을 한 번에(좌표는 소수 둘째 자리, 내 것도 들어 있으니 클라가 거른다)
//   {t:'c', id, text, at}         누군가 말함(모두에게, 말한 사람 포함). at = 서버 시각 ms
//   {t:'k', id, look}             누군가 겉모습을 바꿈(모두에게, 바꾼 사람 포함)
//   {t:'l', id}                   나감
//   {t:'full', to?}               공간이 가득 참(곧 닫힌다). to가 있으면 같은 집의 다음 공간(예: 'house:real~2')으로 들어오라는 뜻
//                                 (걷는 사람만. 다음 공간도 차면 그다음, MAX_SHARDS째까지. 옛 화면은 to를 모르고 30초 뒤 다시 두드린다)
//   {t:'bye', why}                서버가 먼저 닫는 까닭: 'replaced'(같은 사람이 다른 창에서 들어옴), 'stale'(오래 소식 없음),
//                                 'flood'(너무 많이 보냄)
// 클라 → 서버
//   {t:'s', x,z,y,l,yw,m,j?,st?}  내 상태(받는 대로 마지막 값만 남기고, 남에게는 0.1초 묶음 S로만 전한다).
//                                 j 점프 수(0~255를 돈다, 바뀌면 받는 화면이 그 사람을 한 번 뛰게 한다), st 1이면 앉아 있다.
//                                 둘 다 모르는 옛 화면은 보내지 않고, 받는 옛 화면은 무시한다
//   {t:'c', text}                 말하기(1.5초에 한 번, 80자)
//   {t:'k', look, p?}             내 겉모습(10초에 한 번, cleanLook으로 고쳐 받는다. 사진은 /api/avatar/<id> 주소만,
//                                 그리고 출입증에 실려 온 사진이거나 사이트가 서명한 증표 p가 맞을 때만: token.ts verifyLookProof)
// P = {id, n, c, k?, x?, z?, y?, l?, yw?, m?, b?, ba?}  n 이름, c 색, k 겉모습(출입증이나 't:k'로 받은 것),
//     위치는 첫 상태를 받기 전에는 없다, b·ba 최근 말과 그 시각
//
// 관전자(출입증 role 'observer', 사이트가 관리자·가족에게만 준다)
//   사람 수에 세지 않고(MAX_OBSERVERS로 따로 센다), 남의 hi 목록·j·l에 나오지 않는다. 같은 소식(hi, j, S, c, k, l)을 받는다.
//   상태·말·겉모습은 보내도 버린다. 같은 사람이 걸으면서 관전해도 서로 닫지 않는다.
//   살아 있는지는 글자 'ping'을 보내 'pong'을 받아 본다(런타임이 공간을 깨우지 않고 답한다: setWebSocketAutoResponse).

/** 한 공간에 걷는 사람 수. 2026-11-11 로컬 측정(가짜 손님 100명, 모두 걸을 때): 서버 CPU 한 코어의 4%대, 손님 한 명이 받는 양
 *  초당 43KB(3할이 걸을 때 20KB). 휴대폰(CPU 4배 느리게) 3인칭으로 100명을 보면 60명일 때보다 그리기 호출 21% 늘고 60fps 유지.
 *  넘치면 같은 집의 다음 공간(~2, ~3)으로 넘긴다(nextShard) */
export const MAX_PLAYERS = 100;
/** 한 집(또는 방)을 나눠 받는 공간 수. 'house:real'이 차면 'house:real~2', 그것도 차면 'house:real~3' */
export const MAX_SHARDS = 3;
/** 공간 이름: 집, 방, 그리고 넘칠 때의 다음 공간(~2…~MAX_SHARDS) */
export const SPACE_RE = new RegExp(`^(house:real|room:[a-z0-9-]{2,32})(~[2-${MAX_SHARDS}])?$`);
/** 가득 찬 공간의 다음 공간. 마지막 공간이거나 이름이 틀리면 null */
export function nextShard(space: string): string | null {
  const m = SPACE_RE.exec(space);
  if (!m) return null;
  const n = m[2] ? Number(m[2].slice(1)) : 1;
  return n < MAX_SHARDS ? `${m[1]}~${n + 1}` : null;
}
/** 공간마다 관전 연결은 이만큼까지. 같은 사람(sub)은 OBSERVERS_PER_SUB개까지.
 *  자리가 모자라면 조용한 연결(OBSERVER_QUIET_MS 넘게 소식이 없는 것)부터 비우고, 모두 살아 있으면 새 연결을 돌려보낸다
 *  (켜 둔 녹화 화면을 새로 연 탭이 밀어내지 않게. 닫기 없이 죽은 연결이 자리를 쥐고 있어도 새 연결이 들어오게) */
export const MAX_OBSERVERS = 6;
export const OBSERVERS_PER_SUB = 3;
/** 관전 연결이 이만큼 소식(받은 메시지, ping 답)이 없으면 조용한 연결이다. 살아 있는 관전 화면은 5초마다 ping을 보낸다(숨은 탭은 1분까지 늦춰진다) */
export const OBSERVER_QUIET_MS = 90_000;
/** 관전 출입증이 끝나고 이만큼 지나면 그 연결을 닫는다: 다시 이을 때 새 출입증을 받으며 역할(가족·관리자)을 다시 확인한다 */
export const OBSERVER_EXP_GRACE_MS = 120_000;
/** 관전 연결은 이만큼 아무 소식(받은 메시지, ping)이 없으면 정리한다. 숨은 탭의 타이머는 1분까지 늦춰지므로 넉넉히 */
export const OBSERVER_STALE_MS = 180_000;
/** 살아 있는지 묻고 답하는 글자(JSON이 아니다) */
export const PING = 'ping';
export const PONG = 'pong';
/** 한 연결이 보낼 수 있는 메시지의 통(종류를 가리지 않고): 한꺼번에 FLOOD_BURST개까지 받고 초당 FLOOD_PER_SEC개씩 다시 찬다.
 *  통이 비면 버리지 않고 끊는다: 버리기만 하면 받을 때마다 서버가 깨어나, 고장 난 화면 하나가 하루 한도를 다 쓴다.
 *  보통 화면은 초당 8개를 넘지 않는다. 통신이 몇 초 막혔다 풀리면 그동안 쌓인 정상 메시지가 한꺼번에 오므로
 *  (계속 걸었다면 10초에 70개 남짓) 그만큼은 받아 준다. 고정된 1초 창으로 세면 그 몰림을 넘침으로 잘못 끊는다 */
export const FLOOD_PER_SEC = 30;
export const FLOOD_BURST = 100;
/** 넘쳐서 끊긴 사람은 이만큼 다시 들이지 않는다(끊자마자 다시 붙어 되풀이하지 않게). 걷기 화면은 스스로 30초 넘게 쉰다 */
export const FLOOD_REST_MS = 20_000;

/**
 * 통에서 하나 꺼낸다. 남은 양을 돌려주고, 비어 있으면 -1(끊는다).
 * left·at은 앞서 남긴 양과 그때(ms). 처음이거나 값이 온전하지 않으면 가득 찬 통에서 시작한다.
 */
export function takeFloodToken(left: number | undefined, at: number | undefined, now: number): number {
  const known = typeof left === 'number' && Number.isFinite(left) && typeof at === 'number' && Number.isFinite(at);
  const had = known ? Math.min(FLOOD_BURST, Math.max(0, left) + (Math.max(0, now - at) / 1000) * FLOOD_PER_SEC) : FLOOD_BURST;
  return had >= 1 ? Math.round((had - 1) * 100) / 100 : -1;
}
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
export const CLOSE_FLOOD = 4003;

export type Pos = { x: number; z: number; y: number; l: 1 | 2; yw: number; m: boolean; j?: number; st?: 1 };
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
  const out: Pos = { x: r2(x), z: r2(z), y: r2(y), l, yw: r2(a), m: Boolean(m) };
  // 점프 수와 앉음은 고르기: 틀린 값은 없는 것으로(상태 전체를 버리지 않는다)
  const { j, st } = msg;
  if (typeof j === 'number' && Number.isInteger(j) && j >= 0 && j <= 255) out.j = j;
  if (st === 1 || st === true) out.st = 1;
  return out;
}
