// 대화·걸은 길 주소(app/api/chat, app/api/trail, app/api/admin/trails)가 지키는 약속을 라우트의 글에서 확인한다.
// 라우트는 Next 서버 안에서만 돌아 여기서 부를 수 없다. 권한 자체는 DB가 판정하고 tests/sql/chat-trails.test.mjs가 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');
function body(src: string, fn: string): string {
  const from = src.indexOf(`export async function ${fn}`);
  assert.ok(from >= 0, fn);
  const next = src.indexOf('\nexport async function ', from + 1);
  return src.slice(from, next < 0 ? undefined : next);
}
function inOrder(text: string, steps: string[]): void {
  const at = steps.map((s) => text.indexOf(s));
  assert.deepEqual(at.map((i) => i >= 0), steps.map(() => true), `빠진 단계: ${steps.filter((_, k) => at[k] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `순서가 다르다: ${steps.join(' → ')}`);
}
const chat = read('app/api/chat/route.ts');
const me = read('app/api/chat/me/route.ts');
const del = read('app/api/chat/[id]/route.ts');
const trail = read('app/api/trail/route.ts');
const trails = read('app/api/admin/trails/route.ts');
const server = read('lib/chat-server.ts');

test('글 쓰기: 같은 사이트 → 명단 손님 → 본문 읽기 → 보는 사람의 세션으로 chat_post. sub가 없을 때만 적고 한 번 더', () => {
  inOrder(body(chat, 'POST'), ['await connection()', 'sameOrigin(request)', 'getViewer()', "canUse(viewer.role, 'realHouse')",
    'readChatInput(raw)', "rpc('chat_post'", "'no_subject'", 'ensureSubject(', '({ data, error } = await send())']);
  assert.match(body(chat, 'POST'), /readBody\(request, 8 \* 1024\)/);
});

test('글 읽기: 명단 손님만, 읽기는 보는 사람의 세션으로 chat_list(비밀 키를 쓰지 않는다)', () => {
  inOrder(body(chat, 'GET'), ['await connection()', 'getViewer()', "canUse(viewer.role, 'realHouse')", "rpc('chat_list'"]);
  for (const src of [chat, del, trail, trails]) assert.doesNotMatch(src, /SECRET_KEY|createPlainClient|chatAdmin/);
});

test('나: 서명 키 → 명단 손님 → 로그인 id → sub(gameSubject) 적기. 비밀 키는 chat_register 하나에만', () => {
  inOrder(body(me, 'GET'), ['chatSecret()', 'getViewer()', "canUse(viewer.role, 'realHouse')", 'getClaims()', 'gameSubject(uid, secret)',
    'ensureSubject(uid, sub)']);
  const rpcs = [...server.matchAll(/rpc\('([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(rpcs, ['chat_register']);
});

test('지우기·걸은 길: 같은 사이트에서만, 판정은 DB 함수, 명단 밖·없는 글은 본문 없는 404', () => {
  inOrder(body(del, 'DELETE'), ['isUuid(id)', 'sameOrigin(request)', "rpc('chat_delete'"]);
  inOrder(body(trail, 'POST'), ['sameOrigin(request)', 'readBody(', 'readTrailInput(raw, Date.now())', "rpc('trail_post'"]);
  assert.match(server, /export const HIDDEN = \{ status: 404, headers: \{ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' \} \};/);
});

test('걸은 길 읽기: 가족 이상만(걸은 길 표를 읽는 사람과 같다)', () => {
  inOrder(body(trails, 'GET'), ['getViewer()', "canSee(viewer.role, 'family')", "rpc('walk_trails_read'"]);
});
