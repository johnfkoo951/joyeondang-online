// 종이공 과녁 화면 글(한국어·영어). hud.ts와 index.ts가 쓰고, tests/unit/i18n-games.test.ts가 모든 칸의 영어를 본다.
// 한국어는 예전 글자 그대로다. 이 파일은 아무것도 가져오지 않는다(node --test가 바로 읽는다). 고르는 일은 부르는 쪽이 lang으로 한다.

export type Lang = 'ko' | 'en';
/** [한국어, 영어] */
export type Pair = readonly [ko: string, en: string];
/** 지금 말로 고른다 */
export const pick = (p: Pair, lang: Lang): string => (lang === 'en' ? p[1] : p[0]);

/** 고정된 말 */
export const TARGET_WORDS = {
  stageTouch: ['과녁 놀이 화면. 던질 곳을 눌러 종이공을 던져요.', 'Target game. Tap where you want to throw the paper ball.'],
  stageMouse: [
    '과녁 놀이 화면. 마우스로 겨누고 눌러 던지거나, 화살표 키로 겨누고 Space 또는 Enter로 던져요.',
    'Target game. Aim with the mouse and click to throw, or aim with the arrow keys and press Space or Enter.',
  ],
  score: ['점수', 'Score'],
  stop: ['그만하기', 'Quit'],
  unmute: ['소리 켜기', 'Unmute'],
  mute: ['소리 끄기', 'Mute'],
  pickPanel: ['놀이 고르기', 'Choose a mode'],
  startTitle: ['종이공을 던져 과녁을 맞혀요', 'Throw paper balls at the targets'],
  hintTouch: ['던질 곳을 톡 눌러요.', 'Tap where you want to throw.'],
  hintMouse: [
    '마우스로 겨누고 눌러서 던져요. 화살표 키로 겨누고 Space로 던져도 돼요.',
    'Aim with the mouse and click to throw. You can also aim with the arrow keys and throw with Space.',
  ],
  easy: ['쉬운 판', 'Easy'],
  easySub: ['과녁이 크고 천천히', 'Big, slow targets'],
  normal: ['보통 판', 'Normal'],
  normalSub: ['움직이는 과녁', 'Moving targets'],
  goalLine: ['60초 동안 100점을 넘기면 해냈어요.', 'Score over 100 in 60 seconds and you win.'],
  pics: ['종이공이 날아가 과녁에 맞는 그림', 'Picture of a paper ball flying into a target'],
  resultPanel: ['결과', 'Result'],
  cleared: ['해냈어요!', 'You did it!'],
  over: ['끝!', 'Time’s up!'],
  hits: ['맞힌 수', 'Hits'],
  accuracy: ['명중률', 'Accuracy'],
  bestStreak: ['가장 긴 연속', 'Best streak'],
  newBest: ['새 최고 점수!', 'New best score!'],
  again: ['한 번 더', 'Again'],
  change: ['다른 판', 'Other mode'],
  finish: ['마치기', 'Finish'],
  go: ['던져요!', 'Throw!'],
  start: ['시작!', 'Go!'],
  clearPop: ['100점!', '100 points!'],
  clearSub: ['해냈어요', 'You did it'],
  clearSay: ['100점을 넘었어요. 해냈어요.', 'You passed 100 points. You did it.'],
  // 맞힌 자리 위에 뜨는 말
  gold: ['반짝!', 'Sparkle!'],
  pop: ['톡!', 'Pop!'],
  duck: ['꽥!', 'Quack!'],
  allDown: ['다 쓰러졌어요!', 'All down!'],
  crash: ['와르르!', 'Crash!'],
  clang: ['땡!', 'Clang!'],
  bull: ['한가운데!', 'Bullseye!'],
  good: ['좋아요!', 'Nice!'],
  hit: ['맞았어요', 'Hit'],
} as const satisfies Record<string, Pair>;

export type TargetWord = keyof typeof TARGET_WORDS;
export const word = (k: TargetWord, lang: Lang): string => pick(TARGET_WORDS[k], lang);

// ───────── 숫자가 들어가는 말
export const timeLabel = (sec: number, lang: Lang) => pick([`남은 시간 ${sec}초`, `Time left: ${sec} sec`], lang);
export const scoreLabel = (n: number, lang: Lang) => pick([`점수 ${n}`, `Score ${n}`], lang);
export const streakText = (n: number, lang: Lang) => pick([`연속 ${n}번`, `${n} in a row`], lang);
export const goalLabel = (goal: number, reached: boolean, lang: Lang) =>
  pick([`목표 ${goal}점, ${reached ? '해냈어요' : '아직'}`, `Goal ${goal} points: ${reached ? 'done' : 'not yet'}`], lang);
export const bestLine = (easy: number, normal: number, lang: Lang) =>
  pick([`이 기기 최고 점수: 쉬운 판 ${easy}점, 보통 판 ${normal}점`, `Best on this device: Easy ${easy}, Normal ${normal}`], lang);
export const starsLabel = (n: number, lang: Lang) => pick([`별 ${n}개`, n === 1 ? '1 star' : `${n} stars`], lang);
export const pointsLabel = (n: number, lang: Lang) => pick([`${n}점`, n === 1 ? '1 point' : `${n} points`], lang);
export const bestHere = (best: number, lang: Lang) => pick([`이 기기 최고 점수 ${best}점`, `Best on this device: ${best}`], lang);
export const timesLabel = (n: number, lang: Lang) => pick([`${n}번`, String(n)], lang);
export const levelSay = (level: 'easy' | 'normal', lang: Lang) =>
  pick([`${level === 'easy' ? '쉬운 판' : '보통 판'}. 셋, 둘, 하나 뒤에 시작해요.`, `${level === 'easy' ? 'Easy' : 'Normal'}. Starting after three, two, one.`], lang);
export const endSay = (score: number, accuracy: number, lang: Lang) =>
  pick([`끝. ${score}점, 명중률 ${accuracy}퍼센트.`, `Time’s up. ${score} points, ${accuracy} percent accuracy.`], lang);
