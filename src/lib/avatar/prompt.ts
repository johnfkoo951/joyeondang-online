// AI 사진 캐릭터에 보내는 글(순수). 사용자 지시 「언제나 긍정적으로 그린다」가 여기서 지켜진다.
// - 모두가 같은 귀여운 꼬마 비율(큰 머리, 작은 몸)을 받는다. 사진 속 몸매는 그리지 않는다.
// - 사진에서는 옷(색·무늬·모양), 머리 모양과 색, 안경·모자·장신구만 가져온다.
// - 피부색은 사진 그대로 존중한다(밝게도 어둡게도 바꾸지 않는다).
// 바꿀 때는 tests/unit/avatar-ai.test.ts의 규칙 검사를 같이 본다.

/** 사진에서 가져오는 것(이것만) */
export const TAKE_FROM_PHOTO: readonly string[] = [
  'the outfit: clothing colors, patterns and style (simplify it into clean, cute shapes)',
  'the hairstyle and hair color, drawn neat and tidy',
  'glasses, hats and accessories the person is wearing',
  'the skin tone, kept true to the photo and treated with respect: never make it lighter or darker',
];

/** 누구에게나 똑같이 주는 것: 긍정적 묘사 규칙 */
export const POSITIVE_PORTRAYAL_RULES: readonly string[] = [
  'Everyone gets the same standard cute chibi proportions: about two heads tall, a big round head as tall as the whole body below it, a small soft body, short arms and short legs.',
  'Do not copy the body shape, build or proportions from the photo. Every character uses the same chibi body.',
  'Always draw the person in the kindest, most flattering and charming way.',
  'Give a warm, friendly smile with a closed or softly open mouth, and bright, kind eyes.',
  'Give a rosy, healthy complexion and clean, smooth, even skin (flat color, no light effects around the figure).',
  'Never show wrinkles, blemishes, spots, scars, moles, tired eyes or eye bags.',
  'Never show teeth gaps or uneven teeth.',
  'A shaved or bald head is drawn smooth, neat and dignified, never as a joke.',
  'Hair always looks neat, tidy and well styled.',
  'Use simple, cute chibi face features. Do not try to reproduce the real face in detail.',
  'Never exaggerate, mock or caricature any feature.',
];

/** 그림의 모양과 배경 */
export const STYLE_RULES: readonly string[] = [
  'Style: soft storybook illustration like a paper doll, clean rounded outlines, flat warm colors with light, gentle shading.',
  // 걷기 화면에서 여러 방향 그림을 이어 쓸 때 한쪽만 밝으면 돌 때마다 밝기가 튄다
  'Even, flat lighting from the front; no strong light from one side.',
  'Pose: one single character standing upright, full body from head to shoes, front three-quarter view, feet together, arms relaxed at the sides.',
  'If part of the outfit is not visible in the photo, continue it naturally in the same colors and style.',
  'Keep the clothing modest and the way it is worn in the photo.',
  'Center the character with a little empty space around it.',
  'Transparent background: no background, no floor, no ground shadow, no glow or halo, no scenery, no frame.',
  'No text, no letters, no numbers, no logos, no watermark.',
];

/** 프롬프트에 절대 들어가면 안 되는 말(실물 그대로·몸무게 같은 방향으로 끌지 않게) */
export const FORBIDDEN_PROMPT_WORDS: readonly string[] = [
  'realistic',
  'realism',
  'lifelike',
  'accurate body',
  'body type',
  'weight',
  'exact likeness',
  'true to life',
];

export function buildAvatarPrompt(): string {
  const text = [
    'Turn the person in the reference image into a cute chibi character for a cozy, friendly family house game.',
    '',
    'Take only these things from the reference image:',
    ...TAKE_FROM_PHOTO.map((t) => `- ${t}`),
    '',
    'Rules that apply to everyone, always:',
    ...POSITIVE_PORTRAYAL_RULES.map((t) => `- ${t}`),
    '',
    ...STYLE_RULES.map((t) => `- ${t}`),
  ].join('\n');
  return checked(text);
}

/** 금지어가 한 마디라도 들어가면 보내지 않는다(글을 고치다 실수로 넣는 것을 막는다) */
function checked(text: string): string {
  const lower = text.toLowerCase();
  const bad = FORBIDDEN_PROMPT_WORDS.find((w) => lower.includes(w));
  if (bad) throw new Error(`avatar prompt contains a forbidden phrase: ${bad}`);
  return text;
}

// ───────── 걷기용 방향 그림(다 그린 캐릭터 그림 한 장 → 같은 캐릭터의 다섯 방향 한 줄)
// 사진이 아니라 이미 그린 캐릭터 그림을 참고로 보낸다. 그래서 여기서는 사진에서 무엇을 가져올지가 아니라
// 「같은 캐릭터를 그대로」만 말한다. 순서와 보는 쪽은 src/lib/avatar/sheet.ts의 VIEW_ORDER, 걷기 엔진의 약속과 같아야 한다.

/** 같은 캐릭터를 그대로: 얼굴·머리·옷·소품·비율·그림체 */
export const TURNAROUND_SAME_CHARACTER =
  'The reference image shows one cute chibi character. Draw the exact same character again: the same face, the same hairstyle and hair color, the same outfit with the same colors and details, the same accessories, the same chibi proportions (about two heads tall, big round head, small soft body), and the same soft storybook paper-doll illustration style with clean rounded outlines and flat warm colors.';

/** 한 줄에 다섯, 같은 크기, 발은 같은 선, 서로 닿지 않게(닿으면 한 사람씩 잘라 낼 수 없다) */
export const TURNAROUND_LAYOUT =
  'Make a character turnaround sheet: five full-body views of this one character, standing upright in the same relaxed pose (feet together, arms relaxed at the sides), placed in one horizontal row, evenly spaced, all drawn at exactly the same size and height, with the feet on the same baseline. Leave clear empty space between the figures so that they never touch or overlap.';

/** 왼쪽부터 앞, 앞 비스듬, 옆, 뒤 비스듬, 뒤. 비스듬·옆은 모두 그림 왼쪽을 본다(반대쪽은 엔진이 뒤집어 쓴다) */
export const TURNAROUND_VIEWS: readonly string[] = [
  'Front view: facing the viewer straight on.',
  'Three-quarter front view: the character has turned 45 degrees so that its nose points toward the left edge of the picture.',
  'Side view: full profile, the nose points toward the left edge of the picture.',
  'Three-quarter back view: turned away from the viewer, the nose points toward the left edge of the picture and away from us, so we mostly see the back.',
  'Back view: facing straight away from the viewer, so we see only the back of the head and the back of the outfit, and no face.',
];

/**
 * 언제나 긍정적으로(사용자 지시, 한 장 그림의 POSITIVE_PORTRAYAL_RULES와 같은 뜻). 옆·뒤 모습은 참고 그림에 없는 부분
 * (옆얼굴, 뒤통수, 목덜미, 옷의 뒤)을 새로 그리므로, 그 부분에서도 같은 규칙을 지키라고 한 번 더 말한다.
 */
export const TURNAROUND_POSITIVE_RULES: readonly string[] = [
  'Keep the skin tone exactly as in the reference image in every view; never make it lighter or darker.',
  'In every view, draw the character in the kindest, most flattering and charming way. Never exaggerate, mock or caricature any feature.',
  'Clean, smooth, even skin in every view: no wrinkles, blemishes, spots or scars.',
  'A shaved or bald head stays smooth, neat and dignified from every side, never as a joke.',
  'Hair and clothes stay neat and tidy. Parts of the outfit that are not visible in the reference image (the back and the sides) continue naturally in the same colors and shapes.',
];

/** 고른 빛, 투명 바탕, 글자 없음 */
export const TURNAROUND_RULES: readonly string[] = [
  'All five views show the same character with the same outfit; nothing is added or removed between views.',
  'Even, flat lighting from the front. No cast shadows.',
  'Transparent background: no background, no floor, no ground shadow, no glow or halo, no scenery, no frame, no dividing lines.',
  'No text, no labels, no letters, no numbers, no arrows, no logos, no watermark.',
];

export function buildTurnaroundPrompt(): string {
  return checked(
    [
      TURNAROUND_SAME_CHARACTER,
      '',
      TURNAROUND_LAYOUT,
      '',
      'From left to right:',
      ...TURNAROUND_VIEWS.map((t, i) => `${i + 1}. ${t}`),
      '',
      ...TURNAROUND_POSITIVE_RULES.map((t) => `- ${t}`),
      ...TURNAROUND_RULES.map((t) => `- ${t}`),
    ].join('\n'),
  );
}

// ───────── 사진 살피기(비전 모델)

export const VISION_INSTRUCTIONS = [
  'A user uploaded this image to turn it into a cartoon character of themselves.',
  'Check it and answer only with the JSON object.',
  '- isPhotoOfPerson: true if the image clearly shows a human being (a photo, or a drawing or painting of a human). False for pets, objects, scenery, screenshots of text, or when no human is visible.',
  '- personCount: how many distinct humans are visible, including partly visible people and people in the background. 0 if none.',
  '- likelyUnder14: true if any visible human may be younger than 14 years old. Babies, children and young teenagers count. If you are not sure that everyone visible is at least 14, answer true.',
  '- uncertain: true if the image is too blurry, dark, small, cropped or unusual to judge these things with confidence.',
  'Do not describe or identify the person.',
].join('\n');

export const VISION_SCHEMA = {
  type: 'object',
  properties: {
    isPhotoOfPerson: { type: 'boolean' },
    personCount: { type: 'integer' },
    likelyUnder14: { type: 'boolean' },
    uncertain: { type: 'boolean' },
  },
  required: ['isPhotoOfPerson', 'personCount', 'likelyUnder14', 'uncertain'],
  additionalProperties: false,
} as const;

// ───────── 방향 그림 시트 살피기(비전 모델): 그림마다 어느 방향이고 코가 어느 쪽을 가리키는지
// 일꾼은 살갗 색으로 먼저 가리고(sheet.ts의 facingSides) 이 답으로 확인한다. 낱말은 sheet.ts의 VIEW_ORDER와 같아야 한다.

export const SHEET_VIEWS_INSTRUCTIONS = [
  'The image is a character turnaround sheet: several full-body drawings of the same cartoon character on a plain background, seen from different angles.',
  'List the drawings in reading order (top row first, left to right). For each drawing answer:',
  '- view: "front" (we see the whole face straight on), "three_quarter_front" (we see the face, turned partly to one side), "side" (a full profile: one eye, the nose points sideways), "three_quarter_back" (we mostly see the back of the head and only a sliver of cheek or ear), or "back" (no face at all).',
  '- nose: which edge of the picture the nose points toward: "left" or "right". Use "none" for front and back views.',
  'Answer only with the JSON object.',
].join('\n');

export const SHEET_VIEWS_SCHEMA = {
  type: 'object',
  properties: {
    figures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['front', 'three_quarter_front', 'side', 'three_quarter_back', 'back'] },
          nose: { type: 'string', enum: ['left', 'right', 'none'] },
        },
        required: ['view', 'nose'],
        additionalProperties: false,
      },
    },
  },
  required: ['figures'],
  additionalProperties: false,
} as const;
