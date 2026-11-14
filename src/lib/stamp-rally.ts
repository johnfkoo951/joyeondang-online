// 조연당 도장 투어 맵: 13곳의 열린 공간 좌표(가로·세로 일러스트), 구역별 전각 인장 모양, 다녀옴·도장 상태 계산.
// 공개 빌드에 들어가므로 치수·방위·실명·도면 ID를 쓰지 않고 rooms.ts의 공개 slug만 가리킨다.
// 화면이 영어일 때: 지점 이름은 장소 이름 표(lib/place-names), 짧은 이름·소개·할 일·놀이 이름은 지점마다 둔 en을 쓴다.
import { STAMPED_KEY, type StoreLike } from '@/components/walk/memory';
import { placeName } from '@/lib/place-names';

export type RallyZone = 'yard' | 'first' | 'second';
export type SealShape = 'rounded' | 'square' | 'circle';
export type SealMotif =
  | 'arch'
  | 'easel'
  | 'pine'
  | 'lantern'
  | 'shoes'
  | 'stage'
  | 'quotes'
  | 'cushion'
  | 'jazz'
  | 'blocks'
  | 'target'
  | 'books'
  | 'wrench';

export type StampSpot = {
  slug: string;
  order: number;
  zone: RallyZone;
  name: string;
  shortName: string;
  charm: string;
  quest: string;
  /** 가로형 일러스트(16:9) 위 백분율 좌표 */
  lx: number;
  ly: number;
  /** 세로형 일러스트(9:16) 위 백분율 좌표 */
  px: number;
  py: number;
  sealShape: SealShape;
  motif: SealMotif;
  /** 도장이 찍힐 때 자연스러운 기울기(도) */
  rot: number;
  gameId?: string;
  gameTitle?: string;
  acceptsNote?: boolean;
  portal?: boolean;
  /** 화면이 영어일 때의 짧은 이름(인장·핀), 소개, 할 일, 놀이 이름 */
  en: { short: string; charm: string; quest: string; game?: string };
};

export const RALLY_ZONES: { id: RallyZone; label: string; desc: string; shape: SealShape; en: { label: string; desc: string } }[] = [
  { id: 'yard', label: '마당', desc: '세 아치 포치부터 석등까지 산책하는 길', shape: 'rounded', en: { label: 'Yard', desc: 'A stroll from the three-arch porch to the stone lantern' } },
  { id: 'first', label: '1층', desc: '차와 음악, 대화와 문장이 머무는 거실과 방', shape: 'square', en: { label: '1F', desc: 'A living room and rooms full of tea, music, talk, and sentences' } },
  { id: 'second', label: '2층', desc: '박공지붕 아래 재즈와 다섯 가지 작은 놀이방', shape: 'circle', en: { label: '2F', desc: 'Jazz and five little playrooms under the gabled roof' } },
];

type Lang = 'ko' | 'en';

/** 지점 이름(지금 말). 영어는 장소 이름 표를 따른다 */
export function spotName(lang: Lang, spot: Pick<StampSpot, 'name'>): string {
  return placeName(lang, spot.name);
}

/** 인장과 핀에 쓰는 짧은 이름(지금 말) */
export function spotShort(lang: Lang, spot: Pick<StampSpot, 'shortName' | 'en'>): string {
  return lang === 'en' ? spot.en.short : spot.shortName;
}

/** 지점 소개와 할 일(지금 말) */
export function spotCharm(lang: Lang, spot: Pick<StampSpot, 'charm' | 'en'>): string {
  return lang === 'en' ? spot.en.charm : spot.charm;
}
export function spotQuest(lang: Lang, spot: Pick<StampSpot, 'quest' | 'en'>): string {
  return lang === 'en' ? spot.en.quest : spot.quest;
}

/** 지점 놀이 이름(지금 말, 놀이가 없으면 '') */
export function spotGame(lang: Lang, spot: Pick<StampSpot, 'gameTitle' | 'en'>): string {
  return (lang === 'en' ? spot.en.game : spot.gameTitle) ?? spot.gameTitle ?? '';
}

/** 구역 이름(지금 말) */
export function zoneLabel(lang: Lang, zone: RallyZone): string {
  const z = RALLY_ZONES.find((r) => r.id === zone);
  if (!z) return '';
  return lang === 'en' ? z.en.label : z.label;
}

export const VISITED_KEY = 'jy.visit.v1';

export const STAMP_SPOTS: StampSpot[] = [
  {
    slug: 'porch',
    order: 1,
    zone: 'yard',
    name: '세 아치 포치',
    shortName: '아치 포치',
    charm: '따뜻한 등불이 켜진 세 개의 아치 아래로 조연당 산책이 시작돼요.',
    quest: '포치를 둘러보거나 오늘 가져온 마음을 한 줄 남기면 도장을 찍을 수 있어요.',
    lx: 14.5,
    ly: 84,
    px: 50,
    py: 89,
    sealShape: 'rounded',
    motif: 'arch',
    rot: -6,
    acceptsNote: true,
    en: {
      short: 'Arch porch',
      charm: 'Your stroll through Joyeondang begins under three arches with warm lanterns.',
      quest: 'Look around the porch or leave a line about what you brought today, and you can get the stamp.',
    },
  },
  {
    slug: 'photozone',
    order: 2,
    zone: 'yard',
    name: '포토존',
    shortName: '포토존',
    charm: '꽃밭 사이 이젤 앞에서 오늘의 기념 사진을 남기는 자리예요.',
    quest: '포토존을 다녀오거나 사진 쪽지를 남긴 뒤 도장을 찍어 보세요.',
    lx: 14,
    ly: 55,
    px: 17.5,
    py: 89,
    sealShape: 'rounded',
    motif: 'easel',
    rot: 5,
    acceptsNote: true,
    en: {
      short: 'Photo',
      charm: 'Stand by the easel among the flowers and take a photo to remember today.',
      quest: 'Visit the photo spot or leave a photo note, then get your stamp.',
    },
  },
  {
    slug: 'pine',
    order: 3,
    zone: 'yard',
    name: '앞마당 소나무',
    shortName: '소나무',
    charm: '가지마다 손님들의 다정한 소원과 약속 쪽지가 매달리는 소나무예요.',
    quest: '걸린 쪽지를 읽어 보거나 새 소원을 걸고 소나무 도장을 받아 보세요.',
    lx: 13,
    ly: 22,
    px: 19,
    py: 73,
    sealShape: 'rounded',
    motif: 'pine',
    rot: -4,
    acceptsNote: true,
    en: {
      short: 'Pine tree',
      charm: 'A pine tree whose branches hold the kind wishes and promises guests leave on notes.',
      quest: 'Read the notes hanging there or hang a new wish, and get the pine tree stamp.',
    },
  },
  {
    slug: 'lantern',
    order: 4,
    zone: 'yard',
    name: '석등',
    shortName: '석등',
    charm: '남겨 주신 쪽지가 늘어날수록 마당의 돌등 불빛이 더 환해져요.',
    quest: '석등 불빛을 살피고 마당 네 번째 도장을 완성해 보세요.',
    lx: 23.5,
    ly: 54,
    px: 85,
    py: 83,
    sealShape: 'rounded',
    motif: 'lantern',
    rot: 4,
    en: {
      short: 'Lantern',
      charm: 'The more notes you leave, the brighter the stone lantern in the yard glows.',
      quest: 'Check the lantern light and complete the fourth stamp in the yard.',
    },
  },
  {
    slug: 'entrance',
    order: 5,
    zone: 'first',
    name: '현관',
    shortName: '현관',
    charm: '신발을 가지런히 벗고 집 안으로 첫발을 들이는 따뜻한 나무 현관이에요.',
    quest: '현관 문을 열어 집 안으로 들어선 뒤 도장을 찍어 보세요.',
    lx: 46.5,
    ly: 83,
    px: 15,
    py: 53,
    sealShape: 'square',
    motif: 'shoes',
    rot: -5,
    en: {
      short: 'Entrance',
      charm: 'A warm wooden entrance where you take off your shoes and take your first step inside.',
      quest: 'Open the front door, step inside, and get your stamp.',
    },
  },
  {
    slug: 'living',
    order: 6,
    zone: 'first',
    name: '1층 거실',
    shortName: '1층 거실',
    charm: '다섯 사람의 작은 무대와 방명록이 놓인 조연당의 중심 거실이에요.',
    quest: '방명록에 인사를 남기거나 「누구의 문장일까」 놀이를 즐기고 도장을 찍어요.',
    lx: 46.5,
    ly: 54,
    px: 41,
    py: 58,
    sealShape: 'square',
    motif: 'stage',
    rot: 6,
    gameId: 'who',
    gameTitle: '누구의 문장일까',
    acceptsNote: true,
    en: {
      short: '1F Living room',
      charm: 'The heart of Joyeondang, with a little stage for the five people and the guestbook.',
      quest: 'Leave a hello in the guestbook or play “Whose sentence is it?”, then get your stamp.',
      game: 'Whose sentence is it?',
    },
  },
  {
    slug: 'study',
    order: 7,
    zone: 'first',
    name: '글과 빛이 드는 곳',
    shortName: '빛 드는 서재',
    charm: '창가 줄에 좋아하는 문장 카드를 집게로 걸어 두는 밝은 서재예요.',
    quest: '「문장 걸어 두기」 놀이를 하거나 걸린 문장을 읽고 도장을 찍어요.',
    lx: 41,
    ly: 24,
    px: 65,
    py: 49,
    sealShape: 'square',
    motif: 'quotes',
    rot: -7,
    gameId: 'sentences',
    gameTitle: '문장 걸어 두기',
    acceptsNote: true,
    portal: true,
    en: {
      short: 'Sunlit study',
      charm: 'A bright study where favorite sentence cards hang from a string by the window.',
      quest: 'Play “Hang a sentence” or read the sentences on the string, then get your stamp.',
      game: 'Hang a sentence',
    },
  },
  {
    slug: 'guest',
    order: 8,
    zone: 'first',
    name: '손님방',
    shortName: '손님방',
    charm: '정돈된 침구와 작은 꽃병, 조용한 책상이 손님을 맞이하는 쉼터예요.',
    quest: '손님방에 들러 잠깐 숨을 고르고 여덟 번째 도장을 받아 보세요.',
    lx: 58,
    ly: 28,
    px: 86,
    py: 56,
    sealShape: 'square',
    motif: 'cushion',
    rot: 3,
    portal: true,
    en: {
      short: 'Guest room',
      charm: 'A quiet retreat with tidy bedding, a small vase, and a calm desk waiting for guests.',
      quest: 'Stop by the guest room, catch your breath, and get the eighth stamp.',
    },
  },
  {
    slug: 'gable',
    order: 9,
    zone: 'second',
    name: '재즈가 흐르는 방',
    shortName: '재즈 방',
    charm: '박공 천장 아래 피아노와 콘트라베이스 선율이 흐르는 음악방이에요.',
    quest: '네 박자 리듬을 받아 치는 「박공 아래 잼」을 즐기면 도장이 찍혀요.',
    lx: 81.5,
    ly: 20,
    px: 22,
    py: 28,
    sealShape: 'circle',
    motif: 'jazz',
    rot: -5,
    gameId: 'jam',
    gameTitle: '박공 아래 잼',
    portal: true,
    en: {
      short: 'Jazz',
      charm: 'A music room where piano and double bass melodies drift under the gabled ceiling.',
      quest: 'Play “Jam under the gable” and tap back four-beat rhythms to get the stamp.',
      game: 'Jam under the gable',
    },
  },
  {
    slug: 'toybox',
    order: 10,
    zone: 'second',
    name: '좋아하는 것 방',
    shortName: '취향 선반 방',
    charm: '작은 텐트와 나무 블록, 아끼는 소품을 선반에 진열하는 놀이방이에요.',
    quest: '「좋아하는 것 선반」을 나만의 취향으로 꾸미고 도장을 받아 보세요.',
    lx: 75.5,
    ly: 43,
    px: 41.5,
    py: 28,
    sealShape: 'circle',
    motif: 'blocks',
    rot: 5,
    gameId: 'shelf',
    gameTitle: '좋아하는 것 선반',
    portal: true,
    en: {
      short: 'Shelf',
      charm: 'A playroom with a little tent, wooden blocks, and shelves for treasured things.',
      quest: 'Arrange the “Favorite things shelf” your own way and get the stamp.',
      game: 'Favorite things shelf',
    },
  },
  {
    slug: 'target',
    order: 11,
    zone: 'second',
    name: '종이공 과녁 방',
    shortName: '종이공 과녁',
    charm: '줄무늬 벽 과녁을 향해 폭신한 종이공을 던지며 웃는 유쾌한 방이에요.',
    quest: '「종이공 과녁」 놀이를 한 판 즐기거나 방을 둘러보고 도장을 찍어요.',
    lx: 92.5,
    ly: 49,
    px: 61,
    py: 26,
    sealShape: 'circle',
    motif: 'target',
    rot: -6,
    gameId: 'target',
    gameTitle: '종이공 과녁',
    portal: true,
    en: {
      short: 'Target',
      charm: 'A cheerful room where you laugh while throwing soft paper balls at targets on a striped wall.',
      quest: 'Play a round of “Paper ball target” or look around the room, then get your stamp.',
      game: 'Paper ball target',
    },
  },
  {
    slug: 'mind',
    order: 12,
    zone: 'second',
    name: '생각 지도 방',
    shortName: '생각 지도 방',
    charm: '책장 가득 꽂힌 책과 색색의 생각 카드가 실로 이어진 서재예요.',
    quest: '「생각 지도 퀴즈」 서랍을 맞추거나 서재를 다녀와 도장을 찍어요.',
    lx: 75,
    ly: 64,
    px: 83,
    py: 27,
    sealShape: 'circle',
    motif: 'books',
    rot: 4,
    gameId: 'brain',
    gameTitle: '생각 지도 퀴즈',
    portal: true,
    en: {
      short: 'Mind map',
      charm: 'A study with full bookshelves and colorful idea cards linked by string.',
      quest: 'Solve the “Mind map quiz” drawers or visit the study, then get your stamp.',
      game: 'Mind map quiz',
    },
  },
  {
    slug: 'garage',
    order: 13,
    zone: 'second',
    name: '작업 차고',
    shortName: '작업 차고',
    charm: '공구 벽과 든든한 나무 작업대, 손때 묻은 소품이 모인 창작 공방이에요.',
    quest: '작업 차고까지 둘러보고 조연당 열세 번째 마지막 도장을 찍어 보세요.',
    lx: 86.5,
    ly: 86,
    px: 49.5,
    py: 14,
    sealShape: 'circle',
    motif: 'wrench',
    rot: -4,
    portal: true,
    en: {
      short: 'Garage',
      charm: 'A maker’s workshop with a tool wall, a sturdy wooden workbench, and well-loved odds and ends.',
      quest: 'Look around the workshop garage and get the thirteenth and last stamp of Joyeondang.',
    },
  },
];

export const SPOT_BY_SLUG = new Map(STAMP_SPOTS.map((s) => [s.slug, s]));
const KNOWN_SLUGS = new Set(STAMP_SPOTS.map((s) => s.slug));

function readSlugList(store: StoreLike | null | undefined, key: string): string[] {
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && KNOWN_SLUGS.has(x));
  } catch {
    return [];
  }
}

/** 이 기기에서 다녀온 방 목록 */
export function readVisited(store: StoreLike | null | undefined): Set<string> {
  return new Set(readSlugList(store, VISITED_KEY));
}

/** 이 기기에서 찍은 도장 목록(체험 도장 및 걷기 기억 공유) */
export function readLocalStamped(store: StoreLike | null | undefined): Set<string> {
  return new Set(readSlugList(store, STAMPED_KEY));
}

/** 방에 다녀왔음을 이 기기에 기록. 처음 기록되면 true */
export function markVisited(store: StoreLike | null | undefined, slug: string): boolean {
  if (!store || !KNOWN_SLUGS.has(slug)) return false;
  try {
    const cur = readSlugList(store, VISITED_KEY);
    if (cur.includes(slug)) return false;
    store.setItem(VISITED_KEY, JSON.stringify([...cur, slug]));
    return true;
  } catch {
    return false;
  }
}

export type SpotStatus = 'stamped' | 'visited' | 'unvisited';

export type SpotProgress = {
  status: SpotStatus;
  /** 서버 DB에 찍힌 정식 도장인가 */
  verified: boolean;
  /** 이 기기에 찍힌 체험 도장인가 */
  trial: boolean;
  /** 행사 현장 QR 도장도 있는가 */
  qr: boolean;
};

/** 한 지점의 도장·방문 상태 계산 */
export function spotProgress(
  slug: string,
  serverItems: ReadonlySet<string>,
  localStamped: ReadonlySet<string>,
  visited: ReadonlySet<string>,
): SpotProgress {
  const verified = serverItems.has(`room:${slug}`);
  const qr = serverItems.has(`qr:${slug}`);
  const trial = !verified && localStamped.has(slug);
  if (verified || qr || trial) {
    return { status: 'stamped', verified: verified || qr, trial, qr };
  }
  if (visited.has(slug)) {
    return { status: 'visited', verified: false, trial: false, qr: false };
  }
  return { status: 'unvisited', verified: false, trial: false, qr: false };
}

export type RallySummary = {
  total: number;
  stamped: number;
  visitedReady: number;
  qrCount: number;
  completed: boolean;
  byZone: Record<RallyZone, { total: number; stamped: number; done: boolean }>;
};

/** 전체 13곳 진행 요약 */
export function summarizeRally(
  serverItems: ReadonlySet<string>,
  localStamped: ReadonlySet<string>,
  visited: ReadonlySet<string>,
): RallySummary {
  const byZone: RallySummary['byZone'] = {
    yard: { total: 0, stamped: 0, done: false },
    first: { total: 0, stamped: 0, done: false },
    second: { total: 0, stamped: 0, done: false },
  };
  let stamped = 0;
  let visitedReady = 0;
  let qrCount = 0;
  for (const spot of STAMP_SPOTS) {
    const p = spotProgress(spot.slug, serverItems, localStamped, visited);
    byZone[spot.zone].total += 1;
    if (p.qr) qrCount += 1;
    if (p.status === 'stamped') {
      stamped += 1;
      byZone[spot.zone].stamped += 1;
    } else if (p.status === 'visited') {
      visitedReady += 1;
    }
  }
  for (const z of Object.values(byZone)) {
    z.done = z.total > 0 && z.stamped === z.total;
  }
  return {
    total: STAMP_SPOTS.length,
    stamped,
    visitedReady,
    qrCount,
    completed: stamped === STAMP_SPOTS.length,
    byZone,
  };
}

/** 3D 걷기 진입 주소(포털 방은 바로 그 방으로, 마당·1층 열린 곳은 집 걷기로) */
export function walkHrefForSpot(spot: StampSpot): string {
  return spot.portal ? `/walk?room=${encodeURIComponent(spot.slug)}` : '/walk';
}
