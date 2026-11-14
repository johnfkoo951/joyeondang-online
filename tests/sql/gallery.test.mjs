// 0023_gallery.sql을 0001 위에 올려(PGlite) 부엌 사진 갤러리 버킷을 검사한다: 비공개, 크기·형식 제한, 저장소 정책 없음
// (손님·가족·집주인 누구의 세션으로도 목록과 그림에 닿지 못하고, 서버의 비밀 키만 만진다). Supabase 저장소 스키마는 흉내만 낸다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const DIR = new URL('../../supabase/migrations/', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');
const GALLERY = read('0023_gallery.sql');

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
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/') $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

const U = {
  admin: '00000000-0000-4000-8000-00000000000a',
  family: '00000000-0000-4000-8000-00000000000f',
  guest: '00000000-0000-4000-8000-000000000001',
  visitor: '00000000-0000-4000-8000-000000000003',
};
const EMAIL = { admin: 'admin@example.test', family: 'family@example.test', guest: 'g1@example.test', visitor: 'v@example.test' };
let db;

async function as(who, fn) {
  return db.transaction(async (tx) => {
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
const count = async (tx, sql, p = []) => Number(Object.values((await tx.query(sql, p)).rows[0])[0]);

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(read('0001_init.sql'));
  await db.exec(GALLERY);
  // 여러 번 올려도 된다
  await db.exec(GALLERY);
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await db.exec(`
    insert into public.roster (display_name, role, email) values
      ('관리자', 'admin', '${EMAIL.admin}'), ('가족', 'family', '${EMAIL.family}'), ('손님', 'guest', '${EMAIL.guest}');
  `);
  for (const who of ['admin', 'family', 'guest', 'visitor']) await as(who, (tx) => tx.query('select public.sync_my_roster()'));
  // 서버(비밀 키)가 올린 목록과 그림
  await as('service', (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('gallery', 'manifest.json'), ('gallery', 'images/a.jpg')`));
});

test('버킷: 비공개, 한 파일 5MB, 그림(JPEG·PNG·WebP)과 목록(JSON)만', async () => {
  const b = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'gallery'`)).rows[0];
  assert.equal(b.public, false);
  assert.equal(Number(b.file_size_limit), 5 * 1024 * 1024);
  assert.deepEqual(b.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp', 'application/json']);
});

test('누구의 세션으로도 목록·그림을 보거나 올리거나 지우지 못한다(서버만)', async () => {
  for (const who of ['anon', 'visitor', 'guest', 'family', 'admin']) {
    assert.equal(await as(who, (tx) => count(tx, `select count(*) from storage.objects where bucket_id = 'gallery'`)), 0, `${who} 보기`);
    await assert.rejects(as(who, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('gallery', 'images/x.jpg')`)), /row-level security/, `${who} 올리기`);
    await as(who, (tx) => tx.query(`delete from storage.objects where bucket_id = 'gallery'`));
  }
  assert.equal(await as('service', (tx) => count(tx, `select count(*) from storage.objects where bucket_id = 'gallery'`)), 2, '지워지지 않았다');
});

test('어느 마이그레이션도 gallery 버킷에 저장소 정책을 두지 않는다', () => {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.sql'))) {
    const sql = read(f).replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /create\s+policy[\s\S]{0,400}?bucket_id\s*=\s*'gallery'/i, f);
  }
});
