/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { T } from '@/components/i18n/T';
import { LangImg, LangLink, LangRegion } from '@/components/LangAttrs';
import type { FrontWho } from '@/lib/front';
import s from './home.module.css';

// 화면 말은 한국어와 영어를 나란히 둔다(<T>, 속성은 LangAttrs). 작품 이름과 인장 이름은 옮기지 않는다(lang="ko")

type Kind = FrontWho['kind'] | null;

type CuratedItem = {
  key: string;
  href: string;
  title: string;
  titleEn: string;
  badge: string;
  badgeEn: string;
  desc: string;
  descEn: string;
  toneClass: string;
  emblem: ReactNode;
};

export function CuratedMore({
  who,
  guest,
  letteringHref,
}: {
  who: Kind;
  guest: boolean;
  letteringHref: string;
}) {
  const items: CuratedItem[] = [
    {
      key: 'lettering',
      href: letteringHref,
      title: '조연당의 글씨와 낙관',
      titleEn: 'Joyeondang lettering and seals',
      badge: '16점 · 인장',
      badgeEn: '16 works · seals',
      desc: '한지 먹글씨와 현판 시안, 지산의 붉은 아호인',
      descEn: 'Ink brushwork on hanji, plaque drafts and Jisan’s red pen-name seal',
      toneClass: s.slipVermilion,
      emblem: (
        <span className={s.emblemSeal} aria-hidden="true">
          <img
            src="/web/lettering/jisan-baiwen.webp"
            width={18}
            height={29}
            loading="lazy"
            alt=""
          />
        </span>
      ),
    },
    {
      key: 'gallery',
      href: '/gallery',
      title: '공간 화보와 내 갤러리',
      titleEn: 'Lookbook and my gallery',
      badge: '화보 · 사진첩',
      badgeEn: 'Lookbook · album',
      desc: '계절빛이 머무는 방 풍경과 산책 기념 사진',
      descEn: 'Rooms in seasonal light and photos from your walks',
      toneClass: s.slipCobalt,
      emblem: (
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <circle cx="8.5" cy="9.5" r="1.6" />
          <path d="M4.5 17l4.8-4.4a1.2 1.2 0 0 1 1.65.03L14 15.5l2.3-2.1a1.2 1.2 0 0 1 1.63.02L20 15.3" />
        </svg>
      ),
    },
    {
      key: 'notebook',
      href: '/notebook',
      title: who === 'visitor' ? '초대 코드 넣기 (내 수첩)' : '내 수첩과 도장 인장첩',
      titleEn: who === 'visitor' ? 'Enter an invite code (my notebook)' : 'My notebook and stamp book',
      badge: who === 'visitor' ? '초대 코드' : '13곳 인장첩',
      badgeEn: who === 'visitor' ? 'Invite code' : 'Stamp book of 13',
      desc:
        who === 'visitor'
          ? '초대 코드를 입력하고 손님 수첩과 인장첩 열기'
          : '다녀온 자리의 전각 도장과 남긴 글 모아 보기',
      descEn:
        who === 'visitor'
          ? 'Enter your invite code to open your guest notebook and stamp book'
          : 'See the carved stamps from the places you visited and what you wrote',
      toneClass: s.slipGreen,
      emblem: (
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6V4z" />
          <path d="M6 8H4.5M6 12H4.5M6 16H4.5" />
          <rect x="10" y="8.5" width="5" height="5" rx="1" />
          <path d="M10 16.2h5" />
        </svg>
      ),
    },
    {
      key: 'walk-together',
      href: guest ? '/walk' : who === 'visitor' ? '/notebook' : '/login?next=/walk',
      title: '함께 걷기와 대화',
      titleEn: 'Walk together and chat',
      badge: guest ? '실시간 산책' : '초대 손님',
      badgeEn: guest ? 'Live walk' : 'Invited guests',
      desc: '같은 시각 집 안을 거니는 손님들과 인사 나누기',
      descEn: 'Say hello to guests strolling the house at the same time',
      toneClass: s.slipOrange,
      emblem: (
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.5 18.5l-3 1.5.7-3.1A6.5 6.5 0 1 1 11 18.9c-1.2 0-2.4-.15-3.5-.4z" />
          <path d="M15.8 10.2a4.8 4.8 0 0 1 3.5 7.7l.5 2.1-2.2-1a5 5 0 0 1-4.1-.3" />
        </svg>
      ),
    },
  ];

  return (
    <div className={s.curatedWrap}>
      {/* 한지 먹글씨와 지산(紙散) 낙관 대표작 쇼케이스 */}
      <div className={s.calligraphyShowcase}>
        <LangLink
          href={letteringHref}
          className={s.calligraphySheet}
          label={['바람을 닮은 행서 — 조연당 먹글씨와 지산 낙관 전시 보러 가기', 'See the exhibit of Joyeondang ink lettering and the Jisan seal']}
        >
          <span className={s.washiTape} aria-hidden="true" />
          <span className={s.hanjiFrame}>
            <LangImg
              src="/web/lettering/14-hanji-running-horizontal.webp"
              srcSet="/web/lettering/14-hanji-running-horizontal-small.webp 640w, /web/lettering/14-hanji-running-horizontal.webp 1672w"
              sizes="(max-width: 759px) 92vw, 460px"
              width={1672}
              height={941}
              loading="lazy"
              alt={['한지 위에 먹으로 쓴 조연당 행서 글씨와 붉은 지산 낙관', 'Joyeondang in running script, brushed in ink on hanji, with the red Jisan seal']}
              className={s.calligraphyImg}
            />
          </span>
          <span className={s.sheetCaption} lang="ko">
            <span>No. 14 · 바람을 닮은 행서</span>
            <span className={s.sheetDirection}><T ko="오른쪽부터 조연당" en="Joyeondang, read from the right" /> · <T ko="紙散 백문인" en="紙散 white-text seal" /></span>
          </span>
        </LangLink>

        <div className={s.calligraphyNotes}>
          <div className={s.sealEyebrowRow}>
            <span className={s.sealPill} lang="ko">
              <span className={s.sealPillImgWrap} aria-hidden="true">
                <img
                  src="/web/lettering/jisan-baiwen.webp"
                  width={14}
                  height={22}
                  loading="lazy"
                  alt=""
                />
              </span>
              <T ko="紙散 · 지산 낙관" en="紙散 · Jisan seal" />
            </span>
            <span className={s.eyebrow}>CALLIGRAPHY &amp; SEAL</span>
          </div>

          <h3 className={s.calligraphyHeading}>
            <T ko={<>먹빛으로 쓴 당호와<br />지산의 작은 붉은 인장</>} en={<>The house name in ink<br />and Jisan’s small red seal</>} />
          </h3>

          <p className={s.calligraphyCopy}>
            <T
              ko="거침없이 달리는 행서 획 곁에 지산(紙散)의 붉은 백문인을 찍었습니다. 한지 서예 네 점부터 현판·안내판까지 열여섯 가지 표정의 조연당을 펼쳐 보세요."
              en="Beside the free-running strokes of the script, Jisan’s (紙散) red seal is pressed with white characters. See Joyeondang in sixteen moods, from four calligraphy pieces on hanji to plaques and signs."
            />
          </p>

          <Link href={letteringHref} className={`btn ${s.calligraphyCta}`}>
            <span><T ko="글씨와 낙관 열여섯 점 보기" en="See all sixteen works" /></span>
            <span className={s.ctaArrow} aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* 네 갈래 책갈피 색인 카드 */}
      <div className={s.curatedBlock}>
        <div className={s.curatedHead}>
          <span className={s.curatedRule} aria-hidden="true" />
          <span className={s.eyebrow}>MORE TO EXPLORE</span>
          <span className={s.curatedRule} aria-hidden="true" />
        </div>

        <LangRegion as="ul" className={s.curatedGrid} label={['더 둘러볼 공간', 'More places to explore']}>
          {items.map((item) => (
            <li key={item.key} className={s.curatedItem}>
              <Link href={item.href} className={`${s.curatedSlip} ${item.toneClass}`}>
                <span className={s.slipEmblem}>{item.emblem}</span>
                <span className={s.slipBody}>
                  <span className={s.slipTopRow}>
                    <strong className={s.slipTitle}><T ko={item.title} en={item.titleEn} /></strong>
                    <span className={s.slipBadge}><T ko={item.badge} en={item.badgeEn} /></span>
                  </span>
                  <span className={s.slipDesc}><T ko={item.desc} en={item.descEn} /></span>
                </span>
                <span className={s.slipGo} aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8h9M8.5 4l4 4-4 4" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </LangRegion>
      </div>
    </div>
  );
}
