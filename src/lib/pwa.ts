// 홈 화면에 추가(앱처럼 쓰기)를 어떻게 안내할지 정한다(순수 계산, 시험 대상).
// - installed: 이미 홈 화면 앱으로 열려 있거나, 이 탭에서 방금 설치했다(안내하지 않는다).
// - prompt: 브라우저가 설치 창을 띄울 수 있다(안드로이드·데스크톱 크롬 계열의 beforeinstallprompt). 단추 하나로 설치.
// - ios: 아이폰·아이패드 사파리(와 iOS의 다른 브라우저): 공유 단추 → 「홈 화면에 추가」. 홈 화면 앱은 사파리와 로그인이 따로라
//   손님은 「앱 로그인」(사파리에서 받은 코드)으로 한 번 더 들어온다.
// - android: 안드로이드인데 설치 창이 아직 없다(이미 설치했거나 브라우저가 아직 허락 안 함): 브라우저 메뉴 → 홈 화면에 추가.
// - inapp: 카카오톡 같은 앱 안 브라우저: 홈 화면에 추가할 수 없다. 바깥 브라우저로 열어야 한다.
// - none: 그 밖(데스크톱 사파리·파이어폭스 등): 안내하지 않는다.
import { detectInApp } from './inapp';

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'android' | 'inapp' | 'none';

export type InstallEnv = {
  ua: string;
  /** display-mode: standalone/fullscreen이거나 navigator.standalone */
  standalone: boolean;
  /** beforeinstallprompt를 잡아 두었는가 */
  canPrompt: boolean;
  /** 터치 맥(아이패드 데스크톱 모드)인가: maxTouchPoints > 1 이면서 Macintosh */
  touchMac?: boolean;
  /** 이 탭에서 방금 설치했다(appinstalled) */
  justInstalled?: boolean;
};

export const isIOS = (ua: string, touchMac = false) => /iPhone|iPad|iPod/i.test(ua) || (touchMac && /Macintosh/i.test(ua));
export const isAndroid = (ua: string) => /Android/i.test(ua);

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone || env.justInstalled) return 'installed';
  if (detectInApp(env.ua)) return 'inapp';
  if (env.canPrompt) return 'prompt';
  if (isIOS(env.ua, env.touchMac)) return 'ios';
  if (isAndroid(env.ua)) return 'android';
  return 'none';
}

/** 안내 단추를 보일까: 이미 앱이거나 안내할 길이 없으면 숨긴다 */
export const showInstall = (m: InstallMode) => m === 'prompt' || m === 'ios' || m === 'android' || m === 'inapp';

/** 설치 창 상태가 바뀌었음을 알리는 window 이벤트 이름 */
export const PWA_EVENT = 'jy-pwa';

/**
 * BOOT 스크립트에 넣는 글(그리기 전에 돈다). 설치 창(beforeinstallprompt)은 화면 코드가 붙기 전에 한 번 오므로
 * 여기서 받아 window에 둔다. 브라우저의 기본 설치 띠는 막지 않는다(preventDefault 하지 않음)
 */
export const PWA_BOOT = `try{window.__jyPwaHooked=1;addEventListener('beforeinstallprompt',function(e){window.__jyBip=e;dispatchEvent(new Event(${JSON.stringify(PWA_EVENT)}))});addEventListener('appinstalled',function(){window.__jyBip=null;window.__jyInstalled=1;dispatchEvent(new Event(${JSON.stringify(PWA_EVENT)}))})}catch(e){}`;
