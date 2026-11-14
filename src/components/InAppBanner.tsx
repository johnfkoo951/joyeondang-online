import { CopyLink } from '@/components/CopyLink';
import { T } from '@/components/i18n/T';
import { INAPP_NAME, INAPP_NAME_EN, escapeLabel, escapeUrl, type InApp } from '@/lib/inapp';

// 앱 안 브라우저에서는 구글 로그인 버튼 대신 이 안내를 보여 준다. 구경은 그대로 된다.
// 글과 단추가 같은 곳을 말하게 한다: 카카오톡은 기기의 기본 브라우저로 열리므로 「바깥 브라우저」, 다른 앱은 브라우저 이름.
// 첫 화면은 이 상자 대신 한 줄짜리(src/components/home/InAppInvite.tsx)를 쓴다.
export function InAppBanner({ kind, href, ua }: { kind: Exclude<InApp, null>; href: string; ua: string }) {
  const out = escapeUrl(kind, href, ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const where = kind === 'kakao' ? '바깥 브라우저' : isIOS ? 'Safari' : 'Chrome';
  const whereEn = kind === 'kakao' ? 'your browser' : isIOS ? 'Safari' : 'Chrome';
  return (
    <div className="banner stack" role="note">
      <p style={{ margin: 0 }}>
        <T
          ko={<><strong>{INAPP_NAME[kind]} 안에서는 구글 로그인이 막혀 있어요.</strong> 둘러보기는 여기서 그대로 하셔도 되고, 들어가려면 {where}에서 열어 주세요.</>}
          en={<><strong>Google sign-in doesn&apos;t work inside {INAPP_NAME_EN[kind]}.</strong> You can keep looking around here. To sign in, open this page in {whereEn}.</>}
        />
      </p>
      <div className="btn-row">
        {out ? (
          <a className="btn btn-roof" href={out}>
            <T ko={escapeLabel(kind, ua)} en={escapeLabel(kind, ua, 'en')} />
          </a>
        ) : null}
        <CopyLink href={href} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        <T
          ko="버튼이 안 되면 오른쪽 위 ⋯ 또는 공유 단추를 누르고 「다른 브라우저로 열기」를 고르세요."
          en={'If the button doesn\'t work, tap ⋯ or the share button at the top right and choose "Open in another browser".'}
        />
      </p>
    </div>
  );
}
