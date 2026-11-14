// 갤러리의 조연당 콜라주 화보(사이트 그림과 그 소개). 한국어는 예전 글 그대로, 화면이 영어일 때 쓰는 말은 en에 둔다.

export type LookbookItem = {
  id: string;
  src: string;
  title: string;
  caption: string;
  href: string;
  cta: string;
  contain: boolean;
  en: { title: string; caption: string; cta: string };
};

export const LOOKBOOK: LookbookItem[] = [
  {
    id: 'poster-house',
    src: '/web/collage/collage-house-poster-v2.webp',
    title: '짓고 잇는 우리의 집 · 콜라주 포스터',
    caption: '한지와 오일파스텔 색종이를 찢어 붙인 조연당 대표 포스터 아트워크예요.',
    href: '/walk',
    cta: '3D로 집 안 걸어 보기',
    contain: true,
    en: {
      title: 'Our home, built and connected · collage poster',
      caption: 'The main Joyeondang poster, made from torn hanji and oil-pastel colored paper.',
      cta: 'Walk the house in 3D',
    },
  },
  {
    id: 'rally-map',
    src: '/web/collage/stamp-rally-landscape-v2.webp',
    title: '열세 곳 도장 투어 콜라주 지도',
    caption: '마당 세 아치부터 1층 거실, 2층 박공방까지 열세 곳을 색종이 조각으로 펼쳐 놓은 산책 지도예요.',
    href: '/map',
    cta: '도장 투어 맵 열기',
    contain: false,
    en: {
      title: 'Collage map of the 13-spot stamp tour',
      caption: 'A walking map that spreads 13 spots out in scraps of colored paper, from the three arches in the yard to the 1F living room and the 2F gable rooms.',
      cta: 'Open the stamp tour map',
    },
  },
  {
    id: 'games-collage',
    src: '/web/collage/collage-games-v2.webp',
    title: '작은 놀이 오브제 모음',
    caption: '콘트라베이스와 건반, 별 블록 선반, 동심원 과녁과 색종이 카드를 모은 놀이 콜라주예요.',
    href: '/games',
    cta: '작은 놀이 하러 가기',
    contain: true,
    en: {
      title: 'Objects from the mini games',
      caption: 'A play collage of a double bass and keys, a shelf of star blocks, a ring target, and colored paper cards.',
      cta: 'Play the mini games',
    },
  },
  {
    id: 'writing-collage',
    src: '/web/collage/collage-writing-v2.webp',
    title: '한지 엽서와 솔가지 · 방명록 책상',
    caption: '따뜻한 차 한 잔 옆에서 찢은 한지 엽서에 인사와 좋은 문장을 적어 걸어 두는 자리예요.',
    href: '/guestbook',
    cta: '방명록 쓰러 가기',
    contain: true,
    en: {
      title: 'Hanji postcards and pine twigs · the guestbook desk',
      caption: 'A spot beside a cup of warm tea for writing hellos and good sentences on torn hanji postcards and hanging them up.',
      cta: 'Write in the guestbook',
    },
  },
  {
    id: 'character-collage',
    src: '/web/collage/collage-character-v2.webp',
    title: '나만의 인형과 산책 사진첩',
    caption: '밀짚모자와 목도리로 꾸민 꼬마 캐릭터로 집 안을 걸으며 F2 키로 추억 사진을 남길 수 있어요.',
    href: '/avatar',
    cta: '내 캐릭터 꾸미기',
    contain: true,
    en: {
      title: 'Your own doll and a walk photo album',
      caption: 'Walk the house as a little character in a straw hat and scarf, and save memories with the F2 key.',
      cta: 'Dress up my character',
    },
  },
  {
    id: 'six-doors',
    src: '/web/collage/cutout-walk-v2.webp',
    title: '세 아치 마당의 작은 문',
    caption: '여섯 갈래 산책길 가운데 첫 번째 문을 여는 세 아치 작은 집 콜라주예요.',
    href: '/',
    cta: '첫 화면 포스터 보기',
    contain: true,
    en: {
      title: 'A little door in the three-arch yard',
      caption: 'A collage of the little three-arch house that opens the first of six walking paths.',
      cta: 'See the front page poster',
    },
  },
];
