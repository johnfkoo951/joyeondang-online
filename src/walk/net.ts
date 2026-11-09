// 함께 걷기 연결. 같은 공간(집 또는 방 하나)에 있는 사람들의 위치·이름·말을 주고받는다.
// 서버는 game-server/(Cloudflare Durable Object), 짧은 키 JSON 규약은 game-server/src/protocol.ts와 짝이다.
// 출입증은 /api/game-token에서 받는다(손님 이상만, 아니면 404 → 'denied'로 조용히 끈다).
import { cleanLook, type CharacterLook } from './look';
import type { Level, RemotePlayer } from './types';

export type NetStatus = 'off' | 'connecting' | 'live' | 'retrying' | 'full' | 'denied';
export type NetState = { x: number; z: number; y: number; level: Level; yaw: number; moving: boolean };
/** 누군가 말했을 때(나 포함). at은 받은 때(ms, Date.now 기준). self면 name·color는 빈 글자(내 이름표는 화면이 안다) */
export type NetChat = { id: string; name: string; color: string; text: string; at: number; self: boolean };
export type Net = {
  /** 내 상태를 보낸다(값이 바뀌었을 때만 실제로 보내고, 초당 최대 8번, 가만히 있으면 3초마다 한 번) */
  sendState(s: NetState): void;
  /** 말하기(80자, 1.5초에 한 번). 보낼 수 없으면 false */
  say(text: string): boolean;
  /** 내 겉모습이 바뀌었다(다른 사람에게 알린다). 10초에 한 번까지, 그사이 바뀐 것은 마지막 것만 뒤에 보낸다 */
  setLook(look: CharacterLook): void;
  /** 공간을 바꾼다(집 ↔ 방). 연결을 새로 맺는다 */
  join(space: string): void;
  close(): void;
};

type Ticket = { token: string; url: string; exp: number };
type Wire = { id?: unknown; n?: unknown; c?: unknown; x?: unknown; z?: unknown; y?: unknown; l?: unknown; yw?: unknown; m?: unknown; b?: unknown; k?: unknown };
type Msg = Wire & { t?: unknown; you?: unknown; players?: unknown; p?: unknown; ps?: unknown; text?: unknown; why?: unknown; look?: unknown };

const BACKOFF = [1000, 2000, 4000, 8000, 15000];
const FULL_RETRY = 30_000;
const SEND_GAP = 125;
const IDLE_SEND = 3000;
/** 서버는 1.5초에 한 번만 받는다. 도착 간격이 흔들려도 버려지지 않게 조금 넉넉히 */
const SAY_GAP = 1600;
const SAY_MAX = 80;
const EMIT_GAP = 66;
const REFRESH_BEFORE = 60_000;
const CLOSE_REPLACED = 4000;
const CLOSE_FULL = 4001;
/** 겉모습 알림 간격(서버도 10초에 한 번만 받는다). 조금 넉넉히 */
const LOOK_GAP = 10_500;

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
}): Net {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    opt.onStatus('off');
    return { sendState() {}, say: () => false, setLook() {}, join() {}, close() {} };
  }

  let space = opt.space;
  let ws: WebSocket | null = null;
  let gen = 0; // 연결 세대: 바꾸거나 닫은 앞 연결의 늦은 이벤트를 버린다
  let ticket: Ticket | null = null;
  let status: NetStatus | null = null;
  let stopped = false;
  let hidden = document.visibilityState === 'hidden';
  let attempt = 0;
  let selfId: string | null = null;
  let last: NetState | null = null;
  let sentKey = '';
  let sentAt = 0;
  let lastSay = 0;
  /** 내가 정한 겉모습(새 연결마다 한 번 보낸다: 출입증 속 겉모습이 오래됐을 수 있어서), 마지막으로 보낸 때 */
  let myLook: CharacterLook | null = null;
  let lookAt = 0;
  let lookTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEmit = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
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
      setStatus('live');
      sentKey = '';
      sendNow(true);
      // 새 연결은 서버 쪽 간격이 처음부터라 바로 보낸다
      lookAt = 0;
      sendLook();
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
      return CLOSE_FULL;
    } else if (m.t === 'bye') {
      return m.why === 'replaced' ? CLOSE_REPLACED : 1000;
    }
    return null;
  }

  /** 출입증. 만료 1분 전까지는 있는 것을 쓰고, 그 뒤에는 새로 받는다. 404면 'denied' */
  async function getTicket(force = false): Promise<Ticket | 'denied' | null> {
    if (!force && ticket && ticket.exp * 1000 - Date.now() > REFRESH_BEFORE) return ticket;
    try {
      const r = await fetch('/api/game-token', { cache: 'no-store', credentials: 'same-origin' });
      if (r.status === 401 || r.status === 403 || r.status === 404) return 'denied';
      if (!r.ok) return null;
      const j = (await r.json()) as Partial<Ticket>;
      if (typeof j.token !== 'string' || typeof j.url !== 'string' || !num(j.exp)) return 'denied';
      ticket = { token: j.token, url: j.url, exp: j.exp };
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, Math.max(5000, ticket.exp * 1000 - Date.now() - REFRESH_BEFORE));
      return ticket;
    } catch {
      return null;
    }
  }
  async function refresh() {
    if (stopped || hidden) return;
    if ((await getTicket(true)) === 'denied') deny();
  }

  function dropSocket() {
    gen += 1;
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
    clearTimeout(refreshTimer);
    dropSocket();
    setStatus('denied');
  }
  function retry() {
    setStatus('retrying');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
    attempt += 1;
  }

  async function connect(): Promise<void> {
    clearTimeout(retryTimer);
    if (stopped || hidden) return;
    dropSocket();
    const my = gen;
    if (status !== 'retrying' && status !== 'full') setStatus('connecting');
    const t = await getTicket();
    if (my !== gen || stopped || hidden) return;
    if (t === 'denied') return deny();
    if (!t) return retry();
    let sock: WebSocket;
    try {
      sock = new WebSocket(socketUrl(t.url, space, t.token));
    } catch {
      return retry();
    }
    ws = sock;
    let greeted = false;
    let done = false;
    sock.onmessage = (e) => {
      if (my !== gen) return;
      const closing = onMessage(e.data);
      if (status === 'live') greeted = true;
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
      ws = null;
      clearTimeout(sendTimer);
      sendTimer = undefined;
      clearPlayers();
      if (stopped || hidden) return;
      if (code === CLOSE_REPLACED) {
        // 같은 사람이 다른 창에서 들어왔다. 서로 빼앗지 않게 이 창이 다시 보이거나 눌릴 때까지 쉰다
        setStatus('off');
        return;
      }
      if (code === CLOSE_FULL) {
        setStatus('full');
        retryTimer = setTimeout(connect, FULL_RETRY);
        return;
      }
      // 인사도 못 받고 닫혔다면 출입증이 거절됐을 수 있으니 다음에는 새로 받는다
      if (!greeted) ticket = null;
      retry();
    };
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

  /** 내 겉모습을 보낸다. 앞에 보낸 지 10초가 안 됐으면 그때까지 미뤘다가 마지막 것만 */
  function sendLook(): void {
    clearTimeout(lookTimer);
    lookTimer = undefined;
    if (!myLook || !live()) return;
    const wait = LOOK_GAP - (Date.now() - lookAt);
    if (lookAt && wait > 0) {
      lookTimer = setTimeout(sendLook, wait);
      return;
    }
    ws!.send(JSON.stringify({ t: 'k', look: myLook }));
    lookAt = Date.now();
  }

  /** 지금 보낼 만하면 보낸다. 같은 값은 3초마다 한 번만, 다른 값은 125ms 간격으로 */
  function sendNow(force = false): void {
    if (!live() || !last) return;
    const s = last;
    if (![s.x, s.z, s.y, s.yaw].every(num)) return;
    const msg = { t: 's', x: r2(s.x), z: r2(s.z), y: r2(s.y), l: s.level === 2 ? 2 : 1, yw: r2(wrapYaw(s.yaw)), m: Boolean(s.moving) };
    const key = `${msg.x},${msg.z},${msg.y},${msg.l},${msg.yw},${msg.m}`;
    const now = Date.now();
    if (key === sentKey && !force && now - sentAt < IDLE_SEND) return;
    if (now - sentAt < SEND_GAP) {
      if (sendTimer === undefined) {
        sendTimer = setTimeout(() => {
          sendTimer = undefined;
          sendNow(force);
        }, SEND_GAP - (now - sentAt));
      }
      return;
    }
    ws!.send(JSON.stringify(msg));
    sentKey = key;
    sentAt = now;
  }
  // 걷기 화면이 상태를 안 보내는 동안에도(놀이 덮개 등) 3초마다 한 번은 살아 있다고 알린다
  const idle = setInterval(() => sendNow(false), 1000);

  const sleepNow = () => {
    if (stopped) return;
    hidden = true;
    clearTimeout(retryTimer);
    dropSocket();
    setStatus('off');
  };
  const wakeNow = () => {
    if (stopped || !hidden || document.visibilityState === 'hidden') return;
    hidden = false;
    attempt = 0;
    void connect();
  };
  // 탭이 숨으면 끊고(전화 잠금·다른 탭), 돌아오면 다시 맺는다
  const onVisibility = () => (document.visibilityState === 'hidden' ? sleepNow() : wakeNow());
  const onWake = () => {
    if (stopped || hidden) return;
    if (status === 'off' || status === 'retrying') {
      attempt = 0;
      void connect();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', sleepNow);
  window.addEventListener('pageshow', wakeNow);
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);

  if (hidden) setStatus('off');
  else void connect();

  return {
    sendState(s) {
      last = s;
      sendNow(false);
    },
    say(text) {
      const t = cleanSay(text);
      const now = Date.now();
      if (!t || !live() || now - lastSay < SAY_GAP) return false;
      lastSay = now;
      ws!.send(JSON.stringify({ t: 'c', text: t }));
      return true;
    },
    setLook(look) {
      const clean = cleanLook(look);
      if (JSON.stringify(clean) === JSON.stringify(myLook)) return;
      myLook = clean;
      sendLook();
    },
    join(next) {
      if (stopped) return;
      space = next;
      attempt = 0;
      sentKey = '';
      clearTimeout(retryTimer);
      dropSocket();
      if (!hidden) void connect();
    },
    close() {
      if (stopped && status === 'off') return;
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(refreshTimer);
      clearTimeout(emitTimer);
      clearTimeout(lookTimer);
      clearInterval(idle);
      dropSocket();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', sleepNow);
      window.removeEventListener('pageshow', wakeNow);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      if (status !== 'denied') setStatus('off');
    },
  };
}
