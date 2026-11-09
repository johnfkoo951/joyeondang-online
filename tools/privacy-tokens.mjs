// 개인정보 검사 규칙. 여기에는 어느 집에서나 쓸 수 있는 일반 규칙만 둔다.
// 집마다 다른 금지어(이름, 동네, 길, 도면 ID)는 private/privacy-rules.mjs에 두거나
// PRIVACY_RULES 환경 변수로 파일을 가리키면 loadRules()가 합친다. 공개 레포에는 그 파일이 없다.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 어디서나 막는 것(소스, 화면 HTML, 묶인 JS) */
export const ALWAYS = [
  { id: 'cm', re: /\b\d{2,4}(\.\d+)?\s?cm\b/g, why: '실측 치수' },
  { id: 'jibun', re: /\d+\s?번지/g, why: '지번 주소' },
  { id: 'secret-key', re: /sb_secret_[A-Za-z0-9_-]{8,}/g, why: '서버 비밀 키' },
  { id: 'service-role', re: /service_role["']?\s*[:=]\s*["']eyJ/g, why: '서비스 키' },
];

/** 화면 글자에서만 막는 것(주석과 태그를 뺀 뒤 본다) */
export const TEXT_ONLY = [
  { id: 'position-name', re: /(왼쪽|오른쪽)\s?(위|아래)\s?방/g, why: '위치를 드러내는 방 이름' },
  // '남동생' 같은 낱말에 걸리지 않게 방위 낱말만 좁게 잡는다
  { id: 'orientation', re: /(남남서|남남동|동벽|서벽|남벽|북벽|남창|북창|[동서남북]향|[동서남북]쪽\s?(창|벽|문|마당))/g, why: '방위' },
];

/** private/ 폴더가 있는 저장소(원본)인지. 원본에서는 집 금지어가 꼭 있어야 한다. */
export function isPrivateRepo(root = ROOT) {
  return existsSync(join(root, 'private'));
}

/** 일반 규칙 + 이 집 금지어. 원본 저장소인데 금지어 파일을 못 읽으면 멈춘다(조용히 약해지지 않게). */
export async function loadRules(root = ROOT) {
  const p = process.env.PRIVACY_RULES || join(root, 'private', 'privacy-rules.mjs');
  if (!existsSync(p)) {
    if (isPrivateRepo(root)) throw new Error(`집 금지어 파일이 없어요: ${p}`);
    return { ALWAYS, TEXT_ONLY, houseRules: false };
  }
  const m = await import(pathToFileURL(p).href);
  return { ALWAYS: [...ALWAYS, ...(m.ALWAYS ?? [])], TEXT_ONLY: [...TEXT_ONLY, ...(m.TEXT_ONLY ?? [])], houseRules: true };
}


export function scan(text, rules, allow = new Set()) {
  const hits = [];
  for (const rule of rules) {
    if (allow.has(rule.id)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      hits.push({ id: rule.id, why: rule.why, match: m[0], index: m.index });
      if (hits.length > 200) return hits;
    }
  }
  return hits;
}

export function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
}
