// 사진 캐릭터를 만들 때 보여 주는 동의 글. 사진을 올리는 화면 두 곳(내 캐릭터 화면, 걷기 화면의 캐릭터 패널)이 같은 글을 쓴다.
// 글이 한쪽만 바뀌면 안내받지 않은 일에 동의를 받게 되므로 여기 한곳에 둔다.
// 3D 모형을 어디서 만드는지는 사이트 환경 변수 AVATAR_MODEL_PROVIDER(meshy | trellis, 기본 meshy)를 따른다.
// 일꾼이 쓰는 3D 서비스와 같게 맞춘다. 값이 없거나 이상하면 외부로 보낸다고 알리는 쪽(meshy)으로 본다.
// Meshy가 받은 그림을 학습에 쓰는지는 서버 환경 변수 MESHY_TRAINING_OPTOUT(1이면 학습 제외를 요청해 둔 것)을 따른다.
// 영어(lang 'en'): 외국인 손님에게 같은 뜻을 그대로 옮긴 글(덧붙이거나 줄이지 않는다). 동의 기록은 바뀌지 않는다
// (서버가 적는 것은 체크 여부와 때뿐이다). 한국어 글은 한 글자도 바꾸지 않는다.
// 이 파일은 일꾼과 node --test가 그대로 불러온다: 타입 말고는 다른 파일을 가져오지 않는다.
import type { Lang } from '@/lib/i18n';

/** 3D 모형을 만드는 곳: meshy(외부 3D 서비스, 미국) | trellis(우리 컴퓨터) */
export type ModelProvider = 'meshy' | 'trellis';

/** 환경 변수 값을 읽는다. trellis일 때만 trellis, 그 밖은 meshy(덜 알리는 쪽으로 틀리지 않게) */
export function readModelProvider(raw: string | undefined | null): ModelProvider {
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'trellis' ? 'trellis' : 'meshy';
}

/**
 * 환경 변수 MESHY_TRAINING_OPTOUT을 읽는다. 1일 때만 참(Meshy에 학습 제외를 요청해 답을 받은 뒤에 켠다).
 * 그 밖은 거짓: 약관대로 학습에 쓸 수 있다고 알리는 쪽(덜 알리는 쪽으로 틀리지 않게)
 */
export function readTrainingOptOut(raw: string | undefined | null): boolean {
  return typeof raw === 'string' && raw.trim() === '1';
}

/**
 * Meshy가 받은 그림을 어떻게 다루는지(동의 글·3D 확인·개인정보 화면이 같은 글을 쓴다).
 * Meshy 이용약관은 Enterprise가 아닌 고객의 입력과 결과를 학습과 개선에 쓸 수 있다고 적는다. 학습 제외를 확인하기 전에는
 * 그대로 알리고, 요청해 답을 받았으면(optOut) 요청해 두었다고 알린다. 3D 만들기가 끝나면(다 만들었거나 그만두었거나 그림을
 * 지웠으면) 일꾼이 Meshy 쪽 작업(보낸 그림과 만든 모형)을 지운다(worker/avatar/meshy.mjs의 forget)
 */
export function meshyTraining(optOut = false, lang: Lang = 'ko'): string {
  if (lang === 'en') {
    return optOut
      ? "We have asked Meshy not to use the pictures it receives for training, and Meshy's copy is deleted when it's done."
      : "Under Meshy's terms, the picture it receives may be used for training, and Meshy's copy is deleted when it's done.";
  }
  return optOut
    ? 'Meshy에는 받은 그림을 학습에 쓰지 않도록 요청해 두었고, 끝나면 Meshy 쪽 사본은 지워요.'
    : 'Meshy 약관상 받은 그림이 학습에 쓰일 수 있고, 끝나면 Meshy 쪽 사본은 지워요.';
}

/**
 * 집주인 보관함 안내(2026-11-12 집주인 결정: 동의 글을 바꾼 뒤 올린 사진부터 원본도 넣는다). 집주인은 조연당 기록으로 원본 사진,
 * 캐릭터 그림, 3D 모형의 사본을 사이트 밖 집주인 컴퓨터의 비공개 보관함에 남긴다. 보관함 도구는 사이트에서 지운 캐릭터와 원본을
 * 다음에 돌 때 따라 지운다(정해진 때에 저절로 돌지 않아 「다음 정리 때」라고 쓴다). 동의 글·개인정보 화면이 같은 글을 쓴다
 */
export const CONSENT_ARCHIVE =
  '집주인은 조연당 기록으로 원본 사진, 캐릭터 그림, 3D 모형의 사본을 집주인 컴퓨터의 보관함에 남겨요. ' +
  '보관함은 바깥에 내보이지 않고, 내가 여기서 지운 것은 보관함에서도 다음 정리 때 지워요.';
/** CONSENT_ARCHIVE의 영어(개인정보 화면이 영어일 때) */
export const CONSENT_ARCHIVE_EN =
  "As a record of Joyeondang, the host keeps copies of the original photo, character pictures and 3D model in an archive on the host's computer. " +
  'The archive is never shown outside, and anything you delete here is also deleted from the archive at the next cleanup.';

/** 동의 글 한 줄: 굵게 보이는 짧은 머리말(head)과 그 내용(text). 머리말이 주어를 맡으므로 text만 떼어 쓰지 않는다 */
export type ConsentPoint = { head: string; text: string };

/**
 * 사진을 올리는 화면의 동의 글: 머리말이 붙은 짧은 다섯 줄(2026-11-12 집주인 「동의서 안내문이 너무 길고 잘 안읽혀. 깔끔하게 써줘」).
 * 자세한 글(여러 방향 그림을 몇 번 다시 그리는지, 관리 화면에서 보이는 것, 보관함 문장 전체)은 개인정보 화면(/privacy)에 두고
 * 화면은 「자세히 보기」로 잇는다. 줄마다 꼭 알릴 것: 바깥으로 보내는 곳(OpenAI, Meshy 미국), 고른 그림 한 장만 3D, 학습 약관,
 * 지울 때까지 남고 함께 지워지는 것, 집주인의 보관과 관리, 보이는 범위.
 * provider: 3D 모형을 만드는 곳, optOut: Meshy 학습 제외를 요청해 두었는가(둘 다 서버가 환경 변수로 정해 넘긴다).
 * lang 'en': 같은 다섯 줄의 영어(뜻을 그대로. 영어는 본문이 머리말 없이도 읽히는 온전한 문장이다)
 */
export function consentPoints(provider: ModelProvider = 'meshy', optOut = false, lang: Lang = 'ko'): ConsentPoint[] {
  if (lang === 'en') {
    return [
      { head: 'Pictures', text: 'Your photo and the pictures are sent to OpenAI (USA) to draw your character picture and its views from several angles.' },
      {
        head: '3D',
        text: provider === 'trellis'
          ? 'Made on our own computer from the one ★ picture you choose. Nothing is sent outside.'
          : `Only the one ★ picture you choose is sent to Meshy (USA) to make it. Your original photo is not sent. ${meshyTraining(optOut, 'en')}`,
      },
      {
        head: 'How long',
        text: 'Your original photo and pictures stay until you delete them, and you can delete them any time. Deleting a picture also deletes its angle views and 3D.',
      },
      {
        head: 'Host',
        text: 'The host keeps copies of the original photo, pictures and 3D as a record, and can delete or remake characters on the admin screen. Anything you delete is also removed from the archive at the next cleanup.',
      },
      { head: 'Who sees it', text: 'Only people who have entered Joyeondang Online can see it.' },
    ];
  }
  return [
    { head: '그림', text: '사진과 그림을 OpenAI(미국)로 보내 캐릭터 그림과 여러 방향 그림을 그려요.' },
    {
      head: '3D',
      text: provider === 'trellis'
        ? '내가 고른 ★ 그림 한 장으로 우리 컴퓨터에서 만들어요. 바깥으로 보내지 않아요.'
        : `내가 고른 ★ 그림 한 장만 Meshy(미국)로 보내 만들어요. 사진 원본은 보내지 않아요. ${meshyTraining(optOut)}`,
    },
    { head: '보관 기간', text: '원본 사진과 그림은 내가 지울 때까지 남고, 언제든 지울 수 있어요. 그림을 지우면 여러 방향 그림과 3D도 함께 지워져요.' },
    {
      head: '집주인',
      text: '기록으로 원본 사진, 그림, 3D 사본을 보관하고, 관리 화면에서 캐릭터를 지우거나 다시 만들 수 있어요. 내가 지운 것은 다음 정리 때 보관함에서도 지워요.',
    },
    { head: '보이는 곳', text: '조연당 온라인에 들어온 사람에게만 보여요.' },
  ];
}

/** 동의 글 한 덩이(시험·옛 화면용). 머리말을 붙여 잇는다. 화면은 consentPoints를 줄로 보인다 */
export function consentMain(provider: ModelProvider = 'meshy', optOut = false, lang: Lang = 'ko'): string {
  return consentPoints(provider, optOut, lang).map((p) => `${p.head}: ${p.text}`).join(' ');
}

/** 누구 사진인가. 아이(만 14세 미만)는 보호자 동의에 체크해야 올리고, 서버가 그 그림 줄에 동의 때를 적는다(0025) */
export type PhotoSubject = 'self' | 'child';
export const SUBJECT_FIELD = 'subject';
export const GUARDIAN_FIELD = 'consent_guardian';
export const SUBJECT_QUESTION = '누구 사진이에요?';
export const SUBJECT_LABEL: Readonly<Record<PhotoSubject, string>> = { self: '나예요(만 14세 이상)', child: '아이예요(만 14세 미만)' };
export const CONSENT_GUARDIAN = '나는 이 아이의 보호자이고, 아이 사진으로 캐릭터를 만드는 데 동의해요.';
/** 위 셋과 CONSENT_TERMS의 영어(화면이 영어일 때 같은 자리에 보인다. 폼 값과 서버가 적는 것은 그대로) */
export const SUBJECT_QUESTION_EN = 'Whose photo is this?';
export const SUBJECT_LABEL_EN: Readonly<Record<PhotoSubject, string>> = { self: 'Me (14 or older)', child: 'A child (under 14)' };
export const CONSENT_GUARDIAN_EN = "I am this child's guardian, and I agree to making a character from the child's photo.";
/** 폼 값 → 누구 사진인가. 모르는 값은 null */
export function readSubject(v: unknown): PhotoSubject | null {
  return v === 'self' || v === 'child' ? v : null;
}
/** 기본(meshy, 학습 제외 요청 전) 동의 글. 화면은 서버가 준 값으로 consentMain을 부른다 */
export const CONSENT_MAIN = consentMain('meshy');
export const CONSENT_TERMS = '위 내용에 동의해요.';
export const CONSENT_TERMS_EN = 'I agree to the above.';

/**
 * 「3D 만들기」를 누르면 묻는 글. cap: 이 사람의 3D 한도(null = 제한 없음: 횟수를 말하지 않는다),
 * optOut: Meshy 학습 제외를 요청해 두었는가. 화면은 이 글을 보여 주고 「보내기」(meshy) 또는 「만들기」(trellis)로 한 번 더 받는다.
 * lang 'en': 같은 뜻의 영어
 */
export function modelConfirm(provider: ModelProvider, cap: number | null, optOut = false, lang: Lang = 'ko'): string {
  if (lang === 'en') {
    const timesEn = cap === null ? '' : cap === 1 ? ' Each person can do this only once.' : ` Each person can do this up to ${cap} times.`;
    return provider === 'trellis'
      ? `We'll make a 3D model from this character picture on our own computer (it is not sent to any outside service).${timesEn} Make it?`
      : `To make a 3D model, this character picture will be sent to an outside 3D service (Meshy, USA). Your original photo is not sent. ${meshyTraining(optOut, 'en')}${timesEn} Send it?`;
  }
  const times = cap === null ? '' : cap === 1 ? ' 한 사람 한 번만 만들 수 있어요.' : ` 한 사람 ${cap}번까지 만들 수 있어요.`;
  return provider === 'trellis'
    ? `이 캐릭터 그림으로 우리 컴퓨터에서 3D를 만들어요(바깥 서비스로 보내지 않아요).${times} 만들까요?`
    : `이 캐릭터 그림을 3D로 만들려고 외부 3D 서비스(Meshy, 미국)로 보내요. 사진 원본은 보내지 않아요. ${meshyTraining(optOut)}${times} 보낼까요?`;
}
/** 3D 확인의 「예」 단추 글 */
export function modelConfirmYes(provider: ModelProvider, lang: Lang = 'ko'): string {
  if (lang === 'en') return provider === 'trellis' ? 'Make 3D' : 'Send';
  return provider === 'trellis' ? '3D 만들기' : '보내기';
}

/** 개인정보 화면(/privacy)의 3D 설명. optOut: Meshy 학습 제외를 요청해 두었는가. lang 'en': 같은 뜻의 영어 */
export function privacyModel(provider: ModelProvider, optOut = false, lang: Lang = 'ko'): string {
  if (lang === 'en') {
    return provider === 'trellis'
      ? 'You can make a 3D model from one character picture you choose from your ★ favorites (it is made on our own computer and not sent to any outside service).'
      : 'You can make a 3D model from one character picture you choose from your ★ favorites. That one chosen picture is sent to an outside service (Meshy, USA) to make the 3D model (your original photo is not sent). ' +
        meshyTraining(optOut, 'en');
  }
  return provider === 'trellis'
    ? '★로 보관한 캐릭터 그림 가운데 내가 고른 한 장으로 3D 모형을 만들 수 있어요(우리 컴퓨터에서 만들고 바깥 서비스로 보내지 않아요).'
    : '★로 보관한 캐릭터 그림 가운데 내가 고른 한 장으로 3D 모형을 만들 수 있어요. 이때 고른 캐릭터 그림 한 장을 외부 서비스(Meshy, 미국)로 보내 3D를 만들어요(사진 원본은 보내지 않아요). ' +
      meshyTraining(optOut);
}

/**
 * 올리는 요청에 함께 싣는 표시: 이 화면이 「여러 방향 그림을 그릴 때 캐릭터 그림이 한 번 더 보내진다」는 안내(consentMain)를
 * 보여 줬다는 뜻이다. 서버는 이 표시가 있을 때만 여러 방향 그림까지 동의한 것으로 적는다
 * (옛 화면을 열어 둔 채 올린 사진은 표시가 없어 방향 그림을 그리지 않는다).
 */
export const CONSENT_VIEWS_FIELD = 'consent_views';
