// 0012_note_photos.sql을 0001·0002·0008 위에 올려(PGlite) 쪽지 사진의 권한·확인·버리기를 검사한다.
// Supabase 저장소 스키마는 흉내만 낸다(버킷 표와 객체 표).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const MIGRATIONS = ['0001_init.sql', '0002_rooms_play.sql', '0008_rooms_more.sql', '0012_note_photos.sql'].map(read);

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
`;

const U = {
  admin: '00000000-0000-4000-8000-00000000000a',
  family: '00000000-0000-4000-8000-00000000000f',
  guest: '00000000-0000-4000-8000-000000000001',
  guest2: '00000000-0000-4000-8000-000000000002',
  gone: '00000000-0000-4000-8000-000000000009',
};
const EMAIL = {
  admin: 'admin@example.test', family: 'family@example.test', guest: 'g1@example.test',
  guest2: 'g2@example.test', gone: 'gone@example.test',
};
const P = (n) => String(n).repeat(32).slice(0, 32); // 32자리 16진 이름
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
const one = async (tx, sql, p = []) => (await tx.query(sql, p)).rows[0];
const val = async (tx, sql, p = []) => Object.values((await one(tx, sql, p)) ?? {})[0];
async function fails(who, sql, p, re) {
  await assert.rejects(as(who, (tx) => tx.query(sql, p)), (e) => { assert.match(String(e.message), re); return true; });
}
// 서버(비밀 키)가 올린 직후 적는 줄
const upload = (path, owner, age = '0 seconds') =>
  as('service', (tx) => tx.query(`insert into public.media (path, owner, created_at) values ($1, $2, now() - $3::interval)`, [path, owner, age]));
const trashList = () => as('service', async (tx) => (await tx.query('select path from public.media_trash_list(50)')).rows.map((r) => r.path));

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const m of MIGRATIONS) await db.exec(m);
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await db.exec(`insert into public.roster (display_name, role, email) values
    ('집주인', 'admin', '${EMAIL.admin}'), ('가족', 'family', '${EMAIL.family}'),
    ('손님하나', 'guest', '${EMAIL.guest}'), ('손님둘', 'guest', '${EMAIL.guest2}'), ('떠난손님', 'guest', '${EMAIL.gone}');`);
  for (const w of Object.keys(U)) await as(w, (tx) => tx.query('select public.sync_my_roster()'));
});

test('사진을 받는 방은 소나무와 포토존뿐, 포토존 문패가 생긴다', async () => {
  const rows = (await db.query(`select slug, door_state, accepts_records, accepts_photos from public.rooms
    where accepts_photos or slug in ('photozone', 'living') order by slug`)).rows;
  assert.deepEqual(rows.map((r) => [r.slug, r.door_state, r.accepts_records, r.accepts_photos]), [
    ['living', 'open', true, false], ['photozone', 'open', true, true], ['pine', 'open', true, true],
  ]);
});

test('버킷 notes는 비공개 JPEG, 저장소 정책 없음, 표는 손님·anon이 못 만진다', async () => {
  const b = (await db.query(`select public, allowed_mime_types, file_size_limit from storage.buckets where id = 'notes'`)).rows[0];
  assert.equal(b.public, false);
  assert.deepEqual(b.allowed_mime_types, ['image/jpeg']);
  assert.ok(Number(b.file_size_limit) <= 2 * 1024 * 1024);
  const pol = (await db.query(`select count(*)::int as n from pg_policies where schemaname = 'storage'`)).rows[0].n;
  assert.equal(pol, 0, '저장소 정책을 두지 않는다(서버만 만진다)');
  await fails('guest', 'select * from public.media', [], /permission denied/);
  await fails('guest', `insert into public.media (path, owner) values ($1, $2)`, [P('a'), U.guest], /permission denied/);
  await fails('anon', 'select * from public.media_trash', [], /permission denied/);
  await fails('guest', 'select * from public.media_trash_list(10)', [], /permission denied/);
  await fails('guest', `select public.media_trash_done(array['x'])`, [], /permission denied/);
  const priv = (await db.query(`select
    has_function_privilege('anon', 'public.room_records(text, int)', 'execute') as anon_room,
    has_function_privilege('anon', 'public.my_records()', 'execute') as anon_mine,
    has_function_privilege('authenticated', 'public.my_records()', 'execute') as auth_mine,
    has_function_privilege('service_role', 'public.media_trash_list(int)', 'execute') as svc_list`)).rows[0];
  assert.deepEqual(priv, { anon_room: true, anon_mine: false, auth_mine: true, svc_list: true });
});

test('사진 기록: 내가 1시간 안에 올린 파일만, 가족 범위로 낮춤, 한 파일은 기록 하나', async () => {
  await upload(P('1'), U.guest);
  const r = await as('guest', (tx) => one(tx, `insert into public.records
    (room_slug, format, body, media_path, requested_visibility, consent_public, marks_person, status, author_name)
    values ('pine', 'photo', '  같이 찍은 사진  ', $1, 'public', true, true, 'approved', '사칭')
    returning status, visibility, requested_visibility, body, author_name, marks_person`, [P('1')]));
  assert.deepEqual(r, { status: 'submitted', visibility: 'family', requested_visibility: 'family', body: '같이 찍은 사진', author_name: '손님하나', marks_person: true });

  await upload(P('2'), U.guest2);
  await fails('guest', `insert into public.records (room_slug, body, media_path) values ('pine', '남의 사진', $1)`, [P('2')], /media_not_yours/);
  await fails('guest', `insert into public.records (room_slug, body, media_path) values ('pine', '없는 사진', $1)`, [P('3')], /media_not_yours/);
  await upload(P('4'), U.guest, '2 hours');
  await fails('guest', `insert into public.records (room_slug, body, media_path) values ('pine', '오래된 사진', $1)`, [P('4')], /media_not_yours/);
  await upload(P('5'), U.guest);
  await fails('guest', `insert into public.records (room_slug, body, media_path) values ('living', '거실 사진', $1)`, [P('5')], /room_no_photos/);
  await fails('guest', `insert into public.records (room_slug, body, media_path) values ('photozone', '두 번', $1)`, [P('1')], /duplicate key|unique/);
  const ok = await as('guest', (tx) => one(tx, `insert into public.records (room_slug, body, media_path) values ('photozone', '포토존에서', $1) returning visibility`, [P('5')]));
  assert.equal(ok.visibility, 'family');
});

test('사진 없는 쪽지와 0001의 규칙은 그대로', async () => {
  await as('guest2', async (tx) => {
    const n = await one(tx, `insert into public.records (room_slug, body, requested_visibility) values ('pine', '사진 없이', 'public') returning requested_visibility, author_name`);
    assert.deepEqual(n, { requested_visibility: 'guests', author_name: '손님둘' });
  });
  await fails('guest', `insert into public.records (room_slug, body) values ('attic', '다락')`, [], /room_closed/);
  await fails('anon', `insert into public.records (room_slug, body) values ('pine', 'x')`, [], /permission denied/);
});

test('읽기: has_photo만 보이고 파일 이름·글쓴이 id는 내보내지 않는다, 다른 손님은 가족 범위 사진을 못 본다', async () => {
  const mine = await as('guest', (tx) => tx.query(`select * from public.room_records('pine')`));
  const photo = mine.rows.find((r) => r.body === '같이 찍은 사진');
  assert.equal(photo.has_photo, true);
  assert.equal(photo.mine, true);
  assert.ok(!('media_path' in photo) && !('author_id' in photo));
  const fam = await as('family', (tx) => tx.query(`select body, has_photo from public.room_records('pine') where has_photo`));
  assert.deepEqual(fam.rows.map((r) => r.body), ['같이 찍은 사진'], '가족은 승인 전에도 본다');

  const id = (await db.query(`select id from public.records where media_path = $1`, [P('1')])).rows[0].id;
  await as('admin', async (tx) => {
    assert.equal(await val(tx, `select public.moderate_record($1, 'approve', 'guests')`, [id]), 'wider_than_requested');
    assert.equal(await val(tx, `select public.moderate_record($1, 'approve')`, [id]), 'ok');
  });
  const other = await as('guest2', (tx) => tx.query(`select body from public.room_records('pine') where has_photo`));
  assert.equal(other.rows.length, 0, '사진 기록은 가족 범위까지만');
  const anon = await as('anon', (tx) => tx.query(`select body from public.room_records('pine') where has_photo`));
  assert.equal(anon.rows.length, 0);

  const list = await as('guest', (tx) => tx.query(`select room_slug, has_photo from public.my_records() order by room_slug`));
  assert.deepEqual(list.rows, [{ room_slug: 'photozone', has_photo: true }, { room_slug: 'pine', has_photo: true }]);
});

test('거두면 파일이 버릴 목록에 오르고, 서버가 지운 뒤 목록에서 뺀다', async () => {
  const id = (await db.query(`select id from public.records where media_path = $1`, [P('5')])).rows[0].id;
  assert.equal(await as('guest', (tx) => val(tx, 'select public.withdraw_record($1)', [id])), true);
  const media = (await db.query('select count(*)::int as n from public.media where path = $1', [P('5')])).rows[0].n;
  assert.equal(media, 0);
  const listed = await trashList();
  assert.ok(listed.includes(P('5')));
  assert.equal(await as('service', (tx) => val(tx, 'select public.media_trash_done($1)', [[P('5')]])), 1);
  assert.equal((await trashList()).includes(P('5')), false);
});

test('기록으로 이어지지 않은 파일은 하루 뒤 버리고, 계정을 지우면 그 사람 파일도 버린다', async () => {
  await upload(P('6'), U.guest2, '2 days');
  await upload(P('7'), U.guest2);
  const listed = await trashList();
  assert.ok(listed.includes(P('6')), '하루 지난 빈 파일');
  assert.equal(listed.includes(P('7')), false, '방금 올린 파일은 아직 둔다');
  assert.ok(listed.includes(P('2')) === false, '이틀이 안 된 남의 빈 파일도 아직 둔다');

  await upload(P('8'), U.gone);
  await as('gone', (tx) => tx.query(`insert into public.records (room_slug, body, media_path) values ('pine', '떠나기 전', $1)`, [P('8')]));
  await upload(P('9'), U.gone);
  await db.query('delete from auth.users where id = $1', [U.gone]);
  const after = await trashList();
  assert.ok(after.includes(P('8')) && after.includes(P('9')));
  const left = (await db.query(`select count(*)::int as n from public.records where media_path = $1`, [P('8')])).rows[0].n;
  assert.equal(left, 0);
});
