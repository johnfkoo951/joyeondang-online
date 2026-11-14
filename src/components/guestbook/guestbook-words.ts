// 방명록 스튜디오의 글 남길 곳(탭)과 예시 벽. 한국어는 예전 글 그대로, 화면이 영어일 때 쓰는 말은 en에 둔다.
// 글감(starters)은 누르면 쓰기 칸에 들어가는 한 줄이라, 영어 화면에서는 영어 글감을 넣는다.
// 예시 벽은 걸린 글이 하나도 없을 때만 보이는 본보기(사이트가 쓴 글)라 영어 화면에서 함께 옮긴다.
import type { RecordRow } from '@/components/RecordList';

export type DestSlug = 'living' | 'pine' | 'study' | 'porch' | 'photozone';

export type DestSpec = {
  slug: DestSlug;
  tabLabel: string;
  subLabel: string;
  prompt: string;
  submitLabel: string;
  photo?: boolean;
  quoteMode?: boolean;
  starters: string[];
  en: { tabLabel: string; subLabel: string; prompt: string; submitLabel: string; starters: string[] };
};

export const DESTINATIONS: DestSpec[] = [
  {
    slug: 'living',
    tabLabel: '거실 방명록',
    subLabel: '축하·안부 인사',
    prompt: '이 집에 사는 다섯 사람에게 건네고 싶은 한마디를 남겨 주세요.',
    submitLabel: '방명록 남기기',
    starters: [
      '새 보금자리에서 매일 따뜻한 웃음이 가득하길 바라요!',
      '조연당 온라인 구석구석 반갑게 둘러보고 갑니다.',
      '초대해 주셔서 고마워요. 곧 반가운 얼굴로 만나요!',
    ],
    en: {
      tabLabel: 'Living room guestbook',
      subLabel: 'Congrats and hellos',
      prompt: 'Leave a few words for the five people who live here.',
      submitLabel: 'Sign the guestbook',
      starters: [
        'Wishing you warm laughter every day in your new home!',
        'I loved looking around every corner of Joyeondang Online.',
        'Thank you for inviting me. See you soon!',
      ],
    },
  },
  {
    slug: 'pine',
    tabLabel: '앞마당 소나무',
    subLabel: '소원 쪽지 + 사진',
    prompt: '다음에 이 집에서 우리와 무엇을 함께하고 싶나요?',
    submitLabel: '소나무에 쪽지 걸기',
    photo: true,
    starters: [
      '따뜻한 차 한잔 마시며 거실에서 음악 듣고 싶어요.',
      '날 좋은 날 마당에서 함께 도란도란 이야기해요!',
      '계절이 바뀔 때 다시 놀러 와서 풍경을 보고 싶어요.',
    ],
    en: {
      tabLabel: 'Front yard pine',
      subLabel: 'Wish notes + photos',
      prompt: 'What would you like to do with us here next time?',
      submitLabel: 'Hang a note on the pine',
      starters: [
        'I’d love to listen to music in the living room over a cup of warm tea.',
        'Let’s sit in the yard and chat on a sunny day!',
        'I want to come back when the season changes and see the view.',
      ],
    },
  },
  {
    slug: 'study',
    tabLabel: '빛 드는 서재',
    subLabel: '좋은 문장 + 출처',
    prompt: '요즘 마음을 붙잡은 좋은 문장 하나를 출처와 함께 줄에 걸어 두어요.',
    submitLabel: '서재 줄에 문장 걸기',
    quoteMode: true,
    starters: [
      '집은 네 벽이 아니라 마음이 머무는 자리에서 시작된다.',
      '함께 걸어 본 길은 계절이 바뀌어도 기억 속에 남는다.',
    ],
    en: {
      tabLabel: 'Sunlit study',
      subLabel: 'A good sentence + source',
      prompt: 'Hang a sentence that has stayed with you lately on the string, with its source.',
      submitLabel: 'Hang it in the study',
      starters: [
        'A home begins not with four walls but where the heart stays.',
        'A road walked together stays in memory as the seasons change.',
      ],
    },
  },
  {
    slug: 'porch',
    tabLabel: '세 아치 포치',
    subLabel: '첫인사 쪽지',
    prompt: '오늘 이 집에 들어오며 무엇을 가지고 오셨나요?',
    submitLabel: '포치에 첫인사 남기기',
    starters: [
      '반가운 마음과 따뜻한 축하를 한가득 들고 왔어요!',
      '오랜만에 안부를 묻는 설레는 마음을 가져왔어요.',
    ],
    en: {
      tabLabel: 'Three-arch porch',
      subLabel: 'A first hello',
      prompt: 'What did you bring with you into this house today?',
      submitLabel: 'Say hello at the porch',
      starters: [
        'I came with a glad heart and an armful of congratulations!',
        'I brought the flutter of catching up after a long time.',
      ],
    },
  },
  {
    slug: 'photozone',
    tabLabel: '마당 포토존',
    subLabel: '기념 사진 남기기',
    prompt: '오늘 이 집에서 남기는 기념 사진 한 장과 짧은 메모',
    submitLabel: '사진 쪽지 남기기',
    photo: true,
    starters: [
      '오늘 조연당 마당을 걸으며 남기는 기념 한 컷!',
    ],
    en: {
      tabLabel: 'Yard photo spot',
      subLabel: 'Leave a keepsake photo',
      prompt: 'A keepsake photo from this house today, with a short note',
      submitLabel: 'Leave a photo note',
      starters: [
        'A keepsake shot from my walk in the Joyeondang yard today!',
      ],
    },
  },
];

/** 벽에 걸린 글 한 장(어느 방에 걸렸는지 함께). sampleEn: 예시 글의 영어(예시에만) */
export type WallItem = RecordRow & { roomSlug: string; roomName: string; sampleEn?: { roomName: string; author: string; body: string } };

/** 걸린 글이 하나도 없을 때 보이는 예시 벽 */
export const SAMPLE_WALL: WallItem[] = [
  {
    id: 'sample-1',
    roomSlug: 'living',
    roomName: '1층 거실 (예시)',
    author_name: '이웃 손님',
    format: 'note',
    body: '세 아치 마당부터 2층 재즈 방까지 구석구석 온기가 느껴져요. 따뜻한 보금자리에서 늘 행복한 일만 가득하시길 바랍니다!',
    visibility: 'public',
    status: 'approved',
    created_at: '2026-11-12T00:00:00.000Z',
    mine: false,
    sampleEn: {
      roomName: '1F Living room (example)',
      author: 'A neighbor',
      body: 'From the three-arch yard to the 2F jazz room, every corner feels warm. Wishing you nothing but happy days in your cozy home!',
    },
  },
  {
    id: 'sample-2',
    roomSlug: 'pine',
    roomName: '앞마당 소나무 (예시)',
    author_name: '반가운 친구',
    format: 'note',
    body: '날이 풀리면 마당 돌등 아래에서 따뜻한 차 마시며 밤늦도록 이야기 나누고 싶어요.',
    visibility: 'public',
    status: 'approved',
    created_at: '2026-11-12T00:00:00.000Z',
    mine: false,
    sampleEn: {
      roomName: 'Front yard pine (example)',
      author: 'A happy friend',
      body: 'When the weather warms up, I’d love to sip warm tea under the stone lantern in the yard and talk late into the night.',
    },
  },
  {
    id: 'sample-3',
    roomSlug: 'study',
    roomName: '빛이 드는 방 (예시)',
    author_name: '서재 산책자',
    format: 'sentence',
    body: '집을 짓는다는 건 함께 나눌 시간을 짓는 일이다.\n\n출처: 조연당 첫 문장 노트',
    visibility: 'public',
    status: 'approved',
    created_at: '2026-11-12T00:00:00.000Z',
    mine: false,
    sampleEn: {
      roomName: 'Sunlit room (example)',
      author: 'A study wanderer',
      body: 'To build a house is to build time to share.\n\nSource: Joyeondang first sentence notes',
    },
  },
];
