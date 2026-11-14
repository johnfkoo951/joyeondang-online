import { CopyLink } from '@/components/CopyLink';
import { T } from '@/components/i18n/T';
import { INAPP_NAME, INAPP_NAME_EN, escapeUrl, type InApp } from '@/lib/inapp';
import s from './home.module.css';

// 앱 안 브라우저(카카오톡 등)로 온 로그인 전 손님의 초대 줄. 걷기와 둘러보기는 여기서 그대로 되고,
// 들어가기(구글 로그인)만 바깥 브라우저에서 한다. 보통 브라우저의 초대 줄과 같은 모양·같은 말(「들어가기」)로 두고
// 단추가 바깥 브라우저의 들어가기 화면을 연다(주홍 「집 안 걷기」가 유일한 주 단추로 남게, 휴대폰 한 줄에 들게).
// 바로 아래 작은 한 줄이 바깥으로 넘어간다는 것을 미리 말하고, 누르면 안 넘어갈 때의 길(⋯ 메뉴, 주소 복사)이 펼쳐진다.
// 바깥으로 여는 주소가 없는 경우(iOS의 다른 앱)는 단추 자리에 주소 복사를 둔다.
// 초대 줄은 화면 말마다 한 줄씩 두고 CSS가 고른 말의 줄만 보인다(줄의 모양이 그대로 남게)
export function InAppInvite({ kind, href, ua }: { kind: Exclude<InApp, null>; href: string; ua: string }) {
  const out = escapeUrl(kind, href, ua);
  const browser = /iPhone|iPad|iPod/i.test(ua) ? 'Safari' : 'Chrome';
  return (
    <div className={s.inapp}>
      <p data-ko="" className={s.invite}>
        <span>초대장을 받으셨나요?</span>
        {out ? (
          <a className={`btn ${s.inviteBtn}`} href={out}>
            들어가기
            <span className="sr-only">, 바깥 브라우저에서 열려요</span>
            <IconOut />
          </a>
        ) : (
          <CopyLink href={href} className={`btn ${s.inviteBtn}`} />
        )}
      </p>
      <p data-en="" lang="en" className={s.invite}>
        <span>Got an invitation?</span>
        {out ? (
          <a className={`btn ${s.inviteBtn}`} href={out}>
            Sign in
            <span className="sr-only">, opens in another browser</span>
            <IconOut />
          </a>
        ) : (
          <CopyLink href={href} className={`btn ${s.inviteBtn}`} />
        )}
      </p>
      <details className={s.inappMore}>
        <summary>
          <span>
            <T
              ko={<>{INAPP_NAME[kind]} 안에서는 구글 로그인이 막혀서 바깥 브라우저로 넘어가요.</>}
              en={<>Google sign-in doesn&apos;t work inside {INAPP_NAME_EN[kind]}, so it opens in another browser.</>}
            />{' '}
            <span className={s.inappHow}><T ko="안 넘어가면" en="If it doesn't open" /></span>
          </span>
        </summary>
        <div className={s.inappBody}>
          <p>
            <T
              ko={<>오른쪽 위 ⋯ 또는 공유 단추를 누르고 「다른 브라우저로 열기」를 고르세요. 주소를 복사해 {browser}에 붙여 넣어도 돼요.</>}
              en={<>Tap ⋯ or the share button at the top right and choose &ldquo;Open in another browser&rdquo;. You can also copy the link and paste it into {browser}.</>}
            />
          </p>
          {out ? <CopyLink href={href} className="btn btn-small" /> : null}
        </div>
      </details>
    </div>
  );
}

/** 바깥으로 열린다는 표시(오른쪽 위 화살표) */
function IconOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 16 16 8M9.5 8H16v6.5" />
    </svg>
  );
}
