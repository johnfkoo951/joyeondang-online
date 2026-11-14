'use client';
import { useState, useSyncExternalStore } from 'react';
import { CopyLink } from '@/components/CopyLink';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { INAPP_NAME, INAPP_NAME_EN, detectInApp, escapeLabel, escapeUrl, type InApp } from '@/lib/inapp';

/** 이 탭에서 안내를 한 번 닫았으면 다시 띄우지 않는다 */
const SEEN_KEY = 'jy.walk.inapp.seen';
const noSub = () => () => {};
let kindCache: InApp | undefined;
const readKind = () => (kindCache === undefined ? (kindCache = detectInApp(navigator.userAgent)) : kindCache);
const readSeen = () => {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

// 앱 안 브라우저(카카오톡 등)로 걷는 구경꾼인지. 거기서는 구글 로그인이 막혀 있어,
// 초대받은 분이 「들어가기」를 누르기 전에는 모른 채 그림 집만 걷게 된다.
export function useInApp(on: boolean) {
  const found = useSyncExternalStore(noSub, readKind, () => null);
  const seen = useSyncExternalStore(noSub, readSeen, () => true);
  const [closed, setClosed] = useState(false);
  const kind = on ? found : null;
  const close = () => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* 저장 안 돼도 이번에는 닫힌다 */ }
    setClosed(true);
  };
  return { kind, show: Boolean(kind) && !seen && !closed, close };
}

type Props = { kind: Exclude<InApp, null>; where: 'talk' | 'menu'; onClose?: () => void };

// 한 줄 안내와 바깥 브라우저로 여는 단추. 바깥에서는 바로 「들어가기」 화면이 열리고, 로그인하면 걷기로 돌아온다.
// 주소 체계가 없는 앱(iOS의 카카오톡 밖)은 주소를 복사하게 한다. 영어 화면이면 앱 이름과 단추 글을 영어로
// (lib/inapp의 INAPP_NAME_EN, escapeLabel: 첫 화면·머리줄 안내와 같은 말).
export function InAppNote({ kind, where, onClose }: Props) {
  const lang = useLang();
  const ua = navigator.userAgent;
  const href = `${window.location.origin}/login?next=${encodeURIComponent(window.location.pathname)}`;
  const out = escapeUrl(kind, href, ua);
  const btn = where === 'menu' ? 'btn btn-small' : 'walk-notice-btn';
  return (
    <div className={where === 'menu' ? 'walk-inapp' : 'walk-notice walk-inapp'} role="note">
      <span>
        <T
          ko={`${INAPP_NAME[kind]}에서는 로그인이 안 돼요. 초대받으신 분은 Safari나 Chrome에서 열어 주세요.`}
          en={`You can’t sign in inside ${INAPP_NAME_EN[kind]}. If you were invited, please open this page in Safari or Chrome.`}
        />
      </span>
      <span className="walk-inapp-row">
        {out ? <a className={btn} href={out}>{escapeLabel(kind, ua, lang)}</a> : <CopyLink href={href} className={btn} />}
        {onClose ? <button type="button" className={btn} onClick={onClose}><T ko="닫기" en="Close" /></button> : null}
      </span>
    </div>
  );
}
