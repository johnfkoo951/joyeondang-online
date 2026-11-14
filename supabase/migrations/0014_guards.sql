-- 조연당 온라인 0014: 지킴 네 가지(2026-11-11)
--
-- 무엇을·왜
--   1. 쪽지 한도. 기록(쪽지·문장·사진 쪽지)은 「명단 손님 + 열린 방」만 확인해서, 손님 한 명이(또는 그 세션으로 도는
--      스크립트가) 끝없이 넣어 승인함과 석등 숫자, 가족이 보는 방 목록을 채울 수 있었다. 한 사람이 정한 시간 안에,
--      그리고 하루(한국 시간)에 쓸 수 있는 장수를 둔다. 관리자는 건너뛴다. 거두거나 지워진 쪽지도 쓴 것으로 센다
--      (남은 줄만 세면 넣고 거두기를 되풀이해 한도 없이 쓸 수 있다): 줄이 지워질 때 「누가 언제 쓴 것」만
--      record_tally에 이틀 동안 남긴다(본문·방·이름은 남기지 않는다).
--      record_room()은 지금 더 넣을 자리가 있는지 알려 준다. 넣기 트리거와 사이트(사진을 올리기 전)가 같이 쓴다.
--   2. 걷기 사진 저장소 상한. 60장 상한(0004)은 표(public.shots)에만 걸려, 표 줄 없이 저장소에만 올리면 장수 제한이
--      없었다. shots 버킷의 내 폴더 파일 수에도 상한을 둔다(표 상한 + 표에 못 올린 파일을 치우기 전의 여유).
--      두 군데에 건다. (가) 올리기 정책: 저장소가 올리기 전에 묻는 확인에서 일찍 거절한다. (나) storage.objects의
--      넣기 트리거: 저장소는 실제 줄을 서비스 권한으로 적어 정책을 다시 보지 않으므로(미리 받아 둔 서명 올리기 주소,
--      동시에 여러 장), 누가 적든 걸리는 트리거가 마지막에 센다.
--      누가 올릴 수 있는지(명단 밖 로그인 구경꾼 포함)는 0004 그대로다.
--   3. 겉모습의 사진 캐릭터 주인 확인. avatar_id는 내 그림(ready)만 걸 수 있는데(0003 profiles_guard_avatar),
--      함께 걷기에서 남에게 보이는 profiles.look의 사진 주소는 누구 그림인지 보지 않았다. 같은 트리거가 look도 본다.
--      이미 들어 있는 값은 건드리지 않고, look을 새로 넣거나 바꿀 때만 본다(이름표만 고치는 저장은 그대로 된다).
--   4. my_roster() 실행권. 다른 함수 안에서만 쓰는 도우미인데 손님이 직접 부르면 자기 명단 줄 전체(집주인 메모,
--      이메일, 회차)가 나왔다. 바깥 실행권을 거둔다. 이것을 부르는 my_role·whoami 등은 정의자 권한으로 돌아 그대로다.
--
-- 한도 숫자는 바로 아래 guard_limits() 한곳에 있다. 바꾸려면 그 함수만 다시 올리면 된다(다른 것은 그대로).
-- 사이트 코드는 이 파일을 올리기 전에도 뒤에도 똑같이 돈다(새 오류 too_many·too_many_today에 맞는 안내 문구를 더했고,
-- record_room()이 없으면 묻지 않고 지나간다).
-- 여러 번 올려도 된다(create or replace, … if not exists, drop … if exists). 0001·0003·0004·0006 뒤에 올린다
-- (없으면 맨 앞에서 멈춘다). 올리는 역할은 저장소 표의 모든 줄을 셀 수 있어야 한다(Supabase의 postgres는 그렇다.
-- 아니면 맨 앞에서 멈춘다). storage.objects에 정책과 트리거를 만드는 것은 Supabase가 허용하는 일이다.
-- 올린 뒤 확인: select tgname from pg_trigger where tgname in ('records_limit_insert', 'records_tally_delete',
--   'shots_storage_guard') and not tgisinternal;  → 세 줄
--
-- 되돌리는 법
--   drop trigger if exists records_limit_insert on public.records;
--   drop function if exists public.records_limit_insert();
--   drop trigger if exists records_tally_delete on public.records;
--   drop function if exists public.records_tally_delete();
--   drop function if exists public.record_room();
--   drop table if exists public.record_tally;
--   drop trigger if exists shots_storage_guard on storage.objects;
--   drop function if exists public.shots_storage_guard();
--   drop policy if exists shots_storage_own_insert on storage.objects;
--   create policy shots_storage_own_insert on storage.objects for insert to authenticated
--     with check (bucket_id = 'shots' and (storage.foldername(name))[1] = (select auth.uid())::text);  -- 0004 그대로
--   drop function if exists public.shots_storage_room();
--   0003의 「create or replace function public.profiles_guard_avatar()」 정의를 다시 올리고,
--     drop trigger if exists profiles_guard_avatar on public.profiles;
--     create trigger profiles_guard_avatar before insert or update of avatar_id on public.profiles
--       for each row execute function public.profiles_guard_avatar();
--   grant execute on function public.my_roster() to anon, authenticated;
--   drop function if exists public.guard_limits();

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.records') is null or to_regclass('public.avatars') is null
     or to_regclass('public.shots') is null or to_regclass('storage.objects') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles' and column_name = 'look') then
    raise exception '0014_needs_0001_0003_0004_0006';
  end if;
  -- 저장소 상한 트리거는 올리는 역할의 권한으로 저장소 표를 센다. 줄이 가려지는 역할이면 상한이 조용히 안 걸린다
  if not exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception '0014_needs_role_that_reads_all_storage_rows';
  end if;
end $$;

-- ───────────────────────────── 한도 숫자(여기만 고치면 된다)
create or replace function public.guard_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'note_window_minutes', 10,  -- 쪽지: 이 시간(분) 안에
    'note_window_max', 10,      --       이만큼까지
    'note_day_max', 60,         -- 쪽지: 하루(한국 시간)에 이만큼까지
    'shots_storage_max', 70     -- 걷기 사진 저장소: 한 사람 파일 수(표 상한 60장 + 치우기 전 여유 10)
  )
$$;

-- ───────────────────────────── 1. 쪽지 한도
-- 지워진 쪽지의 「누가 언제 쓴 것」. 줄이 지워질 때(거두기, 철회 번호, 계정 지우기) 남기고 이틀 뒤 치운다.
-- 정책이 없다: 정의자 함수만 읽고 쓴다.
create table if not exists public.record_tally (
  author_id uuid not null,
  created_at timestamptz not null
);
create index if not exists record_tally_author on public.record_tally (author_id, created_at desc);
alter table public.record_tally enable row level security;
revoke all on public.record_tally from public, anon, authenticated;

create or replace function public.records_tally_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.record_tally (author_id, created_at) values (old.author_id, old.created_at);
  -- 이틀보다 오래된 것은 어느 한도에도 들지 않으므로 바로 치운다(창은 하루를 넘지 않게 둔다)
  delete from public.record_tally t where t.created_at <= now() - interval '2 days';
  return old;
end $$;

drop trigger if exists records_tally_delete on public.records;
create trigger records_tally_delete after delete on public.records
  for each row execute function public.records_tally_delete();

-- 지금 쪽지를 더 넣을 자리가 있는가: 'ok' | 'too_many'(잠깐 사이) | 'too_many_today'(하루).
-- 넣기 트리거가 이것으로 판단하고, 사이트는 사진 쪽지의 사진을 올리기 전에 묻는다(한도에 찬 사람의 사진을
-- 올렸다 지우는 헛일을 하지 않게). 남아 있는 쪽지와 지워진 쪽지(record_tally)를 함께 센다.
create or replace function public.record_room() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lim jsonb := public.guard_limits();
  v_day timestamptz := ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul');
  v_win timestamptz := now() - make_interval(mins => (v_lim ->> 'note_window_minutes')::int);
begin
  if v_uid is null or public.is_admin() then return 'ok'; end if;
  -- 하루를 먼저 본다: 둘 다 찼으면 「내일」이 맞는 안내다
  if (select count(*) from public.records r where r.author_id = v_uid and r.created_at >= v_day)
     + (select count(*) from public.record_tally t where t.author_id = v_uid and t.created_at >= v_day)
     >= (v_lim ->> 'note_day_max')::int then
    return 'too_many_today';
  end if;
  if (select count(*) from public.records r where r.author_id = v_uid and r.created_at > v_win)
     + (select count(*) from public.record_tally t where t.author_id = v_uid and t.created_at > v_win)
     >= (v_lim ->> 'note_window_max')::int then
    return 'too_many';
  end if;
  return 'ok';
end $$;

-- records_guard_insert(0001·0012)는 그대로 두고 트리거를 하나 더 건다. 같은 때(before insert)의 트리거는 이름 순서로
-- 돌므로 records_guard_insert(명단·방·사진 확인) 다음에 이것이 돈다: 다시 해도 안 되는 까닭(쉬는 방, 남의 사진)을
-- 먼저 알리고, 기다리면 되는 까닭(한도)은 맨 나중에 알린다. 이름을 바꿀 때는 이 순서가 유지되게 한다.
create or replace function public.records_limit_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_room text;
begin
  if v_uid is null then return new; end if;
  -- 같은 사람의 넣기만 한 줄로 세운다(동시에 여러 번 눌러도 한도를 넘지 않게). 다른 사람은 기다리지 않는다
  perform pg_advisory_xact_lock(hashtextextended('joyeondang:records:' || v_uid::text, 0));
  v_room := public.record_room();
  if v_room <> 'ok' then
    raise exception '%', v_room using errcode = '42501';
  end if;
  -- 지워진 쪽지의 흔적은 쪽지가 오갈 때 치운다(이틀 지난 것)
  delete from public.record_tally t where t.created_at <= now() - interval '2 days';
  return new;
end $$;

drop trigger if exists records_limit_insert on public.records;
create trigger records_limit_insert before insert on public.records
  for each row execute function public.records_limit_insert();

-- ───────────────────────────── 2. 걷기 사진 저장소 상한
-- 올리는 사람의 권한으로 센다(security invoker): 0004의 shots_storage_own_select가 보여 주는 「내 폴더의 파일」이
-- 곧 세어야 할 것이라, 저장소 표를 넓게 읽는 권한이 필요 없다.
create or replace function public.shots_storage_room() returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then return false; end if;
  return (select count(*) from storage.objects o
           where o.bucket_id = 'shots' and o.name like v_uid || '/%')
         < (public.guard_limits() ->> 'shots_storage_max')::int;
end $$;

drop policy if exists shots_storage_own_insert on storage.objects;
create policy shots_storage_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shots' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.shots_storage_room()));

-- 위 정책은 저장소가 올리는 사람의 권한으로 「넣어 보고 되돌리는」 확인에서만 돈다. 실제 줄은 저장소가 서비스 권한으로
-- 적는다. 그래서 파일이 없을 때 미리 받아 둔 서명 올리기 주소(쓸 때는 정책을 다시 보지 않는다)나 동시에 시작한
-- 올리기는 정책만으로 못 막는다. 누가 적든 걸리는 넣기 트리거가 마지막에 한 번 더 센다(확인 때도 같이 돈다).
-- 폴더(첫 마디)별로 한 줄로 세워 동시에 와도 넘지 않는다.
-- 같은 이름을 덮어쓰는 것은 장수가 늘지 않으므로 세지 않는다. 다른 버킷과 폴더 없는 이름은 건드리지 않는다.
create or replace function public.shots_storage_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_folder text;
begin
  if new.bucket_id is distinct from 'shots' or position('/' in new.name) < 2 then return new; end if;
  v_folder := split_part(new.name, '/', 1) || '/';
  perform pg_advisory_xact_lock(hashtextextended('joyeondang:shots:' || v_folder, 0));
  if (select count(*) from storage.objects o
       where o.bucket_id = 'shots' and starts_with(o.name, v_folder) and o.name <> new.name)
     >= (public.guard_limits() ->> 'shots_storage_max')::int then
    raise exception 'shots_storage_full' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists shots_storage_guard on storage.objects;
create trigger shots_storage_guard before insert on storage.objects
  for each row execute function public.shots_storage_guard();

-- ───────────────────────────── 3. 겉모습의 사진 캐릭터도 내 그림만
-- 0003의 확인(avatar_id)은 그대로 두고 look을 더한다. 사진 겉모습은 {"kind":"photo","url":"/api/avatar/<그림 id>"}.
create or replace function public.profiles_guard_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_id is not null
     and (tg_op = 'INSERT' or new.avatar_id is distinct from old.avatar_id)
     and not exists (select 1 from public.avatars a
                      where a.id = new.avatar_id and a.user_id = new.user_id and a.status = 'ready') then
    raise exception 'avatar_not_yours' using errcode = '42501';
  end if;
  if new.look is not null and new.look ->> 'kind' = 'photo'
     and (tg_op = 'INSERT' or new.look is distinct from old.look)
     and not exists (select 1 from public.avatars a
                      where a.user_id = new.user_id and a.status = 'ready'
                        and '/api/avatar/' || a.id::text = new.look ->> 'url') then
    raise exception 'look_not_yours' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_avatar on public.profiles;
create trigger profiles_guard_avatar before insert or update of avatar_id, look on public.profiles
  for each row execute function public.profiles_guard_avatar();

-- ───────────────────────────── 4. my_roster()는 안에서만
revoke execute on function public.my_roster() from public, anon, authenticated;

-- ───────────────────────────── 권한 정리
revoke execute on function public.guard_limits(), public.records_limit_insert(), public.records_tally_delete(),
  public.record_room(), public.shots_storage_room(), public.shots_storage_guard(), public.profiles_guard_avatar()
  from public, anon, authenticated;
-- 저장소 정책이 올리는 사람의 권한으로 부른다. record_room은 사이트가 로그인한 사람의 세션으로 묻는다
grant execute on function public.guard_limits(), public.shots_storage_room(), public.record_room() to authenticated;
