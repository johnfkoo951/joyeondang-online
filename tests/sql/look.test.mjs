// 0001_init.sql + 0006_profile_look.sql을 PGlite에 올려 캐릭터 겉모습 열(profiles.look)을 검사한다.
// 모양 검사는 객체·1KB까지만(값은 사이트 cleanLook이 고친다), 읽기·쓰기는 이미 있는 profiles 본인 정책 그대로.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const INIT = sql('0001_init.sql');
const LOOK = sql('0006_profile_look.sql');

const STUB = `
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

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const DOLL = { kind: 'doll', doll: { hair: 'bob', hairColor: '#a8743f', skin: '#c99470', top: '#6b8fb5', bottom: '#ece4d6', acc: 'glasses' } };
const PHOTO = { kind: 'photo', url: '/api/avatar/0f8e2c1a-1234-4abc-9def-0123456789ab' };

let db;
async function as(who, fn) {
  return db.transaction(async (tx) => {
    const claims = who === 'anon' ? '' : JSON.stringify({ sub: who, role: 'authenticated' });
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await tx.query(who === 'anon' ? 'set local role anon' : 'set local role authenticated');
    return fn(tx);
  });
}
const fails = (p, re) => assert.rejects(p, re);
const lookOf = async (id) => (await db.query('select look from public.profiles where user_id = $1', [id])).rows[0]?.look;
const setLook = (tx, v, id) => tx.query('update public.profiles set look = $1::jsonb where user_id = $2', [v === null ? null : JSON.stringify(v), id]);

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(INIT);
  await db.exec(LOOK);
  await db.exec(LOOK); // 두 번 올려도 괜찮다(if not exists·drop constraint if exists)
  await db.query('insert into auth.users (id) values ($1), ($2)', [A, B]);
  // 프로필 행은 운영자 권한으로 만든다(새 행 정책은 0001 rls 시험이 본다)
  await db.query('insert into public.profiles (user_id) values ($1), ($2)', [A, B]);
});

test('profiles.look은 jsonb, 비어 있어도 되고 처음엔 null', async () => {
  const col = (await db.query(`select data_type, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'look'`)).rows[0];
  assert.deepEqual(col, { data_type: 'jsonb', is_nullable: 'YES' });
  assert.equal(await lookOf(A), null);
});

test('본인만 자기 겉모습을 고치고 읽는다. 남의 행은 보이지도 바뀌지도 않는다', async () => {
  const r = await as(A, (tx) => setLook(tx, DOLL, A));
  assert.equal(r.affectedRows, 1);
  assert.deepEqual(await as(A, async (tx) => (await tx.query('select look from public.profiles where user_id = $1', [A])).rows[0].look), DOLL);
  await as(B, (tx) => setLook(tx, PHOTO, B));
  assert.deepEqual(await lookOf(B), PHOTO);
  // A가 B의 겉모습을 바꾸려 하면 0행(RLS가 걸러 냄), B의 값은 그대로
  const other = await as(A, (tx) => setLook(tx, DOLL, B));
  assert.equal(other.affectedRows, 0);
  assert.deepEqual(await lookOf(B), PHOTO);
  assert.equal((await as(A, (tx) => tx.query('select look from public.profiles where user_id = $1', [B]))).rows.length, 0);
  // 내 행을 남의 것으로 넘기기도 막힌다
  await fails(as(A, (tx) => tx.query('update public.profiles set user_id = $1 where user_id = $2', [B, A])), /row-level security|duplicate key/);
  // 로그인하지 않은 사람은 아무것도 못 바꾼다
  const anon = await as('anon', (tx) => setLook(tx, DOLL, B)).catch((e) => e);
  assert.ok(anon instanceof Error ? /permission denied/.test(anon.message) : anon.affectedRows === 0);
  assert.deepEqual(await lookOf(B), PHOTO);
});

test('모양 검사: 객체만, 1KB까지. 배열·문자열·숫자·너무 큰 값은 거절, null로 지우기는 된다', async () => {
  for (const bad of [[DOLL], 'doll', 3, { kind: 'doll', pad: 'x'.repeat(1100) }]) {
    await fails(as(A, (tx) => setLook(tx, bad, A)), /profiles_look_shape/);
  }
  assert.deepEqual(await lookOf(A), DOLL);
  await as(A, (tx) => setLook(tx, null, A));
  assert.equal(await lookOf(A), null);
});
