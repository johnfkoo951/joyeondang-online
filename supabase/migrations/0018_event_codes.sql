-- 조연당 온라인 0018: 행사 초대 코드(2026-11-11)
--
-- 무엇을·왜
--   발표 같은 자리에서 청중이 한꺼번에 들어온다. 사람마다 초대 링크(0001 invites: 링크 하나 = 명단 한 줄)를 만들어 보낼 수
--   없으니, 행사 하나에 코드 하나를 만들어 화면에 QR로 띄운다. 그 코드로 들어온 사람(구글로 로그인했지만 명단에 없는 사람)을
--   명단 손님으로 넣고 그 계정에 잇는다. 주소는 사람별 초대와 같은 /join?c=<코드>다.
--
-- 원칙
--   1. 코드 원문은 DB에 남기지 않는다(초대 링크와 같은 hash_code). 원문은 만든 화면에만 한 번 보인다.
--   2. 코드마다 이름표, 끝나는 때, 최대 인원, 쓴 수, 거둔 때. 끝났거나 거뒀거나 다 찼으면 새 사람을 받지 않는다.
--      이미 들어온 사람은 코드가 어떤 상태든 그대로 성공한다(새 휴대폰에서 다시 찍어도). 쓴 수는 새로 넣은 사람만 센다.
--   3. 넣는 명단 줄: 역할은 늘 guest. 이름은 구글 계정 이름(없으면 이메일 @ 앞부분, 그것도 없으면 '손님'). 이메일은
--      다른 줄에 없을 때만 적는다(claim_invite와 같다). 어느 코드로 들어왔는지 roster.event_code_id에 남긴다.
--      명단에서 뺀 계정(이어진 줄의 revoked_at)은 행사 코드로 다시 들이지 않는다: 공개된 코드가 집주인의 결정을 되돌리지 않게.
--   4. 같은 코드의 넣기는 코드 줄 잠금(for update)으로 한 줄로 선다. 100명이 한꺼번에 찍어도 최대 인원을 넘지 않는다.
--      잠금을 기다리는 사이 같은 사람이 다른 탭으로 먼저 들어왔으면 잠금 뒤에 다시 보고 그대로 성공한다.
--   5. 사람별 초대가 먼저다. 사이트는 claim_invite가 invalid일 때만 claim_event_code를 부른다. 같은 원문이 두 쪽에 함께
--      있으면 어느 쪽인지 갈리지 않으므로, 행사 코드를 만들 때 초대 링크의 해시와 견준다(code_taken).
--   6. 거두기: 코드만(들어온 사람은 그대로 손님) 또는 그 코드로 들어온 명단 줄까지(손님 줄만. 다음 요청부터 visitor).
--   7. 0001의 표·정책·함수는 고치지 않는다. roster에 칸 하나(event_code_id)만 더한다.
--   8. 사이트 코드는 이 파일을 올리기 전에도 돈다: claim_event_code가 없으면 지금처럼 「쓸 수 없는 초대 코드」로 끝나고,
--      관리 화면의 행사 초대 코드 칸은 「아직 쓸 수 없어요」를 보인다.
--
-- 여러 번 올려도 된다(… if not exists, create or replace, drop policy if exists). 0001 뒤면 어디에 올려도 되고
-- (없으면 맨 앞에서 멈춘다), 0014~0017·0019와 서로 기대지 않는다.
-- 올린 뒤 확인:
--   select count(*) from pg_catalog.pg_attribute
--    where attrelid = 'public.roster'::regclass and attname = 'event_code_id' and not attisdropped;          → 1
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and proname in ('claim_event_code', 'admin_create_event_code', 'admin_revoke_event_code',
--                      'admin_event_codes', 'event_code_peek', 'event_join_name', 'event_tidy') order by 1;   → 일곱 줄
--   select has_function_privilege('anon', 'public.claim_event_code(text)', 'execute'),
--          has_function_privilege('authenticated', 'public.claim_event_code(text)', 'execute'),
--          has_function_privilege('anon', 'public.event_code_peek(text)', 'execute');                         → f, t, t
--   select label, used, max_uses, expires_at, revoked_at from public.event_codes order by created_at desc;    → 만든 코드들
--
-- 되돌리는 법(한 트랜잭션으로: begin; … commit;)
--   drop function if exists public.claim_event_code(text), public.admin_create_event_code(text, text, int, int),
--     public.admin_revoke_event_code(uuid, boolean), public.admin_event_codes(int), public.event_code_peek(text),
--     public.event_join_name(text, text, text), public.event_tidy(text);
--   drop index if exists public.roster_event_code;
--   alter table public.roster drop column if exists event_code_id;
--   drop table if exists public.event_codes;
--   (행사 코드로 들어온 명단 줄은 남는다. 그 사람들도 빼려면 칸을 지우기 전에
--    update public.roster set revoked_at = now() where event_code_id is not null and revoked_at is null and role = 'guest';)

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.roster') is null or to_regclass('public.invites') is null
     or to_regclass('public.entry_requests') is null
     or to_regprocedure('public.hash_code(text)') is null or to_regprocedure('public.my_role()') is null
     or to_regprocedure('public.role_rank(text)') is null or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.jwt_email()') is null or to_regprocedure('public.jwt_is_google()') is null then
    raise exception '0018_needs_0001';
  end if;
end $$;

-- ───────────────────────────── 행사 코드
create table if not exists public.event_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  expires_at timestamptz not null,
  max_uses int not null check (max_uses between 1 and 500),
  used int not null default 0 check (used >= 0),
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_codes_window check (expires_at > created_at),
  constraint event_codes_used_max check (used <= max_uses)
);
alter table public.event_codes enable row level security;
-- 목록은 집주인만 본다. 만들기·거두기·넣기는 아래 함수로만(insert/update/delete 정책 없음).
drop policy if exists event_codes_admin_select on public.event_codes;
create policy event_codes_admin_select on public.event_codes for select to authenticated using ((select public.is_admin()));

-- 명단 줄이 어느 행사 코드로 들어왔는가(사람별 초대·이메일·입장 요청으로 들어온 줄은 비어 있다)
alter table public.roster add column if not exists event_code_id uuid references public.event_codes (id) on delete set null;
create index if not exists roster_event_code on public.roster (event_code_id) where event_code_id is not null;

-- 남이 보게 될 한 줄(명단 이름, 코드 이름표) 다듬기: 빈칸·제어 글자와 남을 속이는 데 쓰이는 보이지 않는 글자(폭 없는 빈칸,
-- 글자 방향 표시·바꾸기, 단어 이음, BOM)를 빈칸 하나로 바꾸고 앞뒤를 자른 뒤 40자까지(명단 이름 칸의 규칙). 비면 ''.
-- 글자를 잇는 표시(U+200C·U+200D, 이모지와 여러 문자가 쓴다)는 그대로 둔다.
-- [[:space:]]가 ASCII 밖의 빈칸(줄 바꿈 없는 빈칸, 전각 빈칸 등)을 잡는지는 DB의 로캘마다 달라서 그 글자들을 직접 적는다.
create or replace function public.event_tidy(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(left(btrim(regexp_replace(coalesce(p, ''),
           '[[:space:][:cntrl:]\u007F-   -​‎‏ -  -⁤⁦-⁯　﻿]+',
           ' ', 'g')), 40))
$$;

-- 명단에 적을 이름: 구글 계정 이름(full_name, 없으면 name) → 이메일 @ 앞부분 → '손님'
create or replace function public.event_join_name(p_full text, p_name text, p_email text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(public.event_tidy(p_full), ''), nullif(public.event_tidy(p_name), ''),
                  nullif(public.event_tidy(split_part(coalesce(p_email, ''), '@', 1)), ''), '손님')
$$;

-- 행사 코드로 들어오기. 로그인한 사람이 부른다(사이트는 사람별 초대 claim_invite가 invalid일 때만 부른다).
-- 결과: 역할 이름(guest | family | admin. 새로 넣었거나 이미 들어와 있음) 또는
--       login_required(로그인 안 함·구글 아님) | invalid(없는 코드) | ended(끝났거나 거둠) | full(다 참) | blocked(명단에서 뺀 계정·이메일)
create or replace function public.claim_event_code(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ev public.event_codes;
  v_email text := public.jwt_email();
  v_meta jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  v_keep_email text;
  v_id uuid;
begin
  if v_uid is null then return 'login_required'; end if;
  -- 이미 들어온 사람(이어진 명단 줄, 또는 구글 이메일이 명단과 같은 사람): 코드와 상관없이 그대로, 쓴 수도 그대로
  v_role := public.my_role();
  if public.role_rank(v_role) >= 1 then return v_role; end if;
  if not public.jwt_is_google() then return 'login_required'; end if;
  -- 명단에서 뺀 계정은 공개된 코드로 다시 들이지 않는다(이어진 줄이 남아 있는데 역할이 visitor면 뺀 줄이다)
  if exists (select 1 from public.roster where claimed_by = v_uid) then return 'blocked'; end if;
  -- 집주인이 이메일로 넣었다가 (로그인하기 전에) 뺀 사람도 같다. 다른 계정으로 오는 것까지는 막을 수 없다
  if v_email is not null and exists (select 1 from public.roster where email = v_email and revoked_at is not null) then
    return 'blocked';
  end if;

  select * into v_ev from public.event_codes where code_hash = public.hash_code(p_code) for update;
  if not found then return 'invalid'; end if;
  if v_ev.revoked_at is not null or v_ev.expires_at <= now() then return 'ended'; end if;
  -- 잠금을 기다리는 사이 같은 사람이 다른 탭·다른 코드로 먼저 들어왔을 수 있다
  if exists (select 1 from public.roster where claimed_by = v_uid) then
    v_role := public.my_role();
    return case when public.role_rank(v_role) >= 1 then v_role else 'blocked' end;
  end if;
  if v_ev.used >= v_ev.max_uses then return 'full'; end if;

  v_keep_email := case when v_email is not null
                        and not exists (select 1 from public.roster where email = v_email) then v_email end;
  begin
    insert into public.roster (display_name, role, email, claimed_by, claimed_at, event_code_id)
    values (public.event_join_name(v_meta ->> 'full_name', v_meta ->> 'name', v_email), 'guest',
            v_keep_email, v_uid, now(), v_ev.id)
    returning id into v_id;
  exception when unique_violation then
    -- 같은 순간 이 계정이 다른 코드로 이어졌다(claimed_by는 하나뿐): 그쪽 결과를 따른다
    if exists (select 1 from public.roster where claimed_by = v_uid) then
      v_role := public.my_role();
      return case when public.role_rank(v_role) >= 1 then v_role else 'blocked' end;
    end if;
    -- 같은 순간 같은 이메일이 다른 줄에 들어갔다: 이메일 없이 넣는다
    insert into public.roster (display_name, role, email, claimed_by, claimed_at, event_code_id)
    values (public.event_join_name(v_meta ->> 'full_name', v_meta ->> 'name', v_email), 'guest',
            null, v_uid, now(), v_ev.id)
    returning id into v_id;
  end;
  update public.event_codes set used = used + 1 where id = v_ev.id;
  -- 들어오기 전에 남긴 입장 요청은 이 줄로 승인된 것으로 닫는다(집주인 승인함에 남지 않게)
  update public.entry_requests set status = 'approved', roster_id = v_id, resolved_at = now()
   where user_id = v_uid and status = 'pending';
  return 'guest';
end $$;

-- 집주인: 행사 코드 만들기. 코드 원문은 서버(TypeScript makeCode)가 만들어 넘기고, 해시만 남는다.
-- p_hours: 지금부터 몇 시간 동안(1~168), p_max: 최대 인원(1~500). 범위 밖은 끝값으로 맞춘다.
create or replace function public.admin_create_event_code(
  p_code text, p_label text, p_hours int default 4, p_max int default 120
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := public.hash_code(p_code);
  v_label text;
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if char_length(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) < 10 then
    raise exception 'code_too_short' using errcode = '22023';
  end if;
  if exists (select 1 from public.invites where code_hash = v_hash)
     or exists (select 1 from public.event_codes where code_hash = v_hash) then
    raise exception 'code_taken' using errcode = '22023';
  end if;
  v_label := public.event_tidy(p_label);
  insert into public.event_codes (code_hash, label, expires_at, max_uses, created_by)
  values (v_hash, coalesce(nullif(v_label, ''), '행사'),
          now() + make_interval(hours => least(greatest(coalesce(p_hours, 4), 1), 168)),
          least(greatest(coalesce(p_max, 120), 1), 500), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- 집주인: 거두기. p_people이면 그 코드로 들어온 명단 줄(손님 줄만)도 거둔다. 이미 거둔 코드에도 사람만 더 거둘 수 있다.
-- 결과: {found, people(이번에 거둔 명단 줄 수)}
create or replace function public.admin_revoke_event_code(p_id uuid, p_people boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_people int := 0;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.event_codes set revoked_at = coalesce(revoked_at, now()) where id = p_id;
  if not found then return jsonb_build_object('found', false, 'people', 0); end if;
  if coalesce(p_people, false) then
    update public.roster set revoked_at = now()
     where event_code_id = p_id and revoked_at is null and role = 'guest';
    get diagnostics v_people = row_count;
  end if;
  return jsonb_build_object('found', true, 'people', v_people);
end $$;

-- 집주인: 목록(새것부터). active = 그 코드로 들어와 지금 손님으로 남아 있는 사람 수
-- (가족·집주인으로 올린 줄은 「사람까지 거두기」가 빼지 않으므로 세지 않는다. 단추의 수와 실제로 빠지는 수가 같게)
create or replace function public.admin_event_codes(p_limit int default 50)
returns table (id uuid, label text, expires_at timestamptz, max_uses int, used int, revoked_at timestamptz,
               created_at timestamptz, active int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  return query
    select e.id, e.label, e.expires_at, e.max_uses, e.used, e.revoked_at, e.created_at,
           (select count(*)::int from public.roster r where r.event_code_id = e.id and r.revoked_at is null and r.role = 'guest')
      from public.event_codes e
     order by e.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 누구나: 이 원문이 행사 코드면 이름표와 상태(open | ended | full), 아니면 null.
-- 들어오는 화면이 로그인 전에 「무슨 자리의 초대인지」와 「끝났는지·다 찼는지」를 알려 준다(로그인하고 나서야 알지 않게).
-- 사람별 초대 링크에 대해서는 아무것도 알려 주지 않는다. 코드는 12자(30글자 알파벳)라 맞혀 볼 수 없다.
create or replace function public.event_code_peek(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'label', e.label,
    'state', case when e.revoked_at is not null or e.expires_at <= now() then 'ended'
                  when e.used >= e.max_uses then 'full'
                  else 'open' end)
  from public.event_codes e
  where e.code_hash = public.hash_code(p_code)
$$;

-- ───────────────────────────── 권한 정리
revoke all on public.event_codes from anon;
revoke insert, update, delete on public.event_codes from authenticated;

revoke execute on function public.event_tidy(text), public.event_join_name(text, text, text), public.claim_event_code(text),
  public.admin_create_event_code(text, text, int, int), public.admin_revoke_event_code(uuid, boolean),
  public.admin_event_codes(int), public.event_code_peek(text)
  from public, anon, authenticated;

grant execute on function public.event_code_peek(text) to anon, authenticated;
grant execute on function public.claim_event_code(text), public.admin_create_event_code(text, text, int, int),
  public.admin_revoke_event_code(uuid, boolean), public.admin_event_codes(int)
  to authenticated;
