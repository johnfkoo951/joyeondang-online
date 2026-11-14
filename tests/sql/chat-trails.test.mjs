// 0017_chat_trails.sql을 그 앞의 마이그레이션 전부 위에 올려(PGlite) 걷기 화면의 대화·멘션·접속자 채널 권한·걸은 길을 검사한다.
// Supabase의 auth·storage·realtime 스키마는 흉내만 낸다. realtime.send()는 보낸 것을 realtime.sent에 적어 두고,
// 채널 권한은 Realtime이 하듯 realtime.topic 설정을 걸고 realtime.messages를 읽고 써 보는 것으로 본다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const BEFORE = ['0001_init.sql', '0002_rooms_play.sql', '0003_avatars.sql', '0004_shots.sql', '0006_profile_look.sql',
  '0008_rooms_more.sql', '0010_qr_quiet.sql', '0012_note_photos.sql', '0014_guards.sql', '0015_avatar_views.sql'].map(read);
const SOCIAL = read('0017_chat_trails.sql');

const BASE_STUB = `
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

// Supabase Realtime의 모양만: 채널 이름은 realtime.topic 설정에서, 보내기는 표에 적기(실패해도 경고만 하는 것은 흉내 내지 않는다)
const REALTIME_STUB = `
create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;
create table realtime.messages (
  id uuid primary key default gen_random_uuid(), topic text not null, extension text not null,
  payload jsonb, event text, private boolean default false, inserted_at timestamp not null default now());
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '') $$;
grant execute on function realtime.topic() to anon, authenticated;
create table realtime.sent (n bigint generated always as identity primary key, topic text, event text, payload jsonb, private boolean);
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language plpgsql as $$
begin
  insert into realtime.sent (topic, event, payload, private) values (topic, event, payload, private);
end $$;
`;

const U = {
  admin: '00000000-0000-4000-8000-00000000000a',
  family: '00000000-0000-4000-8000-00000000000f',
  guest: '00000000-0000-4000-8000-000000000001',
  guest2: '00000000-0000-4000-8000-000000000002',
  guest3: '00000000-0000-4000-8000-000000000003',
  guest4: '00000000-0000-4000-8000-000000000004',
  walker: '00000000-0000-4000-8000-000000000005',
  leaver: '00000000-0000-4000-8000-000000000006',
  gone: '00000000-0000-4000-8000-000000000007',
  visitor: '00000000-0000-4000-8000-000000000009',
};
const EMAIL = Object.fromEntries(Object.keys(U).map((k) => [k, `${k}@example.test`]));
/** 사이트가 계산하는 22자 구분값 흉내 */
const SUB = Object.fromEntries(Object.keys(U).map((k) => [k, `${k}0`.padEnd(22, 'x')]));
const DOLL = { kind: 'doll', doll: { hair: 'bob', hairColor: '#a8743f', skin: '#c99470', top: '#6b8fb5', bottom: '#ece4d6', acc: 'glasses' } };

let db;

async function as(who, fn, d = db) {
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
async function fails(who, sql, p, re) {
  await assert.rejects(as(who, (tx) => tx.query(sql, p)), (e) => { assert.match(String(e.message), re); return true; });
}
/** 운영자 권한으로, 트리거를 끄고(시험 준비용) */
const raw = (sql, p = []) => db.transaction(async (tx) => {
  await tx.query('set local session_replication_role = replica');
  return tx.query(sql, p);
});
const post = (who, body, mentions = [], space = 'house:real', via = 'window') =>
  as(who, (tx) => val(tx, 'select public.chat_post($1, $2, $3, $4)', [body, mentions, space, via]));
const register = (who, sub = SUB[who]) => as('service', (tx) => val(tx, 'select public.chat_register($1, $2)', [U[who], sub]));
/** 빠르기 기록을 비운다(다음 글을 바로 쓸 수 있게) */
const unrate = () => raw('delete from public.chat_rate');
/** 앞 시험들이 방금 쓴 글을 1분 앞으로 옮긴다(「1초에 둘까지」 퍼뜨리기에 걸리지 않게) */
const calm = () => raw(`update public.chat_messages set created_at = created_at - interval '1 minute'`);
const sentSince = async (n) => (await db.query('select topic, event, payload, private from realtime.sent where n > $1 order by n', [n])).rows;
const lastSent = async () => Number((await db.query('select coalesce(max(n), 0) as n from realtime.sent')).rows[0].n);
const nowMs = async () => Number((await db.query('select floor(extract(epoch from now()) * 1000) as v')).rows[0].v);

/** Realtime이 채널에 들어올 때 하는 판정 흉내: 읽기(그 채널의 그 종류 줄이 보이는가) */
async function canRead(who, topic, extension) {
  await db.query('insert into realtime.messages (topic, extension, payload, event) values ($1, $2, $3, $4)',
    [topic, extension, '{}', 'probe']);
  return as(who, async (tx) => {
    await tx.query(`select set_config('realtime.topic', $1, true)`, [topic]);
    return (await val(tx, 'select count(*)::int from realtime.messages where topic = $1 and extension = $2', [topic, extension])) > 0;
  });
}
/** 쓰기(그 채널에 그 종류를 넣을 수 있는가: presence 알리기, broadcast 보내기) */
async function canWrite(who, topic, extension) {
  try {
    await as(who, async (tx) => {
      await tx.query(`select set_config('realtime.topic', $1, true)`, [topic]);
      await tx.query('insert into realtime.messages (topic, extension, payload, event) values ($1, $2, $3, $4)',
        [topic, extension, '{}', 'probe']);
    });
    return true;
  } catch (e) {
    assert.match(String(e.message), /row-level security|permission denied/);
    return false;
  }
}

async function fresh({ social = true, realtime = true } = {}) {
  const d = new PGlite();
  await d.exec(BASE_STUB);
  if (realtime) await d.exec(REALTIME_STUB);
  for (const m of BEFORE) await d.exec(m);
  if (social) {
    await d.exec(SOCIAL);
    await d.exec(SOCIAL); // 두 번 올려도 괜찮다
  }
  for (const [k, id] of Object.entries(U)) await d.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await d.exec(`insert into public.roster (display_name, role, email, slot, revoked_at) values
    ('집주인', 'admin', '${EMAIL.admin}', null, null), ('가족', 'family', '${EMAIL.family}', 'family', null),
    ('손님하나', 'guest', '${EMAIL.guest}', '16', null), ('손님둘', 'guest', '${EMAIL.guest2}', null, null),
    ('손님셋   이름이 아주 길어서 잘려야 하는 사람', 'guest', '${EMAIL.guest3}', null, null),
    ('손님넷', 'guest', '${EMAIL.guest4}', null, null), ('걷는 손님', 'guest', '${EMAIL.walker}', null, null),
    ('떠날 손님', 'guest', '${EMAIL.leaver}', null, null), ('나간 손님', 'guest', '${EMAIL.gone}', null, null);`);
  return d;
}

before(async () => {
  db = await fresh();
  for (const w of Object.keys(U)) await as(w, (tx) => tx.query('select public.sync_my_roster()'));
  // 이름표 별명과 겉모습(정책을 건너뛰어 바로 넣는다)
  await db.query(`insert into public.profiles (user_id, nickname, look) values ($1, null, $2), ($3, '둘째별명', null)`,
    [U.guest, JSON.stringify(DOLL), U.guest2]);
  // 명단에서 빠진 손님: 묶인 뒤 거둔다
  await db.query(`update public.roster set revoked_at = now() where email = $1`, [EMAIL.gone]);
});

// ───────────────────────────── 준비·권한
test('앞의 것이 빠진 DB(Realtime 없음)에는 올라가지 않고 아무것도 바꾸지 않는다', async () => {
  const d = await fresh({ social: false, realtime: false });
  await assert.rejects(d.exec(SOCIAL), /0017_needs_supabase_realtime/);
  const r = (await d.query(`select to_regclass('public.chat_messages') is null as no_chat,
    to_regprocedure('public.social_limits()') is null as no_limits`)).rows[0];
  assert.deepEqual(r, { no_chat: true, no_limits: true });
});

test('숫자는 social_limits() 한곳에 있고, 실행권은 필요한 만큼만(sub 적기는 비밀 키만)', async () => {
  assert.deepEqual((await db.query('select public.social_limits() as v')).rows[0].v, {
    chat_body_max: 300, chat_mentions_max: 5, chat_gap_ms: 1500, chat_minute_max: 20, chat_live_per_second: 2,
    trail_points_max: 120, trail_minute_max: 8, trail_day_points: 40000, trail_span_minutes: 15,
  });
  const priv = (await db.query(`select
    has_function_privilege('authenticated', 'public.chat_register(uuid, text)', 'execute') as auth_register,
    has_function_privilege('service_role', 'public.chat_register(uuid, text)', 'execute') as service_register,
    has_function_privilege('anon', 'public.chat_post(text, text[], text, text)', 'execute') as anon_post,
    has_function_privilege('authenticated', 'public.chat_post(text, text[], text, text)', 'execute') as auth_post,
    has_function_privilege('anon', 'public.chat_list(timestamptz, uuid, timestamptz, uuid, int)', 'execute') as anon_list,
    has_function_privilege('authenticated', 'public.chat_list(timestamptz, uuid, timestamptz, uuid, int)', 'execute') as auth_list,
    has_function_privilege('authenticated', 'public.chat_messages_live()', 'execute') as auth_trigger,
    has_function_privilege('authenticated', 'public.chat_name_of(uuid)', 'execute') as auth_name_of,
    has_function_privilege('authenticated', 'public.chat_my_topic()', 'execute') as auth_topic,
    has_function_privilege('anon', 'public.trail_post(text, jsonb)', 'execute') as anon_trail,
    has_function_privilege('authenticated', 'public.trail_post(text, jsonb)', 'execute') as auth_trail,
    has_function_privilege('authenticated', 'public.walk_trails_read(timestamptz, timestamptz, bigint, int)', 'execute') as auth_trails_read,
    has_table_privilege('authenticated', 'public.chat_messages', 'select') as auth_chat_select,
    has_table_privilege('authenticated', 'public.chat_people', 'select') as auth_people_select,
    has_table_privilege('authenticated', 'public.chat_rate', 'select') as auth_rate_select,
    has_table_privilege('authenticated', 'public.walk_trails', 'insert') as auth_trail_insert,
    has_table_privilege('anon', 'public.walk_trails', 'select') as anon_trail_select`)).rows[0];
  assert.deepEqual(priv, {
    auth_register: false, service_register: true, anon_post: false, auth_post: true, anon_list: false, auth_list: true,
    auth_trigger: false, auth_name_of: false, auth_topic: true, anon_trail: false, auth_trail: true, auth_trails_read: true,
    auth_chat_select: false, auth_people_select: false, auth_rate_select: false, auth_trail_insert: false, anon_trail_select: false,
  });
});

// ───────────────────────────── sub 기록
test('sub는 비밀 키로만 적는다: 모양이 틀리거나 없는 사람이면 거절, 다른 사람의 sub는 가로채지 못한다', async () => {
  await fails('guest', 'select public.chat_register($1, $2)', [U.guest, SUB.guest], /permission denied/);
  assert.equal(await register('guest', 'short'), false);
  assert.equal(await register('guest', `${'x'.repeat(21)}!`), false);
  assert.equal(await as('service', (tx) => val(tx, 'select public.chat_register($1, $2)', ['00000000-0000-4000-8000-0000000000ee', SUB.admin])), false);
  for (const w of ['admin', 'family', 'guest', 'guest2', 'guest3', 'guest4', 'walker', 'leaver']) assert.equal(await register(w), true, w);
  assert.equal(await register('guest'), true, '같은 값을 다시 적어도 된다');
  assert.equal(await register('guest2', SUB.guest), false, '남의 sub');
  assert.equal(await val(db, 'select sub from public.chat_people where user_id = $1', [U.guest2]), SUB.guest2);
});

// ───────────────────────────── 쓰기
test('명단 손님만 쓴다: 구경꾼·명단에서 빠진 사람은 not_guest, sub가 아직 없으면 no_subject', async () => {
  assert.deepEqual(await post('visitor', '안녕'), { ok: false, reason: 'not_guest' });
  assert.deepEqual(await post('gone', '안녕'), { ok: false, reason: 'not_guest' });
  await fails('anon', 'select public.chat_post($1)', ['안녕'], /permission denied/);
  await raw('delete from public.chat_people where user_id = $1', [U.guest4]);
  assert.deepEqual(await post('guest4', '안녕'), { ok: false, reason: 'no_subject' });
  assert.equal(await register('guest4'), true);
});

test('글: 한 줄로 고쳐 저장하고, 쓴 사람의 이름표·겉모습·sub는 DB가 정한다(로그인 id는 내보내지 않는다)', async () => {
  await unrate();
  await calm();
  const from = await lastSent();
  const r = await post('guest', '  첫\n\n인사 \t 드려요  ', [], 'room:study');
  assert.equal(r.ok, true);
  const m = r.message;
  assert.equal(m.body, '첫 인사 드려요');
  assert.equal(m.sub, SUB.guest);
  assert.equal(m.name, '손님하나');
  assert.deepEqual(m.look, DOLL);
  assert.equal(m.space, 'room:study');
  assert.equal(m.via, 'window');
  assert.equal(m.mine, true);
  assert.equal(typeof m.ms, 'number');
  assert.ok(!('user_id' in m));
  const sent = await sentSince(from);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].topic, 'walk:chat');
  assert.equal(sent[0].event, 'new');
  assert.equal(sent[0].private, true);
  assert.equal(sent[0].payload.id, m.id);
  assert.ok(!('user_id' in sent[0].payload) && !('mine' in sent[0].payload), '퍼뜨리는 글에는 로그인 id와 mine이 없다');
  // 이름이 길면 이름표처럼 16자
  await unrate();
  const long = await post('guest3', '안녕하세요');
  assert.equal(long.message.name, '손님셋 이름이 아주 길어서 잘');
});

test('글: 비면 empty, 300자를 넘으면 too_long, 모르는 공간·쓰는 길은 거절', async () => {
  await unrate();
  assert.deepEqual(await post('guest', '   \n '), { ok: false, reason: 'empty' });
  assert.deepEqual(await post('guest', '가'.repeat(301)), { ok: false, reason: 'too_long' });
  assert.equal((await post('guest', '가'.repeat(300))).ok, true);
  await unrate();
  assert.deepEqual(await post('guest', '어디', [], 'house:fake'), { ok: false, reason: 'bad_space' });
  assert.deepEqual(await post('guest', '어디', [], 'room:'), { ok: false, reason: 'bad_space' });
  assert.deepEqual(await post('guest', '길', [], 'house:real', 'dm'), { ok: false, reason: 'bad_via' });
  assert.equal((await post('guest', '말풍선', [], null, 'say')).message.via, 'say');
  // 제어문자는 표가 한 번 더 막는다
  await assert.rejects(raw(`insert into public.chat_messages (user_id, sub, name, body) values ($1, $2, '이름', $3)`,
    [U.guest, SUB.guest, 'a\u0007b']), /check constraint/);
});

test('멘션: 대화를 쓰는 사람만, 나는 빼고, 같은 사람은 한 번, 이름은 그 사람의 이름표. 다섯 명이 넘으면 거절', async () => {
  await unrate();
  await calm();
  const from = await lastSent();
  const r = await post('guest', '@둘째별명 @손님셋 반가워요', [SUB.guest2, SUB.guest3, SUB.guest2, SUB.guest, 'nobodyxxxxxxxxxxxxxxxx']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.message.mentions, [{ sub: SUB.guest2, name: '둘째별명' }, { sub: SUB.guest3, name: '손님셋 이름이 아주 길어서 잘' }]);
  const sent = await sentSince(from);
  assert.deepEqual(sent.map((s) => `${s.event} ${s.topic}`).sort(),
    [`mention walk:me:${SUB.guest2}`, `mention walk:me:${SUB.guest3}`, 'new walk:chat'].sort());
  assert.ok(sent.every((s) => s.payload.id === r.message.id));
  await unrate();
  const six = ['admin', 'family', 'guest2', 'guest3', 'guest4', 'walker'].map((w) => SUB[w]);
  assert.deepEqual(await post('guest', '다들', six), { ok: false, reason: 'too_many_mentions' });
  assert.equal((await post('guest', '다섯', six.slice(0, 5))).message.mentions.length, 5);
});

test('빠르기: 1.5초 안의 다음 글은 too_fast, 1분에 스무 개를 넘으면 too_many(다른 사람은 막히지 않는다)', async () => {
  await unrate();
  assert.equal((await post('guest2', '하나')).ok, true);
  assert.deepEqual(await post('guest2', '둘'), { ok: false, reason: 'too_fast' });
  assert.equal((await post('guest3', '나는 따로')).ok, true);
  // 최근 1분에 열아홉 개(마지막은 2초 전): 스무 번째는 된다, 그다음은 막힌다
  const recent = `array(select now() - make_interval(secs => 2 + g) from generate_series(18, 0, -1) g)`;
  await raw(`update public.chat_rate set recent = ${recent} where user_id = $1`, [U.guest2]);
  assert.equal((await post('guest2', '스무 번째')).ok, true);
  await raw(`update public.chat_rate set recent = array(select now() - make_interval(secs => 2 + g) from generate_series(19, 0, -1) g) where user_id = $1`, [U.guest2]);
  assert.deepEqual(await post('guest2', '스물한 번째'), { ok: false, reason: 'too_many' });
  // 1분이 지난 것은 세지 않는다
  await raw(`update public.chat_rate set recent = array(select now() - make_interval(secs => 61 + g) from generate_series(19, 0, -1) g) where user_id = $1`, [U.guest2]);
  assert.equal((await post('guest2', '다시')).ok, true);
});

test('모두에게 퍼뜨리는 새 글은 1초에 둘까지: 넘친 글도 저장되고, 멘션은 그대로 간다', async () => {
  await unrate();
  await calm();
  // 조용할 때는 퍼진다
  let from = await lastSent();
  assert.equal((await post('guest3', '조용할 때')).ok, true);
  assert.deepEqual((await sentSince(from)).map((s) => s.event), ['new']);
  await unrate();
  // 방금 퍼뜨린 글 둘(때를 조금 앞으로 당겨 「지난 1초 안」에 확실히 들게. raw는 트리거 없이 넣으므로 live를 직접 단다)
  await raw(`insert into public.chat_messages (user_id, sub, name, body, live, created_at)
    select $1, $2, '손님넷', '몰림 ' || g, true, now() + interval '5 seconds' from generate_series(1, 2) g`, [U.guest4, SUB.guest4]);
  from = await lastSent();
  const r = await post('guest', '@둘째별명 몰릴 때', [SUB.guest2]);
  assert.equal(r.ok, true);
  const sent = await sentSince(from);
  assert.deepEqual(sent.map((s) => `${s.event} ${s.topic}`), [`mention walk:me:${SUB.guest2}`]);
  assert.equal(await val(db, 'select count(*)::int from public.chat_messages where id = $1', [r.message.id]), 1);
  await raw(`delete from public.chat_messages where body like '몰림 %'`);
});

test('퍼뜨리기 한도는 퍼뜨린 글만 센다: 넘친 글이 이어져도 1초가 지나면 다시 퍼진다', async () => {
  await unrate();
  await calm();
  // 지난 1초에 퍼뜨리지 않은(넘친) 글이 아무리 많아도 막지 않는다(raw는 트리거 없이 넣는다)
  await raw(`insert into public.chat_messages (user_id, sub, name, body, live, created_at)
    select $1, $2, '손님넷', '넘침 ' || g, false, now() + interval '5 seconds' from generate_series(1, 5) g`, [U.guest4, SUB.guest4]);
  const from = await lastSent();
  assert.equal((await post('guest3', '넘친 뒤')).ok, true);
  assert.deepEqual((await sentSince(from)).map((s) => s.event), ['new'], '넘친 글은 세지 않는다');
  await raw(`delete from public.chat_messages where body like '넘침 %'`);
});

test('말풍선(say): 저장하되 모두에게 퍼뜨리지 않고, 대화 이력에는 쓴 사람과 가족·집주인에게만 보인다', async () => {
  await unrate();
  await calm();
  const from = await lastSent();
  const r = await post('guest', '방에서 한 말', [], 'house:real', 'say');
  assert.equal(r.ok, true);
  assert.deepEqual((await sentSince(from)).filter((s) => s.topic === 'walk:chat'), [], '모두의 채널로 퍼뜨리지 않는다');
  assert.equal(await val(db, 'select live from public.chat_messages where id = $1', [r.message.id]), false);
  const sees = (who) => as(who, (tx) => val(tx, 'select count(*)::int from public.chat_list(null, null, null, null, 100) where id = $1', [r.message.id]));
  assert.equal(await sees('guest'), 1, '쓴 사람');
  assert.equal(await sees('guest2'), 0, '다른 손님');
  assert.equal(await sees('family'), 1, '가족');
  assert.equal(await sees('admin'), 1, '집주인');
  const afterList = (who) => as(who, (tx) => val(tx,
    `select count(*)::int from public.chat_list(null, null, now() - interval '1 day', null, 100) where id = $1`, [r.message.id]));
  assert.equal(await afterList('guest2'), 0, '이어 읽기(after)에도 같다');
  assert.equal(await afterList('family'), 1);
  await raw('delete from public.chat_messages where id = $1', [r.message.id]);
});

// ───────────────────────────── 읽기
test('읽기: 명단 손님 이상만, 새것부터, mine은 내 글만. 위로(before)·아래로(after) 이어 읽는다', async () => {
  assert.equal(await as('visitor', (tx) => val(tx, 'select count(*)::int from public.chat_list()')), 0);
  assert.equal(await as('gone', (tx) => val(tx, 'select count(*)::int from public.chat_list()')), 0);
  await fails('guest', 'select * from public.chat_messages', [], /permission denied/);
  const list = await as('guest2', (tx) => tx.query('select id, sub, body, created_at, mine from public.chat_list(null, null, null, null, 100)'));
  const rows = list.rows;
  assert.ok(rows.length >= 5);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].created_at >= rows[i].created_at, '새것부터');
  assert.ok(rows.every((r) => r.mine === (r.sub === SUB.guest2)));
  assert.ok(!Object.keys(rows[0]).includes('user_id'));
  // 한도: 1~100
  assert.equal(await as('guest', (tx) => val(tx, 'select count(*)::int from public.chat_list(null, null, null, null, 2)')), 2);
  assert.equal(await as('guest', (tx) => val(tx, 'select count(*)::int from public.chat_list(null, null, null, null, 0)')), 1);
  // 같은 때에 쓴 두 글(아주 옛날)도 id로 이어 읽으면 빠지지 않는다
  await raw(`insert into public.chat_messages (id, user_id, sub, name, body, created_at) values
    ('10000000-0000-4000-8000-000000000001', $1, $2, '손님하나', '옛 글 가', '2020-01-01T00:00:00Z'),
    ('10000000-0000-4000-8000-000000000002', $1, $2, '손님하나', '옛 글 나', '2020-01-01T00:00:00Z'),
    ('10000000-0000-4000-8000-000000000003', $1, $2, '손님하나', '옛 글 다', '2019-12-31T23:59:59Z')`, [U.guest, SUB.guest]);
  const old = await as('guest', (tx) => tx.query(`select body from public.chat_list('2020-01-02T00:00:00Z', null, null, null, 1)`));
  assert.deepEqual(old.rows.map((r) => r.body), ['옛 글 나']);
  const next = await as('guest', (tx) => tx.query(`select body from public.chat_list('2020-01-01T00:00:00Z', '10000000-0000-4000-8000-000000000002', null, null, 5)`));
  assert.deepEqual(next.rows.map((r) => r.body), ['옛 글 가', '옛 글 다']);
  const after = await as('guest', (tx) => tx.query(`select body from public.chat_list(null, null, '2019-12-31T23:59:59Z', '10000000-0000-4000-8000-000000000003', 2)`));
  assert.deepEqual(after.rows.map((r) => r.body), ['옛 글 가', '옛 글 나'], '뒤로는 오래된 것부터');
  await raw(`delete from public.chat_messages where body like '옛 글 %'`);
});

// ───────────────────────────── 지우기
test('지우기: 쓴 사람은 내 글을(명단에서 빠진 뒤에도), 관리자는 누구의 글이든. 다른 손님·가족은 못 지운다', async () => {
  await unrate();
  const a = (await post('guest3', '지울 글')).message.id;
  assert.equal(await as('guest', (tx) => val(tx, 'select public.chat_delete($1)', [a])), false);
  assert.equal(await as('family', (tx) => val(tx, 'select public.chat_delete($1)', [a])), false);
  const from = await lastSent();
  assert.equal(await as('guest3', (tx) => val(tx, 'select public.chat_delete($1)', [a])), true);
  assert.deepEqual((await sentSince(from)).map((s) => [s.event, s.topic, s.payload]), [['gone', 'walk:chat', { id: a }]]);
  assert.equal(await as('guest3', (tx) => val(tx, 'select public.chat_delete($1)', [a])), false, '이미 지움');
  await unrate();
  const b = (await post('guest2', '관리자가 지울 글')).message.id;
  assert.equal(await as('admin', (tx) => val(tx, 'select public.chat_delete($1)', [b])), true);
  // 명단에서 빠진 뒤에도 내 글은 지운다
  await unrate();
  const c = (await post('leaver', '나갈 사람의 글')).message.id;
  await db.query('update public.roster set revoked_at = now() where email = $1', [EMAIL.leaver]);
  assert.equal(await as('leaver', (tx) => val(tx, 'select public.chat_delete($1)', [c])), true);
  await db.query('update public.roster set revoked_at = null where email = $1', [EMAIL.leaver]);
  await fails('anon', 'select public.chat_delete($1)', [b], /permission denied/);
});

// ───────────────────────────── 실시간 채널 권한
test('walk:chat: 명단 손님 이상이 듣고, 아무도 보내지 못한다(새 글은 DB 트리거만)', async () => {
  for (const w of ['guest', 'family', 'admin']) assert.equal(await canRead(w, 'walk:chat', 'broadcast'), true, w);
  for (const w of ['visitor', 'gone']) assert.equal(await canRead(w, 'walk:chat', 'broadcast'), false, w);
  assert.equal(await canRead('anon', 'walk:chat', 'broadcast'), false);
  for (const w of ['guest', 'admin', 'visitor']) assert.equal(await canWrite(w, 'walk:chat', 'broadcast'), false, w);
  assert.equal(await canRead('guest', 'walk:chat', 'presence'), false, '대화 채널의 presence는 열지 않았다');
});

test('walk:online: 명단 손님 이상이 접속을 알리고(presence) 듣는다. broadcast는 열지 않았다', async () => {
  for (const w of ['guest', 'family', 'admin']) {
    assert.equal(await canRead(w, 'walk:online', 'presence'), true, w);
    assert.equal(await canWrite(w, 'walk:online', 'presence'), true, w);
  }
  for (const w of ['visitor', 'gone']) {
    assert.equal(await canRead(w, 'walk:online', 'presence'), false, w);
    assert.equal(await canWrite(w, 'walk:online', 'presence'), false, w);
  }
  assert.equal(await canWrite('guest', 'walk:online', 'broadcast'), false);
  assert.equal(await canWrite('guest', 'walk:elsewhere', 'presence'), false, '다른 채널은 정책 밖');
});

test('walk:me:<sub>: 그 사람만 듣는다(남의 멘션 채널, sub가 없는 사람, 명단 밖은 못 듣는다)', async () => {
  assert.equal(await canRead('guest2', `walk:me:${SUB.guest2}`, 'broadcast'), true);
  assert.equal(await canRead('guest', `walk:me:${SUB.guest2}`, 'broadcast'), false);
  assert.equal(await canRead('admin', `walk:me:${SUB.guest2}`, 'broadcast'), false);
  assert.equal(await canRead('visitor', `walk:me:${SUB.guest2}`, 'broadcast'), false);
  assert.equal(await canWrite('guest2', `walk:me:${SUB.guest2}`, 'broadcast'), false);
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.chat_my_topic()')), `walk:me:${SUB.guest2}`);
  assert.equal(await as('gone', (tx) => val(tx, 'select public.chat_my_topic()')), null);
});

// ───────────────────────────── 걸은 길
const trail = (who, space, points) => as(who, (tx) => val(tx, 'select public.trail_post($1, $2)', [space, JSON.stringify(points)]));
const pts = (t0, n, step = 1000) => Array.from({ length: n }, (_, i) => [t0 + i * step, 1.25 + i * 0.5, 0, -3.5, 0.75]);

test('걸은 길: 명단 손님이 남기고, 보낸 때의 이름표·sub와 함께 저장된다', async () => {
  const t = await nowMs();
  assert.deepEqual(await trail('visitor', 'house:real', pts(t - 5000, 3)), { ok: false, reason: 'not_guest' });
  assert.deepEqual(await trail('walker', 'house:real', pts(t - 5000, 3)), { ok: true });
  const row = (await db.query('select sub, name, space, n, points, t1 - t0 as span from public.walk_trails where user_id = $1', [U.walker])).rows[0];
  assert.equal(row.sub, SUB.walker);
  assert.equal(row.name, '걷는 손님');
  assert.equal(row.space, 'house:real');
  assert.equal(row.n, 3);
  assert.deepEqual(row.points, pts(t - 5000, 3));
  await fails('walker', `insert into public.walk_trails (user_id, name, space, t0, t1, n, points) values ($1, 'x', 'house:real', now(), now(), 1, '[[0,0,0,0,0]]')`,
    [U.walker], /permission denied/);
});

test('걸은 길: 모양·자리·때·차례가 틀리면 거절', async () => {
  const t = await nowMs();
  const bad = async (space, points, reason) => assert.deepEqual(await trail('guest', space, points), { ok: false, reason });
  await bad('house:nowhere', pts(t, 1), 'bad_space');
  await bad('house:real', [], 'bad_points');
  await bad('house:real', pts(t - 200_000, 121, 1000), 'bad_points');
  await bad('house:real', [[t, 1, 2, 3]], 'bad_points');
  await bad('house:real', [[t, 1, 2, '3', 0]], 'bad_points');
  await bad('house:real', [[t, 5000, 0, 0, 0]], 'bad_points');
  await bad('house:real', [[t, 0, 0, 0, 12]], 'bad_points');
  await bad('house:real', [[t - 30 * 60 * 1000, 0, 0, 0, 0]], 'bad_time');
  await bad('house:real', [[t + 5 * 60 * 1000, 0, 0, 0, 0]], 'bad_time');
  await bad('house:real', [[t, 0, 0, 0, 0], [t - 1000, 0, 0, 0, 0]], 'bad_order');
  await bad('house:real', [[t - 16 * 60 * 1000, 0, 0, 0, 0], [t, 0, 0, 0, 0]], 'bad_time');
  assert.deepEqual(await trail('guest', 'room:study', [[t, 0, 0, 0, 0]]), { ok: true }, '점 하나도 된다');
});

test('걸은 길: 1분에 여덟 번, 하루 4만 점까지', async () => {
  const t = await nowMs();
  for (let i = 0; i < 8; i++) assert.deepEqual(await trail('guest2', 'house:real', pts(t - 1000, 1)), { ok: true }, `${i}`);
  assert.deepEqual(await trail('guest2', 'house:real', pts(t - 1000, 1)), { ok: false, reason: 'too_many' });
  // 하루 한도: 숫자 한 곳만 잠깐 낮춰 본다(마이그레이션을 다시 올려 되돌린다)
  await db.exec(`create or replace function public.social_limits() returns jsonb language sql immutable set search_path = '' as $$
    select jsonb_build_object('chat_body_max', 300, 'chat_mentions_max', 5, 'chat_gap_ms', 1500, 'chat_minute_max', 20,
      'chat_live_per_second', 2, 'trail_points_max', 120, 'trail_minute_max', 100, 'trail_day_points', 12, 'trail_span_minutes', 15) $$`);
  try {
    assert.deepEqual(await trail('guest3', 'house:real', pts(t - 10_000, 10)), { ok: true });
    assert.deepEqual(await trail('guest3', 'house:real', pts(t - 1000, 3)), { ok: false, reason: 'too_many_today' });
    assert.deepEqual(await trail('guest3', 'house:real', pts(t - 1000, 2)), { ok: true });
  } finally {
    await db.exec(SOCIAL);
  }
  assert.equal((await db.query(`select public.social_limits() ->> 'trail_day_points' as v`)).rows[0].v, '40000');
});

test('걸은 길 읽기: 가족·관리자만(손님은 자기 것도 못 본다), 때 범위와 이어 읽기', async () => {
  for (const w of ['guest', 'walker', 'visitor']) {
    assert.equal(await as(w, (tx) => val(tx, 'select count(*)::int from public.walk_trails')), 0, w);
    assert.equal(await as(w, (tx) => val(tx, `select count(*)::int from public.walk_trails_read(now() - interval '1 day', now() + interval '1 day')`)), 0, w);
  }
  const all = Number(await val(db, 'select count(*) from public.walk_trails'));
  assert.ok(all >= 10);
  for (const w of ['family', 'admin']) {
    assert.equal(await as(w, (tx) => val(tx, 'select count(*)::int from public.walk_trails')), all, w);
    assert.equal(await as(w, (tx) => val(tx, `select count(*)::int from public.walk_trails_read(now() - interval '1 day', now() + interval '1 day')`)), all, w);
  }
  const page = await as('admin', (tx) => tx.query(`select id from public.walk_trails_read(now() - interval '1 day', now() + interval '1 day', 0, 3)`));
  assert.equal(page.rows.length, 3);
  const rest = await as('admin', (tx) => tx.query(`select id from public.walk_trails_read(now() - interval '1 day', now() + interval '1 day', $1, 1000)`,
    [page.rows[2].id]));
  assert.equal(rest.rows.length, all - 3);
  assert.equal(await as('admin', (tx) => val(tx, `select count(*)::int from public.walk_trails_read(now() + interval '1 hour', now() + interval '2 hours')`)), 0);
  const cols = Object.keys((await as('family', (tx) => tx.query(`select * from public.walk_trails_read(now() - interval '1 day', now() + interval '1 day', 0, 1)`))).rows[0]);
  assert.deepEqual(cols, ['id', 'sub', 'name', 'space', 't0', 't1', 'points'], '로그인 id는 내보내지 않는다');
});

// ───────────────────────────── 계정 지우기
test('계정을 지우면 그 사람의 글·길·sub·빠르기 기록이 함께 지워진다', async () => {
  await unrate();
  assert.equal((await post('leaver', '마지막 인사')).ok, true);
  assert.deepEqual(await trail('leaver', 'house:real', pts(await nowMs() - 2000, 2)), { ok: true });
  await db.query('delete from public.roster where email = $1', [EMAIL.leaver]);
  await db.query('delete from auth.users where id = $1', [U.leaver]);
  const left = (await db.query(`select
    (select count(*)::int from public.chat_messages where user_id = $1) as chat,
    (select count(*)::int from public.walk_trails where user_id = $1) as trails,
    (select count(*)::int from public.chat_people where user_id = $1) as people,
    (select count(*)::int from public.chat_rate where user_id = $1) as rate`, [U.leaver])).rows[0];
  assert.deepEqual(left, { chat: 0, trails: 0, people: 0, rate: 0 });
});
