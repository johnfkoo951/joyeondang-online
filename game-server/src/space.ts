// 공간 하나(집 또는 방 하나) = Durable Object 하나. 사람 정보는 WebSocket 붙임표(serializeAttachment)에 두어
// 잠들었다 깨어나도(Hibernation) 이어진다. 위치·말은 저장소에 쓰지 않는다(기록이 남지 않는 대화).
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import {
  BUBBLE_MS, CHAT_GAP_MS, CHAT_MAX, CLOSE_FULL, CLOSE_REPLACED, CLOSE_STALE, FLUSH_MS, LOOK_GAP_MS, MAX_MESSAGE, MAX_PLAYERS,
  SAVE_GAP_MS, NAME_MAX, PLAYER_HEADER, STALE_MS, STATE_PER_SEC, cleanColor, cleanLook, cleanText, readState,
  type CharacterLook, type Pos, type WirePlayer,
} from './protocol';

type Person = {
  id: string;
  sub: string;
  n: string;
  c: string;
  /** 겉모습(출입증의 프로필 값 또는 't:k'로 바꾼 값). 없으면 클라가 색으로 기본 인형을 그린다 */
  k?: CharacterLook;
  /** 마지막으로 겉모습을 바꾼 때(ms) */
  lastK?: number;
  pos?: Pos;
  b?: string;
  ba?: number;
  /** 마지막으로 무엇이든 받은 때(ms) */
  seen: number;
  /** 상태 속도 제한: 1초 창의 시작과 그 안에서 받은 수 */
  win: number;
  cnt: number;
  /** 마지막으로 말한 때(ms) */
  lastC: number;
  /** 붙임표를 마지막으로 쓴 때(ms) */
  sv?: number;
};

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export class Space extends DurableObject<Env> {
  private people = new Map<WebSocket, Person>();
  private lastSweep = 0;
  /** 다음 묶음에 실을 사람(이번 0.1초 동안 움직인 사람) */
  private dirty = new Set<WebSocket>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 깨어날 때마다 붙임표에서 사람 목록을 되살린다(생성자는 가볍게)
    for (const ws of ctx.getWebSockets()) {
      const p = ws.deserializeAttachment() as Person | null;
      if (p) this.people.set(ws, p);
    }
  }

  async fetch(req: Request): Promise<Response> {
    let who: { sub: string; name: string; color: string; look?: unknown };
    try {
      who = JSON.parse(decodeURIComponent(req.headers.get(PLAYER_HEADER) ?? ''));
    } catch {
      return new Response('bad request', { status: 400 });
    }
    const now = Date.now();
    this.sweep(now, true);
    // 같은 사람이 다시 들어오면(새로 고침, 다른 창) 앞 연결을 닫는다
    for (const [ws, p] of this.people) {
      if (p.sub === who.sub) this.drop(ws, CLOSE_REPLACED, 'replaced');
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    if (this.people.size >= MAX_PLAYERS) {
      // 붙잡지 않는 연결(잠들기 대상 아님)로 받아 알리고 바로 닫는다
      server.accept();
      server.send(JSON.stringify({ t: 'full' }));
      server.close(CLOSE_FULL, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const me: Person = {
      id: newId(),
      sub: who.sub,
      n: cleanText(who.name, NAME_MAX) || '손님',
      c: cleanColor(who.color),
      ...(who.look && typeof who.look === 'object' ? { k: cleanLook(who.look) } : {}),
      seen: now,
      win: now,
      cnt: 0,
      lastC: 0,
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    const others = [...this.people.values()].map((p) => this.wire(p, now));
    this.people.set(server, me);
    server.send(JSON.stringify({ t: 'hi', you: me.id, players: others }));
    this.broadcast({ t: 'j', p: this.wire(me, now) }, server);
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
    this.sweep(now, false);
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
      if (now - p.win >= 1000) {
        p.win = now;
        p.cnt = 0;
      }
      p.cnt += 1;
      const pos = p.cnt <= STATE_PER_SEC ? readState(msg) : null;
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
      if ((!p.lastK || now - p.lastK >= LOOK_GAP_MS) && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        p.lastK = now;
        p.k = cleanLook(raw);
        this.broadcast({ t: 'k', id: p.id, look: p.k });
        p.sv = now;
        return this.save(ws, p);
      }
    }
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
    this.broadcast({ t: 'l', id: p.id });
  }

  /** 서버가 먼저 닫는다: 목록에서 빼고 나감을 알린다 */
  private drop(ws: WebSocket, code: number, reason: 'replaced' | 'stale'): void {
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

  /** 오래 소식이 없는 연결(전화가 잠들며 닫기 프레임 없이 사라진 경우)을 정리한다. 10초에 한 번만 */
  private sweep(now: number, force: boolean): void {
    if (!force && now - this.lastSweep < 10_000) return;
    this.lastSweep = now;
    for (const [ws, p] of this.people) {
      if (now - p.seen > STALE_MS) this.drop(ws, CLOSE_STALE, 'stale');
    }
  }
}
