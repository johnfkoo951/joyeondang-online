// 걷기 사진 갤러리에서 여러 장 고르기와 한 번에 지우기(src/lib/shots-pick.ts): 고르기 셈, 묶음마다 파일 먼저·표 나중,
// 일부만 지워졌을 때 남은 것 알리기, 묻는 말과 안내 문구. 걷기 시트의 갤러리도 같은 화면을 쓰는지 본다.
// 누구의 사진을 지울 수 있는지(본인만, 집주인 지우기)는 tests/sql/shots.test.mjs와 tests/sql/rls.test.mjs의 0022 묶음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELETE_BATCH, SHOTS_PRIVACY_LINE, allPicked, deleteInBatches, keepPicked, pickAll, pickKey, pickedDeleteAsk, pickedDeleteResult,
  pickedInOrder, togglePick, type DeleteOps,
} from '../../src/lib/shots-pick.ts';

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const shots = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, path: `u/p${i}.jpg` }));
const DASH = /[—–]/;

/** 부른 순서를 적어 두는 가짜 저장소·표. fail*에 든 묶음 번호(0부터)는 실패로 답한다 */
function fake(o: { failFiles?: number[]; failRows?: number[]; throwFiles?: number[] } = {}) {
  const log: string[] = [];
  let files = 0;
  let rows = 0;
  const ops: DeleteOps = {
    removeFiles: async (paths) => {
      const k = files++;
      log.push(`files:${paths.join(',')}`);
      if (o.throwFiles?.includes(k)) throw new Error('network');
      return !o.failFiles?.includes(k);
    },
    removeRows: async (ids) => {
      const k = rows++;
      log.push(`rows:${ids.join(',')}`);
      return !o.failRows?.includes(k);
    },
  };
  return { ops, log };
}

test('고르기: 하나씩 고르고 풀기, 모두 고르기, 목록에서 사라진 것은 뺀다', () => {
  const list = shots(3);
  let p = togglePick(new Set(), 'id1');
  assert.deepEqual([...p], ['id1']);
  p = togglePick(p, 'id2');
  p = togglePick(p, 'id1');
  assert.deepEqual([...p], ['id2'], '다시 누르면 푼다');
  const before = new Set(p);
  togglePick(p, 'id0');
  assert.deepEqual(p, before, '새 Set을 돌려주고 원래 것은 바꾸지 않는다');
  assert.equal(allPicked(p, list), false);
  const all = pickAll(list);
  assert.equal(allPicked(all, list), true);
  assert.equal(allPicked(new Set(), []), false, '사진이 없으면 모두 고른 것이 아니다');
  assert.deepEqual([...keepPicked(all, list.slice(1))].sort(), ['id1', 'id2'], '다른 창이나 집주인이 지운 사진은 뺀다');
  assert.deepEqual(pickedInOrder(list, new Set(['id2', 'id0', 'nope'])).map((s) => s.id), ['id0', 'id2'], '목록 순서로, 없는 것은 빼고');
});

test('여러 장 지우기: 묶음마다 파일을 먼저 지우고 그다음 표에서 뺀다', async () => {
  const { ops, log } = fake();
  const done = await deleteInBatches(shots(5), ops, 2);
  assert.deepEqual(done, ['id0', 'id1', 'id2', 'id3', 'id4']);
  assert.deepEqual(log, [
    'files:u/p0.jpg,u/p1.jpg', 'rows:id0,id1',
    'files:u/p2.jpg,u/p3.jpg', 'rows:id2,id3',
    'files:u/p4.jpg', 'rows:id4',
  ]);
  const big = fake();
  assert.equal((await deleteInBatches(shots(45), big.ops)).length, 45);
  assert.deepEqual(big.log.filter((l) => l.startsWith('files')).map((l) => l.split(',').length), [DELETE_BATCH, DELETE_BATCH, 5],
    `기본은 ${DELETE_BATCH}장씩`);
  assert.deepEqual(await deleteInBatches([], fake().ops), []);
});

test('여러 장 지우기: 파일 지우기가 안 된 묶음은 표에서 빼지 않고, 다음 묶음은 해 본다', async () => {
  const { ops, log } = fake({ failFiles: [1] });
  const done = await deleteInBatches(shots(5), ops, 2);
  assert.deepEqual(done, ['id0', 'id1', 'id4'], '둘째 묶음(id2, id3)은 남는다');
  assert.equal(log.includes('rows:id2,id3'), false, '파일이 남았으면 표 줄도 남긴다(갤러리에서 다시 지울 수 있게)');
  // 표 빼기가 안 되면 그 묶음도 남는다(파일은 이미 지웠으니 다시 지우면 표만 빠진다)
  const rows = fake({ failRows: [0] });
  assert.deepEqual(await deleteInBatches(shots(3), rows.ops, 2), ['id2']);
  // 연결이 끊겨 던져도 그 묶음만 실패로 치고 끝까지 간다
  const thrown = fake({ throwFiles: [0] });
  assert.deepEqual(await deleteInBatches(shots(3), thrown.ops, 2), ['id2']);
  // 같은 사진은 한 번만 보낸다
  const dup = fake();
  assert.deepEqual(await deleteInBatches([...shots(2), shots(2)[0]], dup.ops), ['id0', 'id1']);
  assert.deepEqual(dup.log, ['files:u/p0.jpg,u/p1.jpg', 'rows:id0,id1']);
});

test('묻는 말과 결과: 다 지움, 하나도 못 지움, 일부만(남은 장수와 할 일)', () => {
  assert.equal(pickedDeleteAsk(3), '3장을 지울까요? 되돌릴 수 없어요.');
  assert.equal(pickedDeleteAsk(60), '60장을 지울까요? 되돌릴 수 없어요.');
  assert.equal(pickedDeleteResult(3, 3), '3장을 지웠어요.');
  assert.equal(pickedDeleteResult(4, 0), '지우지 못했어요. 고른 4장은 그대로 있어요. 잠시 뒤에 다시 지워 주세요.');
  assert.equal(pickedDeleteResult(25, 20), '25장 가운데 20장을 지웠어요. 남은 5장은 고른 채로 두었어요. 잠시 뒤에 다시 지워 주세요.');
  assert.equal(pickedDeleteResult(0, 0), '');
  for (const t of [pickedDeleteAsk(2), pickedDeleteResult(2, 2), pickedDeleteResult(2, 0), pickedDeleteResult(3, 1)]) {
    assert.doesNotMatch(t, DASH, t);
    assert.doesNotMatch(t, /[A-Za-z_]/, '영어 글자를 보이지 않는다');
  }
});

test('안내 한 줄: 나만 보고, 집주인은 사진을 보지 않지만 사람마다(누구의 사진이든) 또는 행사마다 지울 수 있다(짧게, 엠대시 없이)', () => {
  assert.equal(SHOTS_PRIVACY_LINE, '나만 볼 수 있어요. 집주인은 사진을 보지 않지만, 필요하면 사람마다 또는 행사마다 한꺼번에 지울 수 있어요.');
  assert.doesNotMatch(SHOTS_PRIVACY_LINE, DASH);
  // 실제 동작보다 좁게 말하지 않는다: 집주인은 손님 사진만이 아니라 가족·집주인 것도 사람마다 지운다(0022)
  assert.doesNotMatch(SHOTS_PRIVACY_LINE, /손님 사진/);
  // 갤러리와 개인정보 안내가 같은 줄을 쓴다. 예전 문구(「나만 볼 수 있고」)는 남지 않는다
  const gallery = src('app/gallery/page.tsx');
  const privacy = src('app/privacy/page.tsx');
  for (const page of [gallery, privacy]) {
    assert.match(page, /import \{ SHOTS_PRIVACY_LINE \} from '@\/lib\/shots-pick'/);
    assert.match(page, /\{SHOTS_PRIVACY_LINE\}/);
  }
  assert.doesNotMatch(gallery, /나만 볼 수 있고/);
  assert.match(gallery, /60장까지 담겨요/);
  assert.match(privacy, /걷기 화면에서 찍은 사진/, '받는 것에 걷기 사진이 있다');
  assert.match(privacy, /여러 장을 골라 한꺼번에 지울 수 있어요/, '지우는 법에 여러 장 지우기가 있다');
  const shotLines = privacy.split('\n').filter((l) => /걷기 사진|걷기 화면에서 찍은 사진/.test(l));
  assert.equal(shotLines.length, 3, '받는 것, 누가 보나요, 지우는 법');
  for (const l of shotLines) assert.doesNotMatch(l, DASH, l);
  // 지우는 법: 집주인이 지우면 표 줄 없는 파일까지(폴더 훑기), 계정을 지워도 파일까지(트리거), 서버가 차례로 지워 늦을 수 있다
  const how = shotLines[2];
  assert.match(how, /집주인이 지우면 올리다 끊겨 갤러리에 안 보이던 파일까지 지워요/);
  assert.match(how, /계정을 지울 때도 사진 파일을 지워요/);
  assert.match(how, /조금 늦게 사라질 수 있어요/);
});

test('고르는 중 Esc: 고르기를 끝내고(지우는 중이면 잡기만), 한글 조합 중·이미 처리된 키·열린 창·다른 키는 건드리지 않는다', () => {
  const closed = { busy: false, dialogOpen: () => false };
  const esc = (o: Record<string, unknown> = {}) => ({ key: 'Escape', ...o });
  assert.equal(pickKey(esc(), closed), 'stop');
  assert.equal(pickKey(esc(), { busy: true, dialogOpen: () => false }), 'hold', '지우는 중에는 고르기를 끝내지 않는다(그래도 시트는 닫히지 않게 잡는다)');
  for (const e of [esc({ isComposing: true }), esc({ keyCode: 229 }), esc({ defaultPrevented: true }), { key: 'Enter' }, { key: 'a' }]) {
    assert.equal(pickKey(e, closed), 'pass', JSON.stringify(e));
  }
  assert.equal(pickKey(esc(), { busy: false, dialogOpen: () => true }), 'pass', '크게 보기 창이 떠 있으면 그 창의 몫');
  let asked = 0;
  pickKey({ key: 'a' }, { busy: false, dialogOpen: () => (asked += 1) > 0 });
  assert.equal(asked, 0, 'Esc가 아니면 열린 창을 찾지 않는다');
  // 갤러리는 이 판정을 그대로 쓴다: pass가 아니면 기본 동작을 막고(걷기 시트가 같이 닫히지 않게), stop일 때만 끝낸다
  const client = src('app/gallery/GalleryClient.tsx');
  assert.match(client, /const act = pickKey\(e, \{ busy, dialogOpen: \(\) => Boolean\(document\.querySelector\('dialog\[open\]'\)\) \}\);/);
  assert.match(client, /if \(act === 'pass'\) return;\s*e\.preventDefault\(\);\s*if \(act === 'stop'\) stopSelecting\(\);/);
  assert.match(client, /window\.addEventListener\('keydown', onKey, true\)/, '시트보다 먼저 잡는다(capture)');
});

test('갤러리 화면: 고르기에 들어가야 사진이 고르기로 바뀌고, 지우기 전에 묻는다. 걷기 시트도 같은 화면을 쓴다', () => {
  const client = src('app/gallery/GalleryClient.tsx');
  assert.match(client, /여러 장 고르기/);
  assert.match(client, /모두 고르기/);
  assert.match(client, /고르기 끝내기/);
  const ask = client.indexOf('window.confirm(pickedDeleteAsk(list.length))');
  const del = client.indexOf('deleteShots(list)');
  assert.ok(ask > 0 && del > ask, '묻고 나서 지운다');
  assert.match(client, /pickedDeleteResult\(list\.length, done\.size\)/, '결과(일부만 지웠으면 남은 것)를 알린다');
  const sheet = src('app/walk/@sheet/(..)gallery/page.tsx');
  assert.match(sheet, /import GalleryPage from '@\/app\/gallery\/page'/, '걷기 시트의 갤러리는 같은 페이지를 그린다');
  assert.match(sheet, /<GalleryPage \/>/);
  // 지우기 순서는 deleteInBatches를 따른다(파일 먼저, 표 나중)
  const lib = src('lib/shots.ts');
  assert.match(lib, /export async function deleteShots/);
  assert.match(lib, /deleteInBatches\(list,/);
});
