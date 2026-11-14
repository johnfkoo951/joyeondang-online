// 함께 걷기 출입증 주소(GET /api/game-token)가 지키는 약속을 라우트의 글에서 확인한다.
// 라우트는 Next 서버 안에서만 돌아 여기서 부를 수 없다. 관전 출입증(?observe=1)은 가족·관리자만, 역할 observer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../src/app/api/game-token/route.ts', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export async function GET'));

/** 적힌 순서대로 나오는가 */
function inOrder(text: string, steps: string[]): void {
  const at = steps.map((s) => text.indexOf(s));
  assert.deepEqual(at.map((i) => i >= 0), steps.map(() => true), `빠진 단계: ${steps.filter((_, k) => at[k] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `순서가 다르다: ${steps.join(' → ')}`);
}

test('관전 출입증은 ?observe=1일 때만, 가족 이상만(손님은 아니다) 역할 observer로 준다', () => {
  inOrder(body, ['await connection()', "searchParams.get('observe') === '1'", 'getViewer()',
    "observe ? canSee(viewer.role, 'family') : canUse(viewer.role, 'realHouse')", "role = observe ? 'observer' : (viewer.role as GameRole)",
    'signGameToken(']);
});

test('그 밖에는 있는지조차 알리지 않는 404이고, 이 컴퓨터의 미리보기만 예외(관전도 같은 규칙)', () => {
  assert.match(src, /const HIDDEN = \{ status: 404, headers: \{ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' \} \};/);
  inOrder(body, ['} else if (await previewForRequest()) {', "role = observe ? 'observer' : 'guest';", 'uid = `preview:${randomUUID()}`;',
    "} else {\n    return new Response('Not found', HIDDEN);\n  }"]);
});

test('관전자는 남에게 보이지 않으므로 겉모습을 싣지 않는다(프로필을 읽지도 않는다)', () => {
  assert.match(body, /const look = observe \? undefined : await loadMyLook\(viewer\);/);
  assert.match(body, /\.\.\.\(look \? \{ look \} : \{\}\)/);
});
