// 공개 빌드 개인정보 검사. 하나라도 걸리면 exit 1 → 배포를 막는다.
//   node tools/privacy-gate.mjs          소스·공개 파일·원고만
//   node tools/privacy-gate.mjs --build  + .next 빌드 결과(HTML 글자, 클라이언트 JS)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules, scan, stripTags } from './privacy-tokens.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const withBuild = process.argv.includes('--build');
const { ALWAYS, TEXT_ONLY, houseRules } = await loadRules(ROOT);

function loadAllow() {
  const p = join(ROOT, 'privacy-allow.json');
  if (!existsSync(p)) return new Set();
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return new Set((j.allow ?? []).filter((a) => a.id && a.why).map((a) => a.id));
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const TEXT_EXT = /\.(ts|tsx|mjs|js|css|json|md|txt|html|svg|rsc|webmanifest)$/;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const allow = loadAllow();
const findings = [];
function check(file, text, rules) {
  for (const h of scan(text, rules, allow)) findings.push({ file: relative(ROOT, file), ...h });
}

// 1. 소스와 공개 파일: 항상 금지 목록
for (const f of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'public'))]) {
  if (!TEXT_EXT.test(f)) continue;
  check(f, readFileSync(f, 'utf8'), ALWAYS);
}
// 2. 화면 글이 사는 곳(방, 전시 원고): 주석을 뺀 글자에 방 ID·위치 이름·방위까지
for (const f of walk(join(ROOT, 'src', 'content'))) {
  if (!/\.ts$/.test(f)) continue;
  check(f, stripComments(readFileSync(f, 'utf8')), TEXT_ONLY);
}
// 3. 빌드 결과
if (withBuild) {
  const out = join(ROOT, '.next');
  if (!existsSync(out)) {
    console.error('빌드 결과(.next)가 없어요. npm run build 뒤에 다시 돌려 주세요.');
    process.exit(2);
  }
  for (const f of walk(join(out, 'server', 'app'))) {
    if (/\.html$/.test(f)) {
      const raw = readFileSync(f, 'utf8');
      check(f, raw, ALWAYS);
      check(f, stripTags(raw), TEXT_ONLY);
    } else if (/\.(rsc|body|meta)$/.test(f)) {
      check(f, readFileSync(f, 'utf8'), ALWAYS);
    }
  }
  for (const f of walk(join(out, 'static'))) {
    if (/\.(js|css)$/.test(f)) check(f, readFileSync(f, 'utf8'), ALWAYS);
  }
}

if (findings.length) {
  console.error(`개인정보 검사: ${findings.length}건 걸림. 배포하지 않습니다.`);
  for (const h of findings.slice(0, 60)) console.error(`  ${h.file}  [${h.id}] "${h.match}"  (${h.why})`);
  process.exit(1);
}
console.log(`개인정보 검사 통과${withBuild ? ' (빌드 결과 포함)' : ''}${houseRules ? '' : ' (일반 규칙만: 집 금지어 파일 없음)'}. 허용 예외: ${allow.size ? [...allow].join(', ') : '없음'}`);
