// 걷기 화면 위 글(HUD)의 한국어·영어 표. 화면 부품(.tsx)에 흩어 두면 시험이 읽지 못하므로 표는 여기에 모은다
// (tests/unit/walk-hud-text.test.ts가 모든 칸에 영어가 있는지 본다). 한국어는 예전 글자 그대로다.
// 이 파일은 타입만 가져온다(시험이 그대로 읽는다). 고르는 일은 부르는 쪽이 lang으로 한다.
import type { Door } from '@/content/rooms';
import type { ChatReason } from '@/lib/social';
import type { GoWhy } from './social/go-to-person';

export type Lang = 'ko' | 'en';
/** [한국어, 영어] */
export type Pair = readonly [ko: string, en: string];
/** 지금 말로 고른다 */
export const pick = (p: Pair, lang: Lang): string => (lang === 'en' ? p[1] : p[0]);

// ───────── 사진 알림(WalkShot)
/** 갤러리에 올리지 못해 이 기기로 돌렸을 때 앞에 붙는 말 */
export const SHOT_MISS: Pair = ['갤러리에 올리지 못했어요', 'Couldn’t upload to the gallery'];
// 내려받기와 길게 누르기는 저장됐는지 화면이 알 수 없다: 「내려받았어요」라고 하지 않고 한 일만 말한다
export const SHOT_TEXT: Readonly<Record<'saving' | 'saved' | 'downloaded' | 'full' | 'failed' | 'error' | 'tap' | 'hold', Pair>> = {
  saving: ['내 갤러리에 담는 중이에요', 'Saving to My gallery'],
  saved: ['내 갤러리에 담았어요', 'Saved to My gallery'],
  downloaded: ['사진 내려받기를 시작했어요', 'Started downloading the photo'],
  full: ['갤러리가 가득 찼어요(60장). 오래된 사진부터 지우고 다시 찍어 주세요', 'Your gallery is full (60 photos). Delete some older photos and take it again'],
  failed: ['지금은 사진을 찍지 못했어요. 잠시 뒤에 다시 해 주세요', 'Couldn’t take a photo just now. Please try again in a moment'],
  error: SHOT_MISS,
  tap: ['사진을 찍었어요. 「사진 저장」을 눌러 주세요', 'Photo taken. Tap “Save photo”'],
  hold: ['사진을 길게 눌러 저장해 주세요', 'Press and hold the photo to save it'],
};

// ───────── 휴대폰 도움말(HelpPanel)
/** 휴대폰 조작 줄. 넷째 줄은 두 스틱 사이 아래의 앉기 단추(점프 옆)도 알려 준다 */
export const TOUCH_HELP: readonly Pair[] = [
  [
    '왼쪽 동그라미로 걸어요. 옆으로만 밀면 그 자리에서 돌고, 비스듬히 밀면 돌면서 걸어요(3인칭에서는 민 쪽으로 걷고 화면이 천천히 따라 돌아요). 끝까지 밀면 달려요.',
    'Walk with the left circle. Push it straight sideways to turn in place, or at an angle to turn as you walk (in third person you walk the way you push and the view slowly follows). Push it all the way to run.',
  ],
  ['오른쪽 동그라미로 둘러봐요. 두 동그라미는 같이 쓸 수 있어요.', 'Look around with the right circle. You can use both circles at once.'],
  [
    '화면을 끌어도 둘러볼 수 있어요. 3인칭에서는 두 손가락을 벌리고 오므려 거리를 바꿔요.',
    'You can also drag the screen to look around. In third person, pinch with two fingers to move closer or back.',
  ],
  [
    '아래 가운데 화살표 단추로 뛰어요. 그 옆 앉은 사람 단추로 앉고, 다시 누르거나 걸으면 일어서요. 방이나 물건 가까이 가면 그 옆에 「살피기」 단추가 떠요.',
    'The arrow button at the bottom middle makes you jump. The sitting person button next to it sits you down; tap it again or walk to stand up. Near a room or an object, a “Look closer” button appears beside them.',
  ],
  ['오른쪽 위 지도를 누르면 1층과 2층 지도가 크게 열려요.', 'Tap the map at the top right to open a big map of 1F and 2F.'],
  [
    '방 문 가까이에서는 가운데 단추가 「들어가기」, 방의 나가는 문에서는 「나가기」로 바뀌어요. 누르면 바로 옮겨 가요.',
    'Near a room door the middle button turns into “Enter”, and at a room’s exit into “Leave”. Tap it to go right through.',
  ],
  [
    '위 줄의 「메뉴」에 길 찾기, 포털 바로 가기, 캐릭터 꾸미기, 시점, 설정이 있어요. 사진기 단추로 지금 화면을 찍어요.',
    '“Menu” in the top row has Find the way, Portals, your character, the view and settings. The camera button takes a photo of the screen.',
  ],
];
export const TOUCH_TOGETHER: Pair = [
  '오른쪽 말풍선 단추로 말을 걸어요. 같은 곳에 있는 분들 머리 위에 떠요. 메뉴의 「대화」에서 지금까지 오간 말을, 「접속자」에서 들어와 있는 사람을 봐요. 말이 화면을 가리면 말 기록 위 「말 숨기기」로 말 기록과 말풍선을 감춰요(그동안 온 말 수가 단추에 떠요).',
  'Tap the speech bubble button on the right to say something. It floats over your head for people in the same place. In the menu, “Chat” shows everything said so far and “People here” shows who is here. If words cover the screen, “Hide chat” above the chat log hides the log and the bubbles (the button counts what comes in meanwhile).',
];
export const TOUCH_FULLSCREEN: Pair = [
  '위 줄 맨 오른쪽의 네 귀퉁이 단추를 누르면 주소창 없이 화면을 가득 채워요. 한 번 더 누르면 돌아와요.',
  'The four corners button at the right end of the top row fills the screen without the address bar. Tap it again to go back.',
];
export const TOUCH_NO_FULLSCREEN: Pair = [
  '전체 화면은 이 브라우저에서 열 수 없어요(아이폰 사파리와 일부 앱 안 브라우저).',
  'This browser can’t open full screen (Safari on iPhone and some in-app browsers).',
];

/** 도움말 맨 아래 한 줄: 방 안, 실제 집(갤러리 액자가 걸렸으면 그 이야기), 그림 집 */
export function helpFoot(o: { room: boolean; real: boolean; gallery: boolean; coarse: boolean }, lang: Lang): string {
  const en = lang === 'en';
  if (o.room) {
    return en
      ? 'Press E at the exit (on phones, “Leave”) or choose “Leave room” in the menu to go back to the door you came in by.'
      : '나가는 문 앞에서 E(휴대폰은 「나가기」)나 메뉴의 「방에서 나가기」로 들어온 문 앞에 돌아가요.';
  }
  if (o.real) {
    if (en) {
      return `This is the house at its real size. Family rooms keep their doors closed.${o.gallery ? ` In front of a frame on the kitchen wall, ${o.coarse ? 'tap “Enlarge”' : 'press E'} to see the picture large.` : ''}`;
    }
    return `실제 집 크기 그대로예요. 가족 방은 문이 닫혀 있어요.${o.gallery ? ` 부엌 벽의 액자 앞에서는 ${o.coarse ? '「크게 보기」' : 'E'}로 그림을 크게 봐요.` : ''}`;
  }
  return en
    ? 'The stairs are in the hall next to the entrance. This drawn house was rebuilt to be fun to walk, so it differs from the real floor plan.'
    : '계단은 현관 옆 홀에 있어요. 그림 속 집은 놀기 좋게 다시 지은 집이라 실제 도면과 달라요.';
}

// ───────── 메뉴(WalkMenu)
export type MenuTextId = 'view1' | 'view3' | 'look' | 'chat' | 'people' | 'shot' | 'games' | 'guestbook' | 'gallery' | 'map' | 'way' | 'portal' | 'help';
export const MENU_TEXT: Readonly<Record<MenuTextId, Pair>> = {
  view1: ['시점: 1인칭 (3인칭으로 바꾸기)', 'View: first person (switch to third)'],
  view3: ['시점: 3인칭 (1인칭으로 바꾸기)', 'View: third person (switch to first)'],
  look: ['캐릭터 꾸미기', 'Dress up my character'],
  chat: ['대화', 'Chat'],
  people: ['접속자', 'People here'],
  shot: ['사진 찍기', 'Take a photo'],
  games: ['작은 놀이 모음', 'Mini games'],
  guestbook: ['방명록·쪽지', 'Guestbook and notes'],
  gallery: ['내 갤러리', 'My gallery'],
  map: ['지도', 'Map'],
  way: ['길 찾기', 'Find the way'],
  portal: ['포털 바로 가기', 'Portals'],
  help: ['조작법', 'Controls'],
};

// ───────── 살피기 패널(HotspotPanel)
/** 문패(rooms.ts의 DOOR_LABEL)의 영어. 한국어는 DOOR_LABEL 그대로 쓴다. 다른 화면의 문패와 같은 말(쉬는 중 = On a break) */
export const DOOR_EN: Readonly<Record<Door, string>> = {
  open: 'Open',
  resting: 'On a break',
  family: 'Family only',
  closed: 'Always closed',
};

/**
 * 놀이 이름과 한 줄 설명의 영어(놀이 목록 src/games/registry.ts의 id). 한국어는 목록 그대로 쓴다.
 * 이름은 장소 이름 표(src/lib/place-names.ts)와 같은 말을 쓴다(「Jam under the gable」처럼 문패와 맞게)
 */
export const GAME_EN: Readonly<Record<string, { title: string; blurb: string }>> = {
  poetry: { title: 'Find the poet', blurb: 'Read a verse and choose its poet from four seals. After six questions, receive a sentence for today.' },
  calligraphy: { title: 'Trace a constant heart', blurb: 'Trace 恒常心 on the writing desk and finish with your own seal.' },
  watercolor: { title: 'Watercolors by the window', blurb: 'Layer watercolor washes on the living-room easel and download your painting.' },
  jam: { title: 'Jam under the gable', blurb: 'Listen to four beats and play them back. Clear three rounds to add two bars to today’s song.' },
  sword: { title: 'The Sword Continent', blurb: 'Battle across five kingdoms and 26 stages, level up with candies, earn the golden flute after 50 monsters and summon the King Dragon Overlord in 3D. 11 hero skins and 2P co-op included.' },
  shelf: { title: 'Favorite things shelf', blurb: 'Pick your favorite things and put them on the shelf to make it your own.' },
  target: { title: 'Paper ball target', blurb: 'Throw paper balls at the targets that pop up. How many can you hit in 60 seconds?' },
  brain: { title: 'Mind map quiz', blurb: 'Put each word in the right knowledge drawer, then put the steps of a growing thought in order.' },
  sentences: {
    title: 'Hang a sentence',
    blurb: 'Copy out a good sentence you came across lately, with its source, and hang it on the wall. Read the hung sentences one at a time, too.',
  },
  who: { title: 'Whose sentence is it?', blurb: 'Read the sentence that comes up on the stage and pick the doll of the person in this house who said it.' },
  groove: { title: 'Jazz rhythm studio', blurb: 'A rhythm game where you find the swing pocket by ear: trio claps, bebop brass calls, 5/4 clave and an all-star remix.' },
  pitch: {
    title: 'Jazz ear training · Intervals & harmony',
    blurb: 'Take on the keyboard: find intervals by relative pitch, tell Maj9 from 7alt tension voicings, and write down three-note bebop licks.',
  },
};

// ───────── 가까운 자리 이름(PlaceText)
/**
 * 갤러리 액자 앞 자리의 이름 가운데 화면 말(엔진이 그림 제목이 없을 때 붙인다: walk/gallery-scene.ts의 「곧 전시해요」·「액자」).
 * 그림 제목(사람이 쓴 글)은 옮기지 않는다
 */
export const FRAME_EN: Readonly<Record<string, string>> = { '곧 전시해요': 'Coming soon', 액자: 'Frame' };

// ───────── 대화창(ChatPanel)
/** 보내지 못한 까닭의 영어(서버가 준 까닭 코드로 고른다. 한국어 화면은 받은 글 그대로) */
export function chatReasonEn(reason: ChatReason, n: { body: number; mentions: number; minute: number }): string {
  const table: Record<ChatReason, string> = {
    empty: 'Please write something first.',
    too_long: `You can write up to ${n.body} characters.`,
    too_many_mentions: `You can mention up to ${n.mentions} people.`,
    bad_space: 'Couldn’t send it. Please try again.',
    bad_via: 'Couldn’t send it. Please try again.',
    too_fast: 'Please slow down a little.',
    too_many: `You can send up to ${n.minute} messages a minute. Please try again in a moment.`,
    not_guest: 'Only invited guests can chat.',
    no_subject: 'Chat is getting ready. Please try again in a moment.',
    not_ready: 'Chat is getting ready. Please try again in a moment.',
    error: 'Couldn’t send it. Please try again.',
  };
  return table[reason];
}

// 앱 안 브라우저 안내(WalkInApp)의 앱 이름과 단추 글은 lib/inapp.ts의 INAPP_NAME_EN, escapeLabel(kind, ua, lang)을 쓴다

// ───────── 접속자 목록의 「걸어가기」·「바로 가기」를 못 쓰는 까닭(social/go-to-person.ts의 GoWhy)
export const GO_WHY: Readonly<Record<GoWhy, Pair>> = {
  away: ['다른 곳에 있어요', 'In another place'],
  unseen: ['아직 어디 있는지 몰라요', 'Can’t see where they are yet'],
  twin: ['같은 이름이 여럿이라 찾지 못해요', 'Several people have this name'],
  nospot: ['옆에 빈자리가 없어요', 'No free spot next to them'],
  wait: ['길 찾기를 준비하는 중이에요', 'Getting paths ready'],
};

// ───────── 수 세기(영어의 한 명·여러 명)
/** 「1 person」, 「2 people」 */
export const peopleEn = (n: number): string => (n === 1 ? '1 person' : `${n} people`);
/** 「1 new message」, 「3 new messages」 */
export const newMessagesEn = (n: number): string => (n === 1 ? '1 new message' : `${n} new messages`);
