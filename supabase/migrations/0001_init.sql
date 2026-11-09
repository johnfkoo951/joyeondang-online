-- 조연당 온라인 0001: 명단, 입장, 기록, 도장, 승인
--
-- 원칙
--   1. 신원은 세션(auth.uid())에서만 온다. 클라이언트가 보낸 이름·역할은 믿지 않는다.
--   2. 역할은 명단(roster)에서 매 요청 계산한다. 명단에서 지우면(revoked_at) 다음 요청부터 바로 막힌다.
--   3. 구글 이메일은 명단 이메일과 맞을 때만 쓰고, 맞지 않으면 'visitor'(로그인했지만 명단 밖)로 둔다.
--   4. 읽기 범위 사다리: public(누구나) < guests(초대 손님) < family(가족). 'self'는 쓴 사람만.
--      TypeScript 쪽 src/lib/access.ts 의 canSee()와 같은 사다리다. 하나를 바꾸면 둘 다 바꾼다.
--   5. 쓰기는 정책으로 한 번, BEFORE 트리거로 한 번 더 막는다(PostgREST 직접 호출 대비).
--   6. 실제 도면 정보(치수, 모형 ID, 방위, 출입구)는 이 DB에 들어오지 않는다. 방은 slug만 쓴다.

-- ───────────────────────────── 공용 함수
create or replace function public.role_rank(p_role text) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'admin' then 3 when 'family' then 2 when 'guest' then 1 else 0 end
$$;

-- 기록의 공개 범위가 이 역할에게 보이는가
create or replace function public.scope_visible(p_scope text, p_role text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_scope
    when 'public' then true
    when 'guests' then public.role_rank(p_role) >= 1
    when 'family' then public.role_rank(p_role) >= 2
    else false
  end
$$;

-- 범위 넓이(넓을수록 큼). 승인할 때 쓴 사람이 고른 범위보다 넓힐 수 없게 할 때 쓴다.
create or replace function public.scope_width(p_scope text) returns int
language sql immutable set search_path = '' as $$
  select case p_scope when 'public' then 3 when 'guests' then 2 when 'family' then 1 else 0 end
$$;

-- 초대 코드 정규화 + 해시. 하이픈·공백·대소문자 차이를 없앤다.
create or replace function public.hash_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
$$;

create or replace function public.jwt_email() returns text
language sql stable set search_path = '' as $$
  select lower(nullif(btrim(auth.jwt() ->> 'email'), ''))
$$;

create or replace function public.jwt_is_google() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
      or coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false)
$$;

-- ───────────────────────────── 명단
create table public.roster (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  role text not null default 'guest' check (role in ('guest', 'family', 'admin')),
  slot text check (slot in ('11', '15', '16', '17', 'online', 'family')),
  email text check (email is null or email = lower(btrim(email))),
  claimed_by uuid unique references auth.users (id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create unique index roster_email_key on public.roster (email) where email is not null;
alter table public.roster enable row level security;

-- 지금 로그인한 사람의 명단 줄. 이미 연결된 줄이 있으면 그것, 없으면 구글 이메일이 맞는 빈 줄.
create or replace function public.my_roster() returns public.roster
language sql stable security definer set search_path = '' as $$
  select r.* from public.roster r
  where auth.uid() is not null
    and r.revoked_at is null
    and (
      r.claimed_by = auth.uid()
      or (r.claimed_by is null and r.email is not null
          and public.jwt_is_google() and r.email = public.jwt_email())
    )
  order by (r.claimed_by is not distinct from auth.uid()) desc
  limit 1
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'public'
    else coalesce((public.my_roster()).role, 'visitor')
  end
$$;

create or replace function public.is_guest() returns boolean
language sql stable security definer set search_path = '' as $$ select public.role_rank(public.my_role()) >= 1 $$;
create or replace function public.is_family() returns boolean
language sql stable security definer set search_path = '' as $$ select public.role_rank(public.my_role()) >= 2 $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select public.role_rank(public.my_role()) >= 3 $$;

create policy roster_admin_select on public.roster for select to authenticated using ((select public.is_admin()));
create policy roster_admin_insert on public.roster for insert to authenticated with check ((select public.is_admin()));
create policy roster_admin_update on public.roster for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 로그인 직후 한 번: 구글 이메일이 명단 이메일과 같으면 그 줄을 이 계정에 묶는다.
create or replace function public.sync_my_roster() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return 'public'; end if;
  if not exists (select 1 from public.roster where claimed_by = auth.uid())
     and public.jwt_is_google() and public.jwt_email() is not null then
    update public.roster
       set claimed_by = auth.uid(), claimed_at = now()
     where id = (select id from public.roster
                  where claimed_by is null and revoked_at is null and email = public.jwt_email()
                  limit 1);
  end if;
  return public.my_role();
end $$;

-- ───────────────────────────── 초대 링크 (한 링크 = 명단 한 줄 = 계정 하나)
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  roster_id uuid not null references public.roster (id) on delete cascade,
  max_uses int not null default 1 check (max_uses between 1 and 20),
  used int not null default 0 check (used >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
create policy invites_admin_select on public.invites for select to authenticated using ((select public.is_admin()));
create policy invites_admin_update on public.invites for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 관리자가 코드를 만들어 넘기면 해시만 저장한다. 코드 원문은 DB에 남지 않는다.
create or replace function public.admin_create_invite(p_roster_id uuid, p_code text, p_days int default 30)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if char_length(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) < 8 then
    raise exception 'code_too_short' using errcode = '22023';
  end if;
  insert into public.invites (code_hash, roster_id, expires_at)
  values (public.hash_code(p_code), p_roster_id, now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 400))));
  return true;
end $$;

-- 초대 링크로 들어온 사람이 로그인한 뒤 부른다. 결과: 역할 이름 또는 invalid / taken / already
create or replace function public.claim_invite(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invites;
  v_r public.roster;
  v_email text := public.jwt_email();
begin
  if auth.uid() is null then return 'login_required'; end if;
  select * into v_inv from public.invites where code_hash = public.hash_code(p_code) for update;
  if not found or v_inv.revoked_at is not null then return 'invalid'; end if;
  select * into v_r from public.roster where id = v_inv.roster_id for update;
  if v_r.revoked_at is not null then return 'invalid'; end if;
  -- 이미 이 사람에게 묶인 링크면 새 휴대폰에서 다시 눌러도 그대로 통과(횟수·만료와 무관).
  if v_r.claimed_by = auth.uid() then return v_r.role; end if;
  if (v_inv.expires_at is not null and v_inv.expires_at < now()) or v_inv.used >= v_inv.max_uses then
    return 'invalid';
  end if;
  if v_r.claimed_by is not null then return 'taken'; end if;
  if exists (select 1 from public.roster where claimed_by = auth.uid()) then return 'already'; end if;
  update public.roster
     set claimed_by = auth.uid(),
         claimed_at = now(),
         email = coalesce(email, case
           when v_email is not null and not exists (select 1 from public.roster where email = v_email)
           then v_email end)
   where id = v_r.id;
  update public.invites set used = used + 1 where id = v_inv.id;
  return v_r.role;
end $$;

-- ───────────────────────────── 입장 요청 (명단에서 찾지 못한 사람)
create table public.entry_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  typed_name text not null check (char_length(btrim(typed_name)) between 1 and 40),
  message text check (message is null or char_length(message) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  roster_id uuid references public.roster (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);
create unique index entry_requests_one_pending on public.entry_requests (user_id) where status = 'pending';
alter table public.entry_requests enable row level security;
create policy entry_requests_own_or_admin on public.entry_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.request_entry(p_name text, p_message text default null) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return 'login_required'; end if;
  if public.role_rank(public.my_role()) >= 1 then return 'already_in'; end if;
  if exists (select 1 from public.entry_requests where user_id = auth.uid() and status = 'pending') then
    return 'pending';
  end if;
  insert into public.entry_requests (user_id, email, typed_name, message)
  values (auth.uid(), public.jwt_email(), btrim(p_name), nullif(btrim(coalesce(p_message, '')), ''));
  return 'pending';
end $$;

-- 관리자: 요청을 기존 명단 줄에 잇거나(p_roster_id), 새 줄을 만들거나(p_new_name), 거절한다.
create or replace function public.admin_resolve_request(
  p_request_id uuid, p_action text, p_roster_id uuid default null,
  p_new_name text default null, p_role text default 'guest', p_slot text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.entry_requests;
  v_target uuid;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  select * into v_req from public.entry_requests where id = p_request_id and status = 'pending' for update;
  if not found then return 'not_found'; end if;
  if p_action = 'reject' then
    update public.entry_requests set status = 'rejected', resolved_at = now(), resolved_by = auth.uid() where id = v_req.id;
    return 'rejected';
  end if;
  if p_action <> 'approve' then raise exception 'bad_action' using errcode = '22023'; end if;
  if exists (select 1 from public.roster where claimed_by = v_req.user_id) then return 'already_linked'; end if;
  if p_roster_id is not null then
    update public.roster set claimed_by = v_req.user_id, claimed_at = now()
     where id = p_roster_id and claimed_by is null and revoked_at is null
     returning id into v_target;
    if v_target is null then return 'roster_unavailable'; end if;
  else
    insert into public.roster (display_name, role, slot, claimed_by, claimed_at)
    values (coalesce(nullif(btrim(p_new_name), ''), v_req.typed_name),
            case when p_role in ('guest', 'family') then p_role else 'guest' end,
            p_slot, v_req.user_id, now())
    returning id into v_target;
  end if;
  update public.entry_requests
     set status = 'approved', roster_id = v_target, resolved_at = now(), resolved_by = auth.uid()
   where id = v_req.id;
  return 'approved';
end $$;

-- ───────────────────────────── 이름표와 종이 인형 (사진 없음, 고른 설정만)
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text check (nickname is null or char_length(btrim(nickname)) between 1 and 20),
  doll text check (doll is null or doll ~ '^[a-z0-9-]{1,24}$'),
  doll_color text check (doll_color is null or doll_color ~ '^[a-z-]{1,16}$'),
  photo_ok boolean,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_own_select on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_own_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_guest()));
create policy profiles_own_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', public.my_role(),
    'name', coalesce(
      (select nullif(btrim(p.nickname), '') from public.profiles p where p.user_id = auth.uid()),
      (public.my_roster()).display_name),
    'roster_name', (public.my_roster()).display_name,
    'pending_request', exists (select 1 from public.entry_requests e where e.user_id = auth.uid() and e.status = 'pending'),
    'doll', (select p.doll from public.profiles p where p.user_id = auth.uid()),
    'doll_color', (select p.doll_color from public.profiles p where p.user_id = auth.uid())
  )
$$;

-- ───────────────────────────── 방 (문패 상태만. 그림과 글은 코드의 src/content/rooms.ts)
create table public.rooms (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,32}$'),
  door_state text not null default 'resting' check (door_state in ('open', 'resting', 'family', 'closed')),
  accepts_records boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.rooms enable row level security;
create policy rooms_read_all on public.rooms for select to anon, authenticated using (true);
create policy rooms_admin_update on public.rooms for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.rooms (slug, door_state, accepts_records) values
  ('porch', 'open', true),
  ('pine', 'open', true),
  ('lantern', 'open', false),
  ('entrance', 'open', false),
  ('living', 'open', true),
  ('kitchen', 'resting', false),
  ('study', 'resting', false),
  ('atelier', 'resting', false),
  ('gable', 'resting', false),
  ('attic', 'closed', false);

-- ───────────────────────────── 기록 한 장
create table public.records (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '손님',
  room_slug text not null references public.rooms (slug),
  format text not null default 'note'
    check (format in ('note', 'sentence', 'question', 'promise', 'photo', 'drawing', 'poem', 'letter')),
  body text not null
    check (char_length(body) between 1 and 500 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  media_path text,
  requested_visibility text not null default 'guests'
    check (requested_visibility in ('self', 'family', 'guests', 'public')),
  visibility text not null default 'guests'
    check (visibility in ('self', 'family', 'guests', 'public')),
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'hidden', 'rejected', 'sealed')),
  consent_public boolean not null default false,
  consent_book boolean not null default false,
  consent_exhibit boolean not null default false,
  marks_person boolean not null default false,
  marks_minor boolean not null default false,
  receipt_hash text unique,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  constraint public_needs_consent check (visibility <> 'public' or consent_public),
  constraint visibility_within_request check (public.scope_width(visibility) <= public.scope_width(requested_visibility))
);
create index records_room_status on public.records (room_slug, status, created_at desc);
create index records_author on public.records (author_id, created_at desc);
alter table public.records enable row level security;

-- 직접 읽기는 내 것 + 관리자(가족 범위 이상, 봉인 제외)만. 방 화면은 room_records()로 읽는다.
create policy records_select_own_or_admin on public.records for select to authenticated
  using (author_id = (select auth.uid())
         or ((select public.is_admin()) and visibility <> 'self' and status <> 'sealed'));
create policy records_insert_guest on public.records for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_guest()));
-- update/delete 정책 없음: 승인은 moderate_record(), 거두기는 withdraw_*() 로만.

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
create trigger records_guard_insert before insert on public.records
  for each row execute function public.records_guard_insert();

-- 방 하나의 기록 중 지금 보는 사람에게 보이는 것만. 글쓴이 id는 내보내지 않는다.
create or replace function public.room_records(p_room text, p_limit int default 50)
returns table (id uuid, author_name text, format text, body text, visibility text,
               status text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.author_name, r.format, r.body, r.visibility, r.status, r.created_at,
         coalesce(r.author_id = auth.uid(), false)
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

create or replace function public.my_records()
returns table (id uuid, room_slug text, format text, body text, requested_visibility text,
               visibility text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.room_slug, r.format, r.body, r.requested_visibility, r.visibility, r.status, r.created_at
  from public.records r where r.author_id = auth.uid() order by r.created_at desc limit 200
$$;

-- 거두기: 행을 지운다(본문을 남기지 않는다). 로그인 상태에서 내 기록을, 또는 철회 번호로.
create or replace function public.withdraw_record(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.records where id = p_id and author_id = auth.uid();
  if found then
    insert into public.moderation_log (actor, record_id, action) values (auth.uid(), p_id, 'withdrawn');
  end if;
  return found;
end $$;

create or replace function public.withdraw_by_receipt(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if char_length(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) < 10 then return false; end if;
  delete from public.records where receipt_hash = public.hash_code(p_code) returning id into v_id;
  if v_id is not null then
    insert into public.moderation_log (actor, record_id, action) values (auth.uid(), v_id, 'withdrawn_by_receipt');
  end if;
  return v_id is not null;
end $$;

-- 철회 번호는 기록을 만든 직후 서버가 한 번만 붙인다(원문은 글쓴이 화면에만).
create or replace function public.attach_receipt(p_id uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.records set receipt_hash = public.hash_code(p_code)
   where id = p_id and author_id = auth.uid() and receipt_hash is null;
  return found;
end $$;

-- ───────────────────────────── 승인
create table public.moderation_log (
  id bigint generated always as identity primary key,
  actor uuid,
  record_id uuid,
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);
alter table public.moderation_log enable row level security;
create policy moderation_log_admin on public.moderation_log for select to authenticated using ((select public.is_admin()));

-- p_action: approve | hide | reject. approve일 때 p_visibility는 쓴 사람이 고른 범위 안에서만.
create or replace function public.moderate_record(p_id uuid, p_action text, p_visibility text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_rec public.records;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  select * into v_rec from public.records where id = p_id and visibility <> 'self' and status <> 'sealed' for update;
  if not found then return 'not_found'; end if;
  if p_action = 'approve' then
    if p_visibility is not null and public.scope_width(p_visibility) > public.scope_width(v_rec.requested_visibility) then
      return 'wider_than_requested';
    end if;
    if p_visibility = 'self' then return 'bad_scope'; end if;
    update public.records
       set status = 'approved', visibility = coalesce(p_visibility, v_rec.requested_visibility),
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;
  elsif p_action in ('hide', 'reject') then
    update public.records
       set status = case p_action when 'hide' then 'hidden' else 'rejected' end,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;
  else
    raise exception 'bad_action' using errcode = '22023';
  end if;
  insert into public.moderation_log (actor, record_id, action, detail)
  values (auth.uid(), p_id, p_action, jsonb_build_object('visibility', p_visibility));
  return 'ok';
end $$;

-- ───────────────────────────── 도장
create table public.stamps (
  user_id uuid not null references auth.users (id) on delete cascade,
  item text not null check (item ~ '^[a-z0-9:-]{2,48}$'),
  source text not null default 'visit' check (source in ('visit', 'record', 'game', 'qr', 'remote')),
  earned_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.stamps enable row level security;
create policy stamps_own_select on public.stamps for select to authenticated using (user_id = (select auth.uid()));

-- 같은 요청이 두 번 와도 도장은 한 번만.
create or replace function public.earn_room_stamp(p_room text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_guest() then return false; end if;
  if not exists (select 1 from public.rooms where slug = p_room and door_state = 'open') then return false; end if;
  insert into public.stamps (user_id, item, source) values (auth.uid(), 'room:' || p_room, 'visit')
  on conflict do nothing;
  return found;
end $$;

-- ───────────────────────────── 모두의 진행도 (석등). 개수만 세므로 승인 전에도 반응한다.
create or replace function public.lantern() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'lit', count(*) filter (where status in ('submitted', 'approved')),
    'today', count(*) filter (where created_at >= ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul'))
  ) from public.records
$$;

-- ───────────────────────────── 권한 정리
-- Supabase는 public 스키마 함수에 기본 EXECUTE를 준다. 필요한 것만 다시 연다.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.role_rank(text), public.scope_visible(text, text), public.scope_width(text),
  public.hash_code(text), public.jwt_email(), public.jwt_is_google(),
  public.my_roster(), public.my_role(), public.is_guest(), public.is_family(), public.is_admin()
  to anon, authenticated;
grant execute on function public.whoami(), public.room_records(text, int), public.lantern(),
  public.withdraw_by_receipt(text) to anon, authenticated;
grant execute on function public.sync_my_roster(), public.claim_invite(text), public.request_entry(text, text),
  public.my_records(), public.withdraw_record(uuid), public.attach_receipt(uuid, text),
  public.earn_room_stamp(text), public.moderate_record(uuid, text, text),
  public.admin_create_invite(uuid, text, int),
  public.admin_resolve_request(uuid, text, uuid, text, text, text)
  to authenticated;

-- anon은 테이블을 직접 만질 일이 없다(방 문패만 읽는다).
revoke all on public.roster, public.invites, public.entry_requests, public.profiles,
  public.records, public.moderation_log, public.stamps from anon;
