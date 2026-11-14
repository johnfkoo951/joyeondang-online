// 0016_avatar_models.sql을 그 앞의 마이그레이션 전부 위에 올려(PGlite) 사진 캐릭터 3D 모형을 확인한다:
// 잡기·돌려놓기·정리(일꾼), 경로 함수와 저장소 읽기 정책(손님), 지우기가 모형 칸과 묶음 칸을 함께 비우는지, 남은 파일 찾기,
// 없는 파생 파일의 「기다리면 생기는가」(avatar_asset_state), 버킷이 GLB를 받는지,
// 그리고 일꾼의 어댑터(worker/avatar/supabase.mjs)가 부르는 이름과 인자가 이 마이그레이션과 맞는지.
// 맨 끝에서는 0003 시험(avatars.test.mjs)을 0016까지 올린 DB에서 그대로 한 번 더 돌린다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { modelPath, viewsPath } from '../../src/lib/avatar/rules.ts';
import { sweepModelStrays, wrapSupabase } from '../../worker/avatar/supabase.mjs';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const BEFORE = ['0001_init.sql', '0002_rooms_play.sql', '0003_avatars.sql', '0004_shots.sql', '0006_profile_look.sql',
  '0008_rooms_more.sql', '0010_qr_quiet.sql', '0012_note_photos.sql', '0014_guards.sql', '0015_avatar_views.sql'].map(read);
const MODELS = read('0016_avatar_models.sql');

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
const MAKER = 'trellis-image-large';
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
 * use가 참이면(ready인 그림의 기본값) 그 사람이 지금 걷기에 쓰는 캐릭터로 건다: 모형은 쓰는 캐릭터만 만든다.
 * agreed는 여러 방향 그림까지 동의했는가(0015). 모형은 이 값을 보지 않는다
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
/** 모형 칸만(비교하기 좋게 때는 있음/없음으로) */
const modelOf = async (id) => {
  const r = await row(id);
  return { status: r.model_status, attempts: r.model_attempts, bad: r.model_bad_fails, worker: r.model_worker,
    maker: r.model_maker, reason: r.model_reason, claimed: r.model_claimed_at !== null, wait: r.model_not_before !== null };
};
const EMPTY = { status: null, attempts: 0, bad: 0, worker: null, maker: null, reason: null, claimed: false, wait: false };
const claim = (worker = 'w1', lease = 600) => as('service', (tx) => val(tx, 'select public.avatar_model_claim($1, $2)', [worker, lease]));
const release = (id, worker, delay, bad = false) => as('service', (tx) => val(tx, 'select public.avatar_model_release($1, $2, $3, $4)', [id, worker, delay, bad]));
const settle = (id, status, maker = null, reason = null, worker = null) =>
  as('service', (tx) => val(tx, 'select public.avatar_model_settle($1, $2, $3, $4, $5)', [id, status, maker, reason, worker]));
const forget = (who, id, part) => as(who, (tx) => val(tx, 'select public.avatar_forget($1, $2)', [id, part]));
const state = (who, id, kind) => as(who, (tx) => val(tx, 'select public.avatar_asset_state($1, $2)', [id, kind]));
/** 모형까지 다 만든 그림 */
async function made(who, opts) {
  const id = await avatar(who, opts);
  await db.query(`update public.avatars set model_status = 'ready', model_attempts = 1, model_worker = 'w0', model_maker = $2
    where id = $1`, [id, MAKER]);
  return id;
}
/** 임대가 끝난 것처럼 잡은 때를 옮긴다 */
const stale = (id, ago = '2 hours') => db.query(`update public.avatars set model_claimed_at = now() - $2::interval where id = $1`, [id, ago]);
const put = (...names) => db.query(`insert into storage.objects (bucket_id, name) select 'avatars', n from unnest($1::text[]) n
  on conflict do nothing`, [names]);
const seen = async (who) => (await as(who, (tx) => tx.query(`select name from storage.objects where bucket_id = 'avatars' order by name`)))
  .rows.map((r) => r.name);
const glb = (who, id) => modelPath(U[who], id);

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const m of BEFORE) await db.exec(m);
  await db.exec(MODELS);
  await db.exec(MODELS); // 두 번 올려도 괜찮다
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await db.exec(`insert into public.roster (display_name, role, email) values
    ('손님하나', 'guest', '${EMAIL.guest}'), ('손님둘', 'guest', '${EMAIL.guest2}'), ('손님셋', 'guest', '${EMAIL.guest3}');`);
  for (const w of Object.keys(U)) await as(w, (tx) => tx.query('select public.sync_my_roster()'));
});

// ───────────────────────────── 준비
test('모형 칸 여덟 개, 손님 읽기 정책 하나, 버킷이 GLB를 받고, 함수의 실행권은 필요한 만큼만', async () => {
  const cols = (await db.query(`select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'avatars' and column_name like 'model\\_%' order by 1`)).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ['model_attempts', 'model_bad_fails', 'model_claimed_at', 'model_maker', 'model_not_before', 'model_reason',
    'model_status', 'model_worker']);
  const policies = (await db.query(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'avatars\\_%' order by 1`)).rows.map((r) => r.policyname);
  assert.deepEqual(policies, ['avatars_guest_select_chars', 'avatars_guest_select_models', 'avatars_guest_select_views',
    'avatars_owner_delete', 'avatars_owner_select']);
  // 두 번 올렸어도 형식은 한 번만 더해진다. 0003의 형식과 크기 상한은 그대로
  const b = (await db.query(`select allowed_mime_types as t, file_size_limit as n from storage.buckets where id = 'avatars'`)).rows[0];
  assert.deepEqual(b.t, ['image/jpeg', 'image/png', 'image/webp', 'model/gltf-binary']);
  assert.equal(Number(b.n), 8388608);
  const FN = { claim: 'avatar_model_claim(text, int)', release: 'avatar_model_release(uuid, text, int, boolean)',
    settle: 'avatar_model_settle(uuid, text, text, text, text)', strays: 'avatar_model_strays(int)',
    path: 'avatar_model_path(uuid)', readable: 'avatar_model_readable(text)', state: 'avatar_asset_state(uuid, text)',
    forget: 'avatar_forget(uuid, text)' };
  const can = async (role) => {
    const out = {};
    for (const [k, sig] of Object.entries(FN)) {
      out[k] = (await db.query(`select has_function_privilege($1, $2, 'execute') as v`, [role, `public.${sig}`])).rows[0].v;
    }
    return out;
  };
  const none = { claim: false, release: false, settle: false, strays: false, path: false, readable: false, state: false, forget: false };
  assert.deepEqual(await can('anon'), none);
  assert.deepEqual(await can('authenticated'), { ...none, path: true, readable: true, state: true, forget: true });
  const worker = await can('service_role');
  assert.deepEqual([worker.claim, worker.release, worker.settle, worker.strays], [true, true, true, true]);
});

test('형식 목록이 비어 있는(모두 받는) 버킷에는 형식을 더하지 않는다: 하나를 더하면 그것만 받게 된다', async () => {
  const d = new PGlite();
  await d.exec(STUB);
  for (const m of BEFORE) await d.exec(m);
  await d.exec(`update storage.buckets set allowed_mime_types = null where id = 'avatars'`);
  await d.exec(MODELS);
  assert.equal((await d.query(`select allowed_mime_types as t from storage.buckets where id = 'avatars'`)).rows[0].t, null);
  await d.close();
});

test('앞의 마이그레이션이 없는 DB에는 올라가지 않고, 아무것도 바꾸지 않는다(0003, 0006, 0015 차례로)', async () => {
  const cases = [[1, /0016_needs_0001_0003/], [3, /0016_needs_0006/], [BEFORE.length - 1, /0016_needs_0015/]];
  for (const [n, re] of cases) {
    const d = new PGlite();
    await d.exec(STUB);
    for (const m of BEFORE.slice(0, n)) await d.exec(m);
    await assert.rejects(d.exec(MODELS), re);
    const r = (await d.query(`select to_regprocedure('public.avatar_model_claim(text, int)') is null as no_claim,
      (select count(*)::int from pg_policies where policyname = 'avatars_guest_select_models') as policies,
      (select count(*)::int from information_schema.columns
        where table_schema = 'public' and table_name = 'avatars' and column_name like 'model\\_%') as cols`)).rows[0];
    assert.deepEqual(r, { no_claim: true, policies: 0, cols: 0 }, String(re));
    await d.close();
  }
});

test('저장소 표의 줄이 가려지는 역할로는 올라가지 않는다(남은 파일을 조용히 놓치는 일을 막는다)', async () => {
  const d = new PGlite();
  await d.exec(STUB);
  for (const m of BEFORE) await d.exec(m);
  await d.exec('create role plain nologin; grant usage on schema public, storage, auth to plain;');
  await assert.rejects(d.transaction(async (tx) => {
    await tx.query('set local role plain');
    await tx.exec(MODELS);
  }), /0016_needs_role_that_reads_all_storage_rows/);
  const r = (await d.query(`select to_regprocedure('public.avatar_model_strays(int)') is null as no_strays`)).rows[0];
  assert.deepEqual(r, { no_strays: true });
  await d.close();
});

// ───────────────────────────── 대기열: 일꾼(비밀 키)이 잡아 만든다
test('잡기: 새것부터, 한 그림을 둘이 잡지 않고, ready가 아닌 줄과 이미 끝난 줄은 안 잡힌다', async () => {
  await clean();
  const older = await avatar('guest', { age: 300 });
  const newer = await avatar('guest2', { age: 10 });
  await avatar('guest', { status: 'queued', age: 1 });   // 아직 한 장 그림도 안 그린 줄
  await avatar('guest', { status: 'deleted', age: 1 });  // 지운 줄
  await avatar('guest', { status: 'failed', age: 1 });   // 한 장 그림이 실패한 줄
  await made('guest3', { age: 1 });                      // 모형까지 다 만든 줄
  const failed = await avatar('guest3', { age: 2 });     // 모형이 실패로 굳은 줄
  await db.query(`update public.avatars set model_status = 'failed', model_attempts = 3, model_reason = 'bad_output' where id = $1`, [failed]);

  const c1 = await claim('w1');
  assert.deepEqual(c1, { id: newer, user_id: U.guest2, image_path: `${U.guest2}/chars/${newer}.png`, attempts: 1, bad_fails: 0 });
  const c2 = await claim('w2');
  assert.deepEqual(c2, { id: older, user_id: U.guest, image_path: `${U.guest}/chars/${older}.png`, attempts: 1, bad_fails: 0 });
  assert.equal(await claim('w1'), null, '남은 것이 없다');
  assert.deepEqual(await modelOf(newer), { ...EMPTY, status: 'drawing', attempts: 1, worker: 'w1', claimed: true });
  assert.deepEqual(await modelOf(older), { ...EMPTY, status: 'drawing', attempts: 1, worker: 'w2', claimed: true });
  assert.equal((await modelOf(failed)).status, 'failed');
  // 잡기는 살아 있음도 남긴다(화면의 「일꾼이 쉬는 중」 안내가 이것을 본다)
  const beats = (await db.query('select worker from public.avatar_workers order by 1')).rows.map((r) => r.worker);
  assert.deepEqual(beats, ['w1', 'w2']);
  // PGlite는 연결이 하나라 진짜 동시 잡기는 만들지 못한다. 둘이 한 줄을 잡지 않게 하는 장치가 그대로 있는지 본다
  assert.match(MODELS, /limit 1 for update skip locked/);
  // 묶음 줄(0015)과는 따로 간다: 모형을 잡아도 묶음 칸은 그대로
  assert.equal((await row(newer)).views_status, null);
});

test('모형은 여러 방향 그림의 동의를 보지 않는다(우리 컴퓨터에서 만든다): 동의 전 옛 캐릭터도 쓰는 중이면 잡힌다', async () => {
  await clean();
  const old = await avatar('guest', { agreed: false });
  assert.equal((await claim('w1')).id, old);
  // 묶음 줄에는 서지 않는다(0015 그대로)
  assert.equal(await as('service', (tx) => val(tx, 'select public.avatar_views_claim($1, 600)', ['w1'])), null);
});

test('쓰는 캐릭터만 만든다: 고르지 않은 캐릭터는 잡히지 않고, 그 캐릭터로 바꿔 걸으면 그때 잡힌다', async () => {
  await clean();
  const first = await avatar('guest', { age: 30 });
  const second = await avatar('guest', { age: 10, use: false }); // 더 새것이지만 고르지 않았다
  assert.equal((await claim('w1')).id, first, '새것이어도 쓰지 않는 캐릭터는 건너뛴다');
  assert.equal(await settle(first, 'ready', MAKER), true);
  assert.equal(await claim('w1'), null, '고르지 않은 캐릭터에는 그래픽 카드 시간을 쓰지 않는다');
  // 내 캐릭터 화면에서 고르기만 한 것(profiles.avatar_id)은 걷기 화면의 겉모습이 아니다
  assert.equal(await as('guest', (tx) => val(tx, 'select public.avatar_choose($1)', [second])), true);
  assert.equal(await claim('w1'), null, '걷기 화면은 look만 쓴다');
  // 그 캐릭터로 바꿔 걸으면(본인이 저장하는 길 그대로) 줄에 선다
  await as('guest', (tx) => tx.query(`update public.profiles set look = $1::jsonb where user_id = $2::uuid`,
    [JSON.stringify({ kind: 'photo', url: `/api/avatar/${second}` }), U.guest]));
  assert.equal((await claim('w1')).id, second);
  assert.equal(await release(second, 'w1', 0), true);
  await wear('guest', null);
  assert.equal(await claim('w1'), null, '종이 인형으로 돌아가면 잡히지 않는다');
  // 이미 만든 모형은 그대로 열린다(다시 그 캐릭터를 고르면 바로 쓴다)
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_model_path($1)', [first])), glb('guest', first));
});

test('손님과 로그인 안 한 사람은 잡기·돌려놓기·정리·남은 파일 찾기를 부르지 못하고 칸을 직접 고치지 못한다', async () => {
  await clean();
  const id = await avatar('guest');
  for (const who of ['guest', 'visitor', 'anon']) {
    await fails(who, `select public.avatar_model_claim('x', 600)`, [], /permission denied/);
    await fails(who, `select public.avatar_model_release($1, 'x', 0)`, [id], /permission denied/);
    await fails(who, `select public.avatar_model_settle($1, 'ready', 'm')`, [id], /permission denied/);
    await fails(who, `select * from public.avatar_model_strays(10)`, [], /permission denied/);
  }
  await fails('guest', `update public.avatars set model_status = 'ready' where id = $1`, [id], /permission denied/);
  assert.deepEqual(await modelOf(id), EMPTY);
});

test('돌려놓기: 잡은 일꾼만 돌려놓고, 기다리는 동안은 안 잡히며, 때가 되면 이어서 잡힌다(0초~1시간)', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('w1')).id, id);
  assert.equal(await release(id, 'w2', 0), false, '다른 일꾼은 못 돌려놓는다');
  assert.equal(await release(id, 'w1', 300), true);
  assert.deepEqual(await modelOf(id), { ...EMPTY, attempts: 1, wait: true });
  assert.equal(await claim('w1'), null, '기다리는 동안은 안 잡힌다');
  assert.equal(await release(id, 'w1', 0), false, '잡지 않은 줄은 돌려놓을 것이 없다');
  await db.query(`update public.avatars set model_not_before = now() - interval '1 second' where id = $1`, [id]);
  assert.deepEqual(await claim('w2'), { id, user_id: U.guest, image_path: `${U.guest}/chars/${id}.png`, attempts: 2, bad_fails: 0 });
  assert.equal(await release(id, 'w2', 999999), true);
  const wait = (await db.query(`select extract(epoch from model_not_before - now())::int as s from public.avatars where id = $1`, [id])).rows[0].s;
  assert.ok(wait > 3500 && wait <= 3600, `1시간을 넘지 않는다(${wait})`);
});

test('결과가 이상해 돌려놓은 횟수는 따로 센다: 서비스가 꺼진 사이 쓴 횟수가 그 한도를 깎지 않는다', async () => {
  await clean();
  const id = await avatar('guest');
  for (const n of [1, 2, 3]) {
    assert.deepEqual([(await claim('w1')).bad_fails, await release(id, 'w1', 0)], [0, true]);
    assert.deepEqual([(await modelOf(id)).attempts, (await modelOf(id)).bad], [n, 0]);
  }
  assert.equal((await claim('w1')).bad_fails, 0);
  assert.equal(await release(id, 'w1', 0, true), true);
  assert.deepEqual(await claim('w1'), { id, user_id: U.guest, image_path: `${U.guest}/chars/${id}.png`, attempts: 5, bad_fails: 1 });
  assert.equal(await release(id, 'w2', 0, true), false, '내가 잡지 않은 줄은 세지도 않는다');
  assert.equal((await modelOf(id)).bad, 1);
  assert.equal(await forget('guest', id, 'character'), true);
  assert.deepEqual(await modelOf(id), EMPTY, '그림을 지우면 함께 지워진다');
});

test('임대가 끝난 것은 다음 잡기가 되돌리고, 여덟 번 잡고도 못 끝내면 failed(timeout). 그림 한 장은 그대로', async () => {
  await clean();
  const id = await avatar('guest');
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.deepEqual([(await claim('w1', 600)).id, (await modelOf(id)).attempts], [id, n]);
    assert.equal(await claim('w2', 600), null, '임대 안에서는 다른 일꾼이 불러도 그대로다');
    await stale(id);
  }
  assert.equal(await claim('w2', 600), null, '여덟 번 다 썼다');
  assert.deepEqual(await modelOf(id), { ...EMPTY, status: 'failed', attempts: 8, reason: 'timeout' });
  assert.equal((await row(id)).status, 'ready');
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_char_path($1)', [id])), `${U.guest}/chars/${id}.png`);
});

test('임대는 아무리 짧게 불러도 1분보다 줄지 않는다', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('w1', 1)).id, id);
  await stale(id, '30 seconds');
  assert.equal(await claim('w2', 1), null);
  assert.equal((await modelOf(id)).worker, 'w1');
  await stale(id, '61 seconds');
  assert.deepEqual([(await claim('w2', 1)).attempts, (await modelOf(id)).worker], [2, 'w2']);
});

test('돌려놓은 줄은 열 번에서 DB가 끊고(failed, attempts) 다음 줄로 간다. 머리말의 「다시 만들게」로 되살린다', async () => {
  await clean();
  const stuck = await avatar('guest', { age: 1 });
  const next = await avatar('guest2', { age: 2 });
  for (let n = 1; n <= 10; n += 1) {
    assert.deepEqual(await claim('w1'), { id: stuck, user_id: U.guest, image_path: `${U.guest}/chars/${stuck}.png`, attempts: n, bad_fails: 0 });
    assert.equal(await release(stuck, 'w1', 0), true);
  }
  assert.deepEqual(await claim('w1'), { id: next, user_id: U.guest2, image_path: `${U.guest2}/chars/${next}.png`, attempts: 1, bad_fails: 0 });
  assert.deepEqual(await modelOf(stuck), { ...EMPTY, status: 'failed', attempts: 10, reason: 'attempts' });
  assert.equal(await settle(next, 'ready', MAKER), true);
  assert.equal(await claim('w1'), null);
  await db.query(`update public.avatars set model_status = null, model_attempts = 0, model_bad_fails = 0, model_reason = null, model_not_before = null
    where id = $1 and status = 'ready'`, [stuck]);
  assert.deepEqual([(await claim('w1')).id, (await modelOf(stuck)).attempts], [stuck, 1]);
});

test('정리: ready면 만든 서비스가, failed면 까닭이 남는다. 모르는 상태·빈 상태는 거절, 낯선 값은 정리를 막지 않는다', async () => {
  await clean();
  const a = await avatar('guest', { age: 1 });
  const b = await avatar('guest2', { age: 2 });
  const c = await avatar('guest3', { age: 3 });
  assert.equal((await claim('w1')).id, a);
  assert.equal(await settle(a, 'ready', MAKER), true);
  assert.deepEqual(await modelOf(a), { ...EMPTY, status: 'ready', attempts: 1, worker: 'w1', maker: MAKER });
  assert.equal((await claim('w1')).id, b);
  for (const bad of ['drawing', 'queued', 'Ready', '', null]) {
    await fails('service', `select public.avatar_model_settle($1, $2)`, [b, bad], /bad_status/);
  }
  assert.deepEqual(await modelOf(b), { ...EMPTY, status: 'drawing', attempts: 1, worker: 'w1', claimed: true }, '거절된 정리는 아무것도 바꾸지 않는다');
  assert.equal(await settle(b, 'failed', 'bad maker name!', 'Not A Reason'), true);
  assert.deepEqual(await modelOf(b), { ...EMPTY, status: 'failed', attempts: 1, worker: 'w1', reason: 'error' });
  assert.equal((await claim('w1')).id, c);
  assert.equal(await settle(c, 'ready', 'x'.repeat(65)), true);
  assert.deepEqual(await modelOf(c), { ...EMPTY, status: 'ready', attempts: 1, worker: 'w1' }, '서비스 이름만 비우고 모형은 연다');
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_model_path($1)', [c])), glb('guest3', c));
  // 끝난 줄은 다시 잡히지 않는다. 잡지 않은 줄·없는 줄·실패로 끝난 줄의 정리는 false
  assert.equal(await claim('w1'), null);
  const idle = await avatar('visitor');
  assert.equal(await settle(idle, 'ready', MAKER), false);
  assert.equal(await settle(crypto.randomUUID(), 'ready', MAKER), false);
  assert.equal(await settle(b, 'ready', MAKER), false);
  assert.deepEqual(await modelOf(idle), EMPTY);
});

test('정리: 만드는 사이 본인이 그림을 지웠으면 false이고, 지운 줄에는 아무것도 적히지 않는다', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('w1')).id, id);
  assert.equal(await forget('guest', id, 'character'), true);
  assert.equal(await settle(id, 'ready', MAKER), false, '일꾼은 이 답을 보고 올린 파일을 거둔다');
  assert.equal(await settle(id, 'failed', null, 'timeout'), false);
  assert.equal(await release(id, 'w1', 0), false);
  assert.deepEqual([(await row(id)).status, (await row(id)).image_path], ['deleted', null]);
  assert.deepEqual(await modelOf(id), EMPTY);
  assert.equal(await claim('w1'), null, '지운 그림은 다시 잡히지 않는다');
});

test('정리: 다른 일꾼이 다시 잡아 먼저 끝낸 뒤의 늦은 ready는 true, 옛 일꾼의 늦은 failed는 false', async () => {
  await clean();
  const id = await avatar('guest');
  assert.equal((await claim('slow')).attempts, 1);
  await stale(id);
  assert.equal((await claim('fast')).attempts, 2);
  assert.equal(await settle(id, 'failed', null, 'bad_output', 'slow'), false, '지금 만드는 일꾼의 줄을 굳히지 않는다');
  assert.deepEqual(await modelOf(id), { ...EMPTY, status: 'drawing', attempts: 2, worker: 'fast', claimed: true });
  assert.equal(await settle(id, 'ready', 'maker-a', null, 'fast'), true);
  assert.equal(await settle(id, 'ready', 'maker-b', null, 'slow'), true, '같은 자리에 올린 파일이 쓰인다');
  assert.deepEqual(await modelOf(id), { ...EMPTY, status: 'ready', attempts: 2, worker: 'fast', maker: 'maker-b' });
  assert.equal(await settle(id, 'failed', null, 'timeout'), false);
  // 돌려놓기는 만드는 중(drawing)인 줄만: 정리가 적힌 뒤 같은 일꾼이 돌려놓으려 해도 그대로
  assert.equal(await release(id, 'fast', 0), false);
  assert.equal((await modelOf(id)).status, 'ready');
});

// ───────────────────────────── 읽기: 명단 손님만, ready인 것만
test('경로 함수: 명단 손님만, 그림도 모형도 ready일 때만', async () => {
  await clean();
  const id = await avatar('guest');
  const path = (who, pid = id) => as(who, (tx) => val(tx, 'select public.avatar_model_path($1)', [pid]));
  assert.equal(await path('guest2'), null, '아직 안 만든 모형');
  assert.equal((await claim('w1')).id, id);
  assert.equal(await path('guest2'), null, '만드는 중인 모형');
  assert.equal(await settle(id, 'ready', MAKER), true);
  assert.equal(await path('guest2'), glb('guest', id));
  assert.equal(glb('guest', id), `${U.guest}/models/${id}.v1.glb`, '사이트·일꾼의 modelPath()와 같은 모양');
  assert.equal(await path('guest'), glb('guest', id), '본인도 같은 길로');
  assert.equal(await path('visitor'), null, '명단 밖은 못 얻는다');
  await fails('anon', 'select public.avatar_model_path($1)', [id], /permission denied/);
  assert.equal(await path('guest2', crypto.randomUUID()), null, '없는 그림');
  assert.equal(await forget('guest', id, 'character'), true);
  assert.equal(await path('guest2'), null, '그림을 지우면 닫힌다');
});

test('저장소 읽기: 다른 손님은 ready인 그림의 ready인 모형만 본다. 덜 된 모형, 지운 그림의 모형, 다른 이름은 못 본다', async () => {
  await clean();
  const done = await made('guest', { age: 1 });
  const half = await avatar('guest', { age: 2 });
  const gone = await made('guest', { age: 3 });
  const files = (id) => [`${U.guest}/chars/${id}.png`, glb('guest', id)];
  const odd = [
    `${U.guest}/models/${done}.v2.glb`,      // 다른 판
    `${U.guest}/models/${done}.v1.glb.bak`,
    `${U.guest}/models/x/${done}.v1.glb`,    // 더 깊은 폴더
    `${U.guest}/models/${done}.v1.gltf`,
    `${U.guest2}/models/${done}.v1.glb`,     // 남의 폴더에 같은 그림 id
    `${U.guest}/views/${done}.v1.glb`,       // 다른 폴더
  ];
  await put(...files(done), ...files(half), ...files(gone), ...odd);
  await wear('guest', half);
  assert.equal((await claim('w1')).id, half); // 만드는 중: 일꾼이 파일을 올렸지만 아직 정리 전
  assert.equal(await forget('guest', gone, 'character'), true);

  assert.deepEqual(await seen('guest3'), [`${U.guest}/chars/${done}.png`, `${U.guest}/chars/${half}.png`, glb('guest', done)].sort());
  assert.deepEqual(await seen('guest2'), [
    `${U.guest}/chars/${done}.png`, `${U.guest}/chars/${half}.png`, glb('guest', done),
    `${U.guest2}/models/${done}.v1.glb`, // 자기 폴더의 파일(본인 정책). 그 이름이 남의 모형으로 통하지는 않는다
  ].sort());
  assert.deepEqual(await seen('visitor'), [], '명단 밖은 아무것도');
  assert.deepEqual(await seen('anon'), [], '로그인 안 한 사람도 아무것도');
  // 정책이 기대는 함수도 같은 답
  const readable = (who, name) => as(who, (tx) => val(tx, 'select public.avatar_model_readable($1)', [name]));
  assert.equal(await readable('guest2', glb('guest', done)), true);
  assert.equal(await readable('visitor', glb('guest', done)), false);
  for (const name of [glb('guest', half), glb('guest', gone), ...odd, `${U.guest}/chars/${done}.png`, '', 'x']) {
    assert.equal(await readable('guest2', name), false, name);
  }
  // 손님은 모형을 올리지도, 남의 것을 지우지도 못한다. 본인은 자기 것을 지운다(지우기 흐름이 이것으로 지운다)
  await fails('guest', `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [glb('guest', half) + '.new'], /row-level security/);
  const stolen = await as('guest2', (tx) => tx.query(`delete from storage.objects where name like $1 returning name`, [`${U.guest}/%`]));
  assert.equal(stolen.rows.length, 0, '남의 파일은 못 지운다');
  const mine = await as('guest', (tx) => tx.query(`delete from storage.objects where name = $1 returning name`, [glb('guest', done)]));
  assert.equal(mine.rows.length, 1, '본인은 자기 모형 파일을 지운다');
});

test('다른 버킷에 같은 이름의 파일이 있어도: 손님 읽기 정책과 남은 파일 찾기는 avatars 버킷만 본다', async () => {
  await clean();
  await db.exec(`insert into storage.buckets (id, name) values ('elsewhere', 'elsewhere') on conflict do nothing`);
  const done = await made('guest');
  const orphan = crypto.randomUUID();
  await db.query(`insert into storage.objects (bucket_id, name) select 'elsewhere', n from unnest($1::text[]) n on conflict do nothing`,
    [[glb('guest', done), glb('guest', orphan)]]);
  try {
    assert.deepEqual((await as('guest2', (tx) => tx.query(`select name from storage.objects where bucket_id = 'elsewhere'`))).rows, []);
    assert.deepEqual((await as('service', (tx) => tx.query('select * from public.avatar_model_strays(100)'))).rows, []);
  } finally {
    await db.query(`delete from storage.objects where bucket_id = 'elsewhere'`);
  }
});

// ───────────────────────────── 지우기: 그림이 없어지면 모형도, 묶음도 없다
test('지우기: 원본만 지우면 모형·묶음은 그대로, 그림을 지우면(character·both) 모형 칸과 묶음 칸이 모두 빈다', async () => {
  await clean();
  const a = await made('guest', { age: 1 });
  const b = await made('guest', { age: 2 });
  for (const id of [a, b]) {
    await db.query(`update public.avatars set views_status = 'ready', views_attempts = 2, views_worker = 'w0', views_mode = 'full',
      views_model = 'm', views_sheet_fails = 1 where id = $1`, [id]);
  }
  const full = { ...EMPTY, status: 'ready', attempts: 1, worker: 'w0', maker: MAKER };
  assert.equal(await forget('guest', a, 'original'), true);
  let r = await row(a);
  assert.deepEqual([r.status, r.original_path, r.image_path], ['ready', null, `${U.guest}/chars/${a}.png`]);
  assert.deepEqual(await modelOf(a), full);
  assert.equal(r.views_status, 'ready');
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_model_path($1)', [a])), glb('guest', a));
  // 남의 것은 못 지운다. 모르는 부분은 거절한다
  assert.equal(await forget('guest2', a, 'both'), false);
  await fails('guest', `select public.avatar_forget($1, 'model')`, [a], /bad_part/);
  await fails('anon', `select public.avatar_forget($1, 'character')`, [a], /permission denied/);
  assert.deepEqual(await modelOf(a), full);
  for (const [id, part] of [[a, 'character'], [b, 'both']]) {
    assert.equal(await forget('guest', id, part), true);
    r = await row(id);
    assert.deepEqual([r.status, r.image_path], ['deleted', null], part);
    assert.deepEqual(await modelOf(id), EMPTY, part);
    assert.deepEqual([r.views_status, r.views_attempts, r.views_sheet_fails, r.views_worker, r.views_mode, r.views_model],
      [null, 0, 0, null, null, null], `${part}: 묶음 칸(0015)도 그대로 비운다`);
  }
  assert.equal((await as('guest', (tx) => val(tx, 'select public.avatar_quota()'))).used, 2, '지운 줄도 오늘 장수에는 남는다(0003 그대로)');
});

test('지우기: 모형을 만드는 중이거나 기다리는 중이거나 실패로 굳은 그림도, 한 장 그림을 그리던 작업도 칸이 모두 빈다', async () => {
  await clean();
  const drawing = await avatar('guest', { age: 1 });
  const waiting = await avatar('guest2', { age: 2 });
  const failed = await avatar('guest3', { age: 3 });
  assert.equal((await claim('w1')).id, drawing);
  assert.equal((await claim('w1')).id, waiting);
  assert.equal(await release(waiting, 'w1', 600, true), true);
  assert.equal((await claim('w1')).id, failed);
  assert.equal(await settle(failed, 'failed', MAKER, 'bad_output'), true);
  for (const [who, id] of [['guest', drawing], ['guest2', waiting], ['guest3', failed]]) {
    assert.equal(await forget(who, id, 'character'), true);
    assert.deepEqual(await modelOf(id), EMPTY);
    assert.equal((await row(id)).status, 'deleted');
  }
  const queued = await avatar('guest', { status: 'queued' });
  assert.equal(await forget('guest', queued, 'original'), true);
  assert.deepEqual([(await row(queued)).status, (await row(queued)).original_path], ['deleted', null]);
  assert.deepEqual(await modelOf(queued), EMPTY);
  assert.equal(await claim('w1'), null);
});

test('모형 칸은 ready인 그림에만: 칸을 비우지 않고 그림만 지우는 길은 DB가 막는다', async () => {
  await clean();
  const id = await made('guest');
  // 0015의 옛 avatar_forget처럼 모형 칸을 모르는 고치기(묶음 칸은 비어 있다)
  await assert.rejects(db.query(`update public.avatars set status = 'deleted', image_path = null where id = $1`, [id]), /avatars_model_need_image/);
  assert.equal((await row(id)).status, 'ready');
  const queued = await avatar('guest', { status: 'queued' });
  await assert.rejects(db.query(`update public.avatars set model_status = 'ready' where id = $1`, [queued]), /avatars_model_need_image/);
  const idle = await avatar('guest');
  await assert.rejects(db.query(`update public.avatars set model_status = 'drawing' where id = $1`, [idle]), /avatars_model_drawing_has_claim/);
  await assert.rejects(db.query(`update public.avatars set model_status = 'queued' where id = $1`, [idle]), /avatars_model_status_known/);
  await assert.rejects(db.query(`update public.avatars set model_attempts = 11 where id = $1`, [idle]), /avatars_model_attempts_range/);
  await assert.rejects(db.query(`update public.avatars set model_reason = 'Bad Reason' where id = $1`, [idle]), /avatars_model_reason_shape/);
});

// ───────────────────────────── 남은 파일
test('남은 파일 찾기: 그림이 없는 v1 모형 파일만 고른다(지운 그림, 없는 줄, 남의 폴더). 살아 있는 그림의 것은 만들다 만 것도 두고', async () => {
  await clean();
  const live = await made('guest', { age: 1 });
  const busy = await avatar('guest', { age: 2 });
  const gone = await made('guest', { age: 3 });
  const failed = await avatar('guest2', { age: 4 });
  const dead = await avatar('guest3', { status: 'failed', age: 6 }); // 한 장 그림부터 실패한 줄
  const nobody = crypto.randomUUID();
  await wear('guest', busy);
  assert.equal((await claim('w1')).id, busy);
  assert.equal(await forget('guest', gone, 'character'), true);
  await db.query(`update public.avatars set model_status = 'failed', model_attempts = 3, model_reason = 'timeout' where id = $1`, [failed]);
  const keep = [
    glb('guest', live), glb('guest', busy), glb('guest2', failed),
    `${U.guest}/chars/${gone}.png`, viewsPath(U.guest, gone, 'l'),   // 모형이 아닌 파일
    `${U.guest}/models/${gone}.v2.glb`, `${U.guest}/models/notes.txt`, `${U.guest}/models/${gone.toUpperCase()}.v1.glb`,
    `models/${gone}.v1.glb`,
  ];
  const stray = [glb('guest', gone), glb('guest3', nobody), glb('guest3', dead), modelPath(U.guest2, live)];
  await put(...keep, ...stray);
  const strays = (limit = 100) => as('service', async (tx) =>
    (await tx.query('select public.avatar_model_strays($1) as name', [limit])).rows.map((r) => r.name));
  assert.deepEqual(await strays(), [...stray].sort());
  assert.equal((await strays(2)).length, 2);
  assert.equal((await strays(0)).length, 1);
  assert.equal((await strays(null)).length, stray.length);
  await db.query(`delete from storage.objects where name = any($1::text[])`, [stray]);
  assert.deepEqual(await strays(), []);
});

// ───────────────────────────── 없는 파생 파일: 기다리면 생기는가(X-Avatar-Asset)
test('avatar_asset_state: 모형은 그리는 중·만들 차례면 pending, 실패로 굳었거나 그림이 없으면 none, 다 만들었으면 ready', async () => {
  await clean();
  const ready = await made('guest', { age: 1 });
  const waiting = await avatar('guest2', { age: 2 });       // 그림은 ready, 모형은 아직
  const drawing = await avatar('guest3', { status: 'drawing', age: 3 });
  const queued = await avatar('guest3', { status: 'queued', age: 4 });
  const rejected = await avatar('guest3', { status: 'rejected', age: 5 });
  const deleted = await avatar('guest3', { status: 'deleted', age: 6 });
  const failed = await avatar('guest3', { age: 7, use: false });
  await db.query(`update public.avatars set model_status = 'failed', model_attempts = 3, model_reason = 'bad_output' where id = $1`, [failed]);
  const busy = await avatar('visitor', { age: 8 });
  assert.equal((await claim('w1')).id, waiting);
  const want = { [ready]: 'ready', [waiting]: 'pending', [drawing]: 'pending', [queued]: 'pending', [rejected]: 'none',
    [deleted]: 'none', [failed]: 'none', [busy]: 'pending', [crypto.randomUUID()]: 'none' };
  for (const [id, s] of Object.entries(want)) assert.equal(await state('guest2', id, 'model'), s, id);
  // 명단 손님이 아니면 무엇이든 none(있는지조차 알리지 않는다). 로그인 안 한 사람은 부르지 못한다
  for (const id of Object.keys(want)) assert.equal(await state('visitor', id, 'model'), 'none');
  await fails('anon', 'select public.avatar_asset_state($1, $2)', [ready, 'model'], /permission denied/);
  await fails('guest', 'select public.avatar_asset_state($1, $2)', [ready, 'glb'], /bad_kind/);
  await fails('guest', 'select public.avatar_asset_state($1, null)', [ready], /bad_kind/);
});

test('avatar_asset_state: 묶음은 동의 전 옛 캐릭터와 실패로 굳은 것이 none, 그 밖의 ready 그림은 pending', async () => {
  await clean();
  const agreed = await avatar('guest', { age: 1 });
  const old = await avatar('guest2', { age: 2, agreed: false });
  const failed = await avatar('guest3', { age: 3 });
  await db.query(`update public.avatars set views_status = 'failed', views_attempts = 3, views_reason = 'sheet_count' where id = $1`, [failed]);
  const done = await avatar('visitor', { age: 4 });
  await db.query(`update public.avatars set views_status = 'ready', views_attempts = 1, views_worker = 'w0', views_mode = 'full'
    where id = $1`, [done]);
  const inflightOld = await avatar('guest', { status: 'queued', agreed: false });
  const inflight = await avatar('guest', { status: 'pending' });
  const want = { [agreed]: 'pending', [old]: 'none', [failed]: 'none', [done]: 'ready', [inflightOld]: 'none', [inflight]: 'pending' };
  for (const [id, s] of Object.entries(want)) assert.equal(await state('guest3', id, 'views'), s, id);
  // 모형은 동의를 보지 않는다: 같은 옛 캐릭터라도 모형은 pending
  assert.equal(await state('guest3', old, 'model'), 'pending');
});

// ───────────────────────────── 0015의 묶음 흐름은 그대로
test('0016을 올린 DB에서도 묶음 줄(0015)은 그대로 돈다: 잡기·정리·경로, 모형 칸은 건드리지 않는다', async () => {
  await clean();
  const id = await avatar('guest');
  const v = await as('service', (tx) => val(tx, 'select public.avatar_views_claim($1, 600)', ['w1']));
  assert.equal(v.id, id);
  assert.equal(await as('service', (tx) => val(tx, `select public.avatar_views_settle($1, 'ready', 'full', 'm', null, 'w1')`, [id])), true);
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_views_path($1, $2)', [id, 's'])), viewsPath(U.guest, id, 's'));
  assert.deepEqual(await modelOf(id), EMPTY);
  assert.equal((await claim('w1')).id, id, '묶음이 다 됐어도 모형은 따로 잡힌다');
});

// ───────────────────────────── 일꾼 어댑터: 부르는 이름과 인자가 이 마이그레이션과 맞는가
// 일꾼은 DB 함수를 인자 이름으로 부른다. 이름이 하나라도 다르면 운영에서 함수를 찾지 못한다(가짜 DB로 도는 일꾼 시험은 모른다).
const MANY = new Set(['avatar_views_strays', 'avatar_model_strays']);
const viaDb = {
  async rpc(fn, args = {}) {
    const keys = Object.keys(args);
    const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
    try {
      const rows = await as('service', async (tx) => (await tx.query(`select v from ${call} as v`, keys.map((k) => args[k]))).rows);
      return { data: MANY.has(fn) ? rows.map((r) => r.v) : rows[0]?.v ?? null, error: null };
    } catch (e) {
      // PostgREST처럼 오류 부호를 함께 준다(함수가 없으면 42883)
      return { data: null, error: { message: String(e.message), code: e.code } };
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

test('일꾼 어댑터가 부르는 이름과 인자 그대로: 잡기 → 돌려놓기 → 정리 → 지운 그림의 남은 파일 치우기', async () => {
  await clean();
  const worker = wrapSupabase(viaDb);
  const w = worker.db;
  const id = await avatar('guest');
  const image_path = `${U.guest}/chars/${id}.png`;
  // 이 판의 일꾼은 제공자를 넘긴다(0021의 잡기). 그 함수가 없는 DB(0016)에서는 제공자 없이 0016의 잡기를 다시 부른다
  assert.deepEqual(await w.modelClaim('w1', 600, 'trellis'), { id, user_id: U.guest, image_path, attempts: 1, bad_fails: 0 });
  assert.equal(await w.modelClaim('w1', 600, 'meshy'), null);
  assert.equal(await w.modelClaim('w1', 600), null);
  assert.equal(await w.modelRelease(id, 'w2', 0), false);
  assert.equal(await w.modelRelease(id, 'w1', 0), true);
  assert.equal((await w.modelClaim('w1', 600)).bad_fails, 0);
  assert.equal(await w.modelRelease(id, 'w1', 0, true), true);
  assert.deepEqual(await w.modelClaim('w2', 600), { id, user_id: U.guest, image_path, attempts: 3, bad_fails: 1 });
  await put(glb('guest', id)); // 일꾼이 모형을 올렸다
  assert.equal(await w.modelSettle(id, 'ready', { maker: MAKER, worker: 'w2' }), true);
  assert.deepEqual(await modelOf(id), { ...EMPTY, status: 'ready', attempts: 3, bad: 1, worker: 'w2', maker: MAKER });
  assert.deepEqual(await w.modelStrays(), []);
  assert.equal(await sweepModelStrays(worker), 0);
  const other = await avatar('guest2');
  assert.equal((await w.modelClaim('w1', 600)).id, other);
  assert.equal(await w.modelSettle(other, 'failed', { reason: 'bad_output', worker: 'w1' }), true);
  assert.deepEqual(await modelOf(other), { ...EMPTY, status: 'failed', attempts: 1, worker: 'w1', reason: 'bad_output' });
  // 본인이 그림을 지웠는데 모형 파일이 남았다(일꾼이 거두기 전에 멈춘 경우): 찾아서 치운다
  assert.equal(await forget('guest', id, 'character'), true);
  assert.equal(await w.modelSettle(id, 'ready', { maker: MAKER }), false);
  assert.deepEqual(await w.modelStrays(), [glb('guest', id)]);
  assert.equal(await sweepModelStrays(worker), 1);
  assert.deepEqual(await w.modelStrays(), []);
  assert.equal((await db.query(`select count(*)::int as n from storage.objects where bucket_id = 'avatars'`)).rows[0].n, 0);
});

test('일꾼 어댑터: 함수가 없는 DB(0016을 올리기 전)에서는 모형 일을 오류로 알린다. 묶음 함수는 그대로 돈다', async () => {
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
        return { data: null, error: { message: String(e.message), code: e.code } };
      }
    },
  };
  const w = wrapSupabase(viaOld).db;
  assert.equal(await w.viewsClaim('w1', 1200), null);
  await assert.rejects(w.modelClaim('w1', 600), (e) => e.code === 'db_error' && /avatar_model_claim/.test(e.message));
  // 제공자를 넘겨도 두 모양 모두 없으면 오류(옛 잡기로 한 번 더 부른 뒤)
  await assert.rejects(w.modelClaim('w1', 600, 'meshy'), (e) => e.code === 'db_error' && e.missing === true && /avatar_model_claim/.test(e.message));
  await old.close();
});

// ───────────────────────────── 0003 시험을 0016까지 올린 DB에서 그대로 한 번 더
// avatars.test.mjs는 0001 + 0003만 올려 돈다. 여기서는 그 파일이 0003을 읽을 때 0006·0015·0016을 뒤에 붙여 주어,
// 다시 정의한 avatar_forget과 새 칸·제약 아래에서도 캐릭터 만들기·고르기·지우기·대기열이 그대로인지 같은 시험으로 본다.
let patched = 0;
const plainRead = fs.readFileSync;
fs.readFileSync = function readWithModels(file, ...rest) {
  const text = plainRead.call(fs, file, ...rest);
  if (!String(file).endsWith('/0003_avatars.sql') || typeof text !== 'string') return text;
  patched += 1;
  // 운영에 올리는 순서 그대로 0003 → 0006 → 0015 → 0016
  return `${text}\n${read('0006_profile_look.sql')}\n${read('0015_avatar_views.sql')}\n${MODELS}`;
};
syncBuiltinESMExports();
await import('./avatars.test.mjs');

test('위의 0003 시험은 0016을 붙인 DB에서 돌았다', () => {
  assert.equal(patched, 1);
});
