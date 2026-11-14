// 0014_guards.sql을 그 앞의 마이그레이션 전부 위에 올려(PGlite) 지킴 네 가지를 검사한다:
// 쪽지 한도, 걷기 사진 저장소 상한, 겉모습의 사진 캐릭터 주인 확인, my_roster() 실행권.
// 같은 일을 0014가 없는 DB(old)와 있는 DB(db)에서 해 본다: old에서는 구멍이 그대로 열려 있고(0014 없이는 이 시험이
// 실패한다는 뜻), db에서는 막히며, 원래 되던 길은 db에서도 그대로 된다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const BEFORE = ['0001_init.sql', '0002_rooms_play.sql', '0003_avatars.sql', '0004_shots.sql', '0006_profile_look.sql',
  '0008_rooms_more.sql', '0010_qr_quiet.sql', '0012_note_photos.sql'].map(read);
const GUARDS = read('0014_guards.sql');

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
  admin: '00000000-0000-4000-8000-00000000000a',
  family: '00000000-0000-4000-8000-00000000000f',
  guest: '00000000-0000-4000-8000-000000000001',
  guest2: '00000000-0000-4000-8000-000000000002',
  guest3: '00000000-0000-4000-8000-000000000003',
  guest4: '00000000-0000-4000-8000-000000000004',
  guest5: '00000000-0000-4000-8000-000000000005',
  guest6: '00000000-0000-4000-8000-000000000006',
  visitor: '00000000-0000-4000-8000-000000000009',
};
const EMAIL = Object.fromEntries(Object.keys(U).map((k) => [k, `${k}@example.test`]));
const DAY_START = `((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')`;
const DOLL = { kind: 'doll', doll: { hair: 'bob', hairColor: '#a8743f', skin: '#c99470', top: '#6b8fb5', bottom: '#ece4d6', acc: 'glasses' } };
const photo = (id) => ({ kind: 'photo', url: `/api/avatar/${id}` });

/** old: 0014를 올리기 전의 DB, db: 올린 뒤의 DB */
let old;
let db;

async function as(d, who, fn) {
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
const one = async (tx, sql, p = []) => (await tx.query(sql, p)).rows[0];
const val = async (tx, sql, p = []) => Object.values((await one(tx, sql, p)) ?? {})[0];
async function fails(d, who, sql, p, re) {
  await assert.rejects(as(d, who, (tx) => tx.query(sql, p)), (e) => { assert.match(String(e.message), re); return true; });
}
/** 운영자 권한으로, 트리거를 끄고(시험 준비용: 때를 옮긴 줄을 바로 넣는다) */
const raw = (d, sql, p = []) => d.transaction(async (tx) => {
  await tx.query('set local session_replication_role = replica');
  return tx.query(sql, p);
});

async function fresh(withGuards) {
  const d = new PGlite();
  await d.exec(STUB);
  for (const m of BEFORE) await d.exec(m);
  if (withGuards) {
    await d.exec(GUARDS);
    await d.exec(GUARDS); // 두 번 올려도 괜찮다
  }
  for (const [k, id] of Object.entries(U)) await d.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await d.exec(`insert into public.roster (display_name, role, email, note, slot) values
    ('집주인', 'admin', '${EMAIL.admin}', null, null), ('가족', 'family', '${EMAIL.family}', null, 'family'),
    ('손님하나', 'guest', '${EMAIL.guest}', '집주인만 보는 메모', '16'), ('손님둘', 'guest', '${EMAIL.guest2}', null, null),
    ('손님셋', 'guest', '${EMAIL.guest3}', null, null), ('손님넷', 'guest', '${EMAIL.guest4}', null, null),
    ('손님다섯', 'guest', '${EMAIL.guest5}', null, null), ('손님여섯', 'guest', '${EMAIL.guest6}', null, null);`);
  for (const w of Object.keys(U)) await as(d, w, (tx) => tx.query('select public.sync_my_roster()'));
  return d;
}

before(async () => {
  old = await fresh(false);
  db = await fresh(true);
});

// ───────────────────────────── 준비·숫자
test('한도 숫자는 guard_limits() 한곳에 있고, 새 함수의 실행권은 필요한 만큼만', async () => {
  assert.deepEqual((await db.query('select public.guard_limits() as v')).rows[0].v,
    { note_window_minutes: 10, note_window_max: 10, note_day_max: 60, shots_storage_max: 70 });
  const priv = (await db.query(`select
    has_function_privilege('anon', 'public.guard_limits()', 'execute') as anon_limits,
    has_function_privilege('anon', 'public.shots_storage_room()', 'execute') as anon_room,
    has_function_privilege('authenticated', 'public.shots_storage_room()', 'execute') as auth_room,
    has_function_privilege('authenticated', 'public.records_limit_insert()', 'execute') as auth_trigger,
    has_function_privilege('authenticated', 'public.profiles_guard_avatar()', 'execute') as auth_guard,
    has_function_privilege('anon', 'public.record_room()', 'execute') as anon_note_room,
    has_function_privilege('authenticated', 'public.record_room()', 'execute') as auth_note_room,
    has_function_privilege('authenticated', 'public.records_tally_delete()', 'execute') as auth_tally,
    has_function_privilege('authenticated', 'public.shots_storage_guard()', 'execute') as auth_storage_guard,
    has_table_privilege('authenticated', 'public.record_tally', 'select') as auth_tally_read`)).rows[0];
  assert.deepEqual(priv, { anon_limits: false, anon_room: false, auth_room: true, auth_trigger: false, auth_guard: false,
    anon_note_room: false, auth_note_room: true, auth_tally: false, auth_storage_guard: false, auth_tally_read: false });
});

test('앞의 마이그레이션이 빠진 DB에는 올라가지 않고, 아무것도 바꾸지 않는다', async () => {
  const d = new PGlite();
  await d.exec(STUB);
  await d.exec(BEFORE[0]);
  await assert.rejects(d.exec(GUARDS), /0014_needs_0001_0003_0004_0006/);
  const r = (await d.query(`select to_regprocedure('public.guard_limits()') is null as no_limits,
    has_function_privilege('authenticated', 'public.my_roster()', 'execute') as roster_open,
    (select count(*)::int from pg_trigger where tgname = 'records_limit_insert') as triggers`)).rows[0];
  assert.deepEqual(r, { no_limits: true, roster_open: true, triggers: 0 });
  await d.close();
});

test('저장소 표의 줄이 가려지는 역할로는 올라가지 않는다(저장소 상한이 조용히 안 걸리는 일을 막는다)', async () => {
  const d = new PGlite();
  await d.exec(STUB);
  for (const m of BEFORE) await d.exec(m);
  await d.exec('create role plain nologin; grant usage on schema public, storage, auth to plain; grant select on public.profiles to plain;');
  await assert.rejects(d.transaction(async (tx) => {
    await tx.query('set local role plain');
    await tx.exec(GUARDS);
  }), /0014_needs_role_that_reads_all_storage_rows/);
  assert.equal((await d.query(`select to_regprocedure('public.guard_limits()') is null as v`)).rows[0].v, true);
  await d.close();
});

// ───────────────────────────── 1. 쪽지 한도
const NOTE = `insert into public.records (room_slug, body) values ('porch', $1) returning id, author_name, status`;

test('쪽지: 0014 전에는 한 사람이 연달아 얼마든지 넣는다(구멍)', async () => {
  for (let i = 0; i < 25; i += 1) await as(old, 'guest', (tx) => tx.query(NOTE, [`쪽지 ${i}`]));
  assert.equal(Number((await old.query('select count(*) as n from public.records where author_id = $1', [U.guest])).rows[0].n), 25);
});

test('쪽지: 10분에 10장까지. 11번째는 too_many, 10분이 지나면 다시 된다. 다른 사람과는 따로 센다', async () => {
  for (let i = 0; i < 10; i += 1) {
    const r = await as(db, 'guest', (tx) => one(tx, NOTE, [`쪽지 ${i}`]));
    assert.deepEqual([r.author_name, r.status], ['손님하나', 'submitted'], '원래 되던 길 그대로(이름·상태는 DB가 정한다)');
  }
  await fails(db, 'guest', NOTE, ['열한 번째'], /too_many/);
  assert.equal(Number((await db.query('select count(*) as n from public.records where author_id = $1', [U.guest])).rows[0].n), 10);
  // 다른 손님은 그대로 넣는다
  await as(db, 'guest3', (tx) => tx.query(NOTE, ['다른 사람의 쪽지']));
  // 9분 전의 것은 아직 센다
  await db.query(`update public.records set created_at = created_at - interval '9 minutes' where author_id = $1`, [U.guest]);
  await fails(db, 'guest', NOTE, ['아직 일러요'], /too_many/);
  // 10분이 지나면 다시 된다(하루 한도 안에서)
  await db.query(`update public.records set created_at = created_at - interval '2 minutes' where author_id = $1`, [U.guest]);
  await as(db, 'guest', (tx) => tx.query(NOTE, ['쉬었다가 다시']));
});

test('쪽지: 한 번에 여러 장을 넣어도 한도를 넘지 못한다(통째로 거절)', async () => {
  const many = `insert into public.records (room_slug, body) select 'porch', '묶음 ' || g from generate_series(1, $1::int) g`;
  await fails(db, 'guest4', many, [11], /too_many/);
  assert.equal(Number((await db.query('select count(*) as n from public.records where author_id = $1', [U.guest4])).rows[0].n), 0);
  await as(db, 'guest4', (tx) => tx.query(many, [10]));
  await fails(db, 'guest4', NOTE, ['하나 더'], /too_many/);
});

test('쪽지: 하루(한국 시간) 60장까지. 61번째는 too_many_today, 날이 바뀌면 다시 된다', async () => {
  const seedAt = (at) => `insert into public.records (author_id, author_name, room_slug, body, created_at)
    select $1, '손님둘', 'porch', '오늘 ' || g, ${at} from generate_series(1, $2::int) g`;
  const seed = seedAt(DAY_START);
  // 어제 23:59:59(한국 시간)에 쓴 한 장은 오늘 몫이 아니다. 하루를 다른 시간대로 끊으면 어느 시각에 돌려도 여기서 걸린다
  await raw(db, seedAt(`${DAY_START} - interval '1 second'`), [U.guest2, 1]);
  // 오늘 0시에 쓴 59장: 아직 한 장 남았다
  await raw(db, seed, [U.guest2, 59]);
  // 0시 직후에 돌면 이 59장이 10분 창에도 들어간다. 그때는 창 한도가 먼저 걸린다(하루 한도는 아직 아니다)
  const inWindow = (await db.query(`select ${DAY_START} > now() - interval '10 minutes' as v`)).rows[0].v;
  if (!inWindow) {
    await as(db, 'guest2', (tx) => tx.query(NOTE, ['예순 번째']));
    await fails(db, 'guest2', NOTE, ['예순한 번째'], /too_many_today/);
  } else {
    await fails(db, 'guest2', NOTE, ['예순 번째'], /too_many(?!_today)/);
    await raw(db, seed, [U.guest2, 1]);
    await fails(db, 'guest2', NOTE, ['예순한 번째'], /too_many_today/);
  }
  // 0014 전에는 같은 처지에서도 들어간다(구멍)
  await raw(old, seed, [U.guest2, 60]);
  await as(old, 'guest2', (tx) => tx.query(NOTE, ['예순한 번째']));
  // 어제 것은 세지 않는다
  await db.query(`update public.records set created_at = now() - interval '2 days' where author_id = $1`, [U.guest2]);
  await as(db, 'guest2', (tx) => tx.query(NOTE, ['새 날의 첫 장']));
});

const tally = async (d, id) => Number((await d.query('select count(*) as n from public.record_tally where author_id = $1', [id])).rows[0].n);
const left = async (d, id) => Number((await d.query('select count(*) as n from public.records where author_id = $1', [id])).rows[0].n);

test('쪽지: 0014 전에는 넣고 거두기를 되풀이하면 쓰는 횟수에 끝이 없다(구멍)', async () => {
  for (let i = 0; i < 15; i += 1) {
    const id = (await as(old, 'guest3', (tx) => one(tx, NOTE, [`쪽지 ${i}`]))).id;
    assert.equal(await as(old, 'guest3', (tx) => val(tx, 'select public.withdraw_record($1)', [id])), true);
  }
  assert.equal(await left(old, U.guest3), 0);
});

test('쪽지: 거둔 쪽지도 쓴 것으로 센다. 넣고 거두기를 되풀이해도 한도를 넘지 못하고, 관리자는 한도가 없다', async () => {
  await raw(db, 'delete from public.records where author_id = $1', [U.guest3]);
  for (let i = 0; i < 10; i += 1) {
    const id = (await as(db, 'guest3', (tx) => one(tx, NOTE, [`쪽지 ${i}`]))).id;
    assert.equal(await as(db, 'guest3', (tx) => val(tx, 'select public.withdraw_record($1)', [id])), true);
  }
  assert.deepEqual([await left(db, U.guest3), await tally(db, U.guest3)], [0, 10]);
  await fails(db, 'guest3', NOTE, ['열한 번째'], /too_many/);
  // 지워진 쪽지의 흔적에는 누가·언제만 남는다(본문·방·이름 없음). 손님은 읽지 못한다
  const cols = (await db.query(`select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'record_tally' order by ordinal_position`)).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ['author_id', 'created_at']);
  await fails(db, 'guest3', 'select count(*) from public.record_tally', [], /permission denied/);
  // 10분이 지나면 다시 된다
  await db.query(`update public.record_tally set created_at = created_at - interval '11 minutes' where author_id = $1`, [U.guest3]);
  await as(db, 'guest3', (tx) => tx.query(NOTE, ['쉬었다가 다시']));
  for (let i = 0; i < 15; i += 1) await as(db, 'admin', (tx) => tx.query(NOTE, [`안내 ${i}`]));
});

test('쪽지: 철회 번호로(로그인 없이) 거둔 것도 쓴 사람의 몫으로 세고, 하루 한도에도 든다', async () => {
  const ids = [];
  for (let i = 0; i < 10; i += 1) ids.push((await as(db, 'guest5', (tx) => one(tx, NOTE, [`쪽지 ${i}`]))).id);
  assert.equal(await as(db, 'guest5', (tx) => val(tx, 'select public.attach_receipt($1, $2)', [ids[0], 'WXYZ-WXYZ-WXYZ'])), true);
  assert.equal(await as(db, 'anon', (tx) => val(tx, 'select public.withdraw_by_receipt($1)', ['WXYZ-WXYZ-WXYZ'])), true);
  assert.deepEqual([await left(db, U.guest5), await tally(db, U.guest5)], [9, 1]);
  await fails(db, 'guest5', NOTE, ['하나 거두고 하나 더'], /too_many/);
  // 하루 한도: 오늘 쓰고 거둔 60장이 있으면 남은 쪽지가 없어도 오늘은 끝
  await db.query(`insert into public.record_tally (author_id, created_at) select $1, ${DAY_START} from generate_series(1, 60)`, [U.guest6]);
  await fails(db, 'guest6', NOTE, ['오늘은 그만'], /too_many_today/);
  assert.equal(await as(db, 'guest6', (tx) => val(tx, 'select public.record_room()')), 'too_many_today');
});

test('쪽지: 지워진 쪽지의 흔적은 이틀까지만. 오래된 쪽지를 지울 때는 남기지 않고, 지난 흔적은 쪽지가 오갈 때 치운다', async () => {
  const n0 = Number((await db.query('select count(*) as n from public.record_tally')).rows[0].n);
  // 사흘 전에 쓴 쪽지를 지금 거둔다: 어느 한도에도 들지 않으므로 흔적을 남기지 않는다
  const id = (await raw(db, `insert into public.records (author_id, author_name, room_slug, body, created_at)
    values ($1, '가족', 'porch', '오래된 쪽지', now() - interval '3 days') returning id`, [U.family])).rows[0].id;
  assert.equal(await as(db, 'family', (tx) => val(tx, 'select public.withdraw_record($1)', [id])), true);
  assert.equal(await tally(db, U.family), 0);
  // 이틀이 지난 흔적은 다음에 쪽지를 넣거나 지울 때 사라진다
  await db.query(`insert into public.record_tally (author_id, created_at) values ($1, now() - interval '49 hours')`, [U.family]);
  const fresh = (await as(db, 'family', (tx) => one(tx, NOTE, ['새 쪽지']))).id;
  assert.equal(await tally(db, U.family), 0, '넣을 때 치운다');
  await db.query(`insert into public.record_tally (author_id, created_at) values ($1, now() - interval '49 hours')`, [U.family]);
  assert.equal(await as(db, 'family', (tx) => val(tx, 'select public.withdraw_record($1)', [fresh])), true);
  assert.equal(await tally(db, U.family), 1, '지울 때 치우고, 방금 거둔 것만 남는다');
  assert.equal(Number((await db.query('select count(*) as n from public.record_tally')).rows[0].n), n0 + 1);
  await raw(db, 'delete from public.record_tally where author_id = $1', [U.family]);
});

test('쪽지: record_room()은 넣기 전에 자리를 알려 준다(사이트가 사진을 올리기 전에 묻는다). 0014 전에는 없다', async () => {
  await assert.rejects(as(old, 'guest', (tx) => tx.query('select public.record_room()')), /record_room/);
  // guest4는 위에서 10장을 채웠고, guest5도 찼다. 구경꾼·관리자·새 손님은 자리가 있다
  assert.equal(await as(db, 'guest4', (tx) => val(tx, 'select public.record_room()')), 'too_many');
  assert.equal(await as(db, 'guest5', (tx) => val(tx, 'select public.record_room()')), 'too_many');
  for (const w of ['admin', 'visitor']) assert.equal(await as(db, w, (tx) => val(tx, 'select public.record_room()')), 'ok', w);
  await fails(db, 'anon', 'select public.record_room()', [], /permission denied for function record_room/);
  // 묻는 것만으로는 아무것도 바뀌지 않는다
  const n = await left(db, U.guest4);
  await as(db, 'guest4', (tx) => tx.query('select public.record_room()'));
  assert.equal(await left(db, U.guest4), n);
});

test('쪽지: 다시 해도 안 되는 까닭(쉬는 방·명단 밖)을 한도보다 먼저 알린다', async () => {
  // guest4는 위에서 10장을 채웠다
  await fails(db, 'guest4', `insert into public.records (room_slug, body) values ('attic', '닫힌 방')`, [], /room_closed/);
  await fails(db, 'guest4', NOTE, ['열린 방'], /too_many/);
  await fails(db, 'visitor', NOTE, ['명단 밖'], /row-level security|not_on_roster/);
  // 두 트리거가 이름 순서(확인 → 한도)로 걸려 있다
  const names = (await db.query(`select tgname from pg_trigger where tgrelid = 'public.records'::regclass
    and not tgisinternal and tgtype & 2 = 2 and tgtype & 4 = 4 order by tgname`)).rows.map((r) => r.tgname);
  assert.deepEqual(names, ['records_guard_insert', 'records_limit_insert']);
});

test('쪽지: 사진 쪽지·철회 번호·승인 같은 원래 길은 0014 뒤에도 그대로', async () => {
  const path = 'a'.repeat(32);
  await as(db, 'service', (tx) => tx.query('insert into public.media (path, owner) values ($1, $2)', [path, U.family]));
  const r = await as(db, 'family', (tx) => one(tx, `insert into public.records (room_slug, format, body, media_path, requested_visibility)
    values ('pine', 'photo', '사진 한 장', $1, 'guests') returning id, visibility, author_name`, [path]));
  assert.deepEqual([r.visibility, r.author_name], ['family', '가족']);
  assert.equal(await as(db, 'family', (tx) => val(tx, 'select public.attach_receipt($1, $2)', [r.id, 'ABCD-EFGH-JKLM'])), true);
  assert.equal(await as(db, 'admin', (tx) => val(tx, `select public.moderate_record($1, 'approve', 'family')`, [r.id])), 'ok');
  assert.equal(Number(await as(db, 'family', (tx) => val(tx, `select count(*) from public.room_records('pine', 50)`))), 1);
  assert.equal(await as(db, 'anon', (tx) => val(tx, 'select public.withdraw_by_receipt($1)', ['ABCD-EFGH-JKLM'])), true);
  const lit = await as(db, 'anon', (tx) => val(tx, 'select public.lantern()'));
  assert.ok(Number(lit.lit) > 0);
});

// ───────────────────────────── 2. 걷기 사진 저장소 상한
const OBJ = `insert into storage.objects (bucket_id, name) values ('shots', $1)`;
const objCount = async (d, id) => Number((await d.query(`select count(*) as n from storage.objects where bucket_id = 'shots' and name like $1`, [`${id}/%`])).rows[0].n);

test('걷기 사진 저장소: 0014 전에는 표 줄 없이 저장소에만 얼마든지 올린다(구멍)', async () => {
  await as(old, 'guest', async (tx) => {
    for (let i = 0; i < 80; i += 1) await tx.query(OBJ, [`${U.guest}/o${i}.jpg`]);
  });
  assert.equal(await objCount(old, U.guest), 80);
  assert.equal(Number((await old.query('select count(*) as n from public.shots')).rows[0].n), 0);
});

// 71번째는 넣기 트리거(shots_storage_full)가 먼저 막는다. 트리거가 없을 때는 정책(row-level security)이 막는다
const FULL = /shots_storage_full|row-level security/;

test('걷기 사진 저장소: 한 사람 70개까지. 71번째는 거절, 하나 지우면 다시 된다. 다른 사람과는 따로 센다', async () => {
  for (let i = 0; i < 70; i += 1) await as(db, 'guest', (tx) => tx.query(OBJ, [`${U.guest}/o${i}.jpg`]));
  await fails(db, 'guest', OBJ, [`${U.guest}/over.jpg`], FULL);
  assert.equal(await objCount(db, U.guest), 70);
  // 올리기 전 확인(정책)도 같은 답을 한다
  assert.equal(await as(db, 'guest', (tx) => val(tx, 'select public.shots_storage_room()')), false);
  assert.match((await db.query(`select with_check from pg_policies where policyname = 'shots_storage_own_insert'`)).rows[0].with_check, /shots_storage_room/);
  // 다른 사람은 자기 몫이 그대로 있다
  await as(db, 'guest2', (tx) => tx.query(OBJ, [`${U.guest2}/one.jpg`]));
  // 하나 지우면 다시 올릴 수 있다
  await as(db, 'guest', (tx) => tx.query(`delete from storage.objects where bucket_id = 'shots' and name = $1`, [`${U.guest}/o0.jpg`]));
  await as(db, 'guest', (tx) => tx.query(OBJ, [`${U.guest}/again.jpg`]));
  await fails(db, 'guest', OBJ, [`${U.guest}/over2.jpg`], FULL);
});

test('걷기 사진 저장소: 서비스 권한으로 적는 줄도 센다(미리 받아 둔 서명 올리기 주소로는 상한을 못 넘는다)', async () => {
  // 저장소는 올리기 전에 올리는 사람의 권한으로 「넣어 보고 되돌려」 확인만 하고, 실제 줄은 서비스 권한으로 적는다.
  // 파일이 하나도 없을 때 확인을 얼마든지 받아 둘 수 있다(서명 올리기 주소를 미리 여러 장 받는 것과 같다)
  let passed = 0;
  for (let i = 0; i < 80; i += 1) {
    await as(db, 'guest5', async (tx) => {
      await tx.query(OBJ, [`${U.guest5}/p${i}.jpg`]);
      throw new Error('확인만 하고 되돌린다');
    }).catch((e) => { if (/되돌린다/.test(String(e.message))) passed += 1; });
  }
  assert.deepEqual([passed, await objCount(db, U.guest5)], [80, 0]);
  // 그 뒤 서비스 권한의 넣기: 70개까지만 들어가고 71번째부터는 거절된다
  const svc = `insert into storage.objects (bucket_id, name, owner) values ('shots', $1, $2)`;
  for (let i = 0; i < 70; i += 1) await as(db, 'service', (tx) => tx.query(svc, [`${U.guest5}/s${i}.jpg`, U.guest5]));
  await fails(db, 'service', svc, [`${U.guest5}/s70.jpg`, U.guest5], /shots_storage_full/);
  await assert.rejects(as(db, 'service', (tx) => tx.query(
    `insert into storage.objects (bucket_id, name) select 'shots', $1 || '/m' || g || '.jpg' from generate_series(1, 5) g`, [U.guest5])), /shots_storage_full/);
  assert.equal(await objCount(db, U.guest5), 70);
  // 같은 이름을 덮어쓰는 것은 장수가 늘지 않으므로 된다
  await as(db, 'service', (tx) => tx.query(`${svc} on conflict (bucket_id, name) do update set owner = excluded.owner`, [`${U.guest5}/s0.jpg`, U.guest5]));
  // 다른 버킷, 다른 사람 폴더, 폴더 없는 이름은 이 상한과 상관없다
  await as(db, 'service', (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('notes', $1)`, [`${U.guest5}/n.jpg`]));
  await as(db, 'service', (tx) => tx.query(svc, [`${U.guest6}/s0.jpg`, U.guest6]));
  await as(db, 'service', (tx) => tx.query(svc, ['loose.jpg', null]));
  // 이름이 폴더 이름으로 시작만 하는 다른 폴더는 세지 않는다
  await as(db, 'service', (tx) => tx.query(svc, [`${U.guest5}x/s0.jpg`, null]));
  await fails(db, 'service', svc, [`${U.guest5}/s71.jpg`, U.guest5], /shots_storage_full/);
  // 하나 지우면 다시 된다
  await as(db, 'service', (tx) => tx.query(`delete from storage.objects where bucket_id = 'shots' and name = $1`, [`${U.guest5}/s1.jpg`]));
  await as(db, 'service', (tx) => tx.query(svc, [`${U.guest5}/s72.jpg`, U.guest5]));
  // 0014 전에는 서비스 권한의 넣기에 상한이 없다(구멍)
  await as(old, 'service', async (tx) => {
    for (let i = 0; i < 75; i += 1) await tx.query(svc, [`${U.guest5}/s${i}.jpg`, U.guest5]);
  });
  assert.equal(await objCount(old, U.guest5), 75);
});

test('걷기 사진 저장소: 다른 버킷의 내 파일은 세지 않고, 0004의 규칙(내 폴더만, anon 불가, 표 60장)은 그대로', async () => {
  // 캐릭터 버킷에 내 파일이 많아도 걷기 사진 몫에는 들지 않는다
  await db.query(`insert into storage.objects (bucket_id, name) select 'avatars', $1 || '/chars/' || g || '.png' from generate_series(1, 90) g`, [U.guest3]);
  await as(db, 'guest3', (tx) => tx.query(OBJ, [`${U.guest3}/one.jpg`]));
  await fails(db, 'guest3', OBJ, [`${U.guest2}/bad.jpg`], /row-level security/);
  await fails(db, 'guest3', OBJ, ['loose.jpg'], /row-level security/);
  await fails(db, 'anon', OBJ, [`${U.guest3}/anon.jpg`], /row-level security/);
  await fails(db, 'guest3', `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${U.guest3}/chars/x.png`], /row-level security/);
  assert.equal(await as(db, 'anon', (tx) => val(tx, 'select public.shots_storage_room()')).catch(() => 'denied'), 'denied');
  // 표의 60장 상한과 본인 읽기·지우기
  await as(db, 'guest3', async (tx) => {
    for (let i = 0; i < 60; i += 1) await tx.query(`insert into public.shots (path, w, h) values ($1, 100, 100)`, [`${U.guest3}/n${i}.jpg`]);
  });
  await fails(db, 'guest3', `insert into public.shots (path, w, h) values ($1, 100, 100)`, [`${U.guest3}/over.jpg`], /shots_full/);
  assert.equal(Number(await as(db, 'guest3', (tx) => val(tx, `select count(*) from storage.objects where bucket_id = 'shots'`))), 1);
  await as(db, 'guest3', (tx) => tx.query(`delete from storage.objects where bucket_id = 'shots'`));
  assert.equal(await objCount(db, U.guest3), 0);
  // 누가 올릴 수 있는지는 바꾸지 않았다: 명단 밖 로그인 구경꾼도 0004처럼 자기 폴더에 올린다(좁힐지는 집주인 결정)
  await as(db, 'visitor', (tx) => tx.query(OBJ, [`${U.visitor}/one.jpg`]));
});

// ───────────────────────────── 3. 겉모습의 사진 캐릭터 주인 확인
const UPSERT_LOOK = `insert into public.profiles (user_id, look, updated_at) values ($1, $2::jsonb, now())
  on conflict (user_id) do update set look = excluded.look, updated_at = excluded.updated_at`;
const lookOf = async (d, id) => (await d.query('select look from public.profiles where user_id = $1', [id])).rows[0]?.look;
const AV = { mine: 'aaaaaaaa-0000-4000-8000-000000000001', theirs: 'bbbbbbbb-0000-4000-8000-000000000002',
  gone: 'cccccccc-0000-4000-8000-000000000003', waiting: 'dddddddd-0000-4000-8000-000000000004' };
async function seedAvatars(d) {
  const row = (id, owner, status) => d.query(
    `insert into public.avatars (id, user_id, status, image_path, original_path, consent_at) values ($1::uuid, $2::uuid, $3,
       case when $3 = 'ready' then $2::text || '/chars/' || $1::text || '.png' end,
       case when $3 = 'queued' then $2::text || '/originals/' || $1::text || '.jpg' end, now())`, [id, owner, status]);
  await row(AV.mine, U.guest, 'ready');
  await row(AV.theirs, U.guest2, 'ready');
  await row(AV.gone, U.guest, 'deleted');
  await row(AV.waiting, U.guest, 'queued');
}

test('겉모습: 0014 전에는 남의 사진 캐릭터 주소를 내 겉모습으로 저장할 수 있다(구멍)', async () => {
  await seedAvatars(old);
  await as(old, 'guest', (tx) => tx.query(UPSERT_LOOK, [U.guest, JSON.stringify(photo(AV.theirs))]));
  assert.deepEqual(await lookOf(old, U.guest), photo(AV.theirs));
  // avatar_id 쪽은 전부터 막혀 있었다
  await fails(old, 'guest', 'update public.profiles set avatar_id = $1 where user_id = $2', [AV.theirs, U.guest], /avatar_not_yours/);
});

test('겉모습: 사진은 내 그림(ready)일 때만. 남의 그림·지운 그림·아직 그리는 그림·모양 틀린 주소는 거절', async () => {
  await seedAvatars(db);
  // 새 행으로도, 있는 행을 고쳐서도 내 그림은 된다
  await as(db, 'guest', (tx) => tx.query(UPSERT_LOOK, [U.guest, JSON.stringify(photo(AV.mine))]));
  assert.deepEqual(await lookOf(db, U.guest), photo(AV.mine));
  await as(db, 'guest', (tx) => tx.query(UPSERT_LOOK, [U.guest, JSON.stringify(DOLL)]));
  await as(db, 'guest', (tx) => tx.query('update public.profiles set look = $1::jsonb where user_id = $2', [JSON.stringify(photo(AV.mine)), U.guest]));
  assert.deepEqual(await lookOf(db, U.guest), photo(AV.mine));
  const bad = [photo(AV.theirs), photo(AV.gone), photo(AV.waiting), photo('00000000-0000-4000-8000-00000000dead'),
    { kind: 'photo', url: 'https://evil.example/x.png' }, { kind: 'photo' }, { kind: 'photo', url: `/api/avatar/${AV.mine}/../x` }];
  for (const look of bad) {
    await fails(db, 'guest', UPSERT_LOOK, [U.guest, JSON.stringify(look)], /look_not_yours/);
    await fails(db, 'guest', 'update public.profiles set look = $1::jsonb where user_id = $2', [JSON.stringify(look), U.guest], /look_not_yours/);
  }
  assert.deepEqual(await lookOf(db, U.guest), photo(AV.mine));
  // 프로필 행이 아직 없는 사람이 남의 그림으로 첫 행을 만드는 것도 막힌다
  await fails(db, 'guest3', UPSERT_LOOK, [U.guest3, JSON.stringify(photo(AV.mine))], /look_not_yours/);
  assert.equal(await lookOf(db, U.guest3), undefined);
  // 인형과 비우기는 누구나 그대로
  await as(db, 'guest3', (tx) => tx.query(UPSERT_LOOK, [U.guest3, JSON.stringify(DOLL)]));
  await as(db, 'guest3', (tx) => tx.query('update public.profiles set look = null where user_id = $1', [U.guest3]));
  assert.equal(await lookOf(db, U.guest3), null);
});

test('겉모습: 사이트가 기대는 것 — 남의 그림은 avatars에서 읽히지 않는다(내 줄만)', async () => {
  const q = `select id from public.avatars where id = $1 and status = 'ready'`;
  assert.equal((await as(db, 'guest', (tx) => tx.query(q, [AV.mine]))).rows.length, 1);
  assert.equal((await as(db, 'guest', (tx) => tx.query(q, [AV.theirs]))).rows.length, 0);
  assert.equal((await as(db, 'guest', (tx) => tx.query(q, [AV.gone]))).rows.length, 0);
});

test('겉모습: 전에 들어간 값이 지금 규칙에 안 맞아도, look을 건드리지 않는 저장은 그대로 된다', async () => {
  // 0014 전에 저장된 것처럼: 남의 그림 주소가 들어 있는 행
  await raw(db, UPSERT_LOOK, [U.guest4, JSON.stringify(photo(AV.theirs))]);
  // 이름표·인형 색만 고치는 저장(수첩): 그냥 고치기와 넣기-겹치면-고치기 둘 다
  await as(db, 'guest4', (tx) => tx.query(`update public.profiles set nickname = '새 이름표', updated_at = now() where user_id = $1`, [U.guest4]));
  await as(db, 'guest4', (tx) => tx.query(`insert into public.profiles (user_id, nickname, doll_color, updated_at) values ($1, '이름표 둘', 'spring', now())
    on conflict (user_id) do update set nickname = excluded.nickname, doll_color = excluded.doll_color, updated_at = excluded.updated_at`, [U.guest4]));
  const row = (await db.query('select nickname, doll_color, look from public.profiles where user_id = $1', [U.guest4])).rows[0];
  assert.deepEqual(row, { nickname: '이름표 둘', doll_color: 'spring', look: photo(AV.theirs) });
  // 같은 값을 다시 저장하려 하면 거절(새로 넣는 것으로 본다), 인형으로 바꾸는 것은 된다
  await fails(db, 'guest4', UPSERT_LOOK, [U.guest4, JSON.stringify(photo(AV.theirs))], /look_not_yours/);
  await as(db, 'guest4', (tx) => tx.query(UPSERT_LOOK, [U.guest4, JSON.stringify(DOLL)]));
  assert.deepEqual(await lookOf(db, U.guest4), DOLL);
});

test('겉모습: 넓힌 트리거 아래에서도 캐릭터 만들기·고르기·지우기(0003)는 그대로', async () => {
  // avatar_id 쪽 확인은 전과 같다: 남의 그림은 넣기로도 고치기로도 못 건다
  await fails(db, 'guest2', 'insert into public.profiles (user_id, avatar_id) values ($1, $2)', [U.guest2, AV.mine], /avatar_not_yours/);
  await fails(db, 'guest', 'update public.profiles set avatar_id = $1 where user_id = $2', [AV.theirs, U.guest], /avatar_not_yours/);
  const begun = await as(db, 'family', (tx) => val(tx, 'select public.avatar_begin(true, 150)'));
  assert.equal(begun.ok, true);
  const id = begun.id;
  assert.equal(await as(db, 'service', (tx) => val(tx, 'select public.avatar_enqueue($1, $2)', [id, `${U.family}/originals/${id}.jpg`])), true);
  assert.equal(await as(db, 'service', (tx) => val(tx, `select public.avatar_settle($1, 'ready', null, $2, 'model-x')`, [id, `${U.family}/chars/${id}.png`])), true);
  assert.equal((await db.query('select avatar_id from public.profiles where user_id = $1', [U.family])).rows[0].avatar_id, id, '처음 만든 그림은 바로 내 캐릭터');
  // 다 그려진 그림을 겉모습으로 건다(걷기 화면이 하는 저장)
  await as(db, 'family', (tx) => tx.query(UPSERT_LOOK, [U.family, JSON.stringify(photo(id))]));
  assert.equal(await as(db, 'family', (tx) => val(tx, 'select public.avatar_choose(null)')), true);
  assert.equal(await as(db, 'family', (tx) => val(tx, 'select public.avatar_choose($1)', [id])), true);
  assert.equal(await as(db, 'family', (tx) => val(tx, 'select public.avatar_choose($1)', [AV.mine])), false);
  // 그림을 지워도 겉모습 값은 남는다(다음에 사진으로 다시 저장할 때만 거절된다). 인형으로는 언제든 바꾼다
  assert.equal(await as(db, 'family', (tx) => val(tx, `select public.avatar_forget($1, 'character')`, [id])), true);
  assert.deepEqual(await lookOf(db, U.family), photo(id));
  await fails(db, 'family', UPSERT_LOOK, [U.family, JSON.stringify(photo(id))], /look_not_yours/);
  await as(db, 'family', (tx) => tx.query(UPSERT_LOOK, [U.family, JSON.stringify(DOLL)]));
});

// ───────────────────────────── 4. my_roster() 실행권
test('my_roster: 0014 전에는 손님이 직접 불러 자기 명단 줄 전체(메모·이메일·회차)를 본다(구멍)', async () => {
  const r = await as(old, 'guest', (tx) => one(tx, 'select * from public.my_roster()'));
  assert.deepEqual([r.note, r.email, r.slot], ['집주인만 보는 메모', EMAIL.guest, '16']);
});

test('my_roster: 손님·anon은 직접 못 부르고, 이것에 기대는 역할 계산·이름·명단 묶기·쪽지는 그대로', async () => {
  await fails(db, 'guest', 'select * from public.my_roster()', [], /permission denied for function my_roster/);
  await fails(db, 'guest', 'select (public.my_roster()).note', [], /permission denied for function my_roster/);
  await fails(db, 'anon', 'select * from public.my_roster()', [], /permission denied for function my_roster/);
  await fails(db, 'admin', 'select * from public.my_roster()', [], /permission denied for function my_roster/);
  // 명단 표는 전처럼 관리자만 읽는다
  assert.equal(Number(await as(db, 'guest', (tx) => val(tx, 'select count(*) from public.roster'))), 0);
  assert.ok(Number(await as(db, 'admin', (tx) => val(tx, 'select count(*) from public.roster'))) >= 6);
  // 역할 계산과 이름
  const roles = {};
  for (const w of ['anon', 'visitor', 'guest', 'family', 'admin']) roles[w] = await as(db, w, (tx) => val(tx, 'select public.my_role()'));
  assert.deepEqual(roles, { anon: 'public', visitor: 'visitor', guest: 'guest', family: 'family', admin: 'admin' });
  assert.deepEqual(await as(db, 'guest', async (tx) => [await val(tx, 'select public.is_guest()'), await val(tx, 'select public.is_family()')]), [true, false]);
  const me = await as(db, 'guest2', (tx) => val(tx, 'select public.whoami()'));
  assert.deepEqual([me.role, me.name, me.roster_name], ['guest', '손님둘', '손님둘']);
  assert.equal((await as(db, 'anon', (tx) => val(tx, 'select public.whoami()'))).role, 'public');
  // 로그인 직후의 명단 묶기, 들어오기 요청, 정책(is_guest)을 지나는 넣기
  assert.equal(await as(db, 'guest2', (tx) => val(tx, 'select public.sync_my_roster()')), 'guest');
  assert.equal(await as(db, 'visitor', (tx) => val(tx, `select public.request_entry('구경꾼', null)`)), 'pending');
  assert.equal(await as(db, 'guest2', (tx) => val(tx, `select public.earn_room_stamp('porch')`)), true);
  assert.equal(Number(await as(db, 'guest2', (tx) => val(tx, 'select count(*) from public.my_records()'))) >= 0, true);
});
