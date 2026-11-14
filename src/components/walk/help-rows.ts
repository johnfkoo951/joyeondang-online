// 조작법(도움말) 데스크탑 줄. 단축키 표(shortcuts.ts)의 모든 항목을 한 번씩 보인다(tests/unit/walk-shortcuts.test.ts가 본다).
// 키 글자와 이름은 표에서 읽고, 여기에는 보이는 차례와 설명만 둔다. 설명은 한국어와 영어를 함께 둔다(키 글자는 두 말 모두 같다).
import { SHORTCUTS, shortcutLabel, type ShortcutId } from './shortcuts';

/** 도움말에 보이는 차례. 표의 항목이 빠지거나 두 번 나오면 시험이 잡는다 */
export const HELP_ORDER: readonly ShortcutId[] = [
  'run', 'jump', 'sit', 'act', 'talk', 'map', 'way', 'portal', 'view', 'fullscreen', 'character', 'chat', 'people', 'shot', 'menu', 'help',
];

/** [한국어, 영어] */
type Pair = readonly [ko: string, en: string];

const TEXT: Readonly<Record<ShortcutId, Pair>> = {
  run: ['누른 채 걸으면 달려요.', 'Hold it while you walk to run.'],
  jump: ['걸으면서 뛰어도 돼요.', 'You can jump while walking, too.'],
  sit: [
    'Ctrl만 눌렀다 떼면 그 자리에 앉아요. 다시 누르거나 걸으면 일어서요. 함께 있는 분들에게도 앉은 모습으로 보여요.',
    'Press and let go of Ctrl alone to sit down where you are. Press it again or walk to stand up. Others here see you sitting, too.',
  ],
  act: [
    '가까운 곳 쓰기. 열린 방 문이면 바로 들어가고, 방의 나가는 문이면 바로 나가요. 갤러리 액자 앞이면 그림을 크게 봐요. 놀이 자리와 물건은 살피기 창이 떠요(Enter도 돼요).',
    'Use what is near you. At an open room door you go right in, and at a room’s exit you go right out. In front of a gallery frame you see the picture large. Game spots and objects open a “Look closer” card (Enter works too).',
  ],
  talk: [
    '같은 곳에 있는 분들 머리 위에 말풍선이 떠요. 가까이 살필 것이 없을 때 입력칸이 열리고, 적고 Enter로 보내요. 말 기록 아래 「말 숨기기」로 말 기록과 말풍선을 감춰요.',
    'Your words float in a bubble over your head for people in the same place. The box opens when nothing nearby needs a closer look; type and press Enter to send. “Hide chat” under the chat log hides the log and the bubbles.',
  ],
  map: ['1층과 2층이 함께 나오고 지금 층만 색이 들어와요.', 'Shows 1F and 2F together. Only the floor you are on is in color.'],
  way: [
    '가고 싶은 곳을 고르면 걸어서 데려다주거나 그 앞으로 바로 옮겨 줘요.',
    'Pick where you want to go, and you are walked there or moved right in front of it.',
  ],
  portal: [
    '걷지 않고 열린 방으로 바로 옮겨 가요. 목록 앞의 숫자키로 골라요.',
    'Go straight into an open room without walking. Pick one with the number keys shown in the list.',
  ],
  view: [
    '눈높이(1인칭)와 인형 뒤(3인칭). 3인칭에서는 휠로 당겨 보고 물러나 봐요.',
    'Eye level (first person) or behind your doll (third person). In third person, use the wheel to move closer or back.',
  ],
  fullscreen: [
    '주소창과 탭 없이 화면을 가득 채워요. 한 번 더 누르거나 Esc로 돌아와요.',
    'Fill the screen without the address bar and tabs. Press it again or Esc to go back.',
  ],
  character: ['머리, 옷, 소품을 고르거나 사진 캐릭터로 바꿔요.', 'Choose hair, clothes and props, or switch to a photo character.'],
  chat: ['지금까지 오간 말을 모두 보고 글을 남겨요. @로 사람을 불러요.', 'See everything said so far and leave a message. Use @ to mention someone.'],
  people: ['지금 들어와 있는 사람과 있는 곳을 봐요.', 'See who is here now and where they are.'],
  shot: [
    '지금 화면을 찍어요. 로그인했으면 내 갤러리에 담기고, 아니면 이 기기에 내려받아요.',
    'Take a photo of the screen. If you are signed in, it goes to My gallery. If not, it downloads to this device.',
  ],
  menu: [
    '열린 창 닫기. 아무것도 없으면 메뉴(설정)를 열어요. 전체 화면이거나 마우스가 잠겨 있으면 그것부터 풀려요.',
    'Close the open window. If nothing is open, it opens the menu (settings). In full screen or with the mouse locked, it lets go of that first.',
  ],
  help: ['이 안내 열고 닫기.', 'Open and close this guide.'],
};

/** 표 밖의 조작(마우스, 방향키 둘러보기, 걷기). key도 낱말이면(마우스) 영어 이름을 둔다 */
const MOVES: ReadonlyArray<{ key: Pair; label: Pair; text: Pair }> = [
  {
    key: ['마우스', 'Mouse'],
    label: ['둘러보기', 'Look around'],
    text: [
      '움직이면 바로 둘러봐요. 화면을 한 번 누르면 화면 끝 없이 돌아요(Esc로 풀기). 1인칭에서는 휠이나 트랙패드로 위아래를 봐요.',
      'Move it to look around. Click the screen once to turn without stopping at the edge (Esc lets go). In first person, use the wheel or trackpad to look up and down.',
    ],
  },
  {
    key: ['← → ↑ ↓', '← → ↑ ↓'],
    label: ['둘러보기', 'Look around'],
    text: [
      '←→로 제자리에서 돌고 ↑↓로 위아래를 봐요. 잠깐 누르면 조금, 누르고 있으면 빨라져요.',
      '← → turn in place and ↑ ↓ look up and down. A quick press turns a little; holding it turns faster.',
    ],
  },
  { key: ['W A S D', 'W A S D'], label: ['걷기', 'Walk'], text: ['W와 S는 앞뒤, A와 D는 옆걸음.', 'W and S go forward and back, A and D step sideways.'] },
];

/** 함께 걷기(초대 손님)에서만 쓰는 항목: 아닐 때는 흐리게 「초대 손님」을 붙인다 */
const TOGETHER: ReadonlySet<ShortcutId> = new Set(['talk', 'chat', 'people']);

/** id: 단축키 표의 항목(표 밖의 조작 줄에는 없다). 브라우저가 못 하는 항목(전체 화면)을 도움말이 흐리게 할 때 쓴다 */
export type HelpRow = { key: string; label: string; text: string; together?: boolean; id?: ShortcutId };

const pick = (p: Pair, lang: 'ko' | 'en') => (lang === 'en' ? p[1] : p[0]);

/** 데스크탑 도움말: 마우스와 걷기(표 밖의 조작), 그다음 단축키 표 전체. lang을 주지 않으면 한국어 */
export function deskHelpRows(lang: 'ko' | 'en' = 'ko'): HelpRow[] {
  return [
    ...MOVES.map((m): HelpRow => ({ key: pick(m.key, lang), label: pick(m.label, lang), text: pick(m.text, lang) })),
    ...HELP_ORDER.map((id): HelpRow => ({
      id,
      key: SHORTCUTS[id].key,
      label: shortcutLabel(id, lang),
      text: pick(TEXT[id], lang),
      ...(TOGETHER.has(id) ? { together: true } : {}),
    })),
  ];
}
