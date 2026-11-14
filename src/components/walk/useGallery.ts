'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseGalleryItems, type GalleryItem } from '@/lib/gallery-manifest';
import { listFresh, refreshGate } from '@/walk/gallery-loads';

/** 다시 묻기까지(첫 번째, 두 번째 실패 뒤) */
const RETRY_MS = [4000, 15000] as const;

/**
 * 손님에게만 서버가 주는 부엌 사진 갤러리 전시 목록(액자 id → 전시물). enabled일 때 /api/gallery를 받는다.
 * null이면 아직 모른다(받는 중): 액자는 빈 매트로 둔다. 빈 표면 전시물이 없다: 모든 액자가 「곧 전시해요」.
 * 「없다」는 답(404)은 빈 표로, 잠깐의 실패(끊김·503)는 두 번까지 다시 묻고 그래도 안 되면 빈 표로 둔다.
 * 방에 다녀와 다시 켜지면 받아 둔 목록이 아직 새것이면(gallery-loads freshMs) 다시 받지 않는다: 서명 주소가 같아야 브라우저가
 * 들고 있는 그림을 그대로 쓴다.
 * refresh는 그림을 받지 못했을 때(서명 주소가 끝났을 수 있다) 목록을 다시 받는다. 3D와 크게 보기가 함께 부르므로 가장 짧은 간격과
 * 화면을 연 동안의 횟수 상한 안에서만 받는다(그림 하나가 늘 깨져 있어도 다시 받기가 끝없이 돌지 않게)
 */
export function useGallery(enabled: boolean): { items: ReadonlyMap<string, GalleryItem> | null; refresh: () => void } {
  const [items, setItems] = useState<ReadonlyMap<string, GalleryItem> | null>(null);
  const [round, setRound] = useState(0);
  const [gate] = useState(() => refreshGate());
  /** 마지막으로 목록을 받은 때와 그 차례 */
  const got = useRef<{ at: number; round: number } | null>(null);
  useEffect(() => {
    if (!enabled || listFresh(got.current, round, performance.now())) return;
    let alive = true;
    let timer: number | undefined;
    const done = (list: ReadonlyMap<string, GalleryItem>) => {
      setItems(list);
      got.current = { at: performance.now(), round };
    };
    const load = (attempt: number) => {
      fetch('/api/gallery', { cache: 'no-store', credentials: 'same-origin' })
        .then(async (r) => {
          if (!alive) return;
          if (r.ok) {
            const list = parseGalleryItems(await r.json());
            if (alive) done(list);
            return;
          }
          if (r.status === 404) {
            done(new Map());
            return;
          }
          throw new Error(`gallery ${r.status}`);
        })
        .catch(() => {
          if (!alive) return;
          if (attempt < RETRY_MS.length) timer = window.setTimeout(() => load(attempt + 1), RETRY_MS[attempt]);
          else setItems((cur) => cur ?? new Map());
        });
    };
    load(0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [enabled, round]);
  const refresh = useCallback(() => {
    if (gate.take(performance.now())) setRound((n) => n + 1);
  }, [gate]);
  return { items: enabled ? items : null, refresh };
}
