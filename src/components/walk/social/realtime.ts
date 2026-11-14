'use client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// Supabase Realtime 비공개 채널 잇기·끊기. 권한은 realtime.messages 정책(0017)이 들어올 때 판정한다.
// supabase-js는 이름이 같은 채널이 아직 목록에 있으면 새로 만들지 않고 옛 채널을 돌려준다. 그래서 같은 이름을 닫고
// 다시 여는 일(접속자 목록을 열어 presence 받기를 켤 때 등)이 겹치지 않게, 잇기와 끊기를 모두 한 줄로 세운다.
let queue: Promise<unknown> = Promise.resolve();
function inTurn(fn: () => Promise<void>): void {
  queue = queue.then(fn, fn).catch(() => {});
}

export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * 비공개 채널에 들어간다. bind에서 듣기를 걸고, onStatus로 상태를 받는다(다시 이어질 때마다 SUBSCRIBED가 다시 온다).
 * presence를 주면 그 키로 알릴 수 있고, enabled일 때만 남의 presence를 받는다. 돌려준 함수를 부르면 나온다.
 */
export function joinPrivate(
  topic: string,
  opt: { presence?: { key: string; enabled: boolean } },
  bind: (ch: RealtimeChannel) => void,
  onStatus: (status: ChannelStatus, ch: RealtimeChannel) => void,
): () => void {
  let alive = true;
  let ch: RealtimeChannel | null = null;
  const sb = createClient();
  inTurn(async () => {
    if (!alive) return;
    // 지금 로그인 토큰을 Realtime에 건다(비공개 채널의 정책이 이 토큰으로 판정한다)
    try {
      await sb.realtime.setAuth();
    } catch {
      // 토큰을 못 걸어도 들어가 본다(거절되면 CHANNEL_ERROR)
    }
    if (!alive) return;
    const c = sb.channel(topic, { config: { private: true, ...(opt.presence ? { presence: opt.presence } : {}) } });
    ch = c;
    bind(c);
    c.subscribe((status) => {
      if (alive) onStatus(status as ChannelStatus, c);
    });
  });
  return () => {
    alive = false;
    inTurn(async () => {
      if (ch) await sb.removeChannel(ch);
      ch = null;
    });
  };
}

/** 실시간 채널로 온 것의 내용(DB의 realtime.send가 보낸 payload). 한 겹 더 싸여 와도 꺼낸다 */
export function payloadOf(msg: unknown): unknown {
  const p = msg && typeof msg === 'object' ? (msg as { payload?: unknown }).payload : undefined;
  if (p && typeof p === 'object' && !('id' in p) && 'payload' in p) return (p as { payload?: unknown }).payload;
  return p;
}
