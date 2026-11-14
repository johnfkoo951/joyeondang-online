// 걷기용 파생 파일이 없을 때의 답(src/lib/avatar/assets.ts): 404에 붙는 X-Avatar-Asset(pending|none|없음)과
// 끄기 스위치, DB 함수가 없을 때.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ASSET_HEADER, assetHint, assetOff, hiddenAsset, missingAsset, noFunction } = await import('../../src/lib/avatar/assets.ts');
const ID = '0b9d2c1e-5a4f-4e3b-9c7d-1f2a3b4c5d6e';

test('DB 답을 머리 값으로: pending·ready는 pending(조금 뒤 다시), none은 none, 그 밖은 머리 없음', () => {
  assert.equal(assetHint('pending'), 'pending');
  assert.equal(assetHint('ready'), 'pending', '경로 함수가 길을 주지 않은 바로 뒤에 생긴 것');
  assert.equal(assetHint('none'), 'none');
  for (const odd of [null, undefined, '', 'NONE', 'failed', 1, true, {}, ['none']]) assert.equal(assetHint(odd), null, JSON.stringify(odd));
});

test('404의 모양: 본문 없음, 브라우저에 남기지 않음, 색인 금지, 머리 값은 알 때만', async () => {
  for (const hint of ['pending', 'none', null] as const) {
    const res = hiddenAsset(hint);
    assert.equal(res.status, 404);
    assert.equal(await res.text(), '');
    assert.deepEqual([res.headers.get('cache-control'), res.headers.get('x-robots-tag'), res.headers.get(ASSET_HEADER)],
      ['no-store', 'noindex', hint]);
  }
  assert.equal(ASSET_HEADER, 'X-Avatar-Asset');
});

test('끄기 스위치: AVATAR_VIEWS=0은 묶음만, AVATAR_MODELS=0은 모형만. 0이 아니면 켜진 것', () => {
  assert.deepEqual([assetOff('views', { AVATAR_VIEWS: '0' }), assetOff('model', { AVATAR_VIEWS: '0' })], [true, false]);
  assert.deepEqual([assetOff('views', { AVATAR_MODELS: '0' }), assetOff('model', { AVATAR_MODELS: '0' })], [false, true]);
  for (const v of [undefined, '', '1', 'false', 'off', ' 0']) assert.equal(assetOff('model', { AVATAR_MODELS: v }), false, String(v));
});

test('DB 함수가 없다는 오류만 가려낸다(PGRST202, 42883)', () => {
  assert.equal(noFunction({ code: 'PGRST202', message: 'Could not find the function' }), true);
  assert.equal(noFunction({ code: '42883' }), true);
  for (const e of [null, undefined, {}, { code: '42501' }, { code: 'PGRST301' }, new Error('x'), 'PGRST202']) assert.equal(noFunction(e), false);
});

type Call = { fn: string; args: unknown };
function fake(answer: { data: unknown; error: unknown } | Error) {
  const calls: Call[] = [];
  return {
    calls,
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

test('파일이 없을 때: DB의 avatar_asset_state에 그 종류로 묻고 답을 머리에 붙인다', async () => {
  for (const [data, hint] of [['pending', 'pending'], ['ready', 'pending'], ['none', 'none'], ['?', null]] as const) {
    for (const kind of ['views', 'model'] as const) {
      const c = fake({ data, error: null });
      const res = await missingAsset(c, ID, kind, {});
      assert.equal(res.status, 404);
      assert.equal(res.headers.get(ASSET_HEADER), hint, `${kind} ${data}`);
      assert.deepEqual(c.calls, [{ fn: 'avatar_asset_state', args: { p_id: ID, p_kind: kind } }]);
    }
  }
});

test('파일이 없을 때: 꺼 두었으면 묻지 않고 none, DB 오류·던짐·함수가 없음은 머리 없이(알 수 없음)', async () => {
  const off = fake({ data: 'pending', error: null });
  assert.equal((await missingAsset(off, ID, 'model', { AVATAR_MODELS: '0' })).headers.get(ASSET_HEADER), 'none');
  assert.equal((await missingAsset(off, ID, 'views', { AVATAR_VIEWS: '0' })).headers.get(ASSET_HEADER), 'none');
  assert.deepEqual(off.calls, []);
  for (const answer of [{ data: 'none', error: { message: 'x' } }, { data: null, error: { code: 'PGRST202' } }, new TypeError('offline')]) {
    const res = await missingAsset(fake(answer), ID, 'model', {});
    assert.deepEqual([res.status, res.headers.get(ASSET_HEADER)], [404, null], String(answer instanceof Error ? answer.message : JSON.stringify(answer)));
  }
});
