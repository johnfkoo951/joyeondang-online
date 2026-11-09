// 0004_shots.sql을 PGlite에 올려 걷기 사진 갤러리 권한을 검사한다(본인만, 60장 상한, 저장소 경로).
// auth·storage 스키마는 흉내만 낸다(Supabase처럼 storage.objects에 RLS가 켜져 있다).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync(new URL('../../supabase/migrations/0004_shots.sql', import.meta.url), 'utf8');

const STUB = `
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to anon, authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated;
`;

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
let db;

async function as(who, fn) {
  return db.transaction(async (tx) => {
    if (who === 'anon') {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.query('set local role anon');
    } else {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: 'authenticated' })]);
      await tx.query('set local role authenticated');
    }
    return fn(tx);
  });
}
const count = async (tx, sql, p = []) => Number(Object.values((await tx.query(sql, p)).rows[0])[0]);
const fails = (p, re) => assert.rejects(p, re);

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.query('insert into auth.users (id) values ($1), ($2)', [A, B]);
  await db.exec(MIGRATION);
});

test('버킷: 비공개, JPEG만, 3MB', async () => {
  const r = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'shots'`)).rows[0];
  assert.equal(r.public, false);
  assert.equal(Number(r.file_size_limit), 3 * 1024 * 1024);
  assert.deepEqual(r.allowed_mime_types, ['image/jpeg']);
});

test('본인 사진만 올리고 보고 지운다', async () => {
  await as(A, (tx) => tx.query(`insert into public.shots (path, w, h, place) values ($1, 1920, 1080, '앞마당')`, [`${A}/one.jpg`]));
  await as(A, async (tx) => {
    const r = (await tx.query('select user_id from public.shots')).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].user_id, A);
  });
  assert.equal(await as(B, (tx) => count(tx, 'select count(*) from public.shots')), 0);
  assert.equal(await as('anon', (tx) => count(tx, 'select count(*) from public.shots')).catch(() => 0), 0);
  // 남의 것은 지워지지 않는다(0줄)
  await as(B, (tx) => tx.query('delete from public.shots'));
  assert.equal(await as(A, (tx) => count(tx, 'select count(*) from public.shots')), 1);
});

test('남의 이름이나 남의 폴더로는 못 올린다', async () => {
  await fails(as(B, (tx) => tx.query(`insert into public.shots (path, w, h) values ($1, 10, 10)`, [`${A}/x.jpg`])), /row-level security/);
  await fails(as(B, (tx) => tx.query(`insert into public.shots (user_id, path, w, h) values ($1, $2, 10, 10)`, [A, `${A}/y.jpg`])), /row-level security/);
  await fails(as('anon', (tx) => tx.query(`insert into public.shots (path, w, h) values ('anon/z.jpg', 10, 10)`)), /permission denied|row-level security|null value/);
});

test('60장까지만, 넘으면 shots_full로 거절하고 지우지 않는다', async () => {
  await as(B, async (tx) => {
    for (let i = 0; i < 60; i += 1) {
      await tx.query(`insert into public.shots (path, w, h) values ($1, 100, 100)`, [`${B}/n${i}.jpg`]);
    }
  });
  await fails(as(B, (tx) => tx.query(`insert into public.shots (path, w, h) values ($1, 100, 100)`, [`${B}/over.jpg`])), /shots_full/);
  assert.equal(await as(B, (tx) => count(tx, 'select count(*) from public.shots')), 60);
  // 한 장 지우면 다시 올릴 수 있다
  await as(B, (tx) => tx.query(`delete from public.shots where path = $1`, [`${B}/n0.jpg`]));
  await as(B, (tx) => tx.query(`insert into public.shots (path, w, h) values ($1, 100, 100)`, [`${B}/again.jpg`]));
  assert.equal(await as(B, (tx) => count(tx, 'select count(*) from public.shots')), 60);
  // 다른 사람의 상한과 섞이지 않는다
  await as(A, (tx) => tx.query(`insert into public.shots (path, w, h) values ($1, 10, 10)`, [`${A}/two.jpg`]));
});

test('저장소: shots 버킷의 내 폴더만', async () => {
  await as(A, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('shots', $1)`, [`${A}/one.jpg`]));
  await fails(as(A, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('shots', $1)`, [`${B}/bad.jpg`])), /row-level security/);
  await fails(as(A, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('shots', 'loose.jpg')`)), /row-level security/);
  await fails(as('anon', (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('shots', $1)`, [`${A}/anon.jpg`])), /row-level security/);
  assert.equal(await as(B, (tx) => count(tx, `select count(*) from storage.objects where bucket_id = 'shots'`)), 0);
  assert.equal(await as(A, (tx) => count(tx, `select count(*) from storage.objects where bucket_id = 'shots'`)), 1);
  await as(B, (tx) => tx.query(`delete from storage.objects where bucket_id = 'shots'`));
  assert.equal(await as(A, (tx) => count(tx, `select count(*) from storage.objects where bucket_id = 'shots'`)), 1);
  await as(A, (tx) => tx.query(`delete from storage.objects where bucket_id = 'shots'`));
  assert.equal(await as(A, (tx) => count(tx, `select count(*) from storage.objects where bucket_id = 'shots'`)), 0);
});
