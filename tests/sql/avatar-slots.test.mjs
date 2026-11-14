// 0019_avatar_slots.sql을 그 앞의 마이그레이션 위에 올려(PGlite) 사진 캐릭터 칸 세 개를 확인한다:
// 넷째는 slots_full로 거절, 하루 규칙(3장, 시도 8번, 모두의 상한)이 먼저, 비운 칸에 새것이 들어감, 거절·실패·지운 줄은
// 칸을 차지하지 않음, 이미 있는 줄에 번호 달기, 장수에 kept·slots, 권한.
// 맨 끝에서는 0003 시험(avatars.test.mjs)을 0019까지 올린 DB에서 그대로 한 번 더 돌린다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const BEFORE = ['0001_init.sql', '0002_rooms_play.sql', '0003_avatars.sql', '0004_shots.sql', '0006_profile_look.sql',
  '0008_rooms_more.sql', '0010_qr_quiet.sql', '0012_note_photos.sql', '0014_guards.sql', '0015_avatar_views.sql'].map(read);
const SLOTS = read('0019_avatar_slots.sql');
const LOOK = read('0006_profile_look.sql');
const VIEWS = read('0015_avatar_views.sql');

// Supabase의 auth·storage 스키마는 흉내만 낸다
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
  guest4: '00000000-0000-4000-8000-000000000004',
  visitor: '00000000-0000-4000-8000-000000000009',
};
const EMAIL = Object.fromEntries(Object.keys(U).map((k) => [k, `${k}@example.test`]));
const GUESTS = ['guest', 'guest2', 'guest3', 'guest4'];

/** 마이그레이션을 올리고 손님 명단까지 넣은 새 DB. withSlots가 거짓이면 0019를 올리지 않는다(번호 달기 시험) */
async function makeDb(withSlots = true) {
  const d = new PGlite();
  await d.exec(STUB);
  for (const m of BEFORE) await d.exec(m);
  if (withSlots) {
    await d.exec(SLOTS);
    await d.exec(SLOTS); // 두 번 올려도 괜찮다
  }
  for (const [k, id] of Object.entries(U)) await d.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await d.exec(`insert into public.roster (display_name, role, email) values
    ${GUESTS.map((g, i) => `('손님${i + 1}', 'guest', '${EMAIL[g]}')`).join(', ')};`);
  for (const w of Object.keys(U)) await asOn(d, w, (tx) => tx.query('select public.sync_my_roster()'));
  return d;
}

async function asOn(d, who, fn) {
  return d.transaction(async (tx) => {
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

let db;
const as = (who, fn) => asOn(db, who, fn);
async function fails(who, sql, p, re) {
  await assert.rejects(as(who, (tx) => tx.query(sql, p)), (e) => { assert.match(String(e.message), re); return true; });
}
const begin = (who, cap = 150) => as(who, (tx) => val(tx, 'select public.avatar_begin(true, $1)', [cap]));
const quota = (who) => as(who, (tx) => val(tx, 'select public.avatar_quota()'));
const settle = (id, status, reason = null) =>
  as('service', (tx) => val(tx, 'select public.avatar_settle($1, $2, null, null, null, $3)', [id, status, reason]));
const ready = (who, id) => as('service', (tx) => val(tx, `select public.avatar_settle($1, 'ready', $2, $3, 'm')`,
  [id, `${U[who]}/originals/${id}.jpg`, `${U[who]}/chars/${id}.png`]));
const forget = (who, id, part = 'character') => as(who, (tx) => val(tx, 'select public.avatar_forget($1, $2)', [id, part]));
/** 내 보관 중 줄의 [번호, 상태] (본인 세션으로 읽는다: 칸 화면이 읽는 그대로) */
const slotsOf = async (who) => (await as(who, (tx) => tx.query(
  `select slot, status from public.avatars where status in ('pending', 'queued', 'drawing', 'ready') order by slot nulls last, created_at`,
))).rows.map((r) => [r.slot, r.status]);
/** 어제(KST) 만든 ready 그림 한 줄을 바로 넣는다(오늘 장수에 세지 않는 보관 중 캐릭터) */
async function yesterday(d, who) {
  const id = crypto.randomUUID();
  await d.query(`insert into public.avatars (id, user_id, status, image_path, original_path, consent_at, created_at)
    values ($1::uuid, $2::uuid, 'ready', $2::text || '/chars/' || $1::text || '.png', $2::text || '/originals/' || $1::text || '.jpg',
            now(), public.avatar_day_start() - interval '2 hours')`, [id, U[who]]);
  return id;
}
const wipe = (who) => db.query('delete from public.avatars where user_id = $1', [U[who]]);

before(async () => {
  db = await makeDb();
});

test('장수에 보관 중 수(kept)와 칸 수(slots)가 더해지고, 하루 규칙 값은 그대로다', async () => {
  const q = await quota('guest');
  assert.deepEqual(
    [q.used, q.attempts, q.kept, q.per_user, q.attempts_max, q.slots],
    [0, 0, 0, 3, 8, 3],
  );
  assert.equal(typeof q.total, 'number');
});

test('칸은 세 개: 어제 만든 둘 + 오늘 하나로 차면 넷째는 slots_full, 하나 비우면 그 칸에 새것이 들어간다', async () => {
  await wipe('guest');
  const a = await yesterday(db, 'guest');
  const b = await yesterday(db, 'guest');
  assert.deepEqual(await slotsOf('guest'), [[1, 'ready'], [2, 'ready']], '넣을 때 비어 있는 가장 작은 번호');
  const c = await begin('guest');
  assert.deepEqual([c.ok, c.slot], [true, 3], JSON.stringify(c));
  const full = await begin('guest');
  assert.deepEqual(full, { ok: false, reason: 'slots_full' });
  const q = await quota('guest');
  assert.deepEqual([q.used, q.kept], [1, 3], '거절된 시작은 줄을 만들지 않는다');
  // 첫 칸을 비운다(그림 지우기): 지운 줄은 칸을 차지하지 않는다
  assert.equal(await forget('guest', a), true);
  assert.equal((await quota('guest')).kept, 2);
  const d = await begin('guest');
  assert.deepEqual([d.ok, d.slot], [true, 1], '비운 칸(1)에 새것이 들어간다');
  assert.deepEqual(await slotsOf('guest'), [[1, 'pending'], [2, 'ready'], [3, 'pending']]);
  // 지운 줄은 번호를 그대로 기록으로 남긴다(보관 중이 아니라 겹쳐도 된다)
  const gone = (await db.query('select status, slot from public.avatars where id = $1', [a])).rows[0];
  assert.deepEqual([gone.status, gone.slot], ['deleted', 1]);
  assert.equal(b.length, 36);
});

test('하루 장수가 다 찼으면 칸보다 하루 안내가 먼저 나온다(비워도 오늘은 못 만든다)', async () => {
  await wipe('guest2');
  for (let k = 0; k < 3; k++) assert.equal((await begin('guest2')).ok, true);
  assert.equal((await begin('guest2')).reason, 'user_limit');
  // 시도 8번도 칸보다 먼저
  await wipe('guest2');
  const ids = [];
  for (let k = 0; k < 3; k++) ids.push((await begin('guest2')).id);
  await db.query(`update public.avatars set created_at = public.avatar_day_start() - interval '1 hour' where user_id = $1`, [U.guest2]);
  for (let k = 0; k < 8; k++) {
    await db.query(`insert into public.avatars (user_id, status, consent_at, reason) values ($1, 'rejected', now(), 'child')`, [U.guest2]);
  }
  const q = await quota('guest2');
  assert.deepEqual([q.used, q.attempts, q.kept], [0, 8, 3]);
  assert.equal((await begin('guest2')).reason, 'attempt_limit');
  // 모두의 상한도 칸보다 먼저
  await db.query(`delete from public.avatars where user_id = $1 and status = 'rejected'`, [U.guest2]);
  assert.equal((await begin('guest2', 0)).reason, 'total_limit');
  assert.equal((await begin('guest2')).reason, 'slots_full');
  assert.equal(ids.length, 3);
});

test('거절·실패·지운 줄은 칸을 차지하지 않고, 그 번호는 다음 것이 쓴다', async () => {
  await wipe('guest3');
  const a = await begin('guest3');
  const b = await begin('guest3');
  assert.deepEqual([a.slot, b.slot], [1, 2]);
  assert.equal(await settle(a.id, 'rejected', 'child'), true);
  const c = await begin('guest3');
  assert.equal(c.slot, 1, '거절된 칸(1)이 비었다');
  assert.equal(await settle(b.id, 'failed', 'timeout'), true);
  assert.equal(await ready('guest3', c.id), true);
  const d = await begin('guest3');
  assert.equal(d.slot, 2, '실패한 칸(2)이 비었다');
  // 그리는 중에 지우면(작업 거두기) 그 칸도 빈다
  assert.equal(await forget('guest3', d.id), true);
  assert.equal((await quota('guest3')).kept, 1);
  assert.deepEqual(await slotsOf('guest3'), [[1, 'ready']]);
});

test('원본 사진만 지우면 캐릭터는 그대로 칸을 차지한다', async () => {
  await wipe('guest4');
  const a = await begin('guest4');
  assert.equal(await ready('guest4', a.id), true);
  assert.equal(await forget('guest4', a.id, 'original'), true);
  assert.equal((await quota('guest4')).kept, 1);
  assert.deepEqual(await slotsOf('guest4'), [[a.slot, 'ready']]);
});

test('명단 밖은 시작하지 못하고, 칸 번호를 직접 고치거나 트리거 함수를 부르지 못한다', async () => {
  assert.equal((await begin('visitor')).reason, 'not_guest');
  await fails('anon', 'select public.avatar_begin(true, 150)', [], /permission denied/);
  await fails('anon', 'select public.avatar_quota()', [], /permission denied/);
  await fails('guest', 'update public.avatars set slot = 3', [], /permission denied/);
  await fails('guest', `insert into public.avatars (status, consent_at, slot) values ('ready', now(), 1)`, [], /permission denied/);
  const p = (await db.query(`select
    has_function_privilege('authenticated', 'public.avatar_begin(boolean, int)', 'execute') as begin_auth,
    has_function_privilege('authenticated', 'public.avatar_quota()', 'execute') as quota_auth,
    has_function_privilege('anon', 'public.avatar_begin(boolean, int)', 'execute') as begin_anon,
    has_function_privilege('authenticated', 'public.avatars_slot_assign()', 'execute') as trigger_auth`)).rows[0];
  assert.deepEqual(p, { begin_auth: true, quota_auth: true, begin_anon: false, trigger_auth: false });
});

test('번호는 1~3만, 보관 중끼리는 한 사람 안에서 겹치지 않는다', async () => {
  await wipe('guest4');
  const a = await begin('guest4');
  await assert.rejects(db.query('update public.avatars set slot = 4 where id = $1', [a.id]), /avatars_slot_range/);
  const b = await begin('guest4');
  await assert.rejects(db.query('update public.avatars set slot = $2 where id = $1', [b.id, a.slot]), /avatars_user_slot/);
  // 다른 사람과는 같은 번호를 써도 된다
  await wipe('guest3');
  assert.equal((await begin('guest3')).slot, 1);
});

test('이미 있는 줄에 번호 달기: 만든 차례대로, 넷째부터는 비워 두고, 다시 올리면 빈 칸을 채운다', async () => {
  const d = await makeDb(false);
  const one = await yesterday(d, 'guest');
  const many = [];
  for (let k = 0; k < 5; k++) {
    many.push(await yesterday(d, 'guest2'));
    // 만든 차례가 분명하게(같은 때로 들어가지 않게)
    await d.query(`update public.avatars set created_at = created_at + make_interval(secs => $2::int) where id = $1`, [many[k], k]);
  }
  // 지운 줄과 실패한 줄은 번호를 받지 않는다
  await d.query(`insert into public.avatars (user_id, status, consent_at, deleted_at) values ($1, 'deleted', now(), now())`, [U.guest]);
  await d.query(`insert into public.avatars (user_id, status, consent_at, reason) values ($1, 'failed', now(), 'timeout')`, [U.guest]);
  await d.exec(SLOTS);
  const slot = async (id) => (await d.query('select slot from public.avatars where id = $1', [id])).rows[0].slot;
  assert.equal(await slot(one), 1);
  assert.deepEqual(await Promise.all(many.map(slot)), [1, 2, 3, null, null]);
  const others = (await d.query(`select count(*)::int as n from public.avatars where user_id = $1 and slot is not null`, [U.guest])).rows[0].n;
  assert.equal(others, 1, '지운 줄·실패한 줄에는 번호가 없다');
  // 넷 이상 모아 둔 사람은 보관 중이 셋보다 적어질 때까지 새로 만들지 못한다
  const q = await asOn(d, 'guest2', (tx) => val(tx, 'select public.avatar_quota()'));
  assert.equal(q.kept, 5);
  assert.equal((await asOn(d, 'guest2', (tx) => val(tx, 'select public.avatar_begin(true, 150)'))).reason, 'slots_full');
  // 번호 있는 칸 하나를 지우고 다시 올리면, 번호 없던 줄 가운데 먼저 만든 것이 그 칸을 받는다
  await asOn(d, 'guest2', (tx) => tx.query(`select public.avatar_forget($1, 'character')`, [many[1]]));
  await d.exec(SLOTS);
  assert.deepEqual(await Promise.all(many.map(slot)), [1, 2, 3, 2, null]);
  await d.close();
});

test('장수 숫자는 0003과 같다(하루 3장, 시도 8번, 모두의 상한 150), 칸은 3', () => {
  assert.match(SLOTS, /'per_user', 3/);
  assert.match(SLOTS, /'attempts_max', 8/);
  assert.match(SLOTS, /'slots', 3/);
  assert.match(SLOTS, /\(v_q ->> 'used'\)::int >= 3/);
  assert.match(SLOTS, /\(v_q ->> 'attempts'\)::int >= 8/);
  assert.match(SLOTS, /\(v_q ->> 'kept'\)::int >= 3/);
  assert.match(SLOTS, /p_total_cap int default 150/);
  assert.match(SLOTS, /slot between 1 and 3/);
  assert.match(SLOTS, /generate_series\(1, 3\)/);
});

// ───────────────────────────── 0003 시험을 0019까지 올린 DB에서 그대로 한 번 더
// avatars.test.mjs는 0001 + 0003만 올려 돈다. 그 파일이 0003을 읽을 때 0006·0015·0019를 뒤에 붙여 주어,
// 다시 정의한 avatar_begin·avatar_quota와 칸 번호 아래에서도 만들기·고르기·지우기·대기열이 그대로인지 같은 시험으로 본다.
let patched = 0;
const plainRead = fs.readFileSync;
fs.readFileSync = function readWithSlots(file, ...rest) {
  const text = plainRead.call(fs, file, ...rest);
  if (!String(file).endsWith('/0003_avatars.sql') || typeof text !== 'string') return text;
  patched += 1;
  return `${text}\n${LOOK}\n${VIEWS}\n${SLOTS}`;
};
syncBuiltinESMExports();
await import('./avatars.test.mjs');

test('위의 0003 시험은 0019를 붙인 DB에서 돌았다', () => {
  assert.equal(patched, 1);
});
