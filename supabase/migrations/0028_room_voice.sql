-- 0028 방 의견함(2026-11-14): 가족이 방마다 지금 놓인 것 하나하나에 「좋아요·바꿀래요·빼 주세요」와 한마디를 남기고,
-- 방 이름·새로 들일 것 같은 질문에 답한다.
-- 원칙:
--   1. 가족(role_rank >= 2)만 읽고 쓴다. 가족은 서로의 의견을 모두 읽고, 고치는 것은 자기 줄만이다.
--   2. 쓰기는 save_room_voice 함수만 거친다(직접 insert/update/delete 없음). 한 사람·한 방에 한 줄.
--   3. 쓴 때의 앱 버전, 방 지문(방이 바뀌면 달라진다), 그때 본 항목 목록을 같이 적어 둔다. 그 뒤 방이 바뀌었는지,
--      무엇이 새로 생겼는지를 화면이 이것으로 가른다.

create table if not exists public.room_voice (
  room_slug text not null references public.rooms(slug) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  marks jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'done')),
  seen_items text[] not null default '{}',
  room_hash text not null default '' check (char_length(room_hash) <= 64),
  app_version text not null default '' check (char_length(app_version) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_slug, user_id)
);

alter table public.room_voice enable row level security;

drop policy if exists room_voice_family_select on public.room_voice;
create policy room_voice_family_select on public.room_voice
  for select to authenticated
  using ((select public.is_family()));

-- 문자열 값만 담은 객체인가(키 모양, 개수, 글 길이, 허용 값)
create or replace function public.room_voice_map_ok(p jsonb, p_max_keys int, p_max_len int, p_values text[] default null)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_key text;
  v_val jsonb;
  v_n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for v_key, v_val in select e.key, e.value from jsonb_each(p) e loop
    v_n := v_n + 1;
    if v_n > p_max_keys then return false; end if;
    if v_key !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' then return false; end if;
    if jsonb_typeof(v_val) <> 'string' then return false; end if;
    if char_length(v_val #>> '{}') > p_max_len then return false; end if;
    if p_values is not null and not ((v_val #>> '{}') = any (p_values)) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.save_room_voice(
  p_room text,
  p_marks jsonb,
  p_notes jsonb,
  p_answers jsonb,
  p_status text,
  p_seen text[] default '{}',
  p_room_hash text default '',
  p_app_version text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if v_uid is null or not public.is_family() then
    raise exception 'not_allowed';
  end if;
  if p_room is null or not exists (select 1 from public.rooms r where r.slug = p_room) then
    raise exception 'invalid_room';
  end if;
  if p_status is null or p_status not in ('draft', 'done') then
    raise exception 'invalid_status';
  end if;
  if not public.room_voice_map_ok(p_marks, 300, 8, array['keep', 'change', 'remove']) then
    raise exception 'invalid_marks';
  end if;
  if not public.room_voice_map_ok(p_notes, 300, 600) then
    raise exception 'invalid_notes';
  end if;
  if not public.room_voice_map_ok(p_answers, 30, 2000) then
    raise exception 'invalid_answers';
  end if;
  if p_seen is null or cardinality(p_seen) > 300
     or exists (select 1 from unnest(p_seen) s where s is null or s !~ '^[a-z0-9][a-z0-9:_-]{0,79}$') then
    raise exception 'invalid_seen';
  end if;
  if char_length(coalesce(p_room_hash, '')) > 64 or char_length(coalesce(p_app_version, '')) > 32 then
    raise exception 'invalid_stamp';
  end if;
  if pg_column_size(p_marks) + pg_column_size(p_notes) + pg_column_size(p_answers) > 98304 then
    raise exception 'too_large';
  end if;

  insert into public.room_voice as rv (room_slug, user_id, marks, notes, answers, status, seen_items, room_hash, app_version)
  values (p_room, v_uid, p_marks, p_notes, p_answers, p_status, p_seen, coalesce(p_room_hash, ''), coalesce(p_app_version, ''))
  on conflict (room_slug, user_id) do update set
    marks = excluded.marks,
    notes = excluded.notes,
    answers = excluded.answers,
    status = excluded.status,
    seen_items = excluded.seen_items,
    room_hash = excluded.room_hash,
    app_version = excluded.app_version,
    updated_at = now()
  returning rv.updated_at into v_at;

  return jsonb_build_object('room', p_room, 'status', p_status, 'updatedAt', v_at);
end;
$$;

-- 가족 모두의 의견(누가 썼는지는 이름표 별명 → 명단 이름). user_id는 내보내지 않고 내 것인지만 알려 준다
create or replace function public.room_voice_list()
returns table (
  room_slug text,
  writer text,
  mine boolean,
  marks jsonb,
  notes jsonb,
  answers jsonb,
  status text,
  seen_items text[],
  room_hash text,
  app_version text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.room_slug,
    coalesce(
      (select nullif(btrim(p.nickname), '') from public.profiles p where p.user_id = v.user_id),
      (select r.display_name from public.roster r where r.claimed_by = v.user_id and r.revoked_at is null),
      '가족'
    ),
    v.user_id = auth.uid(),
    v.marks,
    v.notes,
    v.answers,
    v.status,
    v.seen_items,
    v.room_hash,
    v.app_version,
    v.updated_at
  from public.room_voice v
  where public.is_family()
  order by v.room_slug asc, v.updated_at desc;
$$;

revoke all on function public.room_voice_map_ok(jsonb, int, int, text[]) from public, anon;
revoke all on function public.save_room_voice(text, jsonb, jsonb, jsonb, text, text[], text, text) from public, anon;
grant execute on function public.save_room_voice(text, jsonb, jsonb, jsonb, text, text[], text, text) to authenticated;
revoke all on function public.room_voice_list() from public, anon;
grant execute on function public.room_voice_list() to authenticated;

revoke all on table public.room_voice from public, anon;
revoke insert, update, delete on table public.room_voice from authenticated;
grant select on table public.room_voice to authenticated;
