'use client';
import { useSyncExternalStore } from 'react';
import { PWA_EVENT, installMode, isIOS, type InstallMode } from '@/lib/pwa';

// 홈 화면 앱 상태(화면 쪽). 설치 창 이벤트는 layout BOOT(PWA_BOOT)가 그리기 전에 받아 window에 둔다.
// 서버와 첫 그림은 「모름」(none·false)으로 맞추고, 바로 뒤에 실제 값으로 다시 그린다(useSyncExternalStore의 서버 값).

export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

declare global {
  interface Window {
    __jyBip?: InstallPromptEvent | null;
    __jyInstalled?: number;
    __jyPwaHooked?: number;
  }
}

/** 안내 창을 열라는 window 이벤트 */
export const GUIDE_EVENT = 'jy-install-guide';

const emit = () => window.dispatchEvent(new Event(PWA_EVENT));

// BOOT가 없는 화면(시험용 등)에서도 설치 창을 놓치지 않게, 이 모듈이 처음 실릴 때 한 번 붙인다
if (typeof window !== 'undefined' && !window.__jyPwaHooked) {
  window.__jyPwaHooked = 1;
  window.addEventListener('beforeinstallprompt', (e) => {
    window.__jyBip = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    window.__jyBip = null;
    window.__jyInstalled = 1;
    emit();
  });
}

const matches = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
const touchMac = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;

/** 홈 화면 앱으로 열려 있나. 브라우저 전체 화면(F 키)도 display-mode: fullscreen이 되므로 그때는 빼고 본다 */
function standaloneNow(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matches('(display-mode: standalone)') || (matches('(display-mode: fullscreen)') && !document.fullscreenElement);
}

function modeNow(): InstallMode {
  return installMode({
    ua: navigator.userAgent,
    standalone: standaloneNow(),
    canPrompt: Boolean(window.__jyBip),
    touchMac: touchMac(),
    justInstalled: window.__jyInstalled === 1,
  });
}

function subscribe(cb: () => void) {
  window.addEventListener(PWA_EVENT, cb);
  document.addEventListener('fullscreenchange', cb);
  const lists = ['(display-mode: standalone)', '(display-mode: fullscreen)']
    .map((q) => (typeof window.matchMedia === 'function' ? window.matchMedia(q) : null))
    .filter((m): m is MediaQueryList => Boolean(m));
  lists.forEach((m) => m.addEventListener?.('change', cb));
  return () => {
    window.removeEventListener(PWA_EVENT, cb);
    document.removeEventListener('fullscreenchange', cb);
    lists.forEach((m) => m.removeEventListener?.('change', cb));
  };
}

/** 지금 안내 방식(installMode) */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, modeNow, () => 'none');
}

/** 홈 화면 앱으로 열려 있나 */
export function useStandalone(): boolean {
  return useSyncExternalStore(subscribe, standaloneNow, () => false);
}

/** 아이폰·아이패드 홈 화면 앱인가(로그인을 코드로 이어 받아야 하는 곳) */
export function useIOSStandalone(): boolean {
  return useSyncExternalStore(subscribe, () => standaloneNow() && isIOS(navigator.userAgent, touchMac()), () => false);
}

/** 브라우저 설치 창을 띄운다(한 번 쓰면 다시 쓸 수 없다). 창이 없으면 unavailable */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = window.__jyBip;
  if (!e) return 'unavailable';
  window.__jyBip = null;
  emit();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}

/** 안내 창을 연다(InstallGuideHost가 받는다) */
export function openInstallGuide() {
  window.dispatchEvent(new Event(GUIDE_EVENT));
}

/** 설치 단추: 브라우저 설치 창이 있으면 그것을, 없으면 안내 창을 연다 */
export async function startInstall() {
  if (window.__jyBip) {
    const r = await promptInstall();
    if (r !== 'unavailable') return;
  }
  openInstallGuide();
}
