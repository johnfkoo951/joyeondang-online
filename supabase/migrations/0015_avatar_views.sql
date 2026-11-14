-- 조연당 온라인 0015: 사진 캐릭터의 방향 그림 묶음(걷기용)
--
-- 무엇을·왜
--   사진 캐릭터는 그림 한 장을 세운 판이라 3D 집 안에서 혼자 평평해 보였다. 다 그린 캐릭터 그림(ready)으로
--   다섯 방향(앞, 앞 비스듬, 옆, 뒤 비스듬, 뒤)을 한 줄에 담은 그림 묶음을 한 번 더 그려 두고, 걷기 엔진이
--   보는 자리에 맞는 방향을 골라 쓴다. 이 파일은 그 묶음의 대기열·권한·지우기를 더한다.
--
-- 원칙
--   1. 묶음은 캐릭터 그림에서 나온 파생 그림이다. 비공개 버킷 avatars의 <uid>/views/<id>.v1l.webp(큰 것)와
--      <uid>/views/<id>.v1s.webp(작은 것) 두 파일. 일꾼(비밀 키, service_role)만 올리고 명단 손님끼리만 본다.
--   2. 그림을 지우면 묶음도 지운다. 사이트가 두 파일을 그림과 함께 먼저 지우고, avatar_forget()이 칸을 모두 비운
--      다음, 사이트가 두 파일을 한 번 더 지운다(첫 지우기와 칸 비우기 사이에 일꾼이 막 올렸을 수 있다).
--      묶음 칸은 ready인 그림에만 값을 가질 수 있다(avatars_views_need_image): 칸을 비우지 않고 그림만 지우는
--      길이 나중에 생기면 조용히 남지 않고 그 자리에서 멈춘다.
--   3. 대기열은 표를 따로 두지 않고 avatars의 칸으로 한다. views_status: null(아직 안 그림) → drawing → ready | failed.
--      지금 걷기에 쓰는 캐릭터만 그린다: 걷기 화면이 그리는 겉모습(profiles.look, 0006)이 사진이고 그 주소가 이 그림일 때.
--      (profiles.avatar_id는 보지 않는다. 걷기 화면은 look만 쓴다.) 고르다 만 캐릭터와 지울 캐릭터에 그리기 수를 쓰지 않는다.
--      그리고 여러 방향 그림까지 동의한 그림(views_consent_at)만 그린다: 묶음을 그리려면 캐릭터 그림을 바깥 그림 서비스로
--      한 번 더 보내야 한다. 그 안내를 보고 동의한 때를 avatar_views_agree()가 적는다(사이트가 사진을 올릴 때 부른다).
--      안내가 나가기 전에 만든 캐릭터는 값이 없어 줄에 서지 않는다(말없이 한 번 더 보내지 않는다).
--      다른 캐릭터로 바꿔 걸으면 그 캐릭터가 그때 줄에 선다(동의한 때가 있는 것만. 아래 동의 줄 참고). 일꾼이 한가할 때 새것부터 채운다.
--      몇 번까지 다시 그릴지는 일꾼이 정한다(돌려놓은 줄은 때가 되면 다시 잡힌다). 시트가 이상해서 돌려놓은 횟수는
--      views_sheet_fails에 따로 센다(프록시가 멈춘 사이 쓴 횟수가 시트 실패의 한도를 깎지 않게). DB는 일꾼이 멈춰
--      임대가 끝난 것을 여덟 번에서 끊고, 열 번을 마지막 울타리로 둔다(일꾼이 잘못돼도 한 그림을 끝없이 다시 그려
--      그리기 값을 쓰지 않게).
--      임대 길이는 줄에 적지 않고 잡으러 온 쪽의 인자로 잰다: 일꾼들은 같은 임대 길이를 쓴다. 상태를 보려고
--      avatar_views_claim()을 부르지 않는다(줄을 잡아 버린다. 상태는 맨 위의 select로 본다).
--   4. 그리는 사이 본인이 그림을 지웠으면 avatar_views_settle()이 false를 돌려준다. 일꾼은 올린 파일을 거둔다.
--      일꾼이 거두기 직전에 멈추면 지운 그림의 묶음 파일이 저장소에 남는다. avatar_views_strays()가 그런 파일
--      (그림이 지워졌거나 줄이 없는 묶음 파일)의 이름을 골라 준다. 비밀 키로 불러 저장소에서 지운다.
--   5. 0003은 이미 운영에 올라가 있어 고치지 않는다. avatar_forget()만 여기서 같은 시그니처로 다시 정의한다.
--   6. 사이트 코드는 이 파일을 올리기 전에도 뒤에도 돈다: 올리기 전에는 /api/avatar/<id>/views가 404라 걷기 엔진이
--      그림 한 장으로 걷고, 지우기는 없는 파일을 지우려다 그냥 지나간다. 일꾼은 함수가 없으면 방향 그림만 쉬고
--      한 장 그리기는 그대로 한다.
--
-- 내보내는 순서: 사이트(지우기가 묶음 파일도 함께 지운다)를 먼저 내보내고, 이 파일을 올린 다음, 새 일꾼을 켠다.
-- 옛 사이트가 도는 사이에 일꾼이 묶음을 그리면, 그림을 지울 때 묶음 파일이 저장소에 남는다
-- (그때는 avatar_views_strays()로 찾아 지운다).
--
-- 여러 번 올려도 된다(add column if not exists, create or replace, drop … if exists). 0001·0003·0006 뒤에 올린다
-- (없으면 맨 앞에서 멈춘다). 0014와는 서로 기대지 않는다. 올리는 역할은 저장소 표의 모든 줄을 볼 수 있어야 한다
-- (남은 파일 찾기가 그 권한으로 읽는다. Supabase의 postgres는 그렇다. 아니면 맨 앞에서 멈춘다).
-- 올린 뒤 확인:
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'avatars' and column_name like 'views\_%';          → 10
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and proname like 'avatar\_views\_%' order by 1;                                                   → 일곱 줄
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
--      and policyname = 'avatars_guest_select_views';                                                    → 한 줄
--   select has_function_privilege('authenticated', 'public.avatar_views_claim(text, int)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_views_path(uuid, text)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_views_agree(uuid)', 'execute');        → f, t, t
--   select views_status, count(*) from public.avatars where status = 'ready' group by 1;
--      → 처음에는 모두 null. 일꾼이 돌면 ready(또는 failed)로 채워진다
--   select * from public.avatar_views_strays(100);
--      → 지운 그림의 묶음 파일 이름(없어야 정상). 있으면 비밀 키로 저장소에서 지운다(표에서 바로 지우지 않는다)
-- 안내가 나가기 전에 만든 캐릭터에도 여러 방향 그림을 그리기로 정했다면(그 결정을 개인정보 화면에 적은 뒤에):
--   update public.avatars set views_consent_at = now() where status = 'ready' and views_consent_at is null;
-- 한 그림을 다시 그리게 하려면(failed로 굳은 것): 잡은 횟수도 함께 되돌린다
--   update public.avatars set views_status = null, views_attempts = 0, views_sheet_fails = 0, views_reason = null, views_not_before = null
--    where id = '…' and status = 'ready';   -- 저장소의 옛 파일은 일꾼이 새로 올리며 덮는다
--
-- 되돌리는 법(한 트랜잭션으로 한다: begin; … commit;. 한 줄씩 따로 하면 그사이 그림 지우기가 실패한다)
--   drop policy if exists avatars_guest_select_views on storage.objects;
--   drop function if exists public.avatar_views_claim(text, int), public.avatar_views_release(uuid, text, int, boolean),
--     public.avatar_views_settle(uuid, text, text, text, text, text), public.avatar_views_path(uuid, text),
--     public.avatar_views_readable(text), public.avatar_views_strays(int), public.avatar_views_agree(uuid);
--   alter table public.avatars drop constraint if exists avatars_views_need_image;
--     (0003의 지우기는 묶음 칸을 비우지 않는다. 이 제약이 남아 있으면 묶음이 있는 그림을 지울 수 없다)
--   0003의 「create or replace function public.avatar_forget(…)」 정의를 다시 올린다(묶음 칸을 지우기 전에:
--     칸을 먼저 지우면 이 파일의 avatar_forget이 없는 칸을 찾다가 모든 지우기를 막는다).
--   drop index if exists public.avatars_views_queue, public.avatars_views_drawing;
--   alter table public.avatars drop column if exists views_status, drop column if exists views_attempts,
--     drop column if exists views_claimed_at, drop column if exists views_not_before, drop column if exists views_worker,
--     drop column if exists views_mode, drop column if exists views_model, drop column if exists views_reason,
--     drop column if exists views_sheet_fails, drop column if exists views_consent_at;
--   저장소의 */views/* 파일은 따로 지운다(일꾼의 비밀 키로, 또는 저장소 화면에서).

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.avatars') is null or to_regclass('storage.objects') is null
     or to_regprocedure('public.is_guest()') is null
     or to_regprocedure('public.avatar_worker_beat(text, text)') is null
     or to_regprocedure('public.avatar_forget(uuid, text)') is null then
    raise exception '0015_needs_0001_0003';
  end if;
  -- 줄을 고르는 조건이 겉모습 칸(profiles.look, 0006)을 읽는다. 없으면 잡을 때마다 오류가 난다
  -- (information_schema는 권한이 있는 칸만 보여 주므로 pg_catalog로 본다)
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = to_regclass('public.profiles') and attname = 'look' and not attisdropped) then
    raise exception '0015_needs_0006';
  end if;
  -- 남은 파일 찾기는 올리는 역할의 권한으로 저장소 표를 읽는다. 줄이 가려지는 역할이면 남은 파일을 조용히 놓친다
  if not exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception '0015_needs_role_that_reads_all_storage_rows';
  end if;
end $$;

-- ───────────────────────────── 묶음 칸(대기열 겸 기록)
--   views_status      null(아직 안 그림) | drawing | ready | failed
--   views_attempts    잡은 횟수(열 번이 마지막 울타리. 그 전에 일꾼이 ready나 failed로 정리한다)
--   views_sheet_fails 그 가운데 시트가 이상해서(사람이 다섯이 아님 등) 돌려놓은 횟수. 일꾼이 세 번에서 그만둔다
--   views_claimed_at  지금 잡은 때, views_worker 잡은(또는 그린) 일꾼, views_not_before 다시 잡을 수 있는 때
--   views_mode        full(다섯 방향을 모두 가림) | frontback(옆 방향을 못 가려 앞뒤 그림으로 채움)
--   views_model       그린 모델, views_reason 실패 까닭
--   views_consent_at  여러 방향 그림까지 동의한 때(없으면 그리지 않는다). 동의의 기록이라 그림을 지워도 남긴다
alter table public.avatars
  add column if not exists views_status text,
  add column if not exists views_attempts int not null default 0,
  add column if not exists views_sheet_fails int not null default 0,
  add column if not exists views_claimed_at timestamptz,
  add column if not exists views_not_before timestamptz,
  add column if not exists views_worker text,
  add column if not exists views_mode text,
  add column if not exists views_model text,
  add column if not exists views_reason text,
  add column if not exists views_consent_at timestamptz;

alter table public.avatars
  drop constraint if exists avatars_views_status_known,
  drop constraint if exists avatars_views_attempts_range,
  drop constraint if exists avatars_views_sheet_fails_range,
  drop constraint if exists avatars_views_worker_shape,
  drop constraint if exists avatars_views_mode_known,
  drop constraint if exists avatars_views_model_shape,
  drop constraint if exists avatars_views_reason_shape,
  drop constraint if exists avatars_views_need_image,
  drop constraint if exists avatars_views_drawing_has_claim;
alter table public.avatars
  add constraint avatars_views_status_known
    check (views_status is null or views_status in ('drawing', 'ready', 'failed')),
  add constraint avatars_views_attempts_range check (views_attempts between 0 and 10),
  add constraint avatars_views_sheet_fails_range check (views_sheet_fails between 0 and 10),
  add constraint avatars_views_worker_shape
    check (views_worker is null or views_worker ~ '^[A-Za-z0-9._-]{1,40}$'),
  add constraint avatars_views_mode_known check (views_mode is null or views_mode in ('full', 'frontback')),
  add constraint avatars_views_model_shape
    check (views_model is null or views_model ~ '^[A-Za-z0-9._:-]{1,64}$'),
  add constraint avatars_views_reason_shape check (views_reason is null or views_reason ~ '^[a-z_]{1,32}$'),
  -- 묶음은 ready인 그림에만 있다. 그림을 지우는 길은 반드시 묶음 칸도 비워야 한다(avatar_forget이 그렇게 한다)
  add constraint avatars_views_need_image
    check (views_status is null or (status = 'ready' and image_path is not null)),
  -- 잡은 줄에는 잡은 때와 일꾼이 있다(없으면 임대가 끝나도 되돌릴 수 없다)
  add constraint avatars_views_drawing_has_claim
    check (views_status is distinct from 'drawing' or (views_claimed_at is not null and views_worker is not null));

-- 잡을 차례를 찾는 색인(새것부터)과 임대가 끝난 것을 찾는 색인. 일꾼이 몇 초마다 묻는다
create index if not exists avatars_views_queue on public.avatars (created_at desc)
  where status = 'ready' and views_status is null;
create index if not exists avatars_views_drawing on public.avatars (views_claimed_at)
  where views_status = 'drawing';

-- ───────────────────────────── 동의(본인)
-- 여러 방향 그림까지 동의했다고 적는다. 본인 그림에만, 처음 적은 때를 그대로 둔다. 사이트는 사진을 올리는 화면이
-- 「여러 방향 그림을 그릴 때 캐릭터 그림이 같은 서비스로 한 번 더 보내진다」는 안내를 보여 줬을 때만 부른다
-- (옛 화면을 열어 둔 채 올린 사진에는 부르지 않는다). 지운 그림과 실패한 그림에는 적지 않는다.
create or replace function public.avatar_views_agree(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_guest() then return false; end if;
  update public.avatars set views_consent_at = coalesce(views_consent_at, now())
   where id = p_id and user_id = auth.uid() and status in ('pending', 'queued', 'drawing', 'ready');
  return found;
end $$;

-- ───────────────────────────── 대기열(일꾼 전용, service_role)
-- 일꾼이 묶음 그릴 그림 하나를 잡는다. 여러 일꾼이 동시에 불러도 한 그림을 둘이 잡지 않는다(skip locked).
-- 여러 방향 그림까지 동의한 그림(views_consent_at) 가운데,
-- 지금 누군가 걷기에 쓰는 캐릭터(그 사람의 profiles.look이 가리키는 사진)만 잡는다: 하루 세 장 안에서 고르다 만 캐릭터와 곧 지울 캐릭터에
-- 그리기 수를 쓰지 않는다. 다른 캐릭터를 골라 걸으면 그 캐릭터가 그때 잡힌다.
-- 결과: null(할 일 없음) 또는 {id, user_id, image_path, attempts, sheet_fails}. 살아 있음(avatar_worker_beat)도 남긴다.
create or replace function public.avatar_views_claim(p_worker text, p_lease_seconds int default 600) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 600), 60));
begin
  perform public.avatar_worker_beat(p_worker);
  -- 임대가 끝난 것(일꾼이 도중에 멈춤): 여덟 번 잡았으면 failed(timeout), 아니면 다시 잡을 수 있게 비운다.
  -- 여덟은 일꾼이 프록시 쪽 실패를 기다려 주는 횟수와 같다(worker/avatar/views.mjs의 VIEWS_MAX_OUTAGE_ATTEMPTS):
  -- 그보다 작으면 프록시가 멈춘 사이 여러 번 돌려놓인 줄이 일꾼이 한 번 멈춘 것만으로 굳는다
  update public.avatars
     set views_status = case when views_attempts >= 8 then 'failed' end,
         views_reason = case when views_attempts >= 8 then 'timeout' end,
         views_claimed_at = null, views_worker = null, views_not_before = null
   where views_status = 'drawing' and views_claimed_at < now() - v_lease;
  loop
    -- 가장 새것부터
    select * into v from public.avatars
     where status = 'ready' and image_path is not null and views_status is null
       and (views_not_before is null or views_not_before <= now())
       and views_consent_at is not null
       and exists (select 1 from public.profiles p
                    where p.user_id = public.avatars.user_id and p.look ->> 'kind' = 'photo'
                      and p.look ->> 'url' = '/api/avatar/' || public.avatars.id::text)
     order by created_at desc, id desc limit 1 for update skip locked;
    if not found then return null; end if;
    exit when v.views_attempts < 10;
    -- 마지막 울타리: 열 번을 잡고도 끝나지 않은 줄은 failed로 굳히고 다음 줄을 본다(숫자는 avatars_views_attempts_range와 같다).
    -- 여기까지 오는 것은 일꾼이 잘못됐을 때뿐이다. 굳히지 않으면 이 줄이 맨 앞에 남아 잡을 때마다 열한 번째에서 멈춘다
    update public.avatars set views_status = 'failed', views_reason = 'attempts', views_not_before = null
     where id = v.id;
  end loop;
  update public.avatars
     set views_status = 'drawing', views_attempts = views_attempts + 1, views_claimed_at = now(),
         views_worker = p_worker, views_not_before = null, views_reason = null
   where id = v.id;
  return jsonb_build_object('id', v.id, 'user_id', v.user_id, 'image_path', v.image_path,
                            'attempts', v.views_attempts + 1, 'sheet_fails', v.views_sheet_fails);
end $$;

-- 잠깐의 실패(프록시가 바쁨 등): 조금 뒤(0초~1시간) 다시 잡도록 비운다. 잡은 일꾼만 돌려놓는다.
-- p_sheet가 참이면 「시트가 이상해서」 돌려놓는 것이라 views_sheet_fails를 하나 올린다(일꾼이 세 번에서 그만둔다).
-- 그만 그릴 때는 일꾼이 avatar_views_settle('failed')로 정리한다. 돌려놓기만 되풀이하는 줄은
-- avatar_views_claim()이 열 번에서 끊는다.
create or replace function public.avatar_views_release(
  p_id uuid, p_worker text, p_delay_seconds int default 120, p_sheet boolean default false
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.avatars
     set views_status = null, views_claimed_at = null, views_worker = null,
         views_sheet_fails = least(views_sheet_fails + (case when p_sheet is true then 1 else 0 end), 10),
         views_not_before = now() + make_interval(secs => least(greatest(coalesce(p_delay_seconds, 120), 0), 3600))
   where id = p_id and views_status = 'drawing' and views_worker = p_worker;
  return found;
end $$;

-- 묶음을 다 그렸거나(ready) 그만둘 때(failed) 적는다. 파일은 일꾼이 먼저 올린 뒤에 부른다.
-- 그 그림이 아직 ready이고 잡힌 채(drawing)일 때만 적고 true(아래의 늦은 ready 하나만 예외).
-- false: 그사이 본인이 그림을 지웠다(또는 잡힌 줄이 아니다). 일꾼은 방금 올린 파일을 거둔다.
-- 함께 적는 값(방식·모델·까닭)은 모양이 낯설어도 정리를 막지 않는다: 방식·모델은 비워 두고 까닭은 'error'로 적는다.
-- 다 그린 뒤에 적는 값 하나 때문에 정리가 멈추면 일꾼이 같은 그림을 처음부터 다시 그린다(그리기 값이 든다).
-- 그만두기(failed)는 지금 잡고 있는 일꾼의 것만 받는다(p_worker를 줬을 때): 임대가 끝나 다른 일꾼이 다시 잡은 뒤에
-- 옛 일꾼의 failed가 오면 지금 그리는 줄이 굳고, 다 그려 올린 묶음이 버려진다. ready는 누가 적어도 된다
-- (방금 올린 파일이 그 자리에 있다). p_worker를 비우면 보지 않는다(손으로 정리할 때).
drop function if exists public.avatar_views_settle(uuid, text, text, text, text);
create or replace function public.avatar_views_settle(
  p_id uuid, p_status text, p_mode text default null, p_model text default null, p_reason text default null,
  p_worker text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_mode text := case when p_mode in ('full', 'frontback') then p_mode end;
  v_model text := case when p_model ~ '^[A-Za-z0-9._:-]{1,64}$' then p_model end;
  v_reason text := case when p_reason ~ '^[a-z_]{1,32}$' then p_reason else 'error' end;
begin
  -- 상태는 빈 값도 거절한다(빈 값을 적으면 누가 잡았는지 보지 않는 돌려놓기가 된다)
  if p_status is null or p_status not in ('ready', 'failed') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  select * into v from public.avatars where id = p_id for update;
  if not found or v.status <> 'ready' or v.image_path is null then return false; end if;
  if v.views_status = 'drawing' then
    if p_status = 'failed' and p_worker is not null and v.views_worker is distinct from p_worker then return false; end if;
    update public.avatars
       set views_status = p_status,
           views_mode = case when p_status = 'ready' then v_mode end,
           views_model = v_model,
           views_reason = case when p_status = 'failed' then v_reason end,
           views_claimed_at = null, views_not_before = null
     where id = p_id;
    return true;
  end if;
  -- 임대가 끝나 다른 일꾼이 다시 잡아 먼저 끝낸 뒤에 온 늦은 ready: 방금 올린 파일이 같은 자리를 덮었으므로
  -- false를 주면 일꾼이 쓰이는 파일을 지워 버린다. 어떻게 그렸는지만 새것으로 고치고 true.
  if v.views_status = 'ready' and p_status = 'ready' then
    update public.avatars set views_mode = v_mode, views_model = v_model where id = p_id;
    return true;
  end if;
  return false;
end $$;

-- 그림이 없는데 저장소에 남은 묶음 파일의 이름(그림을 지웠거나, 그런 줄이 없거나, 남의 폴더에 있는 것).
-- 일꾼이 묶음을 올린 뒤 거두기 전에 멈추거나, 옛 사이트가 그림만 지웠을 때 이런 파일이 남는다. 비밀 키로 물어
-- 저장소에서 지운다. ready인 그림의 묶음 파일은 그리다 만 것이라도 고르지 않는다: 일꾼이 다시 그려 덮거나
-- 본인이 그림을 지울 때 함께 지워지고, 여기서 골랐다가는 지금 올리고 있는 파일을 지울 수 있다.
-- v1 묶음 이름 모양(<uid>/views/<id>.v1l.webp, .v1s.webp)만 본다: 다른 이름과 다른 폴더는 건드리지 않는다.
create or replace function public.avatar_views_strays(p_limit int default 100) returns setof text
language sql stable security definer set search_path = '' as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'avatars'
     and o.name ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/views/'
                   || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]v1[ls][.]webp$')
     and not exists (
       -- 이름에서 그림 id를 꺼낸다. 모양이 맞을 때만 값이 나오므로(아니면 null) uuid로 바꾸다 멈추는 일이 없다
       select 1 from public.avatars a
        where a.id = substring(o.name from '/views/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]v1[ls][.]webp$')::uuid
          and a.user_id::text = split_part(o.name, '/', 1)
          and a.status = 'ready')
   order by o.name
   limit least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;

-- ───────────────────────────── 읽기(명단 손님)
-- 묶음 파일의 경로(명단 손님만, 그림도 묶음도 ready일 때만). /api/avatar/[id]/views가 쓴다.
-- p_size: 'l'(큰 것) | 's'(작은 것). 다른 값은 'l'. 경로 모양은 src/lib/avatar/rules.ts의 viewsPath()와 같다.
create or replace function public.avatar_views_path(p_id uuid, p_size text) returns text
language sql stable security definer set search_path = '' as $$
  select a.user_id::text || '/views/' || a.id::text || '.v1' || (case when p_size = 's' then 's' else 'l' end) || '.webp'
    from public.avatars a
   where public.is_guest() and a.id = p_id and a.status = 'ready' and a.views_status = 'ready'
$$;

-- 저장소 정책용: 이 파일이 지금 ready인 그림의 ready인 묶음 파일인가(명단 손님만).
-- 이름 끝에서 그림 id를 꺼내 그 줄 하나만 보고, 이름 전체가 그 줄의 두 파일 가운데 하나와 꼭 같아야 한다.
create or replace function public.avatar_views_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_guest()
     and exists (
       select 1 from public.avatars a
        where a.id = substring(p_name from '/views/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]v1[ls][.]webp$')::uuid
          and a.status = 'ready' and a.views_status = 'ready'
          and p_name in (a.user_id::text || '/views/' || a.id::text || '.v1l.webp',
                         a.user_id::text || '/views/' || a.id::text || '.v1s.webp'))
$$;

-- ───────────────────────────── 지우기(0003의 avatar_forget을 같은 시그니처로 다시 정의)
-- 지우기 기록. 파일은 서버가 저장소에서 먼저 지운 뒤 부른다. p_part: original | character | both
-- 지운 줄도 오늘 장수에는 남는다(지우고 다시 만들기로 하루 3장을 넘지 않게).
-- 0003과 달라진 것은 하나: 그림이 없어질 때(character·both, 또는 그리는 중이던 작업을 거둘 때) 묶음 칸도 모두 비운다.
-- 묶음 파일 둘(<uid>/views/<id>.v1l.webp, .v1s.webp)도 부르는 쪽이 그림과 함께 먼저 지운다.
-- 일꾼이 그 뒤에 묶음을 정리하려 하면 avatar_views_settle이 false를 돌려준다.
create or replace function public.avatar_forget(p_id uuid, p_part text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  if p_part not in ('original', 'character', 'both') then
    raise exception 'bad_part' using errcode = '22023';
  end if;
  if p_part in ('character', 'both') then
    update public.profiles set avatar_id = null, updated_at = now()
     where user_id = auth.uid() and avatar_id = p_id;
  end if;
  -- 아직 그리는 중(pending·queued·drawing)이면 무엇을 지우든 작업을 거둔다: 원본 경로도 비우고 deleted.
  -- 부르는 쪽이 원본 파일을 먼저 지운다. 일꾼이 그 뒤에 정리하려 하면 avatar_settle이 false를 돌려준다.
  update public.avatars
     set original_path = case when p_part in ('original', 'both') or status in ('pending', 'queued', 'drawing')
                              then null else original_path end,
         image_path = case when p_part in ('character', 'both') then null else image_path end,
         status = case when status in ('pending', 'queued', 'drawing') then 'deleted'
                       when p_part in ('character', 'both') and status = 'ready' then 'deleted' else status end,
         deleted_at = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                           then now() else deleted_at end,
         claimed_at = null, not_before = null,
         views_status = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                             then null else views_status end,
         views_attempts = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                               then 0 else views_attempts end,
         views_sheet_fails = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                                  then 0 else views_sheet_fails end,
         views_claimed_at = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                                 then null else views_claimed_at end,
         views_not_before = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                                 then null else views_not_before end,
         views_worker = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                             then null else views_worker end,
         views_mode = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                           then null else views_mode end,
         views_model = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                            then null else views_model end,
         views_reason = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                             then null else views_reason end
   where id = p_id and user_id = auth.uid();
  return found;
end $$;

-- ───────────────────────────── 저장소(비공개 버킷 avatars)
-- 명단 손님: ready인 묶음(*/views/*)만 본다. 본인 보기·지우기 정책(0003)은 <uid>/ 전체라 묶음도 그대로 덮는다.
-- 올리기 정책은 여전히 없다: 일꾼(비밀 키)만 올린다.
drop policy if exists avatars_guest_select_views on storage.objects;
create policy avatars_guest_select_views on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[2] = 'views'
         and public.avatar_views_readable(name));

-- ───────────────────────────── 권한 정리
revoke execute on function public.avatar_views_claim(text, int), public.avatar_views_release(uuid, text, int, boolean),
  public.avatar_views_settle(uuid, text, text, text, text, text), public.avatar_views_strays(int),
  public.avatar_views_path(uuid, text), public.avatar_views_readable(text), public.avatar_forget(uuid, text),
  public.avatar_views_agree(uuid)
  from public, anon, authenticated;

grant execute on function public.avatar_views_path(uuid, text), public.avatar_views_readable(text),
  public.avatar_forget(uuid, text), public.avatar_views_agree(uuid)
  to authenticated;
-- 비밀 키(service_role)만: 잡기·돌려놓기·정리·남은 파일 찾기(일꾼)
grant execute on function public.avatar_views_claim(text, int), public.avatar_views_release(uuid, text, int, boolean),
  public.avatar_views_settle(uuid, text, text, text, text, text), public.avatar_views_strays(int)
  to service_role;
