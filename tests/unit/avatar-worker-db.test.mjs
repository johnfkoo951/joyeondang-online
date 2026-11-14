// 일꾼의 DB·저장소 어댑터(worker/avatar/supabase.mjs): 가짜 연결로 DB 함수에 넘기는 이름과 인자, 돌려주는 값의 모양을 본다.
// 그 이름과 인자가 진짜 DB 함수와 맞는지는 tests/sql/avatar-views.test.mjs가 같은 어댑터로 PGlite를 부르며 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUCKET, sweepViewStrays, wrapSupabase } from '../../worker/avatar/supabase.mjs';
import { charPath, originalPath, viewsPath } from '../../src/lib/avatar/rules.ts';

const UID = '00000000-0000-4000-8000-0000000000a1';
const ID = '0b9d2c1e-5a4f-4e3b-9c7d-1f2a3b4c5d6e';
const MODEL = 'gpt-image-2.6-flare';

/** rpc와 저장소 호출을 적어 두고, 정해 준 답을 돌려주는 가짜 연결 */
function fakeSb({ answers = {}, removeError = null } = {}) {
  const calls = [];
  const store = [];
  return {
    calls,
    store,
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      return fn in answers ? answers[fn] : { data: null, error: null };
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, bytes, options) => { store.push(['upload', bucket, path, bytes.length, options]); return { error: null }; },
        download: async (path) => { store.push(['download', bucket, path]); return { data: new Blob([new Uint8Array([1, 2, 3])]), error: null }; },
        remove: async (paths) => { store.push(['remove', bucket, paths]); return { data: [], error: removeError }; },
      }),
    },
  };
}
const ok = (data) => ({ data, error: null });

test('방향 그림: DB 함수에 넘기는 이름과 인자(0015의 함수 시그니처와 같아야 한다)', async () => {
  const sb = fakeSb();
  const { db } = wrapSupabase(sb);
  await db.viewsClaim('worker-1', 1200);
  await db.viewsRelease(ID, 'worker-1', 240);
  await db.viewsRelease(ID, 'worker-1', 120, true); // 시트 탓 실패로 따로 센다
  await db.viewsSettle(ID, 'ready', { mode: 'frontback', model: MODEL, worker: 'worker-1' });
  await db.viewsSettle(ID, 'failed', { reason: 'blocked', worker: 'worker-1' });
  await db.viewsSettle(ID, 'failed');
  await db.viewsStrays();
  await db.viewsStrays(7);
  assert.deepEqual(sb.calls, [
    ['avatar_views_claim', { p_worker: 'worker-1', p_lease_seconds: 1200 }],
    ['avatar_views_release', { p_id: ID, p_worker: 'worker-1', p_delay_seconds: 240, p_sheet: false }],
    ['avatar_views_release', { p_id: ID, p_worker: 'worker-1', p_delay_seconds: 120, p_sheet: true }],
    ['avatar_views_settle', { p_id: ID, p_status: 'ready', p_mode: 'frontback', p_model: MODEL, p_reason: null, p_worker: 'worker-1' }],
    ['avatar_views_settle', { p_id: ID, p_status: 'failed', p_mode: null, p_model: null, p_reason: 'blocked', p_worker: 'worker-1' }],
    ['avatar_views_settle', { p_id: ID, p_status: 'failed', p_mode: null, p_model: null, p_reason: null, p_worker: null }],
    ['avatar_views_strays', { p_limit: 100 }],
    ['avatar_views_strays', { p_limit: 7 }],
  ]);
});

test('방향 그림: 잡은 것은 그대로, 할 일이 없으면 null. 돌려놓기와 정리는 DB가 true라고 할 때만 true', async () => {
  const job = { id: ID, user_id: UID, image_path: charPath(UID, ID), attempts: 2 };
  assert.deepEqual(await wrapSupabase(fakeSb({ answers: { avatar_views_claim: ok(job) } })).db.viewsClaim('w', 600), job);
  for (const nothing of [null, undefined]) {
    assert.equal(await wrapSupabase(fakeSb({ answers: { avatar_views_claim: ok(nothing) } })).db.viewsClaim('w', 600), null);
  }
  for (const [data, want] of [[true, true], [false, false], [null, false], ['true', false], [1, false], [{}, false]]) {
    const { db } = wrapSupabase(fakeSb({ answers: { avatar_views_release: ok(data), avatar_views_settle: ok(data) } }));
    assert.equal(await db.viewsRelease(ID, 'w', 0), want, JSON.stringify(data));
    assert.equal(await db.viewsSettle(ID, 'ready', { mode: 'full', model: MODEL }), want, JSON.stringify(data));
  }
});

test('방향 그림: DB가 오류로 답하면 db_error로 던진다(0015를 올리기 전에는 함수가 없다는 오류가 온다)', async () => {
  const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.avatar_views_claim' } };
  const { db } = wrapSupabase(fakeSb({ answers: {
    avatar_views_claim: missing, avatar_views_release: missing, avatar_views_settle: missing, avatar_views_strays: missing,
  } }));
  for (const call of [() => db.viewsClaim('w', 600), () => db.viewsRelease(ID, 'w', 0), () => db.viewsSettle(ID, 'ready'), () => db.viewsStrays()]) {
    await assert.rejects(call(), (e) => e.code === 'db_error' && /avatar_views_/.test(e.message));
  }
});

test('남은 파일 찾기: 이름(문자열)만 돌려준다. 뜻밖의 답은 빈 목록', async () => {
  const names = [viewsPath(UID, ID, 'l'), viewsPath(UID, ID, 's')];
  assert.deepEqual(await wrapSupabase(fakeSb({ answers: { avatar_views_strays: ok(names) } })).db.viewsStrays(), names);
  assert.deepEqual(await wrapSupabase(fakeSb({ answers: { avatar_views_strays: ok([names[0], null, 3, { name: 'x' }]) } })).db.viewsStrays(), [names[0]]);
  for (const odd of [null, undefined, 'x', { name: names[0] }, 0]) {
    assert.deepEqual(await wrapSupabase(fakeSb({ answers: { avatar_views_strays: ok(odd) } })).db.viewsStrays(), [], JSON.stringify(odd));
  }
});

test('남은 묶음 파일 치우기: 묶음 파일 모양의 이름만 저장소에서 지우고 그 수를 돌려준다', async () => {
  const strays = [viewsPath(UID, ID, 'l'), viewsPath(UID, ID, 's')];
  // DB가 잘못된 이름을 섞어 주어도 원본 사진과 캐릭터 그림, 다른 모양의 이름은 지우지 않는다
  const never = [charPath(UID, ID), originalPath(UID, ID, 'image/jpeg'), `${UID}/views/${ID}.v2l.webp`, `${UID}/views/x/${ID}.v1l.webp`,
    `${viewsPath(UID, ID, 'l')}.bak`, `x/${viewsPath(UID, ID, 'l')}`, `${UID}/views/`, ''];
  const sb = fakeSb({ answers: { avatar_views_strays: ok([...never, ...strays]) } });
  assert.equal(await sweepViewStrays(wrapSupabase(sb), 50), 2);
  assert.deepEqual(sb.calls, [['avatar_views_strays', { p_limit: 50 }]]);
  assert.deepEqual(sb.store, [['remove', BUCKET, strays]]);
});

test('남은 묶음 파일 치우기: 남은 것이 없으면 저장소를 부르지 않고, 저장소가 못 지우면 던진다(다음에 다시 한다)', async () => {
  const none = fakeSb({ answers: { avatar_views_strays: ok([]) } });
  assert.equal(await sweepViewStrays(wrapSupabase(none)), 0);
  assert.deepEqual(none.store, []);
  const only = fakeSb({ answers: { avatar_views_strays: ok([charPath(UID, ID)]) } });
  assert.equal(await sweepViewStrays(wrapSupabase(only)), 0);
  assert.deepEqual(only.store, []);
  const broken = fakeSb({ answers: { avatar_views_strays: ok([viewsPath(UID, ID, 's')]) }, removeError: { message: 'offline' } });
  await assert.rejects(sweepViewStrays(wrapSupabase(broken)), (e) => e.code === 'storage_error');
});

test('한 장 그림과 저장소: 이름·인자·버킷은 전과 같다', async () => {
  const sb = fakeSb({ answers: { avatar_settle: ok(true), avatar_release: ok(true) } });
  const { db, store } = wrapSupabase(sb);
  await db.claim('w', 600);
  await db.release(ID, 'w', 60);
  assert.equal(await db.settle(ID, 'ready', { imagePath: charPath(UID, ID), model: MODEL }), true);
  await db.beat('w', 'avatar-worker-2');
  assert.deepEqual(sb.calls, [
    ['avatar_claim', { p_worker: 'w', p_lease_seconds: 600 }],
    ['avatar_release', { p_id: ID, p_worker: 'w', p_delay_seconds: 60 }],
    ['avatar_settle', { p_id: ID, p_status: 'ready', p_original_path: null, p_image_path: charPath(UID, ID), p_model: MODEL, p_reason: null }],
    ['avatar_worker_beat', { p_worker: 'w', p_version: 'avatar-worker-2' }],
  ]);
  assert.equal(BUCKET, 'avatars');
  await store.upload(viewsPath(UID, ID, 'l'), new Uint8Array(5), 'image/webp');
  assert.deepEqual([...await store.download(charPath(UID, ID))], [1, 2, 3]);
  await store.remove([viewsPath(UID, ID, 'l')]);
  assert.deepEqual(sb.store, [
    ['upload', 'avatars', viewsPath(UID, ID, 'l'), 5, { contentType: 'image/webp', upsert: true }],
    ['download', 'avatars', charPath(UID, ID)],
    ['remove', 'avatars', [viewsPath(UID, ID, 'l')]],
  ]);
});
