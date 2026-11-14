-- 조연당 온라인 0019: 사진 캐릭터 칸 세 개(2026-11-11)
--
-- 무엇을·왜
--   사진 캐릭터는 하루 3장까지 만들 수 있었지만 모아 두는 수에는 한도가 없었다. 이제 한 사람이 세 개까지 보관하고,
--   걷기 화면과 「내 캐릭터」 화면에서 세 칸 가운데 하나를 골라 끼운다. 넷째를 만들려면 칸 하나를 먼저 비운다(그림 지우기).
--   1. 보관 중 = pending·queued·drawing·ready. 그리는 중인 것도 칸 하나를 차지한다. 거절·실패·지운 줄은 칸을 차지하지 않는다.
--   2. avatar_begin()을 같은 시그니처로 다시 정의한다. 하루 규칙(3장, 시도 8번, 모두의 상한)을 먼저 보고, 그다음 보관 중이
--      셋이면 'slots_full'로 거절한다(하루 장수가 다 찼는데 칸을 비우라고 하면 비워도 소용이 없다). 하루 규칙은 그대로다.
--   3. 줄마다 칸 번호(slot, 1~3)를 단다. 넣을 때 트리거가 그 사람의 비어 있는 가장 작은 번호를 준다: 칸 하나를 비우고 만들면
--      새 캐릭터가 그 자리에 들어간다. 보관 중인 줄끼리만 번호가 겹치지 않는다(부분 고유 색인). 지운 줄은 번호를 그대로 둔다.
--      이미 있는 보관 중 줄에는 만든 차례대로 비어 있는 번호를 단다. 넷 이상 모아 둔 사람의 넷째부터는 번호가 없다
--      (화면은 빈 칸이나 칸 뒤에 덧붙여 보이고, 그 사람은 보관 중이 셋보다 적어질 때까지 새로 만들지 못한다).
--   4. avatar_quota()에 보관 중 수(kept)와 칸 수(slots)를 더한다. 사이트가 사진을 올리기 전에 미리 안내한다.
--      숫자 3은 src/lib/avatar/rules.ts의 SLOTS와 같아야 한다(tests/unit/avatar-slots.test.ts가 본다).
--   5. 0003은 이미 운영에 있어 고치지 않는다. 지우기(avatar_forget, 0015·0016)와는 서로 기대지 않는다: 지운 줄은 상태가
--      deleted가 되어 칸을 차지하지 않으므로 칸 번호를 비울 필요가 없다.
--
-- 사이트 코드는 이 파일을 올리기 전에도 돈다: 올리기 전에는 kept·slot이 없어 칸 수를 미리 안내하지 않고(만들기는 그대로),
-- 칸 화면은 만든 차례대로 채운다. 올린 뒤에는 사이트가 avatar_begin의 'slots_full'을 칸 비우기 안내로 바꾼다.
-- 여러 번 올려도 된다(add column if not exists, drop … if exists, create or replace). 0001·0003 뒤에 올린다
-- (없으면 맨 앞에서 멈춘다). 0015·0016과는 순서가 상관없다.
-- 올린 뒤 확인:
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'avatars' and column_name = 'slot';                 → 1
--   select tgname from pg_trigger where tgname = 'avatars_slot_assign' and not tgisinternal;             → 한 줄
--   select user_id, count(*) from public.avatars where status in ('pending', 'queued', 'drawing', 'ready')
--    group by 1 having count(*) > 3;   → 넷 이상 모아 둔 사람(넷째부터는 번호가 없다. 지울 때까지 새로 만들지 못한다)
--   select count(*) from public.avatars where status in ('pending', 'queued', 'drawing', 'ready') and slot is null;
--     → 위 사람들의 넷째부터만큼(그 밖의 보관 중 줄은 모두 번호가 있다)
--
-- 되돌리는 법(한 트랜잭션으로: begin; … commit;)
--   0003의 「create or replace function public.avatar_quota()」와 「… public.avatar_begin(…)」 정의를 다시 올린다.
--   drop trigger if exists avatars_slot_assign on public.avatars;
--   drop function if exists public.avatars_slot_assign();
--   drop index if exists public.avatars_user_slot;
--   alter table public.avatars drop constraint if exists avatars_slot_range;
--   alter table public.avatars drop column if exists slot;

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.avatars') is null
     or to_regprocedure('public.is_guest()') is null
     or to_regprocedure('public.avatar_day_start()') is null
     or to_regprocedure('public.avatar_begin(boolean, integer)') is null then
    raise exception '0019_needs_0001_0003';
  end if;
end $$;

-- ───────────────────────────── 칸 번호
alter table public.avatars add column if not exists slot smallint;
alter table public.avatars drop constraint if exists avatars_slot_range;
alter table public.avatars add constraint avatars_slot_range check (slot is null or slot between 1 and 3);

-- 이미 있는 보관 중 줄: 번호가 없는 줄에 그 사람의 비어 있는 번호를 만든 차례대로 단다(다시 올려도 이미 단 번호는 그대로)
with kept as (
  select id, user_id, created_at, slot from public.avatars
   where status in ('pending', 'queued', 'drawing', 'ready')
),
need as (
  select id, user_id, row_number() over (partition by user_id order by created_at, id) as k
    from kept where slot is null
),
free as (
  select u.user_id, n::smallint as slot, row_number() over (partition by u.user_id order by n) as k
    from (select distinct user_id from need) u
   cross join generate_series(1, 3) n
   where not exists (select 1 from kept x where x.user_id = u.user_id and x.slot = n)
)
update public.avatars a
   set slot = f.slot
  from need, free f
 where a.id = need.id and f.user_id = need.user_id and f.k = need.k;

-- 보관 중인 줄끼리는 한 사람의 번호가 겹치지 않는다
create unique index if not exists avatars_user_slot on public.avatars (user_id, slot)
  where slot is not null and status in ('pending', 'queued', 'drawing', 'ready');

-- 넣을 때 비어 있는 가장 작은 번호를 준다(셋이 다 찼으면 비워 둔다. 만들기는 avatar_begin이 먼저 막는다).
-- 넣는 길은 avatar_begin 하나라 같은 사람의 넣기가 겹치지 않는다(그 안의 잠금). 겹쳐도 위 고유 색인이 막는다.
create or replace function public.avatars_slot_assign() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.slot is null and new.status in ('pending', 'queued', 'drawing', 'ready') then
    select min(n)::smallint into new.slot
      from generate_series(1, 3) n
     where not exists (select 1 from public.avatars a
                        where a.user_id = new.user_id and a.slot = n
                          and a.status in ('pending', 'queued', 'drawing', 'ready'));
  end if;
  return new;
end $$;
drop trigger if exists avatars_slot_assign on public.avatars;
create trigger avatars_slot_assign before insert on public.avatars
  for each row execute function public.avatars_slot_assign();

-- ───────────────────────────── 장수(0003과 같고 kept·slots를 더한다)
-- used: 오늘 만든 장수(기다리는 것·지운 것 포함, 거절·실패 제외) / attempts: 오늘 시도 전부 / total: 오늘 모두가 만든 장수
-- kept: 지금 보관 중인 내 캐릭터 수(날짜와 상관없이, 그리는 중 포함) / slots: 칸 수
create or replace function public.avatar_quota() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.created_at >= public.avatar_day_start()
                and a.status in ('pending', 'queued', 'drawing', 'ready', 'deleted')),
    'attempts', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.created_at >= public.avatar_day_start()),
    'total', case when public.is_guest() then
              (select count(*) from public.avatars a
                where a.created_at >= public.avatar_day_start() and a.status in ('pending', 'queued', 'drawing', 'ready', 'deleted'))
             else 0 end,
    'kept', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.status in ('pending', 'queued', 'drawing', 'ready')),
    'per_user', 3,
    'attempts_max', 8,
    'slots', 3
  )
$$;

-- 그림 만들기를 시작한다. 장수·칸 확인과 줄 만들기를 한 번에(동시에 여러 번 눌러도 넘지 않게).
-- 결과: {"ok":true,"id":...,"slot":1~3} 또는
--       {"ok":false,"reason":"not_guest|consent|user_limit|attempt_limit|total_limit|slots_full"}
-- 하루 규칙을 먼저 본다: 오늘 더 만들 수 없는 사람에게 칸을 비우라고 하지 않는다.
create or replace function public.avatar_begin(p_consented boolean, p_total_cap int default 150) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_q jsonb;
  v_id uuid;
  v_slot smallint;
begin
  if auth.uid() is null or not public.is_guest() then
    return jsonb_build_object('ok', false, 'reason', 'not_guest');
  end if;
  if p_consented is not true then return jsonb_build_object('ok', false, 'reason', 'consent'); end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_begin'));
  v_q := public.avatar_quota();
  if (v_q ->> 'used')::int >= 3 then return jsonb_build_object('ok', false, 'reason', 'user_limit'); end if;
  if (v_q ->> 'attempts')::int >= 8 then return jsonb_build_object('ok', false, 'reason', 'attempt_limit'); end if;
  if (v_q ->> 'total')::int >= greatest(coalesce(p_total_cap, 150), 0) then
    return jsonb_build_object('ok', false, 'reason', 'total_limit');
  end if;
  if (v_q ->> 'kept')::int >= 3 then return jsonb_build_object('ok', false, 'reason', 'slots_full'); end if;
  insert into public.avatars (user_id, status, consent_at) values (auth.uid(), 'pending', now())
  returning id, slot into v_id, v_slot;
  return jsonb_build_object('ok', true, 'id', v_id, 'slot', v_slot);
end $$;

-- ───────────────────────────── 권한 정리(0003과 같다. 트리거 함수는 아무도 직접 부르지 않는다)
revoke execute on function public.avatar_quota(), public.avatar_begin(boolean, int), public.avatars_slot_assign()
  from public, anon, authenticated;
grant execute on function public.avatar_quota(), public.avatar_begin(boolean, int) to authenticated;
