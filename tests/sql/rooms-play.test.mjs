// 0002_rooms_play.sql을 0001 위에 올려(PGlite) 방 장면 다섯의 문패와 「문장 걸어 두기」 기록을 검사한다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const M1 = read('0001_init.sql');
const M2 = read('0002_rooms_play.sql');

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

const GUEST = '00000000-0000-4000-8000-000000000001';
const EMAIL = 'guest-one@example.test';
let db;

async function asGuest(fn) {
  return db.transaction(async (tx) => {
    const claims = { sub: GUEST, email: EMAIL, role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] } };
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.query('set local role authenticated');
    return fn(tx);
  });
}

before(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(M1);
  await db.exec(M2);
  await db.query('insert into auth.users (id, email) values ($1, $2)', [GUEST, EMAIL]);
  await db.exec(`insert into public.roster (display_name, role, email) values ('손님하나', 'guest', '${EMAIL}')`);
});

test('0002: 방 장면 다섯이 열리고 새 방 셋이 생긴다, 다시 올려도 그대로', async () => {
  await db.exec(M2);
  const rows = (await db.query(`select slug, door_state, accepts_records from public.rooms
    where slug in ('study', 'gable', 'toybox', 'target', 'mind') order by slug`)).rows;
  assert.deepEqual(rows.map((r) => [r.slug, r.door_state, r.accepts_records]), [
    ['gable', 'open', false], ['mind', 'open', false], ['study', 'open', true], ['target', 'open', false], ['toybox', 'open', false],
  ]);
});

test('0002: 손님은 빛이 드는 방에 문장을 걸 수 있고(검토 대기), 기록을 안 받는 방엔 못 쓴다', async () => {
  const r = await asGuest(async (tx) => (await tx.query(`insert into public.records (room_slug, format, body, requested_visibility)
    values ('study', 'sentence', $1, 'guests') returning status, format, room_slug`, ['오늘의 문장\n\n출처: 옛 글'])).rows[0]);
  assert.deepEqual([r.status, r.format, r.room_slug], ['submitted', 'sentence', 'study']);
  await assert.rejects(asGuest((tx) => tx.query(`insert into public.records (room_slug, format, body) values ('mind', 'sentence', 'x')`)), /room_closed|row-level security/);
});
