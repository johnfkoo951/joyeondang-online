// 캐릭터 만들기 화면이 받은(또는 스스로 적은) 한국어 안내 한 줄의 영어.
// 서버 액션·API·DB는 한국어 글을 그대로 주고(규칙: 서버 글은 바꾸지 않는다), 화면 상태에도 그 글이 한국어로 남는다
// (이 기기에 둔 그리는 중 기록 포함). 화면이 영어일 때 보이는 자리에서만 이 표로 옮긴다(components/avatar/Say).
// 차례: MESSAGES(숫자가 든 글은 그 숫자로 다시 만들어 맞춘다) → 아래 표 → 숫자 칸이 있는 몇 가지 꼴. 모르는 글은 빈 글.
import { messageEn } from './rules';

/** 안내 글(한국어 그대로) → 영어. 서버 액션(app/avatar/actions.ts), 고치기 요청의 확인(route-gate), 올리기(useCharacter), 화면이 적는 글 */
const KNOWN: Readonly<Record<string, string>> = {
  // 「내 캐릭터」 화면의 서버 액션
  '명단에 계신 분만 쓸 수 있어요.': 'Only guests on the guest list can use this.',
  '다시 눌러 주세요.': 'Please press it again.',
  '종이 인형으로 돌아갔어요.': 'Back to the paper doll.',
  '바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.': "Couldn't change it. Please press again in a moment.",
  '지우지 못했어요. 잠시 뒤 다시 눌러 주세요.': "Couldn't delete it. Please press again in a moment.",
  '원본 사진을 모두 지웠어요.': 'All original photos are deleted.',
  '남아 있는 원본 사진이 없어요.': 'No original photos left.',
  '이 캐릭터로 집 안을 걸어요.': "You'll walk the house as this character.",
  '고르지 못했어요. 잠시 뒤 다시 눌러 주세요.': "Couldn't choose it. Please press again in a moment.",
  '★ 보관함에 놓았어요.': 'Added to ★ favorites.',
  '★ 보관함에서 뺐어요.': 'Removed from ★ favorites.',
  '작업대에 놓았어요.': 'Placed on the workbench.',
  '이미 3D가 있거나 만드는 중이에요.': "It already has 3D, or it's being made.",
  '3D 만들기를 맡겼어요. 몇 분 걸려요. 다 되면 이 그림에 「3D」가 붙고, 이 캐릭터로 걸으면 3D로 보여요.':
    "Your 3D is on its way. It takes a few minutes. When it's done, this picture gets a “3D” tag, and walking as this character shows it in 3D.",
  '찾지 못했어요. 이미 지웠을 수도 있어요.': "Couldn't find it. It may already be deleted.",
  '그리기를 그만두었어요.': 'Drawing stopped.',
  '원본 사진을 지웠어요.': 'Original photo deleted.',
  '그림을 지웠어요.': 'Picture deleted.',
  '그림과 원본 사진을 지웠어요.': 'Picture and original photo deleted.',
  // 고치기 요청(★·작업대로·3D)의 로그인 확인과 확인 카드
  '로그인이 끊겼어요. 다시 들어온 뒤 해 주세요.': "You've been signed out. Please sign in again, then try.",
  // 사진 올리기(useCharacter의 uploadPhoto, 「내 캐릭터」 화면)
  '이 사진은 열 수 없어요. 다른 사진으로 해 주세요.': "This photo can't be opened. Please try another photo.",
  '아직 준비 중이에요.': "It isn't ready yet.",
  '지금은 그림을 맡기지 못했어요. 잠시 뒤 다시 해 주세요.': "Couldn't send it for drawing just now. Please try again in a moment.",
  '연결이 잠시 끊겼어요. 다시 해 주세요.': 'The connection dropped for a moment. Please try again.',
  '그림을 만들지 못했어요. 잠시 뒤 다시 해 주세요.': "We couldn't make the picture. Please try again in a moment.",
  '연결이 끊겼어요. 잠시 뒤 아래 목록을 확인하고, 없으면 다시 해 주세요.':
    "The connection dropped. Check the list below in a moment, and try again if it isn't there.",
  '상태를 확인하지 못했어요. 잠시 뒤 아래 목록을 확인해 주세요.': "We couldn't check the status. Please check the list below in a moment.",
  '연결이 끊겼어요. 잠시 뒤 아래 목록을 확인해 주세요.': 'The connection dropped. Please check the list below in a moment.',
  '아직 그리는 중이에요. 다 그리면 아래 「내 캐릭터」에 생겨요.': "Still drawing. When it's done, it will appear in “My character” below.",
  // 걷기 화면의 캐릭터 창
  '초대 손님만 할 수 있어요.': 'Only invited guests can do this.',
  '사진이 너무 커요. 40MB보다 작은 사진으로 골라 주세요.': 'That photo is too big. Please choose one smaller than 40MB.',
  '작업대가 다 차서 가장 오래 있던 그림이 작업대에서 빠졌어요(이력에는 그대로 있어요).':
    'The workbench was full, so the picture that was there longest came off it (it stays in your history).',
  '이 캐릭터로 갈아입었어요.': 'You changed into this character.',
  '그리기를 그만두고 지웠어요.': 'Stopped drawing and deleted it.',
  '그림을 지웠어요. 지금은 기본 인형으로 걸어요. 원본 사진은 「내 캐릭터」 화면에서 지울 수 있어요.':
    "Picture deleted. You're walking as the basic doll now. You can delete the original photo on the “My character” page.",
  '그림을 지웠어요. 원본 사진은 「내 캐릭터」 화면에서 지울 수 있어요.': 'Picture deleted. You can delete the original photo on the “My character” page.',
  '로그인이 끊겼어요. 다시 들어온 뒤 지워 주세요.': "You've been signed out. Please sign in again to delete it.",
  '초대 손님만 지울 수 있어요.': 'Only invited guests can delete.',
  '지금은 지우지 못했어요. 잠시 뒤 다시 해 주세요.': "Couldn't delete it just now. Please try again in a moment.",
  '3D 만들기를 맡겼어요. 보통 1~2분 걸려요. 다 되면 이 그림에 「3D」가 붙고, 이 캐릭터를 입고 걸으면 3D로 보여요.':
    "Your 3D is on its way. It usually takes 1 to 2 minutes. When it's done, this picture gets a “3D” tag, and wearing this character shows it in 3D.",
  // 이 기기에 둔 그리는 중 기록의 기본 까닭(making.ts, making-3d.ts)과 칸 답을 못 읽었을 때(rules.ts의 readSlotsReply)
  '이번 사진으로는 그림을 만들지 못했어요.': "We couldn't make a picture from this photo.",
  '3D를 만들지 못했어요.': "Couldn't make the 3D model.",
  '지금은 새로 만들 수 없어요.': "You can't make a new one right now.",
};

/** 숫자 칸이 있는 글 */
const PATTERNS: readonly (readonly [RegExp, (m: RegExpExecArray) => string])[] = [
  [/^작업대 (\d+)번 칸에 놓았어요\.$/, (m) => `Placed in workbench slot ${m[1]}.`],
];

/** 한국어 안내 한 줄의 영어. 모르는 글(또는 빈 글)이면 빈 글: 그때 화면은 한국어를 그대로 보인다 */
export function sayEn(text: string | null | undefined): string {
  if (typeof text !== 'string') return '';
  const t = text.trim();
  if (!t) return '';
  const m = messageEn(t) || KNOWN[t];
  if (m) return m;
  for (const [re, fn] of PATTERNS) {
    const hit = re.exec(t);
    if (hit) return fn(hit);
  }
  return '';
}

/** 시험용: 표에 든 한국어 글 */
export const KNOWN_KO: readonly string[] = Object.keys(KNOWN);
