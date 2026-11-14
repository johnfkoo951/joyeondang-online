-- 0025: 아이 사진의 보호자 동의(사진 캐릭터)
--
-- 집주인 결정(2026-11-12): 「아이 사진의 경우 보호자의 동의를 완료하였다는 체크박스 받고 모두가 해볼 수 있게」.
-- 지금까지는 사진 살피기(일꾼의 비전 모델)가 만 14세 미만으로 보이면 무조건 그리지 않았다(reason 'child').
-- 이제 올리는 화면이 「누구 사진이에요?」에서 「아이예요(만 14세 미만)」와 보호자 동의를 받으면 그 그림 줄에 동의 때를 적고,
-- 일꾼은 아이로 보여도 그린다. 집주인(명단 role admin)의 사진도 아이로 잘못 보일 때 막지 않는다(본인 사진이 막힌 일).
-- 사람 수·사람 사진인지·애매함 검사는 그대로다(아이 판정만 넘긴다).
--
--   1. avatars.guardian_at  보호자 동의를 받은 때(올리는 화면이 아이를 고르고 보호자 동의에 체크했을 때만). 없으면 null
--   2. avatar_guardian_agree(id) → boolean  올린 사람 본인만, 그 그림이 아직 올리는 중(pending)일 때만 한 번 적는다
--      (그리기 줄에 세운 뒤에는 바꿀 수 없다). 명단 밖·로그인 안 한 사람은 false
--   3. avatar_child_ok(id) → boolean  일꾼(service_role)만: 그 그림을 아이로 보여도 그려도 되는가
--      (보호자 동의가 적혔거나, 그림 주인이 지금 명단의 집주인)
--
-- 앞선 마이그레이션: 0003(avatars), 0015(avatar_views_agree, is_guest). 없으면 아무것도 바꾸지 않고 멈춘다. 여러 번 올려도 된다.
-- 내보내는 순서: 0025 → 일꾼(avatar_child_ok를 묻는 판) → 사이트(누구 사진인지 고르는 화면). 사이트가 먼저 나가면 아이 사진은
-- 보호자 동의를 적지 못해 올리지 않는다(화면이 잠시 뒤에 다시 해 달라고 알린다). 일꾼이 늦으면 아이로 보이는 사진은 지금처럼 막힌다.
--
-- 올린 뒤 확인(읽기만):
--   select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'avatars'
--      and column_name = 'guardian_at';                                                                       → 1
--   select has_function_privilege('authenticated', 'public.avatar_guardian_agree(uuid)', 'execute'),
--          has_function_privilege('anon', 'public.avatar_guardian_agree(uuid)', 'execute'),
--          has_function_privilege('service_role', 'public.avatar_child_ok(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_child_ok(uuid)', 'execute');              → t, f, t, f
--   select count(*) from public.avatars where guardian_at is not null;                                        → 보호자 동의로 올린 그림 수
--
-- 되돌리는 법(사이트와 일꾼을 먼저 되돌린 뒤):
--   drop function if exists public.avatar_child_ok(uuid);
--   drop function if exists public.avatar_guardian_agree(uuid);
--   alter table public.avatars drop column if exists guardian_at;

do $$
begin
  if to_regclass('public.avatars') is null or to_regprocedure('public.avatar_views_agree(uuid)') is null
     or to_regprocedure('public.is_guest()') is null then
    raise exception '0025_needs_0015';
  end if;
end $$;

alter table public.avatars add column if not exists guardian_at timestamptz;

-- 올리는 화면이 아이를 고르고 보호자 동의에 체크했을 때 사이트가 부른다(올린 사람의 세션). 그리기 줄에 세우기 전(pending)에만
create or replace function public.avatar_guardian_agree(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_guest() then return false; end if;
  update public.avatars set guardian_at = now()
   where id = p_id and user_id = auth.uid() and status = 'pending' and guardian_at is null;
  return found;
end $$;
revoke all on function public.avatar_guardian_agree(uuid) from public, anon;
grant execute on function public.avatar_guardian_agree(uuid) to authenticated;

-- 일꾼이 사진 살피기 전에 묻는다: 아이로 보여도 그려도 되는가(보호자 동의가 적혔거나 주인이 지금 명단의 집주인)
create or replace function public.avatar_child_ok(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.avatars a
     where a.id = p_id
       and (a.guardian_at is not null
            or exists (select 1 from public.roster r
                        where r.claimed_by = a.user_id and r.revoked_at is null and r.role = 'admin'))
  )
$$;
revoke all on function public.avatar_child_ok(uuid) from public, anon, authenticated;
grant execute on function public.avatar_child_ok(uuid) to service_role;
