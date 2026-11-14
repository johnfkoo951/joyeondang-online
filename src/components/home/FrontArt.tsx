/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LangRegion } from '@/components/LangAttrs';
import { T } from '@/components/i18n/T';
import { HOUSE_NAME } from '@/content/house-name';
import { lanternGlow, lanternWords } from '@/lib/front';
import { CrayonOrb, type PigmentToken } from './CrayonOrb';
import { ORB_WORDS, type OrbId } from './home-words';
import { IconChevron } from './icons';
import s from './home.module.css';

type StageOrb = {
  id: OrbId;
  href: string;
  token: PigmentToken;
  toneClass: string;
  posClass: string;
  seed: number;
  hero?: boolean;
};

// 구슬 이름과 한 줄은 home-words.ts(한국어·영어)
const STAGE_ORBS: StageOrb[] = [
  {
    id: 'games',
    href: '/games',
    token: '--art-green',
    toneClass: s.orbGreen,
    posClass: s.posTopLeft,
    seed: 103,
  },
  {
    id: 'guestbook',
    href: '/guestbook',
    token: '--art-yellow',
    toneClass: s.orbYellow,
    posClass: s.posTopRight,
    seed: 211,
  },
  {
    id: 'walk',
    href: '/walk',
    token: '--art-cobalt',
    toneClass: s.orbCobalt,
    posClass: s.posCenterLeft,
    seed: 307,
    hero: true,
  },
  {
    id: 'stamp',
    href: '/map',
    token: '--art-vermilion',
    toneClass: s.orbVermilion,
    posClass: s.posCenterRight,
    seed: 419,
    hero: true,
  },
  {
    id: 'exhibit',
    href: '/exhibit',
    token: '--art-orange',
    toneClass: s.orbOrange,
    posClass: s.posBottomLeft,
    seed: 523,
  },
  {
    id: 'character',
    href: '/avatar',
    token: '--art-pink',
    toneClass: s.orbPink,
    posClass: s.posBottomRight,
    seed: 631,
  },
];

// 첫 화면 1막: 도화지 여백과 네 귀퉁이 색조각 사이에 떠 있는 여섯 개의 오일파스텔 구슬 무대.
// 배너는 한자와 영문의 작품 그대로, 화면 읽기용 제목은 선택한 언어로 전한다.
export function FrontArt({ children }: { children?: ReactNode }) {
  return (
    <div className={s.art}>
      {/* 가장자리 콜라주 조각들 */}
      <img src="/web/collage/edge-tl-v2.webp" alt="" aria-hidden="true" className={`${s.edgePiece} ${s.edgeTl}`} />
      <img src="/web/collage/edge-tr-v2.webp" alt="" aria-hidden="true" className={`${s.edgePiece} ${s.edgeTr}`} />
      <span className={`${s.edgeStrip} ${s.edgeLeftStrip}`} aria-hidden="true" />
      <img src="/web/collage/edge-bl-v2.webp" alt="" aria-hidden="true" className={`${s.edgePiece} ${s.edgeBl}`} />
      <img src="/web/collage/edge-br-v2.webp" alt="" aria-hidden="true" className={`${s.edgePiece} ${s.edgeBr}`} />

      {/* 선택한 서예와 영문 활자를 원래 비율과 한지 색으로 보존한다. */}
      <div className={s.heroTop}>
        <h1 className={s.bannerTitle}>
          <img
            src="/web/lettering/online-serif-banner.webp"
            width={1920}
            height={640}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            className={s.onlineBanner}
          />
          <span className="sr-only" data-ko="">{HOUSE_NAME} 온라인</span>
          <span className="sr-only" data-en="" lang="en">Joyeondang Online</span>
        </h1>
      </div>

      {/* 여백 속에 떠 있는 여섯 개의 오일파스텔 구슬 */}
      <LangRegion as="nav" className={s.orbField} label={['조연당 공간 구슬', 'Joyeondang spaces']}>
        {STAGE_ORBS.map((orb, idx) => {
          const w = ORB_WORDS[orb.id];
          return (
            <Link
              key={orb.id}
              href={orb.href}
              className={`${s.orbLink} ${orb.posClass} ${orb.toneClass}`}
              data-hero={orb.hero || undefined}
              style={{ ['--orb-delay' as string]: `${idx * 0.04}s` }}
            >
              <span className={s.orbVisual}>
                <CrayonOrb token={orb.token} seed={orb.seed} className={s.orbCanvas} />
                <span className={s.orbShadow} aria-hidden="true" />
              </span>
              <span className={s.orbCaption}>
                <strong className={s.orbTitle}><T ko={w.title.ko} en={w.title.en} /></strong>
                <small className={s.orbSub}><T ko={w.sub.ko} en={w.sub.en} /></small>
              </span>
            </Link>
          );
        })}
      </LangRegion>

      {/* 하단 석등 한 줄과 스크롤 표시 */}
      <div className={s.heroFoot}>
        <p className={s.orbHint}><T ko="구슬을 눌러 각 공간으로 들어가 보세요" en="Tap a bubble to step into each space" /></p>
        {children}
        <span className={s.scrollCue} aria-hidden="true" />
      </div>
    </div>
  );
}

/** 석등 불빛: 남긴 쪽지가 많을수록 불빛 점이 밝아지고, 누르면 아래 세 걸음 안내(#front-how)로 이어진다 */
export function LanternNote({ lantern }: { lantern: { lit: number; today: number } | null }) {
  const words = lanternWords(lantern);
  const en = lanternWords(lantern, 'en');
  return (
    <div className={s.lantern} style={{ ['--glow' as string]: String(lanternGlow(lantern?.lit)) }}>
      <a className={s.note} href="#front-how">
        <span className={s.lamp} aria-hidden="true" />
        <span className={s.noteText}>
          <span><T ko={words.line} en={en.line} /></span>
          {words.today ? <span className={s.today}><T ko={words.today} en={en.today ?? words.today} /></span> : null}
        </span>
        <span className={s.noteGo} aria-hidden="true">
          <IconChevron size={15} />
        </span>
      </a>
    </div>
  );
}
