import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { NavLinks } from '@/components/NavLinks';
import { Shortcuts } from '@/components/Shortcuts';
import { TextSize } from '@/components/TextSize';
import { ViewerChip } from '@/components/ViewerChip';
import { IDEAS_NEW_URL } from '@/content/links';
import { LAUNCHED, SITE_URL } from '@/lib/env';
import './globals.css';

// 첫 화면과 카톡 미리보기에는 그림과 당호만 둔다(기획서 10절 3). 집의 내력·주소·외관 사진은 넣지 않는다.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: '조연당 造連堂', template: '%s · 조연당' },
  description: '짓고 잇는 집, 조연당에 놀러 오세요.',
  robots: LAUNCHED ? { index: true, follow: true } : { index: false, follow: false },
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f1e7' },
    { media: '(prefers-color-scheme: dark)', color: '#1d1b19' },
  ],
};

// 그리기 전에 계절(KST 기준)과 큰 글씨 설정을 붙인다. 저장소가 막혀 있어도 화면은 그대로 뜬다.
const BOOT = `(function(){try{var d=document.documentElement;var m=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',month:'numeric'}).format(new Date()));d.dataset.season=m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';try{if(localStorage.getItem('jy.text')==='large')d.dataset.text='large'}catch(e){}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <a className="sr-only focus:not-sr-only" href="#main">본문으로 건너뛰기</a>
        <header className="site-head">
          <div className="wrap-wide bar">
            <Link href="/" className="mark" aria-label="조연당 첫 화면">
              <span className="hanja">造連堂</span>
              <span className="hangul">조연당</span>
            </Link>
            <NavLinks />
            <div className="head-tools">
              <TextSize />
              <Suspense fallback={<span className="chip" aria-hidden="true">···</span>}>
                <ViewerChip />
              </Suspense>
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-foot">
          <div className="wrap-wide stack">
            <p>
              조연당 온라인은 가족이 손님을 맞으려고 만든 작은 집 기록입니다. 그림 속 집은 실제 도면이 아닙니다.
            </p>
            <p>
              <Link href="/privacy">무엇을 받고 어떻게 지우는지</Link> · <Link href="/map#list">목록으로 보기</Link> ·{' '}
              <a href={IDEAS_NEW_URL} target="_blank" rel="noopener noreferrer">아이디어 제안하기 (GitHub)</a> ·
              단축키 <kbd>?</kbd>
            </p>
          </div>
        </footer>
        <Shortcuts />
      </body>
    </html>
  );
}
