// 0018_event_codes.sql을 그 앞의 마이그레이션 위에 올려(PGlite) 행사 초대 코드를 검사한다:
// 만들기(집주인만, 해시만), 들어오기(새 사람, 이미 들어온 사람, 끝남·거둠·다 참, 명단에서 뺀 계정, 구글 아님),
// 이름 다듬기, 입장 요청 닫기, 거두기(코드만 / 들어온 사람까지), 목록·엿보기 권한, 사람별 초대와 섞이지 않음.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const BEFORE = ['0001_init.sql', '0002_rooms_play.sql', '0003_avatars.sql', '0004_shots.sql', '0006_profile_look.sql',
  '0008_rooms_more.sql', '0010_qr_quiet.sql', '0012_note_photos.sql', '0014_guards.sql', '0015_avatar_views.sql'].map(read);
const EVENT = read('0018_event_codes.sql');

// Supabase의 auth·storage 스키마는 흉내만 낸다(함수 실행권도 Supabase처럼 기본으로 열려 있다)
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

const ids = [
  'admin', 'family', 'guest', 'removed', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'noname', 'nomail', 'other', 'emailtwin',
];
const U = Object.fromEntries(ids.map((k, i) => [k, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
const EMAIL = Object.fromEntries(ids.map((k) => [k, `${k}@example.test`]));
EMAIL.nomail = null;
EMAIL.emailtwin = 'twin@example.test';
/** 구글이 넣어 주는 계정 이름(user_metadata). 없으면 이메일 앞부분, 그것도 없으면 '손님' */
const META = {
  v1: { full_name: '  첫째   청중 ', name: '첫째' },
  v2: { name: 'Second Person' },
  v3: { full_name: '셋째 청중' },
  v4: { full_name: '넷째' },
  v5: { full_name: '다섯째' },
  v6: { full_name: '여섯째' },
  v7: { full_name: '일곱째' },
  v8: { full_name: '여덟째' },
  noname: {},
  nomail: {},
  other: { full_name: '다른 로그인' },
  emailtwin: { full_name: '이메일 같은 분' },
};
/** 구글이 아닌 로그인(이 사이트는 구글만 켜 두지만, 다른 길이 열려도 행사 코드로는 못 들어오게) */
const NOT_GOOGLE = new Set(['other']);

let db;

async function as(who, fn) {
  return db.transaction(async (tx) => {
    if (who === 'anon') {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role anon');
    } else {
      const provider = NOT_GOOGLE.has(who) ? 'email' : 'google';
      const claims = { sub: U[who], role: 'authenticated', app_metadata: { provider, providers: [provider] },
        user_metadata: META[who] ?? {} };
      if (EMAIL[who]) claims.email = EMAIL[who];
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.query('set local role authenticated');
    }
    return fn(tx);
  });
}
const one = async (tx, sql, p = []) => (await tx.query(sql, p)).rows[0];
const val = async (tx, sql, p = []) => Object.values((await one(tx, sql, p)) ?? {})[0];
const sys = async (sql, p = []) => (await db.query(sql, p)).rows;
async function fails(who, sql, p, re) {
  await assert.rejects(as(who, (tx) => tx.query(sql, p)), (e) => { assert.match(String(e.message), re); return true; });
}
const claim = (who, code) => as(who, (tx) => val(tx, 'select public.claim_event_code($1)', [code]));
const role = (who) => as(who, (tx) => val(tx, 'select public.my_role()'));
const make = (code, label, hours = 4, max = 120) => as('admin', (tx) =>
  val(tx, 'select public.admin_create_event_code($1, $2, $3, $4)', [code, label, hours, max]));
const usedOf = async (id) => (await sys('select used from public.event_codes where id = $1', [id]))[0].used;

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const m of BEFORE) await db.exec(m);
  await db.exec(EVENT);
  await db.exec(EVENT); // 두 번 올려도 괜찮다
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  // 집주인·가족·이메일을 아는 손님, 그리고 나중에 명단에서 뺄 손님
  await db.exec(`insert into public.roster (display_name, role, email) values
    ('집주인', 'admin', '${EMAIL.admin}'), ('가족', 'family', '${EMAIL.family}'),
    ('손님', 'guest', '${EMAIL.guest}'), ('뺄 손님', 'guest', '${EMAIL.removed}');`);
  for (const w of ['admin', 'family', 'guest', 'removed']) await as(w, (tx) => tx.query('select public.sync_my_roster()'));
  await db.query(`update public.roster set revoked_at = now() where email = $1`, [EMAIL.removed]);
});

test('0001만 있는 DB에도 올라가고, 0001이 없으면 아무것도 바꾸지 않고 멈춘다', async () => {
  const bare = new PGlite();
  await bare.exec(STUB);
  await assert.rejects(bare.exec(EVENT), /0018_needs_0001/);
  assert.equal((await bare.query(`select to_regclass('public.event_codes') as t`)).rows[0].t, null);
  await bare.exec(BEFORE[0]);
  await bare.exec(EVENT);
  const cols = await bare.query(`select count(*)::int as n from pg_catalog.pg_attribute
    where attrelid = 'public.roster'::regclass and attname = 'event_code_id' and not attisdropped`);
  assert.equal(cols.rows[0].n, 1);
  await bare.close();
});

test('집주인만 행사 코드를 만들고, DB에는 해시만 남는다', async () => {
  await fails('guest', `select public.admin_create_event_code('EVNT-AAAA-2222', '발표')`, [], /admin_only/);
  await fails('v1', `select public.admin_create_event_code('EVNT-AAAA-2222', '발표')`, [], /admin_only/);
  await fails('anon', `select public.admin_create_event_code('EVNT-AAAA-2222', '발표')`, [], /permission denied/);
  await fails('admin', `select public.admin_create_event_code('SHORT-123', '발표')`, [], /code_too_short/);

  const id = await make('EVNT-AAAA-2222', '  11월\t\t발표  ', 3, 2);
  const row = (await sys('select * from public.event_codes where id = $1', [id]))[0];
  assert.match(row.code_hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(row).includes('EVNT'), false, '원문은 어디에도 없다');
  assert.equal(row.label, '11월 발표', '빈칸은 하나로, 앞뒤는 자른다');
  assert.equal(row.max_uses, 2);
  assert.equal(row.used, 0);
  assert.equal(row.created_by, U.admin);
  const hours = (row.expires_at - row.created_at) / 3_600_000;
  assert.ok(Math.abs(hours - 3) < 0.01, `세 시간 뒤에 끝난다(${hours})`);
});

test('시간·인원·이름표는 정해진 범위로 맞춘다', async () => {
  const cases = [
    { code: 'CLMP-AAAA-0001', label: null, hours: 0, max: 0, want: { label: '행사', hours: 1, max: 1 } },
    { code: 'CLMP-AAAA-0002', label: '   ', hours: 1000, max: 100000, want: { label: '행사', hours: 168, max: 500 } },
    { code: 'CLMP-AAAA-0003', label: '가'.repeat(60), hours: null, max: null, want: { label: '가'.repeat(40), hours: 4, max: 120 } },
    { code: 'CLMP-AAAA-0004', label: '줄\n바꿈‮ 숨은 글자', hours: 2, max: 30, want: { label: '줄 바꿈 숨은 글자', hours: 2, max: 30 } },
  ];
  for (const c of cases) {
    const id = await make(c.code, c.label, c.hours, c.max);
    const row = (await sys('select * from public.event_codes where id = $1', [id]))[0];
    assert.equal(row.label, c.want.label, c.code);
    assert.equal(row.max_uses, c.want.max, c.code);
    assert.ok(Math.abs((row.expires_at - row.created_at) / 3_600_000 - c.want.hours) < 0.01, c.code);
  }
  await sys(`update public.event_codes set revoked_at = now() where label in ('행사', $1, '줄 바꿈 숨은 글자')`, ['가'.repeat(40)]);
});

test('사람별 초대 링크나 이미 있는 행사 코드와 같은 원문으로는 만들지 않는다', async () => {
  const rid = (await sys(`insert into public.roster (display_name) values ('초대받은 분') returning id`))[0].id;
  await as('admin', (tx) => tx.query(`select public.admin_create_invite($1, 'INVT-AAAA-3333')`, [rid]));
  await fails('admin', `select public.admin_create_event_code('invt aaaa 3333', '겹침')`, [], /code_taken/);
  await fails('admin', `select public.admin_create_event_code('evnt-aaaa-2222', '겹침')`, [], /code_taken/);
  // 사람별 초대 확인(claim_invite)은 행사 코드를 받지 않는다: 사이트가 invalid를 보고 행사 코드로 넘어간다
  assert.equal(await as('v7', (tx) => val(tx, `select public.claim_invite('EVNT-AAAA-2222')`)), 'invalid');
  assert.equal(await role('v7'), 'visitor');
});

test('명단에 없는 구글 계정이 들어오면 손님 줄이 생기고 그 계정에 이어진다', async () => {
  const id = (await sys(`select id from public.event_codes where label = '11월 발표'`))[0].id;
  assert.equal(await role('v1'), 'visitor');
  assert.equal(await claim('v1', 'evnt aaaa 2222'), 'guest', '하이픈·빈칸·대소문자는 상관없다');
  assert.equal(await role('v1'), 'guest');
  const row = (await sys('select * from public.roster where claimed_by = $1', [U.v1]))[0];
  assert.equal(row.display_name, '첫째 청중', '구글 계정 이름(full_name)을 다듬어 쓴다');
  assert.equal(row.role, 'guest');
  assert.equal(row.email, EMAIL.v1);
  assert.equal(row.event_code_id, id);
  assert.ok(row.claimed_at);
  assert.equal(await usedOf(id), 1);
  const me = await as('v1', (tx) => val(tx, 'select public.whoami()'));
  assert.equal(me.name, '첫째 청중');
  assert.equal(me.role, 'guest');

  // 다시 찍어도(새 휴대폰, 새로 고침) 그대로 성공하고 자리를 더 쓰지 않는다
  assert.equal(await claim('v1', 'EVNT-AAAA-2222'), 'guest');
  assert.equal(await usedOf(id), 1);
  // 들어온 손님은 손님이 할 수 있는 일을 한다
  const rec = await as('v1', (tx) => one(tx, `insert into public.records (room_slug, body) values ('pine', '발표 잘 들었어요') returning author_name`));
  assert.equal(rec.author_name, '첫째 청중');
});

test('이미 들어온 사람은 코드 상태와 상관없이 그대로 성공하고, 자리를 쓰지 않는다', async () => {
  const id = (await sys(`select id from public.event_codes where label = '11월 발표'`))[0].id;
  assert.equal(await claim('guest', 'EVNT-AAAA-2222'), 'guest');
  assert.equal(await claim('family', 'EVNT-AAAA-2222'), 'family');
  assert.equal(await claim('admin', 'EVNT-AAAA-2222'), 'admin');
  assert.equal(await claim('guest', 'NOPE-NOPE-NOPE'), 'guest', '없는 코드여도 이미 들어와 있으면 그대로');
  assert.equal(await usedOf(id), 1);
  const n = await sys(`select count(*)::int as n from public.roster where claimed_by in ($1, $2, $3)`, [U.guest, U.family, U.admin]);
  assert.equal(n[0].n, 3, '새 줄을 만들지 않는다');
});

test('다 차면 새 사람은 full, 이미 들어온 사람은 그대로', async () => {
  const id = (await sys(`select id from public.event_codes where label = '11월 발표'`))[0].id;
  assert.equal(await claim('v2', 'EVNT-AAAA-2222'), 'guest');
  assert.equal((await sys('select display_name from public.roster where claimed_by = $1', [U.v2]))[0].display_name,
    'Second Person', 'full_name이 없으면 name');
  assert.equal(await usedOf(id), 2);
  assert.equal(await claim('v3', 'EVNT-AAAA-2222'), 'full');
  assert.equal(await role('v3'), 'visitor');
  assert.equal(await claim('v1', 'EVNT-AAAA-2222'), 'guest');
  assert.equal(await usedOf(id), 2);
  assert.deepEqual(await as('anon', (tx) => val(tx, `select public.event_code_peek('EVNT-AAAA-2222')`)),
    { label: '11월 발표', state: 'full' });
});

test('끝난 코드와 거둔 코드는 ended, 없는 코드는 invalid', async () => {
  const late = await make('LATE-AAAA-4444', '끝난 행사', 1, 50);
  await sys(`update public.event_codes set created_at = now() - interval '3 hours', expires_at = now() - interval '1 second'
    where id = $1`, [late]);
  assert.equal(await claim('v3', 'LATE-AAAA-4444'), 'ended');
  const gone = await make('GONE-AAAA-5555', '거둔 행사', 4, 50);
  await as('admin', (tx) => tx.query('select public.admin_revoke_event_code($1)', [gone]));
  assert.equal(await claim('v3', 'GONE-AAAA-5555'), 'ended');
  assert.equal(await claim('v3', 'WXYZ-WXYZ-WXYZ'), 'invalid');
  assert.equal(await claim('v3', ''), 'invalid');
  assert.equal(await claim('v3', null), 'invalid');
  assert.equal(await role('v3'), 'visitor');
  assert.equal(await usedOf(late), 0);
  assert.equal((await as('anon', (tx) => val(tx, `select public.event_code_peek('late-aaaa-4444')`))).state, 'ended');
  assert.equal((await as('anon', (tx) => val(tx, `select public.event_code_peek('GONEAAAA5555')`))).state, 'ended');
});

test('명단에서 뺀 계정은 행사 코드로 다시 들어오지 못한다', async () => {
  const open = await make('OPEN-AAAA-6666', '열린 행사', 4, 100);
  assert.equal(await role('removed'), 'visitor');
  assert.equal(await claim('removed', 'OPEN-AAAA-6666'), 'blocked');
  assert.equal(await role('removed'), 'visitor');
  assert.equal(await usedOf(open), 0);
});

test('로그인하지 않으면 부를 수 없고, 구글이 아닌 로그인은 login_required', async () => {
  await fails('anon', `select public.claim_event_code('OPEN-AAAA-6666')`, [], /permission denied/);
  assert.equal(await claim('other', 'OPEN-AAAA-6666'), 'login_required');
  assert.equal(await role('other'), 'visitor');
});

test('이름: 구글 이름 → 이메일 앞부분 → 손님', async () => {
  assert.equal(await claim('noname', 'OPEN-AAAA-6666'), 'guest');
  assert.equal((await sys('select display_name, email from public.roster where claimed_by = $1', [U.noname]))[0].display_name, 'noname');
  assert.equal(await claim('nomail', 'OPEN-AAAA-6666'), 'guest');
  const row = (await sys('select display_name, email from public.roster where claimed_by = $1', [U.nomail]))[0];
  assert.deepEqual(row, { display_name: '손님', email: null });
  const name = async (a, b, c) => (await sys('select public.event_join_name($1, $2, $3) as n', [a, b, c]))[0].n;
  assert.equal(await name('​‮  김 철수⁦ ', null, 'x@y.test'), '김 철수', '보이지 않는 글자·여러 빈칸은 빈칸 하나');
  assert.equal(await name('　전각　빈칸　', null, null), '전각 빈칸');
  assert.equal(await name('나‍너', null, null), '나‍너', '글자 잇기 표시는 그대로');
  assert.equal(await name('\t\n', '  ', 'first.last@example.test'), 'first.last');
  assert.equal(await name('ㄱ'.repeat(41) + ' 끝', null, null), 'ㄱ'.repeat(40));
  assert.equal(await name('가'.repeat(39) + ' 나', null, null), '가'.repeat(39), '자른 끝의 빈칸은 지운다');
  assert.equal(await name(null, null, null), '손님');
  assert.equal(await name('', '', '@example.test'), '손님');
});

test('이메일로 명단에 넣었다가 로그인 전에 뺀 사람은 행사 코드로 다시 들어오지 못한다(집주인의 결정을 되돌리지 않게)', async () => {
  await sys(`insert into public.roster (display_name, email, revoked_at) values ('예전 줄', 'twin@example.test', now())`);
  const open = (await sys(`select id, used from public.event_codes where label = '열린 행사'`))[0];
  assert.equal(await claim('emailtwin', 'OPEN-AAAA-6666'), 'blocked');
  assert.equal((await sys('select count(*)::int as n from public.roster where claimed_by = $1', [U.emailtwin]))[0].n, 0, '줄이 생기지 않는다');
  assert.equal(await usedOf(open.id), open.used, '자리를 쓰지 않는다');
});

test('입장 요청을 남긴 뒤 행사 코드로 들어오면 그 요청은 승인으로 닫힌다', async () => {
  assert.equal(await as('v5', (tx) => val(tx, `select public.request_entry('다섯째', '발표 듣고 왔어요')`)), 'pending');
  assert.equal(await claim('v5', 'OPEN-AAAA-6666'), 'guest');
  const req = (await sys('select status, roster_id, resolved_at from public.entry_requests where user_id = $1', [U.v5]))[0];
  const rid = (await sys('select id from public.roster where claimed_by = $1', [U.v5]))[0].id;
  assert.equal(req.status, 'approved');
  assert.equal(req.roster_id, rid);
  assert.ok(req.resolved_at);
  const me = await as('v5', (tx) => val(tx, 'select public.whoami()'));
  assert.equal(me.pending_request, false);
});

test('한 계정은 한 줄: 다른 코드로 다시 찍어도 그대로 성공하고 그 코드의 자리를 쓰지 않는다', async () => {
  const c = await make('CCCC-AAAA-7777', '다른 행사', 4, 10);
  assert.equal(await claim('v7', 'CCCC-AAAA-7777'), 'guest');
  const open = (await sys(`select id, used from public.event_codes where label = '열린 행사'`))[0];
  assert.equal(await claim('v7', 'OPEN-AAAA-6666'), 'guest');
  assert.equal(await usedOf(open.id), open.used);
  const rows = await sys('select event_code_id from public.roster where claimed_by = $1', [U.v7]);
  assert.deepEqual(rows.map((r) => r.event_code_id), [c]);
});

test('거두기: 코드만이면 들어온 사람은 그대로, 사람까지면 그 코드로 들어온 손님 줄만', async () => {
  const a = await make('REVK-AAAA-8888', '거둘 행사', 4, 10);
  await make('KEEP-AAAA-9999', '남길 행사', 4, 10); // 거두지 않는 다른 행사
  for (const w of ['v3', 'v4']) assert.equal(await claim(w, 'REVK-AAAA-8888'), 'guest');
  assert.equal(await claim('v6', 'KEEP-AAAA-9999'), 'guest');
  // 집주인이 그중 한 사람을 가족으로 올렸다면 그 줄은 거두지 않는다
  await sys(`update public.roster set role = 'family' where claimed_by = $1`, [U.v4]);

  await fails('guest', 'select public.admin_revoke_event_code($1)', [a], /admin_only/);
  await fails('v3', 'select public.admin_revoke_event_code($1, true)', [a], /admin_only/);
  assert.deepEqual(await as('admin', (tx) => val(tx, 'select public.admin_revoke_event_code($1)', [a])), { found: true, people: 0 });
  assert.equal(await role('v3'), 'guest', '코드만 거두면 들어온 사람은 그대로');
  assert.equal(await claim('v2', 'REVK-AAAA-8888'), 'guest', '이미 들어온 사람(다른 코드)은 그대로');
  assert.equal(await claim('v8', 'REVK-AAAA-8888'), 'ended', '거둔 코드로는 새 사람이 들어오지 못한다');
  const revokedAt = (await sys('select revoked_at from public.event_codes where id = $1', [a]))[0].revoked_at;

  assert.deepEqual(await as('admin', (tx) => val(tx, 'select public.admin_revoke_event_code($1, true)', [a])), { found: true, people: 1 });
  assert.equal(await role('v3'), 'visitor', '그 코드로 들어온 손님은 다음 요청부터 visitor');
  assert.equal(await role('v4'), 'family', '가족으로 올린 줄은 그대로');
  assert.equal(await role('v6'), 'guest', '다른 코드로 들어온 사람은 그대로');
  assert.equal(await claim('v3', 'KEEP-AAAA-9999'), 'blocked', '거둔 사람은 다른 행사 코드로도 다시 들어오지 못한다');
  assert.deepEqual((await sys('select revoked_at from public.event_codes where id = $1', [a]))[0].revoked_at, revokedAt,
    '이미 거둔 코드의 거둔 때는 그대로');
  assert.deepEqual(await as('admin', (tx) => val(tx, 'select public.admin_revoke_event_code($1, true)', [a])), { found: true, people: 0 });
  assert.deepEqual(await as('admin', (tx) => val(tx, `select public.admin_revoke_event_code('00000000-0000-4000-8000-0000000000ff')`)),
    { found: false, people: 0 });
});

test('목록은 집주인만: 들어온 수와 지금 손님으로 남은 수', async () => {
  await fails('guest', 'select * from public.admin_event_codes()', [], /admin_only/);
  await fails('anon', 'select * from public.admin_event_codes()', [], /permission denied/);
  const rows = await as('admin', (tx) => tx.query('select * from public.admin_event_codes()'));
  const byLabel = Object.fromEntries(rows.rows.map((r) => [r.label, r]));
  assert.equal(byLabel['거둘 행사'].used, 2);
  assert.equal(byLabel['거둘 행사'].active, 0, '가족으로 올린 한 명은 손님이 아니라 세지 않는다(거두기 단추의 수와 같게)');
  assert.ok(byLabel['거둘 행사'].revoked_at);
  assert.equal(byLabel['11월 발표'].used, 2);
  assert.equal(byLabel['11월 발표'].active, 2);
  assert.equal(byLabel['11월 발표'].max_uses, 2);
  assert.deepEqual(Object.keys(rows.rows[0]).sort(),
    ['active', 'created_at', 'expires_at', 'id', 'label', 'max_uses', 'revoked_at', 'used'], '해시는 내보내지 않는다');
  const created = rows.rows.map((r) => r.created_at.getTime());
  assert.deepEqual(created, [...created].sort((x, y) => y - x), '새것부터');
  assert.equal((await as('admin', (tx) => tx.query('select * from public.admin_event_codes(2)'))).rows.length, 2);
});

test('표는 집주인만 읽고, 누구도 함수 밖에서 고치지 못한다', async () => {
  assert.equal((await as('guest', (tx) => tx.query('select * from public.event_codes'))).rows.length, 0);
  assert.ok((await as('admin', (tx) => tx.query('select * from public.event_codes'))).rows.length > 0);
  await fails('anon', 'select * from public.event_codes', [], /permission denied/);
  await fails('admin', `insert into public.event_codes (code_hash, label, expires_at, max_uses)
    values (repeat('a', 64), '몰래', now() + interval '1 hour', 10)`, [], /permission denied/);
  await fails('admin', `update public.event_codes set max_uses = 500`, [], /permission denied/);
  await fails('guest', `update public.event_codes set used = 0`, [], /permission denied/);
  // 손님은 명단의 행사 코드 칸을 고칠 수 없다(명단은 집주인만)
  await as('v1', (tx) => tx.query(`update public.roster set event_code_id = null where claimed_by = $1`, [U.v1]));
  assert.ok((await sys('select event_code_id from public.roster where claimed_by = $1', [U.v1]))[0].event_code_id);
  // 안에서만 쓰는 도우미는 바깥에서 부를 수 없다
  await fails('guest', `select public.event_tidy('x')`, [], /permission denied/);
  await fails('guest', `select public.event_join_name('x', null, null)`, [], /permission denied/);
});

test('엿보기: 행사 코드면 이름표와 상태, 사람별 초대·없는 코드는 아무것도 알려 주지 않는다', async () => {
  assert.deepEqual(await as('anon', (tx) => val(tx, `select public.event_code_peek('keep aaaa 9999')`)),
    { label: '남길 행사', state: 'open' });
  assert.equal(await as('anon', (tx) => val(tx, `select public.event_code_peek('INVT-AAAA-3333')`)), null);
  assert.equal(await as('anon', (tx) => val(tx, `select public.event_code_peek('NOPE-NOPE-NOPE')`)), null);
  assert.equal(await as('anon', (tx) => val(tx, `select public.event_code_peek(null)`)), null);
  assert.deepEqual((await as('v1', (tx) => val(tx, `select public.event_code_peek('KEEPAAAA9999')`))).state, 'open');
});

test('실행권: 들어오기·관리는 로그인한 사람만, 엿보기는 누구나', async () => {
  const can = async (r, fn) => (await sys(`select has_function_privilege($1, $2, 'execute') as ok`, [r, fn]))[0].ok;
  for (const fn of ['public.claim_event_code(text)', 'public.admin_create_event_code(text, text, int, int)',
    'public.admin_revoke_event_code(uuid, boolean)', 'public.admin_event_codes(int)']) {
    assert.equal(await can('anon', fn), false, fn);
    assert.equal(await can('authenticated', fn), true, fn);
  }
  assert.equal(await can('anon', 'public.event_code_peek(text)'), true);
  for (const fn of ['public.event_tidy(text)', 'public.event_join_name(text, text, text)']) {
    assert.equal(await can('anon', fn), false, fn);
    assert.equal(await can('authenticated', fn), false, fn);
  }
});

test('명단 행사 태그(관리 화면): 집주인은 명단 줄의 코드와 그 이름표를 이어 읽고(이미 들어온 줄도), 손님·가족·명단 밖 계정은 둘 다 읽지 못한다', async () => {
  // 승인함 명단의 태그는 줄의 event_code_id와 그 코드의 이름표(label)만으로 정한다(src/lib/roster-tags.ts): 새 칸이 없다
  const q = `select r.display_name, e.label from public.roster r join public.event_codes e on e.id = r.event_code_id order by r.display_name`;
  const rows = (await as('admin', (tx) => tx.query(q))).rows;
  assert.ok(rows.some((r) => r.display_name === '첫째 청중' && r.label === '11월 발표'), JSON.stringify(rows));
  assert.ok(rows.every((r) => typeof r.label === 'string' && r.label.length > 0));
  // 태그는 관리 화면에만: 손님·가족·명단 밖 계정은 명단 줄도 코드 이름표도 읽지 못한다
  for (const who of ['guest', 'family', 'v1', 'noname']) {
    assert.equal((await as(who, (tx) => tx.query(q))).rows.length, 0, who);
    assert.equal((await as(who, (tx) => tx.query('select event_code_id from public.roster'))).rows.length, 0, `${who}: 명단`);
    assert.equal((await as(who, (tx) => tx.query('select label from public.event_codes'))).rows.length, 0, `${who}: 이름표`);
  }
  await fails('anon', q, [], /permission denied/);
  // 들어온 손님 자신의 정보(whoami)에도 코드 이름표는 실리지 않는다
  const me = await as('v1', (tx) => val(tx, 'select public.whoami()'));
  assert.equal(me.role, 'guest');
  assert.equal(JSON.stringify(me).includes('11월 발표'), false);
});
