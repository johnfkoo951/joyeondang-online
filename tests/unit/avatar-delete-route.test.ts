// 걷기 화면의 「칸 비우기」가 부르는 DELETE /api/avatar/[id].
// 화면은 404를 「이미 지워졌다」로 읽어 지웠다고 알리므로, 로그인 끊김·권한 없음·읽기 실패는 404가 아닌 답을 줘야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');
function inOrder(text: string, steps: string[]): void {
  const at = steps.map((s) => text.indexOf(s));
  assert.deepEqual(at.map((i) => i >= 0), steps.map(() => true), `빠진 단계: ${steps.filter((_, k) => at[k] < 0).join(', ')}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, `순서가 다르다: ${steps.join(' → ')}`);
}

const route = read('app/api/avatar/[id]/route.ts');
const del = route.slice(route.indexOf('export async function DELETE'), route.indexOf('function sameOrigin'));
const panel = read('components/walk/CharacterPanel.tsx');

test('지우기 길: 역할 확인 실패 503 → 로그인 끊김 401 → 손님 아님 403 → 읽기 오류 503 → 없는 줄만 404 → 지우기', () => {
  inOrder(del, [
    'sameOrigin(request)', 'getViewer()', 'if (viewer.unsure) return new Response(null, { status: 503',
    'if (!viewer.signedIn) return new Response(null, { status: 401', "canSee(viewer.role, 'guests')", 'status: 403',
    '.maybeSingle()', 'if (error) return new Response(null, { status: 503', "r.status === 'deleted') return new Response('Not found', HIDDEN)",
    'forgetAvatar(',
  ]);
  assert.equal((del.match(/HIDDEN/g) ?? []).length, 2, '404는 모양이 틀린 요청과 없는 줄에만');
});

test('칸 비우기 화면: 404만 지운 것으로 치고, 401·403은 까닭을 알린다', () => {
  const empty = panel.slice(panel.indexOf('const empty = async'), panel.indexOf('const make = () =>'));
  inOrder(empty, ["method: 'DELETE'", 'res.ok || res.status === 404', 'res?.status === 401', '로그인이 끊겼어요', 'res?.status === 403', '지금은 지우지 못했어요']);
});
