// 함께 걷기 연결. 같은 공간(집 또는 방 하나)에 있는 사람들의 위치·이름·말을 주고받는다.
// 서버는 game-server/(Cloudflare Durable Object), 짧은 키 JSON 규약은 game-server/src/protocol.ts와 짝이다.
// 출입증은 /api/game-token에서 받는다(손님 이상만, 아니면 404 → 'denied'로 조용히 끈다).
// observe: true면 관전 연결(컨트롤 룸): 출입증은 /api/game-token?observe=1(가족·관리자만), 사람들의 소식을 받기만 하고
// 상태·말·겉모습은 보내지 않는다. 서버는 관전자를 사람 수에 세지 않고 남에게 보이지 않게 한다.
// 살아 있는지는 5초마다 'ping'을 보내 'pong'으로 확인하고, 숨은 탭에서도 끊지 않는다(뒤에 띄워 둔 채 기록할 수 있게).
// 공간이 가득 차면 서버가 같은 집의 다음 공간(예: 'house:real~2')을 알려 주고, 그리로 바로 들어간다(가득 찼다는 알림 없이).
// 다시 이을 때는 처음 공간부터 두드린다(자리가 났으면 처음 공간으로 돌아온다). 모든 공간 이름은 spaceShards(base).
import { cleanLook, type CharacterLook } from './look';
import type { Level, RemotePlayer } from './types';

export type NetStatus = 'off' | 'connecting' | 'live' | 'retrying' | 'full' | 'denied';
/** 내 상태. jumps는 지금까지 뛴 수(바뀌면 남의 화면에서 한 번 뛴다), sitting은 앉아 있는가 */
export type NetState = { x: number; z: number; y: number; level: Level; yaw: number; moving: boolean; jumps?: number; sitting?: boolean };
/** 누군가 말했을 때(나 포함). at은 받은 때(ms, Date.now 기준). self면 name·color는 빈 글자(내 이름표는 화면이 안다) */
export type NetChat = { id: string; name: string; color: string; text: string; at: number; self: boolean };
export type Net = {
  /** 내 상태를 보낸다(값이 바뀌었을 때만 실제로 보낸다: 자리가 바뀌면 초당 6~7번까지, 보는 쪽만 바뀌면 초당 2~3번, 가만히 있으면 3초마다 한 번).
   *  관전 연결에서는 아무것도 하지 않는다 */
  sendState(s: NetState): void;
  /** 말하기(80자, 1.5초에 한 번). 보낼 수 없으면 false(관전 연결은 늘 false) */
  say(text: string): boolean;
  /** 내 겉모습이 바뀌었다(다른 사람에게 알린다). 10초에 한 번까지, 그사이 바뀐 것은 마지막 것만 뒤에 보낸다. 관전 연결에서는 아무것도 하지 않는다 */
  setLook(look: CharacterLook): void;
  /** 공간을 바꾼다(집 ↔ 방). 연결을 새로 맺는다 */
  join(space: string): void;
  close(): void;
};

type Ticket = { token: string; url: string; exp: number };
type Wire = { id?: unknown; n?: unknown; c?: unknown; x?: unknown; z?: unknown; y?: unknown; l?: unknown; yw?: unknown; m?: unknown; j?: unknown; st?: unknown; b?: unknown; k?: unknown };
type Msg = Wire & { t?: unknown; you?: unknown; players?: unknown; p?: unknown; ps?: unknown; text?: unknown; why?: unknown; look?: unknown; to?: unknown };

/** 끊기면 물러났다 다시 잇는 간격. 서버가 오래 내려가 있으면 30초에 한 번까지 늦춘다(모두가 15초마다 두드리지 않게,
 *  그래도 서버가 돌아오면 반 분 남짓 안에 다시 붙게) */
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];
const FULL_RETRY = 30_000;
/** 관전 연결이 자리를 내준 뒤 다시 이어 보기까지(ms) */
const OBSERVE_REPLACED_RETRY = 15_000;
/** 자리가 바뀌면 이 간격으로, 서서 둘러보기만 하면(보는 쪽만 바뀜) 더 드물게 보낸다. 서버는 받은 메시지 수만큼 일한다 */
const SEND_GAP = 150;
const TURN_GAP = 400;
const IDLE_SEND = 3000;
/** 보낸 상태의 답이 이만큼 없으면 올려 보내는 길이 막힌 것으로 보고, 풀릴 때까지 STALL_GAP에 한 번만 보낸다.
 *  막힌 동안 0.15초마다 보내면 브라우저가 쌓아 두었다가 풀릴 때 한꺼번에 내보내, 서버에 수십 개가 몰려 간다 */
const STALL_MS = 1000;
const STALL_GAP = 1000;
/** 보낸 상태의 답이 이만큼 오지 않으면 연결이 죽은 것으로 본다(가만히 있어도 3초마다 보낸 내 상태가 묶음으로 되돌아온다) */
const DEAD_MS = 10_000;
/** 인사도 못 받고 닫히기를 이만큼 거듭할 때마다 출입증을 새로 받는다(서버가 내려가 있는 동안 매번 새로 받지 않게) */
const TICKET_EVERY = 3;
/** 한 번 이어졌던 사람이 출입증을 거절당해도 이만큼은 물러났다 다시 받아 본다(명단 조회의 일시 오류일 수 있다) */
const DENIED_TRIES = 3;
/** 처음부터 거절이면 이만큼 뒤에 딱 한 번 더 물어보고, 그래도 거절이면 조용히 끈다 */
const DENIED_RECHECK = 20_000;
/** 서버는 1.5초에 한 번만 받는다. 도착 간격이 흔들려도 버려지지 않게 조금 넉넉히 */
const SAY_GAP = 1600;
const SAY_MAX = 80;
const EMIT_GAP = 66;
/** 출입증 수명이 이보다 적게 남았으면 다시 이을 때 새로 받는다 */
const REFRESH_BEFORE = 60_000;
const CLOSE_REPLACED = 4000;
const CLOSE_FULL = 4001;
const CLOSE_FLOOD = 4003;
/** 서버가 「너무 많이 보낸다」며 끊으면 이만큼 쉬었다 다시 잇는다. 거듭되면 두 배씩, FLOOD_PAUSE_MAX까지.
 *  이만큼(FLOOD_FORGET) 탈 없이 붙어 있었으면 처음부터 다시 센다 */
const FLOOD_PAUSE = 30_000;
const FLOOD_PAUSE_MAX = 300_000;
const FLOOD_FORGET = 60_000;
/** 겉모습 알림 간격(서버도 10초에 한 번만 받는다). 조금 넉넉히 */
const LOOK_GAP = 10_500;
/** 사진 겉모습 증표를 못 받았을 때 다시 받아 보는 간격. 다 쓰면 다음에 이어질 때까지 둔다 */
const PROOF_RETRY = [3_000, 10_000, 30_000];
/** 관전 연결이 살아 있는지 묻는 간격과 글자(서버의 런타임이 공간을 깨우지 않고 'pong'으로 답한다: game-server/src/protocol.ts) */
const PING_EVERY = 5_000;
const PING = 'ping';

/** 한 집(또는 방)이 넘칠 때 나눠 받는 공간 수(game-server/src/protocol.ts MAX_SHARDS와 같게) */
export const NET_SHARDS = 3;
/** base의 몇째 공간인가: base 자신은 1, 'base~n'은 n(2…NET_SHARDS). 그 밖은 0 */
function shardIndex(name: string, base: string): number {
  if (name === base) return 1;
  const m = name.startsWith(base) ? /^~([2-9])$/.exec(name.slice(base.length)) : null;
  const n = m ? Number(m[1]) : 0;
  return n <= NET_SHARDS ? n : 0;
}
/** 한 집(또는 방)의 공간 이름 모두(처음 공간과 넘칠 때의 ~2, ~3). 컨트롤 룸처럼 모두를 보려면 공간마다 관전 연결을 하나씩 둔다 */
export function spaceShards(base: string): string[] {
  return [base, ...Array.from({ length: NET_SHARDS - 1 }, (_, i) => `${base}~${i + 2}`)];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function wrapYaw(a: number): number {
  const tau = Math.PI * 2;
  let v = a % tau;
  if (v > Math.PI) v -= tau;
  if (v < -Math.PI) v += tau;
  return v;
}
function cleanSay(raw: string): string {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, SAY_MAX).join('').trim();
}
function socketUrl(base: string, space: string, token: string): string {
  const b = base.replace(/^http(s?):\/\//, 'ws$1://').replace(/\/+$/, '');
  return `${b}/connect?space=${encodeURIComponent(space)}&token=${encodeURIComponent(token)}`;
}

export function connectNet(opt: {
  space: string; // 'house:real' 또는 'room:<slug>'
  onPlayers: (players: RemotePlayer[]) => void; // 사람이 들어오고 나가거나 움직이거나 말할 때마다 전체 목록(나는 빼고)
  onStatus: (s: NetStatus) => void;
  /** 고르기: 말 기록 줄을 그릴 때(내 말도 서버를 한 바퀴 돌아 온다) */
  onChat?: (m: NetChat) => void;
  /** 관전 연결(가족·관리자만): 받기만 하고 보내지 않는다. 남에게 보이지 않고 사람 수에 세지 않는다 */
  observe?: boolean;
}): Net {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    opt.onStatus('off');
    return { sendState() {}, say: () => false, setLook() {}, join() {}, close() {} };
  }

  const observe = opt.observe === true;
  /** 들어가려는 공간(집 또는 방). 이 공간이 가득 차면 서버가 알려 준 다음 공간(~2, ~3)으로 한 번 들어간다 */
  let space = opt.space;
  /** 다음 한 번의 연결만 들어갈 다음 공간(서버의 full.to). 그 뒤 다시 이을 때는 처음 공간부터 다시 두드린다
   *  (자리가 났으면 처음 공간으로 돌아오게) */
  let shard: string | null = null;
  /** 지금 연결이 들어간 공간과, 그 공간이 가득 찼다며 알려 준 다음 공간 */
  let target = space;
  let fullTo: string | null = null;
  let ws: WebSocket | null = null;
  let gen = 0; // 연결 세대: 바꾸거나 닫은 앞 연결의 늦은 이벤트를 버린다
  let ticket: Ticket | null = null;
  let status: NetStatus | null = null;
  let stopped = false;
  /** 탭이 숨었는가(이때는 끊고 쉰다). 관전은 숨은 탭에서도 잇는다: 뒤에 띄워 둔 컨트롤 룸이 기록을 이어 가게 */
  const hiddenNow = () => !observe && document.visibilityState === 'hidden';
  let hidden = hiddenNow();
  /** 관전 연결이 마지막으로 'ping'을 보낸 때 */
  let pingAt = 0;
  let attempt = 0;
  let selfId: string | null = null;
  let last: NetState | null = null;
  let sentKey = '';
  /** 마지막으로 보낸 자리(보는 쪽은 빼고) */
  let sentPos = '';
  let sentAt = 0;
  /** 답을 아직 못 받은 가장 오래된 상태 보냄의 때(없으면 0). 서버는 받은 상태를 0.1초 묶음으로 나에게도 되돌려 준다 */
  let waitingSince = 0;
  /** 지금 연결을 죽은 것으로 치고 끊는다(다시 잇기로 넘어간다) */
  let kill: (() => void) | null = null;
  /** 한 번이라도 이어졌는가, 그 뒤 출입증을 잇달아 거절당한 횟수, 인사 없이 닫힌 횟수 */
  let everLive = false;
  let deniedRuns = 0;
  let coldFails = 0;
  /** 이때까지는 다시 잇지 않는다(처음 거절 뒤 다시 물어보기까지, 넘침으로 끊긴 뒤 쉬는 동안).
   *  창을 누르거나 탭으로 돌아오거나 방을 옮겨도 당겨지지 않는다 */
  let holdUntil = 0;
  /** 넘침으로 잇달아 끊긴 횟수와, 지금 연결이 인사를 받은 때 */
  let floods = 0;
  let liveAt = 0;
  let lastSay = 0;
  /** 내가 정한 겉모습(새 연결마다 한 번 보낸다: 출입증 속 겉모습이 오래됐을 수 있어서), 마지막으로 보낸 때 */
  let myLook: CharacterLook | null = null;
  let lookAt = 0;
  let lookTimer: ReturnType<typeof setTimeout> | undefined;
  /** 사진 겉모습 증표(그 주소의 것, 만료 초)와, 늦게 온 증표 답을 버리기 위한 차례 번호 */
  let proof: { url: string; p: string; exp: number } | null = null;
  let lookSeq = 0;
  let lastEmit = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let sendTimer: ReturnType<typeof setTimeout> | undefined;
  let emitTimer: ReturnType<typeof setTimeout> | undefined;
  const players = new Map<string, RemotePlayer>();
  const placed = new Set<string>(); // 첫 위치를 받은 사람만 엔진에 넘긴다

  const setStatus = (s: NetStatus) => {
    if (s === status) return;
    status = s;
    opt.onStatus(s);
  };
  const live = () => status === 'live' && ws !== null && ws.readyState === WebSocket.OPEN;

  function doEmit() {
    emitTimer = undefined;
    lastEmit = Date.now();
    const list: RemotePlayer[] = [];
    for (const p of players.values()) if (placed.has(p.id)) list.push({ ...p });
    opt.onPlayers(list);
  }
  /** 목록 알림은 한 프레임 남짓(66ms)에 한 번으로 묶는다 */
  function emit() {
    if (emitTimer !== undefined || stopped) return;
    const wait = EMIT_GAP - (Date.now() - lastEmit);
    if (wait <= 0) doEmit();
    else emitTimer = setTimeout(doEmit, wait);
  }
  function clearPlayers() {
    const had = players.size > 0;
    players.clear();
    placed.clear();
    selfId = null;
    if (had) {
      clearTimeout(emitTimer);
      doEmit();
    }
  }

  function upsert(w: Wire): void {
    if (typeof w.id !== 'string' || w.id === selfId) return;
    const prev = players.get(w.id);
    const p: RemotePlayer = prev ?? {
      id: w.id,
      name: typeof w.n === 'string' && w.n ? w.n : '손님',
      color: typeof w.c === 'string' ? w.c : '#c98a5a',
      x: 0, z: 0, y: 0, level: 1, yaw: 0, moving: false,
    };
    if (num(w.x) && num(w.z)) {
      p.x = w.x;
      p.z = w.z;
      p.y = num(w.y) ? w.y : 0;
      p.level = w.l === 2 ? 2 : 1;
      p.yaw = num(w.yw) ? w.yw : 0;
      p.moving = w.m === true;
      // 점프 수와 앉음(옛 서버·옛 화면은 보내지 않는다: 점프 수는 없으면 그대로 두고, 앉음은 서 있는 것으로)
      if (num(w.j)) p.jumps = w.j;
      p.sitting = w.st === 1 || w.st === true;
      placed.add(p.id);
    }
    if (typeof w.b === 'string' && w.b) {
      p.bubble = w.b;
      p.bubbleAt = Date.now();
    }
    if (w.k && typeof w.k === 'object') p.look = cleanLook(w.k);
    players.set(p.id, p);
  }

  /** 받은 메시지를 반영한다. 서버가 곧 닫는다고 알리면 그 닫힘 코드를 돌려준다 */
  function onMessage(raw: unknown): number | null {
    let m: Msg;
    try {
      m = JSON.parse(String(raw)) as Msg;
    } catch {
      return null;
    }
    if (!m || typeof m !== 'object') return null;
    if (m.t === 'hi') {
      players.clear();
      placed.clear();
      selfId = typeof m.you === 'string' ? m.you : null;
      if (Array.isArray(m.players)) for (const w of m.players) if (w && typeof w === 'object') upsert(w as Wire);
      attempt = 0;
      liveAt = Date.now();
      pingAt = liveAt;
      setStatus('live');
      sentKey = '';
      sentPos = '';
      // 관전 연결은 보내지 않는다(서버도 받지 않는다)
      if (!observe) {
        sendNow(true);
        // 새 연결은 서버 쪽 간격이 처음부터라 바로 보낸다
        lookAt = 0;
        sendLook();
      }
      doEmit();
    } else if (m.t === 'j' && m.p && typeof m.p === 'object') {
      upsert(m.p as Wire);
      emit();
    } else if (m.t === 'S' && Array.isArray(m.ps)) {
      // 0.1초 동안 움직인 사람들 묶음(내 것도 들어 있어 거른다)
      let any = false;
      for (const e of m.ps as unknown[]) {
        if (!e || typeof e !== 'object') continue;
        const w = e as Wire;
        if (typeof w.id === 'string' && w.id !== selfId && players.has(w.id)) {
          upsert(w);
          any = true;
        }
      }
      if (any) emit();
    } else if (m.t === 's' && typeof m.id === 'string' && players.has(m.id)) {
      upsert(m);
      emit();
    } else if (m.t === 'c' && typeof m.id === 'string' && typeof m.text === 'string') {
      const at = Date.now();
      const self = m.id === selfId;
      const p = players.get(m.id);
      if (p) {
        p.bubble = m.text;
        p.bubbleAt = at;
        emit();
      }
      if (self || p) opt.onChat?.({ id: m.id, name: p?.name ?? '', color: p?.color ?? '', text: m.text, at, self });
    } else if (m.t === 'k' && typeof m.id === 'string' && m.id !== selfId) {
      const p = players.get(m.id);
      if (p && m.look && typeof m.look === 'object') {
        p.look = cleanLook(m.look);
        emit();
      }
    } else if (m.t === 'l' && typeof m.id === 'string') {
      if (players.delete(m.id)) {
        placed.delete(m.id);
        emit();
      }
    } else if (m.t === 'full') {
      // 다음 공간을 알려 주면 그리로 간다. 같은 집(방)의, 지금보다 뒤의 공간일 때만(서로 미루며 되풀이하지 않게)
      fullTo = typeof m.to === 'string' && shardIndex(m.to, space) > shardIndex(target, space) ? m.to : null;
      return CLOSE_FULL;
    } else if (m.t === 'bye') {
      return m.why === 'replaced' ? CLOSE_REPLACED : m.why === 'flood' ? CLOSE_FLOOD : 1000;
    }
    return null;
  }

  /** 출입증. 만료 1분 전까지는 있는 것을 쓰고, 그 뒤에는 새로 받는다. 404면 'denied' */
  async function getTicket(force = false): Promise<Ticket | 'denied' | null> {
    if (!force && ticket && ticket.exp * 1000 - Date.now() > REFRESH_BEFORE) return ticket;
    try {
      const r = await fetch(observe ? '/api/game-token?observe=1' : '/api/game-token', { cache: 'no-store', credentials: 'same-origin' });
      if (r.status === 401 || r.status === 403 || r.status === 404) return 'denied';
      if (!r.ok) return null;
      const j = (await r.json()) as Partial<Ticket>;
      if (typeof j.token !== 'string' || typeof j.url !== 'string' || !num(j.exp)) return 'denied';
      // 출입증은 연결을 맺는 순간에만 쓰인다. 붙어 있는 동안에는 새로 받지 않고, 다시 이을 때 낡았으면 그때 받는다
      ticket = { token: j.token, url: j.url, exp: j.exp };
      return ticket;
    } catch {
      return null;
    }
  }

  function dropSocket() {
    gen += 1;
    kill = null;
    waitingSince = 0;
    clearTimeout(sendTimer);
    sendTimer = undefined;
    const s = ws;
    ws = null;
    if (s && s.readyState <= WebSocket.OPEN) {
      try {
        s.close(1000, 'bye');
      } catch {
        // 이미 닫힘
      }
    }
    clearPlayers();
  }
  function deny() {
    stopped = true;
    clearTimeout(retryTimer);
    dropSocket();
    setStatus('denied');
  }
  function retry() {
    setStatus('retrying');
    clearTimeout(retryTimer);
    // 서버가 다시 뜰 때 모두가 같은 순간에 붙지 않게 ±25% 흩뜨린다
    const base = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    retryTimer = setTimeout(connect, base * (0.75 + Math.random() * 0.5));
    attempt += 1;
  }

  async function connect(): Promise<void> {
    clearTimeout(retryTimer);
    if (stopped || hidden) return;
    dropSocket();
    // 쉬는 중이면 출입증도 연결도 새로 청하지 않고, 남은 시간 뒤로 다시 잡는다
    const hold = holdUntil - Date.now();
    if (hold > 0) {
      setStatus('retrying');
      retryTimer = setTimeout(connect, hold);
      return;
    }
    const my = gen;
    if (status !== 'retrying' && status !== 'full') setStatus('connecting');
    const t = await getTicket();
    if (my !== gen || stopped || hidden) return;
    if (t === 'denied') {
      // 거절이 일시 오류일 수 있다(명단 조회가 잠깐 실패해도 같은 답이 온다). 한 번 이어졌던 사람이면 몇 번 물러났다
      // 다시 받아 보고, 처음부터 거절이면 한참 뒤 한 번만 더 물어본 다음 조용히 끈다(쓸 수 없는 사람이 계속 두드리지 않게)
      if (everLive) {
        if (deniedRuns++ < DENIED_TRIES) return retry();
      } else if (deniedRuns++ < 1) {
        holdUntil = Date.now() + DENIED_RECHECK;
        setStatus('retrying');
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, DENIED_RECHECK);
        return;
      }
      return deny();
    }
    if (!t) return retry();
    // 앞 연결이 「가득 찼다, 다음 공간으로」라고 했으면 이번 한 번만 그 공간으로. 아니면 처음 공간으로
    target = shard ?? space;
    shard = null;
    fullTo = null;
    let sock: WebSocket;
    try {
      sock = new WebSocket(socketUrl(t.url, target, t.token));
    } catch {
      return retry();
    }
    ws = sock;
    let greeted = false;
    let done = false;
    sock.onmessage = (e) => {
      if (my !== gen) return;
      waitingSince = 0;
      const closing = onMessage(e.data);
      if (status === 'live' && !greeted) {
        greeted = true;
        everLive = true;
        deniedRuns = 0;
        coldFails = 0;
      }
      // 서버가 닫는다고 말했으면 닫기 프레임을 기다리지 않고 바로 정리한다
      if (closing !== null) {
        try {
          sock.close();
        } catch {
          // 이미 닫힘
        }
        finish(closing);
      }
    };
    const finish = (code: number) => {
      if (done || my !== gen) return;
      done = true;
      if (kill === end) kill = null;
      ws = null;
      clearTimeout(sendTimer);
      sendTimer = undefined;
      clearPlayers();
      // 한동안 탈 없이 붙어 있었으면 앞서 넘침으로 끊겼던 일은 잊는다
      if (greeted && Date.now() - liveAt > FLOOD_FORGET) floods = 0;
      if (code === CLOSE_FLOOD) {
        // 서버가 「너무 많이 보낸다」며 끊었다. 바로 다시 붙으면 같은 일이 되풀이되므로 길게 쉬고, 거듭되면 더 길게 쉰다.
        // 숨은 탭도 이 쉼은 지킨다(돌아오자마자 붙지 않는다)
        floods += 1;
        holdUntil = Date.now() + Math.min(FLOOD_PAUSE * 2 ** (floods - 1), FLOOD_PAUSE_MAX);
      }
      if (stopped || hidden) return;
      if (code === CLOSE_FLOOD) {
        setStatus('retrying');
        retryTimer = setTimeout(connect, holdUntil - Date.now());
        return;
      }
      if (code === CLOSE_REPLACED) {
        if (observe) {
          // 관전 연결은 소식이 끊겼을 때만 자리를 내준다(서버 규칙). 이 화면이 아직 살아 있으면 잠시 뒤 다시 이어 본다
          // (자리가 모두 살아 있으면 full을 받아 30초마다 다시 두드린다). 켜 둔 녹화 화면이 멈춰 버리지 않게
          setStatus('retrying');
          retryTimer = setTimeout(connect, OBSERVE_REPLACED_RETRY);
          return;
        }
        // 같은 사람이 다른 창에서 들어왔다. 서로 빼앗지 않게 이 창이 다시 보이거나 눌릴 때까지 쉰다
        setStatus('off');
        return;
      }
      if (code === CLOSE_FULL) {
        // 다음 공간을 알려 줬으면 바로 그리로 간다(가득 찼다는 알림 없이). 아니면 알리고 30초 뒤 처음 공간부터 다시 두드린다
        const to = fullTo;
        fullTo = null;
        if (to) {
          shard = to;
          retryTimer = setTimeout(connect, 0);
          return;
        }
        setStatus('full');
        retryTimer = setTimeout(connect, FULL_RETRY);
        return;
      }
      // 인사도 못 받고 닫혔다면 출입증이 거절됐을 수도, 서버가 잠깐 내려갔을 수도 있다(브라우저는 둘을 가려 주지 않는다).
      // 세 번에 한 번만 새로 받는다: 서버가 내려가 있는 동안 모든 손님이 물러날 때마다 출입증을 새로 받지 않게
      if (!greeted && ++coldFails % TICKET_EVERY === 0) ticket = null;
      retry();
    };
    const end = () => {
      try {
        sock.close();
      } catch {
        // 이미 닫힘
      }
      finish(1006);
    };
    kill = end;
    sock.onclose = (e) => finish(e.code);
    // 연결 실패 때 onclose 없이 onerror만 오는 환경도 있다(노드). 브라우저는 둘 다 오므로 finish는 한 번만 돈다
    sock.onerror = () => {
      try {
        sock.close();
      } catch {
        // 아직 열리지 않음
      }
      finish(1006);
    };
  }

  /** 사진 겉모습 증표(/api/game-token/look). 서버는 출입증에 실려 온 사진이 아니면 이것이 있어야 받는다. 못 받으면 null */
  async function lookProof(url: string): Promise<string | null> {
    if (proof && proof.url === url && proof.exp * 1000 - Date.now() > REFRESH_BEFORE) return proof.p;
    try {
      const id = url.slice(url.lastIndexOf('/') + 1);
      const r = await fetch(`/api/game-token/look?id=${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return null;
      const j = (await r.json()) as { proof?: unknown; exp?: unknown };
      if (typeof j.proof !== 'string' || !num(j.exp)) return null;
      proof = { url, p: j.proof, exp: j.exp };
      return j.proof;
    } catch {
      return null;
    }
  }

  /**
   * 내 겉모습을 보낸다. 앞에 보낸 지 10초가 안 됐으면 그때까지 미뤘다가 마지막 것만.
   * again: 증표를 못 받아 다시 받아 보는 몇 번째 차례인가(처음 보낼 때는 0)
   */
  function sendLook(again = 0): void {
    clearTimeout(lookTimer);
    lookTimer = undefined;
    const seq = ++lookSeq;
    if (!myLook || !live()) return;
    const wait = LOOK_GAP - (Date.now() - lookAt);
    // 다시 받아 보는 차례는 간격을 기다리지 않는다: 증표 없이 보낸 사진을 서버가 버렸다면 서버의 간격은 쓰이지 않았다
    if (!again && lookAt && wait > 0) {
      lookTimer = setTimeout(() => sendLook(), wait);
      return;
    }
    const look = myLook;
    const emitLook = (p: string | null) => {
      ws!.send(JSON.stringify(p ? { t: 'k', look, p } : { t: 'k', look }));
      lookAt = Date.now();
    };
    if (look.kind !== 'photo') return emitLook(null);
    // 사진은 내 그림이라는 증표를 받아 함께 보낸다. 못 받아도 처음 한 번은 보낸다(출입증에 실린 사진과 같으면 서버가 받는다).
    // 기다리는 사이 겉모습이나 연결이 바뀌었으면 그쪽에서 다시 보내므로 이 답은 버린다
    const my = gen;
    void lookProof(look.url).then((p) => {
      if (seq !== lookSeq || my !== gen || !live()) return;
      if (p || !again) emitLook(p);
      // 증표를 못 받았으면(연결이 잠깐 끊겼거나 조회가 잠깐 실패) 몇 번 물러났다 다시 받아 본다. 그냥 두면 서버가
      // 증표 없는 사진을 버려, 다시 이어질 때까지 남에게는 인형으로만 보인다. 받으면 증표를 붙여 다시 보낸다
      if (!p && again < PROOF_RETRY.length) lookTimer = setTimeout(() => sendLook(again + 1), PROOF_RETRY[again]);
    });
  }

  /** 지금 보낼 만하면 보낸다. 같은 값은 3초마다 한 번만, 다른 값은 125ms 간격으로 */
  function sendNow(force = false): void {
    if (!live() || !last) return;
    const s = last;
    if (![s.x, s.z, s.y, s.yaw].every(num)) return;
    const msg: Record<string, unknown> = { t: 's', x: r2(s.x), z: r2(s.z), y: r2(s.y), l: s.level === 2 ? 2 : 1, yw: r2(wrapYaw(s.yaw)), m: Boolean(s.moving) };
    // 점프 수(0~255를 돈다)와 앉음. 바뀌면 자리가 바뀐 것처럼 바로 보낸다(점프는 몸 높이를 바꾸지 않아 따로 알려야 남의 화면에서 뛴다)
    if (num(s.jumps)) msg.j = ((Math.floor(s.jumps) % 256) + 256) % 256;
    if (s.sitting) msg.st = 1;
    const pos = `${msg.x},${msg.z},${msg.y},${msg.l},${msg.m},${msg.j ?? ''},${msg.st ?? 0}`;
    const key = `${pos},${msg.yw}`;
    const now = Date.now();
    if (key === sentKey && !force && now - sentAt < IDLE_SEND) return;
    // 보낸 것의 답이 한참 없으면(올려 보내는 길이 막힘) 쌓지 않고 드물게만 보내 본다. 답이 오면 바로 제 빠르기로 돌아간다.
    // 자리는 그대로이고 보는 쪽만 바뀌었으면(서서 둘러보기) 더 드물게 보낸다
    const stalled = waitingSince !== 0 && now - waitingSince > STALL_MS;
    const gap = stalled ? STALL_GAP : pos === sentPos && !force ? TURN_GAP : SEND_GAP;
    if (now - sentAt < gap) {
      // 기다리는 동안 자리가 바뀌면 더 짧은 간격으로 다시 잡는다
      clearTimeout(sendTimer);
      sendTimer = setTimeout(() => {
        sendTimer = undefined;
        sendNow(force);
      }, gap - (now - sentAt));
      return;
    }
    clearTimeout(sendTimer);
    sendTimer = undefined;
    ws!.send(JSON.stringify(msg));
    sentKey = key;
    sentPos = pos;
    sentAt = now;
    if (!waitingSince) waitingSince = now;
  }
  // 걷기 화면이 상태를 안 보내는 동안에도(놀이 덮개 등) 3초마다 한 번은 살아 있다고 알린다.
  // 서버 소식이 끊겼으면(와이파이가 약해지거나 기지국이 바뀌면 닫힘 신호가 수십 초 뒤에 온다) 스스로 끊고 다시 잇는다
  const idle = setInterval(() => {
    // 보낸 상태(관전 연결은 ping)의 답이 한참 오지 않을 때만 죽은 것으로 본다. 아직 아무것도 보내지 않았으면(3D 장면을 짓는 중이라
    // 보낼 자리가 없을 때) 서버도 말이 없는 것이 정상이다
    if (live() && waitingSince && Date.now() - waitingSince > DEAD_MS) {
      kill?.();
      return;
    }
    if (observe) {
      // 관전 연결은 상태를 보내지 않으므로 5초마다 ping으로 묻는다(서버는 사람이 없어도 잠든 채 'pong'으로 답한다)
      const now = Date.now();
      if (live() && now - pingAt >= PING_EVERY) {
        pingAt = now;
        ws!.send(PING);
        if (!waitingSince) waitingSince = now;
      }
      return;
    }
    sendNow(false);
  }, 1000);

  const sleepNow = () => {
    if (stopped) return;
    hidden = true;
    clearTimeout(retryTimer);
    dropSocket();
    setStatus('off');
  };
  const wakeNow = () => {
    if (stopped || !hidden || hiddenNow()) return;
    hidden = false;
    attempt = 0;
    void connect();
  };
  // 탭이 숨으면 끊고(전화 잠금·다른 탭), 돌아오면 다시 맺는다. 관전은 숨어도 끊지 않는다(hiddenNow가 늘 false)
  const onVisibility = () => (hiddenNow() ? sleepNow() : wakeNow());
  const onWake = () => {
    if (stopped || hidden) return;
    if (status === 'off' || status === 'retrying') {
      attempt = 0;
      void connect();
    }
  };
  // 기기가 통신이 끊겼다고 알리면 닫힘 신호를 기다리지 않고 바로 끊는다(돌아오면 online에서 다시 잇는다)
  const onOffline = () => {
    if (!stopped && !hidden) kill?.();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', sleepNow);
  window.addEventListener('pageshow', wakeNow);
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  window.addEventListener('offline', onOffline);

  if (hidden) setStatus('off');
  else void connect();

  return {
    sendState(s) {
      if (observe) return;
      last = s;
      sendNow(false);
    },
    say(text) {
      const t = cleanSay(text);
      const now = Date.now();
      if (observe || !t || !live() || now - lastSay < SAY_GAP) return false;
      lastSay = now;
      ws!.send(JSON.stringify({ t: 'c', text: t }));
      return true;
    },
    setLook(look) {
      if (observe) return;
      const clean = cleanLook(look);
      if (JSON.stringify(clean) === JSON.stringify(myLook)) return;
      myLook = clean;
      sendLook();
    },
    join(next) {
      if (stopped) return;
      space = next;
      shard = null;
      attempt = 0;
      sentKey = '';
      sentPos = '';
      clearTimeout(retryTimer);
      dropSocket();
      if (!hidden) void connect();
    },
    close() {
      if (stopped && status === 'off') return;
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(emitTimer);
      clearTimeout(lookTimer);
      clearInterval(idle);
      dropSocket();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', sleepNow);
      window.removeEventListener('pageshow', wakeNow);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      window.removeEventListener('offline', onOffline);
      if (status !== 'denied') setStatus('off');
    },
  };
}

/** 약속 글(컨트롤 룸 묶음과 맞춘 이름)의 이름으로도 부를 수 있게. 같은 함수다 */
export const createNet = connectNet;
