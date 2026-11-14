'use client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { SUB_RE, cleanSpace } from '@/lib/social';
import { cleanLook, type CharacterLook } from '@/walk/look';
import { joinPrivate } from './realtime';
import type { SocialMe } from './useSocialMe';

/** 접속한 사람 한 명(presence 값 {sub, name, look, space, since}). 손님 화면이 스스로 알린 값이라 표시에만 쓴다 */
export type OnlinePerson = { sub: string; name: string; look: CharacterLook | null; space: string | null; since: number };

const TOPIC = 'walk:online';
/** presence 알리기 사이 간격(한 사람 30초에 다섯 번이 무료 요금제 한도) */
const TRACK_GAP = 7_000;

/** presence 상태 → 사람 목록(키마다 가장 늦게 들어온 것 하나, 나는 뺀다) */
export function readPresence(state: Record<string, unknown>, me: string | null): OnlinePerson[] {
  const out: OnlinePerson[] = [];
  for (const [key, metas] of Object.entries(state)) {
    if (key === me || !SUB_RE.test(key) || !Array.isArray(metas)) continue;
    let best: OnlinePerson | null = null;
    for (const raw of metas) {
      const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      if (m.sub !== key) continue;
      const since = typeof m.since === 'number' && Number.isFinite(m.since) ? m.since : 0;
      if (best && best.since >= since) continue;
      best = {
        sub: key,
        name: typeof m.name === 'string' && m.name.trim() ? Array.from(m.name.trim()).slice(0, 16).join('') : '손님',
        look: m.look && typeof m.look === 'object' ? cleanLook(m.look) : null,
        space: cleanSpace(m.space),
        since,
      };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/**
 * 접속자(walk:online presence). start 뒤로 늘 「나 여기 있어요」를 알리고(공간·겉모습이 바뀌면 다시),
 * receive일 때만 다른 사람들의 목록을 받는다(접속자 목록·대화창이 열려 있을 때). 무료 요금제의 Realtime은 받는 사람마다
 * 메시지를 세므로, 모두가 늘 받으면 청중이 한꺼번에 들어올 때 한도를 넘는다.
 */
export function useOnline(o: { me: SocialMe | null; space: string | null; look: CharacterLook; receive: boolean; start: boolean }) {
  const { me, receive, start } = o;
  const [people, setPeople] = useState<OnlinePerson[]>([]);
  const [synced, setSynced] = useState(false);
  const info = useRef({ space: o.space, look: o.look });
  const since = useRef(0);
  const retrack = useRef<(() => void) | null>(null);
  // 서버가 내 sub를 적은 사람(대화를 쓸 수 있는 사람)만 접속자 채널에 들어간다.
  // 0017 전이거나 거절되는 동안 모든 화면이 비공개 채널 입장을 끝없이 다시 시도하지 않게
  const sub = me?.canChat ? me.sub : null;
  const name = me?.name ?? '';

  useEffect(() => {
    if (info.current.space === o.space && info.current.look === o.look) return;
    info.current = { space: o.space, look: o.look };
    retrack.current?.();
  }, [o.space, o.look]);

  useEffect(() => {
    if (!sub || !start) return;
    if (!since.current) since.current = Date.now();
    let joined = false;
    let lastTrack = 0;
    let timer: number | undefined;
    let channel: RealtimeChannel | null = null;
    const track = () => {
      window.clearTimeout(timer);
      if (!joined || !channel) return;
      const wait = lastTrack + TRACK_GAP - Date.now();
      if (wait > 0) {
        timer = window.setTimeout(track, wait);
        return;
      }
      lastTrack = Date.now();
      void channel.track({ sub, name, look: info.current.look, space: info.current.space, since: since.current });
    };
    retrack.current = track;
    const leave = joinPrivate(
      TOPIC,
      { presence: { key: sub, enabled: receive } },
      (ch) => {
        channel = ch;
        if (!receive) return;
        ch.on('presence', { event: 'sync' }, () => {
          setPeople(readPresence(ch.presenceState() as Record<string, unknown>, sub));
          setSynced(true);
        });
      },
      (status) => {
        joined = status === 'SUBSCRIBED';
        // 다시 이어질 때마다 다시 알린다(끊긴 사이 presence가 비었다)
        if (joined) {
          lastTrack = 0;
          track();
        }
      },
    );
    return () => {
      leave();
      retrack.current = null;
      window.clearTimeout(timer);
      setSynced(false);
    };
  }, [sub, name, receive, start]);

  return { people: receive && synced ? people : [], synced: receive && synced };
}
