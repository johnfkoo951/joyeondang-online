// 구독 프록시(이 맥의 localhost)로 사진 살피기와 그리기. 프롬프트·판정 규칙은 사이트와 같은 파일을 그대로 쓴다.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { editImage, visionCheck } from '../../src/lib/avatar/openai.ts';
import {
  SHEET_VIEWS_INSTRUCTIONS, SHEET_VIEWS_SCHEMA, VISION_INSTRUCTIONS, VISION_SCHEMA, buildAvatarPrompt, buildTurnaroundPrompt,
} from '../../src/lib/avatar/prompt.ts';
import { OUTPUT_SIZE, parseVisionCheck } from '../../src/lib/avatar/rules.ts';
import { SHEET_SIZE, parseSheetViews } from '../../src/lib/avatar/sheet.ts';

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

/**
 * 사진 살피기 답의 요약(원본 에셋 기록의 판독 결과): 사람 수, 사람 사진인가, 아이로 보이는가, 애매한가.
 * 판정은 parseVisionCheck가 따로 한다(이 요약은 기록용). 답의 모양이 다르면 null. 사진에 관한 다른 말은 담지 않는다
 */
export function visionSummary(text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  if (Number.isInteger(o.personCount) && o.personCount >= 0 && o.personCount < 100) out.person_count = o.personCount;
  if (typeof o.isPhotoOfPerson === 'boolean') out.photo_of_person = o.isPhotoOfPerson;
  if (typeof o.likelyUnder14 === 'boolean') out.likely_under14 = o.likelyUnder14;
  if (typeof o.uncertain === 'boolean') out.uncertain = o.uncertain;
  return out;
}

/** image: 그림 어댑터(image.mjs). 방향 그림 시트를 비전 모델에 보여 줄 때만 쓴다 */
export function createProxy({ baseUrl = DEFAULT_BASE_URL, apiKey, visionModel, imageModel, image: tools = null }) {
  if (!apiKey) throw new Error('proxy api key missing');
  const vision = MODEL_ID.test(visionModel ?? '') ? visionModel : 'gpt-6-luna';
  const image = MODEL_ID.test(imageModel ?? '') ? imageModel : 'gpt-image-2.6-flare';
  return {
    visionModel: vision,
    imageModel: image,
    /**
     * 판정({ok} 또는 {ok:false, reason, message})에 판독 요약(summary, 기록용)을 붙인다.
     */
    async check(bytes, mime, uid) {
      const r = await visionCheck({
        apiKey, baseUrl, model: vision, image: bytes, mime,
        instructions: VISION_INSTRUCTIONS, schema: VISION_SCHEMA, safetyId: safetyId(uid), timeoutMs: 90_000,
      });
      if (r.refused) return { ...parseVisionCheck(null), summary: null };
      return { ...parseVisionCheck(r.text), summary: visionSummary(r.text) };
    },
    async draw(bytes, mime, uid) {
      const r = await editImage({
        apiKey, baseUrl, model: image, image: bytes, mime, prompt: buildAvatarPrompt(),
        size: OUTPUT_SIZE, quality: 'medium', complexity: 'medium', background: 'transparent',
        safetyId: safetyId(uid), timeoutMs: 240_000,
      });
      return { png: r.png, model: image, usage: r.usage };
    },
    /** 캐릭터 그림 한 장 → 같은 캐릭터의 다섯 방향을 한 줄에 그린 시트(투명 PNG). 돌아오는 크기는 모델마다 달라서 가리지 않는다 */
    async turnaround(png, uid) {
      const r = await editImage({
        apiKey, baseUrl, model: image, image: png, mime: 'image/png', prompt: buildTurnaroundPrompt(),
        size: SHEET_SIZE, quality: 'medium', background: 'transparent',
        safetyId: safetyId(uid), timeoutMs: 240_000,
      });
      return { png: r.png, model: image, usage: r.usage };
    },
    /** 시트의 그림마다 방향과 코가 가리키는 쪽: [{view, nose}] 또는 null(거절했거나 답의 모양이 다름) */
    async sheetViews(png, uid) {
      if (!tools) throw new Error('image tools missing');
      const r = await visionCheck({
        apiKey, baseUrl, model: vision, image: await tools.previewJpeg(png), mime: 'image/jpeg',
        instructions: SHEET_VIEWS_INSTRUCTIONS, schema: SHEET_VIEWS_SCHEMA, schemaName: 'sheet_views',
        ...(uid ? { safetyId: safetyId(uid) } : {}), timeoutMs: 90_000,
      });
      return r.refused ? null : parseSheetViews(r.text);
    },
  };
}
