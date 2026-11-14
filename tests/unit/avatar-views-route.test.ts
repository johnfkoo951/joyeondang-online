// 걷기용 파생 파일 주소(GET /api/avatar/<id>/views, GET /api/avatar/<id>/model)가 지키는 약속을 라우트의 글에서 확인한다.
// 라우트는 Next 서버 안에서만 돌아 여기서 부를 수 없다. 권한 자체는 DB가 판정하고
// tests/sql/avatar-views.test.mjs와 tests/sql/avatar-models.test.mjs가 본다. 404의 머리는 tests/unit/avatar-assets.test.ts가 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(`../../src/app/api/avatar/${rel}`, import.meta.url), 'utf8');
/** GET 함수의 몸통만(같은 파일의 다른 함수와 섞이지 않게) */
function getBody(src: string): string {
  const from = src.indexOf('export async function GET');
  const next = src.indexOf('\nexport async function ', from + 1);
  return src.slice(from, next < 0 ? undefined : next);
}
const views = read('[id]/views/route.ts');
const model = read('[id]/model/route.ts');
const single = read('[id]/route.ts');

/** 적힌 순서대로 나오는가 */
function inOrder(body: string, steps: string[]): void {
  const at = steps.map((s) => body.indexOf(s));
  assert.deepEqual(at.map((i) => i >= 0), steps.map(() => true), `빠진 단계: ${steps.filter((_, k) => at[k] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `순서가 다르다: ${steps.join(' → ')}`);
}

test('묶음·모형 주소는 그림 한 장과 같은 순서로 확인한다: uuid → 명단 손님 → 경로 함수 → 보는 사람의 세션으로 내려받기', () => {
  inOrder(getBody(views), ['await connection()', 'isUuid(id)', 'getViewer()', "canSee(viewer.role, 'guests')",
    "rpc('avatar_views_path', { p_id: id, p_size: size })", '.download(path)']);
  inOrder(getBody(model), ['await connection()', 'isUuid(id)', 'getViewer()', "canSee(viewer.role, 'guests')",
    "rpc('avatar_model_path', { p_id: id })", '.download(path)']);
  inOrder(getBody(single), ['await connection()', 'isUuid(id)', 'getViewer()', "canSee(viewer.role, 'guests')",
    "rpc('avatar_char_path', { p_id: id })", '.download(path)']);
  // 비밀 키를 쓰지 않는다: 읽기는 보는 사람의 세션으로만 해서 DB 함수와 저장소 정책이 한 번씩 더 막게 한다
  for (const src of [views, model, single]) assert.doesNotMatch(src, /createAvatarAdmin|SECRET_KEY/);
});

test('묶음 주소의 답: WebP, 본인 브라우저에만 한 시간, 색인 금지. s는 l·s만 받고 그 밖은 l', () => {
  const body = getBody(views);
  assert.match(body, /'Content-Type': 'image\/webp'/);
  assert.match(body, /'Cache-Control': 'private, max-age=3600'/);
  assert.match(body, /'X-Robots-Tag': 'noindex'/);
  assert.match(body, /searchParams\.get\('s'\) === 's' \? 's' : 'l'/);
});

test('모형 주소의 답: model/gltf-binary, 본인 브라우저에만 한 시간, 색인 금지', () => {
  const body = getBody(model);
  assert.match(body, /'Content-Type': MODEL_TYPE/);
  assert.match(model, /import \{ MODEL_TYPE \} from '@\/lib\/avatar\/model';/);
  assert.match(body, /'Cache-Control': 'private, max-age=3600'/);
  assert.match(body, /'X-Robots-Tag': 'noindex'/);
});

test('없거나 볼 수 없으면 본문 없는 404에 X-Avatar-Asset: uuid가 아님·명단 밖(확인됐을 때)은 none, 파일이 없으면 DB에 물어 pending|none, 오류·역할 확인 실패는 머리 없이', () => {
  for (const [name, src, kind, fn] of [['views', views, 'views', 'avatar_views_path'], ['model', model, 'model', 'avatar_model_path']] as const) {
    const body = getBody(src);
    assert.doesNotMatch(src, /new Response\(null, HIDDEN\)|const HIDDEN/, `${name}: 404는 hiddenAsset 한 길로`);
    const known = [...body.matchAll(/hiddenAsset\(('none'|null|noFunction\(error\) \? 'none' : null|viewer\.unsure \? null : 'none')\)/g)].map((m) => m[1]);
    assert.equal(known.length, [...body.matchAll(/hiddenAsset\(/g)].length, `${name}: 404의 모양은 아래 넷뿐`);
    // 명단 밖도 역할을 확인하지 못했으면(몰릴 때 잠깐) none으로 굳히지 않는다: 걷기 엔진은 none이면 그 화면에서 다시 묻지 않는다
    assert.deepEqual(known, ["'none'", "viewer.unsure ? null : 'none'", "noFunction(error) ? 'none' : null", 'null'],
      `${name}: uuid가 아님, 명단 밖, 경로 함수 오류, 파일 없음`);
    inOrder(body, ["if (!isUuid(id)) return hiddenAsset('none')", "if (!canSee(viewer.role, 'guests')) return hiddenAsset(viewer.unsure ? null : 'none')",
      `rpc('${fn}'`, 'if (error) return hiddenAsset(noFunction(error)', `return missingAsset(supabase, id, '${kind}')`,
      '.download(path)', 'if (readError || !file) return hiddenAsset(null)']);
  }
});

test('미리보기 원천은 uuid를 확인한 뒤, 로그인 확인보다 먼저 본다(이 컴퓨터 미리보기는 로그인이 없다)', () => {
  inOrder(getBody(views), ['isUuid(id)', 'readPreviewAvatar(id, size)', 'previewResponse(local)', 'getViewer()']);
  inOrder(getBody(model), ['isUuid(id)', "readPreviewAvatar(id, 'model')", 'previewResponse(local)', 'getViewer()']);
  inOrder(getBody(single), ['isUuid(id)', "readPreviewAvatar(id, 'char')", 'previewResponse(local)', 'getViewer()']);
});

test('모형 주소는 GET(받기)과 POST(3D 만들기 요청, 0021)만 연다. 지우기는 그림 주소의 DELETE가 모형까지 함께 한다', () => {
  assert.deepEqual([...model.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]), ['GET', 'POST']);
  // 요청은 고치는 길의 같은 확인(다른 사이트·로그인·명단)을 지나고, 쉬는 중이면 받지 않으며, 판정은 DB 함수가 보는 사람의 세션으로 한다
  const post = model.slice(model.indexOf('export async function POST'));
  inOrder(post, ['await connection()', 'guestSession(request, id)', 'if (gate instanceof Response) return gate',
    'if (!modelsOn())', 'readKeep(body.value)', 'requestModel(gate.supabase, id, modelProvider(), { keep })']);
  assert.doesNotMatch(post, /createAvatarAdmin|SECRET_KEY|download\(/);
});
