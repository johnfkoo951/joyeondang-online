// 공간 하나(집 또는 방 하나) = Durable Object 하나. 사람 정보는 WebSocket 붙임표(serializeAttachment)에 두어
// 잠들었다 깨어나도(Hibernation) 이어진다. 위치·말은 저장소에 쓰지 않는다(기록이 남지 않는 대화).
// 관전자(출입증 role 'observer')도 같은 목록에 o 표시를 달고 둔다: 사람 수에 세지 않고, 남에게 알리지 않고, 받기만 한다.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import {
  BUBBLE_MS, CHAT_GAP_MS, CHAT_MAX, CLOSE_FLOOD, CLOSE_FULL, CLOSE_REPLACED, CLOSE_STALE, FLOOD_REST_MS, FLUSH_MS, LOOK_GAP_MS, MAX_MESSAGE,
  MAX_OBSERVERS, MAX_PLAYERS, OBSERVER_EXP_GRACE_MS, OBSERVER_QUIET_MS, OBSERVERS_PER_SUB, OBSERVER_STALE_MS, PING, PONG,
  SAVE_GAP_MS, NAME_MAX, PLAYER_HEADER, STALE_MS, cleanColor, cleanLook, cleanText, nextShard, readState, takeFloodToken,
  type CharacterLook, type Pos, type WirePlayer,
} from './protocol';
import { photoAllowed } from './token';

type Person = {
  id: string;
  sub: string;
  n: string;
  c: string;
  /** 관전자면 1: 사람 수에 세지 않고, 남의 목록에 나오지 않고, 보내는 것을 받지 않는다 */
  o?: 1;
  /** 관전 연결이 들어온 때(ms). 같은 사람의 관전 연결이 넘치면 가장 오래된 것부터 닫는다 */
  at?: number;
  /** 겉모습(출입증의 프로필 값 또는 't:k'로 바꾼 값). 없으면 클라가 색으로 기본 인형을 그린다 */
  k?: CharacterLook;
  /** 출입증에 서명돼 온 사진 겉모습 주소(이 사진으로는 증표 없이 돌아올 수 있다) */
  tk?: string;
  /** 마지막으로 겉모습을 바꾼 때(ms) */
  lastK?: number;
  pos?: Pos;
  b?: string;
  ba?: number;
  /** 마지막으로 무엇이든 받은 때(ms) */
  seen: number;
  /** 넘침 통: 남은 양과 마지막으로 꺼낸 때(ms). 비면 끊는다(protocol.ts takeFloodToken) */
  fl?: number;
  ft?: number;
  /** 마지막으로 말한 때(ms) */
  lastC: number;
  /** 붙임표를 마지막으로 쓴 때(ms) */
  sv?: number;
  /** 관전자: 출입증이 끝나는 때(ms). 지나면 정리한다(다시 이을 때 역할을 다시 확인하게) */
  ex?: number;
};

/** 입구(index.ts)가 확인해 넘긴 출입증 내용 */
type Who = { sub: string; name: string; color: string; role?: string; look?: unknown; exp?: number };

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/** 넘쳐서 끊긴 사람을 적어 두는 열쇠. 관전 연결과 걷는 연결은 따로 센다(관전 화면이 넘쳐도 그 사람이 걷는 것은 막지 않게) */
const floodKey = (sub: string, observer: boolean) => (observer ? `o:${sub}` : sub);

export class Space extends DurableObject<Env> {
  private people = new Map<WebSocket, Person>();
  private lastSweep = 0;
  /** 다음 묶음에 실을 사람(이번 0.1초 동안 움직인 사람) */
  private dirty = new Set<WebSocket>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** 넘쳐서 끊긴 사람(floodKey → 끊은 때 ms). 잠들면 잊는다(잠들 만큼 조용해졌다는 뜻이라 괜찮다) */
  private flooded = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 깨어날 때마다 붙임표에서 사람 목록을 되살린다(생성자는 가볍게)
    for (const ws of ctx.getWebSockets()) {
      const p = ws.deserializeAttachment() as Person | null;
      if (p) this.people.set(ws, p);
    }
    // 관전자가 살아 있는지 묻는 'ping'에는 런타임이 공간을 깨우지 않고 'pong'으로 답한다
    // (사람이 없는 집을 밤새 관전해도 공간이 잠들 수 있게). 답한 때는 getWebSocketAutoResponseTimestamp로 읽는다
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    } catch {
      // 시험 환경(노드)에는 없다. 그때는 webSocketMessage가 직접 답한다
    }
  }

  async fetch(req: Request): Promise<Response> {
    let who: Who;
    try {
      who = JSON.parse(decodeURIComponent(req.headers.get(PLAYER_HEADER) ?? ''));
    } catch {
      return new Response('bad request', { status: 400 });
    }
    const now = Date.now();
    const watching = who.role === 'observer';
    // 방금 넘쳐서 끊긴 사람은 잠깐 들이지 않는다(끊기자마자 다시 붙어 같은 일을 되풀이하지 않게)
    const fk = floodKey(who.sub, watching);
    const floodAt = this.flooded.get(fk);
    if (floodAt !== undefined) {
      if (now - floodAt < FLOOD_REST_MS) return new Response('slow down', { status: 429 });
      this.flooded.delete(fk);
    }
    if (this.flooded.size > 64) for (const [key, at] of this.flooded) if (now - at >= FLOOD_REST_MS) this.flooded.delete(key);
    this.sweep(now, true);
    if (watching) return this.watch(who, now);

    // 같은 사람이 다시 들어오면(새로 고침, 다른 창) 앞 연결을 닫는다. 그 사람의 관전 연결은 그대로 둔다
    // (관리자가 한 창에서 걸으면서 다른 창에 관전 화면을 띄워 둘 수 있게)
    for (const [ws, p] of this.people) {
      if (!p.o && p.sub === who.sub) this.drop(ws, CLOSE_REPLACED, 'replaced');
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // 가득 찼으면 같은 집의 다음 공간을 알려 준다(입구가 확인한 이 공간의 이름은 요청 주소에 그대로 있다)
    if (this.count(false) >= MAX_PLAYERS) return this.full(server, client, nextShard(new URL(req.url).searchParams.get('space') ?? ''));

    const k = who.look && typeof who.look === 'object' ? cleanLook(who.look) : undefined;
    const me: Person = {
      id: newId(),
      sub: who.sub,
      n: cleanText(who.name, NAME_MAX) || '손님',
      c: cleanColor(who.color),
      ...(k ? { k } : {}),
      ...(k?.kind === 'photo' ? { tk: k.url } : {}),
      seen: now,
      lastC: 0,
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    const others = this.roster(now);
    this.people.set(server, me);
    server.send(JSON.stringify({ t: 'hi', you: me.id, players: others }));
    this.broadcast({ t: 'j', p: this.wire(me, now) }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** 관전자를 들인다: 사람 수에 세지 않고 남에게 알리지 않는다. 지금 있는 사람들을 인사로 주고, 그 뒤로 같은 소식을 받는다 */
  private watch(who: Who, now: number): Response {
    // 자리가 모자라면 조용한 연결(소식이 끊긴 것)부터 비운다. 모두 살아 있으면 새 연결을 돌려보낸다:
    // 켜 둔 녹화 화면이 새로 연 탭에 밀려나지 않고, 닫기 없이 죽은 연결은 자리를 내준다
    const heard = (ws: WebSocket, p: Person) => Math.max(p.seen, this.pingedAt(ws));
    const quietest = (list: [WebSocket, Person][]) =>
      list.filter(([ws, p]) => now - heard(ws, p) > OBSERVER_QUIET_MS).sort((a, b) => heard(a[0], a[1]) - heard(b[0], b[1]))[0];
    const observers = () => [...this.people].filter(([, p]) => p.o);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    for (;;) {
      const mine = observers().filter(([, p]) => p.sub === who.sub);
      if (mine.length < OBSERVERS_PER_SUB) break;
      const q = quietest(mine);
      if (!q) return this.full(server, client);
      this.drop(q[0], CLOSE_REPLACED, 'replaced');
    }
    if (this.count(true) >= MAX_OBSERVERS) {
      const q = quietest(observers());
      if (!q) return this.full(server, client);
      this.drop(q[0], CLOSE_REPLACED, 'replaced');
    }
    const ex = typeof who.exp === 'number' && Number.isFinite(who.exp) ? who.exp * 1000 : undefined;
    const me: Person = { id: newId(), sub: who.sub, n: cleanText(who.name, NAME_MAX) || '관전', c: cleanColor(who.color), o: 1, at: now, seen: now, lastC: 0, ...(ex ? { ex } : {}) };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    this.people.set(server, me);
    server.send(JSON.stringify({ t: 'hi', you: me.id, players: this.roster(now), o: 1 }));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** 가득 찼다: 붙잡지 않는 연결(잠들기 대상 아님)로 받아 알리고 바로 닫는다. to는 들어갈 다음 공간(걷는 사람만) */
  private full(server: WebSocket, client: WebSocket, to: string | null = null): Response {
    server.accept();
    server.send(JSON.stringify(to ? { t: 'full', to } : { t: 'full' }));
    server.close(CLOSE_FULL, 'full');
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const p = this.people.get(ws);
    if (!p) {
      this.safeClose(ws, 1008, 'unknown');
      return;
    }
    const now = Date.now();
    p.seen = now;
    // 종류를 가리지 않고 너무 많이 보내는 연결은 끊는다(몰려 온 정상 메시지는 통이 받아 준다)
    const left = takeFloodToken(p.fl, p.ft, now);
    p.ft = now;
    if (left < 0) {
      this.flooded.set(floodKey(p.sub, Boolean(p.o)), now);
      this.drop(ws, CLOSE_FLOOD, 'flood');
      return;
    }
    p.fl = left;
    this.sweep(now, false);
    if (raw === PING) {
      // 보통은 런타임이 깨우지 않고 답한다(생성자). 여기 닿았으면(답 설정이 없는 환경) 직접 답한다
      try {
        ws.send(PONG);
      } catch {
        // 닫히는 중
      }
      return this.touch(ws, p, now);
    }
    // 관전자는 받기만 한다: 상태·말·겉모습을 보내도 버린다
    if (p.o) return this.touch(ws, p, now);
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return this.save(ws, p);
    let msg: Record<string, unknown>;
    try {
      const v: unknown = JSON.parse(raw);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return this.save(ws, p);
      msg = v as Record<string, unknown>;
    } catch {
      return this.save(ws, p);
    }

    if (msg.t === 's') {
      // 상태는 받는 대로 마지막 값만 남긴다. 남에게는 0.1초 묶음으로만 가므로 몰려 와도 전하는 수는 늘지 않고,
      // 막혔다 풀린 뒤에 온 마지막(가장 새) 자리가 버려지지 않는다
      const pos = readState(msg);
      if (pos) {
        p.pos = pos;
        this.dirty.add(ws);
        this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS);
      }
    } else if (msg.t === 'c') {
      const text = now - p.lastC >= CHAT_GAP_MS ? cleanText(msg.text, CHAT_MAX) : '';
      if (text) {
        p.lastC = now;
        p.b = text;
        p.ba = now;
        this.broadcast({ t: 'c', id: p.id, text, at: now });
      }
      p.sv = now;
      return this.save(ws, p);
    } else if (msg.t === 'k') {
      // 겉모습: 10초에 한 번까지, 객체만. 고칠 수 있는 범위로 맞춰 모두에게 알린다
      const raw = msg.look;
      const gapOpen = () => !p.lastK || now - p.lastK >= LOOK_GAP_MS;
      if (gapOpen() && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const look = cleanLook(raw);
        // 사진은 내 그림일 때만 받는다(출입증의 사진이거나 사이트가 서명한 증표 p). 아니면 버리고 간격도 쓰지 않는다
        const mine = look.kind !== 'photo'
          || (await photoAllowed(look.url, p.tk, msg.p, p.sub, this.env.GAME_TOKEN_SECRET ?? '', now));
        // 서명을 확인하는 사이 이 연결이 떨어졌으면(다시 들어옴·넘침·오래 소식 없음) 여기서 끝낸다:
        // 아래의 붙임표 쓰기까지 가면 비워 둔 붙임표에 사람이 되살아나, 잠들었다 깨어날 때 목록에 유령으로 남는다
        if (this.people.get(ws) !== p) return;
        // 그사이 다른 겉모습을 먼저 받았으면 버린다
        if (mine && gapOpen()) {
          p.lastK = now;
          p.k = look;
          this.broadcast({ t: 'k', id: p.id, look: p.k });
          p.sv = now;
          return this.save(ws, p);
        }
      }
    }
    this.touch(ws, p, now);
  }

  /** 붙임표는 이 간격마다만 다시 쓴다(받은 때·넘침 통이 잠들었다 깨어나도 이어지게) */
  private touch(ws: WebSocket, p: Person, now: number): void {
    if (now - (p.sv ?? 0) >= SAVE_GAP_MS) {
      p.sv = now;
      this.save(ws, p);
    }
  }

  /** 모아 둔 움직임을 한 메시지로 모두에게(문자열은 한 번만 만든다) */
  private flush(): void {
    this.flushTimer = null;
    if (this.dirty.size === 0) return;
    const ps: Array<{ id: string } & Pos> = [];
    for (const ws of this.dirty) {
      const p = this.people.get(ws);
      if (p?.pos) ps.push({ id: p.id, ...p.pos });
    }
    this.dirty.clear();
    if (ps.length) this.broadcast({ t: 'S', ps });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private save(ws: WebSocket, p: Person): void {
    try {
      ws.serializeAttachment(p);
    } catch {
      // 닫히는 중인 연결이면 붙임표를 쓸 수 없다. 곧 leave가 정리한다
    }
  }

  private wire(p: Person, now: number): WirePlayer {
    const w: WirePlayer = { id: p.id, n: p.n, c: p.c, ...(p.k ? { k: p.k } : {}), ...(p.pos ?? {}) };
    if (p.b && p.ba && now - p.ba < BUBBLE_MS) {
      w.b = p.b;
      w.ba = p.ba;
    }
    return w;
  }

  /** 지금 있는 사람들(관전자는 빼고) */
  private roster(now: number): WirePlayer[] {
    const out: WirePlayer[] = [];
    for (const p of this.people.values()) if (!p.o) out.push(this.wire(p, now));
    return out;
  }

  /** 걷는 사람 수(observers: false) 또는 관전 연결 수(true) */
  private count(observers: boolean): number {
    let n = 0;
    for (const p of this.people.values()) if (Boolean(p.o) === observers) n++;
    return n;
  }

  /** 모두에게(관전자 포함) */
  private broadcast(msg: unknown, except?: WebSocket): void {
    const s = JSON.stringify(msg);
    for (const ws of this.people.keys()) {
      if (ws === except) continue;
      try {
        ws.send(s);
      } catch {
        // 끊어진 연결은 닫기 이벤트에서 정리된다
      }
    }
  }

  private leave(ws: WebSocket): void {
    const p = this.people.get(ws);
    if (!p) return;
    this.people.delete(ws);
    this.dirty.delete(ws);
    // 관전자는 남에게 알린 적이 없으니 나감도 알리지 않는다
    if (!p.o) this.broadcast({ t: 'l', id: p.id });
  }

  /** 서버가 먼저 닫는다: 목록에서 빼고 나감을 알린다 */
  private drop(ws: WebSocket, code: number, reason: 'replaced' | 'stale' | 'flood'): void {
    this.leave(ws);
    // 닫기 프레임만으로는 클라가 늦게 알아챌 때가 있어(닫는 손잡이가 끝나지 않음) 까닭을 먼저 말로 알린다
    try {
      // 닫는 손잡이가 늦게 끝나도 깨어날 때 목록에 되살아나지 않게 붙임표를 비운다
      ws.serializeAttachment(null);
      ws.send(JSON.stringify({ t: 'bye', why: reason }));
    } catch {
      // 이미 닫힘
    }
    this.safeClose(ws, code, reason);
  }

  private safeClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // 이미 닫힌 연결
    }
  }

  /** 런타임이 이 연결의 'ping'에 마지막으로 답한 때(ms). 모르면 0 */
  private pingedAt(ws: WebSocket): number {
    try {
      return this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
    } catch {
      return 0;
    }
  }

  /** 오래 소식이 없는 연결(전화가 잠들며 닫기 프레임 없이 사라진 경우)을 정리한다. 10초에 한 번만 */
  private sweep(now: number, force: boolean): void {
    if (!force && now - this.lastSweep < 10_000) return;
    this.lastSweep = now;
    for (const [ws, p] of this.people) {
      if (p.o) {
        // 관전자의 ping은 런타임이 답하므로(공간을 깨우지 않는다) 그 답한 때까지 함께 본다.
        // 출입증이 끝난 지 오래된 관전 연결도 닫는다(가족에서 빠진 계정이 계속 지켜보지 않게)
        if (now - Math.max(p.seen, this.pingedAt(ws)) > OBSERVER_STALE_MS || (p.ex && now > p.ex + OBSERVER_EXP_GRACE_MS)) this.drop(ws, CLOSE_STALE, 'stale');
      } else if (now - p.seen > STALE_MS) this.drop(ws, CLOSE_STALE, 'stale');
    }
  }
}
