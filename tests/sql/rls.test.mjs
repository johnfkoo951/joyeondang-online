// 0001_init.sql을 실제 Postgres(PGlite, WASM)에 올려 명단·기록 권한을 검사한다.
// Supabase의 auth 스키마는 흉내만 낸다: auth.uid()/auth.jwt()는 request.jwt.claims 설정값을 읽는다.
// 맨 끝의 사진 캐릭터 하루 한도(역할마다, 0020)는 0019까지 올린 DB를 따로 만들어 본다.
// 그 뒤의 이력·작업대·보관·3D 요청(0021)은 0020까지 올린 DB를 또 따로 만들어 본다.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createModelsTurn, processModel } from '../../worker/avatar/models.mjs';
import { wrapSupabase } from '../../worker/avatar/supabase.mjs';
import { serviceGlb } from '../unit/helpers/glb-fixture.ts';

const MIGRATION = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');

const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const U = {
  admin: '00000000-0000-4000-8000-00000000000a',
  family: '00000000-0000-4000-8000-00000000000f',
  guest: '00000000-0000-4000-8000-000000000001',
  guest2: '00000000-0000-4000-8000-000000000002',
  visitor: '00000000-0000-4000-8000-000000000003',
  invitee: '00000000-0000-4000-8000-000000000004',
  late: '00000000-0000-4000-8000-000000000005',
};
const EMAIL = {
  admin: 'admin@example.com', family: 'family@example.com', guest: 'guest@example.com',
  guest2: 'guest2@example.com', visitor: 'stranger@example.com', invitee: 'invitee@example.com',
  late: 'late@example.com',
};

let db;

/** 구글로 로그인한 사람의 JWT 흉내 */
const claimsOf = (sub, email) => ({ sub, email, role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] } });

/** 한 트랜잭션 안에서 역할과 JWT를 바꿔 끼운다. claims: null(anon) | JWT 내용 */
async function inTx(d, claims, fn) {
  return d.transaction(async (tx) => {
    if (claims === null) {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role anon');
    } else {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.query('set local role authenticated');
    }
    return fn(tx);
  });
}

async function as(who, fn) {
  // who: 'anon' | 사용자 키
  return inTx(db, who === 'anon' ? null : claimsOf(U[who], EMAIL[who]), fn);
}
const one = async (tx, sql, params = []) => (await tx.query(sql, params)).rows[0];
const val = async (tx, sql, params = []) => Object.values((await one(tx, sql, params)) ?? {})[0];

// 기대한 오류: 트랜잭션 전체가 그 메시지로 실패해야 한다(실패한 트랜잭션 안에서 더 묻지 않는다).
async function fails(who, sql, params, pattern) {
  await assert.rejects(as(who, (tx) => tx.query(sql, params)), (err) => {
    assert.match(String(err.message), pattern);
    return true;
  });
}

before(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(MIGRATION);
  for (const [k, id] of Object.entries(U)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  }
  // 운영자가 SQL 편집기에서 하는 첫 등록(관리자 한 명, 가족 한 명, 이메일을 아는 손님 둘)
  await db.exec(`
    insert into public.roster (display_name, role, email) values
      ('관리자', 'admin', '${EMAIL.admin}'),
      ('가족', 'family', '${EMAIL.family}'),
      ('손님하나', 'guest', '${EMAIL.guest}'),
      ('손님둘', 'guest', '${EMAIL.guest2}');
    insert into public.roster (display_name, role, slot) values ('초대받은분', 'guest', '16');
  `);
});

test('anon은 public이고 테이블에 직접 닿지 못한다', async () => {
  assert.equal(await as('anon', (tx) => val(tx, 'select public.my_role()')), 'public');
  await fails('anon', 'select * from public.roster', [], /permission denied/);
  await fails('anon', `insert into public.records (room_slug, body) values ('pine', 'x')`, [], /permission denied/);
});

test('구글 이메일이 명단과 같으면 로그인 직후 그 줄에 묶인다', async () => {
  for (const who of ['admin', 'family', 'guest', 'guest2']) {
    const role = await as(who, (tx) => val(tx, 'select public.sync_my_roster()'));
    assert.equal(role, { admin: 'admin', family: 'family', guest: 'guest', guest2: 'guest' }[who]);
  }
  const claimed = await db.query('select count(*)::int as n from public.roster where claimed_by is not null');
  assert.equal(claimed.rows[0].n, 4);
});

test('명단 밖 구글 계정은 visitor이고 쓰지 못한다', async () => {
  assert.equal(await as('visitor', (tx) => val(tx, 'select public.sync_my_roster()')), 'visitor');
  await fails('visitor', `insert into public.records (room_slug, body) values ('pine', '안녕')`, [], /row-level security|not_on_roster/);
  await as('visitor', async (tx) => {
    assert.equal(await val(tx, `select public.request_entry('낯선 사람', '요한 친구예요')`), 'pending');
    assert.equal(await val(tx, `select public.request_entry('낯선 사람', '또')`), 'pending');
    const me = await val(tx, 'select public.whoami()');
    assert.equal(me.pending_request, true);
    assert.equal(me.role, 'visitor');
  });
  const n = await db.query(`select count(*)::int as n from public.entry_requests where status = 'pending'`);
  assert.equal(n.rows[0].n, 1, '대기 중인 요청은 한 사람당 하나');
});

test('손님 기록: 상태·글쓴이는 서버가 정하고, 닫힌 방엔 못 쓴다', async () => {
  await as('guest', async (tx) => {
    const r = await one(tx, `insert into public.records
      (room_slug, body, status, author_name, author_id, requested_visibility)
      values ('pine', '  다음엔 같이 재즈 들어요  ', 'approved', '사칭', $1, 'guests')
      returning status, author_name, body, author_id::text`, [U.admin]);
    assert.equal(r.status, 'submitted');
    assert.equal(r.author_name, '손님하나');
    assert.equal(r.body, '다음엔 같이 재즈 들어요');
    assert.equal(r.author_id, U.guest, '다른 사람 이름으로 쓸 수 없다');

    const p1 = await one(tx, `insert into public.records (room_slug, body, requested_visibility)
      values ('pine', '소나무가 멋져요', 'public') returning requested_visibility`);
    assert.equal(p1.requested_visibility, 'guests', '공개 동의 없이 인터넷 범위를 요청하면 손님 범위로 낮춘다');

    const p2 = await one(tx, `insert into public.records (room_slug, body, requested_visibility, consent_public)
      values ('pine', '인터넷에 걸어도 좋아요', 'public', true) returning requested_visibility`);
    assert.equal(p2.requested_visibility, 'public');

    const ph = await one(tx, `insert into public.records (room_slug, body, media_path, requested_visibility, consent_public)
      values ('pine', '사진 한 장', 'x/y.jpg', 'public', true) returning visibility`);
    assert.equal(ph.visibility, 'family', '사진이 붙은 기록은 가족 범위까지만');

    await tx.query(`update public.records set status = 'approved'`);
    assert.equal(await val(tx, `select count(*)::int from public.records where status = 'approved'`), 0, '손님은 승인할 수 없다');
  });
  await fails('guest', `insert into public.records (room_slug, body) values ('attic', '다락!')`, [], /room_closed/);
  await fails('guest', `insert into public.records (room_slug, body) values ('pine', 'a' || chr(7) || 'b')`, [], /check constraint/);
  await fails('guest', `insert into public.records (room_slug, body) values ('nowhere', '없는 방')`, [], /room_closed|foreign key/);
});

test('보이는 범위: 승인 전에는 쓴 사람과 가족만, 승인 뒤 고른 범위까지', async () => {
  const guestSees = await as('guest2', (tx) => tx.query(`select * from public.room_records('pine')`));
  assert.equal(guestSees.rows.length, 0, '다른 손님의 승인 전 기록은 안 보인다');

  const mine = await as('guest', (tx) => tx.query(`select * from public.room_records('pine')`));
  assert.equal(mine.rows.length, 4);
  assert.ok(mine.rows.every((r) => r.mine === true));

  const fam = await as('family', (tx) => tx.query(`select * from public.room_records('pine')`));
  assert.equal(fam.rows.length, 4, '가족은 승인 전 기록도 본다');

  const anonBefore = await as('anon', (tx) => tx.query(`select * from public.room_records('pine')`));
  assert.equal(anonBefore.rows.length, 0);

  const ids = await db.query(`select id, body from public.records where room_slug = 'pine'`);
  const byBody = Object.fromEntries(ids.rows.map((r) => [r.body, r.id]));
  await fails('guest', `select public.moderate_record($1, 'approve')`, [byBody['다음엔 같이 재즈 들어요']], /admin_only/);
  await as('admin', async (tx) => {
    assert.equal(await val(tx, `select public.moderate_record($1, 'approve', 'public')`, [byBody['다음엔 같이 재즈 들어요']]), 'wider_than_requested');
    assert.equal(await val(tx, `select public.moderate_record($1, 'approve')`, [byBody['다음엔 같이 재즈 들어요']]), 'ok');
    assert.equal(await val(tx, `select public.moderate_record($1, 'approve')`, [byBody['인터넷에 걸어도 좋아요']]), 'ok');
    assert.equal(await val(tx, `select public.moderate_record($1, 'approve', 'guests')`, [byBody['사진 한 장']]), 'wider_than_requested');
  });

  const guest2After = await as('guest2', (tx) => tx.query(`select body from public.room_records('pine') order by body`));
  assert.deepEqual(guest2After.rows.map((r) => r.body), ['다음엔 같이 재즈 들어요', '인터넷에 걸어도 좋아요']);
  const anonAfter = await as('anon', (tx) => tx.query(`select * from public.room_records('pine')`));
  assert.deepEqual(anonAfter.rows.map((r) => r.body), ['인터넷에 걸어도 좋아요']);
  assert.equal(Object.keys(anonAfter.rows[0]).includes('author_id'), false, '글쓴이 id는 내보내지 않는다');
});

test('나만 보기 기록은 가족·관리자에게도 보이지 않는다', async () => {
  await as('guest', (tx) => tx.query(`insert into public.records (room_slug, body, requested_visibility) values ('living', '혼잣말', 'self')`));
  const adminRows = await as('admin', (tx) => tx.query(`select body from public.room_records('living')`));
  assert.equal(adminRows.rows.some((r) => r.body === '혼잣말'), false);
  const adminTable = await as('admin', (tx) => tx.query(`select body from public.records where body = '혼잣말'`));
  assert.equal(adminTable.rows.length, 0);
  const own = await as('guest', (tx) => tx.query(`select body from public.my_records() where body = '혼잣말'`));
  assert.equal(own.rows.length, 1);
});

test('초대 링크: 한 번 묶이면 다른 계정은 못 쓴다', async () => {
  const rid = (await db.query(`select id from public.roster where display_name = '초대받은분'`)).rows[0].id;
  await fails('guest', `select public.admin_create_invite($1, 'ABCD-EFGH-JK')`, [rid], /admin_only/);
  await fails('admin', `select public.admin_create_invite($1, 'SHORT')`, [rid], /code_too_short/);
  await as('admin', (tx) => tx.query(`select public.admin_create_invite($1, 'ABCD-EFGH-JK')`, [rid]));
  const stored = await db.query('select code_hash from public.invites');
  assert.ok(stored.rows.every((r) => /^[0-9a-f]{64}$/.test(r.code_hash)), '코드 원문은 저장하지 않는다');
  assert.equal(await as('invitee', (tx) => val(tx, `select public.claim_invite('abcd efgh jk')`)), 'guest');
  assert.equal(await as('invitee', (tx) => val(tx, 'select public.my_role()')), 'guest');
  assert.equal(await as('invitee', (tx) => val(tx, `select public.claim_invite('ABCD-EFGH-JK')`)), 'guest', '같은 사람이 다시 눌러도 그대로');
  assert.equal(await as('late', (tx) => val(tx, `select public.claim_invite('ABCDEFGHJK')`)), 'invalid');
  assert.equal(await as('late', (tx) => val(tx, `select public.claim_invite('WRONG-CODE-1')`)), 'invalid');
  const row = (await db.query(`select email from public.roster where id = $1`, [rid])).rows[0];
  assert.equal(row.email, EMAIL.invitee, '처음 묶일 때 구글 이메일을 명단에 적어 둔다');
});

test('입장 요청 승인 → 새 명단 줄과 연결', async () => {
  const req = (await db.query(`select id from public.entry_requests where status = 'pending'`)).rows[0];
  await fails('guest', `select public.admin_resolve_request($1, 'approve')`, [req.id], /admin_only/);
  await as('admin', async (tx) => {
    assert.equal(await val(tx, `select public.admin_resolve_request($1, 'approve', null, '요한 친구', 'admin', 'online')`, [req.id]), 'approved');
  });
  assert.equal(await as('visitor', (tx) => val(tx, 'select public.my_role()')), 'guest', '요청 승인으로는 관리자가 되지 않는다');
});

test('명단에서 빼면 바로 visitor로 돌아간다', async () => {
  await as('admin', (tx) => tx.query(`update public.roster set revoked_at = now() where email = $1`, [EMAIL.guest2]));
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.my_role()')), 'visitor');
  const rows = await as('guest2', (tx) => tx.query(`select * from public.room_records('pine')`));
  assert.ok(rows.rows.length > 0 && rows.rows.every((r) => r.visibility === 'public'));
});

test('관리자가 아니면 명단을 고치지 못한다', async () => {
  await as('guest', (tx) => tx.query(`update public.roster set role = 'admin' where email = $1`, [EMAIL.guest]));
  assert.equal(await as('guest', (tx) => val(tx, 'select public.my_role()')), 'guest');
  await fails('guest', `insert into public.roster (display_name, role) values ('나', 'admin')`, [], /row-level security/);
});

test('명단 이름 바꾸기: 관리자만 바꾸고, 별명이 없는 사람은 바뀐 이름으로 보인다. 빈 이름은 DB가 막는다', async () => {
  const rid = (await db.query(`select id from public.roster where email = $1`, [EMAIL.guest])).rows[0].id;
  const before = (await as('guest', (tx) => val(tx, 'select public.whoami()'))).name;
  await as('guest', (tx) => tx.query(`update public.roster set display_name = '스스로바꿈' where id = $1`, [rid]));
  assert.equal((await db.query(`select display_name from public.roster where id = $1`, [rid])).rows[0].display_name !== '스스로바꿈', true, '손님은 명단 이름을 못 바꾼다');
  await as('admin', (tx) => tx.query(`update public.roster set display_name = '새이름' where id = $1`, [rid]));
  const nick = (await db.query(`select nickname from public.profiles where user_id = (select claimed_by from public.roster where id = $1)`, [rid])).rows[0]?.nickname;
  if (!nick) assert.equal((await as('guest', (tx) => val(tx, 'select public.whoami()'))).name, '새이름', '별명이 없으면 바뀐 명단 이름으로 보인다');
  assert.equal((await as('guest', (tx) => val(tx, 'select public.whoami()'))).roster_name, '새이름');
  await fails('admin', `update public.roster set display_name = '   ' where id = $1`, [rid], /check constraint|violates/);
  await as('admin', (tx) => tx.query(`update public.roster set display_name = $2 where id = $1`, [rid, before ?? '손님']));
});

test('도장은 한 번만, 손님만', async () => {
  assert.equal(await as('guest', (tx) => val(tx, `select public.earn_room_stamp('pine')`)), true);
  assert.equal(await as('guest', (tx) => val(tx, `select public.earn_room_stamp('pine')`)), false);
  await fails('anon', `select public.earn_room_stamp('pine')`, [], /permission denied/);
  assert.equal(await as('guest', (tx) => val(tx, `select public.earn_room_stamp('attic')`)), false);
});

test('철회 번호로 거두면 행이 지워진다', async () => {
  const id = await as('guest', async (tx) => {
    const r = await one(tx, `insert into public.records (room_slug, body) values ('living', '거둘 글') returning id`);
    assert.equal(await val(tx, `select public.attach_receipt($1, 'RCPT-1234-5678')`, [r.id]), true);
    assert.equal(await val(tx, `select public.attach_receipt($1, 'OTHER-0000-0000')`, [r.id]), false, '번호는 한 번만 붙는다');
    return r.id;
  });
  assert.equal(await as('anon', (tx) => val(tx, `select public.withdraw_by_receipt('rcpt12345678')`)), true);
  const left = await db.query('select count(*)::int as n from public.records where id = $1', [id]);
  assert.equal(left.rows[0].n, 0);
});

test('석등은 누구나 숫자만 본다', async () => {
  const l = await as('anon', (tx) => val(tx, 'select public.lantern()'));
  assert.ok(l.lit >= 1);
  assert.equal(typeof l.today, 'number');
});

// ───────────────────────────── 사진 캐릭터 하루 한도: 역할마다(0020)
// 위 시험의 db(0001만)와 섞지 않는다. 0001부터 0019까지(실시간 흉내가 필요한 0017만 빼고) 올린 위에 0020을 두 번 올린 DB를 따로 쓴다.
// 손님 하루 10장·시도 22번, 가족 20장·42번, 관리자는 장수·시도 수·모두의 상한에 제한이 없다. 칸 셋과 하루의 경계는 그대로다.
// 한도는 세션의 명단 역할로만 정해진다: avatar_begin을 직접 불러 넘기는 값이나 JWT의 다른 칸으로는 늘지 않는다.
// 모두의 셈은 상한을 보는 역할(손님·가족)이 줄에 세운 것만 센다: 관리자가 만든 것과 줄에 서기 전에 지운 것은 세지 않는다.
const readMigration = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const AVATAR_CHAIN = ['0001_init.sql', '0002_rooms_play.sql', '0003_avatars.sql', '0004_shots.sql', '0006_profile_look.sql',
  '0008_rooms_more.sql', '0010_qr_quiet.sql', '0012_note_photos.sql', '0014_guards.sql', '0015_avatar_views.sql',
  '0016_avatar_models.sql', '0018_event_codes.sql', '0019_avatar_slots.sql'];
const ROLE_CAPS = readMigration('0020_avatar_role_caps.sql');

// 위 흉내에 더한다: Supabase처럼 함수 실행권이 기본으로 열려 있고(마이그레이션이 거둬야 닫힌다), 비밀 키 역할과 저장소 표가 있다
const AVATAR_STUB = `${AUTH_STUB}
grant usage on schema auth to service_role;
grant execute on function auth.jwt(), auth.uid() to service_role;
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

/** 마이그레이션을 차례로 올린 새 DB. withCaps가 참이면 0020을 두 번 올린다(여러 번 올려도 된다) */
async function avatarDb(chain = AVATAR_CHAIN, withCaps = true) {
  const d = new PGlite();
  await d.exec(AVATAR_STUB);
  for (const f of chain) await d.exec(readMigration(f));
  if (withCaps) {
    await d.exec(ROLE_CAPS);
    await d.exec(ROLE_CAPS);
  }
  return d;
}

// ───────────────────────────── 걷기 사진을 집주인이 지우기(0022)
// 0001부터 0019까지(실시간 흉내가 필요한 0017만 빼고) 올린 위에 0022를 두 번 올린 DB를 따로 쓴다(다른 묶음과 섞지 않는다).
// 0022는 0020·0021에 기대지 않아 그 둘은 올리지 않는다.
// 집주인만 사람마다·행사 초대 코드마다 지운다. 가족·손님·명단 밖 계정·로그인 안 한 사람은 남의 사진을 못 지운다.
// 지운 줄의 경로는 같은 트랜잭션에서 버릴 목록에, 그 사람 폴더는 훑을 차례에 오른다. 비밀 키(service_role)만 그 둘을 읽어
// 저장소를 정리한다: 목록의 파일을 지우고, 폴더를 나열해 표 줄 없이 남은 파일(올리다 끊긴 것)도 목록에 올려 지운다.
// 계정을 지워 줄이 cascade로 사라져도 같은 목록과 폴더 훑기에 오른다. 본인이 갤러리에서 지우는 길은 거치지 않는다.
// 집주인도 남의 사진 줄·저장소 파일·버릴 목록·훑을 차례를 읽지 못하고, 장수 함수는 장수와 합계만 준다(경로·장소·때 없음).
// 행사마다는 그 코드로 들어온 손님 줄(명단에서 뺀 줄 포함)만이다. 가족으로 올린 줄, 다른 행사, 사람별 초대는 그대로다.
const SHOTS_ADMIN = readMigration('0022_shots_admin_delete.sql');

describe('걷기 사진을 집주인이 지우기(0022)', () => {
  const SU = {
    admin: '00000000-0000-4000-8000-0000000003a1',
    family: '00000000-0000-4000-8000-0000000003f1',
    plain: '00000000-0000-4000-8000-000000000311', // 사람별로 들어온 손님(행사 코드 없음)
    ev1: '00000000-0000-4000-8000-000000000321', // 행사 하나로 들어온 손님
    ev2: '00000000-0000-4000-8000-000000000322', // 행사 하나로 들어왔다가 명단에서 뺀 손님
    ev3: '00000000-0000-4000-8000-000000000323', // 행사 하나로 들어왔다가 가족으로 올린 줄
    ev4: '00000000-0000-4000-8000-000000000324', // 행사 하나로 들어왔지만 사진 줄이 없는 손님(올리다 끊긴 파일만 남는다)
    other: '00000000-0000-4000-8000-000000000331', // 행사 둘로 들어온 손님
    stray: '00000000-0000-4000-8000-000000000351', // 명단 밖 계정(올리다 끊긴 파일이 남는다)
    leaver: '00000000-0000-4000-8000-000000000361', // 계정을 지우는 손님
    visitor: '00000000-0000-4000-8000-000000000399', // 명단 밖 계정(로그인만 했다)
  };
  const SEMAIL = Object.fromEntries(Object.keys(SU).map((k) => [k, `${k}@shots.test`]));
  const SHOTS = { admin: 1, family: 2, plain: 3, ev1: 2, ev2: 2, ev3: 1, ev4: 0, other: 2, stray: 2, leaver: 2, visitor: 2 };
  const SHOT_PEOPLE = Object.values(SHOTS).filter((n) => n > 0).length;
  const SHOT_TOTAL = Object.values(SHOTS).reduce((a, b) => a + b, 0);
  const EV = {};
  let sdb;

  const asS = (who, fn) => inTx(sdb, who === 'anon' ? null : claimsOf(SU[who], SEMAIL[who]), fn);
  /** 비밀 키(service_role)로: 서버가 버릴 목록을 비우고 폴더를 훑는 길 */
  const asService = (fn) => sdb.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', '', true)`);
    await tx.query('set local role service_role');
    return fn(tx);
  });
  async function failsS(who, sql, params, pattern) {
    await assert.rejects(asS(who, (tx) => tx.query(sql, params)), (err) => {
      assert.match(String(err.message), pattern);
      return true;
    });
  }
  const pathOf = (who, k) => `${SU[who]}/m${k}-0a1b2c3d.jpg`;
  /** 표에 적지 못하고 저장소에만 남은 파일(올린 뒤 표에 적기 전에 끊긴 것)의 경로 */
  const orphanOf = (who, k) => `${SU[who]}/o${k}-0a1b2c3d.jpg`;
  /** who가 n장 찍는다: 사이트처럼 저장소에 올리고 표에 적는다(본인 세션으로) */
  async function snap(who, n) {
    await asS(who, async (tx) => {
      for (let k = 0; k < n; k++) {
        await tx.query(`insert into storage.objects (bucket_id, name) values ('shots', $1)`, [pathOf(who, k)]);
        await tx.query(`insert into public.shots (path, w, h, place) values ($1, 1280, 720, '집 안')`, [pathOf(who, k)]);
      }
    });
  }
  /** who의 저장소에만 파일을 올린다(표 줄 없음, 본인 세션으로) */
  const strand = (who, names) => asS(who, async (tx) => {
    for (const name of names) await tx.query(`insert into storage.objects (bucket_id, name) values ('shots', $1)`, [name]);
  });
  const rowsOf = async (who) => (await sdb.query('select count(*)::int as n from public.shots where user_id = $1', [SU[who]])).rows[0].n;
  const namesOf = async (who) => (await sdb.query(`select name from storage.objects
    where bucket_id = 'shots' and starts_with(name, $1)`, [`${SU[who]}/`])).rows.map((r) => r.name).sort();
  const filesOf = async (who) => (await namesOf(who)).length;
  const trash = async () => (await sdb.query('select path from public.shots_trash order by path')).rows.map((r) => r.path);
  const sweeps = async () => (await sdb.query('select user_id from public.shots_sweep order by user_id')).rows.map((r) => r.user_id);
  const counts = async () => Object.fromEntries(await Promise.all(Object.keys(SU).map(async (k) => [k, await rowsOf(k)])));
  const totals = () => asS('admin', (tx) => val(tx, 'select public.admin_shot_totals()'));
  /**
   * 서버의 저장소 정리(src/lib/shots-admin-rules.ts cleanStorage)를 비밀 키로 흉내 낸다: 버릴 목록을 비우고(목록 → 저장소에서
   * 지우기 → 목록에서 빼기), 차례가 된 폴더를 나열해 넘긴 뒤(young에 든 경로는 막 올라온 파일로), 다시 버릴 목록을 비운다.
   * 저장소 나열은 폴더 바로 아래만 보인다(하위 폴더 안의 파일은 나오지 않는다).
   */
  const cleanup = ({ young = [] } = {}) => asService(async (tx) => {
    const drainOnce = async () => {
      const listed = (await tx.query('select path from public.shots_trash_list(500)')).rows.map((r) => r.path);
      await tx.query(`delete from storage.objects where bucket_id = 'shots' and name = any($1::text[])`, [listed]);
      await tx.query('select public.shots_trash_done($1::text[])', [listed]);
      return listed;
    };
    const removed = await drainOnce();
    const swept = (await tx.query('select user_id from public.shots_sweep_list(100)')).rows.map((r) => r.user_id);
    for (const uid of swept) {
      const names = (await tx.query(`select name from storage.objects where bucket_id = 'shots' and starts_with(name, $1)`,
        [`${uid}/`])).rows.map((r) => r.name).filter((n) => !n.slice(uid.length + 1).includes('/'));
      const old = names.filter((n) => !young.includes(n));
      await tx.query('select public.shots_sweep_done($1, $2::text[], $3::text[], false)', [uid, old, names.filter((n) => young.includes(n))]);
    }
    removed.push(...(await drainOnce()));
    return { removed: removed.sort(), swept: swept.sort() };
  });

  before(async () => {
    sdb = await avatarDb(AVATAR_CHAIN, false);
    await sdb.exec(SHOTS_ADMIN);
    await sdb.exec(SHOTS_ADMIN);
    for (const [k, id] of Object.entries(SU)) await sdb.query('insert into auth.users (id, email) values ($1, $2)', [id, SEMAIL[k]]);
    await sdb.exec(`insert into public.roster (display_name, role, email) values
      ('집주인', 'admin', '${SEMAIL.admin}'), ('가족', 'family', '${SEMAIL.family}'), ('사람별 손님', 'guest', '${SEMAIL.plain}'),
      ('떠나는 손님', 'guest', '${SEMAIL.leaver}');`);
    for (const who of ['admin', 'family', 'plain', 'leaver']) await asS(who, (tx) => tx.query('select public.sync_my_roster()'));
    // 행사 초대 코드 둘(0018). 청중은 그 코드로 들어온다: 명단에 손님 줄이 생기고 event_code_id가 남는다
    EV.one = await asS('admin', (tx) => val(tx, `select public.admin_create_event_code('AAAA-BBBB-CCCC', '행사 하나', 4, 50)`));
    EV.two = await asS('admin', (tx) => val(tx, `select public.admin_create_event_code('DDDD-EEEE-FFFF', '행사 둘', 4, 50)`));
    for (const who of ['ev1', 'ev2', 'ev3', 'ev4']) assert.equal(await asS(who, (tx) => val(tx, `select public.claim_event_code('aaaabbbbcccc')`)), 'guest');
    assert.equal(await asS('other', (tx) => val(tx, `select public.claim_event_code('DDDDEEEEFFFF')`)), 'guest');
    for (const [who, n] of Object.entries(SHOTS)) await snap(who, n);
    // 행사 손님 하나는 명단에서 빼고, 하나는 가족으로 올린다(관리 화면에 단추는 없지만 명단은 바꿀 수 있다)
    await asS('admin', (tx) => tx.query(`update public.roster set revoked_at = now() where claimed_by = $1`, [SU.ev2]));
    await asS('admin', (tx) => tx.query(`update public.roster set role = 'family' where claimed_by = $1`, [SU.ev3]));
  });

  test('장수: 집주인만 받고, 사람마다 장수만 온다(경로·장소·찍은 때는 없다). 행사마다 합계와 모두의 수는 DB가 센다', async () => {
    const rows = await asS('admin', (tx) => tx.query('select * from public.admin_shot_counts()'));
    assert.deepEqual(rows.fields.map((f) => f.name), ['user_id', 'name', 'role', 'removed', 'event_code_id', 'event_label', 'shots']);
    const by = Object.fromEntries(rows.rows.map((r) => [r.user_id, r]));
    const pick = (who) => {
      const r = by[SU[who]];
      return r && [r.name, r.role, r.removed, r.event_code_id, r.event_label, r.shots];
    };
    assert.equal(rows.rows.length, SHOT_PEOPLE, '사진을 가진 사람마다 한 줄(사진 줄이 없는 사람은 없다)');
    assert.deepEqual(pick('admin'), ['집주인', 'admin', false, null, null, 1]);
    assert.deepEqual(pick('family'), ['가족', 'family', false, null, null, 2]);
    assert.deepEqual(pick('plain'), ['사람별 손님', 'guest', false, null, null, 3]);
    assert.deepEqual(pick('ev1'), ['ev1', 'guest', false, EV.one, '행사 하나', 2]);
    assert.deepEqual(pick('ev2'), ['ev2', 'guest', true, EV.one, '행사 하나', 2], '명단에서 뺀 줄도 보인다');
    assert.deepEqual(pick('ev3'), ['ev3', 'family', false, EV.one, '행사 하나', 1]);
    assert.equal(pick('ev4'), undefined);
    assert.deepEqual(pick('other'), ['other', 'guest', false, EV.two, '행사 둘', 2]);
    assert.deepEqual(pick('leaver'), ['떠나는 손님', 'guest', false, null, null, 2]);
    assert.deepEqual(pick('visitor'), [null, null, false, null, null, 2], '명단 밖 계정은 이름 없이 장수만');
    // 행사마다 합계: 행사마다 지우기와 같은 범위(가족으로 올린 줄은 빼고, 명단에서 뺀 줄은 넣는다). 사진이 많은 행사부터
    const events = await asS('admin', (tx) => tx.query('select * from public.admin_shot_events()'));
    assert.deepEqual(events.fields.map((f) => f.name), ['id', 'label', 'people', 'shots']);
    assert.deepEqual(events.rows, [
      { id: EV.one, label: '행사 하나', people: 2, shots: SHOTS.ev1 + SHOTS.ev2 },
      { id: EV.two, label: '행사 둘', people: 1, shots: SHOTS.other },
    ]);
    assert.deepEqual(await totals(), { people: SHOT_PEOPLE, shots: SHOT_TOTAL, files: 0, folders: 0, waiting: 0 });
    for (const who of ['family', 'plain', 'ev1', 'visitor']) {
      for (const fn of ['select * from public.admin_shot_counts()', 'select * from public.admin_shot_events()',
        'select public.admin_shot_totals()']) {
        await failsS(who, fn, [], /admin_only/);
      }
    }
    for (const fn of ['admin_shot_counts()', 'admin_shot_events()', 'admin_shot_totals()']) {
      await failsS('anon', `select * from public.${fn}`, [], /permission denied/);
    }
  });

  test('집주인도 남의 사진 줄·저장소 파일·버릴 목록·훑을 차례를 읽지 못한다', async () => {
    await asS('admin', async (tx) => {
      assert.deepEqual((await tx.query('select path from public.shots')).rows.map((r) => r.path), [pathOf('admin', 0)], '표는 내 줄만');
      assert.equal(await val(tx, `select count(*)::int from storage.objects where bucket_id = 'shots'`), 1, '저장소도 내 폴더만');
    });
    for (const who of ['admin', 'family']) {
      await failsS(who, 'select * from public.shots_trash', [], /permission denied/);
      await failsS(who, 'select * from public.shots_sweep', [], /permission denied/);
    }
    await failsS('admin', 'select * from public.shots_trash_list(10)', [], /permission denied/);
    await failsS('admin', `select public.shots_trash_done(array['x'])`, [], /permission denied/);
    await failsS('admin', 'select * from public.shots_sweep_list(10)', [], /permission denied/);
    await failsS('admin', `select public.shots_sweep_done($1, array['x'], array[]::text[], false)`, [SU.family], /permission denied/);
    await failsS('admin', `select public.shots_path_ok($1, 'x')`, [SU.admin], /permission denied/);
    await failsS('admin', `select public.shots_sweep_add(array[$1::uuid])`, [SU.family], /permission denied/);
    // 버릴 목록과 훑을 차례에 직접 넣지도 못한다(비밀 키가 그 경로의 파일을 지우므로 남의 파일을 지우게 하지 못하게)
    for (const who of ['admin', 'plain', 'visitor']) {
      await failsS(who, 'insert into public.shots_trash (path) values ($1)', [pathOf('family', 0)], /permission denied/);
      await failsS(who, 'insert into public.shots_sweep (user_id) values ($1)', [SU.family], /permission denied/);
    }
    const can = async (role, sig) => (await sdb.query(`select has_function_privilege($1, $2, 'execute') as v`, [role, `public.${sig}`])).rows[0].v;
    const SIGS = ['admin_shot_counts()', 'admin_shot_events()', 'admin_shot_totals()', 'admin_shots_forget_user(uuid)',
      'admin_shots_forget_event(uuid)', 'shots_trash_list(int)', 'shots_trash_done(text[])', 'shots_sweep_list(int)',
      'shots_sweep_done(uuid, text[], text[], boolean)', 'shots_path_ok(uuid, text)', 'shots_sweep_add(uuid[])', 'shots_to_trash()'];
    const of = (role) => Promise.all(SIGS.map((s) => can(role, s)));
    assert.deepEqual(await of('authenticated'), [true, true, true, true, true, false, false, false, false, false, false, false]);
    assert.deepEqual(await of('anon'), SIGS.map(() => false));
    assert.deepEqual((await of('service_role')).slice(5, 9), [true, true, true, true], '버릴 목록과 폴더 훑기는 비밀 키만');
  });

  test('가족·손님·명단 밖 계정·로그인 안 한 사람은 남의 사진을 못 지운다(표에서 직접도, 함수로도)', async () => {
    const before = await counts();
    for (const who of ['family', 'plain', 'ev1', 'visitor']) {
      await failsS(who, 'select public.admin_shots_forget_user($1)', [SU.other], /admin_only/);
      await failsS(who, 'select public.admin_shots_forget_event($1)', [EV.two], /admin_only/);
      // 본인 정책뿐이라 남의 줄·파일은 0줄 지워진다
      await asS(who, async (tx) => {
        assert.equal((await tx.query('delete from public.shots where user_id <> $1', [SU[who]])).affectedRows, 0, who);
        assert.equal((await tx.query(`delete from storage.objects where bucket_id = 'shots' and not starts_with(name, $1)`,
          [`${SU[who]}/`])).affectedRows, 0, who);
      });
    }
    await failsS('anon', 'select public.admin_shots_forget_user($1)', [SU.other], /permission denied/);
    await failsS('anon', 'select public.admin_shots_forget_event($1)', [EV.two], /permission denied/);
    assert.deepEqual(await counts(), before, '아무 줄도 지워지지 않았다');
    assert.equal(await filesOf('other'), SHOTS.other);
    assert.deepEqual([await trash(), await sweeps()], [[], []]);
  });

  test('사람마다: 표 줄을 지우며 경로를 버릴 목록에, 그 사람 폴더를 훑을 차례에 올리고, 비밀 키가 저장소에서 지운다', async () => {
    const n = await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_user($1)', [SU.plain]));
    assert.equal(n, SHOTS.plain);
    assert.equal(await rowsOf('plain'), 0);
    assert.equal(await asS('plain', (tx) => val(tx, 'select count(*)::int from public.shots')), 0, '그 사람의 갤러리에서도 사라진다');
    assert.deepEqual(await trash(), [0, 1, 2].map((k) => pathOf('plain', k)));
    assert.deepEqual(await sweeps(), [SU.plain]);
    assert.deepEqual(await totals(), { people: SHOT_PEOPLE - 1, shots: SHOT_TOTAL - SHOTS.plain, files: 3, folders: 1, waiting: 0 },
      '집주인은 남은 수만 본다');
    assert.equal(await filesOf('plain'), SHOTS.plain, '파일은 서버가 지우기 전까지 남아 있다');
    assert.deepEqual(await cleanup(), { removed: [0, 1, 2].map((k) => pathOf('plain', k)), swept: [SU.plain] });
    assert.equal(await filesOf('plain'), 0, '파일도 지워졌다');
    assert.deepEqual([await trash(), await sweeps()], [[], []]);
    assert.deepEqual(await totals(), { people: SHOT_PEOPLE - 1, shots: SHOT_TOTAL - SHOTS.plain, files: 0, folders: 0, waiting: 0 });
    // 다른 사람은 그대로, 다시 불러도·없는 사람이어도 0(폴더는 다시 훑어 볼 뿐이다)
    assert.deepEqual([await rowsOf('family'), await rowsOf('ev1'), await rowsOf('visitor')], [2, 2, 2]);
    assert.equal(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_user($1)', [SU.plain])), 0);
    const nobody = '00000000-0000-4000-8000-00000000ffff';
    assert.equal(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_user($1)', [nobody])), 0);
    assert.deepEqual(await cleanup(), { removed: [], swept: [SU.plain, nobody] });
    // 집주인 자신의 사진도 같은 길로 지운다
    assert.equal(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_user($1)', [SU.admin])), 1);
    assert.deepEqual(await cleanup(), { removed: [pathOf('admin', 0)], swept: [SU.admin] });
    assert.equal(await filesOf('admin'), 0);
  });

  test('표 줄 없이 저장소에만 남은 파일(올리다 끊긴 것)도 폴더를 훑어 지운다. 사이트 모양만, 지금의 사진과 막 올라온 파일은 둔다', async () => {
    // 올리다 끊긴 파일 둘(하나는 오래됐고 하나는 막 올라왔다)과 사이트가 만들지 않는 모양 둘(하위 폴더, jpg 아님)
    const odd = [`${SU.stray}/sub/x.jpg`, `${SU.stray}/y.png`];
    await strand('stray', [orphanOf('stray', 0), orphanOf('stray', 1), ...odd]);
    assert.equal(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_user($1)', [SU.stray])), SHOTS.stray);
    assert.deepEqual(await trash(), [0, 1].map((k) => pathOf('stray', k)), '표 줄의 경로는 바로 오른다');
    // 집주인이 지운 뒤 서버가 훑기 전에 새로 찍은 사진(지금의 사진이라 남는다)
    const fresh = `${SU.stray}/n0-0a1b2c3d.jpg`;
    await asS('stray', async (tx) => {
      await tx.query(`insert into storage.objects (bucket_id, name) values ('shots', $1)`, [fresh]);
      await tx.query(`insert into public.shots (path, w, h) values ($1, 10, 10)`, [fresh]);
    });
    assert.deepEqual(await cleanup({ young: [orphanOf('stray', 1)] }),
      { removed: [pathOf('stray', 0), pathOf('stray', 1), orphanOf('stray', 0)].sort(), swept: [SU.stray] });
    assert.deepEqual(await namesOf('stray'), [fresh, orphanOf('stray', 1), ...odd].sort());
    // 막 올라온 파일에 표 줄이 없으니(지금 올리는 중일 수 있다) 그 폴더는 10분 뒤에 다시 훑는다
    assert.deepEqual(await sweeps(), [SU.stray]);
    assert.deepEqual((await asService((tx) => tx.query('select * from public.shots_sweep_list(100)'))).rows, [], '아직 차례가 아니다');
    const t = await totals();
    assert.deepEqual([t.files, t.folders, t.waiting], [0, 1, 1]);
    await sdb.query(`update public.shots_sweep set not_before = now() - interval '1 second' where user_id = $1`, [SU.stray]);
    assert.deepEqual(await cleanup(), { removed: [orphanOf('stray', 1)], swept: [SU.stray] }, '10분이 지나 다시 훑으면 지운다');
    assert.deepEqual(await namesOf('stray'), [fresh, ...odd].sort(), '사이트가 만들지 않는 모양은 비밀 키로 지우지 않는다');
    assert.deepEqual([await trash(), await sweeps(), await rowsOf('stray')], [[], [], 1]);
  });

  test('행사마다: 그 코드로 들어온 손님만(명단에서 뺀 줄 포함), 그 손님들 폴더는 모두 훑는다(사진 줄이 없는 사람 포함). 가족으로 올린 줄, 다른 행사, 사람별 초대는 그대로', async () => {
    await strand('ev4', [orphanOf('ev4', 0)]);
    const r = await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_event($1)', [EV.one]));
    assert.deepEqual(r, { found: true, people: 2, shots: SHOTS.ev1 + SHOTS.ev2 });
    assert.deepEqual([await rowsOf('ev1'), await rowsOf('ev2')], [0, 0]);
    assert.equal(await rowsOf('ev3'), SHOTS.ev3, '가족으로 올린 줄은 건드리지 않는다');
    assert.equal(await rowsOf('other'), SHOTS.other, '다른 행사는 그대로');
    assert.equal(await rowsOf('family'), SHOTS.family);
    assert.equal(await rowsOf('visitor'), SHOTS.visitor);
    assert.equal((await trash()).length, SHOTS.ev1 + SHOTS.ev2);
    assert.deepEqual(await sweeps(), [SU.ev1, SU.ev2, SU.ev4], '가족으로 올린 줄(ev3)의 폴더는 훑지 않는다');
    const evPaths = [...[0, 1].map((k) => pathOf('ev1', k)), ...[0, 1].map((k) => pathOf('ev2', k))];
    assert.deepEqual(await cleanup(), { removed: [...evPaths, orphanOf('ev4', 0)].sort(), swept: [SU.ev1, SU.ev2, SU.ev4] });
    assert.deepEqual([await filesOf('ev1'), await filesOf('ev2'), await filesOf('ev3'), await filesOf('ev4')], [0, 0, SHOTS.ev3, 0]);
    // 다시 불러도 지울 것이 없고, 없는 코드는 found가 false(아무것도 오르지 않는다)
    assert.deepEqual(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_event($1)', [EV.one])),
      { found: true, people: 0, shots: 0 });
    assert.deepEqual(await cleanup(), { removed: [], swept: [SU.ev1, SU.ev2, SU.ev4] });
    assert.deepEqual(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_event($1)', ['00000000-0000-4000-8000-00000000eeee'])),
      { found: false, people: 0, shots: 0 });
    assert.deepEqual([await trash(), await sweeps()], [[], []]);
    assert.deepEqual(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_event($1)', [EV.two])),
      { found: true, people: 1, shots: SHOTS.other });
    assert.deepEqual(await cleanup(), { removed: [0, 1].map((k) => pathOf('other', k)), swept: [SU.other] });
    assert.equal(await filesOf('other'), 0);
  });

  test('손님이 자기 사진을 지우는 길(0004)은 그대로이고 버릴 목록과 훑을 차례를 거치지 않는다', async () => {
    await asS('visitor', async (tx) => {
      await tx.query(`delete from storage.objects where bucket_id = 'shots' and name = $1`, [pathOf('visitor', 1)]);
      assert.equal((await tx.query('delete from public.shots where path = $1', [pathOf('visitor', 1)])).affectedRows, 1);
    });
    assert.deepEqual([await trash(), await sweeps()], [[], []]);
    assert.deepEqual([await rowsOf('visitor'), await filesOf('visitor')], [1, 1]);
  });

  test('계정을 지우면(cascade) 사진 경로가 버릴 목록에, 폴더가 훑을 차례에 올라 파일이 남지 않는다(본인 세션에서 지워도)', async () => {
    await strand('leaver', [orphanOf('leaver', 0)]);
    assert.equal(await filesOf('leaver'), SHOTS.leaver + 1);
    await sdb.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claimsOf(SU.leaver, SEMAIL.leaver))]);
      await tx.query('delete from auth.users where id = $1', [SU.leaver]);
    });
    assert.equal(await rowsOf('leaver'), 0, '표 줄은 cascade로 사라진다');
    assert.deepEqual(await trash(), [0, 1].map((k) => pathOf('leaver', k)));
    assert.deepEqual(await sweeps(), [SU.leaver]);
    assert.deepEqual(await cleanup(), { removed: [pathOf('leaver', 0), pathOf('leaver', 1), orphanOf('leaver', 0)].sort(), swept: [SU.leaver] });
    assert.equal(await filesOf('leaver'), 0);
    assert.deepEqual([await trash(), await sweeps()], [[], []]);
    // 집주인 함수가 아닌 곳(SQL 편집기 등)에서 줄을 지워도 경로가 오른다. 계정은 그대로라 폴더는 훑지 않는다
    await snap('admin', 1);
    await sdb.query('delete from public.shots where user_id = $1', [SU.admin]);
    assert.deepEqual([await trash(), await sweeps()], [[pathOf('admin', 0)], []]);
    assert.deepEqual(await cleanup(), { removed: [pathOf('admin', 0)], swept: [] });
    assert.equal(await filesOf('admin'), 0);
  });

  test('다른 모양의 경로(남의 폴더로 넘어가는 .., 하위 폴더, jpg 아님)는 표에서만 지우고 버릴 목록에 올리지 않는다. 폴더 훑기도 그 사람 폴더의 사이트 모양만', async () => {
    const crafted = [`${SU.visitor}/../${SU.family}/m0-0a1b2c3d.jpg`, `${SU.visitor}/sub/x.jpg`, `${SU.visitor}/y.png`];
    // 넣기 정책은 앞머리(내 id/)만 본다: 손으로 넣은 줄은 들어간다
    await asS('visitor', async (tx) => {
      for (const p of crafted) await tx.query(`insert into public.shots (path, w, h) values ($1, 10, 10)`, [p]);
    });
    assert.equal(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_user($1)', [SU.visitor])), 1 + crafted.length);
    assert.deepEqual(await trash(), [pathOf('visitor', 0)], '사이트가 만드는 모양만 오른다');
    assert.deepEqual(await cleanup(), { removed: [pathOf('visitor', 0)], swept: [SU.visitor] });
    assert.equal(await filesOf('family'), SHOTS.family, '남의 폴더 파일은 그대로');
    // 폴더 훑기에 남의 폴더 경로나 다른 모양을 넘겨도 오르지 않는다(넘긴 쪽이 비밀 키여도)
    await sdb.query('insert into public.shots_sweep (user_id) values ($1)', [SU.visitor]);
    const queued = await asService((tx) => val(tx, 'select public.shots_sweep_done($1, $2::text[], $3::text[], false)',
      [SU.visitor, [pathOf('family', 0), ...crafted, `${SU.visitor}/${'a'.repeat(121)}.jpg`], []]));
    assert.equal(queued, 0);
    assert.deepEqual([await trash(), await sweeps()], [[], []], '훑은 폴더는 차례에서 빠진다');
    const ok = async (user, p) => (await sdb.query('select public.shots_path_ok($1, $2) as v', [user, p])).rows[0].v;
    assert.equal(await ok(SU.visitor, pathOf('visitor', 3)), true);
    assert.equal(await ok(SU.family, pathOf('visitor', 3)), false, '다른 사람의 폴더');
    assert.equal(await ok(SU.visitor, `${SU.visitor}/${'a'.repeat(121)}.jpg`), false, '이름이 너무 길다');
    assert.equal(await ok(SU.visitor, null), false);
  });

  test('버릴 목록에 있는 경로가 그사이 표에 다시 들어오면 돌려주지 않고 목록에서 뺀다(그 사람의 사진이다)', async () => {
    assert.equal(await asS('admin', (tx) => val(tx, 'select public.admin_shots_forget_user($1)', [SU.family])), SHOTS.family);
    assert.equal((await trash()).length, 2);
    await asS('family', (tx) => tx.query(`insert into public.shots (path, w, h) values ($1, 10, 10)`, [pathOf('family', 1)]));
    assert.deepEqual(await cleanup(), { removed: [pathOf('family', 0)], swept: [SU.family] }, '폴더를 훑어도 표 줄이 있는 파일은 오르지 않는다');
    assert.deepEqual([await trash(), await sweeps()], [[], []]);
    assert.equal(await filesOf('family'), 1, '다시 들어온 사진의 파일은 남는다');
    // 폴더 훑기가 표 줄 있는 파일을 오래된 것으로 넘겨도 버릴 목록에 오르지 않는다(지금의 사진이다)
    assert.equal(await asService((tx) => val(tx, 'select public.shots_sweep_done($1, $2::text[], $3::text[], false)',
      [SU.family, [pathOf('family', 1)], []])), 0);
    assert.deepEqual(await trash(), []);
  });

  test('0004·0018이 없는 DB에는 올라가지 않고 아무것도 바꾸지 않는다', async () => {
    const cases = [[1, /0022_needs_0001_0004/], [AVATAR_CHAIN.indexOf('0018_event_codes.sql'), /0022_needs_0018/]];
    for (const [n, re] of cases) {
      const d = await avatarDb(AVATAR_CHAIN.slice(0, n), false);
      await assert.rejects(d.exec(SHOTS_ADMIN), re);
      const r = (await d.query(`select to_regclass('public.shots_trash') is null as no_trash,
        to_regclass('public.shots_sweep') is null as no_sweep, to_regprocedure('public.admin_shot_counts()') is null as no_counts`)).rows[0];
      assert.deepEqual(r, { no_trash: true, no_sweep: true, no_counts: true }, String(re));
      await d.close();
    }
  });
});

describe('걷기 사진: 사진을 가진 사람이 500명을 넘을 때(0022)', () => {
  // 사람 줄은 많은 순으로 500줄까지다. 행사마다 합계, 모두의 수, 행사마다 지우기는 DB가 모두를 센다
  // (화면이 잘린 줄을 더해 실제보다 적게 말하지 않게). 한 번에 비밀 키가 읽는 수도 정해진 만큼까지다.
  const ADMIN = '00000000-0000-4000-8000-0000000005a1';
  const SOLO = '00000000-0000-4000-8000-000000000511'; // 행사 밖에서 2장 찍은 사람
  const N = 520;

  test('사람 줄은 500줄까지, 행사 합계·모두의 수·행사마다 지우기는 모두를 센다', async () => {
    const d = await avatarDb(AVATAR_CHAIN, false);
    try {
      await d.exec(SHOTS_ADMIN);
      const asA = (fn) => inTx(d, claimsOf(ADMIN, 'admin@big.test'), fn);
      await d.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [ADMIN, 'admin@big.test', SOLO, 'solo@big.test']);
      await d.exec(`insert into public.roster (display_name, role, email) values ('집주인', 'admin', 'admin@big.test')`);
      await asA((tx) => tx.query('select public.sync_my_roster()'));
      const ev = await asA((tx) => val(tx, `select public.admin_create_event_code('GGGG-HHHH-JJJJ', '큰 행사', 4, 500)`));
      // 행사 손님 N명이 한 장씩. 명단 줄은 행사 코드로 들어온 모양 그대로 적는다(손님 줄, event_code_id)
      const people = `select i, ('00000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid as id from generate_series(1, ${N}) i`;
      await d.query(`insert into auth.users (id, email) select g.id, 'g' || g.i || '@big.test' from (${people}) g`);
      await d.query(`insert into public.roster (display_name, role, claimed_by, claimed_at, event_code_id)
        select 'g' || g.i, 'guest', g.id, now(), $1 from (${people}) g`, [ev]);
      await d.query(`insert into storage.objects (bucket_id, name) select 'shots', g.id::text || '/b0-0a1b2c3d.jpg' from (${people}) g`);
      await d.query(`insert into public.shots (user_id, path, w, h) select g.id, g.id::text || '/b0-0a1b2c3d.jpg', 10, 10 from (${people}) g`);
      for (const k of [0, 1]) {
        await d.query(`insert into public.shots (user_id, path, w, h) values ($1, $2, 10, 10)`, [SOLO, `${SOLO}/s${k}-0a1b2c3d.jpg`]);
      }
      const rows = (await asA((tx) => tx.query('select * from public.admin_shot_counts()'))).rows;
      assert.equal(rows.length, 500, '사람 줄은 많은 순으로 500줄까지');
      assert.equal(rows[0].user_id, SOLO, '많은 순');
      assert.deepEqual(await asA((tx) => val(tx, 'select public.admin_shot_totals()')),
        { people: N + 1, shots: N + 2, files: 0, folders: 0, waiting: 0 }, '모두의 수는 잘리지 않는다');
      assert.deepEqual((await asA((tx) => tx.query('select * from public.admin_shot_events()'))).rows,
        [{ id: ev, label: '큰 행사', people: N, shots: N }], '행사 합계는 잘리지 않는다');
      assert.deepEqual(await asA((tx) => val(tx, 'select public.admin_shots_forget_event($1)', [ev])), { found: true, people: N, shots: N });
      assert.deepEqual(await asA((tx) => val(tx, 'select public.admin_shot_totals()')),
        { people: 1, shots: 2, files: N, folders: N, waiting: 0 }, '남은 정리도 모두를 센다');
      const service = (fn) => d.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', '', true)`);
        await tx.query('set local role service_role');
        return fn(tx);
      });
      assert.equal((await service((tx) => tx.query('select * from public.shots_trash_list(100000)'))).rows.length, 500);
      assert.equal((await service((tx) => tx.query('select * from public.shots_sweep_list(100000)'))).rows.length, 100);
    } finally {
      await d.close();
    }
  });
});

describe('사진 캐릭터 하루 한도: 역할마다(0020)', () => {
  const AU = {
    admin: '00000000-0000-4000-8000-0000000000a1',
    family: '00000000-0000-4000-8000-0000000000f1',
    family2: '00000000-0000-4000-8000-0000000000f2',
    guest: '00000000-0000-4000-8000-000000000011',
    guest2: '00000000-0000-4000-8000-000000000012',
    guest3: '00000000-0000-4000-8000-000000000013',
    guest4: '00000000-0000-4000-8000-000000000014',
    visitor: '00000000-0000-4000-8000-000000000019',
  };
  /** 명단 줄(visitor는 명단 밖) */
  const AROLE = { admin: 'admin', family: 'family', family2: 'family', guest: 'guest', guest2: 'guest', guest3: 'guest', guest4: 'guest' };
  const AEMAIL = Object.fromEntries(Object.keys(AU).map((k) => [k, `${k}@example.test`]));
  let adb;

  /** who로 한 트랜잭션. extra는 JWT에 덧붙이는 칸(지어낸 역할 주장 시험) */
  const asA = (who, fn, extra = {}) => inTx(adb, who === 'anon' ? null : { ...claimsOf(AU[who], AEMAIL[who]), ...extra }, fn);
  async function failsA(who, sql, params, pattern) {
    await assert.rejects(asA(who, (tx) => tx.query(sql, params)), (err) => {
      assert.match(String(err.message), pattern);
      return true;
    });
  }
  const begin = (who, cap = 150, extra) => asA(who, (tx) => val(tx, 'select public.avatar_begin(true, $1)', [cap]), extra);
  const quota = (who, extra) => asA(who, (tx) => val(tx, 'select public.avatar_quota()'), extra);
  const forget = (who, id) => asA(who, (tx) => val(tx, `select public.avatar_forget($1, 'character')`, [id]));
  /** 서버가 원본을 올리고 그리기 줄에 세운다(운영에서는 비밀 키의 avatar_enqueue, 여기서는 관리 연결로) */
  const enqueue = async (who, id) =>
    assert.equal(await val(adb, 'select public.avatar_enqueue($1, $2)', [id, `${AU[who]}/originals/${id}.jpg`]), true);
  /** 사이트로 만들기(시작 → 줄에 세우기)를 하고 바로 그 칸을 비운다(그림 지우기). 지운 것도 오늘 장수와 모두의 셈에 남는다 */
  async function makeAndEmpty(who, cap = 150) {
    const r = await begin(who, cap);
    if (r.ok) {
      await enqueue(who, r.id);
      assert.equal(await forget(who, r.id), true);
    }
    return r;
  }
  /** avatar_begin을 직접 부르고 줄에 세우기 전에 지운다(사진을 올리지도 그리지도 않았다) */
  async function beginAndForget(who, cap = 150) {
    const r = await begin(who, cap);
    if (r.ok) assert.equal(await forget(who, r.id), true);
    return r;
  }
  const totalSeen = async () => (await quota('guest2')).total;
  /** 사진 살피기에서 거절된 오늘의 시도 n번(장수에는 안 세고 시도에는 센다) */
  const rejected = (who, n) => adb.query(`insert into public.avatars (user_id, status, consent_at, reason)
    select $1::uuid, 'rejected', now(), 'child' from generate_series(1, $2::int)`, [AU[who], n]);
  const limitsOf = (q) => [q.cap, q.attempt_cap, q.total_exempt];
  const setRole = (who, sql) => asA('admin', (tx) => tx.query(`update public.roster set ${sql} where email = $1`, [AEMAIL[who]]));

  before(async () => {
    adb = await avatarDb();
    for (const [k, id] of Object.entries(AU)) await adb.query('insert into auth.users (id, email) values ($1, $2)', [id, AEMAIL[k]]);
    await adb.exec(`insert into public.roster (display_name, role, email) values
      ${Object.entries(AROLE).map(([k, r], i) => `('사람${i + 1}', '${r}', '${AEMAIL[k]}')`).join(', ')};`);
    for (const who of Object.keys(AU)) await asA(who, (tx) => tx.query('select public.sync_my_roster()'));
  });

  test('숫자는 avatar_limits() 한곳에 있고, 장수 응답에 내 역할의 한도가 실린다', async () => {
    assert.deepEqual((await adb.query('select public.avatar_limits() as l')).rows[0].l, {
      guest: { per_day: 10, attempts: 22, total_exempt: false },
      family: { per_day: 20, attempts: 42, total_exempt: false },
      admin: { per_day: null, attempts: null, total_exempt: true },
    });
    assert.deepEqual(limitsOf(await quota('guest')), [10, 22, false]);
    assert.deepEqual(limitsOf(await quota('family')), [20, 42, false]);
    assert.deepEqual(limitsOf(await quota('admin')), [null, null, true], '관리자는 제한이 없고 모두의 상한 밖');
    const q = await quota('guest');
    assert.deepEqual([q.used, q.attempts, q.kept, q.slots], [0, 0, 0, 3], '0019의 칸은 그대로');
    assert.equal(typeof q.total, 'number');
    assert.equal('per_user' in q || 'attempts_max' in q, false, '예전 고정값(3장, 8번)은 뺐다');
    // 명단 밖은 손님 숫자를 보지만 만들지 못한다
    assert.deepEqual(limitsOf(await quota('visitor')), [10, 22, false]);
    assert.deepEqual(await begin('visitor'), { ok: false, reason: 'not_guest' });
  });

  test('손님: 10장째까지 되고 11장째는 user_limit(칸을 비워 가며 만들어도, 지운 것도 센다)', async () => {
    for (let k = 1; k <= 10; k++) assert.equal((await makeAndEmpty('guest')).ok, true, `${k}장째`);
    assert.deepEqual(await begin('guest'), { ok: false, reason: 'user_limit' });
    const q = await quota('guest');
    assert.deepEqual([q.used, q.attempts, q.kept], [10, 10, 0]);
  });

  test('가족: 20장째까지 되고 21장째는 user_limit', async () => {
    for (let k = 1; k <= 20; k++) assert.equal((await makeAndEmpty('family')).ok, true, `${k}장째`);
    assert.deepEqual(await begin('family'), { ok: false, reason: 'user_limit' });
    assert.equal((await quota('family')).used, 20);
  });

  test('관리자: 25장을 넘게 만들어도 되고 시도 수도 막지 않는다. 칸 셋은 그대로', async () => {
    for (let k = 1; k <= 30; k++) assert.equal((await makeAndEmpty('admin')).ok, true, `${k}장째`);
    await rejected('admin', 60);
    const q = await quota('admin');
    assert.deepEqual([q.used, q.attempts, q.cap, q.attempt_cap], [30, 90, null, null]);
    const kept = [];
    for (let k = 0; k < 3; k++) kept.push(await begin('admin'));
    assert.deepEqual(kept.map((r) => [r.ok, r.slot]), [[true, 1], [true, 2], [true, 3]]);
    assert.deepEqual(await begin('admin'), { ok: false, reason: 'slots_full' }, '칸 셋은 누구나 같다');
    for (const r of kept) assert.equal(await forget('admin', r.id), true);
    assert.equal((await begin('admin')).ok, true, '칸을 비우면 다시 만든다');
  });

  test('모두의 상한: 손님·가족이 만든 것만 센다. 관리자는 다 차도 만들고, 관리자가 만든 것은 남의 셈에 들지 않는다', async () => {
    const total = await totalSeen();
    // 지금까지 손님(10장)과 가족(20장)이 줄에 세운 것만 센다. 관리자가 만든 30장 넘게는 세지 않는다
    assert.equal(total, (await quota('guest')).used + (await quota('family')).used);
    assert.ok((await quota('admin')).used >= 30);
    assert.equal((await quota('admin')).total, total, '관리자에게 보이는 셈도 같다');
    for (const who of ['guest2', 'family2']) {
      assert.deepEqual(await begin(who, total), { ok: false, reason: 'total_limit' }, who);
      assert.deepEqual(await begin(who, 0), { ok: false, reason: 'total_limit' }, who);
    }
    // 관리자는 상한이 다 찼어도(0이어도) 만들고, 시험으로 40장을 더 만들어도 손님·가족의 몫은 줄지 않는다
    for (let k = 1; k <= 40; k++) assert.equal((await makeAndEmpty('admin', 0)).ok, true, `${k}장째`);
    assert.equal(await totalSeen(), total, '관리자가 많이 만든 날에도 모두의 셈은 그대로');
    // 그래서 하나도 안 만든 손님은 상한이 한 장 남았으면 그대로 만든다(예전에는 관리자 장수 때문에 total_limit이었다)
    const g = await makeAndEmpty('guest2', total + 1);
    assert.equal(g.ok, true, JSON.stringify(g));
    assert.equal(await totalSeen(), total + 1, '손님이 만든 것은 센다');
    assert.deepEqual(await begin('family2', total + 1), { ok: false, reason: 'total_limit' }, '이제 다 찼다');
  });

  test('직접 시작하고 줄에 세우기 전에 지운 줄은 모두의 셈에 들지 않는다(내 장수와 시도에는 센다)', async () => {
    const t0 = await totalSeen();
    const r = await begin('guest4');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(await totalSeen(), t0 + 1, '사진을 올리는 동안(줄에 서기 전)에도 센다');
    assert.equal(await forget('guest4', r.id), true);
    assert.equal(await totalSeen(), t0, '줄에 서기 전에 지우면 빠진다');
    for (let k = 2; k <= 10; k++) assert.equal((await beginAndForget('guest4')).ok, true, `${k}번째`);
    const q = await quota('guest4');
    assert.deepEqual([q.used, q.attempts, q.total], [10, 10, t0], '내 장수와 시도에는 세고, 모두의 셈은 그대로');
    assert.deepEqual(await begin('guest4'), { ok: false, reason: 'user_limit' }, '되풀이해도 내 하루 장수를 넘지 못한다');
    // 줄에 선 뒤에 지운 것은 센다: 위의 손님·가족 장수(만들고 비우기)가 그렇게 셌다
  });

  test('모두의 셈에서 빠지는 역할은 표의 total_exempt를 따른다(상한을 보는 역할이면 그 장수도 센다)', async () => {
    const before = await totalSeen();
    const { n: adminCounted } = (await adb.query(`select count(*)::int as n from public.avatars
      where user_id = $1 and created_at >= public.avatar_day_start()
        and status in ('pending', 'queued', 'drawing', 'ready', 'deleted') and not (status = 'deleted' and queued_at is null)`,
    [AU.admin])).rows[0];
    assert.ok(adminCounted >= 70, String(adminCounted));
    try {
      // 관리자도 상한을 보게 고친 표(하루 장수 제한은 그대로 없음)
      await adb.exec(`create or replace function public.avatar_limits() returns jsonb
        language sql immutable set search_path = '' as $$
          select jsonb_build_object(
            'guest', jsonb_build_object('per_day', 10, 'attempts', 22, 'total_exempt', false),
            'family', jsonb_build_object('per_day', 20, 'attempts', 42, 'total_exempt', false),
            'admin', jsonb_build_object('per_day', null, 'attempts', null, 'total_exempt', false)) $$;`);
      assert.equal(await totalSeen(), before + adminCounted, '관리자가 만든 것도 센다');
      assert.deepEqual(await begin('admin', before + adminCounted), { ok: false, reason: 'total_limit' }, '관리자도 상한에 막힌다');
    } finally {
      await adb.exec(ROLE_CAPS);
    }
    assert.equal(await totalSeen(), before, '0020을 다시 올리면 돌아온다');
  });

  test('시도 수: 손님 22번, 가족 42번(거절·실패도 센다)', async () => {
    await rejected('guest3', 21);
    assert.equal((await begin('guest3', 10000)).ok, true, '거절 21번 뒤 22번째 시도는 된다');
    assert.deepEqual(await begin('guest3', 10000), { ok: false, reason: 'attempt_limit' });
    const q = await quota('guest3');
    assert.deepEqual([q.used, q.attempts], [1, 22]);
    await rejected('family2', 41);
    assert.equal((await begin('family2', 10000)).ok, true, '거절 41번 뒤 42번째 시도는 된다');
    assert.deepEqual(await begin('family2', 10000), { ok: false, reason: 'attempt_limit' });
  });

  test('avatar_begin을 직접 불러도 한도를 못 넘긴다: 크게 넘긴 상한, JWT에 적은 역할, 스스로 고친 명단 모두 소용없다', async () => {
    // guest는 오늘 10장을 다 만들었다
    assert.deepEqual(await begin('guest', 100000), { ok: false, reason: 'user_limit' });
    const forged = { app_metadata: { provider: 'google', providers: ['google'], role: 'admin' }, user_metadata: { role: 'admin' }, user_role: 'admin' };
    assert.deepEqual(limitsOf(await quota('guest', forged)), [10, 22, false]);
    assert.deepEqual(await begin('guest', 100000, forged), { ok: false, reason: 'user_limit' });
    // 손님·가족이 스스로 역할을 올리려 해도 명단은 바뀌지 않는다(관리자만 고친다)
    await asA('guest', (tx) => tx.query(`update public.roster set role = 'admin' where email = $1`, [AEMAIL.guest]));
    await asA('family', (tx) => tx.query(`update public.roster set role = 'admin' where email = $1`, [AEMAIL.family]));
    assert.equal(await asA('guest', (tx) => val(tx, 'select public.my_role()')), 'guest');
    assert.equal(await asA('family', (tx) => val(tx, 'select public.my_role()')), 'family');
    assert.deepEqual(await begin('guest', 100000), { ok: false, reason: 'user_limit' });
    assert.deepEqual(await begin('family', 100000), { ok: false, reason: 'user_limit' });
    // 숫자 표를 직접 부르거나 표에 바로 넣지 못한다
    await failsA('guest', 'select public.avatar_limits()', [], /permission denied/);
    await failsA('guest', `insert into public.avatars (status, consent_at) values ('pending', now())`, [], /permission denied/);
  });

  test('역할은 명단이 정한다: 관리자가 바꾸면 다음 요청부터 그 한도, 명단에서 빼면 만들지 못한다', async () => {
    await setRole('guest', `role = 'family'`);
    const q = await quota('guest');
    assert.deepEqual([q.cap, q.attempt_cap, q.used], [20, 42, 10]);
    const r = await makeAndEmpty('guest');
    assert.equal(r.ok, true, '가족이 되면 11장째도 된다');
    const t = await totalSeen();
    await setRole('guest', `role = 'admin'`);
    assert.deepEqual(limitsOf(await quota('guest')), [null, null, true]);
    // 모두의 셈도 지금 명단의 역할로 센다: 관리자가 되면 그 사람의 오늘 11장은 셈에서 빠진다
    assert.equal(await totalSeen(), t - 11);
    await setRole('guest', `role = 'guest', revoked_at = now()`);
    assert.equal(await totalSeen(), t, '명단에서 빠진 사람이 만든 것은 손님으로 센다');
    assert.deepEqual(await begin('guest', 100000), { ok: false, reason: 'not_guest' });
    const out = await quota('guest');
    assert.deepEqual([out.cap, out.total], [10, 0], '명단 밖은 손님 숫자, 모두의 셈은 보이지 않는다');
    await setRole('guest', 'revoked_at = null');
    assert.deepEqual(await begin('guest', 100000), { ok: false, reason: 'user_limit' }, '다시 손님이면 오늘 11장을 넘었으니 막힌다');
  });

  test('하루의 경계(한국 시간 자정)와 칸 셋은 그대로다', async () => {
    assert.equal((await begin('guest3', 10000)).reason, 'attempt_limit');
    await adb.query(`update public.avatars set created_at = public.avatar_day_start() - interval '1 second' where user_id = $1`, [AU.guest3]);
    const q = await quota('guest3');
    assert.deepEqual([q.used, q.attempts, q.kept], [0, 0, 1], '어제 것은 오늘 셈에서 빠지고, 그리는 중인 칸은 남는다');
    assert.equal((await begin('guest3', 10000)).ok, true);
    assert.equal((await begin('guest3', 10000)).ok, true);
    assert.deepEqual(await begin('guest3', 10000), { ok: false, reason: 'slots_full' });
    const start = (await adb.query(`select to_char(public.avatar_day_start() at time zone 'Asia/Seoul', 'HH24:MI:SS') as t`)).rows[0].t;
    assert.equal(start, '00:00:00');
  });

  test('역할 표에서 칸이 빠지면 그 한도는 0(모르면 막는다). 제한 없음은 null로 적을 때만이다', async () => {
    try {
      // 고치다 손님 칸과 관리자의 숫자 칸을 지운 표
      await adb.exec(`create or replace function public.avatar_limits() returns jsonb
        language sql immutable set search_path = '' as $$
          select jsonb_build_object('admin', jsonb_build_object('total_exempt', true)) $$;`);
      assert.deepEqual(limitsOf(await quota('guest2')), [0, 0, false]);
      assert.deepEqual(await begin('guest2', 100000), { ok: false, reason: 'user_limit' });
      assert.deepEqual(limitsOf(await quota('admin')), [0, 0, true], '관리자도 숫자 칸이 빠지면 0이다');
      assert.deepEqual(await begin('admin', 100000), { ok: false, reason: 'user_limit' });
    } finally {
      await adb.exec(ROLE_CAPS);
    }
    assert.deepEqual(limitsOf(await quota('guest2')), [10, 22, false], '0020을 다시 올리면 돌아온다');
    assert.deepEqual(limitsOf(await quota('admin')), [null, null, true]);
  });

  test('권한: 숫자 표는 함수 안에서만 읽고, 장수와 시작은 로그인한 사람만', async () => {
    const can = async (role, sig) => (await adb.query(`select has_function_privilege($1, $2, 'execute') as v`, [role, `public.${sig}`])).rows[0].v;
    const SIGS = ['avatar_limits()', 'avatar_quota()', 'avatar_begin(boolean, int)'];
    const of = async (role) => Promise.all(SIGS.map((s) => can(role, s)));
    assert.deepEqual(await of('authenticated'), [false, true, true]);
    assert.deepEqual(await of('anon'), [false, false, false]);
    await failsA('anon', 'select public.avatar_quota()', [], /permission denied/);
    await failsA('anon', 'select public.avatar_begin(true, 150)', [], /permission denied/);
  });

  test('앞의 마이그레이션(0001·0003, 0019)이 없는 DB에는 올라가지 않고 아무것도 바꾸지 않는다', async () => {
    const cases = [[1, /0020_needs_0001_0003/], [AVATAR_CHAIN.length - 1, /0020_needs_0019/]];
    for (const [n, re] of cases) {
      const d = await avatarDb(AVATAR_CHAIN.slice(0, n), false);
      await assert.rejects(d.exec(ROLE_CAPS), re);
      const r = (await d.query(`select to_regprocedure('public.avatar_limits()') is null as no_limits,
        coalesce((select prosrc like '%per_user%' from pg_proc where oid = to_regprocedure('public.avatar_quota()')), true) as old_quota`)).rows[0];
      assert.deepEqual(r, { no_limits: true, old_quota: true }, String(re));
      await d.close();
    }
  });
});

// ───────────────────────────── 사진 캐릭터 이력·작업대·보관(★)·3D 요청(0021)
// 0001부터 0020까지 올린 위에 0021을 두 번 올린 DB를 따로 쓴다(위 두 묶음과 섞지 않는다).
// 이력: 지우지 않은 그림은 모두 남고 손님 10·가족 20·관리자 제한 없음(다 차면 history_full, 저절로 지우지 않는다).
// 작업대: 칸 수는 역할마다(손님 3, 가족·관리자 9, 세션의 명단 역할로만). 새 그림은 늘 작업대에 들어가고, 다 차면 ★도 입은 것도
// 아닌 줄 가운데 가장 오래 있던 칸을 비워 준다. 역할이 줄면 칸 수 밖의 번호는 이력으로 본다(번호는 둔다).
// 새 그림이 다 그려지지 못하면 칸을 내준 그림이 돌아온다.
// 보관(★): 손님 3·가족 5·관리자 제한 없음. 3D 요청: ★로 보관한 다 그린 그림만, 손님·가족 한 번, 실패하면 돌려주되
// 돈이 든 시도(바깥 3D 서비스가 작업을 만든 요청, 일꾼이 avatar_model_job으로 알린다)의 누적은 손님·가족 두 번까지
// (실패 되풀이로 돈이 끝없이 들지 않게). 작업을 만들지 못한 서비스 사정은 돌려준다. 모두 합친 하루 3D 요청은 100(관리자 밖).
// 요청한 곳(meshy | trellis)을 줄에 적는다.
// 한도는 세션의 명단 역할로만 정해진다. 일꾼의 잡기는 요청한 줄만 요청한 차례로 잡는다(입은 캐릭터라서 잡지 않는다).
// 그것도 일꾼이 넘긴 제공자(p_via)로 요청한 줄만 주고, 제공자를 넘기지 않는 옛 일꾼에게는 아무것도 주지 않는다.
const HISTORY_3D = readMigration('0021_avatar_history_keep_3d.sql');
/** 일꾼 README(worker/avatar/README.md)의 SQL 블록 가운데 그 글을 담은 것(운영에서 손으로 돌리는 SQL을 그대로 돌려 본다) */
const workerReadmeSql = (needle) => {
  const md = readFileSync(new URL('../../worker/avatar/README.md', import.meta.url), 'utf8');
  const block = [...md.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => b.includes(needle));
  assert.ok(block, needle);
  return block;
};

describe('사진 캐릭터 이력·작업대·보관·3D 요청(0021)', () => {
  const HU = {
    admin: '00000000-0000-4000-8000-0000000000a2',
    admin2: '00000000-0000-4000-8000-0000000000a3',
    family: '00000000-0000-4000-8000-0000000000f3',
    family2: '00000000-0000-4000-8000-0000000000f4',
    family3: '00000000-0000-4000-8000-0000000000f5',
    family4: '00000000-0000-4000-8000-0000000000f6',
    ...Object.fromEntries(Array.from({ length: 17 }, (_, k) => [`g${k + 1}`, `00000000-0000-4000-8000-0000000002${String(k + 1).padStart(2, '0')}`])),
    visitor: '00000000-0000-4000-8000-000000000299',
  };
  const HROLE = Object.fromEntries(Object.keys(HU).filter((k) => k !== 'visitor')
    .map((k) => [k, k.startsWith('admin') ? 'admin' : k.startsWith('family') ? 'family' : 'guest']));
  const HEMAIL = Object.fromEntries(Object.keys(HU).map((k) => [k, `${k}@history.test`]));
  const LIVE = `('pending', 'queued', 'drawing', 'ready')`;
  let hdb;

  const asH = (who, fn, extra = {}) => inTx(hdb, who === 'anon' ? null : { ...claimsOf(HU[who], HEMAIL[who]), ...extra }, fn);
  /** 비밀 키(service_role)로: 일꾼이 부르는 길 */
  const asService = (fn) => hdb.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', '', true)`);
    await tx.query('set local role service_role');
    return fn(tx);
  });
  async function failsH(who, sql, params, pattern) {
    await assert.rejects(asH(who, (tx) => tx.query(sql, params)), (err) => {
      assert.match(String(err.message), pattern);
      return true;
    });
  }
  const call = (who, sql, params = [], extra) => asH(who, (tx) => val(tx, sql, params), extra);
  const begin = (who, cap = 150, extra) => call(who, 'select public.avatar_begin(true, $1)', [cap], extra);
  const quota = (who, extra) => call(who, 'select public.avatar_quota()', [], extra);
  const keep = (who, id, on = true) => call(who, 'select public.avatar_keep($1, $2)', [id, on]);
  const toBench = (who, id, slot = null) => call(who, 'select public.avatar_to_bench($1, $2)', [id, slot]);
  /** 3D 요청. via: 그 사람에게 확인 글이 알린 곳(사이트가 자기 AVATAR_MODEL_PROVIDER대로 넘긴다) */
  const request = (who, id, via = 'meshy') => call(who, 'select public.avatar_model_request($1, $2)', [id, via]);
  const forget = (who, id, part = 'character') => call(who, 'select public.avatar_forget($1, $2)', [id, part]);
  const state = (who, id) => call(who, `select public.avatar_asset_state($1, 'model')`, [id]);
  /** 일꾼의 잡기. via: 그 일꾼의 제공자(잡기가 그곳으로 요청한 줄만 준다) */
  const claim = (worker = 'w1', via = 'meshy') => asService((tx) => val(tx, 'select public.avatar_model_claim($1, 600, $2)', [worker, via]));
  /** 그리기 일꾼의 잡기(0003): 사진을 올리지 못하고 30분 넘은 줄을 실패로 정리한다 */
  const claimDraw = () => asService((tx) => val(tx, 'select public.avatar_claim($1, 600)', ['w-draw']));
  const settleModel = (id, status, worker = null) =>
    asService((tx) => val(tx, 'select public.avatar_model_settle($1, $2, $3, $4, $5)', [id, status, 'maker-x', status === 'failed' ? 'bad_output' : null, worker]));
  const row = async (id) => (await hdb.query('select * from public.avatars where id = $1', [id])).rows[0];
  /** 사이트로 만들기(시작)를 하고 일꾼이 다 그린 것처럼 정리한다. 다 그린 그림의 시작 결과를 돌려준다 */
  async function make(who) {
    const r = await begin(who);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(await val(hdb, `select public.avatar_settle($1, 'ready', $2, $3, 'm')`,
      [r.id, `${HU[who]}/originals/${r.id}.jpg`, `${HU[who]}/chars/${r.id}.png`]), true);
    return r;
  }
  /** 어제(KST) 만든 그림 한 줄을 바로 넣는다(오늘 장수에 세지 않는 이력). 비어 있는 작업대 칸이 있으면 트리거가 준다 */
  async function pic(who, { hours = 2, status = 'ready' } = {}) {
    const id = crypto.randomUUID();
    await hdb.query(`insert into public.avatars (id, user_id, status, image_path, original_path, consent_at, created_at)
      values ($1::uuid, $2::uuid, $3, case when $3 = 'ready' then $2::text || '/chars/' || $1::text || '.png' end,
              case when $3 in ('ready', 'queued', 'drawing') then $2::text || '/originals/' || $1::text || '.jpg' end,
              now(), public.avatar_day_start() - make_interval(hours => $4::int))`, [id, HU[who], status, hours]);
    return id;
  }
  const pics = async (who, n) => { const out = []; for (let k = 0; k < n; k++) out.push(await pic(who, { hours: 2 + k })); return out; };
  /** 작업대: [칸 번호, 그림 id] (칸 번호 차례) */
  const bench = async (who) => (await hdb.query(`select slot, id from public.avatars where user_id = $1 and slot is not null
    and status in ${LIVE} order by slot`, [HU[who]])).rows.map((r) => [r.slot, r.id]);
  /** 작업대에 들어온 때를 분 단위로 옮긴다(가장 오래 있던 칸을 분명하게) */
  const benchedAgo = (id, minutes) => hdb.query(`update public.avatars set slot_at = now() - make_interval(mins => $2::int) where id = $1`, [id, minutes]);
  const wear = (who, id) => hdb.query(`insert into public.profiles (user_id, look) values ($1::uuid, $2::jsonb)
    on conflict (user_id) do update set look = excluded.look`, [HU[who], JSON.stringify({ kind: 'photo', url: `/api/avatar/${id}` })]);
  const capsOf = (q) => [q.history_cap, q.keep_cap, q.model_cap, q.model_tries_cap];
  const countsOf = (q) => [q.history, q.keeps, q.models, q.model_tries];
  /** 바깥 3D 서비스가 그 그림의 작업을 만들었다(값이 들었다)고 일꾼이 알린다 */
  const jobMade = (id) => asService((tx) => val(tx, 'select public.avatar_model_job($1)', [id]));
  /** 일꾼이 한 그림을 잡고(paid면 작업을 만들고) 결과가 이상해 돌려놓는다(결과 탓 한 번). 그 줄을 잡지 못했으면 실패 */
  const claimBad = async (id, worker = 'w1', paid = true, via = 'meshy') => {
    assert.equal((await claim(worker, via))?.id, id);
    if (paid) assert.equal(await jobMade(id), true);
    assert.equal(await asService((tx) => val(tx, 'select public.avatar_model_release($1, $2, 0, true)', [id, worker])), true);
  };
  /** 일꾼이 한 그림을 잡아(paid면 작업을 만든 뒤) 까닭(reason)과 함께 그만둔다(failed) */
  const claimFail = async (id, reason, worker = 'w1', paid = true, via = 'meshy') => {
    assert.equal((await claim(worker, via))?.id, id);
    if (paid) assert.equal(await jobMade(id), true);
    assert.equal(await asService((tx) => val(tx, 'select public.avatar_model_settle($1, $2, $3, $4, $5)', [id, 'failed', 'maker-x', reason, worker])), true);
  };
  /** 일꾼이 한 그림을 잡았다가 작업을 만들기 전에 서비스 사정으로 돌려놓는다(잔액·쉬는 중·하루 상한·연결 실패) */
  const claimDown = async (id, worker = 'w1', via = 'meshy') => {
    assert.equal((await claim(worker, via))?.id, id);
    assert.equal(await asService((tx) => val(tx, 'select public.avatar_model_release($1, $2, 0, false)', [id, worker])), true);
  };
  /** 오늘 모두의 3D 요청 수(누가 물어도 같다. 관리자가 물으면 0이 아니라 같은 수를 준다: 셈은 같고 상한만 보지 않는다) */
  const dayCount = async () => (await quota('g1')).model_day;
  /** 일꾼의 DB 어댑터(worker/avatar/supabase.mjs의 wrapSupabase)를 그 DB에 비밀 키(service_role)로 붙인다 */
  const workerOf = (d) => wrapSupabase({
    rpc: async (fn, args = {}) => {
      const keys = Object.keys(args);
      try {
        const data = await d.transaction(async (tx) => {
          await tx.query(`select set_config('request.jwt.claims', '', true)`);
          await tx.query('set local role service_role');
          return (await tx.query(`select v from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`,
            keys.map((k) => args[k]))).rows[0]?.v ?? null;
        });
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e.message), code: e.code } };
      }
    },
  }).db;
  /** 잡기가 준 요청한 때가 그 줄의 model_requested_at과 같은가 */
  const sameRequest = async (id, at) =>
    (await hdb.query('select $2::timestamptz = model_requested_at as same from public.avatars where id = $1', [id, at])).rows[0].same;
  /** PNG 머리만 있는 캐릭터 그림(일꾼은 머리로 형식만 보고 3D 서비스에 넘긴다) */
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

  before(async () => {
    hdb = await avatarDb(AVATAR_CHAIN, true);
    await hdb.exec(HISTORY_3D);
    await hdb.exec(HISTORY_3D); // 두 번 올려도 괜찮다
    for (const [k, id] of Object.entries(HU)) await hdb.query('insert into auth.users (id, email) values ($1, $2)', [id, HEMAIL[k]]);
    await hdb.exec(`insert into public.roster (display_name, role, email) values
      ${Object.entries(HROLE).map(([k, r], i) => `('이력${i + 1}', '${r}', '${HEMAIL[k]}')`).join(', ')};`);
    for (const who of Object.keys(HU)) await asH(who, (tx) => tx.query('select public.sync_my_roster()'));
  });

  test('숫자는 avatar_limits() 한곳에: 작업대 칸 수와 이력·보관·3D 한도가 더해지고, 장수 응답에 내 역할의 한도와 수가 실린다', async () => {
    assert.deepEqual((await hdb.query('select public.avatar_limits() as l')).rows[0].l, {
      guest: { per_day: 10, attempts: 22, total_exempt: false, bench_max: 3, history_max: 10, keep_max: 3, model_max: 1, model_tries_max: 2 },
      family: { per_day: 20, attempts: 42, total_exempt: false, bench_max: 9, history_max: 20, keep_max: 5, model_max: 1, model_tries_max: 2 },
      admin: {
        per_day: null, attempts: null, total_exempt: true, bench_max: 9, history_max: null, keep_max: null, model_max: null, model_tries_max: null,
      },
      model_day_max: 100,
    });
    // 작업대 칸 수: 관리자·가족 9, 손님 3. 명단 밖은 손님 칸 수(만들기는 막힌다)
    const slotsOf = [];
    for (const who of ['admin', 'family', 'g1', 'visitor']) slotsOf.push((await quota(who)).slots);
    assert.deepEqual(slotsOf, [9, 9, 3, 3]);
    assert.deepEqual(capsOf(await quota('g1')), [10, 3, 1, 2]);
    assert.deepEqual(capsOf(await quota('family')), [20, 5, 1, 2]);
    assert.deepEqual(capsOf(await quota('admin')), [null, null, null, null], '관리자는 이력·보관·3D 모두 제한이 없다');
    assert.deepEqual(capsOf(await quota('visitor')), [10, 3, 1, 2], '명단 밖은 손님 숫자(만들기·보관·요청은 막힌다)');
    // 모두 합친 하루 3D 상한: 손님·가족은 100(집주인 결정), 관리자(모두의 상한 밖)는 보지 않는다
    assert.deepEqual([(await quota('g1')).model_day_cap, (await quota('family')).model_day_cap, (await quota('admin')).model_day_cap],
      [100, 100, null]);
    assert.deepEqual([(await quota('g1')).model_day, (await quota('visitor')).model_day], [0, 0]);
    const q = await quota('g1');
    assert.deepEqual(countsOf(q), [0, 0, 0, 0]);
    assert.equal(q.slots, 3, '손님의 작업대 칸은 셋');
    assert.equal('kept' in q, false, '0019의 kept(셋이면 slots_full)는 뺐다');
    assert.deepEqual([q.cap, q.attempt_cap, q.total_exempt, q.used, q.attempts], [10, 22, false, 0, 0], '0020의 하루 한도는 그대로');
    assert.deepEqual(await begin('visitor'), { ok: false, reason: 'not_guest' });
  });

  test('작업대: 새 그림은 늘 작업대에 들어가고, 셋이 차면 보관하지 않은 줄 가운데 가장 오래 있던 칸을 비워 준다(slots_full 없음)', async () => {
    const a = await make('g1');
    const b = await make('g1');
    const c = await make('g1');
    assert.deepEqual([a.slot, b.slot, c.slot, a.freed, c.freed], [1, 2, 3, null, null]);
    await benchedAgo(a.id, 30);
    await benchedAgo(b.id, 20);
    await benchedAgo(c.id, 10);
    const d = await make('g1');
    assert.deepEqual([d.slot, d.freed], [1, a.id], '가장 오래 있던 1번 칸을 비워 새 그림에 준다');
    const gone = await row(a.id);
    assert.deepEqual([gone.status, gone.slot], ['ready', null], '비운 그림은 지우지 않고 이력에만 남는다');
    assert.ok(gone.slot_at !== null, '작업대에 들어온 때는 둔다(되돌리면 차례도 그대로)');
    assert.equal((await row(d.id)).slot_freed, a.id, '새 줄에 칸을 내준 그림을 적는다');
    assert.deepEqual(await bench('g1'), [[1, d.id], [2, b.id], [3, c.id]]);
    // 보관한 줄은 건너뛴다: b(★)가 c보다 오래 있었어도 c의 칸을 비운다
    assert.deepEqual(await keep('g1', b.id), { ok: true, kept: true });
    const e = await make('g1');
    assert.deepEqual([e.slot, e.freed], [3, c.id]);
    assert.deepEqual(await bench('g1'), [[1, d.id], [2, b.id], [3, e.id]]);
    const q = await quota('g1');
    assert.deepEqual(countsOf(q), [5, 1, 0, 0], '이력 다섯(작업대 셋 + 비운 둘), 보관 하나');
    assert.equal(q.used, 5);
  });

  test('셋 다 보관이어도 만들기는 된다: 가장 오래 있던 칸을 비우고, 그 그림은 보관(★)한 채 이력에 남는다', async () => {
    const made = [];
    for (let k = 0; k < 3; k++) made.push(await make('g2'));
    for (const [k, m] of made.entries()) {
      await benchedAgo(m.id, 30 - k * 10);
      assert.deepEqual(await keep('g2', m.id), { ok: true, kept: true });
    }
    const d = await begin('g2');
    assert.deepEqual([d.ok, d.slot, d.freed], [true, 1, made[0].id], JSON.stringify(d));
    const first = await row(made[0].id);
    assert.deepEqual([first.slot, first.kept_at !== null, first.status], [null, true, 'ready']);
    assert.deepEqual(countsOf(await quota('g2')), [4, 3, 0, 0]);
  });

  test('이력 한도: 손님 10·가족 20이 차면 history_full(저절로 지우지 않는다), 지우면 다시 된다. 하루 규칙이 먼저다', async () => {
    const old = await pics('g3', 10);
    assert.equal((await quota('g3')).history, 10);
    assert.deepEqual(await begin('g3'), { ok: false, reason: 'history_full' });
    const n = async () => (await hdb.query(`select count(*)::int as n from public.avatars where user_id = $1 and status in ${LIVE}`, [HU.g3])).rows[0].n;
    assert.equal(await n(), 10, '거절한 시작은 줄을 만들지도, 지우지도 않는다');
    assert.equal((await quota('g3')).attempts, 0, 'history_full은 오늘 시도에도 세지 않는다');
    // 하루 규칙이 먼저: 오늘 시도를 다 썼으면 지우라고 하지 않는다
    await hdb.query(`insert into public.avatars (user_id, status, consent_at, reason)
      select $1::uuid, 'rejected', now(), 'child' from generate_series(1, 22)`, [HU.g3]);
    assert.deepEqual(await begin('g3'), { ok: false, reason: 'attempt_limit' });
    await hdb.query(`delete from public.avatars where user_id = $1 and status = 'rejected'`, [HU.g3]);
    // 하나 지우면 다시 만든다(지운 줄은 이력에 들지 않는다). 그리는 중인 줄도 이력에 든다
    assert.equal(await forget('g3', old[9]), true);
    const r = await begin('g3');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await quota('g3')).history, 10);
    assert.deepEqual(await begin('g3'), { ok: false, reason: 'history_full' });
    // 거절·실패한 그림은 이력에 들지 않는다
    await hdb.query(`update public.avatars set status = 'failed', reason = 'timeout' where id = $1`, [r.id]);
    assert.equal((await quota('g3')).history, 9);
    // 가족은 20
    await pics('family', 19);
    assert.equal((await make('family')).slot === null, false);
    assert.deepEqual(await begin('family'), { ok: false, reason: 'history_full' });
    assert.equal((await quota('family')).history, 20);
  });

  test('관리자: 이력·보관·3D 모두 제한이 없다', async () => {
    await pics('admin', 30);
    const r = await make('admin');
    assert.equal(typeof r.slot, 'number');
    const q = await quota('admin');
    assert.equal(q.history, 31);
    const ids = (await hdb.query(`select id from public.avatars where user_id = $1 and status = 'ready' order by created_at limit 8`, [HU.admin])).rows.map((x) => x.id);
    for (const id of ids) assert.deepEqual(await keep('admin', id), { ok: true, kept: true });
    for (const id of ids.slice(0, 4)) assert.deepEqual(await request('admin', id), { ok: true, already: false });
    assert.deepEqual(countsOf(await quota('admin')), [31, 8, 4, 4], '아직 작업을 만들지 않은 요청 넷은 진행 중으로 센다');
    assert.equal(await dayCount(), 0, '관리자의 요청은 모두의 하루 3D 수에 들지 않는다');
  });

  test('★ 보관: 다 그린 내 그림만, 손님 3개·가족 5개까지(keep_full). 빼면 다시 되고, 같은 그림을 두 번 눌러도 하나다', async () => {
    const [r1, r2, r3, r4] = await pics('g4', 4);
    const drawing = await begin('g4');
    assert.deepEqual(await keep('g4', drawing.id), { ok: false, reason: 'not_ready' }, '그리는 중인 그림은 보관하지 못한다');
    for (const id of [r1, r2, r3]) assert.deepEqual(await keep('g4', id), { ok: true, kept: true });
    assert.deepEqual(await keep('g4', r1), { ok: true, kept: true }, '이미 보관이면 그대로');
    assert.equal((await quota('g4')).keeps, 3);
    assert.deepEqual(await keep('g4', r4), { ok: false, reason: 'keep_full', cap: 3 });
    assert.deepEqual(await keep('g4', r2, false), { ok: true, kept: false });
    assert.deepEqual(await keep('g4', r4), { ok: true, kept: true });
    assert.equal((await row(r2)).kept_at, null);
    const fam = await pics('family2', 6);
    for (const id of fam.slice(0, 5)) assert.deepEqual(await keep('family2', id), { ok: true, kept: true });
    assert.deepEqual(await keep('family2', fam[5]), { ok: false, reason: 'keep_full', cap: 5 });
    // 명단 밖, 빈 값
    assert.deepEqual(await keep('visitor', r1), { ok: false, reason: 'not_guest' });
    await failsH('g4', 'select public.avatar_keep($1, null)', [r1], /bad_on/);
    // 지운 그림은 보관하지 못한다
    assert.equal(await forget('g4', r2), true);
    assert.deepEqual(await keep('g4', r2), { ok: false, reason: 'not_found' });
  });

  test('3D 요청: ★로 보관한 다 그린 그림만, 손님·가족 한 번(model_full). 이미 요청한 그림은 그대로(already)', async () => {
    const [kept, plain] = await pics('g5', 2);
    const drawing = await begin('g5');
    assert.deepEqual(await keep('g5', kept), { ok: true, kept: true });
    assert.deepEqual(await request('g5', plain), { ok: false, reason: 'not_kept' });
    assert.deepEqual(await request('g5', drawing.id), { ok: false, reason: 'not_ready' });
    // 요청한 곳은 meshy | trellis만(사이트가 넘긴다). 그 밖은 오류이고 아무것도 바꾸지 않는다
    for (const via of [null, '', 'MESHY', 'tripo']) await failsH('g5', 'select public.avatar_model_request($1, $2)', [kept, via], /bad_via/);
    const day0 = await dayCount();
    assert.deepEqual(await request('g5', kept), { ok: true, already: false });
    const r = await row(kept);
    assert.ok(r.model_requested_at !== null);
    assert.deepEqual([r.model_status, r.model_attempts, r.model_request_via, r.model_tries, r.model_job_at], [null, 0, 'meshy', 0, null],
      '누적은 바깥 3D 서비스가 작업을 만들 때 는다(요청만으로는 아직)');
    assert.deepEqual(await request('g5', kept, 'trellis'), { ok: true, already: true }, '다시 눌러도 한 번 더 보내지 않는다');
    assert.deepEqual([(await row(kept)).model_request_via, (await row(kept)).model_tries], ['meshy', 0], '이미 요청한 줄의 곳은 그대로');
    assert.deepEqual([(await quota('g5')).models, (await quota('g5')).model_tries], [1, 1], '진행 중인 요청은 시도 하나로 잡아 둔다');
    assert.equal(await dayCount(), day0 + 1, '오늘 모두의 3D 요청에 하나');
    assert.deepEqual(await keep('g5', plain), { ok: true, kept: true });
    assert.deepEqual(await request('g5', plain), { ok: false, reason: 'model_full', cap: 1 });
    // 가족도 한 번
    const fam = (await hdb.query(`select id from public.avatars where user_id = $1 and kept_at is not null order by created_at`, [HU.family2]))
      .rows.map((x) => x.id);
    assert.deepEqual(await request('family2', fam[0]), { ok: true, already: false });
    assert.deepEqual(await request('family2', fam[1]), { ok: false, reason: 'model_full', cap: 1 });
    // 보관을 빼도 요청은 남는다(셈도 그대로)
    assert.deepEqual(await keep('g5', kept, false), { ok: true, kept: false });
    assert.equal((await quota('g5')).models, 1);
    assert.deepEqual(await request('g5', kept), { ok: true, already: true });
    // 이미 3D가 있는 그림(0016에서 저절로 만든 것)은 요청으로 세지 않고 다시 보내지도 않는다
    const auto = await pic('g6');
    await hdb.query(`update public.avatars set model_status = 'ready', model_attempts = 1, model_worker = 'w0', model_maker = 'old' where id = $1`, [auto]);
    assert.deepEqual(await keep('g6', auto), { ok: true, kept: true });
    assert.deepEqual(await request('g6', auto), { ok: true, already: true });
    assert.equal((await quota('g6')).models, 0);
  });

  test('3D가 실패하면 한도에서 빼 준다: 다시 요청할 수 있고, 실패로 굳은 그림을 다시 요청하면 모형 칸을 처음부터 센다', async () => {
    // 앞 시험들의 요청이 일꾼의 차례를 먼저 차지하지 않게 거둔다(이 시험은 g7의 요청만 본다)
    await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null and user_id <> $1`, [HU.g7]);
    const [a, b] = await pics('g7', 2);
    for (const id of [a, b]) assert.deepEqual(await keep('g7', id), { ok: true, kept: true });
    assert.deepEqual(await request('g7', a), { ok: true, already: false });
    assert.equal((await claim('w1')).id, a);
    assert.equal(await jobMade(a), true);
    assert.equal(await settleModel(a, 'failed', 'w1'), true);
    assert.deepEqual([(await quota('g7')).models, (await quota('g7')).model_tries], [0, 1], '실패한 요청은 세지 않는다(돈이 든 누적은 남는다)');
    assert.deepEqual(await request('g7', a), { ok: true, already: false }, '실패한 그림을 다시 요청한다');
    const r = await row(a);
    assert.deepEqual([r.model_status, r.model_attempts, r.model_bad_fails, r.model_reason, r.model_worker, r.model_tries, r.model_job_at],
      [null, 0, 0, null, null, 1, null], '모형 칸은 처음부터, 누적은 그대로(새 요청의 작업을 만들면 하나 는다)');
    assert.deepEqual([(await quota('g7')).models, (await quota('g7')).model_tries], [1, 2], '진행 중인 새 요청도 시도로 잡아 둔다');
    assert.deepEqual(await request('g7', b), { ok: false, reason: 'model_full', cap: 1 });
    assert.equal((await claim('w1')).id, a, '다시 요청한 그림을 일꾼이 다시 잡는다');
    assert.equal(await settleModel(a, 'ready', 'w1'), true);
    assert.equal((await quota('g7')).models, 1, '다 만든 3D는 센다');
    assert.equal(await state('g8', a), 'ready');
  });

  test('실패를 되풀이해도 돈이 드는 작업에 끝이 있다: 돈이 든 시도의 누적이 손님·가족 두 번이면 model_tries_full(그림을 바꿔도, 지워도)', async () => {
    // 리뷰의 되풀이(요청 → 잡기 → 작업 → 결과 탓 돌려놓기 → 잡기 → 새 작업 → failed)를 그대로:
    // 예전에는 손님 한 명이 잡기 12번(유료 작업 12건)을 냈다. 결과 탓으로 새로 만든 둘째 작업은 같은 요청이라 한 번으로 센다
    await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null`);
    const [a, b, c] = await pics('g11', 3);
    for (const id of [a, b, c]) assert.deepEqual(await keep('g11', id), { ok: true, kept: true });
    let claims = 0;
    const loop = async (id) => {
      const r = await request('g11', id);
      if (!r.ok) return r;
      await claimBad(id);
      await claimFail(id, 'glb_parts');
      claims += 2;
      return r;
    };
    const replies = [];
    for (let k = 0; k < 6; k++) replies.push(await loop(a));
    assert.deepEqual(replies.map((r) => r.ok ? 'ok' : r.reason), ['ok', 'ok', 'model_tries_full', 'model_tries_full', 'model_tries_full', 'model_tries_full']);
    assert.equal(claims, 4, '요청 두 번 × 결과 탓 한 번 더 = 잡기 네 번에서 멈춘다');
    assert.deepEqual(replies[2], { ok: false, reason: 'model_tries_full', cap: 2 });
    assert.deepEqual(await request('g11', b), { ok: false, reason: 'model_tries_full', cap: 2 }, '다른 그림으로 바꿔도 누적은 사람마다');
    assert.equal(await forget('g11', a), true);
    assert.deepEqual(countsOf(await quota('g11')).slice(2), [0, 2], '보낸 그림을 지워도 누적은 그대로');
    assert.deepEqual(await request('g11', c), { ok: false, reason: 'model_tries_full', cap: 2 });
    assert.equal(await claim('w1'), null, '막힌 요청은 일꾼에게 가지 않는다');
    // 가족도 두 번, 관리자는 제한 없음
    assert.deepEqual(capsOf(await quota('family')).slice(3), [2]);
    const adminPic = await pic('admin');
    assert.deepEqual(await keep('admin', adminPic), { ok: true, kept: true });
    for (let k = 0; k < 4; k++) {
      assert.deepEqual(await request('admin', adminPic), { ok: true, already: false }, `관리자 ${k + 1}번째`);
      await claimFail(adminPic, 'glb_parts');
    }
  });

  test('다시 해도 같은 실패로 굳은 그림은 다시 보내지 않는다(model_blocked). 그 그림 탓은 어디로든, 받지 않은 곳의 거절은 그곳으로만', async () => {
    await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null`);
    const blockedFor = async (reason) => {
      const id = await pic('admin');
      assert.deepEqual(await keep('admin', id), { ok: true, kept: true });
      assert.deepEqual(await request('admin', id), { ok: true, already: false });
      await claimFail(id, reason);
      const meshy = await request('admin', id, 'meshy');
      const back = meshy.ok ? null : await request('admin', id, 'trellis');
      if (meshy.ok) await claimFail(id, reason); // 다시 줄에 섰으면 다음 경우를 위해 거둔다
      return [meshy.ok ? 'ok' : meshy.reason, back === null ? '-' : back.ok ? 'ok' : back.reason];
    };
    // 그 그림 자체(PNG가 아님, 줄의 모양): 어느 곳으로도 다시 보내지 않는다
    assert.deepEqual(await blockedFor('bad_char'), ['model_blocked', 'model_blocked']);
    assert.deepEqual(await blockedFor('bad_job'), ['model_blocked', 'model_blocked']);
    // Meshy가 받지 않은 그림(내용 검사, 입력 거절)은 Meshy로는 다시 보내지 않는다. 우리 컴퓨터(trellis)는 받을 수 있다
    for (const reason of ['blocked', 'meshy_input', 'meshy_rejected']) {
      assert.deepEqual(await blockedFor(reason), ['model_blocked', 'ok'], reason);
      // 우리 컴퓨터로 다시 요청한 줄은 우리 컴퓨터(trellis) 일꾼이 잡는다(다음 경우를 위해 거둔다)
      await claimFail((await hdb.query(`select id from public.avatars where model_requested_at is not null and model_status is null`)).rows[0].id,
        'service_down', 'w1', true, 'trellis');
    }
    // 결과 탓·서비스 쪽 실패는 다시 해 볼 수 있다
    for (const reason of ['glb_parts', 'bad_output', 'meshy_failed', 'timeout', 'service_down']) {
      assert.deepEqual(await blockedFor(reason), ['ok', '-'], reason);
    }
    assert.deepEqual(await hdb.query(`select public.avatar_model_blocked('bad_input', 'trellis') as t, public.avatar_model_blocked('bad_input', 'meshy') as m`)
      .then((x) => x.rows[0]), { t: true, m: false }, '우리 컴퓨터가 받지 않은 그림은 Meshy로는 보낼 수 있다');
    // 손님에게도 같다(요청하기 전에 막혀 누적이 늘지 않는다)
    const id = await pic('g12');
    assert.deepEqual(await keep('g12', id), { ok: true, kept: true });
    assert.deepEqual(await request('g12', id), { ok: true, already: false });
    await claimFail(id, 'meshy_input');
    assert.deepEqual(await request('g12', id), { ok: false, reason: 'model_blocked' });
    assert.deepEqual(countsOf(await quota('g12')).slice(2), [0, 1]);
  });

  test('요청한 곳을 줄에 묶는다: 잡기는 일꾼의 제공자로 요청한 줄만 준다. 제공자를 바꾸면 옛 곳의 요청을 README의 SQL로 reconsent(셈과 누적에서 빠진다)', async () => {
    await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null`);
    const id = await pic('g13');
    assert.deepEqual(await keep('g13', id), { ok: true, kept: true });
    const day0 = await dayCount();
    assert.deepEqual(await request('g13', id, 'trellis'), { ok: true, already: false });
    assert.equal(await dayCount(), day0 + 1);
    assert.equal(await claim('w1', 'meshy'), null, 'Meshy 일꾼은 우리 컴퓨터로 동의한 요청을 잡지 않는다');
    assert.deepEqual([(await row(id)).model_status, (await row(id)).model_attempts], [null, 0], '잡은 횟수도 쓰지 않는다');
    const job = await claim('w2', 'trellis');
    assert.deepEqual([job.id, job.via], [id, 'trellis'], '그곳의 일꾼(우리 컴퓨터)이 잡고, 잡기가 요청한 곳을 함께 준다');
    assert.equal(await asService((tx) => val(tx, `select public.avatar_model_release($1, 'w2', 0, false)`, [id])), true);
    // 사이트와 일꾼을 meshy로 바꿨다: 옛 곳으로 요청하고 아직 잡히지 않은 줄을 README의 SQL 그대로 reconsent로 돌려준다
    const meshyWaiting = await pic('admin');
    assert.deepEqual(await keep('admin', meshyWaiting), { ok: true, kept: true });
    assert.deepEqual(await request('admin', meshyWaiting, 'meshy'), { ok: true, already: false });
    await hdb.exec(workerReadmeSql("model_reason = 'reconsent'"));
    const r = await row(id);
    assert.deepEqual([r.model_status, r.model_reason, r.model_tries], ['failed', 'reconsent', 0], '작업을 만들지 않았으니 누적에 들지 않는다');
    assert.deepEqual([(await row(meshyWaiting)).model_status, (await row(meshyWaiting)).model_reason], [null, null], '새 곳의 요청은 그대로');
    assert.deepEqual(countsOf(await quota('g13')).slice(2), [0, 0], '셈에서도 진행 중에서도 빠진다');
    assert.equal(await dayCount(), day0, '모두의 하루 수에서도 빠진다');
    await hdb.query(`update public.avatars set model_requested_at = null where id = $1`, [meshyWaiting]);
    // 화면이 새 확인 글(Meshy)로 다시 묻고 다시 요청한다: 이제 meshy로 적히고, 작업을 만들면 누적이 하나
    assert.deepEqual(await request('g13', id, 'meshy'), { ok: true, already: false });
    assert.deepEqual([(await row(id)).model_request_via, (await quota('g13')).model_tries], ['meshy', 1]);
    assert.equal(await claim('w2', 'trellis'), null, '우리 컴퓨터는 Meshy로 동의한 요청을 잡지 않는다(한 번뿐인 3D를 다른 곳의 결과로 쓰지 않게)');
    assert.equal((await claim('w1')).via, 'meshy');
    assert.equal(await jobMade(id), true);
    // 결과 탓 실패(glb_*)는 누적을 돌려주지 않는다(값을 냈다)
    await asService((tx) => tx.query('select public.avatar_model_settle($1, $2, $3, $4, $5)', [id, 'failed', 'meshy-7.1', 'glb_parts', 'w1']));
    assert.deepEqual([(await row(id)).model_tries, (await quota('g13')).model_tries], [1, 1]);
    assert.equal(await dayCount(), day0 + 1, '작업을 만든 뒤의 실패는 하루 수에 남는다');
  });

  test('돈이 든 실패만 센다: 작업을 만든 시도는 남고, 작업을 만들기 전에 끝난 서비스 사정은 돌려준다. 알림은 요청마다 한 번', async () => {
    await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null`);
    const [a, b] = await pics('g15', 2);
    for (const id of [a, b]) assert.deepEqual(await keep('g15', id), { ok: true, kept: true });
    const tries = async () => (await quota('g15')).model_tries;
    // 작업을 만들기 전에 서비스 사정(잔액·쉬는 중·하루 상한·연결 실패)으로 돌려놓기를 되풀이하다 잡은 횟수에서 굳었다
    assert.deepEqual(await request('g15', a), { ok: true, already: false });
    assert.equal(await tries(), 1, '진행 중');
    await claimDown(a);
    assert.equal(await tries(), 1, '돌려놓아 기다려도 진행 중');
    await claimFail(a, 'attempts', 'w1', false);
    assert.deepEqual(countsOf(await quota('g15')).slice(2), [0, 0], '작업을 만들지 못한 실패는 셈과 누적 모두에서 돌려준다');
    assert.equal((await row(a)).model_tries, 0);
    // 다시 요청할 수 있다(같은 그림도). 만들기 전 거절(내용 검사 등)도 누적에 들지 않는다(그림은 막힌다)
    assert.deepEqual(await request('g15', a), { ok: true, already: false });
    await claimFail(a, 'meshy_rejected', 'w1', false);
    assert.deepEqual(countsOf(await quota('g15')).slice(2), [0, 0]);
    assert.deepEqual(await request('g15', a), { ok: false, reason: 'model_blocked' });
    // 작업을 만든 시도: 그 요청에서 한 번만(결과가 이상해 새로 만든 둘째 작업, 다시 온 알림, 이어 본 작업은 그대로)
    assert.deepEqual(await request('g15', b), { ok: true, already: false });
    assert.equal((await claim('w1')).id, b);
    assert.equal(await jobMade(b), true);
    const first = (await row(b)).model_job_at;
    assert.ok(first !== null);
    assert.equal(await jobMade(b), true, '다시 알려도 된다(그대로)');
    assert.equal(await asService((tx) => val(tx, 'select public.avatar_model_release($1, $2, 0, true)', [b, 'w1'])), true);
    await claimFail(b, 'glb_parts');
    const done = await row(b);
    assert.deepEqual([done.model_tries, String(done.model_job_at)], [1, String(first)], '같은 요청의 둘째 작업은 한 번으로');
    assert.deepEqual(countsOf(await quota('g15')).slice(2), [0, 1], '돈이 든 실패는 셈에 남는다');
    // 손님은 한 번 더 해 볼 수 있다. 그 요청도 작업을 만들면 둘째 시도로 세고, 그 뒤로는 막힌다
    assert.deepEqual(await request('g15', b), { ok: true, already: false });
    assert.equal((await row(b)).model_job_at, null, '새 요청은 작업을 만든 때를 비운다');
    await claimFail(b, 'meshy_failed');
    assert.deepEqual(countsOf(await quota('g15')).slice(2), [0, 2]);
    assert.deepEqual(await request('g15', b), { ok: false, reason: 'model_tries_full', cap: 2 });
    // 작업을 만든 사이 본인이 그림을 지웠어도 센다(값은 이미 냈다). 없는 줄은 false. 비밀 키만 부른다
    const c = await pic('admin');
    assert.deepEqual(await keep('admin', c), { ok: true, kept: true });
    assert.deepEqual(await request('admin', c), { ok: true, already: false });
    assert.equal((await claim('w1')).id, c);
    assert.equal(await forget('admin', c), true);
    assert.equal(await jobMade(c), true);
    assert.deepEqual([(await row(c)).status, (await row(c)).model_tries], ['deleted', 1]);
    assert.equal(await jobMade(crypto.randomUUID()), false);
    for (const who of ['g15', 'admin', 'visitor', 'anon']) await failsH(who, 'select public.avatar_model_job($1)', [b], /permission denied/);
  });

  test('모두 합친 하루 3D 요청 상한(100, 한국 시간): 넘으면 model_day_full. 관리자는 상한을 보지도 셈에 들지도 않는다', async () => {
    await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null`);
    const day0 = await dayCount();
    assert.equal(day0, 0);
    // 오늘 요청 99개를 바로 넣는다(작업을 만든 뒤의 실패, 지운 그림의 남은 요청도 센다). 그림은 어제 만든 것으로 두고
    // (오늘 장수와 모두의 하루 그림 상한에 들지 않게) 일꾼이 잡지 않게 내일까지 미룬다. 넣은 줄은 끝에 거둔다
    const added = [];
    const fill = async (who, n, { failed = null, paid = false } = {}) => {
      const r = await hdb.query(`insert into public.avatars
          (id, user_id, status, image_path, consent_at, created_at, model_requested_at, model_not_before, model_status, model_reason,
           model_job_at)
        select g.id, $1::uuid, 'ready', $1::text || '/chars/' || g.id::text || '.png', now(), public.avatar_day_start() - interval '2 hours',
               now(), now() + interval '1 day', case when $3::text is not null then 'failed' end, $3::text, case when $4::boolean then now() end
          from (select gen_random_uuid() as id from generate_series(1, $2::int)) g
        returning id`, [HU[who], n, failed, paid]);
      added.push(...r.rows.map((x) => x.id));
    };
    try {
      await fill('g1', 90);
      await fill('family', 8, { failed: 'glb_parts', paid: true });
      added.push((await hdb.query(`insert into public.avatars (user_id, status, consent_at, created_at, deleted_at, model_requested_at)
        values ($1::uuid, 'deleted', now(), public.avatar_day_start() - interval '2 hours', now(), now()) returning id`, [HU.g2])).rows[0].id);
      assert.equal(await dayCount(), 99);
      // 세지 않는 것: 작업을 만들지 못한 실패, 관리자의 요청, 어제(한국 시간)의 요청
      await fill('g1', 5, { failed: 'service_down' });
      await fill('admin', 7);
      await hdb.query(`update public.avatars set model_requested_at = public.avatar_day_start() - interval '1 minute'
        where id in (select id from public.avatars where user_id = $1 and model_requested_at is not null and model_status is null limit 3)`, [HU.g1]);
      assert.equal(await dayCount(), 96);
      await hdb.query(`update public.avatars set model_requested_at = now() where user_id = $1 and model_requested_at < public.avatar_day_start()`, [HU.g1]);
      assert.equal(await dayCount(), 99);
      // 100번째: 손님 하나는 되고, 그다음은 막힌다(진행 중인 요청도 센다)
      const [x, y] = [await pic('g12'), await pic('g16')];
      assert.deepEqual(await keep('g12', x), { ok: true, kept: true });
      assert.deepEqual(await keep('g16', y), { ok: true, kept: true });
      assert.deepEqual(await request('g12', x), { ok: true, already: false });
      assert.equal(await dayCount(), 100);
      assert.deepEqual(await request('g16', y), { ok: false, reason: 'model_day_full' });
      assert.equal((await row(y)).model_requested_at, null, '막힌 요청은 줄을 바꾸지 않는다');
      // 관리자는 그래도 된다(셈에도 들지 않는다)
      const z = await pic('admin');
      assert.deepEqual(await keep('admin', z), { ok: true, kept: true });
      assert.deepEqual(await request('admin', z), { ok: true, already: false });
      assert.equal(await dayCount(), 100);
      // 작업을 만들기 전에 끝난 요청은 돌려준다: 다시 자리가 난다
      await claimFail(x, 'meshy_paused', 'w1', false);
      assert.equal(await dayCount(), 99);
      assert.deepEqual(await request('g16', y), { ok: true, already: false });
    } finally {
      // 넣은 줄은 거두고 남은 요청도 거둔다(다음 시험이 차례를 다투지 않게)
      await hdb.query('delete from public.avatars where id = any($1::uuid[])', [added]);
      await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null`);
    }
    assert.equal(await dayCount(), 0);
  });

  test('그림을 지우면: 보관 표시가 지워지고, 3D 요청은 작업을 만들기 전에 기다리던 것과 실패한 것은 돌려주고, 만드는 중·작업을 만든 뒤 기다림·다 만든 것은 센다', async () => {
    // 앞 시험의 요청을 거둔다(이 시험은 관리자의 다섯 요청만 본다)
    await hdb.query(`update public.avatars set model_requested_at = null where model_requested_at is not null`);
    const [waiting, paidWait, drawing, done, failed] = await pics('admin', 5);
    for (const id of [waiting, paidWait, drawing, done, failed]) {
      assert.deepEqual(await keep('admin', id), { ok: true, kept: true });
      assert.deepEqual(await request('admin', id), { ok: true, already: false });
    }
    assert.equal((await quota('admin')).models, 5);
    // 일꾼이 요청한 차례대로 잡는다: waiting은 잡히지 않게 뒤로 미룬다
    await hdb.query(`update public.avatars set model_requested_at = now() + interval '1 hour' where id = $1`, [waiting]);
    // 작업을 만들고(값이 들고) 기다리다 시간이 넘어 돌려놓은 줄
    assert.equal((await claim('w0')).id, paidWait);
    assert.equal(await jobMade(paidWait), true);
    assert.equal(await asService((tx) => val(tx, `select public.avatar_model_release($1, 'w0', 3600, false)`, [paidWait])), true);
    assert.equal((await claim('w1')).id, drawing);
    assert.equal((await claim('w2')).id, done);
    assert.equal(await jobMade(done), true);
    assert.equal(await settleModel(done, 'ready', 'w2'), true);
    assert.equal((await claim('w3')).id, failed);
    assert.equal(await jobMade(failed), true);
    assert.equal(await settleModel(failed, 'failed', 'w3'), true);
    assert.equal((await quota('admin')).models, 4, '실패한 것은 빠진다');
    const triesBefore = (await quota('admin')).model_tries;
    for (const id of [waiting, paidWait, drawing, done, failed]) assert.equal(await forget('admin', id), true);
    const after = await Promise.all([waiting, paidWait, drawing, done, failed].map(row));
    assert.deepEqual(after.map((r) => [r.status, r.kept_at, r.model_status]), after.map(() => ['deleted', null, null]));
    assert.deepEqual(after.map((r) => r.model_requested_at !== null), [false, true, true, true, false],
      '작업을 만들기 전에 기다리던 것(waiting)과 실패(failed)는 돌려주고, 작업을 만든 뒤 기다림·만드는 중·다 만든 것은 남는다');
    assert.deepEqual(after.map((r) => r.model_tries), [0, 1, 0, 1, 1], '돈이 든 누적은 지워도 그대로');
    assert.equal((await quota('admin')).models, 3);
    // 기다리던 것(진행 중으로 잡아 둔 하나)과 만드는 중이던 것(아직 작업 없음)은 다 그린 그림이 아니게 되어 진행 중에서 빠진다
    assert.equal((await quota('admin')).model_tries, triesBefore - 2);
    assert.equal(await claim('w1'), null, '지운 그림은 잡지 않는다');
    // 만드는 중이던 그림의 작업이 지운 뒤에 생기면 그때 센다(값은 이미 냈다)
    assert.equal(await jobMade(drawing), true);
    assert.equal((await quota('admin')).model_tries, triesBefore - 1);
  });

  test('일꾼의 잡기: 요청한 줄을 일꾼의 제공자로 거르고 요청한 차례로 잡는다. 입은 캐릭터는 잡지 않고, 제공자를 넘기지 않는 옛 일꾼에게는 주지 않는다(일꾼 어댑터 그대로)', async () => {
    await hdb.query(`update public.avatars set model_requested_at = null, model_status = null, model_attempts = 0, model_bad_fails = 0,
      model_claimed_at = null, model_worker = null, model_not_before = null, model_reason = null, model_maker = null
      where model_requested_at is not null or model_status is not null`);
    const worn = await pic('g8');
    await wear('g8', worn);
    const [p1, p2] = await pics('g9', 2);
    assert.equal(await claim('w1'), null, '입은 캐릭터라도 요청하지 않았으면 잡지 않는다(0016과 다르다)');
    assert.equal(await claim('w1', 'trellis'), null);
    for (const id of [p1, p2]) assert.deepEqual(await keep('g9', id), { ok: true, kept: true });
    // 손님 한 번이라 둘째 요청은 관리자의 그림으로: 요청한 차례는 p1 → 관리자 그림
    assert.deepEqual(await request('g9', p1), { ok: true, already: false });
    const adminPic = await pic('admin');
    assert.deepEqual(await keep('admin', adminPic), { ok: true, kept: true });
    assert.deepEqual(await request('admin', adminPic, 'trellis'), { ok: true, already: false });
    await hdb.query(`update public.avatars set model_requested_at = now() - interval '2 minutes' where id = $1`, [p1]);
    await hdb.query(`update public.avatars set model_requested_at = now() - interval '1 minute' where id = $1`, [adminPic]);
    const worker = workerOf(hdb);
    // 제공자를 넘기지 않는 옛 일꾼(인자 이름 둘로 부른다: avatar-worker-5까지)에게는 요청한 줄이 있어도 아무것도 주지 않는다
    assert.equal(await worker.modelClaim('w1', 600), null);
    assert.equal(await asService((tx) => val(tx, 'select public.avatar_model_claim(p_worker => $1, p_lease_seconds => $2)', ['w-old', 600])), null);
    assert.deepEqual((await row(p1)).model_status, null, '옛 일꾼의 부름은 줄을 건드리지 않는다');
    await assert.rejects(asService((tx) => tx.query(`select public.avatar_model_claim('w1', 600, 'tripo')`)), /bad_via/);
    const first = await worker.modelClaim('w1', 600, 'meshy');
    assert.deepEqual({ ...first, requested_at: undefined },
      { id: p1, user_id: HU.g9, image_path: `${HU.g9}/chars/${p1}.png`, attempts: 1, bad_fails: 0, requested_at: undefined, via: 'meshy' });
    assert.equal(typeof first.requested_at, 'string');
    assert.equal(await sameRequest(p1, first.requested_at), true, '요청한 때를 함께 준다(바깥 3D 서비스 일꾼은 이 값이 있는 줄만 보낸다)');
    assert.equal(await worker.modelRelease(p1, 'w1', 0), true, '돌려놓은 요청은 다시 잡힌다');
    const again = await worker.modelClaim('w2', 600, 'meshy');
    assert.deepEqual({ ...again, requested_at: undefined },
      { id: p1, user_id: HU.g9, image_path: `${HU.g9}/chars/${p1}.png`, attempts: 2, bad_fails: 0, requested_at: undefined, via: 'meshy' });
    assert.equal(again.requested_at, first.requested_at, '돌려놓아도 요청한 때(차례)는 그대로');
    assert.equal(await worker.modelClaim('w1', 600, 'meshy'), null, 'Meshy 일꾼은 우리 컴퓨터로 요청한 줄을 잡지 않는다');
    const third = await worker.modelClaim('w3', 600, 'trellis');
    assert.deepEqual([third.id, third.via], [adminPic, 'trellis'], '그곳의 일꾼이 잡는다. 요청한 곳은 줄마다(그 사람에게 알린 곳)');
    assert.equal(await worker.modelClaim('w3', 600, 'trellis'), null);
    assert.equal(await worker.modelSettle(p1, 'ready', { maker: 'meshy-x', worker: 'w2' }), true);
    // 잡기는 여전히 비밀 키만
    for (const who of ['g9', 'visitor', 'anon']) await failsH(who, `select public.avatar_model_claim('x', 600)`, [], /permission denied/);
    assert.match(HISTORY_3D, /and model_requested_at is not null and model_request_via = p_via\n[^\n]*\n\s+order by model_requested_at, id limit 1 for update skip locked/);
  });

  test('일꾼의 한 바퀴(processModel)를 붙이면: 바깥 3D 서비스(Meshy)는 요청한 그림 하나만 받고 입은 캐릭터는 받지 않는다. 0021 전의 DB에서는 아무것도 보내지 않고 멈춘다', async () => {
    await hdb.query(`update public.avatars set model_requested_at = null, model_status = null, model_attempts = 0, model_bad_fails = 0,
      model_claimed_at = null, model_worker = null, model_not_before = null, model_reason = null, model_maker = null
      where model_requested_at is not null or model_status is not null`);
    /**
     * 바깥 3D 서비스(worker/avatar/meshy.mjs) 모양의 가짜: 받은 그림 id를 적는다. 요청한 줄만(requestedOnly),
     * 그것도 Meshy로 보낸다고 알리고 받은 요청만(consent) 보낸다. 작업을 만들면 onJob으로 알린다(값이 든 시도)
     */
    const external = (paid = true) => {
      const sent = [];
      return {
        sent, maker: 'meshy-7.1', leaseSec: 1200, maxBad: 2, requestedOnly: true, consent: 'meshy',
        async ready() { return true; },
        async toGlb(png, { key, onJob }) {
          sent.push(key);
          if (paid) await onJob?.();
          return { glb: serviceGlb(), stats: null };
        },
        async forget() {},
      };
    };
    const files = new Map();
    const store = {
      async download(p) {
        if (!files.has(p)) throw Object.assign(new Error('no such file'), { code: 'storage_error' });
        return files.get(p);
      },
      async upload(p, bytes) { files.set(p, bytes); },
      async remove(ps) { for (const p of ps) files.delete(p); },
    };
    const worn = await pic('g1');
    await wear('g1', worn);
    const chosen = await pic('g1');
    for (const id of [worn, chosen]) files.set(`${HU.g1}/chars/${id}.png`, PNG);
    assert.deepEqual(await keep('g1', chosen), { ok: true, kept: true });
    assert.deepEqual(await request('g1', chosen), { ok: true, already: false });
    const service = external();
    const db = workerOf(hdb);
    assert.deepEqual(await processModel({ db, store, service, worker: 'w-ext' }), { outcome: 'ready', id: chosen });
    assert.deepEqual(await processModel({ db, store, service, worker: 'w-ext' }), { outcome: 'idle' }, '입은 캐릭터는 요청하지 않아 잡히지 않는다');
    assert.deepEqual(service.sent, [chosen], '바깥으로 간 그림은 요청한 하나뿐');
    const [w, c] = [await row(worn), await row(chosen)];
    assert.deepEqual([w.model_status, w.model_attempts, c.model_status, c.model_maker, c.model_attempts], [null, 0, 'ready', 'meshy-7.1', 1]);
    assert.deepEqual([c.model_tries, c.model_job_at !== null], [1, true], '작업을 만든 알림(onJob)이 일꾼 어댑터로 DB에 닿아 한 번 센다');
    assert.ok(files.has(`${HU.g1}/models/${chosen}.v1.glb`));
    assert.deepEqual(countsOf(await quota('g1')).slice(2), [1, 1], '다 만든 3D는 한 번으로 센다');

    // 우리 컴퓨터에서 만든다고 알리고 받은 요청(사이트가 trellis였을 때): Meshy 일꾼은 잡지도 않는다(잡기가 제공자로 거른다)
    const local3d = await pic('g14');
    files.set(`${HU.g14}/chars/${local3d}.png`, PNG);
    assert.deepEqual(await keep('g14', local3d), { ok: true, kept: true });
    assert.deepEqual(await request('g14', local3d, 'trellis'), { ok: true, already: false });
    const switched = external();
    assert.deepEqual(await processModel({ db, store, service: switched, worker: 'w-ext' }), { outcome: 'idle' });
    assert.deepEqual(switched.sent, [], 'Meshy로 보내지 않는다');
    assert.deepEqual([(await row(local3d)).model_status, (await row(local3d)).model_attempts], [null, 0], '잡지 않아 잡은 횟수도 그대로');
    // 우리 컴퓨터(trellis 모양, consent 없음, 값이 들지 않아 알리지 않음)는 우리 컴퓨터로 요청한 줄만 잡아 만든다(바깥으로 보내지 않는다).
    // Meshy로 요청한 줄은 잡지 않는다: Meshy로 고른 사람의 한 번뿐인 3D를 다른 곳의 결과로 쓰지 않게
    const meshyAsked = await pic('admin');
    files.set(`${HU.admin}/chars/${meshyAsked}.png`, PNG);
    assert.deepEqual(await keep('admin', meshyAsked), { ok: true, kept: true });
    assert.deepEqual(await request('admin', meshyAsked, 'meshy'), { ok: true, already: false });
    const gpu = { ...external(false), requestedOnly: undefined, consent: undefined, maker: 'trellis-image-large', leaseSec: undefined, maxBad: undefined };
    assert.deepEqual(await processModel({ db, store, service: gpu, worker: 'w-local' }), { outcome: 'ready', id: local3d });
    assert.deepEqual(await processModel({ db, store, service: gpu, worker: 'w-local' }), { outcome: 'idle' }, 'Meshy로 요청한 줄은 잡지 않는다');
    assert.deepEqual(gpu.sent, [local3d]);
    assert.equal((await row(local3d)).model_tries, 0, '우리 컴퓨터는 돈이 든 시도에 들지 않는다');
    assert.deepEqual(await processModel({ db, store, service: switched, worker: 'w-ext' }), { outcome: 'ready', id: meshyAsked });
    assert.deepEqual(switched.sent, [meshyAsked]);
    assert.equal((await row(meshyAsked)).model_tries, 1);
    // 제공자를 거르지 않는 잡기(이 판 전의 0021)가 다른 곳의 줄을 주면 Meshy 일꾼이 한 번 더 보고 reconsent로 돌려준다
    const relaxed = { ...db, modelClaim: async (w, lease) => {
      const j = await db.modelClaim(w, lease, 'trellis');
      return j;
    } };
    const other = await pic('g14');
    files.set(`${HU.g14}/chars/${other}.png`, PNG);
    await hdb.query(`update public.avatars set model_requested_at = null where id = $1`, [local3d]);
    assert.deepEqual(await keep('g14', other), { ok: true, kept: true });
    assert.deepEqual(await request('g14', other, 'trellis'), { ok: true, already: false });
    const strict = external();
    assert.deepEqual(await processModel({ db: relaxed, store, service: strict, worker: 'w-ext' }),
      { outcome: 'failed', reason: 'reconsent', id: other, trouble: false });
    assert.deepEqual(strict.sent, [], 'Meshy로 보내지 않는다');
    const back = await row(other);
    assert.deepEqual([back.model_status, back.model_reason, back.model_tries], ['failed', 'reconsent', 0]);
    assert.deepEqual(countsOf(await quota('g14')).slice(2), [0, 0]);

    // 0021 전의 DB(0016의 잡기): 걷기에 입은 캐릭터를 저절로 준다. 바깥 3D 서비스는 받지 않고 돌려놓은 뒤 3D 모형을 멈춘다
    const old = await avatarDb(AVATAR_CHAIN, true);
    try {
      // 0021 머리말의 「일꾼을 다시 띄우기 전에 보는」 확인(머리말의 쿼리 그대로): 0021이면 t, 그 전이면 f
      const claimCheck = `select coalesce((select prosrc like '%''requested_at''%' and prosrc like '%''via''%' and prosrc like '%model_request_via = p_via%'
     from pg_proc where oid = to_regprocedure('public.avatar_model_claim(text, integer, text)')), false) as v`;
      assert.ok(HISTORY_3D.includes(claimCheck.slice(0, -' as v'.length).replace('\n     from', '\n--     from')), '머리말의 쿼리와 같다');
      assert.deepEqual([await val(hdb, claimCheck), await val(old, claimCheck)], [true, false]);
      const uid = '00000000-0000-4000-8000-0000000003b1';
      const id = crypto.randomUUID();
      await old.query(`insert into auth.users (id, email) values ($1, 'worn@history.test')`, [uid]);
      await old.query(`insert into public.avatars (id, user_id, status, image_path, original_path, consent_at)
        values ($1::uuid, $2::uuid, 'ready', $2::text || '/chars/' || $1::text || '.png', $2::text || '/originals/' || $1::text || '.jpg', now())`, [id, uid]);
      await old.query(`insert into public.profiles (user_id, look) values ($1::uuid, $2::jsonb)`,
        [uid, JSON.stringify({ kind: 'photo', url: `/api/avatar/${id}` })]);
      files.set(`${uid}/chars/${id}.png`, PNG);
      const ext = external();
      const logs = [];
      const log = (level, msg) => logs.push(msg);
      const turn = createModelsTurn({
        ready: () => ext.ready(),
        run: () => processModel({ db: workerOf(old), store, service: ext, worker: 'w-ext', log }),
        log,
      });
      assert.equal(await turn(), false);
      assert.equal(turn.halted(), true, '3D 모형을 멈춘다(일꾼을 다시 띄울 때까지)');
      assert.equal(await turn(), false);
      assert.deepEqual(ext.sent, [], '입은 캐릭터를 바깥으로 보내지 않는다');
      assert.deepEqual((await old.query('select model_status, model_attempts, model_worker from public.avatars where id = $1', [id])).rows[0],
        { model_status: null, model_attempts: 1, model_worker: null }, '잡힌 줄은 바로 돌려놓는다(잡은 횟수 하나는 쓴다)');
      assert.deepEqual(logs.filter((m) => /not requested|halted/.test(m)),
        ['model job was not requested (DB before 0021?): not sent', 'models halted until restart']);
      // 우리 컴퓨터(trellis 모양, requestedOnly·consent 없음)는 0021 전의 DB에서 지금처럼 입은 캐릭터를 만든다
      const local = { ...external(), requestedOnly: undefined, consent: undefined, maker: 'trellis-image-large', leaseSec: undefined, maxBad: undefined };
      assert.deepEqual(await processModel({ db: workerOf(old), store, service: local, worker: 'w-local' }), { outcome: 'ready', id });
      assert.deepEqual(local.sent, [id]);
    } finally {
      await old.close();
    }
  });

  test('없는 3D(avatar_asset_state): 요청한 그림 pending, 다 만든 것 ready, 실패 none, 요청하지 않은 그림은 주인에게만 pending', async () => {
    const idle = await pic('g10');
    assert.equal(await state('g10', idle), 'pending', '주인은 걷다가 요청할 수 있다');
    assert.equal(await state('g1', idle), 'none', '다른 사람의 화면은 다시 묻지 않는다');
    assert.deepEqual(await keep('g10', idle), { ok: true, kept: true });
    assert.deepEqual(await request('g10', idle), { ok: true, already: false });
    assert.equal(await state('g1', idle), 'pending');
    await hdb.query(`update public.avatars set model_requested_at = now() - interval '1 day' where id = $1`, [idle]);
    assert.equal((await claim('w9')).id, idle);
    assert.equal(await state('g1', idle), 'pending', '만드는 중');
    assert.equal(await settleModel(idle, 'failed', 'w9'), true);
    assert.equal(await state('g1', idle), 'none');
    assert.equal(await state('g10', idle), 'none', '실패로 굳으면 주인에게도 none');
    const drawingNow = await begin('g10');
    assert.equal(await state('g10', drawingNow.id), 'none', '그리는 중인 그림은 아직 3D를 요청할 수 없다');
    assert.equal(await state('visitor', idle), 'none');
  });

  test('이력에서 작업대로: 빈 칸에, 고른 칸과 맞바꾸기(맞바꾼 그림은 이력으로), 작업대 안에서는 칸끼리 맞바꾸기, 빈 칸이 없으면 bench_full', async () => {
    await hdb.query(`delete from public.avatars where user_id = $1`, [HU.g8]);
    const [a, b, c, d] = await pics('g8', 4);
    assert.deepEqual(await bench('g8'), [[1, a], [2, b], [3, c]]);
    assert.equal((await row(d)).slot, null);
    assert.deepEqual(await toBench('g8', d), { ok: false, reason: 'bench_full' });
    assert.deepEqual(await toBench('g8', d, 2), { ok: true, slot: 2, moved: b });
    assert.deepEqual(await bench('g8'), [[1, a], [2, d], [3, c]]);
    assert.deepEqual([(await row(b)).slot, (await row(b)).status], [null, 'ready'], '맞바꾼 그림은 지우지 않고 이력으로');
    assert.ok((await row(d)).slot_at !== null);
    // 작업대 안에서 칸끼리
    assert.deepEqual(await toBench('g8', a, 3), { ok: true, slot: 3, moved: c });
    assert.deepEqual(await bench('g8'), [[1, c], [2, d], [3, a]]);
    assert.deepEqual(await toBench('g8', a, 3), { ok: true, slot: 3, moved: null }, '이미 그 칸이면 그대로');
    assert.deepEqual(await toBench('g8', a), { ok: true, slot: 3, moved: null });
    // 빈 칸이 생기면 고르지 않아도 거기로
    assert.equal(await forget('g8', c), true);
    assert.deepEqual(await toBench('g8', b), { ok: true, slot: 1, moved: null });
    assert.deepEqual(await bench('g8'), [[1, b], [2, d], [3, a]]);
    // 막 꺼낸 그림은 다음 만들기에 바로 밀려나지 않는다(작업대에 들어온 때로 잰다)
    await benchedAgo(d, 30);
    await benchedAgo(a, 20);
    const made = await begin('g8');
    assert.deepEqual([made.ok, made.slot, made.freed], [true, 2, d], '가장 오래 있던 d의 칸. 막 꺼낸 b(가장 오래 전에 만듦)는 그대로');
    // 손님의 칸 번호는 1~3, 지운 그림·남의 그림은 못 꺼낸다
    await failsH('g8', 'select public.avatar_to_bench($1, 4::smallint)', [a], /bad_slot/);
    await failsH('g8', 'select public.avatar_to_bench($1, 0::smallint)', [a], /bad_slot/);
    assert.deepEqual(await toBench('g8', c), { ok: false, reason: 'not_found' });
    assert.deepEqual(await toBench('g1', a, 1), { ok: false, reason: 'not_found' });
    assert.deepEqual(await toBench('visitor', a), { ok: false, reason: 'not_guest' });
  });

  test('작업대 돌리기: 지금 입은 캐릭터는 ★처럼 마지막에 고르고, 다 그린 그림을 그리는 중인 그림보다 먼저 비운다', async () => {
    await hdb.query(`delete from public.avatars where user_id = $1`, [HU.g12]);
    const [a, b, c] = await pics('g12', 3);
    await benchedAgo(a, 30);
    await benchedAgo(b, 20);
    await benchedAgo(c, 10);
    await wear('g12', a);
    const d = await begin('g12');
    assert.deepEqual([d.ok, d.slot, d.freed], [true, 2, b], '가장 오래 있던 a는 입은 캐릭터라 두고, 그다음 b의 칸');
    // d(그리는 중)가 가장 새것이 아니어도, 다 그린 c를 먼저 비운다
    await benchedAgo(d.id, 40);
    const e = await begin('g12');
    assert.deepEqual([e.ok, e.slot, e.freed], [true, 3, c], '그리는 중인 d가 더 오래 있었어도 다 그린 c부터');
    // 남은 것이 입은 a와 그리는 중인 d, e뿐이면 그리는 중인 것을 먼저(입은 캐릭터는 맨 나중)
    const f = await begin('g12');
    assert.deepEqual([f.ok, f.freed], [true, d.id]);
    assert.equal((await row(a)).slot, 1, '입은 캐릭터는 작업대에 남는다');
  });

  test('작업대 칸 수는 역할마다: 가족·관리자는 1~9번을 다 채운 뒤에야 가장 오래 있던 칸을 비우고, 손님은 셋째 뒤부터', async () => {
    for (const who of ['family3', 'admin2']) {
      const made = [];
      for (let k = 0; k < 9; k++) made.push(await make(who));
      assert.deepEqual(made.map((r) => [r.slot, r.freed]), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, null]), `${who}: 빈 칸이 있으면 비우지 않는다`);
      // 가장 오래 있던 것은 4번 칸
      for (const [k, m] of made.entries()) await benchedAgo(m.id, k === 3 ? 500 : 100 - k * 10);
      const tenth = await make(who);
      assert.deepEqual([tenth.slot, tenth.freed], [4, made[3].id], `${who}: 아홉이 다 찬 뒤에 가장 오래 있던 4번 칸을 비워 새 그림에 준다`);
      assert.equal((await bench(who)).length, 9);
      assert.deepEqual([(await row(made[3].id)).slot, (await row(made[3].id)).status], [null, 'ready'], '비운 그림은 이력에만');
      // 9번 칸이 가장 오래면 9번(칸 수의 끝도 돌린다)
      await benchedAgo(made[8].id, 900);
      const eleventh = await make(who);
      assert.deepEqual([eleventh.slot, eleventh.freed], [9, made[8].id]);
    }
    // 9번 칸을 내준 그림도 새 그림이 다 그려지지 못하면(사진 거절) 그 칸으로 돌아온다
    const last = (await bench('admin2')).find(([s]) => s === 9)[1];
    await benchedAgo(last, 2000);
    const trial = await begin('admin2');
    assert.deepEqual([trial.slot, trial.freed], [9, last]);
    assert.equal(await val(hdb, `select public.avatar_settle($1, 'rejected', null, null, 'm', 'child')`, [trial.id]), true);
    assert.equal((await row(last)).slot, 9, '9번 칸을 내준 그림이 돌아온다');
    assert.equal((await bench('admin2')).length, 9);
    // 손님은 그대로 셋: 넷째가 셋째 칸 안에서 돈다
    const g = [];
    for (let k = 0; k < 4; k++) g.push(await make('g17'));
    assert.deepEqual(g.map((r) => r.slot), [1, 2, 3, 1]);
    assert.equal(g[3].freed, g[0].id);
    assert.deepEqual((await bench('g17')).map(([n]) => n), [1, 2, 3]);
  });

  test('작업대로 꺼내기도 역할의 칸 수까지: 가족은 9번 칸에 놓고 맞바꾸고 10번은 bad_slot, 손님은 4번부터 bad_slot. DB의 칸 번호는 1~9', async () => {
    // 앞 시험에서 family3의 작업대 아홉 칸이 찼고 이력에 둘이 있다
    const hist = (await hdb.query(`select id from public.avatars where user_id = $1 and slot is null and status = 'ready'
      order by created_at limit 1`, [HU.family3])).rows[0].id;
    assert.deepEqual(await toBench('family3', hist), { ok: false, reason: 'bench_full' });
    const at = async (n) => (await bench('family3')).find(([s]) => s === n)?.[1];
    const nine = await at(9);
    assert.deepEqual(await toBench('family3', hist, 9), { ok: true, slot: 9, moved: nine });
    assert.equal((await row(nine)).slot, null, '9번 칸에서 밀린 그림은 이력으로');
    // 작업대 안에서 9번과 1번 맞바꾸기
    const one = await at(1);
    assert.deepEqual(await toBench('family3', hist, 1), { ok: true, slot: 1, moved: one });
    assert.deepEqual([(await row(hist)).slot, (await row(one)).slot], [1, 9]);
    await failsH('family3', 'select public.avatar_to_bench($1, 10::smallint)', [hist], /bad_slot/);
    // 빈 칸이 생기면 고르지 않아도 거기로(9번 칸까지 본다)
    assert.equal(await forget('family3', one), true);
    assert.deepEqual(await toBench('family3', nine), { ok: true, slot: 9, moved: null });
    // 손님은 1~3번만
    const [gp] = await pics('g17', 1);
    for (const n of [4, 9]) await failsH('g17', `select public.avatar_to_bench($1, ${n}::smallint)`, [gp], /bad_slot/);
    // DB의 범위 검사: 칸 번호는 1~9(역할과 상관없이 끝)
    await assert.rejects(hdb.query('update public.avatars set slot = 10 where id = $1', [gp]), /avatars_slot_range/);
    const def = (await hdb.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'avatars_slot_range'`)).rows[0].d;
    assert.match(def, /slot >= 1\) AND \(slot <= 9\)/);
  });

  test('칸 수는 세션의 명단 역할로만: 지어낸 역할로 늘지 않고, 가족이 손님이 되면 4번부터는 이력으로 보며(번호는 둔다) 1~3번만 쓴다', async () => {
    const ids = await pics('family4', 5);
    assert.deepEqual((await bench('family4')).map(([n]) => n), [1, 2, 3, 4, 5]);
    const setRole = (role) => asH('admin', (tx) => tx.query(`update public.roster set role = $2 where email = $1`, [HEMAIL.family4, role]));
    await setRole('guest');
    try {
      assert.equal((await quota('family4')).slots, 3);
      // 4·5번이 가장 오래 있었어도 손님 칸(1~3) 안에서만 비우고 준다
      for (const [k, m] of [[0, 30], [1, 20], [2, 10], [3, 500], [4, 400]]) await benchedAgo(ids[k], m);
      const r = await make('family4');
      assert.deepEqual([r.slot, r.freed], [1, ids[0]]);
      assert.deepEqual([(await row(ids[3])).slot, (await row(ids[4])).slot], [4, 5], '4·5번 번호는 지우지 않는다(작업대 밖)');
      // 4번에 있던 그림은 이력에서 오는 것: 빈 칸이 없으면 bench_full, 고른 칸과 바꾸면 밀린 그림이 이력으로
      assert.deepEqual(await toBench('family4', ids[3]), { ok: false, reason: 'bench_full' });
      assert.deepEqual(await toBench('family4', ids[3], 2), { ok: true, slot: 2, moved: ids[1] });
      assert.deepEqual([(await row(ids[3])).slot, (await row(ids[1])).slot], [2, null]);
      await failsH('family4', 'select public.avatar_to_bench($1, 5::smallint)', [ids[4]], /bad_slot/);
      // 지어낸 역할(JWT)이나 스스로 고친 명단으로는 칸 수가 늘지 않는다
      const forged = { app_metadata: { provider: 'google', providers: ['google'], role: 'family' }, user_metadata: { role: 'admin' }, user_role: 'admin' };
      assert.equal((await quota('family4', forged)).slots, 3);
      await assert.rejects(asH('family4', (tx) => tx.query('select public.avatar_to_bench($1, 4::smallint)', [ids[4]]), forged), /bad_slot/);
      await asH('family4', (tx) => tx.query(`update public.roster set role = 'family' where email = $1`, [HEMAIL.family4]));
      assert.equal((await quota('family4')).slots, 3);
    } finally {
      await setRole('family');
    }
    // 역할이 돌아오면 9칸: 남겨 둔 5번이 다시 작업대에 보이고, 새 그림은 빈 칸 가운데 가장 작은 4번에
    assert.equal((await quota('family4')).slots, 9);
    assert.deepEqual((await bench('family4')).map(([n]) => n), [1, 2, 3, 5]);
    const next = await make('family4');
    assert.deepEqual([next.slot, next.freed], [4, null]);
  });

  test('칸을 내준 그림은 새 그림이 다 그려지지 못하면 돌아온다: 거절·실패·그리다 그만둠. 다 그리면 돌아오지 않는다', async () => {
    const fresh = async () => {
      await hdb.query(`delete from public.avatars where user_id = $1`, [HU.g13]);
      const ids = await pics('g13', 3);
      for (const [k, id] of ids.entries()) await benchedAgo(id, 30 - k * 10);
      return ids;
    };
    const settle = (id, status) => val(hdb, `select public.avatar_settle($1, $2, null, $3, 'm', $4)`,
      [id, status, status === 'ready' ? `${HU.g13}/chars/${id}.png` : null, status === 'ready' ? null : 'child']);
    // 사진이 거절됨(아이로 보임 등): 비운 그림이 그 칸에 돌아온다. 작업대에 있던 차례(slot_at)도 그대로
    let [a, b, c] = await fresh();
    const slotAt = (await row(a)).slot_at;
    let d = await begin('g13');
    assert.deepEqual([d.slot, d.freed], [1, a]);
    assert.equal(await settle(d.id, 'rejected'), true);
    assert.deepEqual(await bench('g13'), [[1, a], [2, b], [3, c]]);
    assert.equal(String((await row(a)).slot_at), String(slotAt));
    // 그리기 실패, 사진을 올리지 못하고 멈춘 줄(일꾼의 정리), 본인이 그리다 그만둠도 같다
    for (const end of ['failed', 'stale', 'forget']) {
      [a, b, c] = await fresh();
      d = await begin('g13');
      assert.equal(d.freed, a, end);
      if (end === 'failed') assert.equal(await settle(d.id, 'failed'), true);
      if (end === 'forget') assert.equal(await forget('g13', d.id), true);
      if (end === 'stale') {
        await hdb.query(`update public.avatars set created_at = now() - interval '31 minutes' where id = $1`, [d.id]);
        await claimDraw();
      }
      assert.deepEqual(await bench('g13'), [[1, a], [2, b], [3, c]], end);
    }
    // 다 그렸으면 돌아오지 않는다(그 뒤에 지워도)
    [a, b, c] = await fresh();
    d = await begin('g13');
    assert.equal(await settle(d.id, 'ready'), true);
    assert.equal(await forget('g13', d.id), true);
    assert.deepEqual(await bench('g13'), [[2, b], [3, c]]);
    assert.equal((await row(a)).slot, null);
    // 그사이 칸을 내준 그림을 다른 칸에 꺼냈거나 지웠으면 그대로 둔다
    [a, b, c] = await fresh();
    d = await begin('g13');
    assert.deepEqual(await toBench('g13', a, 2), { ok: true, slot: 2, moved: b });
    assert.equal(await settle(d.id, 'rejected'), true);
    assert.deepEqual(await bench('g13'), [[2, a], [3, c]], '이미 작업대에 있는 a를 옮기지 않는다');
    [a, b, c] = await fresh();
    d = await begin('g13');
    assert.equal(await forget('g13', a), true);
    assert.equal(await settle(d.id, 'rejected'), true);
    assert.deepEqual(await bench('g13'), [[2, b], [3, c]], '지운 그림은 돌아오지 않는다');
  });

  test('남의 줄은 보관·작업대·3D 요청을 하지 못하고, 새 칸을 직접 고치지 못한다', async () => {
    const theirs = await pic('g6');
    assert.deepEqual(await keep('g5', theirs), { ok: false, reason: 'not_found' });
    assert.deepEqual(await keep('g5', theirs, false), { ok: false, reason: 'not_found' });
    assert.deepEqual(await toBench('g5', theirs, 1), { ok: false, reason: 'not_found' });
    assert.deepEqual(await request('g5', theirs), { ok: false, reason: 'not_found' });
    assert.deepEqual(await request('g5', crypto.randomUUID()), { ok: false, reason: 'not_found' });
    for (const col of ['kept_at = now()', 'model_requested_at = now()', 'slot_at = now()', 'slot = 1', 'model_tries = 0',
      `model_request_via = 'meshy'`, 'slot_freed = id', 'model_job_at = null']) {
      await failsH('g6', `update public.avatars set ${col} where id = $1`, [theirs], /permission denied/);
    }
    const r = await row(theirs);
    assert.deepEqual([r.kept_at, r.model_requested_at], [null, null]);
    // 다른 사람의 그림을 읽을 수도 없다(RLS: 내 줄만)
    assert.equal(await call('g5', 'select count(*)::int from public.avatars where id = $1', [theirs]), 0);
    // DB 제약: 보관은 다 그린 그림에만, 3D 요청은 다 그린(또는 지운) 그림에만
    const drawing = await begin('g6');
    await assert.rejects(hdb.query(`update public.avatars set kept_at = now() where id = $1`, [drawing.id]), /avatars_kept_ready/);
    await assert.rejects(hdb.query(`update public.avatars set model_requested_at = now() where id = $1`, [drawing.id]), /avatars_model_request_state/);
  });

  test('부르는 쪽이 한도를 늘리지 못한다: JWT에 적은 역할, 스스로 고친 명단, 숫자 표 직접 부르기 모두 소용없다', async () => {
    const forged = { app_metadata: { provider: 'google', providers: ['google'], role: 'admin' }, user_metadata: { role: 'admin' }, user_role: 'admin' };
    assert.deepEqual(capsOf(await quota('g4', forged)), [10, 3, 1, 2]);
    const extra = await pic('g4');
    assert.deepEqual(await asH('g4', (tx) => val(tx, 'select public.avatar_keep($1, true)', [extra]), forged), { ok: false, reason: 'keep_full', cap: 3 });
    await asH('g4', (tx) => tx.query(`update public.roster set role = 'admin' where email = $1`, [HEMAIL.g4]));
    assert.equal(await call('g4', 'select public.my_role()'), 'guest');
    assert.deepEqual(await keep('g4', extra), { ok: false, reason: 'keep_full', cap: 3 });
    while ((await quota('g3')).history < 10) await pic('g3');
    assert.deepEqual(await begin('g3', 100000, forged), { ok: false, reason: 'history_full' }, '이력이 찬 손님은 지어낸 역할로도 못 만든다');
    await failsH('g4', 'select public.avatar_limits()', [], /permission denied/);
    // 관리자가 명단 역할을 바꾸면 다음 요청부터 그 한도
    await asH('admin', (tx) => tx.query(`update public.roster set role = 'family' where email = $1`, [HEMAIL.g4]));
    assert.deepEqual(capsOf(await quota('g4')), [20, 5, 1, 2]);
    assert.deepEqual(await keep('g4', extra), { ok: true, kept: true });
    await asH('admin', (tx) => tx.query(`update public.roster set role = 'guest' where email = $1`, [HEMAIL.g4]));
  });

  test('권한: 새 함수는 로그인한 사람만, 잡기는 비밀 키만, 트리거 함수와 숫자 표는 아무도', async () => {
    const can = async (role, sig) => (await hdb.query(`select has_function_privilege($1, $2, 'execute') as v`, [role, `public.${sig}`])).rows[0].v;
    const SIGS = ['avatar_keep(uuid, boolean)', 'avatar_to_bench(uuid, smallint)', 'avatar_model_request(uuid, text)', 'avatar_quota()',
      'avatar_begin(boolean, int)', 'avatar_asset_state(uuid, text)', 'avatar_model_claim(text, int, text)', 'avatar_limits()',
      'avatars_slot_assign()', 'avatars_history_guard()', 'avatars_bench_restore()', 'avatar_model_blocked(text, text)',
      'avatar_model_job(uuid)', 'avatar_bench_max(text)'];
    const of = async (role) => Promise.all(SIGS.map((s) => can(role, s)));
    assert.deepEqual(await of('authenticated'), [true, true, true, true, true, true, false, false, false, false, false, false, false, false]);
    // 작업대 칸 수(역할 → 칸 수)는 함수 안에서만 읽는다: 역할 이름을 넘겨 큰 칸 수를 받아 갈 수 없다
    await failsH('g1', `select public.avatar_bench_max('admin')`, [], /permission denied/);
    assert.deepEqual(await of('anon'), SIGS.map(() => false));
    assert.equal(await can('service_role', 'avatar_model_claim(text, int, text)'), true);
    // 0016의 두 인자 모양은 남지 않는다(인자 둘로 부르는 옛 일꾼의 부름이 셋째 인자의 기본값(null)으로 가서 아무것도 받지 않게)
    assert.equal((await hdb.query(`select to_regprocedure('public.avatar_model_claim(text, integer)') as f`)).rows[0].f, null);
    assert.equal(await can('service_role', 'avatar_model_job(uuid)'), true, '돈이 든 작업 알리기는 일꾼(비밀 키)만');
    // 모두의 하루 3D 상한 때문에 요청은 잠금 하나를 더 잡는다(사람마다의 잠금보다 먼저)
    assert.match(HISTORY_3D, /pg_advisory_xact_lock\(hashtext\('joyeondang:avatar_model_day'\)\);\n  perform pg_advisory_xact_lock\(hashtext\('joyeondang:avatar_user'\)/);
    for (const sql of ['select public.avatar_keep($1, true)', 'select public.avatar_to_bench($1)', `select public.avatar_model_request($1, 'meshy')`]) {
      await failsH('anon', sql, [crypto.randomUUID()], /permission denied/);
    }
    // 옛 모양(요청한 곳 없이)은 남지 않는다: 사이트는 늘 곳을 넘긴다
    assert.equal((await hdb.query(`select to_regprocedure('public.avatar_model_request(uuid)') as f`)).rows[0].f, null);
    // 사람마다 잠금: 같은 사람의 작업대·보관·요청 고치기가 겹치지 않는다(PGlite는 연결이 하나라 동시 호출은 못 만든다)
    assert.equal((HISTORY_3D.match(/pg_advisory_xact_lock\(hashtext\('joyeondang:avatar_user'\), hashtext\(auth\.uid\(\)::text\)\)/g) ?? []).length, 4);
  });

  test('이미 있는 줄: 작업대 줄에 들어온 때를 적고, 0019의 칸 번호는 그대로 작업대가 된다. 앞의 마이그레이션이 없으면 아무것도 바꾸지 않는다', async () => {
    const d = await avatarDb(AVATAR_CHAIN, true);
    const uid = '00000000-0000-4000-8000-0000000003a1';
    // 운영에 이미 1~3번 칸을 쓰는 가족(0019의 칸 셋)
    const fam = '00000000-0000-4000-8000-0000000003a2';
    await d.query(`insert into auth.users (id, email) values ($1, 'old@history.test'), ($2, 'oldfam@history.test')`, [uid, fam]);
    await d.query(`insert into public.roster (display_name, role, email, claimed_by) values ('옛가족', 'family', 'oldfam@history.test', $1)`, [fam]);
    const ids = [];
    const insertOld = (who, k) => {
      const id = crypto.randomUUID();
      return d.query(`insert into public.avatars (id, user_id, status, image_path, original_path, consent_at, created_at)
        values ($1::uuid, $2::uuid, 'ready', $2::text || '/chars/' || $1::text || '.png', $2::text || '/originals/' || $1::text || '.jpg',
                now(), now() - make_interval(hours => $3::int))`, [id, who, 10 - k]).then(() => id);
    };
    for (let k = 0; k < 4; k++) ids.push(await insertOld(uid, k));
    for (let k = 0; k < 3; k++) await insertOld(fam, k);
    await d.exec(HISTORY_3D);
    const rows = (await d.query(`select id, slot, slot_at = created_at as same, kept_at, model_requested_at from public.avatars
      where user_id = $1 order by created_at`, [uid])).rows;
    assert.deepEqual(rows.map((r) => [r.slot, r.same, r.kept_at, r.model_requested_at]),
      [[1, true, null, null], [2, true, null, null], [3, true, null, null], [null, null, null, null]],
      '칸이 있는 줄은 만든 때를 들어온 때로, 넷째(칸 밖)는 이력에만');
    // 그 가족의 넷째 만들기: 9칸이 되었으니 아무것도 비우지 않고 4번 칸에 들어간다(1~3번은 그대로)
    const famBegin = await inTx(d, claimsOf(fam, 'oldfam@history.test'), (tx) => val(tx, 'select public.avatar_begin(true, 150)'));
    assert.deepEqual([famBegin.ok, famBegin.slot, famBegin.freed], [true, 4, null], JSON.stringify(famBegin));
    assert.deepEqual((await d.query(`select slot from public.avatars where user_id = $1 and slot is not null order by slot`, [fam])).rows
      .map((r) => r.slot), [1, 2, 3, 4]);
    await d.close();
    // 0020이 없으면, 0019가 없으면, 0016이 없으면 맨 앞에서 멈춘다
    const cases = [
      [AVATAR_CHAIN, false, /0021_needs_0020/],
      [AVATAR_CHAIN.filter((f) => f !== '0019_avatar_slots.sql'), false, /0021_needs_0019/],
      [AVATAR_CHAIN.filter((f) => !['0016_avatar_models.sql', '0019_avatar_slots.sql'].includes(f)), false, /0021_needs_0016/],
      [['0001_init.sql'], false, /0021_needs_0001_0003/],
    ];
    for (const [chain, caps, re] of cases) {
      const x = await avatarDb(chain, caps);
      await assert.rejects(x.exec(HISTORY_3D), re);
      const r = (await x.query(`select to_regprocedure('public.avatar_keep(uuid, boolean)') is null as no_keep,
        (select count(*)::int from pg_catalog.pg_attribute where attrelid = to_regclass('public.avatars')
           and attname in ('kept_at', 'model_requested_at', 'slot_at', 'model_tries', 'model_request_via', 'slot_freed', 'model_job_at')
           and not attisdropped) as cols`)).rows[0];
      assert.deepEqual(r, { no_keep: true, cols: 0 }, String(re));
      await x.close();
    }
  });
});

// ───────────────────────────── 캐릭터 관리 콘솔(집주인)과 3D 판 번호(0024)
// 0001부터 0021까지 올린 위에 0024를 두 번 올린 DB를 따로 쓴다(위 묶음들과 섞지 않는다).
// 관리자 함수는 집주인만 부르고, 새 표(버릴 목록, 조작 기록)는 아무도 직접 읽지 못한다. 목록은 원본 사진 경로를 내보내지 않는다.
// 3D 다시 만들기: 바깥 3D 서비스(Meshy)로 보내려면 주인이 관리자이거나, 그 그림의 요청 줄에 meshy 동의가 있거나, 집주인이 「본인에게
// 들었어요」를 확인해야 한다(근거는 기록에). 관리자가 한 것은 주인의 시도 누적과 오늘 모두의 3D 수에 들지 않는다.
// 이전 모형은 새 모형이 될 때까지 보이고, 판 번호는 3D가 다 될 때마다 오르며 줄지 않는다.
// 버릴 목록은 사이트가 만드는 모양의 경로만 받고 비밀 키로만 비우며, 지금 쓰는 경로는 빼고 일꾼이 곧 쓸 경로는 남긴다.
const ADMIN_CONSOLE = readMigration('0024_admin_characters.sql');

describe('캐릭터 관리 콘솔·3D 판 번호(0024)', () => {
  const CU = {
    admin: '00000000-0000-4000-8000-0000000004a1',
    family: '00000000-0000-4000-8000-0000000004f1',
    ...Object.fromEntries(Array.from({ length: 9 }, (_, k) => [`g${k + 1}`, `00000000-0000-4000-8000-0000000004${String(k + 1).padStart(2, '0')}`])),
    visitor: '00000000-0000-4000-8000-000000000499',
  };
  const CROLE = Object.fromEntries(Object.keys(CU).filter((k) => k !== 'visitor')
    .map((k) => [k, k === 'admin' ? 'admin' : k === 'family' ? 'family' : 'guest']));
  const CEMAIL = Object.fromEntries(Object.keys(CU).map((k) => [k, `${k}@console.test`]));
  const NAME = Object.fromEntries(Object.keys(CROLE).map((k, i) => [k, `콘솔${i + 1}`]));
  let cdb;

  const asC = (who, fn) => inTx(cdb, who === 'anon' ? null : claimsOf(CU[who], CEMAIL[who]), fn);
  const asService = (fn) => cdb.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', '', true)`);
    await tx.query('set local role service_role');
    return fn(tx);
  });
  async function failsC(who, sql, params, pattern) {
    await assert.rejects(asC(who, (tx) => tx.query(sql, params)), (err) => {
      assert.match(String(err.message), pattern);
      return true;
    });
  }
  const call = (who, sql, params = []) => asC(who, (tx) => val(tx, sql, params));
  const rows = (who, sql, params = []) => asC(who, async (tx) => (await tx.query(sql, params)).rows);
  const quota = (who) => call(who, 'select public.avatar_quota()');
  const list = (who, filter = 'all', o = {}) => rows(who,
    'select * from public.admin_characters($1, $2, $3, $4, $5, $6, $7, $8)',
    [filter, o.role ?? null, o.maker ?? null, o.q ?? null, o.mine ?? false, o.limit ?? 40, o.before ?? null, o.beforeId ?? null]);
  const remake = (id, via = 'meshy', told = false, who = 'admin') =>
    call(who, 'select public.admin_avatar_remake_model($1, $2, $3)', [id, via, told]);
  const forgetModel = (id, who = 'admin') => call(who, 'select public.admin_avatar_forget_model($1)', [id]);
  const redraw = (id, who = 'admin') => call(who, 'select public.admin_avatar_redraw($1)', [id]);
  const forgetChar = (id, who = 'admin') => call(who, 'select public.admin_avatar_forget($1)', [id]);
  const shown = (who, id) => call(who, 'select public.avatar_model_shown($1)', [id]);
  const row = async (id) => (await cdb.query('select * from public.avatars where id = $1', [id])).rows[0];
  const trash = async () => (await cdb.query('select path from public.avatar_trash order by path')).rows.map((r) => r.path);
  const trashList = () => asService(async (tx) => (await tx.query('select path from public.avatar_trash_list(100)')).rows.map((r) => r.path));
  const trashDone = (paths) => asService((tx) => val(tx, 'select public.avatar_trash_done($1)', [paths]));
  const logOf = (id) => rows('admin', 'select * from public.admin_avatar_log(50, $1)', [id]);
  // 잡기는 일꾼의 제공자로 요청한 줄만 준다(0021): Meshy 일꾼이 기본, 우리 컴퓨터 3D는 'trellis'를 넘긴다
  const claim = (worker = 'w1', via = 'meshy') => asService((tx) => val(tx, 'select public.avatar_model_claim($1, 600, $2)', [worker, via]));
  const jobMade = (id) => asService((tx) => val(tx, 'select public.avatar_model_job($1)', [id]));
  const settleModel = (id, status, worker = 'w1', maker = 'meshy-7.1') =>
    asService((tx) => val(tx, 'select public.avatar_model_settle($1, $2, $3, $4, $5)', [id, status, maker, status === 'failed' ? 'glb_parts' : null, worker]));
  const dayStart = async () => (await cdb.query('select public.avatar_day_start() as d')).rows[0].d;
  const paths = (who, id) => ({
    original: `${CU[who]}/originals/${id}.jpg`, char: `${CU[who]}/chars/${id}.png`, model: `${CU[who]}/models/${id}.v1.glb`,
    viewsL: `${CU[who]}/views/${id}.v1l.webp`, viewsS: `${CU[who]}/views/${id}.v1s.webp`,
  });
  /** 저장소에 그 파일이 있다(이 흉내에서는 표 줄 하나) */
  const putFile = (name) => cdb.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1) on conflict do nothing`, [name]);
  /** 어제(KST) 만든 다 그린 그림 한 줄(오늘 장수에 들지 않는 이력). 원본 파일도 저장소에 둔다 */
  async function pic(who, { hours = 2, kept = false, via = null, file = true } = {}) {
    const id = crypto.randomUUID();
    const p = paths(who, id);
    await cdb.query(`insert into public.avatars (id, user_id, status, image_path, original_path, consent_at, created_at, queued_at,
        kept_at, model_request_via)
      values ($1::uuid, $2::uuid, 'ready', $3, $4, now(), public.avatar_day_start() - make_interval(hours => $5::int),
              public.avatar_day_start() - make_interval(hours => $5::int), case when $6::boolean then now() end, $7)`,
    [id, CU[who], p.char, p.original, hours, kept, via]);
    if (file) {
      await putFile(p.original);
      await putFile(p.char);
    }
    return id;
  }
  /** 3D를 다 만든 그림(일꾼이 잡아 만든 것처럼: 관리 연결로 바로 적는다. 판 번호는 트리거가 올린다) */
  async function withModel(who, opts = {}) {
    const id = await pic(who, opts);
    await cdb.query(`update public.avatars set model_status = 'ready', model_maker = 'meshy-7.1', model_attempts = 1 where id = $1`, [id]);
    await putFile(paths(who, id).model);
    return id;
  }
  const wear = (who, id) => cdb.query(`insert into public.profiles (user_id, look, avatar_id) values ($1::uuid, $2::jsonb, $3::uuid)
    on conflict (user_id) do update set look = excluded.look, avatar_id = excluded.avatar_id`,
  [CU[who], JSON.stringify({ kind: 'photo', url: `/api/avatar/${id}` }), id]);
  /** 앞 시험의 요청이 일꾼의 차례를 먼저 차지하지 않게 거둔다 */
  const clearRequests = () => cdb.query(`update public.avatars set model_requested_at = null, model_admin_at = null
    where model_requested_at is not null and model_status is distinct from 'drawing'`);

  before(async () => {
    cdb = await avatarDb(AVATAR_CHAIN, true);
    await cdb.exec(HISTORY_3D);
    await cdb.exec(ADMIN_CONSOLE);
    await cdb.exec(ADMIN_CONSOLE); // 두 번 올려도 괜찮다
    for (const [k, id] of Object.entries(CU)) await cdb.query('insert into auth.users (id, email) values ($1, $2)', [id, CEMAIL[k]]);
    await cdb.exec(`insert into public.roster (display_name, role, email) values
      ${Object.entries(CROLE).map(([k, r]) => `('${NAME[k]}', '${r}', '${CEMAIL[k]}')`).join(', ')};`);
    for (const who of Object.keys(CU)) await asC(who, (tx) => tx.query('select public.sync_my_roster()'));
  });

  test('관리자만: 목록·수·조작·기록·관리자용 읽기는 집주인만(가족·손님·명단 밖은 admin_only, 익명은 권한 없음). 새 표는 아무도 직접 못 읽는다', async () => {
    const id = await pic('g1');
    const calls = [
      ['select * from public.admin_characters()', []],
      ['select public.admin_character_counts(false)', []],
      ['select public.admin_character_file($1, $2)', [id, 'char']],
      ['select public.admin_avatar_remake_model($1, $2, true)', [id, 'trellis']],
      ['select public.admin_avatar_forget_model($1)', [id]],
      ['select public.admin_avatar_redraw($1)', [id]],
      ['select public.admin_avatar_forget($1)', [id]],
      ['select * from public.admin_avatar_log(10, null)', []],
    ];
    for (const who of ['family', 'g1', 'g2', 'visitor']) {
      for (const [sql, params] of calls) await failsC(who, sql, params, /admin_only/);
    }
    for (const [sql, params] of calls) await failsC('anon', sql, params, /permission denied/);
    assert.equal((await row(id)).status, 'ready', '막힌 조작은 아무것도 바꾸지 않았다');
    // 버릴 목록과 기록은 집주인도 표로 읽지 못하고, 목록 비우기는 비밀 키만
    for (const t of ['avatar_trash', 'avatar_admin_log']) {
      await failsC('admin', `select * from public.${t}`, [], /permission denied/);
      await failsC('admin', `insert into public.${t} (path) values ('x')`, [], /permission denied|column/);
    }
    await failsC('admin', 'select * from public.avatar_trash_list(10)', [], /permission denied/);
    await failsC('admin', `select public.avatar_trash_done(array['x'])`, [], /permission denied/);
    assert.deepEqual(await trashList(), []);
    const can = async (role, sig) => (await cdb.query(`select has_function_privilege($1, $2, 'execute') as v`, [role, `public.${sig}`])).rows[0].v;
    assert.deepEqual(await Promise.all(['avatar_model_shown(uuid)', 'avatar_char_shown(uuid)', 'avatar_views_shown(uuid, text)',
      'avatar_char_prev_readable(text)', 'avatar_trash_list(int)', 'avatars_model_track()',
      'admin_model_state(public.avatars)', 'avatar_trash_add(text)'].map((s) => can('authenticated', s))),
    [true, true, true, true, false, false, false, false]);
    assert.equal(await can('service_role', 'avatar_trash_list(int)'), true);
    assert.equal(await can('service_role', 'avatar_trash_done(text[])'), true);
    for (const s of ['admin_characters(text, text, text, text, boolean, int, timestamptz, uuid)', 'avatar_model_shown(uuid)',
      'avatar_char_shown(uuid)', 'avatar_views_shown(uuid, text)']) {
      assert.equal(await can('anon', s), false, s);
    }
  });

  test('목록: 지우지 않은 모든 캐릭터와 주인 이름(명단·이름표)·역할·행사 이름표·상태. 원본 사진 경로는 어디에도 나오지 않는다', async () => {
    // g2는 행사 코드로 들어온 손님처럼: 명단 줄에 행사를 잇고, 이름표를 따로 정했다
    const ev = await asC('admin', (tx) => val(tx, `select public.admin_create_event_code('EVT-CONSOLE-0001', '새 발표', 4, 50)`));
    await cdb.query('update public.roster set event_code_id = $1 where email = $2', [ev, CEMAIL.g2]);
    await cdb.query(`insert into public.profiles (user_id, nickname) values ($1, '별명둘') on conflict (user_id) do update set nickname = excluded.nickname`, [CU.g2]);
    const ready = await pic('g2', { kept: true });
    await wear('g2', ready);
    const rejected = crypto.randomUUID();
    await cdb.query(`insert into public.avatars (id, user_id, status, consent_at, reason) values ($1, $2, 'rejected', now(), 'child')`, [rejected, CU.g2]);
    const gone = await pic('g2');
    await asC('g2', (tx) => tx.query(`select public.avatar_forget($1, 'character')`, [gone]));
    const all = await list('admin', 'all', { q: '별명둘' });
    assert.deepEqual(all.map((r) => r.id).sort(), [ready, rejected].sort(), '지운 그림은 없고, 거절된 시도는 있다');
    const r = all.find((x) => x.id === ready);
    assert.deepEqual([r.owner_id, r.owner_name, r.nickname, r.owner_role, r.owner_removed, r.event_label],
      [CU.g2, NAME.g2, '별명둘', 'guest', false, '새 발표']);
    assert.deepEqual([r.status, r.kept, r.worn, r.has_original, r.model_state, r.model_ver, r.model_prev], ['ready', true, true, true, 'none', 1, false]);
    assert.ok(Number(r.pic_ver) > 1_700_000_000_000, 'pic_ver는 그린 차례(밀리초)');
    const rej = all.find((x) => x.id === rejected);
    assert.deepEqual([rej.status, rej.reason, rej.has_original, rej.model_state], ['rejected', 'child', false, 'none']);
    // 원본 경로는 목록·수·관리자용 읽기 어디에도 없다
    const everything = JSON.stringify(await list('admin', 'all', { limit: 200 }), (_, v) => (typeof v === 'bigint' ? String(v) : v));
    assert.doesNotMatch(everything, /originals/);
    assert.doesNotMatch(JSON.stringify(await call('admin', 'select public.admin_character_file($1, $2)', [ready, 'char'])), /originals/);
    // 거르기: 그림 문제·3D 없음·이름·역할·내 것만·행사 이름표
    assert.deepEqual((await list('admin', 'pic_problem', { q: '별명둘' })).map((x) => x.id), [rejected]);
    assert.deepEqual((await list('admin', 'model_none', { q: '별명둘' })).map((x) => x.id), [ready]);
    assert.deepEqual((await list('admin', 'all', { q: '새 발표' })).map((x) => x.id).sort(), [ready, rejected].sort(), '행사 이름표로도 찾는다');
    assert.deepEqual((await list('admin', 'all', { q: NAME.g2.slice(0, 2), role: 'family' })).length, 0);
    const mineId = await pic('admin');
    const mine = await list('admin', 'all', { mine: true });
    assert.ok(mine.length >= 1 && mine.every((x) => x.owner_id === CU.admin) && mine.some((x) => x.id === mineId));
    await failsC('admin', `select * from public.admin_characters('nope')`, [], /bad_filter/);
    // 차례대로 넘기기: 새것부터, 앞 장의 마지막 줄 뒤로
    const first = await list('admin', 'all', { limit: 2 });
    const second = await list('admin', 'all', { limit: 2, before: first[1].created_at, beforeId: first[1].id });
    assert.equal(first.length, 2);
    assert.ok(second.every((x) => !first.some((y) => y.id === x.id)), '다음 장에 앞 장의 줄이 다시 오지 않는다');
    // 수: 거르기 칩과 역할·만든 서비스
    const counts = await call('admin', 'select public.admin_character_counts(false)');
    assert.equal(counts.all, (await list('admin', 'all', { limit: 200 })).length);
    assert.equal(counts.pic_problem, (await list('admin', 'pic_problem', { limit: 200 })).length);
    assert.ok(counts.roles.guest >= 2 && counts.roles.admin >= 1);
    assert.deepEqual(Object.keys(await call('admin', 'select public.admin_character_counts(true)')).sort(),
      ['all', 'makers', 'model_making', 'model_none', 'model_problem', 'model_ready', 'pic_problem', 'roles']);
  });

  test('3D 다시 만들기의 동의: 우리 컴퓨터는 바로, Meshy는 주인이 관리자이거나 그 그림에 meshy 동의가 있을 때 바로, 아니면 「들었어요」 확인이 있어야만. 근거는 기록에', async () => {
    await clearRequests();
    const plain = await pic('g3');                       // 옛 「우리 컴퓨터」 안내만 본 그림(요청한 곳 없음)
    const local = await pic('g3', { via: 'trellis' });   // 우리 컴퓨터로 요청했던 그림
    const agreed = await pic('g3', { via: 'meshy' });    // 본인이 Meshy로 보내도 된다고 한 그림
    const own = await pic('admin');
    for (const id of [plain, local]) {
      assert.deepEqual(await remake(id, 'meshy', false), { ok: false, reason: 'consent_needed' });
      const r = await row(id);
      assert.deepEqual([r.model_requested_at, r.model_admin_at], [null, null], '거절하면 아무것도 바꾸지 않는다');
    }
    assert.deepEqual(await remake(plain, 'meshy', true), { ok: true, consent: 'told_by_owner', prev: false });
    assert.deepEqual(await remake(local, 'trellis', false), { ok: true, consent: 'local', prev: false });
    assert.deepEqual(await remake(agreed, 'meshy', false), { ok: true, consent: 'owner_meshy', prev: false });
    assert.deepEqual(await remake(own, 'meshy', false), { ok: true, consent: 'owner_admin', prev: false });
    // 요청 줄: 보낼 곳을 적고, 요청한 때는 하루 앞당겨(오늘 모두의 셈 밖), 진짜 때는 model_admin_at
    const p = await row(plain);
    assert.equal(p.model_request_via, 'meshy');
    assert.ok(p.model_requested_at < (await dayStart()), '요청한 때는 오늘 이전');
    assert.ok(Math.abs(p.model_admin_at.getTime() - Date.now()) < 60_000, '진짜 때');
    assert.equal(p.model_status, null);
    // 기록: 누가, 어느 캐릭터, 주인, 무엇을, 근거
    const log = await logOf(plain);
    assert.deepEqual(log.map((l) => [l.actor_name, l.owner_name, l.action, l.consent, l.detail.via]),
      [[NAME.admin, NAME.g3, 'remake_model', 'told_by_owner', 'meshy']]);
    assert.equal((await logOf(own))[0].consent, 'owner_admin');
    await failsC('admin', 'select public.admin_avatar_remake_model($1, $2, true)', [plain, 'tripo'], /bad_via/);
    // 다른 사람의 그림이 아니라 줄마다: 같은 사람의 다른 그림에 meshy 동의가 있어도 이 그림에는 확인을 받는다
    const other = await pic('g3');
    assert.deepEqual(await remake(other, 'meshy'), { ok: false, reason: 'consent_needed' });
    // 다 그린 그림만, 지운 그림·없는 그림은 없음
    const drawing = crypto.randomUUID();
    await cdb.query(`insert into public.avatars (id, user_id, status, original_path, consent_at, queued_at)
      values ($1::uuid, $2::uuid, 'queued', $2::text || '/originals/' || $1::text || '.jpg', now(), now())`, [drawing, CU.g3]);
    assert.deepEqual(await remake(drawing, 'trellis'), { ok: false, reason: 'not_ready' });
    assert.deepEqual(await remake(crypto.randomUUID(), 'trellis'), { ok: false, reason: 'not_found' });
    await cdb.query('delete from public.avatars where id = $1', [drawing]); // 그리기 일꾼의 차례를 다음 시험에 남기지 않게
    // 집주인이 한 번 「들었어요」로 Meshy에 보낸 그림은 그 요청 줄에 meshy 동의가 남는다(다음부터는 그 줄을 근거로)
    assert.equal((await row(plain)).model_request_via, 'meshy');
    assert.deepEqual(await remake(plain, 'meshy', false), { ok: true, consent: 'owner_meshy', prev: false });
  });

  test('관리자가 만든 3D는 돈이 든 시도 누적과 오늘 모두의 3D 수에 들지 않고, 주인의 3D 요청 수에는 든다(지우면 빠진다). 일꾼은 관리자 요청을 먼저 잡는다', async () => {
    await clearRequests();
    const [mine, asked] = [await pic('g4', { kept: true }), await pic('g4', { kept: true })];
    // 주인이 먼저 다른 그림을 요청해 두었다(오늘 모두의 수에 하나)
    assert.deepEqual(await call('g4', 'select public.avatar_model_request($1, $2)', [mine, 'meshy']), { ok: true, already: false });
    const before = await quota('g4');
    assert.deepEqual(await remake(asked, 'meshy', true), { ok: true, consent: 'told_by_owner', prev: false });
    const q = await quota('g4');
    assert.equal(q.model_day, before.model_day, '관리자 요청은 오늘 모두의 3D 수에 들지 않는다');
    // 일꾼은 하루 앞당긴 관리자 요청을 먼저 잡는다. 작업을 만들어도(돈이 들어도) 주인의 누적은 그대로
    const job = await claim('w-admin');
    assert.deepEqual([job.id, job.via, typeof job.requested_at], [asked, 'meshy', 'string']);
    assert.equal(await jobMade(asked), true);
    const r = await row(asked);
    assert.deepEqual([r.model_tries, r.model_job_at !== null], [0, true], '작업을 만든 때는 적고 누적은 올리지 않는다');
    assert.equal(await settleModel(asked, 'ready', 'w-admin'), true);
    const after = await quota('g4');
    assert.equal(after.model_tries, (await quota('g4')).model_tries);
    assert.equal(after.model_tries, before.model_tries, '돈이 든 시도의 누적은 주인이 쓴 만큼만');
    assert.equal(after.model_day, before.model_day);
    // 다 만든 3D는 그 사람의 3D 하나다(손님은 한 번): 주인이 지우면 관리자 요청은 셈에서 빠진다
    assert.equal(after.models, 2, '주인의 요청 하나와 관리자가 만들어 준 3D 하나');
    // 그래서 그동안 주인이 다른 그림으로 3D를 새로 요청하면 한도에 걸린다(0021의 셈 그대로. 관리 화면의 확인 글이 알린다)
    const third = await pic('g4', { kept: true });
    assert.equal((await call('g4', 'select public.avatar_model_request($1, $2)', [third, 'meshy'])).reason, 'model_full');
    assert.equal(await call('g4', `select public.avatar_forget($1, 'character')`, [asked]), true);
    const gone = await row(asked);
    assert.deepEqual([gone.status, gone.model_requested_at, gone.model_admin_at], ['deleted', null, null]);
    assert.equal((await quota('g4')).models, 1);
    // 관리자 요청이 실패한 뒤 주인이 같은 그림을 다시 요청하면 그때부터는 주인의 요청이다(관리자 표시를 떼고 0021대로 센다)
    await clearRequests();
    const again = await pic('g5', { kept: true, via: 'meshy' });
    assert.deepEqual(await remake(again, 'meshy'), { ok: true, consent: 'owner_meshy', prev: false });
    assert.equal((await claim('w-admin')).id, again);
    assert.equal(await settleModel(again, 'failed', 'w-admin'), true);
    assert.deepEqual(await call('g5', 'select public.avatar_model_request($1, $2)', [again, 'meshy']), { ok: true, already: false });
    const owned = await row(again);
    assert.equal(owned.model_admin_at, null);
    assert.ok(owned.model_requested_at >= (await dayStart()), '주인의 요청은 진짜 때');
    assert.equal((await claim('w-admin')).id, again);
    assert.equal(await jobMade(again), true);
    assert.equal((await row(again)).model_tries, 1, '주인의 요청이 만든 작업은 주인의 누적에 든다');
  });

  test('이전 모형은 새 모형이 될 때까지 보이고, 판 번호는 3D가 다 될 때마다 오르며 줄지 않는다(손으로 고쳐도)', async () => {
    await clearRequests();
    const id = await withModel('g6');
    const p = paths('g6', id);
    assert.equal((await row(id)).model_ver, 2, '처음 다 된 3D: 1 → 2');
    assert.deepEqual(await shown('g7', id), { path: p.model, ver: 2, prev: false });
    // 저장소 정책: 다 된 모형은 0016의 정책이 연다
    const canRead = (who) => rows(who, `select name from storage.objects where bucket_id = 'avatars' and name = $1`, [p.model]);
    assert.equal((await canRead('g7')).length, 1);
    // 관리자 다시 만들기: 요청 상태로 돌아가도 이전 모형이 지금 판으로 보인다(파일도 열린다)
    assert.deepEqual(await remake(id, 'meshy', true), { ok: true, consent: 'told_by_owner', prev: true });
    const waiting = await row(id);
    assert.deepEqual([waiting.model_status, waiting.model_prev, waiting.model_ver], [null, true, 2]);
    assert.deepEqual(await shown('g7', id), { path: p.model, ver: 2, prev: true });
    assert.equal((await canRead('g7')).length, 1, '이전 모형 파일도 명단 손님에게 열린다(0024의 정책)');
    assert.equal((await canRead('visitor')).length, 0, '명단 밖은 아니다');
    assert.equal(await call('visitor', 'select public.avatar_model_shown($1)', [id]), null);
    assert.equal((await claim('w9')).id, id);
    assert.deepEqual(await shown('g7', id), { path: p.model, ver: 2, prev: true }, '만드는 중에도');
    assert.equal(await settleModel(id, 'ready', 'w9'), true);
    const made = await row(id);
    assert.deepEqual([made.model_status, made.model_prev, made.model_ver], ['ready', false, 3], '새 모형이 되면 판이 오르고 이전 모형 보이기를 끈다');
    assert.deepEqual(await shown('g7', id), { path: p.model, ver: 3, prev: false });
    // 판은 3D가 다 될 때만: 다른 칸을 고쳐도 그대로, 다 된 채 만든 서비스가 바뀌면 오른다, 낮추려 해도 그대로, 올리면 올린 값
    await cdb.query(`update public.avatars set kept_at = now() where id = $1`, [id]);
    assert.equal((await row(id)).model_ver, 3);
    await cdb.query(`update public.avatars set model_maker = 'hand-made' where id = $1`, [id]);
    assert.equal((await row(id)).model_ver, 4, '손으로 만든 서비스를 바꾸면 다음 판');
    await cdb.query(`update public.avatars set model_maker = 'hand-made' where id = $1`, [id]);
    assert.equal((await row(id)).model_ver, 4, '같은 이름이면 그대로(손으로 판을 올린다)');
    await cdb.query(`update public.avatars set model_ver = 1 where id = $1`, [id]);
    assert.equal((await row(id)).model_ver, 4, '판은 줄지 않는다');
    await cdb.query(`update public.avatars set model_ver = 9 where id = $1`, [id]);
    assert.equal((await row(id)).model_ver, 9);
    // 0016 그대로의 늦은 ready(다른 일꾼이 먼저 끝낸 뒤)도 만든 서비스가 다르면 오른다
    assert.equal(await settleModel(id, 'ready', 'w-late', 'meshy-7.2'), true);
    assert.equal((await row(id)).model_ver, 10);
    // 다시 만들다 실패하면 이전 모형은 그대로 보인다(목록은 실패로). 앞의 「들었어요」가 이 그림의 요청 줄에 남아 있다
    assert.deepEqual(await remake(id, 'meshy', false), { ok: true, consent: 'owner_meshy', prev: true });
    assert.equal((await claim('w9')).id, id);
    assert.equal(await settleModel(id, 'failed', 'w9'), true);
    assert.deepEqual(await shown('g7', id), { path: p.model, ver: 10, prev: true });
    assert.equal((await list('admin', 'model_problem', { q: NAME.g6 })).find((x) => x.id === id)?.model_state, 'failed');
    // 3D 지우기: 이전 모형도 내리고, 요청도 비우고, 파일은 버릴 목록에
    assert.deepEqual(await forgetModel(id), { ok: true });
    const cleared = await row(id);
    assert.deepEqual([cleared.model_status, cleared.model_prev, cleared.model_requested_at, cleared.model_ver], [null, false, null, 10]);
    assert.equal(await shown('g7', id), null);
    assert.equal((await canRead('g7')).length, 0);
    assert.ok((await trash()).includes(p.model));
    assert.deepEqual(await forgetModel(id), { ok: false, reason: 'no_model' });
    // 다음 3D는 지운 판 다음부터(같은 주소에 옛 판이 묶이지 않게)
    await cdb.query(`update public.avatars set model_status = 'ready', model_maker = 'meshy-7.1' where id = $1`, [id]);
    assert.equal((await row(id)).model_ver, 11);
    // 그림이 다 그린 그림이 아니게 되면 이전 모형 보이기도 꺼진다(3D를 지워도 요청 줄의 동의는 남는다)
    assert.deepEqual(await remake(id, 'meshy', false), { ok: true, consent: 'owner_meshy', prev: true });
    assert.equal(await call('g6', `select public.avatar_forget($1, 'character')`, [id]), true);
    assert.deepEqual([(await row(id)).model_prev, await shown('g7', id)], [false, null]);
  });

  test('만드는 중이면 다시 만들기는 busy(일꾼이 30분 넘게 잡고 있으면 멈춘 것으로 보고 되돌린다). 다시 해도 같은 실패로 굳은 그림은 0021과 같다', async () => {
    await clearRequests();
    const id = await pic('g8');
    assert.deepEqual(await remake(id, 'trellis'), { ok: true, consent: 'local', prev: false });
    assert.equal((await claim('w1', 'trellis')).id, id);
    assert.deepEqual(await remake(id, 'trellis'), { ok: false, reason: 'busy' });
    await cdb.query(`update public.avatars set model_claimed_at = now() - interval '31 minutes' where id = $1`, [id]);
    assert.equal((await list('admin', 'model_problem', { q: NAME.g8 })).find((x) => x.id === id)?.model_state, 'stuck');
    assert.deepEqual(await remake(id, 'trellis'), { ok: true, consent: 'local', prev: false });
    assert.deepEqual([(await row(id)).model_status, (await row(id)).model_worker], [null, null]);
    assert.equal(await settleModel(id, 'ready', 'w1'), false, '되돌린 뒤의 옛 일꾼은 정리하지 못한다(0016: 방금 올린 파일을 거둔다)');
    // 잡은 지 30분이 안 되면 목록은 「만드는 중」이고 다시 만들기는 busy다(목록과 다시 만들기가 같은 30분으로 잰다)
    assert.equal((await claim('w1', 'trellis')).id, id);
    await cdb.query(`update public.avatars set model_claimed_at = now() - interval '20 minutes' where id = $1`, [id]);
    assert.equal((await list('admin', 'model_making', { q: NAME.g8 })).find((x) => x.id === id)?.model_state, 'making');
    assert.equal((await list('admin', 'model_problem', { q: NAME.g8 })).some((x) => x.id === id), false, '문제로 거르지 않는다');
    assert.deepEqual(await remake(id, 'trellis'), { ok: false, reason: 'busy' });
    await cdb.query(`update public.avatars set model_claimed_at = now() - interval '31 minutes' where id = $1`, [id]);
    assert.deepEqual(await remake(id, 'trellis'), { ok: true, consent: 'local', prev: false });
    // 15분 넘게 기다리는 관리자 요청도 문제로 보인다(진짜 요청한 때로 잰다)
    await cdb.query(`update public.avatars set model_admin_at = now() - interval '16 minutes' where id = $1`, [id]);
    assert.equal((await list('admin', 'model_problem', { q: NAME.g8 })).find((x) => x.id === id)?.model_state, 'stuck');
    await cdb.query(`update public.avatars set model_admin_at = now() where id = $1`, [id]);
    assert.equal((await list('admin', 'model_making', { q: NAME.g8 })).find((x) => x.id === id)?.model_state, 'waiting');
    // 다시 해도 같은 실패: 그 그림 탓은 어디로든, Meshy가 받지 않은 그림은 Meshy로만 막는다
    await cdb.query(`update public.avatars set model_status = 'failed', model_reason = 'meshy_rejected', model_requested_at = null,
      model_admin_at = null where id = $1`, [id]);
    assert.deepEqual(await remake(id, 'meshy', true), { ok: false, reason: 'model_blocked' });
    assert.deepEqual(await remake(id, 'trellis'), { ok: true, consent: 'local', prev: false });
  });

  /** 그림 일꾼이 지금 살아 있다(일꾼의 잡기·살아 있음처럼) */
  const beat = () => asService((tx) => tx.query(`select public.avatar_worker_beat('w-draw', 'test')`));
  /** 그리기 일꾼이 그 줄을 잡는다(0003의 잡기 그대로). 다른 줄이 먼저 잡히면 시험이 틀린 것 */
  const drawClaim = async (id) => {
    const job = await asService((tx) => val(tx, 'select public.avatar_claim($1, 600)', ['w-draw']));
    assert.equal(job?.id, id, '그리기 일꾼이 다시 그릴 줄을 잡는다');
    return job;
  };
  /** 고치지 않은 그리기 일꾼의 끝: 실패·거절이면 원본 파일을 지우고(core.mjs의 drop) 정리한다 */
  const drawEnd = async (id, status, reason = null) => {
    const r = await row(id);
    if (status !== 'ready') await cdb.query(`delete from storage.objects where bucket_id = 'avatars' and name = $1`, [r.original_path]);
    return asService((tx) => val(tx, 'select public.avatar_settle($1, $2, null, $3, $4, $5)',
      [id, status, status === 'ready' ? `${r.user_id}/chars/${id}.png` : null, status === 'ready' ? 'm2' : null, reason]));
  };
  const charShown = (who, id) => call(who, 'select public.avatar_char_shown($1)', [id]);
  const picVer = (r) => Math.floor((r.queued_at ?? r.created_at).getTime());

  test('그림 다시 그리기: 원본 파일이 있고, 3D를 기다리거나 만드는 중이 아니고, 그림 일꾼이 살아 있을 때만. 주인의 하루 장수에 세지 않는다. 그리는 동안 옛 그림이 보이고, 다 그리면 새 그림(판이 바뀐다)', async () => {
    await clearRequests();
    await beat();
    const noFile = await pic('g9', { file: false });
    assert.deepEqual(await redraw(noFile), { ok: false, reason: 'no_original' }, '줄에 경로가 있어도 파일이 없으면');
    const id = await withModel('g9', { kept: true });
    await cdb.query(`update public.avatars set views_status = 'ready', views_mode = 'full', views_consent_at = now(),
      slot_freed = $2 where id = $1`, [id, noFile]);
    await wear('g9', id);
    const p = paths('g9', id);
    for (const f of [p.viewsL, p.viewsS]) await putFile(f);
    // 3D를 기다리거나 만드는 중이면 받지 않는다(3D 일꾼이 그림 id로 이어 볼 작업을 엉뚱한 새 그림에 붙이지 않게)
    assert.deepEqual(await remake(id, 'trellis'), { ok: true, consent: 'local', prev: true });
    assert.deepEqual(await redraw(id), { ok: false, reason: 'model_busy' }, '기다리는 중');
    assert.equal((await claim('w1', 'trellis')).id, id);
    assert.deepEqual(await redraw(id), { ok: false, reason: 'model_busy' }, '만드는 중');
    assert.equal(await settleModel(id, 'ready', 'w1'), true);
    // 그림 일꾼이 5분 넘게 소식이 없으면 받지 않는다(돌아오면 받는다)
    await cdb.query(`update public.avatar_workers set seen_at = now() - interval '6 minutes'`);
    assert.deepEqual(await redraw(id), { ok: false, reason: 'worker_down' });
    assert.equal((await row(id)).status, 'ready', '막힌 다시 그리기는 아무것도 바꾸지 않았다');
    await beat();
    const slot = (await row(id)).slot;
    assert.ok(slot !== null, '작업대 칸에 있다');
    const before = await quota('g9');
    const look = (await cdb.query('select look from public.profiles where user_id = $1', [CU.g9])).rows[0].look;
    const old = await row(id);
    assert.deepEqual(await redraw(id), { ok: true });
    const r = await row(id);
    assert.deepEqual([r.status, r.image_path, r.kept_at, r.model_status, r.model_requested_at, r.views_status, r.attempts, r.slot, r.slot_freed],
      ['queued', null, null, null, null, null, 0, slot, null]);
    assert.ok(r.views_consent_at !== null && r.original_path === p.original, '동의 기록과 원본은 그대로');
    assert.equal(r.redraw_prev.image_path, p.char, '다시 그리기 전의 줄을 적어 둔다');
    const after = await quota('g9');
    assert.deepEqual([after.used, after.attempts, after.total], [before.used, before.attempts, before.total], '하루 장수·시도·모두의 셈에 세지 않는다');
    assert.deepEqual((await cdb.query('select look from public.profiles where user_id = $1', [CU.g9])).rows[0].look, look, '걷기 겉모습은 그대로');
    assert.deepEqual((await logOf(id)).map((l) => [l.action, l.consent, l.detail.model, l.detail.kept]).slice(0, 1), [['redraw', null, 'ready', true]]);
    // 그리는 동안: 다른 명단 손님에게 옛 그림(같은 자리)과 옛 판, 저장소 정책도 연다. 명단 밖은 아니다
    assert.deepEqual(await charShown('g7', id), { path: p.char, ver: picVer(old), prev: true });
    const canRead = (who, f) => rows(who, `select name from storage.objects where bucket_id = 'avatars' and name = $1`, [f]);
    assert.equal((await canRead('g7', p.char)).length, 1, '옛 그림 파일을 읽는다');
    assert.equal((await canRead('g7', p.viewsL)).length, 0, '방향 그림은 그동안 쉰다');
    assert.equal(await charShown('visitor', id), null);
    assert.equal((await canRead('visitor', p.char)).length, 0);
    assert.deepEqual((await list('admin', 'all', { q: NAME.g9 })).find((x) => x.id === id)?.redrawing, true);
    // 버릴 목록: 옛 그림·방향 그림 둘·3D. 그림 자리는 일꾼이 다시 쓰고, 방향 그림·3D는 다시 그리기가 실패하면 되돌리므로 끝날 때까지 남긴다
    for (const f of [p.char, p.viewsL, p.viewsS, p.model]) assert.ok((await trash()).includes(f), f);
    assert.deepEqual((await trashList()).filter((f) => f.includes(id)), [], '다시 그리는 동안은 하나도 돌려주지 않는다');
    // 일꾼이 다시 그린다: 같은 자리에 새 그림 → 그림 자리는 목록에서 빠지고(지우지 않는다), 옛 방향 그림·3D는 이제 지운다
    const job = await drawClaim(id);
    assert.equal(job.original_path, p.original);
    assert.equal(await drawEnd(id, 'ready'), true);
    const done = await row(id);
    assert.deepEqual([done.status, done.redraw_prev, done.kept_at, done.model_status], ['ready', null, null, null]);
    const again = await trashList();
    assert.ok(!again.includes(p.char) && !(await trash()).includes(p.char), '다시 그려 쓰는 자리는 버리지 않는다');
    assert.ok([p.viewsL, p.viewsS, p.model].every((f) => again.includes(f)), '옛 방향 그림과 3D는 지운다');
    // 판이 바뀐다(다시 그린 때): 1분 뒤 ETag가 달라 새 그림을 받는다
    const now = await charShown('g7', id);
    assert.deepEqual([now.path, now.prev, now.ver], [p.char, false, picVer(done)]);
    assert.notEqual(now.ver, picVer(old));
    assert.deepEqual((await logOf(id)).map((l) => [l.action, l.actor_name]).slice(0, 2), [['redraw_done', null], ['redraw', NAME.admin]]);
    assert.deepEqual(await redraw(crypto.randomUUID()), { ok: false, reason: 'not_found' });
    await trashDone(again.filter((f) => f.includes(id)));
  });

  test('그림 다시 그리기가 실패하면(서비스 문제 포함) 다시 그리기 전으로 되돌린다: 그림·방향 그림·3D·★·판. 원본 사진은 없어진다. ★은 그사이 한도가 찼으면 빼고', async () => {
    await clearRequests();
    await beat();
    const id = await withModel('g5', { kept: true });
    await cdb.query(`update public.avatars set views_status = 'ready', views_mode = 'full', views_model = 'vm', views_consent_at = now()
      where id = $1`, [id]);
    await wear('g5', id);
    const old = await row(id);
    const p = paths('g5', id);
    assert.deepEqual(await redraw(id), { ok: true });
    await drawClaim(id);
    assert.equal(await drawEnd(id, 'failed', 'http_error'), true, '일꾼의 정리는 그대로 된다');
    const r = await row(id);
    assert.deepEqual(
      [r.status, r.reason, r.image_path, r.model, r.views_status, r.views_mode, r.model_status, r.model_maker, r.model_ver, r.redraw_prev],
      ['ready', null, p.char, old.model, 'ready', 'full', 'ready', 'meshy-7.1', old.model_ver, null]);
    assert.equal(r.kept_at?.getTime(), old.kept_at.getTime(), '★도 되돌린다');
    assert.equal(r.original_path, null, '원본 사진은 일꾼이 지웠다(그 뒤로는 다시 그릴 수 없다)');
    assert.equal(picVer(r), picVer(old), '판도 되돌린다(옛 그림 그대로)');
    assert.deepEqual(await charShown('g7', id), { path: p.char, ver: picVer(old), prev: false });
    assert.deepEqual(await shown('g7', id), { path: p.model, ver: old.model_ver, prev: false }, '3D도 그대로 보인다');
    const item = (await list('admin', 'all', { q: NAME.g5 })).find((x) => x.id === id);
    assert.deepEqual([item.status, item.has_original, item.redrawing, item.model_state], ['ready', false, false, 'ready']);
    assert.deepEqual(await redraw(id), { ok: false, reason: 'no_original' });
    // 버릴 목록에서 옛 파일은 모두 빠진다(지금 쓴다)
    const left = await trashList();
    assert.deepEqual([p.char, p.viewsL, p.viewsS, p.model].filter((f) => left.includes(f)), []);
    const kept = await trash();
    assert.deepEqual([p.char, p.viewsL, p.viewsS, p.model].filter((f) => kept.includes(f)), [], '목록에서도 뺐다');
    assert.deepEqual((await logOf(id)).map((l) => [l.action, l.actor_name, l.detail?.reason ?? null]).slice(0, 2),
      [['redraw_back', null, 'http_error'], ['redraw', NAME.admin, null]]);
    // ★: 다시 그리는 사이 주인이 다른 그림을 보관해 한도(손님 셋)가 찼으면 되돌리지 않는다
    const second = await withModel('g5', { kept: true });
    assert.deepEqual(await redraw(second), { ok: true });
    for (let k = 0; k < 3; k++) await pic('g5', { kept: true });
    await drawClaim(second);
    assert.equal(await drawEnd(second, 'failed', 'timeout'), true);
    const s = await row(second);
    assert.deepEqual([s.status, s.kept_at, s.model_status], ['ready', null, 'ready'], '그림·3D는 되돌리고 ★은 빼고');
  });

  test('그림 다시 그리기가 사진 살피기에서 거절되면 그 캐릭터는 없어지고(거절된 시도로 남는다) 입고 있었으면 종이 인형으로. 파일은 모두 버린다', async () => {
    await clearRequests();
    await beat();
    const id = await withModel('g6', { kept: true });
    await cdb.query(`update public.avatars set views_status = 'ready', views_mode = 'full', views_consent_at = now() where id = $1`, [id]);
    await wear('g6', id);
    const p = paths('g6', id);
    assert.deepEqual(await redraw(id), { ok: true });
    await drawClaim(id);
    assert.equal(await drawEnd(id, 'rejected', 'child'), true);
    const r = await row(id);
    assert.deepEqual([r.status, r.reason, r.image_path, r.original_path, r.redraw_prev, r.kept_at], ['rejected', 'child', null, null, null, null]);
    const prof = (await cdb.query('select look, avatar_id from public.profiles where user_id = $1', [CU.g6])).rows[0];
    assert.deepEqual([prof.look, prof.avatar_id], [null, null], '입고 있던 캐릭터면 종이 인형으로');
    assert.equal(await charShown('g7', id), null);
    const left = await trashList();
    assert.ok([p.char, p.viewsL, p.viewsS, p.model].every((f) => left.includes(f)), '옛 그림·방향 그림·3D를 버린다');
    const item = (await list('admin', 'pic_problem', { q: NAME.g6 })).find((x) => x.id === id);
    assert.deepEqual([item?.status, item?.reason], ['rejected', 'child'], '그림 문제로 까닭과 함께 남는다');
    assert.deepEqual((await logOf(id)).map((l) => [l.action, l.detail?.reason ?? null]).slice(0, 1), [['redraw_rejected', 'child']]);
    // 다시 그리는 사이 주인이 지웠으면: 그대로 지운 것(되돌리지 않는다)
    const gone = await withModel('g6');
    assert.deepEqual(await redraw(gone), { ok: true });
    assert.equal(await call('g6', `select public.avatar_forget($1, 'character')`, [gone]), true);
    const g = await row(gone);
    assert.deepEqual([g.status, g.redraw_prev, g.original_path], ['deleted', null, null]);
    assert.ok((await trashList()).includes(paths('g6', gone).char), '옛 그림 파일도 버린다');
    await trashDone((await trashList()).filter((f) => f.includes(id) || f.includes(gone)));
  });

  test('2D 판: 명단 손님에게 그림과 방향 그림의 경로와 판(그린 차례)을 준다. 명단 밖·없는 그림·그리는 중은 null', async () => {
    const id = await pic('g2');
    const r = await row(id);
    const p = paths('g2', id);
    assert.deepEqual(await charShown('g3', id), { path: p.char, ver: picVer(r), prev: false });
    assert.equal(await charShown('visitor', id), null);
    assert.equal(await charShown('g3', crypto.randomUUID()), null);
    const views = (who, size) => call(who, 'select public.avatar_views_shown($1, $2)', [id, size]);
    assert.equal(await views('g3', 'l'), null, '방향 그림을 아직 안 그렸다');
    await cdb.query(`update public.avatars set views_status = 'ready', views_mode = 'full', views_consent_at = now() where id = $1`, [id]);
    assert.deepEqual(await views('g3', 'l'), { path: p.viewsL, ver: picVer(r) });
    assert.deepEqual(await views('g3', 's'), { path: p.viewsS, ver: picVer(r) });
    assert.deepEqual(await views('g3', 'x'), { path: p.viewsL, ver: picVer(r) }, 's가 아니면 큰 것');
    assert.equal(await views('visitor', 'l'), null);
    const queued = crypto.randomUUID();
    await cdb.query(`insert into public.avatars (id, user_id, status, original_path, consent_at, queued_at)
      values ($1::uuid, $2::uuid, 'queued', $2::text || '/originals/' || $1::text || '.jpg', now(), now())`, [queued, CU.g2]);
    assert.equal(await charShown('g3', queued), null, '그리는 중인 새 그림은 보일 것이 없다');
    await cdb.query('delete from public.avatars where id = $1', [queued]);
  });

  test('캐릭터 지우기: 본인이 지울 때와 같은 칸을 같은 값으로, 입고 있었으면 종이 인형으로. 그리는 중이면 원본까지 버린다', async () => {
    const mineSelf = await withModel('g7', { kept: true });
    const byAdmin = await withModel('g7', { kept: true });
    await wear('g7', byAdmin);
    assert.equal(await call('g7', `select public.avatar_forget($1, 'character')`, [mineSelf]), true);
    assert.deepEqual(await forgetChar(byAdmin), { ok: true, worn: true });
    const cols = ['status', 'image_path', 'original_path', 'kept_at', 'model_status', 'model_maker', 'views_status', 'model_requested_at'];
    const [a, b] = [await row(mineSelf), await row(byAdmin)];
    assert.deepEqual(cols.map((c) => (c === 'original_path' ? Boolean(b[c]) : b[c])), cols.map((c) => (c === 'original_path' ? Boolean(a[c]) : a[c])),
      '다 그린 그림: 원본은 남고(본인이 「내 캐릭터」에서 지운다) 나머지는 본인 지우기와 같다');
    const prof = (await cdb.query('select look, avatar_id from public.profiles where user_id = $1', [CU.g7])).rows[0];
    assert.deepEqual([prof.look, prof.avatar_id], [null, null], '입고 있던 캐릭터면 종이 인형으로');
    const p = paths('g7', byAdmin);
    for (const f of [p.char, p.viewsL, p.viewsS, p.model]) assert.ok((await trash()).includes(f), f);
    assert.ok(!(await trash()).includes(p.original), '다 그린 그림의 원본은 버리지 않는다');
    assert.deepEqual(await forgetChar(byAdmin), { ok: false, reason: 'not_found' }, '이미 지운 줄');
    // 그리는 중이면 원본도 버린다(본인 지우기와 같이 원본 경로를 비운다)
    const flying = crypto.randomUUID();
    await cdb.query(`insert into public.avatars (id, user_id, status, original_path, consent_at, queued_at)
      values ($1::uuid, $2::uuid, 'queued', $2::text || '/originals/' || $1::text || '.jpg', now(), now())`, [flying, CU.g7]);
    assert.deepEqual(await forgetChar(flying), { ok: true, worn: false });
    const f = await row(flying);
    assert.deepEqual([f.status, f.original_path], ['deleted', null]);
    assert.ok((await trash()).includes(paths('g7', flying).original));
    assert.deepEqual((await logOf(flying)).map((l) => [l.action, l.detail.status, l.detail.worn]), [['forget', 'queued', false]]);
  });

  test('버릴 목록: 사이트가 만드는 모양의 경로만, 비밀 키로만 비운다. 다 지운 것은 빼고, 모양이 틀린 경로·지금 쓰는 경로는 지우지 않고 뺀다', async () => {
    const listed = await trashList();
    assert.ok(listed.length > 0);
    assert.ok(listed.every((x) => /^[0-9a-f-]{36}\/(chars|views|models|originals)\/[0-9a-f-]{36}\.(png|v1[ls]\.webp|v1\.glb|jpg|png|webp)$/.test(x)));
    assert.equal(await trashDone(listed.slice(0, 2)), 2);
    assert.equal((await trashList()).length, listed.length - 2);
    // 손으로 넣은 줄: 모양이 틀린 경로는 들어가지도 않고(정의자 함수), 표에 바로 넣었어도 돌려주지 않고 뺀다
    await cdb.query(`select public.avatar_trash_add('../../etc/passwd')`);
    await cdb.query(`insert into public.avatar_trash (path) values ($1)`, [`${CU.g1}/chars/${CU.g1}.png.bak/../../x`]);
    // 남의 쓰는 그림 경로(다 그린 그림의 그림)도 지우지 않는다
    const live = await pic('g1');
    await cdb.query(`insert into public.avatar_trash (path) values ($1)`, [paths('g1', live).char]);
    const now = await trashList();
    assert.ok(!now.some((x) => x.includes('..')) && !now.includes(paths('g1', live).char));
    assert.ok(!(await trash()).includes(paths('g1', live).char), '쓰는 경로는 목록에서 뺐다');
    assert.ok(!(await trash()).some((x) => x.includes('..')), '모양이 틀린 경로도 뺐다');
    assert.equal(await trashDone(now), now.length);
    assert.deepEqual(await trashList(), []);
  });

  test('일꾼의 한 바퀴(processModel, 고치지 않은 일꾼)를 붙여도: 관리자 요청은 Meshy로 가고, 돈이 든 작업을 알려도 주인의 누적은 그대로, 다 되면 판이 오른다', async () => {
    await clearRequests();
    const workerDb = wrapSupabase({
      rpc: async (fn, args = {}) => {
        const keys = Object.keys(args);
        try {
          const data = await cdb.transaction(async (tx) => {
            await tx.query(`select set_config('request.jwt.claims', '', true)`);
            await tx.query('set local role service_role');
            return (await tx.query(`select v from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`,
              keys.map((k) => args[k]))).rows[0]?.v ?? null;
          });
          return { data, error: null };
        } catch (e) {
          return { data: null, error: { message: String(e.message) } };
        }
      },
    }).db;
    const files = new Map();
    const store = {
      async download(p) {
        if (!files.has(p)) throw Object.assign(new Error('no such file'), { code: 'storage_error' });
        return files.get(p);
      },
      async upload(p, bytes) { files.set(p, bytes); },
      async remove(ps) { for (const p of ps) files.delete(p); },
    };
    const sent = [];
    const meshy = {
      maker: 'meshy-7.1', leaseSec: 1200, maxBad: 2, requestedOnly: true, consent: 'meshy',
      async ready() { return true; },
      async toGlb(png, { key, onJob }) {
        sent.push(key);
        await onJob?.();
        return { glb: serviceGlb(), stats: null };
      },
      async forget() {},
    };
    const id = await withModel('g8');
    files.set(paths('g8', id).char, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]));
    const before = await quota('g8');
    assert.deepEqual(await remake(id, 'meshy', true), { ok: true, consent: 'told_by_owner', prev: true });
    assert.deepEqual(await processModel({ db: workerDb, store, service: meshy, worker: 'w-ext' }), { outcome: 'ready', id });
    assert.deepEqual(sent, [id], '관리자 요청에는 요청한 때와 곳이 실려 바깥 3D 서비스로 간다');
    const r = await row(id);
    assert.deepEqual([r.model_status, r.model_tries, r.model_job_at !== null, r.model_prev, r.model_ver], ['ready', 0, true, false, 3]);
    const after = await quota('g8');
    assert.deepEqual([after.model_tries, after.model_day], [before.model_tries, before.model_day], '주인의 누적과 오늘 모두의 수는 그대로');
    assert.ok(files.has(paths('g8', id).model));
  });

  test('머리 확인: 0021(또는 0018, 0001)이 없으면 아무것도 바꾸지 않고 멈춘다', async () => {
    const cases = [
      [AVATAR_CHAIN, true, /0024_needs_0021/],
      [AVATAR_CHAIN.filter((f) => f !== '0018_event_codes.sql'), true, /0024_needs_0021|0024_needs_0018/],
      [[], false, /0024_needs_0001/],
    ];
    for (const [chain, caps, re] of cases) {
      const x = await avatarDb(chain, caps);
      await assert.rejects(x.exec(ADMIN_CONSOLE), re);
      const r = (await x.query(`select to_regclass('public.avatar_trash') is null as no_trash,
        to_regprocedure('public.admin_characters(text, text, text, text, boolean, integer, timestamp with time zone, uuid)') is null as no_list,
        (select count(*)::int from pg_catalog.pg_attribute where attrelid = to_regclass('public.avatars')
           and attname in ('model_ver', 'model_prev', 'model_admin_at') and not attisdropped) as cols`)).rows[0];
      assert.deepEqual(r, { no_trash: true, no_list: true, cols: 0 }, String(re));
      await x.close();
    }
    // 0018 없이 0021까지 올린 DB(드물다): 0018이 없다고 멈춘다
    const no18 = await avatarDb(AVATAR_CHAIN.filter((f) => f !== '0018_event_codes.sql'), true);
    await no18.exec(HISTORY_3D);
    await assert.rejects(no18.exec(ADMIN_CONSOLE), /0024_needs_0018/);
    await no18.close();
  });

  test('되돌린 뒤 다시 올리면(판 칸은 남기고 트리거만 없다) 3D가 있는 줄의 판이 하나 오른다. 처음 올릴 때와 여러 번 올릴 때는 그대로', async () => {
    const x = await avatarDb(AVATAR_CHAIN, true);
    await x.exec(HISTORY_3D);
    await x.exec(ADMIN_CONSOLE);
    const u = '00000000-0000-4000-8000-0000000004b1';
    await x.query('insert into auth.users (id, email) values ($1, $2)', [u, 'reinstall@console.test']);
    const make = async (model) => {
      const id = crypto.randomUUID();
      await x.query(`insert into public.avatars (id, user_id, status, image_path, consent_at)
        values ($1::uuid, $2::uuid, 'ready', $2::text || '/chars/' || $1::text || '.png', now())`, [id, u]);
      if (model) await x.query(`update public.avatars set model_status = 'ready', model_maker = 'm' where id = $1`, [id]);
      return id;
    };
    const [withModel3d, plain] = [await make(true), await make(false)];
    const ver = async (id) => (await x.query('select model_ver from public.avatars where id = $1', [id])).rows[0].model_ver;
    assert.deepEqual([await ver(withModel3d), await ver(plain)], [2, 1]);
    await x.exec(ADMIN_CONSOLE);
    assert.deepEqual([await ver(withModel3d), await ver(plain)], [2, 1], '여러 번 올려도 그대로');
    // 되돌림(머리말대로 판 칸은 남긴다). 그동안 같은 자리에 3D를 다시 만들어도 판은 오르지 않는다
    await x.exec(`drop trigger if exists avatars_model_track on public.avatars;
      drop function if exists public.avatars_model_track();
      update public.avatars set model_status = null where id = '${withModel3d}';
      update public.avatars set model_status = 'ready' where id = '${withModel3d}';`);
    assert.equal(await ver(withModel3d), 2);
    await x.exec(ADMIN_CONSOLE);
    assert.deepEqual([await ver(withModel3d), await ver(plain)], [3, 1], '다시 올리면 3D가 있는 줄만 하나 오른다');
    await x.exec(ADMIN_CONSOLE);
    assert.deepEqual([await ver(withModel3d), await ver(plain)], [3, 1]);
    await x.close();
  });
});

// ───────────────────────────── 아이 사진의 보호자 동의(0025)
// 올린 본인만, 아직 올리는 중(pending)인 그림에만 보호자 동의 때를 한 번 적는다(그리기 줄에 세운 뒤에는 바꿀 수 없다).
// 일꾼(service_role)만 「아이로 보여도 그려도 되는가」를 묻는다: 보호자 동의가 적혔거나 그림 주인이 지금 명단의 집주인이면 참.
// 명단 밖·로그인 안 한 사람은 적지 못하고, 손님·가족·집주인도 일꾼 함수는 부르지 못한다.
const GUARDIAN = readMigration('0025_avatar_guardian.sql');
describe('아이 사진의 보호자 동의(0025)', () => {
  const GU = {
    admin: '00000000-0000-4000-8000-0000000005a1', family: '00000000-0000-4000-8000-0000000005f1',
    g1: '00000000-0000-4000-8000-000000000501', g2: '00000000-0000-4000-8000-000000000502',
    visitor: '00000000-0000-4000-8000-000000000599',
  };
  const GROLE = { admin: 'admin', family: 'family', g1: 'guest', g2: 'guest' };
  const GEMAIL = Object.fromEntries(Object.keys(GU).map((k) => [k, `${k}@guardian.test`]));
  let gdb;
  const asG = (who, fn) => inTx(gdb, who === 'anon' ? null : claimsOf(GU[who], GEMAIL[who]), fn);
  const asService = (fn) => gdb.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', '', true)`);
    await tx.query('set local role service_role');
    return fn(tx);
  });
  const agree = (who, id) => asG(who, (tx) => val(tx, 'select public.avatar_guardian_agree($1)', [id]));
  const childOk = (id) => asService((tx) => val(tx, 'select public.avatar_child_ok($1)', [id]));
  const add = async (who, status = 'pending') => {
    const id = crypto.randomUUID();
    await gdb.query(`insert into public.avatars (id, user_id, status, image_path, original_path, consent_at)
      values ($1::uuid, $2::uuid, $3, case when $3 = 'ready' then $2::text || '/chars/' || $1::text || '.png' end,
              case when $3 <> 'pending' then $2::text || '/originals/' || $1::text || '.jpg' end, now())`, [id, GU[who], status]);
    return id;
  };
  const guardianAt = async (id) => (await gdb.query('select guardian_at from public.avatars where id = $1', [id])).rows[0].guardian_at;

  before(async () => {
    gdb = await avatarDb(AVATAR_CHAIN, true);
    await gdb.exec(GUARDIAN);
    await gdb.exec(GUARDIAN); // 두 번 올려도 괜찮다
    for (const [k, id] of Object.entries(GU)) await gdb.query('insert into auth.users (id, email) values ($1, $2)', [id, GEMAIL[k]]);
    await gdb.exec(`insert into public.roster (display_name, role, email) values
      ${Object.entries(GROLE).map(([k, r]) => `('보호${k}', '${r}', '${GEMAIL[k]}')`).join(', ')};`);
    for (const who of Object.keys(GU)) await asG(who, (tx) => tx.query('select public.sync_my_roster()'));
  });

  test('보호자 동의: 올린 본인만, 올리는 중(pending)인 그림에만 한 번 적는다', async () => {
    const mine = await add('g1');
    assert.equal(await agree('g2', mine), false, '남의 그림');
    assert.equal(await agree('visitor', mine), false, '명단 밖');
    assert.equal(await guardianAt(mine), null);
    assert.equal(await agree('g1', mine), true);
    assert.ok(await guardianAt(mine));
    const first = await guardianAt(mine);
    assert.equal(await agree('g1', mine), false, '한 번만(때를 바꾸지 않는다)');
    assert.deepEqual(await guardianAt(mine), first);
    // 그리기 줄에 세운 뒤·다 그린 뒤에는 적지 못한다
    for (const status of ['queued', 'drawing', 'ready']) {
      const id = await add('g1', status);
      assert.equal(await agree('g1', id), false, status);
      assert.equal(await guardianAt(id), null, status);
    }
    assert.equal(await agree('g1', crypto.randomUUID()), false, '없는 그림');
    // 로그인 안 한 사람은 함수를 부를 권한이 없다
    await assert.rejects(asG('anon', (tx) => tx.query('select public.avatar_guardian_agree($1)', [mine])), /permission denied/);
  });

  test('일꾼만 묻는다: 보호자 동의가 적혔거나 주인이 집주인이면 아이로 보여도 그린다. 가족·손님의 동의 없는 그림은 아니다', async () => {
    const withConsent = await add('g1');
    await agree('g1', withConsent);
    const plain = await add('g2');
    const fam = await add('family');
    const owner = await add('admin');
    assert.deepEqual(
      [await childOk(withConsent), await childOk(plain), await childOk(fam), await childOk(owner), await childOk(crypto.randomUUID())],
      [true, false, false, true, false],
    );
    // 집주인 판정은 지금 명단 기준: 명단에서 거두면 집주인 그림도 아니다
    await gdb.query(`update public.roster set revoked_at = now() where role = 'admin'`);
    assert.equal(await childOk(owner), false);
    await gdb.query(`update public.roster set revoked_at = null where role = 'admin'`);
    assert.equal(await childOk(owner), true);
    // 사람 세션은 일꾼 함수를 부르지 못한다
    for (const who of ['admin', 'family', 'g1', 'anon']) {
      await assert.rejects(asG(who, (tx) => tx.query('select public.avatar_child_ok($1)', [owner])), /permission denied/, who);
    }
  });

  test('머리 확인: 0015가 없으면 아무것도 바꾸지 않고 멈춘다', async () => {
    const x = await avatarDb(AVATAR_CHAIN.filter((f) => f !== '0015_avatar_views.sql' && f !== '0016_avatar_models.sql' && f !== '0019_avatar_slots.sql'), false);
    await assert.rejects(x.exec(GUARDIAN), /0025_needs_0015/);
    const col = await x.query(`select count(*)::int as n from information_schema.columns where table_name = 'avatars' and column_name = 'guardian_at'`);
    assert.equal(col.rows[0].n, 0);
    await x.close();
  });
});
