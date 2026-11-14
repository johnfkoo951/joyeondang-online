// 0015_avatar_views.sql을 그 앞의 마이그레이션 전부 위에 올려(PGlite) 사진 캐릭터 방향 그림 묶음을 확인한다:
// 잡기·돌려놓기·정리(일꾼), 경로 함수와 저장소 읽기 정책(손님), 지우기가 묶음 칸을 비우는지, 남은 파일 찾기,
// 그리고 일꾼의 어댑터(worker/avatar/supabase.mjs)가 부르는 이름과 인자가 이 마이그레이션과 맞는지.
// 맨 끝에서는 0003 시험(avatars.test.mjs)을 0015까지 올린 DB에서 그대로 한 번 더 돌린다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { viewsPath } from '../../src/lib/avatar/rules.ts';
import { sweepViewStrays, wrapSupabase } from '../../worker/avatar/supabase.mjs';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const BEFORE = ['0001_init.sql', '0002_rooms_play.sql', '0003_avatars.sql', '0004_shots.sql', '0006_profile_look.sql',
  '0008_rooms_more.sql', '0010_qr_quiet.sql', '0012_note_photos.sql', '0014_guards.sql'].map(read);
const VIEWS = read('0015_avatar_views.sql');

// Supabase의 auth·storage 스키마는 흉내만 낸다(storage.objects에는 Supabase처럼 RLS가 켜져 있다)
const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

const U = {
  guest: '00000000-0000-4000-8000-000000000001',
  guest2: '00000000-0000-4000-8000-000000000002',
  guest3: '00000000-0000-4000-8000-000000000003',
  visitor: '00000000-0000-4000-8000-000000000009',
};
const EMAIL = Object.fromEntries(Object.keys(U).map((k) => [k, `${k}@example.test`]));
const MODEL = 'gpt-image-2.6-flare';
let db;

async function as(who, fn) {
  return db.transaction(async (tx) => {
    if (who === 'anon') {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role anon');
    } else if (who === 'service') {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role service_role');
    } else {
      const claims = { sub: U[who], email: EMAIL[who], role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] } };
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.query('set local role authenticated');
    }
    return fn(tx);
  });
}
const val = async (tx, sql, p = []) => Object.values((await tx.query(sql, p)).rows[0] ?? {})[0];
async function fails(who, sql, p, re) {
  await assert.rejects(as(who, (tx) => tx.query(sql, p)), (e) => { assert.match(String(e.message), re); return true; });
}

/** 다음 시험이 앞 시험의 줄을 잡지 않게 비운다 */
const clean = () => db.exec(`delete from public.avatars; delete from public.avatar_workers;
  delete from storage.objects where bucket_id = 'avatars';`);
/**
 * 그림 한 줄을 바로 넣는다(시험 준비용, 운영자 권한). age가 클수록 오래된 그림.
 * use가 참이면(ready인 그림의 기본값) 그 사람이 지금 걷기에 쓰는 캐릭터로 건다: 묶음은 쓰는 캐릭터만 그린다.
 * 한 사람이 쓰는 캐릭터는 하나라, 같은 사람에게 다시 넣으면 앞의 것은 쓰지 않는 캐릭터가 된다.
 * agreed가 거짓이면 여러 방향 그림 안내가 나가기 전에 만든 캐릭터(동의한 때가 없다)
 */
async function avatar(who, { status = 'ready', age = 0, use = status === 'ready', agreed = true } = {}) {
  const id = crypto.randomUUID();
  await db.query(
    `insert into public.avatars (id, user_id, status, image_path, original_path, consent_at, created_at, views_consent_at) values ($1::uuid, $2::uuid, $3,
       case when $3 = 'ready' then $2::text || '/chars/' || $1::text || '.png' end,
       case when $3 in ('ready', 'queued', 'drawing') then $2::text || '/originals/' || $1::text || '.jpg' end,
       now(), now() - make_interval(secs => $4::int), case when $5::boolean then now() end)`, [id, U[who], status, age, agreed]);
  if (use) await wear(who, id);
  return id;
}
/** 그 사람이 걷기에 쓰는 캐릭터를 바꾼다: 걷기 화면이 쓰는 겉모습(profiles.look)의 사진 주소. null이면 종이 인형 */
const wear = (who, id) => db.query(`insert into public.profiles (user_id, look) values ($1::uuid, $2::jsonb)
  on conflict (user_id) do update set look = excluded.look`,
  [U[who], JSON.stringify(id ? { kind: 'photo', url: `/api/avatar/${id}` } : { kind: 'doll', doll: {} })]);
const row = async (id) => (await db.query('select * from public.avatars where id = $1', [id])).rows[0];
/** 묶음 칸만(비교하기 좋게 때는 있음/없음으로) */
const viewsOf = async (id) => {
  const r = await row(id);
  return { status: r.views_status, attempts: r.views_attempts, worker: r.views_worker, mode: r.views_mode,
    model: r.views_model, reason: r.views_reason, claimed: r.views_claimed_at !== null, wait: r.views_not_before !== null };
};
const EMPTY = { status: null, attempts: 0, worker: null, mode: null, model: null, reason: null, claimed: false, wait: false };
const claim = (worker = 'w1', lease = 600) => as('service', (tx) => val(tx, 'select public.avatar_views_claim($1, $2)', [worker, lease]));
const release = (id, worker, delay, sheet = false) => as('service', (tx) => val(tx, 'select public.avatar_views_release($1, $2, $3, $4)', [id, worker, delay, sheet]));
const settle = (id, status, mode = null, model = null, reason = null, worker = null) =>
  as('service', (tx) => val(tx, 'select public.avatar_views_settle($1, $2, $3, $4, $5, $6)', [id, status, mode, model, reason, worker]));
const forget = (who, id, part) => as(who, (tx) => val(tx, 'select public.avatar_forget($1, $2)', [id, part]));
/** 묶음까지 다 그린 그림 */
async function drawn(who, opts) {
  const id = await avatar(who, opts);
  await db.query(`update public.avatars set views_status = 'ready', views_attempts = 1, views_worker = 'w0', views_mode = 'full',
    views_model = $2 where id = $1`, [id, MODEL]);
  return id;
}
/** 임대가 끝난 것처럼 잡은 때를 옮긴다 */
const stale = (id, ago = '2 hours') => db.query(`update public.avatars set views_claimed_at = now() - $2::interval where id = $1`, [id, ago]);
const put = (...names) => db.query(`insert into storage.objects (bucket_id, name) select 'avatars', n from unnest($1::text[]) n
  on conflict do nothing`, [names]);
const seen = async (who) => (await as(who, (tx) => tx.query(`select name from storage.objects where bucket_id = 'avatars' order by name`)))
  .rows.map((r) => r.name);
const both = (who, id) => [viewsPath(U[who], id, 'l'), viewsPath(U[who], id, 's')];

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const m of BEFORE) await db.exec(m);
  await db.exec(VIEWS);
  await db.exec(VIEWS); // 두 번 올려도 괜찮다
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await db.exec(`insert into public.roster (display_name, role, email) values
    ('손님하나', 'guest', '${EMAIL.guest}'), ('손님둘', 'guest', '${EMAIL.guest2}'), ('손님셋', 'guest', '${EMAIL.guest3}');`);
  for (const w of Object.keys(U)) await as(w, (tx) => tx.query('select public.sync_my_roster()'));
});

// ───────────────────────────── 준비
test('묶음 칸 열 개, 손님 읽기 정책 하나, 함수의 실행권은 필요한 만큼만', async () => {
  const cols = (await db.query(`select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'avatars' and column_name like 'views\\_%' order by 1`)).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ['views_attempts', 'views_claimed_at', 'views_consent_at', 'views_mode', 'views_model', 'views_not_before',
    'views_reason', 'views_sheet_fails', 'views_status', 'views_worker']);
  const policies = (await db.query(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'avatars\\_%' order by 1`)).rows.map((r) => r.policyname);
  assert.deepEqual(policies, ['avatars_guest_select_chars', 'avatars_guest_select_views', 'avatars_owner_delete', 'avatars_owner_select']);
  const FN = { claim: 'avatar_views_claim(text, int)', release: 'avatar_views_release(uuid, text, int, boolean)',
    settle: 'avatar_views_settle(uuid, text, text, text, text, text)', strays: 'avatar_views_strays(int)',
    path: 'avatar_views_path(uuid, text)', readable: 'avatar_views_readable(text)', forget: 'avatar_forget(uuid, text)',
    agree: 'avatar_views_agree(uuid)' };
  const can = async (role) => {
    const out = {};
    for (const [k, sig] of Object.entries(FN)) {
      out[k] = (await db.query(`select has_function_privilege($1, $2, 'execute') as v`, [role, `public.${sig}`])).rows[0].v;
    }
    return out;
  };
  const none = { claim: false, release: false, settle: false, strays: false, path: false, readable: false, forget: false, agree: false };
  assert.deepEqual(await can('anon'), none);
  assert.deepEqual(await can('authenticated'), { ...none, path: true, readable: true, forget: true, agree: true });
  const worker = await can('service_role');
  assert.deepEqual([worker.claim, worker.release, worker.settle, worker.strays], [true, true, true, true]);
});

test('앞의 마이그레이션(0003)이 없는 DB에는 올라가지 않고, 아무것도 바꾸지 않는다', async () => {
  const d = new PGlite();
  await d.exec(STUB);
  await d.exec(BEFORE[0]);
  await assert.rejects(d.exec(VIEWS), /0015_needs_0001_0003/);
  const r = (await d.query(`select to_regprocedure('public.avatar_views_claim(text, int)') is null as no_claim,
    (select count(*)::int from pg_policies where policyname = 'avatars_guest_select_views') as policies`)).rows[0];
  assert.deepEqual(r, { no_claim: true, policies: 0 });
  await d.close();
});

test('겉모습 칸(0006)이 없는 DB에도 올라가지 않는다(줄을 고르는 조건이 그 칸을 읽는다)', async () => {
  const d = new PGlite();
  await d.exec(STUB);
  for (const m of BEFORE.slice(0, 3)) await d.exec(m); // 0001, 0002, 0003까지
  await assert.rejects(d.exec(VIEWS), /0015_needs_0006/);
  const r = (await d.query(`select to_regprocedure('public.avatar_views_claim(text, int)') is null as no_claim,
    (select count(*)::int from information_schema.columns
      where table_schema = 'public' and table_name = 'avatars' and column_name like 'views\\_%') as cols`)).rows[0];
  assert.deepEqual(r, { no_claim: true, cols: 0 });
  await d.close();
});

test('저장소 표의 줄이 가려지는 역할로는 올라가지 않는다(남은 파일을 조용히 놓치는 일을 막는다)', async () => {
  const d = new PGlite();
  await d.exec(STUB);
  for (const m of BEFORE) await d.exec(m);
  await d.exec('create role plain nologin; grant usage on schema public, storage, auth to plain;');
  await assert.rejects(d.transaction(async (tx) => {
    await tx.query('set local role plain');
    await tx.exec(VIEWS);
  }), /0015_needs_role_that_reads_all_storage_rows/);
  const r = (await d.query(`select to_regprocedure('public.avatar_views_strays(int)') is null as no_strays,
    (select count(*)::int from information_schema.columns
      where table_schema = 'public' and table_name = 'avatars' and column_name like 'views\\_%') as cols`)).rows[0];
  assert.deepEqual(r, { no_strays: true, cols: 0 });
  await d.close();
});

// ───────────────────────────── 대기열: 일꾼(비밀 키)이 잡아 그린다
test('잡기: 새것부터, 한 그림을 둘이 잡지 않고, ready가 아닌 줄과 이미 끝난 줄은 안 잡힌다', async () => {
  await clean();
  const older = await avatar('guest', { age: 300 });
  const newer = await avatar('guest2', { age: 10 });
  await avatar('guest', { status: 'queued', age: 1 });   // 아직 한 장 그림도 안 그린 줄
  await avatar('guest', { status: 'deleted', age: 1 });  // 지운 줄
  await avatar('guest', { status: 'failed', age: 1 });   // 한 장 그림이 실패한 줄
  await drawn('guest3', { age: 1 });                     // 묶음까지 다 그린 줄
  const failed = await avatar('guest3', { age: 2 });     // 묶음이 실패로 굳은 줄
  await db.query(`update public.avatars set views_status = 'failed', views_attempts = 3, views_reason = 'blocked' where id = $1`, [failed]);

  const c1 = await claim('w1');
  assert.deepEqual(c1, { id: newer, user_id: U.guest2, image_path: `${U.guest2}/chars/${newer}.png`, attempts: 1, sheet_fails: 0 });
  const c2 = await claim('w2');
  assert.deepEqual(c2, { id: older, user_id: U.guest, image_path: `${U.guest}/chars/${older}.png`, attempts: 1, sheet_fails: 0 });
  assert.equal(await claim('w1'), null, '남은 것이 없다');
  assert.deepEqual(await viewsOf(newer), { ...EMPTY, status: 'drawing', attempts: 1, worker: 'w1', claimed: true });
  assert.deepEqual(await viewsOf(older), { ...EMPTY, status: 'drawing', attempts: 1, worker: 'w2', claimed: true });
  assert.equal((await viewsOf(failed)).status, 'failed');
  // 잡기는 살아 있음도 남긴다(화면의 「일꾼이 쉬는 중」 안내가 이것을 본다)
  const beats = (await db.query('select worker from public.avatar_workers order by 1')).rows.map((r) => r.worker);
  assert.deepEqual(beats, ['w1', 'w2']);
  // PGlite는 연결이 하나라 진짜 동시 잡기는 만들지 못한다. 둘이 한 줄을 잡지 않게 하는 장치가 그대로 있는지 본다
  assert.match(VIEWS, /limit 1 for update skip locked/);
});

test('한 장 그림이 다 그려지고(0003 흐름) 걷기 화면이 그 그림을 겉모습으로 저장하면 묶음 차례에 선다', async () => {
  await clean();
  const begun = await as('guest', (tx) => val(tx, 'select public.avatar_begin(true, 150)'));
  assert.equal(begun.ok, true, JSON.stringify(begun));
  const id = begun.id;
  // 사이트는 올리는 화면이 여러 방향 그림 안내를 보여 줬을 때 동의한 때를 적는다
  assert.equal(await as('guest', (tx) => val(tx, 'select public.avatar_views_agree($1)', [id])), true);
  const original = `${U.guest}/originals/${id}.jpg`;
  assert.equal(await as('service', (tx) => val(tx, 'select public.avatar_enqueue($1, $2)', [id, original])), true);
  assert.equal(await claim('w1'), null, '줄 선 그림은 묶음 차례가 아니다');
  assert.equal((await as('service', (tx) => val(tx, 'select public.avatar_claim($1, 600)', ['w1']))).id, id);
  assert.equal(await claim('w1'), null, '그리는 중인 그림도 아니다');
  assert.equal(await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'ready', null, $2, $3)`,
    [id, `${U.guest}/chars/${id}.png`, MODEL])), true);
  assert.deepEqual(await viewsOf(id), EMPTY);
  // avatar_settle은 profiles.avatar_id만 건다. 걷기 화면이 쓰는 것은 겉모습(look)이라 아직 차례가 아니다
  assert.equal((await db.query('select avatar_id from public.profiles where user_id = $1', [U.guest])).rows[0].avatar_id, id);
  assert.equal(await claim('w1'), null, '아직 아무도 이 그림으로 걷지 않는다');
  // 걷기 화면이 다 그려진 것을 보고 본인 권한으로 겉모습을 저장한다(saveMyLook이 하는 일)
  await as('guest', (tx) => tx.query(`update public.profiles set look = $1::jsonb where user_id = $2::uuid`,
    [JSON.stringify({ kind: 'photo', url: `/api/avatar/${id}` }), U.guest]));
  assert.deepEqual(await claim('w1'), { id, user_id: U.guest, image_path: `${U.guest}/chars/${id}.png`, attempts: 1, sheet_fails: 0 });
});

test('손님과 로그인 안 한 사람은 잡기·돌려놓기·정리·남은 파일 찾기를 부르지 못한다', async () => {
  await clean();
  const id = await avatar('guest');
  for (const who of ['guest', 'visitor', 'anon']) {
    await fails(who, `select public.avatar_views_claim('x', 600)`, [], /permission denied/);
    await fails(who, `select public.avatar_views_release($1, 'x', 0)`, [id], /permission denied/);
    await fails(who, `select public.avatar_views_settle($1, 'ready', 'full', 'm', null)`, [id], /permission denied/);
    await fails(who, `select * from public.avatar_views_strays(10)`, [], /permission denied/);
  }
  await fails('guest', `update public.avatars set views_status = 'ready' where id = $1`, [id], /permission denied/);
  assert.deepEqual(await viewsOf(id), EMPTY);
});

test('돌려놓기: 잡은 일꾼만 돌려놓고, 기다리는 동안은 안 잡히며, 때가 되면 이어서 잡힌다', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('w1')).id, id);
  assert.equal(await release(id, 'w2', 0), false, '다른 일꾼은 못 돌려놓는다');
  assert.equal(await release(id, 'w1', 300), true);
  assert.deepEqual(await viewsOf(id), { ...EMPTY, attempts: 1, wait: true });
  assert.equal(await claim('w1'), null, '기다리는 동안은 안 잡힌다');
  assert.equal(await release(id, 'w1', 0), false, '잡지 않은 줄은 돌려놓을 것이 없다');
  await db.query(`update public.avatars set views_not_before = now() - interval '1 second' where id = $1`, [id]);
  assert.deepEqual(await claim('w2'), { id, user_id: U.guest, image_path: `${U.guest}/chars/${id}.png`, attempts: 2, sheet_fails: 0 });
  assert.deepEqual(await viewsOf(id), { ...EMPTY, status: 'drawing', attempts: 2, worker: 'w2', claimed: true });
  // 기다리는 시간은 0초에서 1시간 사이로 맞춘다
  assert.equal(await release(id, 'w2', 999999), true);
  const wait = (await db.query(`select extract(epoch from views_not_before - now())::int as s from public.avatars where id = $1`, [id])).rows[0].s;
  assert.ok(wait > 3500 && wait <= 3600, `1시간을 넘지 않는다(${wait})`);
});

test('임대가 끝난 것은 다음 잡기가 되돌리고, 여덟 번 잡고도 못 끝내면 failed(timeout)', async () => {
  await clean();
  const id = await avatar('guest');
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.deepEqual([(await claim('w1', 600)).id, (await viewsOf(id)).attempts], [id, n]);
    assert.equal(await claim('w2', 600), null, '임대 안에서는 다른 일꾼이 불러도 그대로다');
    await stale(id);
  }
  assert.equal(await claim('w2', 600), null, '여덟 번 다 썼다');
  assert.deepEqual(await viewsOf(id), { ...EMPTY, status: 'failed', attempts: 8, reason: 'timeout' });
  // 그림 한 장은 그대로 쓴다(묶음만 없다)
  assert.equal((await row(id)).status, 'ready');
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_char_path($1)', [id])), `${U.guest}/chars/${id}.png`);
});

test('임대는 아무리 짧게 불러도 1분보다 줄지 않는다', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('w1', 1)).id, id);
  await stale(id, '30 seconds');
  assert.equal(await claim('w2', 1), null);
  assert.equal((await viewsOf(id)).worker, 'w1');
  await stale(id, '61 seconds');
  assert.deepEqual([(await claim('w2', 1)).attempts, (await viewsOf(id)).worker], [2, 'w2']);
});

test('돌려놓은 줄은 세 번을 넘어도 다시 잡힌다(몇 번 그릴지는 일꾼이 정한다). 열 번에서 DB가 끊고 다음 줄로 간다', async () => {
  await clean();
  const stuck = await avatar('guest', { age: 1 });
  const next = await avatar('guest2', { age: 2 });
  for (let n = 1; n <= 10; n += 1) {
    assert.deepEqual(await claim('w1'), { id: stuck, user_id: U.guest, image_path: `${U.guest}/chars/${stuck}.png`, attempts: n, sheet_fails: 0 });
    assert.equal(await release(stuck, 'w1', 0), true);
  }
  assert.deepEqual(await viewsOf(stuck), { ...EMPTY, attempts: 10, wait: true });
  // 열한 번째: 그 줄은 failed(attempts)로 굳고, 잡기는 멈추지 않고 다음 줄을 준다
  assert.deepEqual(await claim('w1'), { id: next, user_id: U.guest2, image_path: `${U.guest2}/chars/${next}.png`, attempts: 1, sheet_fails: 0 });
  assert.deepEqual(await viewsOf(stuck), { ...EMPTY, status: 'failed', attempts: 10, reason: 'attempts' });
  assert.equal(await settle(next, 'ready', 'full', MODEL), true);
  assert.equal(await claim('w1'), null);
  // 마이그레이션 머리말의 「다시 그리게 하려면」 그대로: 횟수까지 되돌리면 다시 잡힌다
  await db.query(`update public.avatars set views_status = null, views_attempts = 0, views_sheet_fails = 0, views_reason = null, views_not_before = null
    where id = $1 and status = 'ready'`, [stuck]);
  assert.deepEqual([(await claim('w1')).id, (await viewsOf(stuck)).attempts], [stuck, 1]);
});

test('프록시가 멈춘 사이 여러 번 돌려놓인 줄은 일꾼이 한 번 멈춰도(임대 끝) 굳지 않는다. 여덟 번째에 멈추면 failed(timeout)', async () => {
  await clean();
  const id = await avatar('guest');
  for (const n of [1, 2, 3]) {
    assert.equal((await claim('w1')).attempts, n);
    assert.equal(await release(id, 'w1', 0), true);
  }
  assert.equal((await claim('w1')).attempts, 4);
  await stale(id);
  // 세 번을 넘겼어도 다시 잡힌다(일꾼은 프록시 쪽 실패를 여덟 번까지 기다린다)
  assert.equal((await claim('w2')).attempts, 5);
  for (const n of [6, 7, 8]) {
    assert.equal(await release(id, 'w2', 0), true);
    assert.equal((await claim('w2')).attempts, n);
  }
  await stale(id);
  assert.equal(await claim('w1'), null);
  assert.deepEqual(await viewsOf(id), { ...EMPTY, status: 'failed', attempts: 8, reason: 'timeout' });
});

test('쓰는 캐릭터만 그린다: 고르지 않은 캐릭터는 잡히지 않고, 그 캐릭터로 바꿔 걸으면 그때 잡힌다', async () => {
  await clean();
  const first = await avatar('guest', { age: 30 });           // 처음 만든 것(쓰는 중)
  const second = await avatar('guest', { age: 10, use: false }); // 더 새것이지만 고르지 않았다
  assert.equal((await claim('w1')).id, first, '새것이어도 쓰지 않는 캐릭터는 건너뛴다');
  assert.equal(await settle(first, 'ready', 'full', MODEL), true);
  assert.equal(await claim('w1'), null, '고르지 않은 캐릭터에는 그리기 수를 쓰지 않는다');
  assert.deepEqual(await viewsOf(second), EMPTY);
  // 내 캐릭터 화면에서 고르기만 한 것(profiles.avatar_id)은 걷기 화면의 겉모습이 아니다: 잡히지 않는다
  assert.equal(await as('guest', (tx) => val(tx, 'select public.avatar_choose($1)', [second])), true);
  assert.equal(await claim('w1'), null, '걷기 화면은 look만 쓴다');
  // 그 캐릭터로 바꿔 걸으면(겉모습을 그 사진으로) 줄에 선다. 본인이 저장하는 길 그대로 해 본다
  await as('guest', (tx) => tx.query(`update public.profiles set look = $1::jsonb where user_id = $2::uuid`,
    [JSON.stringify({ kind: 'photo', url: `/api/avatar/${second}` }), U.guest]));
  assert.equal((await claim('w1')).id, second);
  assert.equal(await release(second, 'w1', 0), true);
  // 종이 인형으로 돌아가면(쓰는 캐릭터 없음) 다시 잡히지 않는다
  await wear('guest', null);
  assert.equal(await claim('w1'), null);
  // 0014를 올리기 전의 DB에서는 남의 그림 주소도 겉모습으로 저장된다(주인 확인 트리거가 아직 없다).
  // 그래도 남의 겉모습 때문에 내 그림이 줄에 서지는 않는다: 그림 주인의 겉모습만 센다
  await db.exec(`set session_replication_role = replica`); // 트리거 없이 넣는다(0014 이전 흉내)
  try {
    await db.query(`insert into public.profiles (user_id, look) values ($1::uuid, $2::jsonb)
      on conflict (user_id) do update set look = excluded.look`, [U.guest2, JSON.stringify({ kind: 'photo', url: `/api/avatar/${second}` })]);
  } finally {
    await db.exec(`set session_replication_role = origin`);
  }
  assert.equal((await db.query(`select look ->> 'url' as url from public.profiles where user_id = $1`, [U.guest2])).rows[0].url, `/api/avatar/${second}`);
  assert.equal(await claim('w1'), null, '주인이 아닌 사람의 겉모습은 세지 않는다');
  await wear('guest2', null);
  // 이미 그려 둔 묶음은 그대로 열린다(다시 그 캐릭터를 고르면 바로 쓴다)
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_views_path($1, $2)', [first, 'l'])), both('guest', first)[0]);
});

test('동의: 여러 방향 그림까지 동의한 그림만 줄에 선다. 동의는 본인만, 처음 적은 때 그대로', async () => {
  await clean();
  const old = await avatar('guest', { agreed: false }); // 안내가 나가기 전에 만든 캐릭터로 걷고 있다
  assert.equal(await claim('w1'), null, '동의한 때가 없는 그림은 캐릭터 그림을 한 번 더 보내지 않는다');
  assert.deepEqual(await viewsOf(old), EMPTY);
  const agree = (who, id) => as(who, (tx) => val(tx, 'select public.avatar_views_agree($1)', [id]));
  const at = async (id) => (await row(id)).views_consent_at;
  // 남의 그림, 명단 밖, 로그인 안 한 사람은 적지 못한다
  assert.equal(await agree('guest2', old), false);
  assert.equal(await agree('visitor', old), false);
  await fails('anon', 'select public.avatar_views_agree($1)', [old], /permission denied/);
  assert.equal(await at(old), null);
  // 본인이 동의하면 그때부터 줄에 선다
  assert.equal(await agree('guest', old), true);
  const first = await at(old);
  assert.ok(first instanceof Date);
  assert.equal(await agree('guest', old), true, '다시 불러도 된다');
  assert.equal((await at(old)).getTime(), first.getTime(), '처음 적은 때를 그대로 둔다');
  assert.equal((await claim('w1')).id, old);
  assert.equal(await settle(old, 'ready', 'full', MODEL), true);
  // 그림을 지워도 동의한 때는 기록으로 남고, 지운 그림에는 새로 적지 못한다
  assert.equal(await forget('guest', old, 'character'), true);
  assert.equal((await at(old)).getTime(), first.getTime());
  const gone = await avatar('guest2', { agreed: false });
  assert.equal(await forget('guest2', gone, 'character'), true);
  assert.equal(await agree('guest2', gone), false);
  assert.equal(await at(gone), null);
  // 한 장 그림이 실패한 줄에도 적지 않는다. 그리는 중인 줄에는 적는다(올린 직후에 부른다)
  const dead = await avatar('guest3', { status: 'failed', agreed: false });
  assert.equal(await agree('guest3', dead), false);
  const queued = await avatar('guest3', { status: 'queued', agreed: false });
  assert.equal(await agree('guest3', queued), true);
});

test('시트 탓으로 돌려놓은 횟수는 따로 센다: 프록시가 멈춘 사이 쓴 횟수가 시트 실패의 한도를 깎지 않는다', async () => {
  await clean();
  const id = await avatar('guest');
  const fails = async () => (await row(id)).views_sheet_fails;
  // 프록시 탓 돌려놓기 세 번: 잡은 횟수만 는다
  for (const n of [1, 2, 3]) {
    assert.deepEqual([(await claim('w1')).sheet_fails, await release(id, 'w1', 0)], [0, true]);
    assert.deepEqual([(await viewsOf(id)).attempts, await fails()], [n, 0]);
  }
  // 시트 탓 돌려놓기: 따로 는다. 다음에 잡을 때 일꾼이 그 수를 받는다
  assert.equal((await claim('w1')).sheet_fails, 0);
  assert.equal(await release(id, 'w1', 0, true), true);
  assert.deepEqual(await claim('w1'), { id, user_id: U.guest, image_path: `${U.guest}/chars/${id}.png`, attempts: 5, sheet_fails: 1 });
  assert.equal(await release(id, 'w1', 0, true), true);
  assert.equal((await claim('w1')).sheet_fails, 2);
  // 내가 잡지 않은 줄은 세지도 않는다
  assert.equal(await release(id, 'w2', 0, true), false);
  assert.equal(await fails(), 2);
  // 그림을 지우면 함께 지워진다
  assert.equal(await forget('guest', id, 'character'), true);
  assert.equal(await fails(), 0);
});

test('정리: ready면 방식·모델이 적히고, failed면 까닭이 남는다. 모르는 상태와 빈 상태는 거절한다', async () => {
  await clean();
  const a = await avatar('guest', { age: 1 });
  const b = await avatar('guest2', { age: 2 });
  assert.equal((await claim('w1')).id, a);
  assert.equal(await settle(a, 'ready', 'frontback', MODEL), true);
  assert.deepEqual(await viewsOf(a), { ...EMPTY, status: 'ready', attempts: 1, worker: 'w1', mode: 'frontback', model: MODEL });
  assert.equal((await claim('w1')).id, b);
  // 빈 상태를 받아 주면 누가 잡았는지 보지 않는 돌려놓기가 된다
  for (const bad of ['drawing', 'queued', 'Ready', '', null]) {
    await fails('service', `select public.avatar_views_settle($1, $2)`, [b, bad], /bad_status/);
  }
  assert.deepEqual(await viewsOf(b), { ...EMPTY, status: 'drawing', attempts: 1, worker: 'w1', claimed: true }, '거절된 정리는 아무것도 바꾸지 않는다');
  assert.equal(await settle(b, 'failed', 'full', MODEL, 'blocked'), true);
  assert.deepEqual(await viewsOf(b), { ...EMPTY, status: 'failed', attempts: 1, worker: 'w1', model: MODEL, reason: 'blocked' }, '실패에는 방식을 적지 않는다');
  // 끝난 줄은 다시 잡히지 않는다. 잡지 않은 줄·없는 줄·실패로 끝난 줄의 정리는 false
  assert.equal(await claim('w1'), null);
  const idle = await avatar('guest3');
  assert.equal(await settle(idle, 'ready', 'full', MODEL), false);
  assert.equal(await settle(crypto.randomUUID(), 'ready', 'full', MODEL), false);
  assert.equal(await settle(b, 'ready', 'full', MODEL), false);
  assert.deepEqual(await viewsOf(idle), EMPTY);
  assert.equal((await viewsOf(b)).status, 'failed');
});

test('정리: 낯선 방식·모델·까닭은 정리를 막지 않는다(막으면 일꾼이 같은 그림을 다시 그린다). 방식·모델은 비우고 까닭은 error', async () => {
  await clean();
  const a = await avatar('guest', { age: 1 });
  const b = await avatar('guest2', { age: 2 });
  const c = await avatar('guest3', { age: 3 });
  assert.equal((await claim('w1')).id, a);
  assert.equal(await settle(a, 'ready', 'sideways', 'bad model name', 'Not A Reason'), true);
  assert.deepEqual(await viewsOf(a), { ...EMPTY, status: 'ready', attempts: 1, worker: 'w1' });
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_views_path($1, $2)', [a, 'l'])), both('guest', a)[0], '묶음은 그대로 열린다');
  assert.equal((await claim('w1')).id, b);
  assert.equal(await settle(b, 'failed', null, 'x'.repeat(65), 'Not A Reason'), true);
  assert.deepEqual(await viewsOf(b), { ...EMPTY, status: 'failed', attempts: 1, worker: 'w1', reason: 'error' });
  assert.equal((await claim('w1')).id, c);
  assert.equal(await settle(c, 'failed'), true);
  assert.deepEqual(await viewsOf(c), { ...EMPTY, status: 'failed', attempts: 1, worker: 'w1', reason: 'error' }, '까닭이 없어도 error로 남긴다');
});

test('정리: 그리는 사이 본인이 그림을 지웠으면 false이고, 지운 줄에는 아무것도 적히지 않는다', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('w1')).id, id);
  assert.equal(await forget('guest', id, 'character'), true);
  assert.equal(await settle(id, 'ready', 'full', MODEL), false, '일꾼은 이 답을 보고 올린 파일을 거둔다');
  assert.equal(await settle(id, 'failed', null, null, 'timeout'), false);
  assert.equal(await release(id, 'w1', 0), false);
  const r = await row(id);
  assert.deepEqual([r.status, r.image_path], ['deleted', null]);
  assert.deepEqual(await viewsOf(id), EMPTY);
  assert.equal(await claim('w1'), null, '지운 그림은 다시 잡히지 않는다');
});

test('정리: 다른 일꾼이 다시 잡아 먼저 끝낸 뒤에 온 늦은 ready는 true(쓰이는 파일을 거두지 않게), 늦은 failed는 false', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('slow')).attempts, 1);
  await stale(id); // 느린 일꾼의 임대가 끝났다
  assert.equal((await claim('fast')).attempts, 2);
  assert.equal(await settle(id, 'ready', 'full', 'model-a'), true);
  // 느린 일꾼이 뒤늦게 끝냈다: 같은 자리에 올린 파일이 지금 쓰이는 파일이다
  assert.equal(await settle(id, 'ready', 'frontback', 'model-b'), true);
  assert.deepEqual(await viewsOf(id), { ...EMPTY, status: 'ready', attempts: 2, worker: 'fast', mode: 'frontback', model: 'model-b' });
  assert.equal(await settle(id, 'failed', null, null, 'timeout'), false);
  assert.equal((await viewsOf(id)).status, 'ready');
});

test('정리: 임대가 넘어간 뒤에 온 옛 일꾼의 그만두기(failed)는 적히지 않는다. 지금 잡은 일꾼과 손으로 하는 정리는 적힌다', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('slow')).attempts, 1);
  await stale(id); // 느린 일꾼의 임대가 끝났다
  assert.equal((await claim('fast')).attempts, 2);
  assert.equal(await settle(id, 'failed', null, null, 'sheet_count', 'slow'), false, '지금 그리는 일꾼의 줄을 굳히지 않는다');
  assert.deepEqual(await viewsOf(id), { ...EMPTY, status: 'drawing', attempts: 2, worker: 'fast', claimed: true });
  assert.equal(await settle(id, 'ready', 'full', 'model-a', null, 'fast'), true, '다 그린 일꾼의 ready는 그대로 적힌다');
  assert.equal((await viewsOf(id)).status, 'ready');
  // 잡은 일꾼의 그만두기
  const mine = await avatar('guest2');
  assert.equal((await claim('w1')).id, mine);
  assert.equal(await settle(mine, 'failed', null, null, 'sheet_count', 'w1'), true);
  assert.deepEqual([(await viewsOf(mine)).status, (await viewsOf(mine)).reason], ['failed', 'sheet_count']);
  // 일꾼 이름 없이(손으로) 정리
  const hand = await avatar('guest3');
  assert.equal((await claim('w1')).id, hand);
  assert.equal(await settle(hand, 'failed', null, null, 'error'), true);
  assert.equal((await viewsOf(hand)).status, 'failed');
  // 옛 일꾼이 뒤늦게 다 그려 올린 ready는 받는다(같은 자리에 올린 파일이 쓰인다)
  const late = await avatar('visitor');
  assert.equal((await claim('slow')).id, late);
  await stale(late);
  assert.equal((await claim('fast')).id, late);
  assert.equal(await settle(late, 'ready', 'full', 'model-a', null, 'slow'), true);
  assert.equal((await viewsOf(late)).status, 'ready');
});

test('돌려놓기는 그리는 중(drawing)인 줄만: 정리가 적힌 뒤 같은 일꾼이 돌려놓으려 해도 false이고 그대로 둔다', async () => {
  await clean();
  // 일꾼이 ready를 적었는데 답을 못 받아 돌려놓기를 부르는 길(views.mjs의 catch). 다 된 묶음을 「아직 안 그림」으로 돌리면 같은 시트를 다시 그린다
  const done = await avatar('guest');
  assert.equal((await claim('w1')).id, done);
  assert.equal(await settle(done, 'ready', 'full', MODEL, null, 'w1'), true);
  assert.equal(await release(done, 'w1', 0), false);
  assert.equal((await viewsOf(done)).status, 'ready');
  const stop = await avatar('guest2');
  assert.equal((await claim('w1')).id, stop);
  assert.equal(await settle(stop, 'failed', null, null, 'sheet_count', 'w1'), true);
  assert.equal(await release(stop, 'w1', 0, true), false);
  assert.deepEqual([(await viewsOf(stop)).status, (await row(stop)).views_sheet_fails], ['failed', 0]);
  assert.equal(await claim('w1'), null, '둘 다 다시 잡히지 않는다');
});

test('다른 버킷에 같은 이름의 파일이 있어도: 손님 읽기 정책과 남은 파일 찾기는 avatars 버킷만 본다', async () => {
  await clean();
  await db.exec(`insert into storage.buckets (id, name) values ('elsewhere', 'elsewhere') on conflict do nothing`);
  const done = await drawn('guest'); // 묶음까지 다 그린 그림: avatars 버킷이었다면 다른 손님에게 보인다
  const orphan = crypto.randomUUID(); // 줄이 없는 그림 id: avatars 버킷이었다면 남은 파일로 골라진다
  const names = [...both('guest', done), ...both('guest', orphan)];
  await db.query(`insert into storage.objects (bucket_id, name) select 'elsewhere', n from unnest($1::text[]) n
    on conflict do nothing`, [names]);
  try {
    const other = await as('guest2', (tx) => tx.query(`select name from storage.objects where bucket_id = 'elsewhere'`));
    assert.deepEqual(other.rows, [], '다른 버킷의 파일은 묶음 이름이어도 보이지 않는다');
    const strays = await as('service', (tx) => tx.query('select * from public.avatar_views_strays(100)'));
    assert.deepEqual(strays.rows, [], '다른 버킷의 파일은 남은 파일로 고르지 않는다(지우면 남의 파일이 사라진다)');
  } finally {
    await db.query(`delete from storage.objects where bucket_id = 'elsewhere'`);
  }
});

// ───────────────────────────── 읽기: 명단 손님만, ready인 것만
test('경로 함수: 명단 손님만, 그림도 묶음도 ready일 때만. 크기는 l·s(그 밖은 l)', async () => {
  await clean();
  const id = await avatar('guest');
  const path = (who, size = 'l', pid = id) => as(who, (tx) => val(tx, 'select public.avatar_views_path($1, $2)', [pid, size]));
  const [l, s] = both('guest', id);
  assert.equal(await path('guest2'), null, '아직 안 그린 묶음');
  assert.equal((await claim('w1')).id, id);
  assert.equal(await path('guest2'), null, '그리는 중인 묶음');
  assert.equal(await settle(id, 'ready', 'full', MODEL), true);
  assert.equal(await path('guest2'), l);
  assert.equal(await path('guest2', 's'), s);
  assert.equal(l, `${U.guest}/views/${id}.v1l.webp`, '사이트·일꾼의 viewsPath()와 같은 모양');
  for (const odd of ['', 'L', 'S', 'xl', '../s', 's ', null]) assert.equal(await path('guest2', odd), l, JSON.stringify(odd));
  assert.equal(await path('guest'), l, '본인도 같은 길로');
  assert.equal(await path('visitor'), null, '명단 밖은 못 얻는다');
  await fails('anon', 'select public.avatar_views_path($1, $2)', [id, 'l'], /permission denied/);
  assert.equal(await path('guest2', 'l', crypto.randomUUID()), null, '없는 그림');
  // 묶음이 실패한 그림은 경로가 없다(그림 한 장은 그대로 열린다)
  const bad = await avatar('guest3');
  await db.query(`update public.avatars set views_status = 'failed', views_attempts = 3, views_reason = 'timeout' where id = $1`, [bad]);
  assert.equal(await path('guest2', 'l', bad), null);
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_char_path($1)', [bad])), `${U.guest3}/chars/${bad}.png`);
  // 그림을 지우면 닫힌다
  assert.equal(await forget('guest', id, 'character'), true);
  assert.equal(await path('guest2'), null);
  assert.equal(await path('guest'), null);
});

test('저장소 읽기: 다른 손님은 ready인 그림과 ready인 묶음만 본다. 원본, 덜 된 묶음, 지운 그림의 묶음, 다른 이름은 못 본다', async () => {
  await clean();
  const done = await drawn('guest', { age: 1 });
  const half = await avatar('guest', { age: 2 });
  const gone = await drawn('guest', { age: 3 });
  const files = (id) => [`${U.guest}/originals/${id}.jpg`, `${U.guest}/chars/${id}.png`, ...both('guest', id)];
  const odd = [
    `${U.guest}/views/${done}.v2l.webp`,   // 다른 판
    `${U.guest}/views/${done}.v1l.webp.bak`,
    `${U.guest}/views/x/${done}.v1l.webp`, // 더 깊은 폴더
    `${U.guest}/views/notes.txt`,
    `${U.guest2}/views/${done}.v1l.webp`,  // 남의 폴더에 같은 그림 id
  ];
  await put(...files(done), ...files(half), ...files(gone), ...odd);
  await wear('guest', half);
  assert.equal((await claim('w1')).id, half); // 묶음을 그리는 중: 일꾼이 파일을 올렸지만 아직 정리 전
  assert.equal(await forget('guest', gone, 'character'), true); // 파일이 남았다고 쳐도 열리지 않아야 한다

  assert.deepEqual(await seen('guest2'), [
    `${U.guest}/chars/${done}.png`, `${U.guest}/chars/${half}.png`, ...both('guest', done),
    `${U.guest2}/views/${done}.v1l.webp`, // 자기 폴더의 파일(본인 정책). 그 이름이 남의 묶음으로 통하지는 않는다
  ].sort());
  assert.deepEqual(await seen('guest3'), [`${U.guest}/chars/${done}.png`, `${U.guest}/chars/${half}.png`, ...both('guest', done)].sort());
  assert.deepEqual(await seen('visitor'), [], '명단 밖은 아무것도');
  assert.deepEqual(await seen('anon'), [], '로그인 안 한 사람도 아무것도');
  assert.equal((await seen('guest')).length, 16, '본인은 자기 폴더의 것 모두(원본·그림·묶음·그 밖)');
  // 정책이 기대는 함수도 같은 답
  const readable = (who, name) => as(who, (tx) => val(tx, 'select public.avatar_views_readable($1)', [name]));
  assert.equal(await readable('guest2', both('guest', done)[0]), true);
  assert.equal(await readable('visitor', both('guest', done)[0]), false);
  for (const name of [...both('guest', half), ...both('guest', gone), ...odd, `${U.guest}/chars/${done}.png`, '', 'x']) {
    assert.equal(await readable('guest2', name), false, name);
  }
  // 손님은 묶음을 올리지도, 남의 것을 고치거나 지우지도 못한다. 본인은 자기 것을 지운다(지우기 흐름이 이것으로 지운다)
  await fails('guest2', `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [viewsPath(U.guest2, done, 's')], /row-level security/);
  await fails('guest', `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [viewsPath(U.guest, half, 'l') + '.new'], /row-level security/);
  const renamed = await as('guest2', (tx) => tx.query(`update storage.objects set name = name || '.x' where name = $1 returning name`, [both('guest', done)[0]]));
  assert.equal(renamed.rows.length, 0);
  const stolen = await as('guest2', (tx) => tx.query(`delete from storage.objects where name like $1 returning name`, [`${U.guest}/%`]));
  assert.equal(stolen.rows.length, 0, '남의 파일은 못 지운다');
  const mine = await as('guest', (tx) => tx.query(`delete from storage.objects where name = any($1::text[]) returning name`, [both('guest', done)]));
  assert.equal(mine.rows.length, 2, '본인은 자기 묶음 파일을 지운다');
});

// ───────────────────────────── 지우기: 그림이 없어지면 묶음도 없다
test('지우기: 원본만 지우면 묶음은 그대로, 그림을 지우면(character·both) 묶음 칸이 모두 빈다', async () => {
  await clean();
  const a = await drawn('guest', { age: 1 });
  const b = await drawn('guest', { age: 2 });
  const full = { ...EMPTY, status: 'ready', attempts: 1, worker: 'w0', mode: 'full', model: MODEL };
  assert.equal(await as('guest', (tx) => val(tx, 'select public.avatar_choose($1)', [a])), true);
  // 원본만
  assert.equal(await forget('guest', a, 'original'), true);
  let r = await row(a);
  assert.deepEqual([r.status, r.original_path, r.image_path], ['ready', null, `${U.guest}/chars/${a}.png`]);
  assert.deepEqual(await viewsOf(a), full);
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_views_path($1, $2)', [a, 'l'])), both('guest', a)[0]);
  assert.equal(await as('guest', (tx) => val(tx, 'select avatar_id from public.profiles where user_id = auth.uid()')), a, '걷는 캐릭터도 그대로');
  // 남의 것은 못 지운다. 모르는 부분은 거절한다
  assert.equal(await forget('guest2', a, 'both'), false);
  assert.equal(await forget('visitor', a, 'character'), false);
  await fails('guest', `select public.avatar_forget($1, 'views')`, [a], /bad_part/);
  await fails('anon', `select public.avatar_forget($1, 'character')`, [a], /permission denied/);
  assert.deepEqual(await viewsOf(a), full);
  // 그림 지우기
  assert.equal(await forget('guest', a, 'character'), true);
  r = await row(a);
  assert.deepEqual([r.status, r.image_path, r.deleted_at !== null], ['deleted', null, true]);
  assert.deepEqual(await viewsOf(a), EMPTY);
  assert.equal(await as('guest', (tx) => val(tx, 'select avatar_id from public.profiles where user_id = auth.uid()')), null, '걷는 캐릭터에서도 빠진다');
  // 그림과 원본 함께
  assert.equal(await forget('guest', b, 'both'), true);
  r = await row(b);
  assert.deepEqual([r.status, r.original_path, r.image_path], ['deleted', null, null]);
  assert.deepEqual(await viewsOf(b), EMPTY);
  // 지운 줄도 오늘 장수에는 남는다(0003 그대로)
  assert.equal((await as('guest', (tx) => val(tx, 'select public.avatar_quota()'))).used, 2);
});

test('지우기: 묶음을 그리는 중이거나 기다리는 중이거나 실패로 굳은 그림도 칸이 모두 빈다', async () => {
  await clean();
  const drawing = await avatar('guest', { age: 1 });
  const waiting = await avatar('guest2', { age: 2 });
  const failed = await avatar('guest3', { age: 3 });
  assert.equal((await claim('w1')).id, drawing);
  assert.equal((await claim('w1')).id, waiting);
  assert.equal(await release(waiting, 'w1', 600, true), true);
  assert.equal((await claim('w1')).id, failed);
  assert.equal(await settle(failed, 'failed', null, MODEL, 'bad_sheet'), true);
  for (const [who, id] of [['guest', drawing], ['guest2', waiting], ['guest3', failed]]) {
    assert.equal(await forget(who, id, 'character'), true);
    assert.equal((await row(id)).views_sheet_fails, 0);
    assert.deepEqual(await viewsOf(id), EMPTY);
    assert.equal((await row(id)).status, 'deleted');
  }
  assert.equal(await claim('w1'), null);
});

test('지우기: 한 장 그림을 그리던 작업을 거둘 때도(0003 흐름) 그대로 되고 묶음 칸은 비어 있다', async () => {
  await clean();
  const id = await avatar('guest', { status: 'queued' });
  assert.equal(await forget('guest', id, 'original'), true);
  const r = await row(id);
  assert.deepEqual([r.status, r.original_path, r.image_path], ['deleted', null, null]);
  assert.deepEqual(await viewsOf(id), EMPTY);
});

test('묶음 칸은 ready인 그림에만: 칸을 비우지 않고 그림만 지우는 길은 DB가 막는다', async () => {
  await clean();
  const id = await drawn('guest');
  // 0003의 옛 avatar_forget처럼 묶음 칸을 모르는 고치기
  await assert.rejects(db.query(`update public.avatars set status = 'deleted', image_path = null where id = $1`, [id]), /avatars_views_need_image/);
  assert.equal((await row(id)).status, 'ready');
  const queued = await avatar('guest', { status: 'queued' });
  await assert.rejects(db.query(`update public.avatars set views_status = 'ready' where id = $1`, [queued]), /avatars_views_need_image/);
  const idle = await avatar('guest');
  await assert.rejects(db.query(`update public.avatars set views_status = 'drawing' where id = $1`, [idle]), /avatars_views_drawing_has_claim/);
  await assert.rejects(db.query(`update public.avatars set views_status = 'queued' where id = $1`, [idle]), /avatars_views_status_known/);
  await assert.rejects(db.query(`update public.avatars set views_mode = 'side' where id = $1`, [idle]), /avatars_views_mode_known/);
  await assert.rejects(db.query(`update public.avatars set views_attempts = 11 where id = $1`, [idle]), /avatars_views_attempts_range/);
});

// ───────────────────────────── 남은 파일: 일꾼이 올린 뒤 거두기 전에 멈췄을 때, 옛 사이트가 그림만 지웠을 때
test('남은 파일 찾기: 그림이 없는 v1 묶음 파일만 고른다(지운 그림, 없는 줄, 남의 폴더). 살아 있는 그림의 것은 그리다 만 것도 두고', async () => {
  await clean();
  const live = await drawn('guest', { age: 1 });
  const busy = await avatar('guest', { age: 2 });
  const gone = await drawn('guest', { age: 3 });
  const failed = await avatar('guest2', { age: 4 });
  const idle = await avatar('guest2', { age: 5 });
  const dead = await avatar('guest3', { status: 'failed', age: 6 }); // 한 장 그림부터 실패한 줄
  const nobody = crypto.randomUUID();
  await wear('guest', busy);
  assert.equal((await claim('w1')).id, busy);
  assert.equal(await forget('guest', gone, 'character'), true);
  await db.query(`update public.avatars set views_status = 'failed', views_attempts = 3, views_reason = 'timeout' where id = $1`, [failed]);
  const keep = [
    ...both('guest', live), ...both('guest', busy),                     // 쓰이는 묶음, 지금 그리는 묶음
    // 살아 있는 그림에 남은 조각(실패로 굳었거나 되돌려진 것): 다시 그리면 덮이고, 그림을 지울 때 함께 지워진다.
    // 여기서 고르면 다른 일꾼이 지금 올리는 파일을 지울 수 있다
    ...both('guest2', failed), viewsPath(U.guest2, idle, 's'),
    `${U.guest}/chars/${gone}.png`, `${U.guest}/originals/${gone}.jpg`, // 묶음이 아닌 파일
    `${U.guest}/views/${gone}.v2l.webp`, `${U.guest}/views/notes.txt`,  // v1 묶음 이름이 아닌 것
    `${U.guest}/views/${gone.toUpperCase()}.v1l.webp`, `views/${gone}.v1l.webp`,
  ];
  const stray = [
    ...both('guest', gone),                // 지운 그림
    viewsPath(U.guest3, nobody, 'l'),      // 줄이 없는 그림
    viewsPath(U.guest3, dead, 's'),        // 그림이 없는 줄
    viewsPath(U.guest2, live, 'l'),        // 살아 있는 그림 id지만 남의 폴더
  ];
  await put(...keep, ...stray);
  const strays = (limit = 100) => as('service', async (tx) =>
    (await tx.query('select public.avatar_views_strays($1) as name', [limit])).rows.map((r) => r.name));
  assert.deepEqual(await strays(), [...stray].sort());
  // 한 번에 고르는 수: 1~1000 사이로 맞춘다. 비우면 100
  assert.equal((await strays(2)).length, 2);
  assert.equal((await strays(0)).length, 1);
  assert.equal((await strays(null)).length, stray.length);
  // 일꾼이 치우고 나면(저장소에서 지우면) 더 고르지 않는다. 살아 있는 것은 그대로
  await db.query(`delete from storage.objects where name = any($1::text[])`, [stray]);
  assert.deepEqual(await strays(), []);
  assert.equal((await db.query(`select count(*)::int as n from storage.objects where bucket_id = 'avatars'`)).rows[0].n, keep.length);
});

// ───────────────────────────── 일꾼 어댑터: 부르는 이름과 인자가 이 마이그레이션과 맞는가
// 일꾼은 DB 함수를 인자 이름으로 부른다. 이름이 하나라도 다르면 운영에서 함수를 찾지 못한다(가짜 DB로 도는 일꾼 시험은 모른다).
// 같은 어댑터에 PGlite로 가는 연결을 끼워 끝까지 돌려 본다. 일꾼의 비밀 키는 service_role이다.
const MANY = new Set(['avatar_views_strays']);
const viaDb = {
  async rpc(fn, args = {}) {
    const keys = Object.keys(args);
    const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
    try {
      const rows = await as('service', async (tx) => (await tx.query(`select v from ${call} as v`, keys.map((k) => args[k]))).rows);
      // 여러 줄을 돌려주는 함수는 배열로, 값 하나를 돌려주는 함수는 그 값으로 온다
      return { data: MANY.has(fn) ? rows.map((r) => r.v) : rows[0]?.v ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: String(e.message) } };
    }
  },
  storage: {
    from: (bucket) => ({
      remove: async (paths) => {
        await db.query('delete from storage.objects where bucket_id = $1 and name = any($2::text[])', [bucket, paths]);
        return { data: [], error: null };
      },
    }),
  },
};

test('일꾼 어댑터가 부르는 이름과 인자 그대로: 한 장 그림 → 묶음 잡기 → 돌려놓기 → 정리 → 지운 그림의 남은 파일 치우기', async () => {
  await clean();
  const worker = wrapSupabase(viaDb);
  const w = worker.db;
  // 한 장 그림(0003의 함수들)
  const id = await avatar('guest', { status: 'queued' });
  const image_path = `${U.guest}/chars/${id}.png`;
  await w.beat('w1', 'avatar-worker-2');
  const job = await w.claim('w1', 600);
  assert.deepEqual([job.id, job.attempts, job.give_up], [id, 1, false]);
  assert.equal(await w.release(id, 'w1', 0), true);
  assert.equal((await w.claim('w1', 600)).attempts, 2);
  assert.equal(await w.settle(id, 'ready', { imagePath: image_path, model: MODEL }), true);
  // 묶음(0015의 함수들). 그 그림으로 걷기 시작해야 차례가 온다
  assert.equal(await w.viewsClaim('w1', 1200), null);
  await wear('guest', id);
  assert.deepEqual(await w.viewsClaim('w1', 1200), { id, user_id: U.guest, image_path, attempts: 1, sheet_fails: 0 });
  assert.equal(await w.viewsClaim('w1', 1200), null);
  assert.equal(await w.viewsRelease(id, 'w2', 0), false);
  assert.equal(await w.viewsRelease(id, 'w1', 0), true);
  // 시트 탓으로 돌려놓으면 그 수가 따로 올라 다음에 잡을 때 온다
  assert.equal((await w.viewsClaim('w1', 1200)).sheet_fails, 0);
  assert.equal(await w.viewsRelease(id, 'w1', 0, true), true);
  assert.deepEqual(await w.viewsClaim('w2', 1200), { id, user_id: U.guest, image_path, attempts: 3, sheet_fails: 1 });
  await put(...both('guest', id)); // 일꾼이 묶음 두 파일을 올렸다
  assert.equal(await w.viewsSettle(id, 'ready', { mode: 'full', model: MODEL }), true);
  assert.deepEqual(await viewsOf(id), { ...EMPTY, status: 'ready', attempts: 3, worker: 'w2', mode: 'full', model: MODEL });
  assert.deepEqual(await w.viewsStrays(), []);
  assert.equal(await sweepViewStrays(worker), 0);
  const other = await avatar('guest2');
  assert.equal((await w.viewsClaim('w1', 1200)).id, other);
  assert.equal(await w.viewsSettle(other, 'failed', { reason: 'sheet_count' }), true);
  assert.deepEqual(await viewsOf(other), { ...EMPTY, status: 'failed', attempts: 1, worker: 'w1', reason: 'sheet_count' });
  // 본인이 그림을 지웠는데 묶음 파일이 남았다(일꾼이 거두기 전에 멈춘 경우): 찾아서 치운다
  assert.equal(await forget('guest', id, 'character'), true);
  assert.equal(await w.viewsSettle(id, 'ready', { mode: 'full', model: MODEL }), false);
  assert.deepEqual(await w.viewsStrays(), both('guest', id));
  assert.equal(await sweepViewStrays(worker), 2);
  assert.deepEqual(await w.viewsStrays(), []);
  assert.equal((await db.query(`select count(*)::int as n from storage.objects where bucket_id = 'avatars'`)).rows[0].n, 0);
});

test('일꾼 어댑터: 함수가 없는 DB(0015를 올리기 전)에서는 묶음 일을 오류로 알린다. 한 장 그림 함수는 그대로 돈다', async () => {
  const old = new PGlite();
  await old.exec(STUB);
  for (const m of BEFORE) await old.exec(m);
  const viaOld = {
    async rpc(fn, args = {}) {
      const keys = Object.keys(args);
      try {
        const sql = `select v from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`;
        return { data: (await old.query(sql, keys.map((k) => args[k]))).rows[0]?.v ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e.message) } };
      }
    },
  };
  const w = wrapSupabase(viaOld).db;
  assert.equal(await w.claim('w1', 600), null);
  await assert.rejects(w.viewsClaim('w1', 1200), (e) => e.code === 'db_error' && /avatar_views_claim/.test(e.message));
  await old.close();
});

// ───────────────────────────── 0003 시험을 0015까지 올린 DB에서 그대로 한 번 더
// avatars.test.mjs는 0001 + 0003만 올려 돈다. 여기서는 그 파일이 0003을 읽을 때 0015를 뒤에 붙여 주어,
// 다시 정의한 avatar_forget과 새 칸 아래에서도 캐릭터 만들기·고르기·지우기·대기열이 그대로인지 같은 시험으로 본다.
let patched = 0;
const plainRead = fs.readFileSync;
fs.readFileSync = function readWithViews(file, ...rest) {
  const text = plainRead.call(fs, file, ...rest);
  if (!String(file).endsWith('/0003_avatars.sql') || typeof text !== 'string') return text;
  patched += 1;
  // 0015는 겉모습 칸(0006)을 딛고 선다. 운영에 올리는 순서 그대로 0003 → 0006 → 0015
  return `${text}\n${read('0006_profile_look.sql')}\n${VIEWS}`;
};
syncBuiltinESMExports();
await import('./avatars.test.mjs');

test('위의 0003 시험은 0015를 붙인 DB에서 돌았다', () => {
  assert.equal(patched, 1);
});
