'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHAT_REASON_TEXT, byTime, chatReason, mergeMessages, readChatMessage, type ChatMessage, type ChatReason, type ChatVia,
} from '@/lib/social';
import { joinPrivate, payloadOf } from './realtime';
import type { SocialMe } from './useSocialMe';

export type SendResult = { ok: true; message: ChatMessage | null } | { ok: false; reason: ChatReason; text: string };
export type FeedState = 'idle' | 'loading' | 'ready' | 'error';

/** 열린 대화창이 놓친 새 글을 다시 묻는 간격: 실시간이 붙어 있으면 드물게(몰릴 때 DB가 퍼뜨리기를 거른 글만 채운다) */
const POLL_LIVE_MS = 8_000;
const POLL_OFF_MS = 6_000;
/** 묻는 간격을 사람마다 조금씩 흩뜨린다(청중이 한꺼번에 열어도 같은 순간에 몰리지 않게) */
const POLL_JITTER = 0.25;
/** 몇 번에 한 번은 가장 새 쪽을 통째로 다시 받아, 실시간이 끊긴 사이 지워진 글도 뺀다 */
const REFRESH_EVERY = 6;
/** 커밋 차례가 뒤바뀐 글도 잡도록 커서보다 이만큼 앞부터 다시 묻는다(같은 글은 합친다) */
const OVERLAP_MS = 5_000;
const PAGE = 50;

async function getPage(qs: string, me: string | null): Promise<{ list: ChatMessage[]; more: boolean }> {
  const r = await fetch(`/api/chat?${qs}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  const j = (await r.json()) as { messages?: unknown; more?: unknown };
  const list = (Array.isArray(j.messages) ? j.messages : []).map((m) => readChatMessage(m, me)).filter((m) => m !== null);
  return { list, more: j.more === true };
}

/**
 * 대화 전체 이력. open일 때 처음이면 가장 새 글 한 쪽을 받고, 연 동안 walk:chat(새 글·지운 글)을 듣고,
 * 놓친 글은 마지막 글 뒤를 다시 물어 채운다. 닫으면 채널에서 나온다(가진 글은 두어 다시 열면 바로 보인다).
 */
export function useChatFeed(o: { me: SocialMe | null; open: boolean }) {
  const { me, open } = o;
  const sub = me?.sub ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<FeedState>('idle');
  const [more, setMore] = useState(true);
  const [live, setLive] = useState(false);
  const list = useRef<ChatMessage[]>([]);
  const loaded = useRef(false);
  const catching = useRef(false);
  /**
   * 따라잡기 기준(서버가 준 가장 새 글). 서버 응답(첫 쪽·따라잡기·다시 받기)으로만 옮긴다:
   * 실시간·내 글·멘션 카드로 먼저 들어온 글을 기준으로 삼으면 그 앞에 쓰인 남의 글을 영영 놓친다
   */
  const cursor = useRef<ChatMessage | null>(null);
  const advance = useCallback((got: readonly ChatMessage[]) => {
    for (const m of got) if (!cursor.current || byTime(m, cursor.current) > 0) cursor.current = m;
  }, []);

  const add = useCallback((ms: ChatMessage[]) => {
    if (ms.length === 0) return;
    list.current = mergeMessages(list.current, ms);
    setMessages(list.current);
  }, []);
  const drop = useCallback((id: string) => {
    if (!list.current.some((m) => m.id === id)) return;
    list.current = list.current.filter((m) => m.id !== id);
    setMessages(list.current);
  }, []);

  /** 따라잡기 기준 뒤의 새 글(오래된 것부터, 세 쪽까지). 첫 쪽은 기준보다 조금 앞부터 겹쳐 묻는다 */
  const catchUp = useCallback(async () => {
    if (catching.current || !loaded.current) return;
    catching.current = true;
    try {
      for (let i = 0; i < 3; i++) {
        const c = cursor.current;
        const qs = !c
          ? `limit=${PAGE}`
          : i === 0
            ? `after=${encodeURIComponent(new Date(c.ms - OVERLAP_MS).toISOString())}&limit=100`
            : `after=${encodeURIComponent(c.at)}&aid=${c.id}&limit=100`;
        const { list: got, more: again } = await getPage(qs, sub);
        add(got);
        advance(got);
        if (!c || !again) break;
      }
    } catch {
      // 다음에 다시
    } finally {
      catching.current = false;
    }
  }, [sub, add, advance]);

  /**
   * 가장 새 쪽을 다시 받는다(닫았다 다시 열 때, 그리고 가끔). 그 쪽이 덮는 때 안에서 응답에 없는 글은 그사이 지워진 것이라 뺀다.
   * 닫힌 사이 한 쪽보다 많이 쌓였으면 가운데가 비지 않게 가장 새 쪽부터 다시 시작한다(위로 올리면 앞의 글을 받는다)
   */
  const refresh = useCallback(async () => {
    if (catching.current || !loaded.current) return;
    catching.current = true;
    try {
      const { list: got, more: older } = await getPage(`limit=${PAGE}`, sub);
      const ids = new Set(got.map((m) => m.id));
      const floor = got.length ? got.reduce((a, m) => (byTime(m, a) < 0 ? m : a)) : null;
      const prev = cursor.current;
      if (older && floor && prev && byTime(prev, floor) < 0) {
        list.current = [];
        setMore(true);
      } else {
        list.current = list.current.filter((m) => ids.has(m.id) || (older && floor !== null && byTime(m, floor) < 0));
      }
      list.current = mergeMessages(list.current, got);
      setMessages(list.current);
      advance(got);
    } catch {
      // 다음에 다시
    } finally {
      catching.current = false;
    }
  }, [sub, advance]);

  useEffect(() => {
    if (!open || !sub) return;
    let alive = true;
    let isLive = false;
    if (!loaded.current) {
      queueMicrotask(() => alive && setState('loading'));
      void getPage(`limit=${PAGE}`, sub).then(
        ({ list: got, more: older }) => {
          if (!alive) return;
          loaded.current = true;
          add(got);
          advance(got);
          setMore(older);
          setState('ready');
        },
        () => alive && setState('error'),
      );
    } else {
      // 닫혀 있던 사이의 새 글과 지운 글을 함께 맞춘다
      void refresh();
    }
    const leave = joinPrivate(
      'walk:chat',
      {},
      (ch) => {
        ch.on('broadcast', { event: 'new' }, (msg) => {
          const m = readChatMessage(payloadOf(msg), sub);
          if (m) add([m]);
        });
        ch.on('broadcast', { event: 'gone' }, (msg) => {
          const id = (payloadOf(msg) as { id?: unknown } | undefined)?.id;
          if (typeof id === 'string') drop(id);
        });
      },
      (status) => {
        isLive = status === 'SUBSCRIBED';
        setLive(isLive);
        // 다시 붙었으면 끊긴 사이의 글을 채운다
        if (isLive) void catchUp();
      },
    );
    let timer: number | undefined;
    let ticks = 0;
    const wait = (ms: number) => ms * (1 - POLL_JITTER + Math.random() * POLL_JITTER * 2);
    const tick = () => {
      if (document.visibilityState === 'visible') void (++ticks % REFRESH_EVERY === 0 ? refresh() : catchUp());
      timer = window.setTimeout(tick, wait(isLive ? POLL_LIVE_MS : POLL_OFF_MS));
    };
    timer = window.setTimeout(tick, wait(POLL_OFF_MS));
    const onVis = () => {
      if (document.visibilityState === 'visible') void catchUp();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      leave();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      setLive(false);
    };
  }, [open, sub, add, drop, catchUp, refresh, advance]);

  /** 위로 올리면: 가진 가장 옛 글보다 앞의 한 쪽 */
  const loadOlder = useCallback(async () => {
    const first = list.current[0];
    if (!first || !sub) return;
    try {
      const { list: got, more: older } = await getPage(`before=${encodeURIComponent(first.at)}&bid=${first.id}&limit=${PAGE}`, sub);
      add(got);
      setMore(older);
    } catch {
      // 다시 올리면 또 묻는다
    }
  }, [sub, add]);

  const send = useCallback(async (body: string, mentions: string[], space: string | null, via: ChatVia): Promise<SendResult> => {
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, mentions, space, via }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: unknown; reason?: unknown; message?: unknown };
      if (r.ok && j.ok === true) {
        const m = readChatMessage(j.message, sub);
        if (m) add([m]);
        return { ok: true, message: m };
      }
      const reason = chatReason(j.reason);
      return { ok: false, reason, text: typeof j.message === 'string' ? j.message : CHAT_REASON_TEXT[reason] };
    } catch {
      return { ok: false, reason: 'error', text: CHAT_REASON_TEXT.error };
    }
  }, [sub, add]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      if (r.status === 204 || r.status === 404) drop(id);
      return r.status === 204;
    } catch {
      return false;
    }
  }, [drop]);

  /** 다른 길로 받은 글 하나를 넣는다(멘션 카드를 눌러 대화창을 열 때: 아직 못 받은 글이어도 바로 보이게) */
  const put = useCallback((m: ChatMessage) => add([m]), [add]);

  return { messages, state, more, live, loadOlder, send, remove, put };
}

export type ChatFeed = ReturnType<typeof useChatFeed>;
