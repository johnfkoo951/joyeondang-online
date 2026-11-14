// 0028_room_voice.sql 권한·검사 검증(PGlite): 가족만 읽고 쓰고, 서로 읽되 자기 줄만 고친다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const M0001 = read('0001_init.sql');
const M0002 = read('0002_rooms_play.sql');
const M0008 = read('0008_rooms_more.sql');
const M0028 = read('0028_room_voice.sql');

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
  host: '00000000-0000-4000-8000-000000000201',
  kin: '00000000-0000-4000-8000-000000000202',
  guest: '00000000-0000-4000-8000-000000000203',
  stranger: '00000000-0000-4000-8000-000000000209',
};

let db;

const claimsOf = (sub, email) => ({
  sub,
  email,
  role: 'authenticated',
  app_metadata: { provider: 'google', providers: ['google'] },
});

async function as(who, fn) {
  return db.transaction(async (tx) => {
    if (who === 'anon') {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role anon');
    } else {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claimsOf(U[who], `${who}@example.com`))]);
      await tx.query('set local role authenticated');
    }
    return fn(tx);
  });
}

const save = (tx, room, marks, notes = {}, answers = {}, status = 'draft', seen = [], hash = 'h1', version = '0.10.0') =>
  tx.query('select public.save_room_voice($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6::text[], $7, $8) as res', [
    room, JSON.stringify(marks), JSON.stringify(notes), JSON.stringify(answers), status, seen, hash, version,
  ]);

before(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(M0001);
  await db.exec(M0002);
  await db.exec(M0008);
  await db.exec(M0028);
  for (const k of Object.keys(U)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [U[k], `${k}@example.com`]);
  }
  await db.query(`insert into public.roster (display_name, email, role) values
    ('집주인', 'host@example.com', 'admin'), ('식구', 'kin@example.com', 'family'), ('손님', 'guest@example.com', 'guest')`);
  // 명단 줄을 계정에 잇는다(로그인 뒤 sync_my_roster가 하는 일)
  for (const who of ['host', 'kin', 'guest']) {
    await as(who, (tx) => tx.query('select public.sync_my_roster()'));
  }
});

test('비로그인·명단 밖·손님은 의견을 남기지도 읽지도 못한다', async () => {
  await assert.rejects(as('anon', (tx) => save(tx, 'toybox', { 'item:toy-shelf': 'keep' })), /permission denied|not_allowed/);
  await assert.rejects(as('stranger', (tx) => save(tx, 'toybox', { 'item:toy-shelf': 'keep' })), /not_allowed/);
  await assert.rejects(as('guest', (tx) => save(tx, 'toybox', { 'item:toy-shelf': 'keep' })), /not_allowed/);
  const list = await as('guest', (tx) => tx.query('select * from public.room_voice_list()'));
  assert.equal(list.rows.length, 0);
});

test('가족은 방마다 한 줄을 쓰고 고치며, 가족끼리 서로의 의견을 읽는다', async () => {
  const r1 = await as('kin', (tx) =>
    save(tx, 'toybox', { 'item:toy-shelf': 'change', 'game:sword': 'keep' }, { 'item:toy-shelf': '선반을 하나 더' }, { add: '수족관' }, 'draft', ['item:toy-shelf', 'game:sword'], 'abc', '0.10.0'),
  );
  assert.equal(r1.rows[0].res.status, 'draft');
  // 같은 방을 다시 쓰면 그 줄을 고친다
  await as('kin', (tx) => save(tx, 'toybox', { 'item:toy-shelf': 'remove' }, {}, { add: '수족관과 물고기' }, 'done', ['item:toy-shelf'], 'abd', '0.10.1'));
  await as('host', (tx) => save(tx, 'toybox', { 'game:sword': 'keep' }, { 'game:sword': '좋아요' }));

  const mine = await as('kin', (tx) => tx.query('select * from public.room_voice_list() where room_slug = $1 order by writer', ['toybox']));
  assert.equal(mine.rows.length, 2);
  const kinRow = mine.rows.find((r) => r.mine);
  assert.equal(kinRow.writer, '식구');
  assert.equal(kinRow.status, 'done');
  assert.deepEqual(kinRow.marks, { 'item:toy-shelf': 'remove' });
  assert.equal(kinRow.answers.add, '수족관과 물고기');
  assert.deepEqual(kinRow.seen_items, ['item:toy-shelf']);
  assert.equal(kinRow.room_hash, 'abd');
  assert.equal(kinRow.app_version, '0.10.1');
  assert.equal('user_id' in kinRow, false);
  const hostRow = mine.rows.find((r) => !r.mine);
  assert.equal(hostRow.writer, '집주인');
  assert.equal(hostRow.notes['game:sword'], '좋아요');
});

test('표는 직접 쓰지 못하고, 손님에게는 한 줄도 보이지 않는다', async () => {
  await assert.rejects(
    as('kin', (tx) => tx.query(`insert into public.room_voice (room_slug, user_id) values ('mind', $1)`, [U.kin])),
    /permission denied/,
  );
  await assert.rejects(
    as('kin', (tx) => tx.query(`update public.room_voice set status = 'draft'`)),
    /permission denied/,
  );
  const guestRows = await as('guest', (tx) => tx.query('select * from public.room_voice'));
  assert.equal(guestRows.rows.length, 0);
  const kinRows = await as('kin', (tx) => tx.query('select * from public.room_voice'));
  assert.ok(kinRows.rows.length >= 2);
  await assert.rejects(as('anon', (tx) => tx.query('select * from public.room_voice')), /permission denied/);
});

test('모양이 틀린 값은 받지 않는다', async () => {
  await assert.rejects(as('kin', (tx) => save(tx, 'no-such-room', {})), /invalid_room/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', { 'item:desk': 'love' })), /invalid_marks/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', { 'Item Desk': 'keep' })), /invalid_marks/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', {}, { 'item:desk': 'x'.repeat(601) })), /invalid_notes/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', {}, { 'item:desk': 3 })), /invalid_notes/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', {}, {}, { note: 'x'.repeat(2001) })), /invalid_answers/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', {}, {}, {}, 'sent')), /invalid_status/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', {}, {}, {}, 'draft', ['BAD KEY'])), /invalid_seen/);
  await assert.rejects(as('kin', (tx) => save(tx, 'mind', {}, {}, {}, 'draft', [], 'h'.repeat(65))), /invalid_stamp/);
  // 닫힌 방(spare)도 rooms 표에 있으니 의견을 받는다
  const ok = await as('kin', (tx) => save(tx, 'spare', {}, {}, { fill: '작은 도서관' }));
  assert.equal(ok.rows[0].res.room, 'spare');
});
