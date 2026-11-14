-- 0012 쪽지 사진(2026-11-10). 기획서 6.5 「사진 정화」, 10절 7 「사진은 두 번 지운다」.
--
-- 원칙
--   1. 사진은 기기에서 다시 그려(보기 1280, 작은 그림 320) 위치·기기 정보를 지우고, 서버가 한 번 더 확인한다.
--      확인을 마친 파일만 비공개 버킷 notes에 무작위 이름(32자리 16진)으로 둔다. 원래 파일 이름은 버린다.
--   2. 저장소에는 손님 정책을 두지 않는다. 올리기·보여 주기(10분짜리 서명 주소)·지우기는 서버(비밀 키)만 한다.
--   3. 서버가 올린 직후 media에 「누가 올린 파일인지」를 적고, 기록을 넣을 때 트리거가 내 파일인지,
--      1시간 안에 올린 것인지, 사진을 받는 방인지 확인한다. 한 파일은 기록 하나에만 붙는다.
--   4. 사진이 붙은 기록은 가족 범위까지만 걸린다(0001 그대로). 기록을 거두면 파일도 버릴 목록에 오르고,
--      서버가 저장소에서 지운 뒤 목록에서 뺀다. 기록으로 이어지지 않은 파일은 하루 뒤 같은 길로 버린다.
--   5. 보는 사람에게 파일 이름(media_path)이나 글쓴이 id를 내보내지 않는다. 방 목록에는 has_photo만 붙는다.
--
-- 0001의 records_guard_insert는 그대로 옮겨 적고 사진 확인만 더한다. room_records·my_records는
-- 돌려주는 모양이 바뀌어 지우고 다시 만든 뒤 0001과 같은 권한을 다시 준다.

-- ───────────────────────────── 사진을 받는 방
alter table public.rooms add column if not exists accepts_photos boolean not null default false;

insert into public.rooms (slug, door_state, accepts_records, accepts_photos) values
  ('photozone', 'open', true, true)
on conflict (slug) do nothing;

update public.rooms set accepts_photos = true, updated_at = now() where slug in ('pine', 'photozone');

-- ───────────────────────────── 올린 파일과 버릴 목록
create table public.media (
  path text primary key check (path ~ '^[0-9a-f]{32}$'),
  owner uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index media_created on public.media (created_at);
alter table public.media enable row level security;
-- 정책 없음: 서버가 비밀 키로 올린 직후 적는다.

create table public.media_trash (
  path text primary key check (path ~ '^[0-9a-f]{32}$'),
  at timestamptz not null default now()
);
alter table public.media_trash enable row level security;

create unique index records_media_path_key on public.records (media_path) where media_path is not null;

-- media 줄이 지워지면(기록을 거둠, 하루 지난 빈 파일, 계정 삭제) 파일 이름을 버릴 목록에 올린다
create or replace function public.media_to_trash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.media_trash (path, at) values (old.path, now()) on conflict (path) do nothing;
  return old;
end $$;
create trigger media_to_trash after delete on public.media
  for each row execute function public.media_to_trash();

-- 기록이 지워지면 붙어 있던 파일도 놓는다
create or replace function public.records_media_release() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.media_path is not null and old.media_path ~ '^[0-9a-f]{32}$' then
    delete from public.media where path = old.media_path;
    -- 계정 삭제로 media 줄이 먼저 사라졌어도 파일은 치운다
    insert into public.media_trash (path, at) values (old.media_path, now()) on conflict (path) do nothing;
  end if;
  return old;
end $$;
create trigger records_media_release after delete on public.records
  for each row execute function public.records_media_release();

-- ───────────────────────────── 기록 넣기 확인(0001 + 사진)
create or replace function public.records_guard_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if auth.uid() is null or not public.is_guest() then
    raise exception 'not_on_roster' using errcode = '42501';
  end if;
  if not exists (select 1 from public.rooms where slug = new.room_slug and accepts_records and door_state = 'open') then
    raise exception 'room_closed' using errcode = '42501';
  end if;
  -- 사진: 사진을 받는 방이고, 내가 1시간 안에 올린 파일이어야 한다
  if new.media_path is not null then
    if not exists (select 1 from public.rooms where slug = new.room_slug and accepts_photos) then
      raise exception 'room_no_photos' using errcode = '42501';
    end if;
    if not exists (select 1 from public.media m
                    where m.path = new.media_path and m.owner = auth.uid()
                      and m.created_at > now() - interval '1 hour') then
      raise exception 'media_not_yours' using errcode = '42501';
    end if;
  end if;
  new.author_id := auth.uid();
  v_name := (public.whoami()) ->> 'name';
  new.author_name := left(coalesce(nullif(btrim(v_name), ''), '손님'), 40);
  new.body := btrim(new.body);
  new.status := 'submitted';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.created_at := now();
  if new.requested_visibility = 'public' and not new.consent_public then
    new.requested_visibility := 'guests';
  end if;
  -- 11-28 최소판 결정(기획서 12절 손님 사진 기본값 (가)): 사진이 붙은 기록은 가족 범위까지만.
  if new.media_path is not null and new.requested_visibility in ('guests', 'public') then
    new.requested_visibility := 'family';
  end if;
  new.visibility := new.requested_visibility;
  return new;
end $$;

-- ───────────────────────────── 읽기 함수: has_photo 더하기(돌려주는 모양이 바뀌어 다시 만든다)
drop function if exists public.room_records(text, int);
create function public.room_records(p_room text, p_limit int default 50)
returns table (id uuid, author_name text, format text, body text, visibility text,
               status text, created_at timestamptz, mine boolean, has_photo boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.author_name, r.format, r.body, r.visibility, r.status, r.created_at,
         coalesce(r.author_id = auth.uid(), false), r.media_path is not null
  from public.records r
  where r.room_slug = p_room
    and r.status <> 'sealed'
    and (
      r.author_id = auth.uid()
      or (r.status = 'approved' and public.scope_visible(r.visibility, public.my_role()))
      or (public.is_family() and r.status = 'submitted' and r.visibility <> 'self')
    )
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

drop function if exists public.my_records();
create function public.my_records()
returns table (id uuid, room_slug text, format text, body text, requested_visibility text,
               visibility text, status text, created_at timestamptz, has_photo boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.room_slug, r.format, r.body, r.requested_visibility, r.visibility, r.status, r.created_at,
         r.media_path is not null
  from public.records r where r.author_id = auth.uid() order by r.created_at desc limit 200
$$;

-- ───────────────────────────── 버릴 파일 비우기(서버 전용)
-- 하루가 지나도록 기록으로 이어지지 않은 파일을 먼저 버릴 목록에 올리고, 목록 앞쪽을 돌려준다.
create or replace function public.media_trash_list(p_limit int default 50)
returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.media m
   where m.created_at < now() - interval '1 day'
     and not exists (select 1 from public.records r where r.media_path = m.path);
  return query
    select t.path from public.media_trash t order by t.at
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 저장소에서 지운 파일을 목록에서 뺀다
create or replace function public.media_trash_done(p_paths text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  delete from public.media_trash t where t.path = any (coalesce(p_paths, array[]::text[]));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ───────────────────────────── 비공개 버킷(JPEG만, 한 장 2MB까지). 저장소 정책은 두지 않는다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ───────────────────────────── 권한 정리
revoke all on public.media, public.media_trash from anon, authenticated;

revoke execute on function public.media_to_trash(), public.records_media_release(), public.records_guard_insert(),
  public.room_records(text, int), public.my_records(),
  public.media_trash_list(int), public.media_trash_done(text[])
  from public, anon, authenticated;

-- 0001과 같은 권한을 다시
grant execute on function public.room_records(text, int) to anon, authenticated;
grant execute on function public.my_records() to authenticated;
-- 비밀 키(service_role)만: 버릴 파일 비우기
grant execute on function public.media_trash_list(int), public.media_trash_done(text[]) to service_role;
