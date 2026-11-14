'use client';
import { useEffect, useState } from 'react';
import { SUB_RE } from '@/lib/social';
import { cleanLook, type CharacterLook } from '@/walk/look';

/** 대화·접속자·멘션에서 「나」. canChat은 서버가 내 sub를 적었을 때만(대화창에서 쓰기) */
export type SocialMe = { sub: string; name: string; look: CharacterLook; canChat: boolean; admin: boolean };

/** 못 받았을 때 다시 묻는 간격. 404(명단 밖, 대화를 쓰지 않는 곳)면 묻지 않는다 */
const RETRY = [5_000, 15_000, 60_000];

function readMe(raw: unknown): SocialMe | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (typeof o.sub !== 'string' || !SUB_RE.test(o.sub)) return null;
  return {
    sub: o.sub,
    name: typeof o.name === 'string' && o.name ? o.name.slice(0, 40) : '손님',
    look: cleanLook(o.look),
    canChat: o.canChat === true,
    admin: o.admin === true,
  };
}

/** enabled(명단 손님 이상)일 때 /api/chat/me를 한 번 받는다. 받기 전·못 받으면 null */
export function useSocialMe(enabled: boolean): SocialMe | null {
  const [me, setMe] = useState<SocialMe | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: number | undefined;
    let tries = 0;
    const ask = async () => {
      try {
        const r = await fetch('/api/chat/me', { cache: 'no-store', credentials: 'same-origin' });
        if (!alive) return;
        if (r.status === 404) return;
        if (r.ok) {
          const m = readMe(await r.json());
          if (alive && m) setMe(m);
          if (m) return;
        }
      } catch {
        // 잠깐 끊긴 것: 조금 뒤에 다시
      }
      if (!alive) return;
      timer = window.setTimeout(ask, RETRY[Math.min(tries++, RETRY.length - 1)]);
    };
    void ask();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [enabled]);
  return enabled ? me : null;
}
