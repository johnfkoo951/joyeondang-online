// 구독 프록시(이 맥의 localhost)로 사진 살피기와 그리기. 프롬프트·판정 규칙은 사이트와 같은 파일을 그대로 쓴다.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { editImage, visionCheck } from '../../src/lib/avatar/openai.ts';
import { VISION_INSTRUCTIONS, VISION_SCHEMA, buildAvatarPrompt } from '../../src/lib/avatar/prompt.ts';
import { OUTPUT_SIZE, parseVisionCheck } from '../../src/lib/avatar/rules.ts';

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'; // MBP. Mac Studio는 http://127.0.0.1:28317/v1
const MODEL_ID = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * 키 파일 한 줄 읽기. `KEY=value` 꼴의 env 파일이면 name 줄을, 아니면 파일 전체를 값으로 쓴다.
 * 값은 돌려주기만 하고 어디에도 출력하지 않는다.
 */
export function readSecretFile(path, name) {
  const text = readFileSync(path, 'utf8');
  if (name) {
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === name) return m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    }
  }
  const whole = text.trim();
  if (!whole || whole.includes('\n') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(whole)) throw new Error(`no ${name ?? 'secret'} in key file`);
  return whole;
}

/** OpenAI에 넘기는 사용자 구분값. 계정 id를 그대로 보내지 않는다 */
export const safetyId = (uid) => createHash('sha256').update(`joyeondang-avatar:${uid}`).digest('hex').slice(0, 32);

export function createProxy({ baseUrl = DEFAULT_BASE_URL, apiKey, visionModel, imageModel }) {
  if (!apiKey) throw new Error('proxy api key missing');
  const vision = MODEL_ID.test(visionModel ?? '') ? visionModel : 'gpt-6-luna';
  const image = MODEL_ID.test(imageModel ?? '') ? imageModel : 'gpt-image-2.6-flare';
  return {
    visionModel: vision,
    imageModel: image,
    async check(bytes, mime, uid) {
      const r = await visionCheck({
        apiKey, baseUrl, model: vision, image: bytes, mime,
        instructions: VISION_INSTRUCTIONS, schema: VISION_SCHEMA, safetyId: safetyId(uid), timeoutMs: 90_000,
      });
      return r.refused ? parseVisionCheck(null) : parseVisionCheck(r.text);
    },
    async draw(bytes, mime, uid) {
      const r = await editImage({
        apiKey, baseUrl, model: image, image: bytes, mime, prompt: buildAvatarPrompt(),
        size: OUTPUT_SIZE, quality: 'medium', complexity: 'medium', background: 'transparent',
        safetyId: safetyId(uid), timeoutMs: 240_000,
      });
      return { png: r.png, model: image, usage: r.usage };
    },
  };
}
