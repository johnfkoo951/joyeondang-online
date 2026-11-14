// 머리줄 메뉴와 빠른 이동 팔레트의 말(한국어와 영어를 나란히). 화면 코드(NavLinks, MobileMenuDrawer, Shortcuts)는 여기서 골라 그린다.
// 다른 모듈을 가져오지 않아 시험(tests/unit/i18n-entry.test.ts)이 바로 부른다. 한국어는 예전 글 그대로다.

export type NavLink = { href: string; label: string; en: string; key: string };
export type NavMoreLink = NavLink & { desc: string; descEn: string };

export const PRIMARY_LINKS: readonly NavLink[] = [
  { href: '/walk', label: '집 안 걷기', en: 'Walk', key: 'G' },
  { href: '/map', label: '도장 투어', en: 'Stamp tour', key: 'M' },
  { href: '/games', label: '작은 놀이', en: 'Mini games', key: 'P' },
  { href: '/guestbook', label: '방명록', en: 'Guestbook', key: 'B' },
  { href: '/exhibit', label: '전시', en: 'Exhibit', key: 'E' },
];

export const MORE_LINKS: readonly NavMoreLink[] = [
  { href: '/gallery', label: '갤러리 · 화보', en: 'Gallery and lookbook', desc: '콜라주 화보와 내 걷기 사진', descEn: 'Collage lookbook and my walk photos', key: 'L' },
  { href: '/avatar', label: '내 캐릭터 꾸미기', en: 'Dress up my character', desc: '3D 인형 옷장과 AI 아바타', descEn: '3D doll wardrobe and AI avatar', key: 'C' },
  { href: '/notebook', label: '내 수첩', en: 'My notebook', desc: '모은 도장 인장첩과 초대 코드', descEn: 'Your stamp book and invite code', key: 'N' },
];

/** 빠른 이동 팔레트 한 줄. subEn이 비면 영어 화면에서 설명 줄을 비운다(옮긴 말이 없는 집 데이터) */
export type PaletteWords = {
  id: string;
  href: string;
  hint?: string;
  group: string;
  groupEn: string;
  title: string;
  titleEn: string;
  sub: string;
  subEn: string;
};

const MAIN = ['주요 화면', 'Main pages'] as const;
const VIEW = ['화면 설정', 'Display'] as const;
const ACCOUNT = ['계정과 관리', 'Account and admin'] as const;

function row(id: string, href: string, [group, groupEn]: readonly [string, string], title: string, titleEn: string, sub: string, subEn: string, hint?: string): PaletteWords {
  return { id, href, group, groupEn, title, titleEn, sub, subEn, ...(hint ? { hint } : {}) };
}

export const PALETTE_BASE: readonly PaletteWords[] = [
  row('home', '/', MAIN, '첫 화면 (대문)', 'Home (front gate)', '조연당 온라인 환영 표지와 전체 안내', 'The Joyeondang Online welcome cover and guide', '1 · H'),
  row('map', '/map', MAIN, '도장 투어 일러스트 맵', 'Stamp tour map', '열세 곳을 다녀오며 전각 인장 찍기', 'Visit 13 spots and collect carved seals', '2 · M'),
  row('walk', '/walk', MAIN, '3D 집 안 걷기', 'Walk the house in 3D', '마당과 1층, 2층을 캐릭터로 직접 산책', 'Stroll the yard, 1F and 2F as your character', '3 · G'),
  row('games', '/games', MAIN, '작은 놀이 12가지', '12 mini games', '리듬 잼, 종이공 과녁, 문장 맞히기 웹 아케이드', 'A web arcade: rhythm jam, paper ball target, guess the sentence', '4 · P'),
  row('guestbook', '/guestbook', MAIN, '방명록과 쪽지 스튜디오', 'Guestbook and note studio', '축하 인사, 소나무 소원, 서재 문장 쓰고 읽기', 'Write and read greetings, pine tree wishes and study sentences', '5 · B'),
  row('gallery', '/gallery', MAIN, '갤러리와 그림 화보', 'Gallery and picture lookbook', '내가 찍은 걷기 사진과 조연당 공간 화보', 'Photos from your walks and a lookbook of Joyeondang', '6 · L'),
  row('avatar', '/avatar', MAIN, '내 캐릭터 꾸미기', 'Dress up my character', '3D 인형 옷장 조합 및 AI 사진·3D 캐릭터', '3D doll wardrobe, AI photo and 3D characters', '7 · C'),
  row('exhibit', '/exhibit', MAIN, '온라인 전시 일곱 칸', 'Online exhibit in seven parts', '조연당과 다섯 사람 이야기 읽기', 'Read about Joyeondang and five people', '8 · E'),
  row('notebook', '/notebook', MAIN, '내 수첩', 'My notebook', '모은 도장 인장첩, 이름표, 초대 코드 입력', 'Your stamp book, name tag and invite code', '9 · N'),
  row('theme-light', '#theme:light', VIEW, '라이트 모드로 보기', 'Light mode', '따뜻한 한지 도화지 밝은 테마', 'Warm paper, bright theme'),
  row('theme-dark', '#theme:dark', VIEW, '다크 모드로 보기', 'Dark mode', '차분한 밤 조명 어두운 테마', 'Calm night lights, dark theme'),
  row('login', '/login', ACCOUNT, '로그인 / 로그아웃', 'Sign in / Sign out', '구글 계정 로그인과 초대 코드 입력', 'Google sign-in and invite code'),
  row('admin-hub', '/admin', ACCOUNT, '관리실 운영 허브', 'Admin hub', '전체 현황과 빠른 승인함 (집주인 전용)', 'Overview and quick approvals (host only)'),
  row('admin-members', '/admin/members', ACCOUNT, '멤버 · 초대 관리실', 'Members and invitations', '명단 검색, 일괄 등록, 역할·회차·메모 수정 (집주인 전용)', 'Search the guest list, add in bulk, edit roles, rounds and memos (host only)'),
  row('admin-records', '/admin/records', ACCOUNT, '방명록 · 쪽지 관리실', 'Guestbook and notes admin', '전체 글 검색, 범위 변경, 숨김·재게시 (집주인 전용)', 'Search all posts, change scope, hide or repost (host only)'),
  row('admin-rooms', '/admin/rooms', ACCOUNT, '공간 · 조용 모드 · QR 운영실', 'Rooms, quiet time and QR', '17곳 문패, 조용 모드, 현장 QR 카드 (집주인 전용)', '17 door signs, quiet time and on-site QR cards (host only)'),
];

/** 팔레트에서 바로 여는 작은 놀이와 도장 투어의 묶음 이름 */
export const PALETTE_GAMES_GROUP = ['작은 놀이 바로 시작', 'Start a mini game'] as const;
export const PALETTE_SPOTS_GROUP = ['도장 투어 13곳', 'Stamp tour: 13 spots'] as const;

/** ? 단축키 안내의 줄: 누르는 키(그대로)와 설명 */
export type HelpRow = { keys: readonly string[]; or?: boolean; ko: string; en: string };
export const HELP_ROWS: readonly HelpRow[] = [
  { keys: ['/', '⌘K'], or: true, ko: '빠른 검색·이동 팔레트', en: 'Quick search and jump' },
  { keys: ['1', 'H'], ko: '첫 화면 (대문)', en: 'Home (front gate)' },
  { keys: ['2', 'M'], ko: '도장 투어 일러스트 맵', en: 'Stamp tour map' },
  { keys: ['3', 'G'], ko: '3D 집 안 걷기', en: 'Walk the house in 3D' },
  { keys: ['4', 'P'], ko: '작은 놀이 12종', en: '12 mini games' },
  { keys: ['5', 'B'], ko: '방명록·쪽지 스튜디오', en: 'Guestbook and note studio' },
  { keys: ['6', 'L'], ko: '갤러리·화보', en: 'Gallery and lookbook' },
  { keys: ['7', 'C'], ko: '내 캐릭터 꾸미기', en: 'Dress up my character' },
  { keys: ['8', 'E'], ko: '온라인 전시', en: 'Online exhibit' },
  { keys: ['9', 'N'], ko: '내 수첩', en: 'My notebook' },
  { keys: ['T'], ko: '라이트 · 다크 테마 전환', en: 'Switch light or dark theme' },
  { keys: ['?'], ko: '이 도움말 열기', en: 'Open this help' },
  { keys: ['Esc'], ko: '열린 창 닫기', en: 'Close the open window' },
];
