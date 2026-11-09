'use client';
import { useEffect, useRef } from 'react';
import { isEditingTarget, shouldHandleShortcut } from '@/lib/keys';
import { walkKeyAction } from './controls';
import * as P from './prefs';

/** 키를 받을 때마다 읽는 지금 상태 */
export type KeyLive = { game: boolean; ready: boolean; panel: boolean; anyOpen: boolean; canTalk: boolean; coarse: boolean };
export type KeyActs = {
  dismissOnboard: () => void;
  closeAll: () => void;
  menu: () => void;
  help: () => void;
  map: () => void;
  way: () => void;
  portal: () => void;
  look: () => void;
  shot: () => void;
  talk: () => void;
  /** Enter 말하기를 막을 가까운 곳이 있는지 */
  hasNear: () => boolean;
};

/** 포인터 잠금이 풀린 지 이만큼 안의 Esc는 잠금 풀기 몫으로 본다(브라우저마다 그 Esc를 넘겨주기도 한다) */
const UNLOCK_GRACE_MS = 300;

// 걷기 화면의 데스크탑 단축키. 한글 조합 중이거나 입력칸 안이면 받지 않는다(Esc는 입력칸에서도 닫기).
// 걷기·점프·V·E는 엔진이 직접 받는다. 놀이 덮개가 열려 있으면 그쪽이 키를 맡는다.
export function useWalkKeys(live: () => KeyLive, acts: KeyActs, unlockedAt: () => number) {
  const ref = useRef({ live, acts, unlockedAt });
  useEffect(() => {
    ref.current = { live, acts, unlockedAt };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const { live: getLive, acts: A, unlockedAt: unlocked } = ref.current;
      const L = getLive();
      if (L.game) return;
      const mod = e.metaKey || e.ctrlKey || e.altKey;
      // 걷기 엔진이 걷기 키의 기본 동작을 먼저 막으므로(defaultPrevented) shouldHandleShortcut 대신 입력칸만 거른다
      if (!mod && P.MOVE_KEYS.has(e.key.toLowerCase()) && !isEditingTarget(e.target)) A.dismissOnboard();
      const enter = e.key === 'Enter';
      const { act, prevent } = walkKeyAction(e, {
        ...L,
        editing: !shouldHandleShortcut(e),
        locked: Boolean(document.pointerLockElement) || performance.now() - unlocked() < UNLOCK_GRACE_MS,
        onControl: enter && P.onControl(e),
        near: enter && A.hasNear(),
      });
      if (prevent) e.preventDefault();
      if (act) A[act]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
