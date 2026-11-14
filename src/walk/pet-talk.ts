// 반려동물이 하는 말. 말풍선 하나에 「야옹」 한마디와 괄호 속 속마음을 함께 띄운다(괄호 글은 조금 작고 흐리게).
// 성격은 도도하지만 따뜻한 고양이(츤데레): 처음 부르면 새침하게 굴거나 집주인이 강의에서 자주 하는 잔소리를 흉내 내고,
// 자꾸 부르면 조금씩 마음을 연다. 새침한 말은 고개를 돌리고 하고, 다른 말은 부른 사람을 보고 한다(pet-view.ts).
// 누르거나 다가가 부른 말은 그 화면에서만 고른다. 일정이 띄우는 말(친구 곁에 닿았을 때, 혼자 닿았을 때 가끔)은
// 칸의 주사위(PetState.talk)로 고르므로 모든 화면에서 같은 말이다.
// 화면이 영어이면 같은 자리(같은 차례)의 영어 말을 고른다: 일정이 띄우는 말은 언어가 달라도 모든 화면에서 같은 차례다.
// three.js에 의존하지 않아 시험에서 그대로 돈다.
import { walkLang, type Lang } from './lang';

export type PetLine = {
  /** 소리: 야옹, 냥 같은 한마디 */
  say: string;
  /** 속마음: 괄호까지 넣어 쓴다 */
  aside: string;
};

/** 누를 때 고르는 말의 결: 새침, 잔소리(강의 말투), 다정 */
export type PetMood = 'cold' | 'lecture' | 'warm';

const L = (say: string, aside: string): PetLine => ({ say, aside });

/** 누를 때의 말. 결마다 따로 둔다 */
export const PET_TAP_LINES: Readonly<Record<PetMood, readonly PetLine[]>> = {
  cold: [
    L('야옹', '(흥, 반가워서 온 거 아니거든)'),
    L('냥', '(지나가던 길이었어. 진짜야)'),
    L('미야', '(쓰다듬는 건 허락받고 해)'),
    L('냐앙', '(나 바빠. 낮잠이 밀렸어)'),
    L('야옹', '(눈 마주치지 마. 귀찮으니까)'),
    L('냥', '(부른다고 다 가는 고양이 아니야)'),
  ],
  lecture: [
    L('야옹', '(옵시디언은 쓰고 있지?)'),
    L('냐앙', '(메타데이터는 정했어?)'),
    L('야옹', '(질문은 언제나 환영이야. 간식도)'),
    L('냥', '(2주만 줘. 공부해서 돌아올게)'),
    L('야옹', '(기록은 미래의 나한테 쓰는 편지야)'),
    L('미야옹', '(빈 노트는 "언제 밥 한번 먹자"야)'),
    L('야옹', '(같은 파일 세 번 받고 안 읽었지?)'),
    L('냐', '(세 줄 요약 말고 세 배 요약)'),
    L('야옹', '(읽지도 않고 오케이 누르지 마)'),
    L('냥', '(AI가 못 한다고? 설명을 못 한 거야)'),
    L('야옹', '(폴더보다 링크야. 우리처럼)'),
    L('냐앙', '(인박스 또 꽉 찼지? 다 알아)'),
    L('미야', '(프롬프트 1위 "더"? 내 1위는 "츄르")'),
    L('야옹', '(치킨은 AI 말고 나한테 사 줘)'),
    L('냥', '(이 집 헌법은 CLAUDE.md 말고 나야)'),
    L('야옹', '(오늘 데일리 노트는 썼어?)'),
    L('냐', '(어린이 여러분, 집중! 해 보고 싶었어)'),
    L('냥', '(재밌어? 재밌다고 해)'),
    L('야옹', '(노트도 냉장고 재료처럼 손질해 둬)'),
  ],
  warm: [
    L('야옹', '(…와 줘서 고마워. 한 번만 말해)'),
    L('냐앙', '(조금만 더 있다 가. 심심해서 그래)'),
    L('야옹', '(쓰다듬어도 돼. 딱 세 번만)'),
    L('냥', '(오늘 좋아 보인다. 그냥 그렇다고)'),
    L('미야옹', '(밥은 먹었어? 나는 먹었어)'),
    L('야옹', '(꼬리가 멋대로 흔들리는 거야)'),
    L('냐', '(내 자리 반 나눠 줄게. 반만이야)'),
  ],
};

/** 일정이 띄우는 말: 친구 곁에 닿았을 때, 혼자 닿았을 때. PET_MEOW_MS 안에 읽을 수 있게 짧게 */
export const PET_FRIEND_LINES: readonly PetLine[] = [
  L('야옹', '(왔어? 기다린 거 아니거든)'),
  L('냐앙', '(여기 앉은 건 우연이야)'),
  L('냥', '(옆에 있어 줄게. 잠깐만이야)'),
  L('야옹', '(간식 냄새 나서 온 거야)'),
  L('미야', '(바빠 보이네. 잠깐 쉬어)'),
  L('야옹', '(노트 정리했어? 칭찬은 안 해)'),
  L('냐앙', '(손님 많지? 내가 지켜 줄게)'),
];
export const PET_ALONE_LINES: readonly PetLine[] = [
  L('야옹', '(여기 좋다. 이 자리 내 거)'),
  L('냥', '(순찰 끝. 이상 없음)'),
  L('야옹', '(누가 나 찾나? 기분 탓이네)'),
  L('냐', '(손님 많네. 귀찮… 아니, 좋아)'),
  L('냥', '(메타데이터 없는 노트 냄새 나)'),
  L('냥', '(옵시디언 켜 둔 사람 있어?)'),
  L('냥', '(낮잠 자리 점검 중이야)'),
];

// ───────── 영어 말: 한국어 표와 같은 차례, 같은 결(새침, 강의 잔소리, 다정). 소리는 야옹 Meow, 냥 Mew, 냐 Mrr, 냐앙 Mrrp,
// 미야 Mrow, 미야옹 Miaow. 말풍선 세 줄 안에 들게 짧게 쓴다
export const PET_TAP_LINES_EN: Readonly<Record<PetMood, readonly PetLine[]>> = {
  cold: [
    L('Meow', "(Hmph. Not here because I missed you)"),
    L('Mew', '(Just passing by. Really)'),
    L('Mrow', '(Ask before you pet me)'),
    L('Mrrp', "(I'm busy. Behind on my naps)"),
    L('Meow', "(Don't look at me. Too much effort)"),
    L('Mew', "(I don't come just because you call)"),
  ],
  lecture: [
    L('Meow', "(You're using Obsidian, right?)"),
    L('Mrrp', '(Did you decide on your metadata?)'),
    L('Meow', '(Questions always welcome. Treats too)'),
    L('Mew', "(Give me two weeks. I'll study up)"),
    L('Meow', '(Notes are letters to your future self)'),
    L('Miaow', '(An empty note is a "let\'s catch up sometime")'),
    L('Meow', '(Downloaded it three times, read it zero?)'),
    L('Mrr', '(Not a 3-line summary. A 3x deeper one)'),
    L('Meow', "(Don't click OK without reading)"),
    L('Mew', "(AI can't do it? You didn't explain it well)"),
    L('Meow', '(Links over folders. Like us)'),
    L('Mrrp', '(Inbox full again? I know everything)'),
    L('Mrow', '(Top prompt is "more"? Mine is "treats")'),
    L('Meow', '(Treat me to chicken, not the AI)'),
    L('Mew', "(I'm this house's rulebook, not CLAUDE.md)"),
    L('Meow', "(Did you write today's daily note?)"),
    L('Mrr', '(Kids, eyes up here! Always wanted to say that)'),
    L('Mew', '(Having fun? Say you are)'),
    L('Meow', '(Prep your notes like groceries for the fridge)'),
  ],
  warm: [
    L('Meow', "(…Thanks for coming. I'll only say it once)"),
    L('Mrrp', "(Stay a bit longer. I'm just bored)"),
    L('Meow', '(You can pet me. Three times, max)'),
    L('Mew', '(You look good today. Just saying)'),
    L('Miaow', '(Have you eaten? I have)'),
    L('Meow', "(My tail's swishing on its own, okay?)"),
    L('Mrr', '(You can have half my spot. Just half)'),
  ],
};
export const PET_FRIEND_LINES_EN: readonly PetLine[] = [
  L('Meow', "(You're here? Wasn't waiting or anything)"),
  L('Mrrp', '(I sat here by accident)'),
  L('Mew', "(I'll stay by you. Just for a bit)"),
  L('Meow', '(I only came because I smelled treats)'),
  L('Mrow', '(You look busy. Take a break)'),
  L('Meow', '(Tidied your notes? No praise from me)'),
  L('Mrrp', "(Lots of guests, huh? I'll guard you)"),
];
export const PET_ALONE_LINES_EN: readonly PetLine[] = [
  L('Meow', "(Nice spot. It's mine now)"),
  L('Mew', '(Patrol done. All clear)'),
  L('Meow', '(Someone looking for me? Guess not)'),
  L('Mrr', '(So many guests. Annoying… I mean, nice)'),
  L('Mew', '(I smell a note with no metadata)'),
  L('Mew', '(Anyone have Obsidian open?)'),
  L('Mew', '(Inspecting nap spots)'),
];

/** 그 언어의 말 표 */
const tapLines = (lang: Lang) => (lang === 'en' ? PET_TAP_LINES_EN : PET_TAP_LINES);

/** 줄을 한 문장으로(글자판을 못 그릴 때, 시험·디버그용) */
export const petLineText = (l: PetLine) => `${l.say} ${l.aside}`;

/** 영어 글자는 이만큼이 한글 한 글자만큼 읽힌다(말풍선 시간 셈) */
const LATIN_PER_SYLLABLE = 2.2;

/** 말풍선이 떠 있는 시간(ms): 글자 수에 맞춰, 너무 짧거나 길지 않게. 한글이 없는 줄(영어)은 글자를 덜 무겁게 센다 */
export function petTalkMs(l: PetLine): number {
  const len = [...l.say].length + [...l.aside].length;
  const n = /[가-힣]/.test(l.say + l.aside) ? len : Math.ceil(len / LATIN_PER_SYLLABLE);
  return Math.min(6000, Math.max(3200, 2400 + 110 * n));
}

/** 이 시간(ms) 안에 다시 부르면 이어서 부른 것으로 센다(그보다 오래 두면 처음부터 다시 새침하다) */
export const PET_TAP_FORGET_MS = 90_000;

/**
 * 몇 번째로 불렀는지(1부터)와 주사위(0..1)로 말의 결을 고른다: 처음에는 새침하거나 잔소리를 하고, 자꾸 부르면 다정한 말이 는다
 */
export function petTapMood(count: number, r: number): PetMood {
  if (count <= 1) return r < 0.55 ? 'cold' : 'lecture';
  if (count <= 3) return r < 0.25 ? 'cold' : r < 0.75 ? 'lecture' : 'warm';
  return r < 0.1 ? 'cold' : r < 0.45 ? 'lecture' : 'warm';
}

/**
 * 누를 때 할 말을 고른다. rnd는 0..1 주사위(화면의 Math.random, 시험은 정해진 값). recent는 최근에 한 말(PetLine 그대로)이고
 * 그 말은 되도록 다시 고르지 않는다(결에 남은 말이 없으면 그중에서 고른다). 언어를 바꾼 뒤에도 같은 차례의 말은 같은 말로 센다.
 * lang을 주지 않으면 지금 화면 말
 */
export function petTapLine(count: number, rnd: () => number, recent: readonly PetLine[] = [], lang: Lang = walkLang()): { line: PetLine; mood: PetMood } {
  const mood = petTapMood(count, rnd());
  const all = tapLines(lang)[mood];
  const said = (i: number) => recent.includes(PET_TAP_LINES[mood][i]) || recent.includes(PET_TAP_LINES_EN[mood][i]);
  const fresh = all.filter((_, i) => !said(i));
  const pool = fresh.length ? fresh : all;
  return { line: pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))], mood };
}

/**
 * 일정이 띄우는 말: 칸의 주사위(0 이상 정수)로 고른다. 친구 곁이면 친구에게 하는 말. 영어 화면도 같은 차례의 말이다.
 * lang을 주지 않으면 지금 화면 말
 */
export function petScheduledLine(talk: number, friend: boolean, lang: Lang = walkLang()): PetLine {
  const list = friend ? (lang === 'en' ? PET_FRIEND_LINES_EN : PET_FRIEND_LINES) : lang === 'en' ? PET_ALONE_LINES_EN : PET_ALONE_LINES;
  const i = Number.isFinite(talk) ? Math.abs(Math.floor(talk)) % list.length : 0;
  return list[i];
}
