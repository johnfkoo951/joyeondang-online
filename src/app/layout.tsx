import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { HeadOffset } from '@/components/HeadOffset';
import { MobileMenuDrawer } from '@/components/MobileMenuDrawer';
import { NavLinks, QuickSearchButton } from '@/components/NavLinks';
import { QuietBanner } from '@/components/QuietBanner';
import { QuietBannerGate } from '@/components/QuietBannerGate';
import { Shortcuts } from '@/components/Shortcuts';
import { TextSize } from '@/components/TextSize';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ViewerChip } from '@/components/ViewerChip';
import { HOUSE_NAME, HOUSE_PLAQUE } from '@/content/house-name';
import { IDEAS_NEW_URL } from '@/content/links';
import { LAUNCHED, SITE_URL } from '@/lib/env';
import { ART_FONT_CSS_URL, ART_FONT_LINK_ID, FONT_CSS_URL, FONT_LINK_ID } from '@/lib/fonts';
import { LANG_BOOT } from '@/lib/i18n';
import { PWA_BOOT } from '@/lib/pwa';
import { LangToggle } from '@/components/i18n/LangToggle';
import { T } from '@/components/i18n/T';
import { InstallGuideHost } from '@/components/pwa/InstallGuideHost';
import head from '@/components/site-head.module.css';
import './globals.css';

// 첫 화면과 카톡 미리보기에는 그림과 당호만 둔다(기획서 10절 3). 집의 내력·주소·외관 사진은 넣지 않는다.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: '조연당 造連堂', template: '%s · 조연당' },
  description: '짓고 잇는 집, 조연당에 놀러 오세요.',
  robots: LAUNCHED ? { index: true, follow: true } : { index: false, follow: false },
  // 홈 화면에 추가했을 때의 이름(앱 설정은 app/manifest.ts, 아이폰 아이콘은 app/apple-icon.png)
  applicationName: '조연당',
  appleWebApp: { capable: true, title: '조연당', statusBarStyle: 'default' },
  openGraph: {
    title: '조연당 造連堂',
    description: '짓고 잇는 집, 조연당에 놀러 오세요.',
    type: 'website',
    locale: 'ko_KR',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 화면을 가장자리까지 쓴다: 이게 없으면 CSS의 env(safe-area-inset-*)가 늘 0이고, 가로로 돌린 휴대폰은 걷기 화면 양옆에 빈 띠가 생긴다
  viewportFit: 'cover',
  themeColor: '#f4f0e6',
};

// 그리기 전에 계절(KST 기준)과 큰 글씨 설정을 붙인다. 저장소가 막혀 있어도 화면은 그대로 뜬다.
// 글꼴 CSS는 여기서 media=print로 붙였다가 다 받으면 켠다: 바깥 CDN이 느리거나 끊겨도 첫 화면이 기다리지 않는다.
// 화면 말(한국어·영어)도 여기서 고른다(lib/i18n.ts LANG_BOOT): 서버가 함께 실은 두 말 가운데 CSS가 고른 말만 보인다
const BOOT = `(function(){var d=document.documentElement;try{var m=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',month:'numeric'}).format(new Date()));d.dataset.season=m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';try{if(localStorage.getItem('jy.text')==='large')d.dataset.text='large';var th=localStorage.getItem('jy.theme')==='dark'?'dark':'light';d.dataset.theme=th}catch(e){}}catch(e){}${LANG_BOOT}${PWA_BOOT}try{[[${JSON.stringify(FONT_LINK_ID)},${JSON.stringify(FONT_CSS_URL)}],[${JSON.stringify(ART_FONT_LINK_ID)},${JSON.stringify(ART_FONT_CSS_URL)}]].forEach(function(pair){var l=document.createElement('link');l.id=pair[0];l.rel='stylesheet';l.media='print';l.onload=l.onerror=function(){l.media='all'};l.href=pair[1];document.head.appendChild(l)})}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        <noscript>
          <link rel="stylesheet" href={FONT_CSS_URL} />
        </noscript>
      </head>
      <body>
        {/* 초점을 받으면 왼쪽 위에 떠서 보인다(머리줄을 밀어 내리지 않게, globals.css .skip-link) */}
        <a className="skip-link" href="#main"><T ko="본문으로 건너뛰기" en="Skip to main content" /></a>
        {/* 조용 모드(공통 세션) 띠: 걷기 화면까지 모든 화면 맨 위 */}
        <Suspense fallback={<QuietBanner canClap={false} />}>
          <QuietBannerGate />
        </Suspense>
        <header className="site-head">
          <div className={`wrap-wide bar ${head.bar}`}>
            {/* 현판처럼 한자는 오른쪽부터(堂連造, 화면 읽기에서는 숨김). 한글 이름은 휴대폰에서도 보인다: 틀 없는 한자만 있으면
                왼쪽부터 「당연조」로 읽히기 쉽다. 링크 이름은 보이는 한글 이름에 「첫 화면」을 덧붙인 것(음성 조작이 「조연당」으로 찾는다).
                아주 좁은 폭에서만 한자를 접고 한글을 남긴다(globals.css).
                영어 화면은 같은 모양의 링크를 따로 두고 로마자 이름(Joyeondang)을 보인다: CSS가 고른 말의 링크만 보인다 */}
            <Link href="/" className="mark" data-ko="">
              <span className="hanja" aria-hidden="true">{HOUSE_PLAQUE}</span>
              <span className="hangul">{HOUSE_NAME}</span>
              <span className="sr-only"> 첫 화면</span>
            </Link>
            <Link href="/" className={`mark ${head.enMark}`} data-en="" lang="en">
              <span className={`hanja ${head.enHanja}`} aria-hidden="true">{HOUSE_PLAQUE}</span>
              <span className="hangul">Joyeondang</span>
              <span className="sr-only"> home page</span>
            </Link>
            <NavLinks />
            <div className={`head-tools ${head.tools}`}>
              <QuickSearchButton />
              <span className="head-desktop-only">
                <LangToggle />
              </span>
              <span className="head-desktop-only">
                <ThemeToggle />
              </span>
              <span className="head-desktop-only">
                <TextSize />
              </span>
              <Suspense fallback={<span className="chip" aria-hidden="true">···</span>}>
                <ViewerChip />
              </Suspense>
              <MobileMenuDrawer />
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-foot">
          <div className="wrap-wide stack">
            <p>
              <T
                ko="조연당 온라인은 가족이 손님을 맞으려고 만든 작은 집 기록입니다. 그림 속 집은 실제 도면이 아닙니다."
                en="Joyeondang Online is a small record of our home, made by our family to welcome guests. The house in the pictures is not the real floor plan."
              />
            </p>
            <p>
              <Link href="/privacy"><T ko="무엇을 받고 어떻게 지우는지" en="What we collect and how to delete it" /></Link> ·{' '}
              <Link href="/map#list"><T ko="목록으로 보기" en="View as a list" /></Link> ·{' '}
              <a href={IDEAS_NEW_URL} target="_blank" rel="noopener noreferrer"><T ko="아이디어 제안하기 (GitHub)" en="Suggest an idea (GitHub)" /></a> ·{' '}
              <T ko="단축키" en="Shortcuts" /> <kbd>?</kbd>
            </p>
          </div>
        </footer>
        <Shortcuts />
        <HeadOffset />
        {/* 「홈 화면에 추가」 안내 창(메뉴 어디서 열어도 여기 하나) */}
        <InstallGuideHost />
      </body>
    </html>
  );
}
