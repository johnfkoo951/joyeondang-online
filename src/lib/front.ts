// 첫 화면의 갈래와 숫자. 화면 코드(src/app/page.tsx, src/components/home/)는 여기서 정한 대로 그리기만 한다.
// 다른 모듈을 가져오지 않아 시험(tests/unit/front.test.ts)이 바로 부른다.

/** 첫 화면 들머리: 지금 보는 사람에게 무엇을 먼저 보이는가 */
export type FrontWho =
  /** 로그인 전: 집 안 걷기(다시 그린 집)와 초대장·들어가기 안내 */
  | { kind: 'public' }
  /** 구글로 들어왔지만 명단에서 아직 못 찾음: 들어오는 법(가족에게 확인을 부탁했으면 기다리는 중) */
  | { kind: 'visitor'; pending: boolean }
  /** 명단 손님(가족·집주인 포함): 이름과 바로 걷기 */
  | { kind: 'guest'; name: string };

/** 명단 손님인지(guest)는 부르는 쪽이 canUse(role, 'stamps')로 정해 넘긴다(권한 판정은 한곳에서) */
export function frontWho(v: { signedIn: boolean; guest: boolean; name: string | null; pending: boolean }): FrontWho {
  if (!v.signedIn) return { kind: 'public' };
  if (!v.guest) return { kind: 'visitor', pending: v.pending };
  return { kind: 'guest', name: greetName(v.name) };
}

/** 「이렇게 놀아요」를 둘러볼 곳보다 먼저 보이는가: 처음 온 사람(로그인 전·명단 밖)에게는 어떻게 노는지를 먼저,
 *  명단 손님과 확인하는 동안(null, 기다리는 쪽이 명단 손님)에는 갈 곳을 먼저 */
export function howFirst(who: FrontWho['kind'] | null): boolean {
  return who === 'public' || who === 'visitor';
}

/** 이름이 없을 때 인사에 쓰는 말과 그 영어 */
export const GREET_FALLBACK = '손님';
export const GREET_FALLBACK_EN = 'Guest';

/** 인사에 쓸 이름: 앞뒤 빈칸을 걷고 이름표 칸과 같은 20자까지. 없으면 「손님」 */
export function greetName(name: string | null | undefined): string {
  const t = (name ?? '').replace(/\s+/g, ' ').trim();
  return t ? Array.from(t).slice(0, 20).join('') : GREET_FALLBACK;
}

/** 화면이 영어일 때 인사의 이름: 이름 대신 쓴 「손님」만 영어로, 사람이 지은 이름은 그대로 */
export function greetNameEn(name: string): string {
  return name === GREET_FALLBACK ? GREET_FALLBACK_EN : name;
}

/** 지금 열린 방 수. DB 문패(운영 중 바뀐 값)가 있으면 그것, 없으면 방의 기본 문패 */
export function openRooms(rooms: readonly { slug: string; door: string }[], doors: Readonly<Record<string, string>>): number {
  return rooms.filter((r) => (doors[r.slug] ?? r.door) === 'open').length;
}

/** 첫 화면 그림의 석등 불빛 세기(0.45~1). 종이가 없어도 은은하게 켜 두고, 처음 몇 장에 눈에 띄게 오르고, 백 장쯤에서 다 찬다 */
export function lanternGlow(lit: number | null | undefined): number {
  const n = typeof lit === 'number' && Number.isFinite(lit) ? Math.max(0, lit) : 0;
  return Math.round(Math.min(1, 0.45 + 0.275 * Math.log10(1 + n)) * 100) / 100;
}

/** 석등 한 줄과 오늘 더한 수(작은 표로 따로 붙인다: 좁은 화면에서 줄이 꺾여도 「·」가 줄 끝에 매달리지 않게).
 *  손님이 방에 남기는 것은 첫 화면 어디서나 「쪽지」라 부른다. 숫자를 못 읽었으면(연결 전) 곧 켜진다고만 말한다.
 *  모두 오늘 남긴 것이면 같은 숫자를 두 번 쓰지 않고 「오늘」을 문장에 넣는다(오늘 수는 승인 전·거둔 것까지 세어 더 클 수도 있다) */
export function lanternWords(l: { lit: number; today: number } | null, lang: 'ko' | 'en' = 'ko'): { line: string; today: string | null } {
  if (lang === 'en') return lanternWordsEn(l);
  if (!l) return { line: '석등은 곧 켜져요', today: null };
  if (l.lit <= 0) return { line: '석등이 첫 쪽지를 기다려요', today: null };
  if (l.today >= l.lit) return { line: `오늘 쪽지 ${l.lit}장이 석등을 밝혔어요`, today: null };
  return { line: `쪽지 ${l.lit}장이 석등을 밝혔어요`, today: l.today > 0 ? `오늘 ${l.today}장` : null };
}

// 같은 갈래의 영어(한 장과 여러 장을 가린다)
function lanternWordsEn(l: { lit: number; today: number } | null): { line: string; today: string | null } {
  if (!l) return { line: 'The stone lantern lights up soon', today: null };
  if (l.lit <= 0) return { line: 'The stone lantern is waiting for the first note', today: null };
  if (l.today >= l.lit) {
    return { line: l.lit === 1 ? "Today's note lit the stone lantern" : `Today's ${l.lit} notes lit the stone lantern`, today: null };
  }
  return {
    line: l.lit === 1 ? '1 note has lit the stone lantern' : `${l.lit} notes have lit the stone lantern`,
    today: l.today > 0 ? `${l.today} today` : null,
  };
}
