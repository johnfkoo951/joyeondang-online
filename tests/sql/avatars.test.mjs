// 0001 + 0003을 PGlite에 올려 AI 사진 캐릭터의 권한·상한·경로 규칙을 확인한다.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const M1 = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
const M3 = readFileSync(new URL('../../supabase/migrations/0003_avatars.sql', import.meta.url), 'utf8');

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

const U = {
  guest: '00000000-0000-4000-8000-000000000001',
  guest2: '00000000-0000-4000-8000-000000000002',
  visitor: '00000000-0000-4000-8000-000000000003',
  guest3: '00000000-0000-4000-8000-000000000004',
};
const EMAIL = { guest: 'g1@example.com', guest2: 'g2@example.com', visitor: 'v@example.com', guest3: 'g3@example.com' };
let db;
async function as(who, fn) {
  return db.transaction(async (tx) => {
    if (who === 'service') {
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
const val = async (tx, sql, p = []) => Object.values((await tx.query(sql, p)).rows[0] ?? {})[0];
async function fails(who, sql, p, re) {
  await assert.rejects(as(who, (tx) => tx.query(sql, p)), (e) => { assert.match(String(e.message), re); return true; });
}
const begin = (who, cap = 150) => as(who, (tx) => val(tx, 'select public.avatar_begin(true, $1)', [cap]));
const settleReady = async (who, id) => {
  const ok = await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'ready', $2, $3, 'gpt-image-2.6-flare')`,
    [id, `${U[who]}/originals/${id}.jpg`, `${U[who]}/chars/${id}.png`]));
  await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`,
    [`${U[who]}/originals/${id}.jpg`, `${U[who]}/chars/${id}.png`]);
  return ok;
};

before(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(M1);
  await db.exec(M3);
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, EMAIL[k]]);
  await db.exec(`insert into public.roster (display_name, role, email) values
    ('손님하나', 'guest', '${EMAIL.guest}'), ('손님둘', 'guest', '${EMAIL.guest2}'), ('손님셋', 'guest', '${EMAIL.guest3}');`);
  for (const w of ['guest', 'guest2', 'guest3']) await as(w, (tx) => tx.query('select public.sync_my_roster()'));
});

test('버킷은 비공개, 정책 3개', async () => {
  const b = (await db.query(`select public from storage.buckets where id = 'avatars'`)).rows[0];
  assert.equal(b.public, false);
});

test('명단 밖은 시작 못 하고, 표에 직접 쓰지 못한다', async () => {
  assert.equal((await begin('visitor')).reason, 'not_guest');
  await fails('guest', `insert into public.avatars (status, consent_at) values ('ready', now())`, [], /permission denied/);
  await fails('guest', `update public.avatars set status = 'ready'`, [], /permission denied/);
  assert.equal((await as('guest', (tx) => val(tx, 'select public.avatar_begin(false, 150)'))).reason, 'consent');
});

test('하루 3장, 거절은 장수에 안 세고 시도에는 센다, 시도 8번', async () => {
  const ids = [];
  for (let k = 0; k < 3; k++) {
    const r = await begin('guest');
    assert.equal(r.ok, true, JSON.stringify(r));
    ids.push(r.id);
  }
  assert.equal((await begin('guest')).reason, 'user_limit');
  // 실패 하나는 장수에서 빠진다
  assert.equal(await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'failed')`, [ids[2]])), true);
  const q = await as('guest', (tx) => val(tx, 'select public.avatar_quota()'));
  assert.equal(q.used, 2);
  assert.equal(q.attempts, 3);
  // 이미 끝난 줄은 다시 정리하지 못한다
  assert.equal(await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'ready', null, null, null)`, [ids[2]])), false);
  // 사진 살피기 거절(일꾼이 정리)은 장수에 안 세고 시도에는 센다
  for (let k = 0; k < 5; k++) {
    const r = await begin('guest');
    assert.equal(r.ok, true, JSON.stringify(r));
    const ok = await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'rejected', null, null, null, 'child')`, [r.id]));
    assert.equal(ok, true);
  }
  const q2 = await as('guest', (tx) => val(tx, 'select public.avatar_quota()'));
  assert.equal(q2.used, 2);
  assert.equal(q2.attempts, 8);
  assert.equal((await begin('guest')).reason, 'attempt_limit');
  globalThis.firstIds = ids;
});

test('정리는 서버(service_role)만, 경로 모양은 DB가 막는다', async () => {
  const [a] = globalThis.firstIds;
  await fails('guest', `select public.avatar_settle($1, 'ready', null, $2, null)`, [a, `${U.guest}/chars/${a}.png`], /permission denied/);
  await fails('service', `select public.avatar_settle($1, 'ready', null, $2, null)`, [a, `${U.guest2}/chars/${a}.png`], /avatars_image_path_shape/);
  await fails('service', `select public.avatar_settle($1, 'ready', null, null, null)`, [a], /avatars_ready_has_image/);
});

test('처음 그림은 바로 내 캐릭터, 두 번째는 그대로 둔다', async () => {
  const [a, b] = globalThis.firstIds;
  assert.equal(await settleReady('guest', a), true);
  assert.equal(await settleReady('guest', b), true);
  const active = await as('guest', (tx) => val(tx, 'select avatar_id from public.profiles where user_id = auth.uid()'));
  assert.equal(active, a);
  assert.equal(await as('guest', (tx) => val(tx, 'select public.avatar_choose($1)', [b])), true);
  assert.equal(await as('guest', (tx) => val(tx, 'select avatar_id from public.profiles where user_id = auth.uid()')), b);
});

test('다른 손님은 그림 경로만, 원본은 못 본다. 명단 밖은 아무것도', async () => {
  const [, b] = globalThis.firstIds;
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_image_path($1)', [U.guest])), `${U.guest}/chars/${b}.png`);
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_char_path($1)', [b])), `${U.guest}/chars/${b}.png`);
  assert.equal(await as('visitor', (tx) => val(tx, 'select public.avatar_image_path($1)', [U.guest])), null);
  assert.equal(await as('visitor', (tx) => val(tx, 'select public.avatar_char_path($1)', [b])), null);
  assert.equal(await as('guest2', (tx) => val(tx, 'select count(*)::int from public.avatars')), 0, '남의 줄은 직접 못 읽는다');
  const seen2 = await as('guest2', (tx) => tx.query(`select name from storage.objects where bucket_id = 'avatars' order by name`));
  assert.deepEqual(seen2.rows.map((r) => r.name.split('/')[1]), ['chars', 'chars'], '다른 손님은 그림만');
  const seenV = await as('visitor', (tx) => tx.query(`select name from storage.objects where bucket_id = 'avatars'`));
  assert.equal(seenV.rows.length, 0);
  const seenMe = await as('guest', (tx) => tx.query(`select name from storage.objects where bucket_id = 'avatars'`));
  assert.equal(seenMe.rows.length, 4, '나는 원본과 그림 모두');
  await fails('guest2', `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${U.guest2}/chars/x.png`], /row-level security/);
  const del = await as('guest2', (tx) => tx.query(`delete from storage.objects where name like $1 returning name`, [`${U.guest}/%`]));
  assert.equal(del.rows.length, 0, '남의 파일은 못 지운다');
});

test('남의 그림을 내 캐릭터로 걸 수 없다', async () => {
  const [a] = globalThis.firstIds;
  await fails('guest2', `insert into public.profiles (user_id, avatar_id) values (auth.uid(), $1)`, [a], /avatar_not_yours/);
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_choose($1)', [a])), false);
  // 이름표 저장(아바타 열 없이)은 그대로 된다
  await as('guest2', (tx) => tx.query(`insert into public.profiles (user_id, nickname) values (auth.uid(), '둘')`));
  await fails('guest2', `update public.profiles set avatar_id = $1 where user_id = auth.uid()`, [a], /avatar_not_yours/);
});

test('그림을 지우면 deleted, 캐릭터에서 빠지고, 오늘 장수에는 남는다', async () => {
  const [, b] = globalThis.firstIds;
  assert.equal(await as('guest', (tx) => val(tx, `select public.avatar_forget($1, 'character')`, [b])), true);
  const row = (await db.query('select status, image_path, original_path from public.avatars where id = $1', [b])).rows[0];
  assert.equal(row.status, 'deleted');
  assert.equal(row.image_path, null);
  assert.ok(row.original_path, '원본은 따로 지울 때까지 남는다');
  assert.equal(await as('guest', (tx) => val(tx, 'select avatar_id from public.profiles where user_id = auth.uid()')), null);
  assert.equal(await as('guest', (tx) => val(tx, `select public.avatar_forget($1, 'original')`, [b])), true);
  assert.equal((await db.query('select original_path from public.avatars where id = $1', [b])).rows[0].original_path, null);
  assert.equal((await as('guest', (tx) => val(tx, 'select public.avatar_quota()'))).used, 2);
  assert.equal(await as('guest2', (tx) => val(tx, `select public.avatar_forget($1, 'both')`, [b])), false, '남의 것은 못 지운다');
  assert.equal(await as('guest2', (tx) => val(tx, 'select public.avatar_char_path($1)', [b])), null);
});

test('모두의 하루 상한', async () => {
  const total = (await as('guest3', (tx) => val(tx, 'select public.avatar_quota()'))).total;
  assert.ok(total >= 2);
  assert.equal((await begin('guest3', total)).reason, 'total_limit');
  assert.equal((await begin('guest3', total + 1)).ok, true);
});

test('KST 하루 경계: 어제 만든 것은 세지 않는다', async () => {
  await db.query(`update public.avatars set created_at = public.avatar_day_start() - interval '1 second' where user_id = $1`, [U.guest]);
  const q = await as('guest', (tx) => val(tx, 'select public.avatar_quota()'));
  assert.equal(q.used, 0);
  assert.equal(q.attempts, 0);
  const start = await val(db, `select to_char(public.avatar_day_start() at time zone 'Asia/Seoul', 'HH24:MI:SS')`);
  assert.equal(start, '00:00:00');
});

// ───────── 대기열: 운영 서버는 줄만 세우고, 일꾼(비밀 키)이 잡아 그린다
const fresh = (who) => db.query('delete from public.avatars where user_id = $1', [U[who]]);
async function queued(who) {
  const r = await begin(who);
  assert.equal(r.ok, true, JSON.stringify(r));
  const ok = await as('service', (tx) => val(tx, 'select public.avatar_enqueue($1, $2)', [r.id, `${U[who]}/originals/${r.id}.jpg`]));
  assert.equal(ok, true);
  return r.id;
}
const claim = (worker = 'studio-1', lease = 600) =>
  as('service', (tx) => val(tx, 'select public.avatar_claim($1, $2)', [worker, lease]));
const job = (who, id) => as(who, (tx) => val(tx, 'select public.avatar_job_status($1)', [id]));

test('줄 세우기 → 잡기 → ready, 상태는 본인만 본다', async () => {
  await fresh('guest2');
  const id = await queued('guest2');
  const s0 = await job('guest2', id);
  assert.equal(s0.status, 'queued');
  assert.equal(s0.ahead, 0);
  assert.equal(await job('guest3', id), null);
  const c = await claim();
  assert.deepEqual([c.id, c.attempts, c.give_up, c.original_path], [id, 1, false, `${U.guest2}/originals/${id}.jpg`]);
  assert.equal(await claim(), null);
  assert.equal((await job('guest2', id)).status, 'drawing');
  assert.ok((await job('guest2', id)).worker_seen_at);
  const ok = await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'ready', null, $2, 'gpt-image-2.6-flare')`,
    [id, `${U.guest2}/chars/${id}.png`]));
  assert.equal(ok, true);
  const row = (await db.query('select status, original_path from public.avatars where id = $1', [id])).rows[0];
  assert.deepEqual([row.status, row.original_path], ['ready', `${U.guest2}/originals/${id}.jpg`]);
});

test('손님은 잡기·줄 세우기·살아 있음을 부르지 못한다, 원본 없이 줄에 못 선다', async () => {
  await fails('guest2', `select public.avatar_claim('x', 600)`, [], /permission denied/);
  await fails('guest2', `select public.avatar_enqueue(gen_random_uuid(), 'x')`, [], /permission denied/);
  await fails('guest2', `select public.avatar_worker_beat('x', null)`, [], /permission denied/);
  await fails('guest2', `select * from public.avatar_workers`, [], /permission denied/);
  const r = await begin('guest2');
  await fails('service', `select public.avatar_enqueue($1, null)`, [r.id], /avatars_queued_has_original/);
  await fails('service', `select public.avatar_enqueue($1, $2)`, [r.id, `${U.guest3}/originals/${r.id}.jpg`],
    /avatars_original_path_shape/);
});

test('잡는 순서와 되돌리기: 다른 일꾼은 못 돌리고, 기다릴 때는 안 잡힌다', async () => {
  await fresh('guest2');
  const a = await queued('guest2');
  const b = await queued('guest2');
  const c1 = await claim('w1');
  const c2 = await claim('w2');
  assert.deepEqual([c1.id, c2.id], [a, b]);
  assert.equal(await as('service', (tx) => val(tx, 'select public.avatar_release($1, $2, 0)', [a, 'w2'])), false);
  assert.equal(await as('service', (tx) => val(tx, 'select public.avatar_release($1, $2, 300)', [a, 'w1'])), true);
  assert.equal(await claim('w1'), null);
  await db.query(`update public.avatars set not_before = now() - interval '1 second' where id = $1`, [a]);
  assert.equal((await claim('w1')).attempts, 2);
});

test('일꾼이 멈추면 임대가 끝난 뒤 다시 줄에, 세 번째면 정리하라고 돌려준다', async () => {
  await fresh('guest2');
  const id = await queued('guest2');
  const stale = () => db.query(`update public.avatars set claimed_at = now() - interval '2 hours' where id = $1`, [id]);
  for (const n of [1, 2, 3]) {
    assert.equal((await claim('w1', 600)).attempts, n);
    await stale();
  }
  const g = await claim('w2', 600);
  assert.deepEqual([g.id, g.attempts, g.give_up], [id, 3, true]);
  assert.equal(await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'failed', null, null, null, 'timeout')`, [id])), true);
  const s = await job('guest2', id);
  assert.deepEqual([s.status, s.reason], ['failed', 'timeout']);
  const q = await as('guest2', (tx) => val(tx, 'select public.avatar_quota()'));
  assert.equal(q.used, 0);
});

test('원본을 못 올리고 30분 넘은 줄은 실패로', async () => {
  await fresh('guest2');
  const r = await begin('guest2');
  await db.query(`update public.avatars set created_at = now() - interval '31 minutes' where id = $1`, [r.id]);
  assert.equal(await claim(), null);
  const s = await job('guest2', r.id);
  assert.deepEqual([s.status, s.reason], ['failed', 'stale_upload']);
});

test('그리는 중에 지우면 작업을 거두고, 일꾼의 정리는 false', async () => {
  await fresh('guest2');
  const id = await queued('guest2');
  const c = await claim('w1');
  assert.equal(c.id, id);
  assert.equal(await as('guest2', (tx) => val(tx, `select public.avatar_forget($1, 'character')`, [id])), true);
  const row = (await db.query('select status, original_path, deleted_at from public.avatars where id = $1', [id])).rows[0];
  assert.deepEqual([row.status, row.original_path], ['deleted', null]);
  assert.ok(row.deleted_at);
  assert.equal(await as('service', (tx) => val(tx, `select public.avatar_settle($1, 'ready', null, $2, 'm')`,
    [id, `${U.guest2}/chars/${id}.png`])), false);
  assert.equal(await claim('w1'), null);
});
