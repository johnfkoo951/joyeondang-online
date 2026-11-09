import { CopyLink } from '@/components/CopyLink';
import { INAPP_NAME, escapeUrl, type InApp } from '@/lib/inapp';

// 앱 안 브라우저에서는 구글 로그인 버튼 대신 이 안내를 보여 준다. 구경은 그대로 된다.
export function InAppBanner({ kind, href, ua }: { kind: Exclude<InApp, null>; href: string; ua: string }) {
  const out = escapeUrl(kind, href, ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  return (
    <div className="banner stack" role="note">
      <p style={{ margin: 0 }}>
        <strong>{INAPP_NAME[kind]} 안에서는 구글 로그인이 막혀 있어요.</strong> 둘러보기는 여기서 그대로 하셔도 되고,
        들어가려면 {isIOS ? 'Safari' : 'Chrome'}에서 열어 주세요.
      </p>
      <div className="btn-row">
        {out ? (
          <a className="btn btn-roof" href={out}>
            {isIOS ? 'Safari' : 'Chrome'}에서 열기
          </a>
        ) : null}
        <CopyLink href={href} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        버튼이 안 되면 오른쪽 위 ⋯ 또는 공유 단추를 누르고 「다른 브라우저로 열기」를 고르세요.
      </p>
    </div>
  );
}
