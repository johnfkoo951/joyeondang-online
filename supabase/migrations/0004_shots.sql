-- 0004 걷기 사진(2026-11-09): 걷다가 찍은 화면을 본인만 보는 갤러리에 둔다.
-- 실제 집 화면이 찍히므로 공개하지 않는다. 표와 저장소 모두 본인 것만 읽고 쓰고 지운다.
-- 한 사람 60장까지. 넘으면 올리기를 거절하고(오래된 것부터 지우라고 화면이 안내한다) 자동으로 지우지 않는다.
-- 0001·0002의 정책·함수·트리거는 건드리지 않는다.

create table public.shots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null unique check (char_length(path) between 10 and 200),
  w integer not null check (w between 1 and 4096),
  h integer not null check (h between 1 and 4096),
  place text not null default '' check (char_length(place) <= 40),
  created_at timestamptz not null default now()
);
create index shots_user_created on public.shots (user_id, created_at desc);
alter table public.shots enable row level security;

-- 경로는 늘 <내 uid>/ 아래(저장소 정책과 같은 모양)
create policy shots_own_select on public.shots for select to authenticated
  using (user_id = (select auth.uid()));
create policy shots_own_insert on public.shots for insert to authenticated
  with check (user_id = (select auth.uid()) and path like ((select auth.uid())::text || '/%'));
create policy shots_own_delete on public.shots for delete to authenticated
  using (user_id = (select auth.uid()));

-- 60장 상한. 세는 일은 RLS와 상관없이 그 사람 것만 정확히 센다.
create function public.shots_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.shots s where s.user_id = new.user_id) >= 60 then
    raise exception 'shots_full' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.shots_limit() from public, anon, authenticated;
create trigger shots_limit before insert on public.shots
  for each row execute function public.shots_limit();

-- 비공개 버킷: JPEG만, 한 장 3MB까지
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shots', 'shots', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy shots_storage_own_select on storage.objects for select to authenticated
  using (bucket_id = 'shots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy shots_storage_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy shots_storage_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shots' and (storage.foldername(name))[1] = (select auth.uid())::text);
