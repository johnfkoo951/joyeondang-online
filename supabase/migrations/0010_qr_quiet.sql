-- 0010 현장 QR 도장과 조용 모드(2026-11-10). 기획서 7.1 당일 흐름, 7.2 현장 QR 원칙.
--
-- QR 도장
--   1. QR은 도장 표식일 뿐 입장권이 아니다. 이미 들어온 명단 손님에게만 작동하고, 정해 둔 시간 창 안에서만 쓴다.
--   2. QR에는 방 slug와 짧은 코드만 담는다. 위치·GPS 확인은 하지 않고, 찍은 사람의 위치도 받지 않는다.
--   3. 코드 원문을 그대로 저장한다(초대 코드처럼 해시하지 않는다). 현장에 놓인 카드에 인쇄되어
--      그 자리의 누구나 찍을 수 있는 값이라 비밀이 아니고, 원문이 있어야 집주인이 같은 카드를 다시 인쇄할 수 있다.
--      막는 것은 코드가 아니라 명단 확인(로그인한 손님만)과 시간 창, 거두기(revoked_at)다.
--
-- 조용 모드(공통 세션 20분)
--   4. 한 줄짜리 표(site_state)에 「언제까지 조용히」와 박수 수만 둔다. 누구나 지금 상태를 읽고(site_now),
--      켜고 끄는 것은 집주인만, 박수는 명단 손님만 조용 모드 동안 한 사람 2초에 한 번.
--
-- 0001·0002·0008의 정책·함수·트리거는 건드리지 않는다.

-- ───────────────────────────── QR 표식
create table public.qr_marks (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.rooms (slug),
  code text not null unique check (code ~ '^[A-Z0-9]{8,24}$'),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  label text check (label is null or char_length(label) <= 40),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint qr_marks_window check (valid_until > valid_from)
);
alter table public.qr_marks enable row level security;
-- 목록은 집주인만 본다. 만들기·거두기는 아래 함수로만(insert/update/delete 정책 없음).
create policy qr_marks_admin_select on public.qr_marks for select to authenticated using ((select public.is_admin()));

-- 표식 코드 정규화(초대 코드와 같은 규칙: 하이픈·공백 없애고 대문자)
create or replace function public.qr_norm(p_code text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- 현장에서 QR을 찍은 손님이 부른다.
-- 결과: {ok:true, room, first} 또는 {ok:false, reason: login | not_guest | invalid | not_now | closed}
create or replace function public.earn_qr_stamp(p_room text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mark public.qr_marks;
  v_first boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'login'); end if;
  if not public.is_guest() then return jsonb_build_object('ok', false, 'reason', 'not_guest'); end if;
  select * into v_mark from public.qr_marks where code = public.qr_norm(p_code);
  if not found or v_mark.room_slug is distinct from p_room or v_mark.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if now() < v_mark.valid_from or now() >= v_mark.valid_until then
    return jsonb_build_object('ok', false, 'reason', 'not_now', 'room', p_room);
  end if;
  if not exists (select 1 from public.rooms where slug = p_room and door_state = 'open') then
    return jsonb_build_object('ok', false, 'reason', 'closed', 'room', p_room);
  end if;
  insert into public.stamps (user_id, item, source) values (auth.uid(), 'qr:' || p_room, 'qr')
  on conflict do nothing;
  v_first := found;
  -- 현장 도장을 받으면 그 방에 다녀간 도장도 함께(이미 있으면 그대로)
  insert into public.stamps (user_id, item, source) values (auth.uid(), 'room:' || p_room, 'visit')
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'room', p_room, 'first', v_first);
end $$;

-- 집주인: 표식 만들기. 코드는 서버(TypeScript makeCode)가 만들어 넘긴다.
create or replace function public.admin_make_qr(
  p_room text, p_code text, p_from timestamptz, p_until timestamptz, p_label text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if char_length(public.qr_norm(p_code)) < 10 then raise exception 'code_too_short' using errcode = '22023'; end if;
  if p_from is null or p_until is null or p_until <= p_from then raise exception 'bad_window' using errcode = '22023'; end if;
  insert into public.qr_marks (room_slug, code, valid_from, valid_until, label)
  values (p_room, public.qr_norm(p_code), p_from, p_until, nullif(left(btrim(coalesce(p_label, '')), 40), ''))
  returning id into v_id;
  return v_id;
end $$;

-- 집주인: 표식 거두기(지우지 않고 표시만, 같은 코드를 다시 쓰지 않게)
create or replace function public.admin_revoke_qr(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  update public.qr_marks set revoked_at = now() where id = p_id and revoked_at is null;
  return found;
end $$;

-- ───────────────────────────── 조용 모드와 원격 박수
create table public.site_state (
  id boolean primary key default true check (id),
  quiet_until timestamptz,
  claps int not null default 0 check (claps >= 0),
  updated_at timestamptz not null default now()
);
alter table public.site_state enable row level security;
-- 정책 없음: 읽기는 site_now(), 바꾸기는 admin_set_quiet()·clap()만.
insert into public.site_state (id) values (true) on conflict (id) do nothing;

-- 박수 속도 제한: 한 사람 마지막 박수 때만 둔다
create table public.clap_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.clap_seen enable row level security;

-- 누구나: 지금 조용 모드인가, 언제까지, 박수 몇 번
create or replace function public.site_now() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
       'quiet', coalesce(s.quiet_until > now(), false),
       'until', case when s.quiet_until > now() then s.quiet_until end,
       'claps', s.claps)
     from public.site_state s where s.id),
    jsonb_build_object('quiet', false, 'until', null, 'claps', 0))
$$;

-- 집주인: p_minutes분 동안 조용 모드(1~60분으로 맞춘다). 0 이하면 끈다.
-- 꺼진 상태에서 켤 때만 박수를 0으로 되돌린다(켜 둔 채 시간을 늘리면 박수는 그대로).
create or replace function public.admin_set_quiet(p_minutes int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  insert into public.site_state (id) values (true) on conflict (id) do nothing;
  if coalesce(p_minutes, 0) <= 0 then
    update public.site_state set quiet_until = null, updated_at = now() where id;
  else
    update public.site_state
       set claps = case when quiet_until is null or quiet_until <= now() then 0 else claps end,
           quiet_until = now() + make_interval(mins => least(greatest(p_minutes, 1), 60)),
           updated_at = now()
     where id;
  end if;
  return public.site_now();
end $$;

-- 명단 손님: 조용 모드 동안 박수 한 번. 2초 안에 다시 누르거나 조용 모드가 아니면 세지 않고 지금 수만 돌려준다.
create or replace function public.clap() returns int
language plpgsql security definer set search_path = '' as $$
declare v_total int;
begin
  if auth.uid() is null or not public.is_guest() then raise exception 'not_guest' using errcode = '42501'; end if;
  if not exists (select 1 from public.site_state where id and quiet_until > now()) then
    return coalesce((select claps from public.site_state where id), 0);
  end if;
  insert into public.clap_seen (user_id, at) values (auth.uid(), now())
  on conflict (user_id) do update set at = excluded.at
    where public.clap_seen.at <= now() - interval '2 seconds';
  if not found then
    return coalesce((select claps from public.site_state where id), 0);
  end if;
  update public.site_state set claps = least(claps + 1, 1000000) where id returning claps into v_total;
  return coalesce(v_total, 0);
end $$;

-- ───────────────────────────── 권한 정리
revoke all on public.qr_marks, public.site_state, public.clap_seen from anon;
revoke all on public.site_state, public.clap_seen from authenticated;
revoke insert, update, delete on public.qr_marks from authenticated;

revoke execute on function public.qr_norm(text), public.earn_qr_stamp(text, text),
  public.admin_make_qr(text, text, timestamptz, timestamptz, text), public.admin_revoke_qr(uuid),
  public.site_now(), public.admin_set_quiet(int), public.clap()
  from public, anon, authenticated;

grant execute on function public.site_now() to anon, authenticated;
grant execute on function public.earn_qr_stamp(text, text),
  public.admin_make_qr(text, text, timestamptz, timestamptz, text), public.admin_revoke_qr(uuid),
  public.admin_set_quiet(int), public.clap()
  to authenticated;
