'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { canFullscreen, enterFullscreen, exitFullscreen, isExitEsc, isFullscreen, onFullscreenChange, type FsDoc } from './fullscreen';

const fsDoc = () => document as unknown as FsDoc;
const noSub = () => () => {};
const subscribe = (cb: () => void) => onFullscreenChange(fsDoc(), cb);
const readFull = () => isFullscreen(fsDoc());
const readCan = () => canFullscreen(fsDoc());
/** 이 탭에서 전체 화면을 열려다 거절당했다: 방을 드나들어 화면을 다시 그려도 단추를 다시 보이지 않는다 */
let refusedOnce = false;
/** 여는 중(브라우저의 답이 아직 오지 않음): 그동안 또 누른 것은 무시한다(겹친 요청이 거절되어 단추가 사라지지 않게) */
let pending = false;
/** 마지막으로 전체 화면이 끝난 때(performance.now 기준) */
let leftAt = -Infinity;
/** 거절 알림을 보여 두는 시간 */
const NOTE_MS = 4000;

/** 이 Esc가 전체 화면을 끝내는 몫인가(걷기 단축키가 Esc마다 묻는다. 그 Esc로 패널을 닫거나 메뉴를 열지 않게) */
export function fullscreenEsc(): boolean {
  return isExitEsc(fsDoc(), leftAt, performance.now());
}

/**
 * 걷기 화면의 전체 화면(문서 전체). supported가 false면(아이폰 사파리, 막힌 앱 안 브라우저, 한 번 거절됨) 단추를 거두고 F도 아무 일을 하지 않는다.
 * full은 Esc나 휴대폰 뒤로 가기로 빠져나와도 바뀐다(브라우저 알림을 듣는다).
 * toggle은 단추·키 처리 안에서 바로 부른다(브라우저가 사용자 동작 안에서만 연다).
 * 걷기 화면을 떠나면 전체 화면도 끝낸다: 다른 화면에는 끝내는 단추가 없다.
 */
export function useFullscreen() {
  const can = useSyncExternalStore(noSub, readCan, () => false);
  const full = useSyncExternalStore(subscribe, readFull, () => false);
  const [refused, setRefused] = useState(refusedOnce);
  /** 거절됐다는 짧은 알림 */
  const [note, setNote] = useState(false);
  const toggle = useCallback(() => {
    const d = fsDoc();
    if (isFullscreen(d)) {
      exitFullscreen(d);
      return;
    }
    if (pending || refusedOnce || !canFullscreen(d)) return;
    pending = true;
    void enterFullscreen(d).then((ok) => {
      pending = false;
      if (ok || isFullscreen(d)) return;
      refusedOnce = true;
      setRefused(true);
      setNote(true);
    });
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(false), NOTE_MS);
    return () => window.clearTimeout(t);
  }, [note]);
  // 끝난 때를 적어 둔다: 브라우저가 끝내기에 쓴 Esc를 그 뒤에 페이지로도 넘겨주면 걷기 단축키가 받지 않게
  useEffect(() => onFullscreenChange(fsDoc(), () => {
    if (!isFullscreen(fsDoc())) leftAt = performance.now();
  }), []);
  useEffect(() => () => exitFullscreen(fsDoc()), []);
  return { supported: can && !refused, full, toggle, note };
}
