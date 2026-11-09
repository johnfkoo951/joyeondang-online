// 0001_init.sql을 실제 Postgres(PGlite, WASM)에 올려 명단·기록 권한을 검사한다.
// Supabase의 auth 스키마는 흉내만 낸다: auth.uid()/auth.jwt()는 request.jwt.claims 설정값을 읽는다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

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

async function as(who, fn) {
  // who: 'anon' | 사용자 키. 한 트랜잭션 안에서 역할과 JWT를 바꿔 끼운다.
  return db.transaction(async (tx) => {
    if (who === 'anon') {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role anon');
    } else {
      const claims = { sub: U[who], email: EMAIL[who], role: 'authenticated',
        app_metadata: { provider: 'google', providers: ['google'] } };
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.query('set local role authenticated');
    }
    return fn(tx);
  });
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
