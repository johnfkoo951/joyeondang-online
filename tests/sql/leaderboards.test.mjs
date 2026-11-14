// 0026_game_leaderboards.sql 권한·순위표 검증(PGlite).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const M0001 = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
const M0002 = readFileSync(new URL('../../supabase/migrations/0002_rooms_play.sql', import.meta.url), 'utf8');
const M0008 = readFileSync(new URL('../../supabase/migrations/0008_rooms_more.sql', import.meta.url), 'utf8');
const M0026 = readFileSync(new URL('../../supabase/migrations/0026_game_leaderboards.sql', import.meta.url), 'utf8');

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
  guest1: '00000000-0000-4000-8000-000000000101',
  guest2: '00000000-0000-4000-8000-000000000102',
  stranger: '00000000-0000-4000-8000-000000000109',
};

let db;

const claimsOf = (sub, email) => ({
  sub,
  email,
  role: 'authenticated',
  app_metadata: { provider: 'google', providers: ['google'] },
});

async function asRole(who, fn) {
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

before(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(M0001);
  await db.exec(M0002);
  await db.exec(M0008);
  await db.exec(M0026);

  for (const k of Object.keys(U)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [U[k], `${k}@example.com`]);
  }
  await db.query(`insert into public.roster (display_name, email, role) values ('첫손님', 'guest1@example.com', 'guest'), ('둘째손님', 'guest2@example.com', 'family')`);
});

test('명단 밖 사용자와 비로그인은 점수를 등록할 수 없다', async () => {
  await assert.rejects(
    asRole('anon', (tx) => tx.query(`select public.submit_game_score('groove', 'gable', '익명', 500, 30000, '{}'::jsonb)`)),
    /permission denied|not_allowed/,
  );
  await assert.rejects(
    asRole('stranger', (tx) => tx.query(`select public.submit_game_score('groove', 'gable', '외부인', 500, 30000, '{}'::jsonb)`)),
    /not_allowed/,
  );
});

test('명단 손님은 최고 점수를 갱신하고, 공개 순위표는 user_id 없이 순위를 돌려준다', async () => {
  const r1 = await asRole('guest1', (tx) =>
    tx.query(`select public.submit_game_score('groove', 'gable', '재즈러버', 1200, 48000, '{"stage":4}'::jsonb) as res`),
  );
  assert.equal(r1.rows[0].res.improved, true);
  assert.equal(r1.rows[0].res.bestScore, 1200);

  // 더 낮은 점수는 최고 기록을 덮어쓰지 않는다
  const rLow = await asRole('guest1', (tx) =>
    tx.query(`select public.submit_game_score('groove', 'gable', '재즈러버', 850, 40000, '{}'::jsonb) as res`),
  );
  assert.equal(rLow.rows[0].res.improved, false);
  assert.equal(rLow.rows[0].res.bestScore, 1200);

  // 둘째 손님이 더 높은 점수를 기록하면 1위가 된다
  const r2 = await asRole('guest2', (tx) =>
    tx.query(`select public.submit_game_score('groove', 'gable', '스윙마스터', 1540, 44000, '{}'::jsonb) as res`),
  );
  assert.equal(r2.rows[0].res.rank, 1);

  // 비로그인(anon)은 원본 테이블 직접 조회는 0건(차단)이고, list_game_leaderboard 함수로만 순위표를 읽는다
  await assert.rejects(
    asRole('anon', (tx) => tx.query(`select * from public.game_scores`)),
    /permission denied/,
  );

  const pub = await asRole('anon', (tx) => tx.query(`select * from public.list_game_leaderboard('groove', 10)`));
  assert.equal(pub.rows.length, 2);
  assert.equal(pub.rows[0].display_name, '스윙마스터');
  assert.equal(pub.rows[0].rank, 1);
  assert.equal(pub.rows[1].display_name, '재즈러버');
  assert.equal(pub.rows[1].rank, 2);
  assert.equal('user_id' in pub.rows[0], false);
});
