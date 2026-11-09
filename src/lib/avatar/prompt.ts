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
  const lower = text.toLowerCase();
  const bad = FORBIDDEN_PROMPT_WORDS.find((w) => lower.includes(w));
  if (bad) throw new Error(`avatar prompt contains a forbidden phrase: ${bad}`);
  return text;
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
