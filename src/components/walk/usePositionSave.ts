'use client';
import { useEffect, type RefObject } from 'react';
import type { WalkController } from '@/walk/scene';
import type { HouseWorld } from '@/walk/types';
import { writePos, writeRoom } from './memory';

const EVERY_MS = 2000;

/** 지금 집 안 자리를 이 기기에 적는다(집 세계일 때만). 방에 들어가기 직전에도 부른다 */
export function saveHousePos(c: WalkController | null, kind: HouseWorld['kind']) {
  if (!c || kind === 'room') return;
  try {
    const s = c.getState();
    writePos(localStorage, kind, { x: s.x, z: s.z, y: s.y, level: s.level, yaw: s.yaw, view: s.view });
  } catch {
    // 저장이 안 돼도 걷기는 계속된다
  }
}

/**
 * 자리 기억: 집 세계면 2초마다·페이지를 떠날 때·탭이 숨을 때 자리를 적고,
 * 방 장면이면 그 방 slug를 적어 새로 고쳐도 그 방으로 돌아오게 한다(12시간).
 */
export function usePositionSave(ctrl: RefObject<WalkController | null>, kind: HouseWorld['kind'] | null, slug: string | null) {
  useEffect(() => {
    if (!kind) return;
    const save = () => {
      if (kind === 'room') {
        try { if (slug) writeRoom(localStorage, slug); } catch { /* 괜찮다 */ }
      } else saveHousePos(ctrl.current, kind);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    const t = window.setInterval(save, EVERY_MS);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [ctrl, kind, slug]);
}
