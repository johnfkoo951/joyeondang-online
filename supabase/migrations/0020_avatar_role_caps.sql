-- 조연당 온라인 0020: 사진 캐릭터 하루 한도를 역할마다(2026-11-11)
--
-- 무엇을·왜
--   하루(한국 시간) 한 사람 3장, 시도 8번은 누구에게나 같았다. 집주인이 시험하다 3장에서 막혔다.
--   집주인 요청으로 한도를 명단의 역할마다 다르게 한다.
--   1. 관리자: 하루 장수와 시도 수에 제한이 없고, 모두의 하루 상한(사이트가 넘겨 주는 p_total_cap)도 보지 않는다.
--      가족: 하루 20장, 시도 42번. 손님: 하루 10장, 시도 22번. 시도 수는 장수 × 2 + 2(전의 3장 → 8번과 같은 규칙).
--      숫자는 아래 avatar_limits() 한곳에 있다. 바꾸려면 그 함수만 다시 올리면 된다.
--   2. avatar_quota()가 이 세션의 역할(명단 줄)로 한도를 골라 함께 돌려준다:
--        cap(하루 장수, 제한 없으면 null), attempt_cap(시도 수, 제한 없으면 null), total_exempt(모두의 상한을 보지 않는가).
--      used·attempts·kept·slots는 0019 그대로다. 예전의 고정값 per_user(3)·attempts_max(8)는 뺀다(읽는 곳이 없다).
--   3. 모두의 셈(total)은 상한을 보는 역할이 만든 것만 센다. 표에서 total_exempt인 역할(관리자)이 만든 것은 세지 않는다:
--      관리자는 상한에 막히지도 않고 남의 몫을 쓰지도 않는다(집주인이 시험으로 많이 만들어도 손님·가족이 막히지 않게).
--      역할은 그 사람이 지금 묶인 명단 줄(claimed_by, 한 사람에 한 줄)로 본다. 묶인 줄이 없거나 빠진 줄이면 손님으로 센다.
--      역할이 바뀌면 그날 만든 것도 새 역할로 센다(관리자에서 손님이 되면 그날 만든 것이 모두의 셈에 든다).
--      줄에 서기 전에 지운 것(status deleted, queued_at 없음: 사진을 올리지도 그리지도 않았다)도 모두의 셈에는 들지 않는다.
--      avatar_begin을 직접 부르고 바로 지우기를 되풀이해 남의 몫을 채우지 못하게 한다. 내 장수(used)와 시도에는 그대로 센다.
--   4. avatar_begin()을 같은 시그니처로 다시 정의한다. 한도는 avatar_quota()가 고른 값만 쓴다: 역할은 세션(auth.uid())의
--      명단 줄에서만 오고, 부르는 쪽이 넘기는 값으로는 장수·시도 수를 늘릴 수 없다. 넘겨받는 값은 0003부터 있던
--      모두의 상한(p_total_cap, 사이트가 환경 변수 값을 넘긴다) 하나뿐이다.
--      확인 순서(내 장수 → 내 시도 → 모두의 상한 → 칸), 칸 셋(관리자도 셋), 하루의 경계(한국 시간 자정)는 그대로다.
--   5. 역할 표의 한 칸이 빠지면(고치다 지운 경우) 그 한도는 0으로 본다(모르면 막는다). 제한 없음은 null로 적을 때만이다.
--      total_exempt가 빠지면 상한을 보고 모두의 셈에도 든다.
--
-- 모두의 상한(환경 변수 AVATAR_DAILY_CAP_TOTAL, 기본 150)은 그대로다. 한 사람 한도가 올라 손님 15명이나 가족 8명이면 찬다
-- (예전 3장일 때는 50명). 사람이 한꺼번에 오는 날에는 그 값을 넉넉히 올린다(운영 환경 변수라 집주인 확인 뒤에).
-- 사이트 코드는 이 파일을 올리기 전에도 돈다: 올리기 전에는 cap이 없어 사이트가 예전 숫자(3장, 시도 8번)로 미리 막는다.
-- 이 파일만 올리고 사이트가 옛것이면 사이트가 예전 숫자에서 먼저 막는다(DB는 더 넉넉하다). 둘 다 올라가야 새 한도가 된다.
-- 여러 번 올려도 된다(create or replace). 0019 뒤에 올린다(없으면 맨 앞에서 멈춘다).
-- 올린 뒤 확인(모두 읽기만 한다):
--   select public.avatar_limits();      (jsonb라 열쇠는 이 차례로 나온다)
--     → {"admin": {"per_day": null, "attempts": null, "total_exempt": true},
--        "guest": {"per_day": 10, "attempts": 22, "total_exempt": false},
--        "family": {"per_day": 20, "attempts": 42, "total_exempt": false}}
--   select has_function_privilege('authenticated', 'public.avatar_limits()', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_quota()', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_begin(boolean, int)', 'execute');      → f, t, t
--   한도는 명단의 역할(role)만 본다. 회차(slot)가 가족이어도 역할이 손님이면 손님 한도다. 입장 요청 승인과 행사 코드로
--   들어온 사람은 늘 손님이고, 관리 화면에는 역할을 바꾸는 단추가 없다. 그래서 사람마다 본다:
--   select role, slot, count(*) from public.roster where revoked_at is null group by 1, 2 order by 1, 2;
--   select r.display_name, r.role, r.slot, r.claimed_by is not null as claimed,
--          (select string_agg(x.role, ',') from public.roster x join auth.users u on u.id = x.claimed_by
--            where r.email is not null and lower(u.email) = lower(r.email) and x.id <> r.id
--              and x.revoked_at is null) as other_claimed
--     from public.roster r
--    where r.revoked_at is null and (r.role in ('admin', 'family') or r.slot = 'family')
--    order by 2, 1;
--     → 관리자 줄이 제한 없이 만들기로 한 사람들뿐인가, 가족인데 역할이 손님(guest)인 줄은 없는가.
--       other_claimed가 차 있으면 그 계정은 이미 다른 줄(그 역할)에 묶여 있어 이 줄의 한도를 받지 못한다(묶인 줄이 먼저다).
--       claimed가 f면 아직 로그인 전이다(그 구글 이메일로 처음 로그인할 때 이 줄에 묶인다).
--   사이트까지 올린 뒤에는 관리자 계정으로 /avatar를 열어 「하루 장수 제한 없이 만들 수 있어요」가 보이는지 본다.
--
-- 되돌리는 법(한 트랜잭션으로: begin; … commit;)
--   0019의 「create or replace function public.avatar_quota()」와 「… public.avatar_begin(…)」 정의, 그 아래 권한 정리
--   두 줄(revoke·grant)을 다시 올린다.
--   drop function if exists public.avatar_limits();

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.avatars') is null
     or to_regprocedure('public.my_role()') is null
     or to_regprocedure('public.is_guest()') is null
     or to_regprocedure('public.avatar_day_start()') is null
     or to_regprocedure('public.avatar_begin(boolean, integer)') is null then
    raise exception '0020_needs_0001_0003';
  end if;
  if to_regprocedure('public.avatars_slot_assign()') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = to_regclass('public.avatars') and attname = 'slot' and not attisdropped) then
    raise exception '0020_needs_0019';
  end if;
end $$;

-- ───────────────────────────── 숫자(여기만 고치면 된다)
-- 역할마다 하루(한국 시간) 만들 수 있는 장수(per_day)와 거절·실패까지 포함한 시도 수(attempts). null은 제한 없음.
-- total_exempt: 모두의 하루 상한을 보지 않고, 그 역할이 만든 것은 모두의 셈(total)에도 들지 않는다.
-- 명단 밖(visitor)은 손님 칸을 보지만 만들기는 avatar_begin이 막는다.
create or replace function public.avatar_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'guest', jsonb_build_object('per_day', 10, 'attempts', 22, 'total_exempt', false),
    'family', jsonb_build_object('per_day', 20, 'attempts', 42, 'total_exempt', false),
    'admin', jsonb_build_object('per_day', null, 'attempts', null, 'total_exempt', true)
  )
$$;

-- ───────────────────────────── 장수(0019와 같고, 역할 한도를 더한다)
-- used: 오늘 만든 장수(기다리는 것·지운 것 포함, 거절·실패 제외) / attempts: 오늘 시도 전부
-- total: 오늘 상한을 보는 역할(손님·가족)이 만든 장수(상한 밖 역할이 만든 것, 줄에 서기 전에 지운 것은 빼고)
-- kept: 지금 보관 중인 내 캐릭터 수 / slots: 칸 수(숫자 3은 src/lib/avatar/rules.ts의 SLOTS와 같아야 한다)
-- cap·attempt_cap: 이 세션의 역할의 하루 장수·시도 수(null = 제한 없음) / total_exempt: 모두의 상한을 보지 않는가
-- 역할 → 표의 열쇠: admin·family는 그대로, 그 밖(손님, 명단 밖, 묶인 줄 없음)은 guest
create or replace function public.avatar_quota() returns jsonb
language sql stable security definer set search_path = '' as $$
  with lim as (
    select public.avatar_limits() as t,
           case public.my_role() when 'admin' then 'admin' when 'family' then 'family' else 'guest' end as k
  )
  select jsonb_build_object(
    'used', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.created_at >= public.avatar_day_start()
                and a.status in ('pending', 'queued', 'drawing', 'ready', 'deleted')),
    'attempts', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.created_at >= public.avatar_day_start()),
    'total', case when public.is_guest() then
              (select count(*) from public.avatars a
                 left join public.roster r on r.claimed_by = a.user_id and r.revoked_at is null
                where a.created_at >= public.avatar_day_start()
                  and a.status in ('pending', 'queued', 'drawing', 'ready', 'deleted')
                  -- 줄에 서기 전에 지운 것(사진을 올리지도 그리지도 않았다)은 세지 않는다
                  and not (a.status = 'deleted' and a.queued_at is null)
                  -- 상한 밖 역할(표의 total_exempt)이 만든 것은 세지 않는다
                  and coalesce(lim.t -> (case r.role when 'admin' then 'admin' when 'family' then 'family' else 'guest' end)
                                     -> 'total_exempt', 'false'::jsonb) <> 'true'::jsonb)
             else 0 end,
    'kept', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.status in ('pending', 'queued', 'drawing', 'ready')),
    'slots', 3,
    -- 칸이 빠지면 0(모르면 막는다). 제한 없음은 null로 적힌 칸(JSON null)일 때만이다
    'cap', coalesce(lim.t -> lim.k -> 'per_day', '0'::jsonb),
    'attempt_cap', coalesce(lim.t -> lim.k -> 'attempts', '0'::jsonb),
    'total_exempt', coalesce(lim.t -> lim.k -> 'total_exempt', 'false'::jsonb) = 'true'::jsonb
  )
  from lim
$$;

-- 그림 만들기를 시작한다. 장수·칸 확인과 줄 만들기를 한 번에(동시에 여러 번 눌러도 넘지 않게).
-- 결과: {"ok":true,"id":...,"slot":1~3} 또는
--       {"ok":false,"reason":"not_guest|consent|user_limit|attempt_limit|total_limit|slots_full"}
-- 한도는 위 avatar_quota()가 세션의 역할로 고른 값만 쓴다. 하루 규칙을 먼저 본다: 오늘 더 만들 수 없는 사람에게 칸을
-- 비우라고 하지 않는다.
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
  if (v_q ->> 'cap') is not null and (v_q ->> 'used')::int >= (v_q ->> 'cap')::int then
    return jsonb_build_object('ok', false, 'reason', 'user_limit');
  end if;
  if (v_q ->> 'attempt_cap') is not null and (v_q ->> 'attempts')::int >= (v_q ->> 'attempt_cap')::int then
    return jsonb_build_object('ok', false, 'reason', 'attempt_limit');
  end if;
  if (v_q ->> 'total_exempt')::boolean is not true
     and (v_q ->> 'total')::int >= greatest(coalesce(p_total_cap, 150), 0) then
    return jsonb_build_object('ok', false, 'reason', 'total_limit');
  end if;
  if (v_q ->> 'kept')::int >= 3 then return jsonb_build_object('ok', false, 'reason', 'slots_full'); end if;
  insert into public.avatars (user_id, status, consent_at) values (auth.uid(), 'pending', now())
  returning id, slot into v_id, v_slot;
  return jsonb_build_object('ok', true, 'id', v_id, 'slot', v_slot);
end $$;

-- ───────────────────────────── 권한 정리(0019와 같은 모양. 숫자 표는 위 함수들 안에서만 읽는다)
revoke execute on function public.avatar_limits(), public.avatar_quota(), public.avatar_begin(boolean, int)
  from public, anon, authenticated;
grant execute on function public.avatar_quota(), public.avatar_begin(boolean, int) to authenticated;
