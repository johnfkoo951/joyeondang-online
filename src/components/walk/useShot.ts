'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { uploadShot } from '@/lib/shots';
import type { WalkController } from '@/walk/scene';
import { shotFileName } from './controls';
import { isStill } from './prefs';

/** 찍은 뒤 잠깐 뜨는 알림 */
export type ShotNote = { kind: 'saving' | 'saved' | 'downloaded' | 'full' | 'failed' | 'error'; at: number };

/** 이 기기에 바로 내려받는다(로그인하지 않았거나 올리지 못했을 때) */
export function saveBlob(blob: Blob, name = shotFileName(new Date())) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// 사진 찍기(F2, 메뉴, 휴대폰 카메라 단추): 지금 화면을 3D만 한 장 그려 받는다.
// 로그인했으면 내 갤러리에 올리고, 아니면 바로 기기에 내려받는다. 찰칵 효과는 줄인 움직임이면 없다.
export function useShot(ctrl: RefObject<WalkController | null>, signedIn: boolean, place: () => string) {
  const [note, setNote] = useState<ShotNote | null>(null);
  const [flash, setFlash] = useState(0);
  const busy = useRef(false);
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  });

  const show = (kind: ShotNote['kind']) => setNote({ kind, at: Date.now() });

  const take = useCallback(async () => {
    const c = ctrl.current;
    if (!c || busy.current) return;
    busy.current = true;
    try {
      let blob: Blob;
      try {
        blob = await c.capture();
      } catch {
        show('failed');
        return;
      }
      if (!isStill()) setFlash((n) => n + 1);
      if (!signedIn) {
        saveBlob(blob);
        show('downloaded');
        return;
      }
      show('saving');
      const r = await uploadShot(blob, placeRef.current()).catch(() => ({ ok: false as const, reason: 'error' as const }));
      if (r.ok) show('saved');
      else if (r.reason === 'full') show('full');
      else {
        // 올리지 못했으면 사진을 잃지 않게 기기에 내려받는다
        saveBlob(blob);
        show(r.reason === 'auth' ? 'downloaded' : 'error');
      }
    } finally {
      busy.current = false;
    }
  }, [ctrl, signedIn]);

  // 알림은 잠깐 떠 있다가 사라진다(올리는 중은 끝날 때까지)
  useEffect(() => {
    if (!note || note.kind === 'saving') return;
    const t = window.setTimeout(() => setNote(null), note.kind === 'full' ? 7000 : 4000);
    return () => window.clearTimeout(t);
  }, [note]);

  return { take, note, flash, clearNote: () => setNote(null) };
}
