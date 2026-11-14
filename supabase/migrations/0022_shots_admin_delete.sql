-- 조연당 온라인 0022: 걷기 사진을 집주인이 지우기(2026-11-12)
--
-- 무엇을·왜
--   집주인 요청: 걷다가 찍어 간 사진(0004 걷기 사진. 실제 집 화면이 담긴다)을 집주인이 지울 수 있게.
--   사람마다 지우고(손님, 가족, 집주인, 명단 밖 계정 모두), 행사가 끝나면 그 행사 초대 코드로 들어온 손님의 사진을 한꺼번에 지운다.
--   1. 집주인은 사진을 보지 않는다. 사람마다 장수(admin_shot_counts, 많은 순 500줄까지), 행사마다 합계(admin_shot_events),
--      모두 합친 수와 저장소 정리가 남은 수(admin_shot_totals)만 받는다. 합계는 DB가 따로 세어 500줄에서 잘리지 않는다.
--      표(shots)와 저장소의 읽기 정책은 0004 그대로 본인만이고, 이 파일은 읽기 정책을 더하지 않는다.
--      경로·장소·찍은 때는 집주인에게도 내보내지 않는다.
--   2. 지우기는 두 함수로만 한다. 사람마다(admin_shots_forget_user), 행사 초대 코드마다(admin_shots_forget_event).
--      관리자(is_admin)만 부른다. 가족·손님·명단 밖 계정이 부르면 admin_only로 막는다.
--      행사마다는 그 코드로 들어온 명단 줄(roster.event_code_id, 0018) 가운데 손님 줄(role guest)에 이어진 계정의 사진이다.
--      명단에서 뺀 줄(revoked_at)도 그 행사로 들어온 손님이라 함께 지운다. 가족·집주인으로 올린 줄은 건드리지 않는다
--      (0018의 「들어온 사람까지 거두기」와 같은 범위).
--   3. 표 줄과 파일을 함께 지운다. 함수가 표 줄을 지우면서 같은 트랜잭션에서
--        (가) 그 경로를 버릴 목록(shots_trash)에 올리고,
--        (나) 그 사람 폴더(<계정 id>/)를 훑을 차례(shots_sweep)에 올린다. 행사마다는 그 행사 손님 줄의 계정 모두다
--            (사진 줄이 없는 사람, 명단에서 뺀 줄 포함).
--      서버는 비밀 키로 이어서 한다:
--        버릴 목록 비우기   shots_trash_list → 저장소에서 지우기 → shots_trash_done
--        폴더 훑기          shots_sweep_list → 저장소에서 그 폴더를 나열 → shots_sweep_done(표 줄이 없는 파일을 버릴 목록에)
--      표 줄 없이 저장소에만 남은 파일(올린 뒤 표에 적기 전에 끊긴 것)도 폴더 훑기로 찾아 지운다. 막 올라온 파일(10분 안)은
--      지금 올리는 중일 수 있어 건드리지 않고, 그중 표 줄이 없는 것이 있으면 그 폴더를 10분 뒤에 다시 훑는다.
--      서버가 중간에 끊겨도 목록과 차례는 남아, 다음 차례(관리 화면을 열 때, 다음 지우기, 「지금 마저 지우기」)에 이어서 한다.
--      버릴 목록과 훑을 차례에는 정책이 없고 비밀 키(service_role)만 함수로 읽고 쓴다. 집주인도 경로를 읽지 못한다.
--   4. 다른 길로 표 줄이 사라져도 파일을 남기지 않는다(트리거 shots_to_trash, 0012 쪽지 사진의 media_to_trash와 같은 방식).
--      계정을 지워 줄이 cascade로 사라질 때, SQL 편집기에서 줄을 지울 때 등은 그 경로를 버릴 목록에 올리고, 계정이 사라졌으면
--      그 사람 폴더도 훑을 차례에 올린다(표 줄 없이 남은 파일까지). 본인이 갤러리에서 지우는 길(0004 정책: 파일을 먼저 지우고
--      표 줄을 뺀다)은 이미 파일이 없으므로 목록에 올리지 않는다. 계정이 사라진 줄은 본인 세션에서 지웠어도 올린다.
--   5. 비밀 키로 지우는 것은 사이트가 만드는 모양의 경로(<그 사람 id>/<글자·숫자·-·_>.jpg)뿐이다(shots_path_ok).
--      다른 모양의 줄(손으로 넣은 줄)은 표에서 지우기만 하고 목록에는 올리지 않는다. 폴더 훑기도 그 사람 폴더 바로 아래의 이
--      모양만 올린다(하위 폴더나 다른 확장자는 남긴다): 비밀 키는 저장소 정책을 거치지 않으므로, 남의 폴더를 가리키는 경로로
--      남의 파일을 지우게 하지 못하게. 사이트(src/lib/shots-admin-rules.ts의 SHOT_PATH)도 같은 모양만 지운다.
--
-- 0001·0004·0018의 표·정책·함수는 고치지 않는다(0004 표에 지우기 트리거 하나만 더한다). 0019~0021과 서로 기대지 않는다.
-- 사이트 코드는 이 파일을 올리기 전에도 돈다: 관리 화면의 「걷기 사진 지우기」 칸이 「아직 쓸 수 없어요」를 보이고,
-- 손님의 갤러리(여러 장 골라 지우기 포함)는 0004만으로 돈다. 서버 비밀 키(SUPABASE_SECRET_KEY)가 없거나 그 키로 저장소에
-- 닿지 않으면 집주인 지우기는 장수만 보이고 단추가 꺼진다(표 줄만 지우고 파일을 남기지 않게).
-- 여러 번 올려도 된다(… if not exists, create or replace, drop trigger if exists). 0004와 0018 뒤에 올린다
-- (없으면 맨 앞에서 멈추고 아무것도 바꾸지 않는다).
-- 올린 뒤 확인(모두 읽기만 한다):
--   select to_regclass('public.shots_trash') is not null, to_regclass('public.shots_sweep') is not null;     → t, t
--   select count(*) from pg_trigger where tgname = 'shots_to_trash' and not tgisinternal;                    → 1
--   select has_function_privilege('authenticated', 'public.admin_shot_counts()', 'execute'),
--          has_function_privilege('authenticated', 'public.admin_shot_events()', 'execute'),
--          has_function_privilege('authenticated', 'public.admin_shot_totals()', 'execute'),
--          has_function_privilege('authenticated', 'public.admin_shots_forget_user(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.admin_shots_forget_event(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.shots_trash_list(int)', 'execute'),
--          has_function_privilege('authenticated', 'public.shots_sweep_list(int)', 'execute'),
--          has_function_privilege('service_role', 'public.shots_trash_list(int)', 'execute'),
--          has_function_privilege('service_role', 'public.shots_trash_done(text[])', 'execute'),
--          has_function_privilege('service_role', 'public.shots_sweep_list(int)', 'execute'),
--          has_function_privilege('service_role', 'public.shots_sweep_done(uuid, text[], text[], boolean)', 'execute');
--                                                                                  → t, t, t, t, t, f, f, t, t, t, t
--   select count(*) from public.shots_trash;  select count(*) from public.shots_sweep;
--     → 보통 0. 남아 있으면 서버가 아직 저장소에서 지우지 못한 파일, 아직 훑지 못한 폴더다(관리 화면을 열면 이어서 한다).
--
-- 되돌리는 법(한 트랜잭션으로: begin; … commit;)
--   먼저 버릴 목록과 훑을 차례를 비운다(관리 화면을 열거나 「지금 마저 지우기」). 남은 채로 지우면 그 파일들은 저장소에 그대로 남는다.
--   drop trigger if exists shots_to_trash on public.shots;
--   drop function if exists public.shots_to_trash(), public.admin_shot_counts(), public.admin_shot_events(),
--     public.admin_shot_totals(), public.admin_shots_forget_user(uuid), public.admin_shots_forget_event(uuid),
--     public.shots_trash_list(int), public.shots_trash_done(text[]), public.shots_sweep_list(int),
--     public.shots_sweep_done(uuid, text[], text[], boolean), public.shots_sweep_add(uuid[]), public.shots_path_ok(uuid, text);
--   drop table if exists public.shots_trash, public.shots_sweep;
--   (이미 지운 사진은 돌아오지 않는다. 0004의 표·정책·버킷은 그대로다.)

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.shots') is null or to_regclass('public.roster') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception '0022_needs_0001_0004';
  end if;
  if to_regclass('public.event_codes') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = to_regclass('public.roster') and attname = 'event_code_id' and not attisdropped) then
    raise exception '0022_needs_0018';
  end if;
end $$;

-- ───────────────────────────── 버릴 목록과 훑을 차례(정책 없음: 아래 정의자 함수만 읽고 쓴다)
create table if not exists public.shots_trash (
  path text primary key check (char_length(path) between 10 and 200),
  at timestamptz not null default now()
);
alter table public.shots_trash enable row level security;

-- 훑을 폴더: 서버가 저장소에서 나열해 표 줄 없는 파일을 찾을 사람 폴더(<user_id>/).
-- 계정을 지운 뒤에도 폴더는 남으므로 auth.users를 참조하지 않는다. not_before: 이때부터 훑는다(막 올라온 파일을 기다릴 때 미룬다)
create table if not exists public.shots_sweep (
  user_id uuid primary key,
  at timestamptz not null default now(),
  not_before timestamptz not null default now()
);
alter table public.shots_sweep enable row level security;

-- 버릴 목록에 올려도 되는 경로인가: 그 사람의 폴더 바로 아래, 사이트가 만드는 이름 모양(src/lib/shots.ts uploadShot)
create or replace function public.shots_path_ok(p_user uuid, p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select p_user is not null and p_path is not null
     and p_path ~ ('^' || p_user::text || '/[A-Za-z0-9_-]{1,120}\.jpg$')
$$;

-- 폴더를 훑을 차례에 올린다(이미 있으면 그대로)
create or replace function public.shots_sweep_add(p_users uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.shots_sweep (user_id)
  select distinct u from unnest(coalesce(p_users, array[]::uuid[])) u where u is not null
  on conflict (user_id) do nothing
$$;

-- ───────────────────────────── 어느 길로든 표 줄이 지워지면 파일을 남기지 않는다(0012의 media_to_trash와 같은 방식)
-- 본인 세션이 바로 지운 줄은 올리지 않는다: 갤러리는 파일을 먼저 지우고 줄을 뺀다(0004). 계정이 지워져 사라진 줄
-- (cascade)은 누가 지웠든 올린다. cascade로 지워진 줄의 트리거도 바깥 문장 차례에 돌아 pg_trigger_depth()로는 가릴 수 없어,
-- 계정 줄이 남아 있는지로 본다. 집주인 함수는 아래에서 직접 올린다(집주인 자신의 줄도 빠지지 않게).
create or replace function public.shots_to_trash() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_gone boolean := not exists (select 1 from auth.users u where u.id = old.user_id);
begin
  if (v_gone or auth.uid() is distinct from old.user_id) and public.shots_path_ok(old.user_id, old.path) then
    insert into public.shots_trash (path) values (old.path) on conflict (path) do nothing;
  end if;
  -- 계정이 지워졌으면 그 사람 폴더도 훑는다(표 줄 없이 남은 파일까지)
  if v_gone then
    perform public.shots_sweep_add(array[old.user_id]);
  end if;
  return old;
end $$;
drop trigger if exists shots_to_trash on public.shots;
create trigger shots_to_trash after delete on public.shots
  for each row execute function public.shots_to_trash();

-- ───────────────────────────── 집주인: 사람마다 장수(사진은 내보내지 않는다). 많은 순으로 500줄까지
-- user_id: 사진을 가진 계정 / name: 그 계정에 이어진 명단 줄의 이름(없으면 null = 명단 밖)
-- role: 그 줄의 역할(guest | family | admin, 없으면 null) / removed: 명단에서 뺀 줄인가
-- event_code_id·event_label: 그 줄이 들어온 행사 초대 코드(없으면 null) / shots: 장수
-- 모두 몇 명인지는 admin_shot_totals가 따로 센다(사이트가 500줄에서 잘렸다고 알린다)
create or replace function public.admin_shot_counts()
returns table (user_id uuid, name text, role text, removed boolean, event_code_id uuid, event_label text, shots int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  return query
    select s.user_id, r.display_name, r.role, coalesce(r.revoked_at is not null, false), r.event_code_id, e.label,
           count(*)::int
      from public.shots s
      left join public.roster r on r.claimed_by = s.user_id
      left join public.event_codes e on e.id = r.event_code_id
     group by s.user_id, r.display_name, r.role, r.revoked_at, r.event_code_id, e.label
     order by count(*) desc, r.display_name nulls last, s.user_id
     limit 500;
end $$;

-- ───────────────────────────── 집주인: 행사마다 합계. 행사마다 지우기(admin_shots_forget_event)와 같은 범위
-- (그 코드로 들어온 손님 줄, 명단에서 뺀 줄 포함, 가족·집주인으로 올린 줄 제외). 사진이 있는 행사만, 많은 순으로
create or replace function public.admin_shot_events()
returns table (id uuid, label text, people int, shots int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  return query
    select e.id, e.label, count(distinct s.user_id)::int, count(*)::int
      from public.shots s
      join public.roster r on r.claimed_by = s.user_id and r.role = 'guest'
      join public.event_codes e on e.id = r.event_code_id
     group by e.id, e.label
     order by count(*) desc, e.label, e.id
     limit 200;
end $$;

-- ───────────────────────────── 집주인: 모두 합친 수와 저장소 정리가 남은 수(경로는 내보내지 않는다)
-- {people: 사진을 가진 사람 수, shots: 장수, files: 저장소에서 아직 지우지 못한 파일 수,
--  folders: 아직 훑지 못한 폴더 수, waiting: 그 가운데 막 올라온 파일을 기다리느라 미룬 폴더 수}
create or replace function public.admin_shot_totals() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'people', (select count(distinct s.user_id) from public.shots s),
    'shots', (select count(*) from public.shots s),
    'files', (select count(*) from public.shots_trash t),
    'folders', (select count(*) from public.shots_sweep w),
    'waiting', (select count(*) from public.shots_sweep w where w.not_before > now()));
end $$;

-- ───────────────────────────── 집주인: 한 사람의 사진 모두. 지운 장수를 돌려준다(없으면 0)
create or replace function public.admin_shots_forget_user(p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  with gone as (
    delete from public.shots s where s.user_id = p_user
    returning s.user_id, s.path
  ), queued as (
    insert into public.shots_trash (path)
    select g.path from gone g where public.shots_path_ok(g.user_id, g.path)
    on conflict (path) do nothing
    returning 1
  )
  select count(*)::int into v_n from gone;
  -- 표 줄 없이 저장소에만 남은 파일(올리다 끊긴 것)도 찾도록 그 사람 폴더를 훑는다
  perform public.shots_sweep_add(array[p_user]);
  return v_n;
end $$;

-- ───────────────────────────── 집주인: 한 행사 초대 코드로 들어온 손님들의 사진 모두
-- 결과: {found(그 코드가 있는가), people(사진을 지운 사람 수), shots(지운 장수)}
create or replace function public.admin_shots_forget_event(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_people int;
  v_shots int;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if not exists (select 1 from public.event_codes e where e.id = p_event) then
    return jsonb_build_object('found', false, 'people', 0, 'shots', 0);
  end if;
  with gone as (
    delete from public.shots s
     using public.roster r
     where r.claimed_by = s.user_id and r.event_code_id = p_event and r.role = 'guest'
    returning s.user_id, s.path
  ), queued as (
    insert into public.shots_trash (path)
    select g.path from gone g where public.shots_path_ok(g.user_id, g.path)
    on conflict (path) do nothing
    returning 1
  )
  select count(distinct g.user_id)::int, count(*)::int into v_people, v_shots from gone g;
  -- 그 행사 손님의 폴더를 모두 훑는다(사진 줄이 없는 사람, 명단에서 뺀 줄 포함. 가족·집주인으로 올린 줄은 뺀다)
  perform public.shots_sweep_add(array(
    select r.claimed_by from public.roster r
     where r.event_code_id = p_event and r.role = 'guest' and r.claimed_by is not null));
  return jsonb_build_object('found', true, 'people', v_people, 'shots', v_shots);
end $$;

-- ───────────────────────────── 서버(비밀 키) 전용: 버릴 목록 비우기
-- 목록 앞쪽을 돌려준다. 그사이 같은 경로가 표에 다시 들어왔으면(드물다) 그 사람의 사진이라 목록에서 빼고 돌려주지 않는다.
create or replace function public.shots_trash_list(p_limit int default 100)
returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shots_trash t where exists (select 1 from public.shots s where s.path = t.path);
  return query
    select t.path from public.shots_trash t order by t.at, t.path
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- 저장소에서 지운 파일을 목록에서 뺀다. 뺀 수를 돌려준다
create or replace function public.shots_trash_done(p_paths text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  delete from public.shots_trash t where t.path = any (coalesce(p_paths, array[]::text[]));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ───────────────────────────── 서버(비밀 키) 전용: 폴더 훑기
-- 훑을 차례가 된 폴더(계정 id)들. 먼저 오른 것부터
create or replace function public.shots_sweep_list(p_limit int default 20)
returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select w.user_id from public.shots_sweep w
   where w.not_before <= now()
   order by w.at, w.user_id
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- 한 폴더를 훑은 결과를 받는다. 서버가 저장소에서 그 폴더를 나열해 넘긴다:
--   p_old: 10분 넘게 지난 파일의 경로들, p_young: 막 올라온 파일의 경로들, p_partial: 폴더를 끝까지 읽지 못했다.
-- p_old 가운데 표 줄이 없고 그 사람 폴더의 사이트 모양인 것만 버릴 목록에 올린다(올린 수를 돌려준다). 표 줄이 있는 파일은
-- 지금의 사진이라 두고, 다른 사람 폴더를 가리키는 경로는 올리지 않는다.
-- p_young 가운데 표 줄이 없는 것이 있거나(지금 올리는 중일 수 있다) p_partial이면 10분 뒤에 다시 훑고, 아니면 차례에서 뺀다.
create or replace function public.shots_sweep_done(p_user uuid, p_old text[], p_young text[], p_partial boolean default false)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if p_user is null then return 0; end if;
  insert into public.shots_trash (path)
  select distinct f from unnest(coalesce(p_old, array[]::text[])) f
   where public.shots_path_ok(p_user, f)
     and not exists (select 1 from public.shots s where s.path = f)
  on conflict (path) do nothing;
  get diagnostics v_n = row_count;
  if coalesce(p_partial, false)
     or exists (select 1 from unnest(coalesce(p_young, array[]::text[])) f
                 where public.shots_path_ok(p_user, f)
                   and not exists (select 1 from public.shots s where s.path = f)) then
    update public.shots_sweep w set not_before = now() + interval '10 minutes' where w.user_id = p_user;
  else
    delete from public.shots_sweep w where w.user_id = p_user;
  end if;
  return v_n;
end $$;

-- ───────────────────────────── 권한 정리
revoke all on public.shots_trash, public.shots_sweep from public, anon, authenticated;

revoke execute on function public.shots_path_ok(uuid, text), public.shots_sweep_add(uuid[]), public.shots_to_trash(),
  public.admin_shot_counts(), public.admin_shot_events(), public.admin_shot_totals(),
  public.admin_shots_forget_user(uuid), public.admin_shots_forget_event(uuid),
  public.shots_trash_list(int), public.shots_trash_done(text[]),
  public.shots_sweep_list(int), public.shots_sweep_done(uuid, text[], text[], boolean)
  from public, anon, authenticated;

-- 로그인한 사람의 세션으로 부른다(관리자인지는 함수가 본다)
grant execute on function public.admin_shot_counts(), public.admin_shot_events(), public.admin_shot_totals(),
  public.admin_shots_forget_user(uuid), public.admin_shots_forget_event(uuid) to authenticated;
-- 비밀 키(service_role)만: 버릴 목록 비우기와 폴더 훑기
grant execute on function public.shots_trash_list(int), public.shots_trash_done(text[]),
  public.shots_sweep_list(int), public.shots_sweep_done(uuid, text[], text[], boolean) to service_role;
