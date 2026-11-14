'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { currentLang } from '@/components/i18n/useLang';
import { detectInApp } from '@/lib/inapp';
import { uploadShot } from '@/lib/shots';
import type { WalkController } from '@/walk/scene';
import { shotFileName } from './controls';
import { isStill } from './prefs';
import { isIOS, saveShot, type SaveEnv } from './saveShot';

/** 찍은 뒤 뜨는 알림. tap(한 번 더 눌러 저장)과 hold(길게 눌러 저장)는 닫을 때까지 남는다 */
export type ShotNote = {
  kind: 'saving' | 'saved' | 'downloaded' | 'full' | 'failed' | 'error' | 'tap' | 'hold';
  at: number;
  /** 갤러리에 올리지 못해 이 기기로 돌린 사진인가 */
  miss?: boolean;
  /** hold: 길게 눌러 저장할 사진 */
  url?: string;
};

/** 이 기기에 바로 내려받는다(로그인하지 않았거나 올리지 못했을 때). 파일 이름은 화면 말을 따른다(조연당-… / Joyeondang-…) */
export function saveBlob(blob: Blob, name = shotFileName(new Date(), undefined, currentLang())) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const deviceEnv = (again: boolean): SaveEnv => {
  const ua = navigator.userAgent;
  const inApp = Boolean(detectInApp(ua));
  return {
    sheet: inApp || isIOS(ua, navigator.maxTouchPoints),
    inApp,
    again,
    canShare: typeof navigator.canShare === 'function' ? (d) => navigator.canShare(d) : undefined,
    share: typeof navigator.share === 'function' ? (d) => navigator.share(d) : undefined,
    download: saveBlob,
  };
};

/** 길게 눌러 저장할 그림 주소. 앱이 주소를 따로 받아 저장하는 웹뷰도 읽을 수 있게 blob: 대신 data:로 만든다 */
const holdUrl = (blob: Blob) =>
  new Promise<string>((done) => {
    const r = new FileReader();
    r.onload = () => done(typeof r.result === 'string' ? r.result : URL.createObjectURL(blob));
    r.onerror = () => done(URL.createObjectURL(blob));
    r.readAsDataURL(blob);
  });

// 사진 찍기(F2, 메뉴, 휴대폰 카메라 단추): 지금 화면을 3D만 한 장 그려 받는다.
// 로그인했으면 내 갤러리에 올리고, 아니면 이 기기에 남긴다(saveShot이 길을 고른다). 찰칵 효과는 줄인 움직임이면 없다.
export function useShot(ctrl: RefObject<WalkController | null>, signedIn: boolean, place: () => string) {
  const [note, setNote] = useState<ShotNote | null>(null);
  const [flash, setFlash] = useState(0);
  const busy = useRef(false);
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  });

  /** 「사진 저장」을 한 번 더 눌러야 하는 사진 */
  const pending = useRef<{ blob: Blob; miss: boolean } | null>(null);

  const show = (kind: ShotNote['kind'], more?: Pick<ShotNote, 'miss' | 'url'>) => setNote({ kind, at: Date.now(), ...more });

  // 이 기기에 남기기. 저장됐는지 알 수 없는 길에서는 됐다고 말하지 않는다
  const keep = useCallback(async (blob: Blob, miss: boolean, again = false) => {
    const way = await saveShot(blob, shotFileName(new Date(), undefined, currentLang()), deviceEnv(again));
    pending.current = way === 'tap' ? { blob, miss } : null;
    if (way === 'tap') show('tap', { miss });
    else if (way === 'hold') show('hold', { miss, url: await holdUrl(blob) });
    else if (way === 'download') show('downloaded', { miss });
    else if (miss) show('error');
    else setNote(null); // 공유 시트는 스스로 결과를 보여 준다
  }, []);

  /** 「사진 저장」 단추: 누른 그 자리에서 공유 시트를 다시 부른다 */
  const saving = useRef(false);
  const saveAgain = useCallback(() => {
    const p = pending.current;
    // 잇달아 두 번 누르면 둘째 공유 요청이 「이미 공유 중」으로 실패해 내려받기까지 일어난다: 앞의 것이 끝날 때까지 기다린다
    if (!p || saving.current) return;
    saving.current = true;
    void keep(p.blob, p.miss, true).finally(() => {
      saving.current = false;
    });
  }, [keep]);

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
        await keep(blob, false);
        return;
      }
      show('saving');
      const r = await uploadShot(blob, placeRef.current()).catch(() => ({ ok: false as const, reason: 'error' as const }));
      if (r.ok) show('saved');
      else if (r.reason === 'full') show('full');
      else {
        // 올리지 못했으면 사진을 잃지 않게 이 기기에 남긴다(공유 시트가 떠 있는 동안 「담는 중」이 남지 않게 먼저 지운다)
        setNote(null);
        await keep(blob, r.reason !== 'auth');
      }
    } finally {
      busy.current = false;
    }
  }, [ctrl, signedIn, keep]);

  // 알림은 잠깐 떠 있다가 사라진다(올리는 중은 끝날 때까지, 손님이 할 일이 남은 알림은 닫을 때까지)
  useEffect(() => {
    if (!note || note.kind === 'saving' || note.kind === 'tap' || note.kind === 'hold') return;
    const t = window.setTimeout(() => setNote(null), note.kind === 'full' ? 7000 : 4000);
    return () => window.clearTimeout(t);
  }, [note]);
  // data:로 못 만들어 blob: 주소를 썼으면 알림이 바뀔 때 놓아 준다
  useEffect(() => {
    const u = note?.url;
    if (!u?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(u);
  }, [note]);

  const clearNote = useCallback(() => {
    pending.current = null;
    setNote(null);
  }, []);

  return { take, note, flash, clearNote, saveAgain };
}
