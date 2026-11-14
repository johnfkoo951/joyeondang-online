// 0010_qr_quiet.sql을 0001 위에 올려(PGlite) 현장 QR 도장과 조용 모드·박수 권한을 검사한다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const M1 = read('0001_init.sql');
const M10 = read('0010_qr_quiet.sql');

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
`;

const U = {
  admin: '00000000-0000-4000-8000-00000000000a',
  guest: '00000000-0000-4000-8000-000000000001',
  guest2: '00000000-0000-4000-8000-000000000002',
  visitor: '00000000-0000-4000-8000-000000000003',
};
const EMAIL = { admin: 'admin@example.test', guest: 'g1@example.test', guest2: 'g2@example.test', visitor: 'v@example.test' };
let db;

async function as(who, fn) {
  return db.transaction(async (tx) => {
    if (who === 'anon') {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role anon');
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
const makeQr = (room, code, from, until, label = null) =>
  as('admin', (tx) => val(tx, `select public.admin_make_qr($1, $2, ${from}, ${until}, $3)`, [room, code, label]));
const stamp = (who, room, code) => as(who, (tx) => val(tx, 'select public.earn_qr_stamp($1, $2)', [room, code]));

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(M1);
  await db.exec(M10);
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await db.exec(`insert into public.roster (display_name, role, email) values
    ('집주인', 'admin', '${EMAIL.admin}'), ('손님하나', 'guest', '${EMAIL.guest}'), ('손님둘', 'guest', '${EMAIL.guest2}');`);
  for (const w of ['admin', 'guest', 'guest2', 'visitor']) await as(w, (tx) => tx.query('select public.sync_my_roster()'));
});

test('QR: 표, 함수 권한 — anon은 표에 닿지 못하고 도장 함수도 못 부른다', async () => {
  await fails('anon', 'select * from public.qr_marks', [], /permission denied/);
  await fails('anon', 'select * from public.site_state', [], /permission denied/);
  await fails('anon', `select public.earn_qr_stamp('porch', 'ABCDEFGHJK')`, [], /permission denied/);
  await fails('guest', 'select * from public.site_state', [], /permission denied/);
  await fails('guest', 'select * from public.clap_seen', [], /permission denied/);
  const priv = (await db.query(`select
    has_function_privilege('anon', 'public.site_now()', 'execute') as anon_now,
    has_function_privilege('anon', 'public.clap()', 'execute') as anon_clap,
    has_function_privilege('anon', 'public.admin_set_quiet(int)', 'execute') as anon_quiet,
    has_function_privilege('anon', 'public.admin_make_qr(text, text, timestamptz, timestamptz, text)', 'execute') as anon_make,
    has_function_privilege('authenticated', 'public.earn_qr_stamp(text, text)', 'execute') as auth_stamp`)).rows[0];
  assert.deepEqual(priv, { anon_now: true, anon_clap: false, anon_quiet: false, anon_make: false, auth_stamp: true });
});

test('QR: 만들기는 집주인만, 코드는 정규화해 원문으로 저장, 시간 창 확인', async () => {
  await fails('guest', `select public.admin_make_qr('porch', 'ABCDEFGHJK', now(), now() + interval '1 day')`, [], /admin_only/);
  await fails('admin', `select public.admin_make_qr('porch', 'SHORT-1', now(), now() + interval '1 day')`, [], /code_too_short/);
  await fails('admin', `select public.admin_make_qr('porch', 'ABCDEFGHJK', now(), now() - interval '1 hour')`, [], /bad_window/);
  await fails('admin', `select public.admin_make_qr('nowhere', 'ABCDEFGHJK', now(), now() + interval '1 hour')`, [], /foreign key/);
  const id = await makeQr('porch', 'abcd-efgh-jkmn', `now() - interval '1 hour'`, `now() + interval '1 day'`, '  포치 카드  ');
  assert.match(id, /^[0-9a-f-]{36}$/);
  const row = (await db.query('select code, label from public.qr_marks where id = $1', [id])).rows[0];
  assert.deepEqual(row, { code: 'ABCDEFGHJKMN', label: '포치 카드' });
  const seen = await as('admin', (tx) => tx.query('select id from public.qr_marks'));
  assert.equal(seen.rows.length, 1, '집주인은 목록을 본다');
  const guestSees = await as('guest', (tx) => tx.query('select id from public.qr_marks'));
  assert.equal(guestSees.rows.length, 0, '손님은 목록을 못 본다');
  await fails('guest', `insert into public.qr_marks (room_slug, code, valid_from, valid_until) values ('porch', 'ZZZZZZZZZZ', now(), now() + interval '1 day')`, [], /row-level security|permission denied/);
});

test('QR 도장: 명단 손님만, 한 번만(두 번째는 first=false), 방 도장도 함께', async () => {
  assert.deepEqual(await stamp('visitor', 'porch', 'ABCDEFGHJKMN'), { ok: false, reason: 'not_guest' });
  assert.deepEqual(await stamp('guest', 'porch', 'WRONGCODE99'), { ok: false, reason: 'invalid' });
  assert.deepEqual(await stamp('guest', 'pine', 'ABCDEFGHJKMN'), { ok: false, reason: 'invalid' }, '다른 방 코드는 안 된다');
  assert.deepEqual(await stamp('guest', 'porch', 'abcd efgh-jkmn'), { ok: true, room: 'porch', first: true });
  assert.deepEqual(await stamp('guest', 'porch', 'ABCDEFGHJKMN'), { ok: true, room: 'porch', first: false });
  const rows = await as('guest', (tx) => tx.query('select item, source from public.stamps order by item'));
  assert.deepEqual(rows.rows, [{ item: 'qr:porch', source: 'qr' }, { item: 'room:porch', source: 'visit' }]);
  assert.equal((await stamp('guest2', 'porch', 'ABCDEFGHJKMN')).first, true, '다른 손님은 따로 받는다');
});

test('QR 도장: 시간 창 밖, 거둔 표식, 닫힌 방', async () => {
  await makeQr('pine', 'LATERCODE22', `now() + interval '1 day'`, `now() + interval '2 days'`);
  await makeQr('pine', 'PASTCODE333', `now() - interval '2 days'`, `now() - interval '1 day'`);
  assert.deepEqual(await stamp('guest', 'pine', 'LATERCODE22'), { ok: false, reason: 'not_now', room: 'pine' });
  assert.deepEqual(await stamp('guest', 'pine', 'PASTCODE333'), { ok: false, reason: 'not_now', room: 'pine' });

  const id = await makeQr('living', 'REVOKEME444', `now() - interval '1 hour'`, `now() + interval '1 hour'`);
  await fails('guest', 'select public.admin_revoke_qr($1)', [id], /admin_only/);
  assert.equal(await as('admin', (tx) => val(tx, 'select public.admin_revoke_qr($1)', [id])), true);
  assert.equal(await as('admin', (tx) => val(tx, 'select public.admin_revoke_qr($1)', [id])), false, '두 번 거둘 수 없다');
  assert.deepEqual(await stamp('guest', 'living', 'REVOKEME444'), { ok: false, reason: 'invalid' });

  await makeQr('kitchen', 'RESTING5555', `now() - interval '1 hour'`, `now() + interval '1 hour'`);
  assert.deepEqual(await stamp('guest', 'kitchen', 'RESTING5555'), { ok: false, reason: 'closed', room: 'kitchen' });
  const items = await as('guest', (tx) => tx.query(`select item from public.stamps where item like '%pine' or item like '%living' or item like '%kitchen'`));
  assert.equal(items.rows.length, 0, '거절된 표식으로는 도장이 생기지 않는다');
});

test('조용 모드: 누구나 상태를 읽고, 켜고 끄는 것은 집주인만', async () => {
  const before = await as('anon', (tx) => val(tx, 'select public.site_now()'));
  assert.deepEqual(before, { quiet: false, until: null, claps: 0 });
  await fails('guest', 'select public.admin_set_quiet(20)', [], /admin_only/);
  await fails('anon', 'select public.admin_set_quiet(20)', [], /permission denied/);
  const on = await as('admin', (tx) => val(tx, 'select public.admin_set_quiet(20)'));
  assert.equal(on.quiet, true);
  const mins = (await db.query(`select round(extract(epoch from (quiet_until - now())) / 60) as m from public.site_state`)).rows[0].m;
  assert.equal(Number(mins), 20);
  await as('admin', (tx) => tx.query('select public.admin_set_quiet(500)'));
  const capped = (await db.query(`select round(extract(epoch from (quiet_until - now())) / 60) as m from public.site_state`)).rows[0].m;
  assert.equal(Number(capped), 60, '60분을 넘지 않는다');
  const seen = await as('anon', (tx) => val(tx, 'select public.site_now()'));
  assert.equal(seen.quiet, true);
  assert.equal(typeof seen.until, 'string');
});

test('박수: 조용 모드 동안 명단 손님만, 한 사람 2초에 한 번', async () => {
  await fails('anon', 'select public.clap()', [], /permission denied/);
  await fails('visitor', 'select public.clap()', [], /not_guest/);
  assert.equal(await as('guest', (tx) => val(tx, 'select public.clap()')), 1);
  assert.equal(await as('guest', (tx) => val(tx, 'select public.clap()')), 1, '2초 안에 다시 누르면 세지 않는다');
  await db.query(`update public.clap_seen set at = now() - interval '3 seconds' where user_id = $1`, [U.guest]);
  assert.equal(await as('guest', (tx) => val(tx, 'select public.clap()')), 2);
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.clap()')), 3);
  assert.equal((await as('anon', (tx) => val(tx, 'select public.site_now()'))).claps, 3);

  // 켜 둔 채 시간을 늘리면 박수는 그대로, 끄면 세지 않고, 다시 켜면 0부터
  await as('admin', (tx) => tx.query('select public.admin_set_quiet(10)'));
  assert.equal((await as('anon', (tx) => val(tx, 'select public.site_now()'))).claps, 3);
  const off = await as('admin', (tx) => val(tx, 'select public.admin_set_quiet(0)'));
  assert.deepEqual(off, { quiet: false, until: null, claps: 3 });
  await db.query(`update public.clap_seen set at = now() - interval '1 minute'`);
  assert.equal(await as('guest', (tx) => val(tx, 'select public.clap()')), 3, '조용 모드가 아니면 세지 않는다');
  const again = await as('admin', (tx) => val(tx, 'select public.admin_set_quiet(20)'));
  assert.equal(again.claps, 0);
  assert.equal(await as('guest', (tx) => val(tx, 'select public.clap()')), 1);
});
