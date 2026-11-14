/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { T } from '@/components/i18n/T';
import type { FrontWho } from '@/lib/front';
import { countEn } from '@/lib/page-words';
import { CrayonOrb, type PigmentToken } from './CrayonOrb';
import { CuratedMore } from './CuratedMore';
import s from './home.module.css';

// 첫 화면 3막: 사각 상자 대신 도화지 위에 얹힌 여섯 채의 컷아웃 작은 집과 문고리 구슬.
// 집마다의 이름·한 줄·인용은 한국어와 영어를 나란히 둔다(titleEn, subEn, quoteEn). 화면은 <T>로 지금 말을 보인다
type Kind = FrontWho['kind'] | null;

type LittleHouse = {
  href: string;
  img: string;
  title: string;
  titleEn: string;
  sub: string;
  subEn: string;
  quote: string;
  quoteEn: string;
  token: PigmentToken;
  seed: number;
  knobX: number;
  knobY: number;
  guestOnly?: boolean;
};

function houses(who: Kind, open: number | null): LittleHouse[] {
  const guest = who === null || who === 'guest';
  return [
    {
      href: '/walk',
      img: '/web/collage/cutout-walk-v2.webp',
      title: '집 안 걷기',
      titleEn: 'Walk the house',
      sub: '3D 산책길',
      subEn: 'A 3D stroll',
      quote: '세 아치 마당부터 2층 박공방까지 한 걸음씩 거닐어요',
      quoteEn: 'Step by step from the three-arch yard to the gable room on 2F',
      token: '--art-cobalt',
      seed: 307,
      knobX: 60,
      knobY: 79,
    },
    {
      href: '/map',
      img: '/web/collage/cutout-stamp-v2.webp',
      title: '도장 투어',
      titleEn: 'Stamp tour',
      sub: open === null ? '열세 곳 인장 맵' : `열린 공간 ${open}곳`,
      subEn: open === null ? 'Map of 13 seals' : `${countEn(open, 'space')} open`,
      quote: '다녀온 자리마다 그림 지도에 전각 도장을 찍어요',
      quoteEn: 'Stamp a carved seal on the picture map at every spot you visit',
      token: '--art-vermilion',
      seed: 419,
      knobX: 63,
      knobY: 81,
    },
    {
      href: '/games',
      img: '/web/collage/cutout-games-v2.webp',
      title: '작은 놀이',
      titleEn: 'Mini games',
      sub: '12가지 놀이',
      subEn: '12 games',
      quote: '리듬 잼과 과녁 맞히기, 문장 퀴즈를 바로 즐겨요',
      quoteEn: 'Jump into the rhythm jam, target toss and sentence quiz',
      token: '--art-yellow',
      seed: 211,
      knobX: 66,
      knobY: 80,
    },
    {
      href: '/guestbook',
      img: '/web/collage/cutout-guestbook-v2.webp',
      title: '방명록과 쪽지',
      titleEn: 'Guestbook and notes',
      sub: '마음 걸어 두기',
      subEn: 'Hang up your wishes',
      quote: '거실 인사와 소나무 소원 쪽지, 좋은 문장을 남겨요',
      quoteEn: 'Leave a greeting in the living room, a wish on the pine, or a favorite sentence',
      token: '--art-orange',
      seed: 523,
      knobX: 68,
      knobY: 81,
    },
    {
      href: '/exhibit',
      img: '/web/collage/cutout-exhibit-v2.webp',
      title: '온라인 전시',
      titleEn: 'Online exhibit',
      sub: '일곱 칸 이야기',
      subEn: 'A story in seven parts',
      quote: '조연당과 다섯 사람의 이야기를 차분히 읽어 봐요',
      quoteEn: 'Take your time with the story of Joyeondang and five people',
      token: '--art-green',
      seed: 103,
      knobX: 69,
      knobY: 81,
    },
    {
      href: '/avatar',
      img: '/web/collage/cutout-character-v2.webp',
      title: '캐릭터와 화보',
      titleEn: 'Characters and lookbook',
      sub: '인형 옷장 · 사진첩',
      subEn: 'Doll wardrobe and album',
      quote: '나만의 3D 인형을 꾸미고 공간 화보를 감상해요',
      quoteEn: 'Dress up your own 3D doll and enjoy the lookbook of the house',
      token: '--art-pink',
      seed: 631,
      knobX: 67,
      knobY: 80,
      guestOnly: false,
    },
  ];
  void guest;
}

export function MoreLinks({ who, open }: { who: Kind; open: number | null }) {
  const guest = who === null || who === 'guest';
  return (
    <section className={s.more} aria-labelledby="front-more">
      <div className={s.catalogHead}>
        <p className={s.eyebrow}>SIX DOORS</p>
        <h2 id="front-more" className={s.catalogTitle}><T ko="여섯 개의 작은 문" en="Six little doors" /></h2>
        <p className={s.catalogSub}><T ko="집을 눌러 원하는 공간으로 바로 들어가 보세요" en="Tap a house to go straight to that space" /></p>
      </div>

      <ul className={s.houseGrid}>
        {houses(who, open).map((h) => (
          <li key={h.title} className={s.houseItem}>
            <Link href={h.href} className={s.houseCard}>
              <span className={s.houseArtWrap}>
                <span className={s.houseFigure}>
                  <img src={h.img} alt="" loading="lazy" className={s.houseCutout} />
                  <span
                    className={s.doorKnob}
                    style={{ left: `${h.knobX}%`, top: `${h.knobY}%` }}
                    aria-hidden="true"
                  >
                    <CrayonOrb token={h.token} seed={h.seed} className={s.knobCanvas} />
                  </span>
                </span>
              </span>
              <span className={s.houseCardTitle}><T ko={h.title} en={h.titleEn} /></span>
              <span className={s.houseCardSub}>
                <T ko={h.sub} en={h.subEn} />
                {h.guestOnly ? <span className={s.only}><T ko="초대 손님만" en="Invited guests only" /></span> : null}
              </span>
              <span className={s.houseCardQuote}><T ko={h.quote} en={h.quoteEn} /></span>
            </Link>
          </li>
        ))}
      </ul>

      <CuratedMore who={who} guest={guest} letteringHref="/exhibit/lettering" />
    </section>
  );
}
