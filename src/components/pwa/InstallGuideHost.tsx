'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { SITE_URL } from '@/lib/env';
import { detectInApp, escapeUrl } from '@/lib/inapp';
import type { InstallMode } from '@/lib/pwa';
import { IconAddHome, IconMenuDots, IconShare } from './icons';
import { GUIDE_EVENT, promptInstall, useInstallMode } from './pwa-store';
import s from './pwa.module.css';

// 「홈 화면에 추가」 안내 창. 화면 어디서든 openInstallGuide()로 연다(layout에 하나만 둔다: 메뉴가 닫혀도 창은 남는다).
// 기기마다 길이 다르다: 아이폰은 공유 단추, 안드로이드는 브라우저 메뉴(설치 창이 있으면 단추 하나), 앱 안 브라우저는 바깥으로.
export function InstallGuideHost() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const mode = useInstallMode();
  const t = useTr();

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(GUIDE_EVENT, on);
    return () => window.removeEventListener(GUIDE_EVENT, on);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="help-dialog"
      aria-labelledby="install-guide-title"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        // 창 바깥(어두운 바탕)을 누르면 닫는다
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      {open ? (
        <div className={s.body}>
          <div className={s.head}>
            <h2 id="install-guide-title">
              <T ko="홈 화면에 추가" en="Add to Home Screen" />
            </h2>
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label={t('닫기', 'Close')}>
              ×
            </button>
          </div>
          <GuideBody mode={mode} onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </dialog>
  );
}

function GuideBody({ mode, onDone }: { mode: InstallMode; onDone: () => void }) {
  if (mode === 'installed') {
    return (
      <p className={s.note}>
        <T ko="이미 홈 화면 앱으로 보고 계세요. 다음부터는 홈 화면의 조연당 아이콘으로 바로 들어오시면 돼요." en="You're already using the home-screen app. Next time, just tap the Joyeondang icon on your home screen." />
      </p>
    );
  }
  if (mode === 'prompt') return <PromptBody onDone={onDone} />;
  if (mode === 'ios') return <IosBody onDone={onDone} />;
  if (mode === 'android') return <AndroidBody />;
  if (mode === 'inapp') return <InAppBody />;
  return (
    <p className={s.note}>
      <T ko="이 브라우저는 홈 화면에 추가를 지원하지 않아요. 휴대폰의 사파리나 크롬에서 열어 주세요." en="This browser can't add sites to the home screen. Open this page in Safari or Chrome on your phone." />
    </p>
  );
}

function Lead() {
  return (
    <p style={{ margin: 0 }}>
      <T ko="조연당을 앱처럼 홈 화면에 두면 한 번에 집 안으로 들어오고, 주소창 없이 화면을 넓게 써요." en="Keep Joyeondang on your home screen like an app: one tap takes you inside the house, full screen without the address bar." />
    </p>
  );
}

function PromptBody({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'dismissed'>('idle');
  return (
    <>
      <Lead />
      <div className={s.row}>
        <button
          type="button"
          className="btn btn-roof"
          onClick={async () => {
            const r = await promptInstall();
            if (r === 'accepted') onDone();
            else setState('dismissed');
          }}
        >
          <IconAddHome /> <T ko="설치하기" en="Install" />
        </button>
      </div>
      {state === 'dismissed' ? (
        <p className={s.note}>
          <T ko="설치 창이 닫혔어요. 브라우저 메뉴에서 「앱 설치」나 「홈 화면에 추가」를 골라도 돼요." en="The install window closed. You can also choose “Install app” or “Add to Home screen” from the browser menu." />
        </p>
      ) : null}
    </>
  );
}

function IosBody({ onDone }: { onDone: () => void }) {
  return (
    <>
      <Lead />
      <ol className={s.steps}>
        <li>
          <T ko="공유 단추" en="Tap the Share button" />
          <span className={s.icon}>
            <IconShare />
          </span>
          <T
            ko="를 눌러요. 사파리는 화면 아래(아이패드는 위), 크롬은 주소창 옆에 있어요."
            en=". In Safari it's at the bottom (top on iPad); in Chrome it's next to the address bar."
          />
        </li>
        <li>
          <T ko="목록에서 「홈 화면에 추가」" en="Choose “Add to Home Screen”" />
          <span className={s.icon}>
            <IconAddHome />
          </span>
          <T ko="를 골라요. 안 보이면 목록을 위로 밀어 보세요." en=". If you don't see it, swipe up on the list to see more." />
        </li>
        <li>
          <T ko="「웹 앱으로 열기」가 보이면 켠 채로 「추가」를 눌러요." en="If you see “Open as Web App”, leave it on and tap “Add”." />
        </li>
      </ol>
      <p className={s.note}>
        <T
          ko="홈 화면 앱은 사파리와 로그인이 따로예요. 앱에서 로그인하실 때는 여기 사파리에서 받은 여섯 글자 코드를 넣으면 돼요."
          en="The home-screen app keeps its own sign-in, separate from Safari. To sign in there, enter a six-character code you get here in Safari."
        />{' '}
        <Link href="/app-link" onClick={onDone}>
          <T ko="앱 로그인 코드 받기" en="Get an app sign-in code" />
        </Link>
      </p>
    </>
  );
}

function AndroidBody() {
  return (
    <>
      <Lead />
      <ol className={s.steps}>
        <li>
          <T ko="브라우저 메뉴" en="Open the browser menu" />
          <span className={s.icon}>
            <IconMenuDots />
          </span>
          <T ko="를 눌러요(보통 오른쪽 위)." en=" (usually at the top right)." />
        </li>
        <li>
          <T ko="「앱 설치」나 「홈 화면에 추가」를 골라요." en="Choose “Install app” or “Add to Home screen”." />
        </li>
        <li>
          <T ko="「설치」 또는 「추가」를 누르면 홈 화면에 조연당 아이콘이 생겨요." en="Tap “Install” or “Add”. The Joyeondang icon appears on your home screen." />
        </li>
      </ol>
      <p className={s.note}>
        <T ko="설치한 앱은 이 브라우저의 로그인을 그대로 써요." en="The installed app uses this browser's sign-in." />
      </p>
    </>
  );
}

function InAppBody() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    // 렌더 중에 바깥 값을 읽지 않으려고, 창이 열린 뒤 한 번만 계산한다
    queueMicrotask(() => setHref(escapeUrl(detectInApp(ua), `${SITE_URL}/walk`, ua)));
  }, []);
  return (
    <>
      <p style={{ margin: 0 }}>
        <T
          ko="카카오톡 같은 앱 안의 브라우저에서는 홈 화면에 추가할 수 없어요. 사파리나 크롬으로 열어 주세요."
          en="You can't add to the home screen from a browser inside another app (like KakaoTalk). Please open this page in Safari or Chrome."
        />
      </p>
      {href ? (
        <div className={s.row}>
          <a className="btn btn-roof" href={href}>
            <T ko="바깥 브라우저로 열기" en="Open in your browser" />
          </a>
        </div>
      ) : (
        <p className={s.note}>
          <T ko="오른쪽 위나 아래의 ⋯ 메뉴에서 「다른 브라우저로 열기」를 골라 주세요." en="Use the ⋯ menu (top or bottom right) and choose “Open in browser”." />
        </p>
      )}
    </>
  );
}
