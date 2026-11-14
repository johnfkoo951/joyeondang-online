'use client';
import { useEffect, useRef } from 'react';
import { readChatMessage, type ChatMessage } from '@/lib/social';
import { joinPrivate, payloadOf } from './realtime';
import type { SocialMe } from './useSocialMe';

/**
 * 나를 멘션한 글을 받는다(walk:me:<내 sub>, 나만 듣는 채널). 대화창이 닫혀 있어도 온다.
 * 서버가 내 sub를 적었을 때(canChat)만 들어간다: 적히지 않은 사람은 정책이 거절해 다시 잇기만 되풀이한다.
 */
export function useMentions(me: SocialMe | null, onMention: (m: ChatMessage) => void): void {
  const cb = useRef(onMention);
  useEffect(() => {
    cb.current = onMention;
  });
  const sub = me?.canChat ? me.sub : null;
  useEffect(() => {
    if (!sub) return;
    return joinPrivate(
      `walk:me:${sub}`,
      {},
      (ch) => {
        ch.on('broadcast', { event: 'mention' }, (msg) => {
          const m = readChatMessage(payloadOf(msg), sub);
          if (m && !m.mine) cb.current(m);
        });
      },
      () => {},
    );
  }, [sub]);
}
