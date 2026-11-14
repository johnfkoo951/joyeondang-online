-- 조연당 온라인 0016: 사진 캐릭터의 3D 모형(걷기용)
--
-- 무엇을·왜
--   사진 캐릭터는 그림 한 장(또는 다섯 방향 그림 묶음, 0015)을 세운 판이라 가까이서 돌아보면 얇다. 다 그린 캐릭터 그림(ready)으로
--   3D 모형(GLB 한 파일)을 한 번 만들어 두고, 걷기 엔진이 모형 → 방향 묶음 → 그림 한 장 차례로 쓴다.
--   이 파일은 그 모형의 대기열·권한·지우기를 더한다. 대기열은 0015의 묶음 대기열을 본뜬다.
--
-- 원칙
--   1. 모형은 캐릭터 그림에서 나온 파생 파일이다. 비공개 버킷 avatars의 <uid>/models/<id>.v1.glb 하나.
--      일꾼(비밀 키, service_role)만 올리고 명단 손님끼리만 본다. 버킷이 받는 형식에 model/gltf-binary를 더한다.
--   2. 3D 변환은 우리 컴퓨터(그래픽 카드가 있는 PC의 3D 서비스)에서 한다. 캐릭터 그림을 바깥 서비스로 보내지 않으므로
--      따로 동의 칸을 두지 않는다(개인정보 화면에 적는다). 0015의 묶음과 달리 동의한 때를 보지 않는다.
--   3. 그림을 지우면 모형도 지운다. 사이트가 모형 파일을 그림·묶음과 함께 먼저 지우고, avatar_forget()이 칸을 모두 비운 다음,
--      사이트가 한 번 더 지운다(첫 지우기와 칸 비우기 사이에 일꾼이 막 올렸을 수 있다).
--      모형 칸은 ready인 그림에만 값을 가질 수 있다(avatars_model_need_image): 칸을 비우지 않고 그림만 지우는 길이
--      나중에 생기면 조용히 남지 않고 그 자리에서 멈춘다.
--   4. 대기열은 avatars의 칸으로 한다. model_status: null(아직 안 만듦) → drawing → ready | failed.
--      잡는 조건은 0015와 같다: ready인 그림이고, 그림 주인의 겉모습(profiles.look, 0006)이 사진이고 그 주소가 이 그림일 때
--      (지금 걷기에 쓰는 캐릭터). 고르다 만 캐릭터와 지울 캐릭터에 그래픽 카드 시간을 쓰지 않는다.
--      다른 캐릭터로 바꿔 걸으면 그 캐릭터가 그때 줄에 선다. 이미 있던 캐릭터도 쓰는 중이면 새것부터 차례로 채운다.
--      만든 결과가 이상해서(형식·크기·삼각형 수·모양, 서비스의 생성 실패) 돌려놓은 횟수는 model_bad_fails에 따로 센다
--      (서비스가 꺼진 사이 쓴 횟수가 이 한도를 깎지 않게). DB는 일꾼이 멈춰 임대가 끝난 것을 여덟 번에서 끊고,
--      열 번을 마지막 울타리로 둔다. 몇 번까지 다시 만들지는 일꾼이 정한다(worker/avatar/models.mjs).
--      임대 길이는 줄에 적지 않고 잡으러 온 쪽의 인자로 잰다. 상태를 보려고 avatar_model_claim()을 부르지 않는다(줄을 잡아 버린다).
--   5. 만드는 사이 본인이 그림을 지웠으면 avatar_model_settle()이 false를 돌려준다. 일꾼은 올린 파일을 거둔다.
--      일꾼이 거두기 직전에 멈춰 남은 파일은 avatar_model_strays()가 골라 준다. 비밀 키로 불러 저장소에서 지운다.
--   6. 걷기 엔진이 없는 모형과 묶음을 손님마다 몇 번씩 다시 묻지 않게, avatar_asset_state()가 「아직 만드는 중이라
--      나중에 생길 수 있음(pending)」과 「만들 계획이 없음(none)」을 가려 준다. 사이트가 404에 X-Avatar-Asset으로 붙인다.
--   7. 0003·0015는 고치지 않는다. avatar_forget()만 여기서 같은 시그니처로 다시 정의한다(0015의 묶음 칸 비우기는 그대로 두고
--      모형 칸 비우기를 더한다).
--   8. 사이트 코드는 이 파일을 올리기 전에도 뒤에도 돈다: 올리기 전에는 /api/avatar/<id>/model이 404라 걷기 엔진이
--      방향 묶음이나 그림 한 장으로 걷고, 지우기는 없는 파일을 지우려다 그냥 지나간다. 일꾼은 함수가 없으면 모형만 쉰다.
--
-- 내보내는 순서: 사이트(지우기가 모형 파일도 함께 지운다)를 먼저 내보내고, 이 파일을 올린 다음, 새 일꾼을 켠다.
-- 옛 사이트가 도는 사이에 일꾼이 모형을 만들면, 그림을 지울 때 모형 파일이 저장소에 남는다
-- (그때는 avatar_model_strays()로 찾아 지운다).
--
-- 여러 번 올려도 된다(add column if not exists, create or replace, drop … if exists). 0001·0003·0006·0015 뒤에 올린다
-- (없으면 맨 앞에서 멈춘다). 0014와는 서로 기대지 않는다. 올리는 역할은 저장소 표의 모든 줄을 볼 수 있어야 한다
-- (남은 파일 찾기가 그 권한으로 읽는다. Supabase의 postgres는 그렇다. 아니면 맨 앞에서 멈춘다).
-- 올린 뒤 확인:
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'avatars' and column_name like 'model\_%';          → 8
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and (proname like 'avatar\_model\_%' or proname = 'avatar_asset_state') order by 1;                → 일곱 줄
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
--      and policyname = 'avatars_guest_select_models';                                                   → 한 줄
--   select allowed_mime_types from storage.buckets where id = 'avatars';                                 → model/gltf-binary가 있다
--   select has_function_privilege('authenticated', 'public.avatar_model_claim(text, int)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_model_path(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_asset_state(uuid, text)', 'execute');   → f, t, t
--   select model_status, count(*) from public.avatars where status = 'ready' group by 1;
--      → 처음에는 모두 null. 일꾼이 돌면 쓰는 캐릭터부터 ready(또는 failed)로 채워진다
--   select * from public.avatar_model_strays(100);
--      → 지운 그림의 모형 파일 이름(없어야 정상). 있으면 비밀 키로 저장소에서 지운다(표에서 바로 지우지 않는다)
-- 한 그림의 모형을 다시 만들게 하려면(failed로 굳은 것, 3D 서비스를 바꾼 뒤 등): 잡은 횟수도 함께 되돌린다
--   update public.avatars set model_status = null, model_attempts = 0, model_bad_fails = 0, model_reason = null, model_not_before = null
--    where id = '…' and status = 'ready';   -- 저장소의 옛 파일은 일꾼이 새로 올리며 덮는다
--
-- 되돌리는 법(한 트랜잭션으로 한다: begin; … commit;. 한 줄씩 따로 하면 그사이 그림 지우기가 실패한다)
--   drop policy if exists avatars_guest_select_models on storage.objects;
--   drop function if exists public.avatar_model_claim(text, int), public.avatar_model_release(uuid, text, int, boolean),
--     public.avatar_model_settle(uuid, text, text, text, text), public.avatar_model_path(uuid),
--     public.avatar_model_readable(text), public.avatar_model_strays(int), public.avatar_asset_state(uuid, text);
--   alter table public.avatars drop constraint if exists avatars_model_need_image;
--     (0015의 지우기는 모형 칸을 비우지 않는다. 이 제약이 남아 있으면 모형이 있는 그림을 지울 수 없다)
--   0015의 「create or replace function public.avatar_forget(…)」 정의를 다시 올린다(모형 칸을 지우기 전에:
--     칸을 먼저 지우면 이 파일의 avatar_forget이 없는 칸을 찾다가 모든 지우기를 막는다).
--   drop index if exists public.avatars_model_queue, public.avatars_model_drawing;
--   alter table public.avatars drop column if exists model_status, drop column if exists model_attempts,
--     drop column if exists model_bad_fails, drop column if exists model_claimed_at, drop column if exists model_not_before,
--     drop column if exists model_worker, drop column if exists model_maker, drop column if exists model_reason;
--   버킷의 형식 목록에서 model/gltf-binary를 빼는 것은 저장소의 */models/* 파일을 다 지운 뒤에 한다(일꾼의 비밀 키로, 또는 저장소 화면에서):
--   update storage.buckets set allowed_mime_types = array_remove(allowed_mime_types, 'model/gltf-binary') where id = 'avatars';

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  -- 남은 파일 찾기는 올리는 역할의 권한으로 저장소 표를 읽는다. 줄이 가려지는 역할이면 남은 파일을 조용히 놓친다
  -- (맨 먼저 본다: 그런 역할은 아래에서 버킷 표를 읽다가 다른 오류로 멈춘다)
  if not exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception '0016_needs_role_that_reads_all_storage_rows';
  end if;
  if to_regclass('public.avatars') is null or to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null
     or to_regprocedure('public.is_guest()') is null
     or to_regprocedure('public.avatar_worker_beat(text, text)') is null
     or to_regprocedure('public.avatar_forget(uuid, text)') is null
     or not exists (select 1 from storage.buckets where id = 'avatars') then
    raise exception '0016_needs_0001_0003';
  end if;
  -- 줄을 고르는 조건이 겉모습 칸(profiles.look, 0006)을 읽는다. 없으면 잡을 때마다 오류가 난다
  -- (information_schema는 권한이 있는 칸만 보여 주므로 pg_catalog로 본다)
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = to_regclass('public.profiles') and attname = 'look' and not attisdropped) then
    raise exception '0016_needs_0006';
  end if;
  -- 아래의 avatar_forget은 0015의 묶음 칸도 비운다. 그 칸이 없으면 모든 지우기가 실행할 때 멈춘다
  -- (plpgsql은 만들 때 칸을 확인하지 않는다). 묶음과 모형의 남은 상태를 함께 알려 주는 함수도 그 칸을 읽는다
  if to_regprocedure('public.avatar_views_claim(text, int)') is null
     or (select count(*) from pg_catalog.pg_attribute
          where attrelid = to_regclass('public.avatars') and not attisdropped
            and attname in ('views_status', 'views_attempts', 'views_sheet_fails', 'views_claimed_at', 'views_not_before',
                            'views_worker', 'views_mode', 'views_model', 'views_reason', 'views_consent_at')) <> 10 then
    raise exception '0016_needs_0015';
  end if;
end $$;

-- ───────────────────────────── 모형 칸(대기열 겸 기록)
--   model_status      null(아직 안 만듦) | drawing | ready | failed
--   model_attempts    잡은 횟수(열 번이 마지막 울타리. 그 전에 일꾼이 ready나 failed로 정리한다)
--   model_bad_fails   그 가운데 결과가 이상해서(형식·크기·삼각형 수·모양, 서비스의 생성 실패) 돌려놓은 횟수. 일꾼이 세 번에서 그만둔다
--   model_claimed_at  지금 잡은 때, model_worker 잡은(또는 만든) 일꾼, model_not_before 다시 잡을 수 있는 때
--   model_maker       만든 3D 서비스(이름과 판), model_reason 실패 까닭
alter table public.avatars
  add column if not exists model_status text,
  add column if not exists model_attempts int not null default 0,
  add column if not exists model_bad_fails int not null default 0,
  add column if not exists model_claimed_at timestamptz,
  add column if not exists model_not_before timestamptz,
  add column if not exists model_worker text,
  add column if not exists model_maker text,
  add column if not exists model_reason text;

alter table public.avatars
  drop constraint if exists avatars_model_status_known,
  drop constraint if exists avatars_model_attempts_range,
  drop constraint if exists avatars_model_bad_fails_range,
  drop constraint if exists avatars_model_worker_shape,
  drop constraint if exists avatars_model_maker_shape,
  drop constraint if exists avatars_model_reason_shape,
  drop constraint if exists avatars_model_need_image,
  drop constraint if exists avatars_model_drawing_has_claim;
alter table public.avatars
  add constraint avatars_model_status_known
    check (model_status is null or model_status in ('drawing', 'ready', 'failed')),
  add constraint avatars_model_attempts_range check (model_attempts between 0 and 10),
  add constraint avatars_model_bad_fails_range check (model_bad_fails between 0 and 10),
  add constraint avatars_model_worker_shape
    check (model_worker is null or model_worker ~ '^[A-Za-z0-9._-]{1,40}$'),
  add constraint avatars_model_maker_shape
    check (model_maker is null or model_maker ~ '^[A-Za-z0-9._:-]{1,64}$'),
  add constraint avatars_model_reason_shape check (model_reason is null or model_reason ~ '^[a-z_]{1,32}$'),
  -- 모형은 ready인 그림에만 있다. 그림을 지우는 길은 반드시 모형 칸도 비워야 한다(avatar_forget이 그렇게 한다)
  add constraint avatars_model_need_image
    check (model_status is null or (status = 'ready' and image_path is not null)),
  -- 잡은 줄에는 잡은 때와 일꾼이 있다(없으면 임대가 끝나도 되돌릴 수 없다)
  add constraint avatars_model_drawing_has_claim
    check (model_status is distinct from 'drawing' or (model_claimed_at is not null and model_worker is not null));

-- 잡을 차례를 찾는 색인(새것부터)과 임대가 끝난 것을 찾는 색인. 일꾼이 몇 초마다 묻는다
create index if not exists avatars_model_queue on public.avatars (created_at desc)
  where status = 'ready' and model_status is null;
create index if not exists avatars_model_drawing on public.avatars (model_claimed_at)
  where model_status = 'drawing';

-- ───────────────────────────── 대기열(일꾼 전용, service_role)
-- 일꾼이 모형을 만들 그림 하나를 잡는다. 여러 일꾼이 동시에 불러도 한 그림을 둘이 잡지 않는다(skip locked).
-- 지금 누군가 걷기에 쓰는 캐릭터(그 사람의 profiles.look이 가리키는 사진)만 잡는다(0015와 같은 조건, 동의 칸은 보지 않는다).
-- 결과: null(할 일 없음) 또는 {id, user_id, image_path, attempts, bad_fails}. 살아 있음(avatar_worker_beat)도 남긴다.
create or replace function public.avatar_model_claim(p_worker text, p_lease_seconds int default 600) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 600), 60));
begin
  perform public.avatar_worker_beat(p_worker);
  -- 임대가 끝난 것(일꾼이 도중에 멈춤): 여덟 번 잡았으면 failed(timeout), 아니면 다시 잡을 수 있게 비운다.
  -- 여덟은 일꾼이 서비스 쪽 실패를 기다려 주는 횟수와 같다(worker/avatar/models.mjs의 MODELS_MAX_OUTAGE_ATTEMPTS)
  update public.avatars
     set model_status = case when model_attempts >= 8 then 'failed' end,
         model_reason = case when model_attempts >= 8 then 'timeout' end,
         model_claimed_at = null, model_worker = null, model_not_before = null
   where model_status = 'drawing' and model_claimed_at < now() - v_lease;
  loop
    -- 가장 새것부터
    select * into v from public.avatars
     where status = 'ready' and image_path is not null and model_status is null
       and (model_not_before is null or model_not_before <= now())
       and exists (select 1 from public.profiles p
                    where p.user_id = public.avatars.user_id and p.look ->> 'kind' = 'photo'
                      and p.look ->> 'url' = '/api/avatar/' || public.avatars.id::text)
     order by created_at desc, id desc limit 1 for update skip locked;
    if not found then return null; end if;
    exit when v.model_attempts < 10;
    -- 마지막 울타리: 열 번을 잡고도 끝나지 않은 줄은 failed로 굳히고 다음 줄을 본다(숫자는 avatars_model_attempts_range와 같다).
    -- 여기까지 오는 것은 일꾼이 잘못됐을 때뿐이다. 굳히지 않으면 이 줄이 맨 앞에 남아 잡을 때마다 열한 번째에서 멈춘다
    update public.avatars set model_status = 'failed', model_reason = 'attempts', model_not_before = null
     where id = v.id;
  end loop;
  update public.avatars
     set model_status = 'drawing', model_attempts = model_attempts + 1, model_claimed_at = now(),
         model_worker = p_worker, model_not_before = null, model_reason = null
   where id = v.id;
  return jsonb_build_object('id', v.id, 'user_id', v.user_id, 'image_path', v.image_path,
                            'attempts', v.model_attempts + 1, 'bad_fails', v.model_bad_fails);
end $$;

-- 잠깐의 실패(서비스가 꺼짐·바쁨 등): 조금 뒤(0초~1시간) 다시 잡도록 비운다. 잡은 일꾼만 돌려놓는다.
-- p_bad가 참이면 「결과가 이상해서」 돌려놓는 것이라 model_bad_fails를 하나 올린다(일꾼이 세 번에서 그만둔다).
-- 그만 만들 때는 일꾼이 avatar_model_settle('failed')로 정리한다. 돌려놓기만 되풀이하는 줄은 avatar_model_claim()이 열 번에서 끊는다.
create or replace function public.avatar_model_release(
  p_id uuid, p_worker text, p_delay_seconds int default 120, p_bad boolean default false
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.avatars
     set model_status = null, model_claimed_at = null, model_worker = null,
         model_bad_fails = least(model_bad_fails + (case when p_bad is true then 1 else 0 end), 10),
         model_not_before = now() + make_interval(secs => least(greatest(coalesce(p_delay_seconds, 120), 0), 3600))
   where id = p_id and model_status = 'drawing' and model_worker = p_worker;
  return found;
end $$;

-- 모형을 다 만들었거나(ready) 그만둘 때(failed) 적는다. 파일은 일꾼이 먼저 올린 뒤에 부른다.
-- 그 그림이 아직 ready이고 잡힌 채(drawing)일 때만 적고 true(아래의 늦은 ready 하나만 예외).
-- false: 그사이 본인이 그림을 지웠다(또는 잡힌 줄이 아니다). 일꾼은 방금 올린 파일을 거둔다.
-- 함께 적는 값(만든 서비스·까닭)은 모양이 낯설어도 정리를 막지 않는다: 서비스 이름은 비워 두고 까닭은 'error'로 적는다.
-- 그만두기(failed)는 지금 잡고 있는 일꾼의 것만 받는다(p_worker를 줬을 때): 임대가 끝나 다른 일꾼이 다시 잡은 뒤에
-- 옛 일꾼의 failed가 오면 지금 만드는 줄이 굳는다. ready는 누가 적어도 된다(방금 올린 파일이 그 자리에 있다).
-- p_worker를 비우면 보지 않는다(손으로 정리할 때).
create or replace function public.avatar_model_settle(
  p_id uuid, p_status text, p_maker text default null, p_reason text default null, p_worker text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_maker text := case when p_maker ~ '^[A-Za-z0-9._:-]{1,64}$' then p_maker end;
  v_reason text := case when p_reason ~ '^[a-z_]{1,32}$' then p_reason else 'error' end;
begin
  -- 상태는 빈 값도 거절한다(빈 값을 적으면 누가 잡았는지 보지 않는 돌려놓기가 된다)
  if p_status is null or p_status not in ('ready', 'failed') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  select * into v from public.avatars where id = p_id for update;
  if not found or v.status <> 'ready' or v.image_path is null then return false; end if;
  if v.model_status = 'drawing' then
    if p_status = 'failed' and p_worker is not null and v.model_worker is distinct from p_worker then return false; end if;
    update public.avatars
       set model_status = p_status,
           model_maker = v_maker,
           model_reason = case when p_status = 'failed' then v_reason end,
           model_claimed_at = null, model_not_before = null
     where id = p_id;
    return true;
  end if;
  -- 임대가 끝나 다른 일꾼이 다시 잡아 먼저 끝낸 뒤에 온 늦은 ready: 방금 올린 파일이 같은 자리를 덮었으므로
  -- false를 주면 일꾼이 쓰이는 파일을 지워 버린다. 만든 서비스만 새것으로 고치고 true.
  if v.model_status = 'ready' and p_status = 'ready' then
    update public.avatars set model_maker = v_maker where id = p_id;
    return true;
  end if;
  return false;
end $$;

-- 그림이 없는데 저장소에 남은 모형 파일의 이름(그림을 지웠거나, 그런 줄이 없거나, 남의 폴더에 있는 것).
-- 일꾼이 모형을 올린 뒤 거두기 전에 멈추거나, 옛 사이트가 그림만 지웠을 때 이런 파일이 남는다. 비밀 키로 물어
-- 저장소에서 지운다. ready인 그림의 모형 파일은 만들다 만 것이라도 고르지 않는다: 일꾼이 다시 만들어 덮거나
-- 본인이 그림을 지울 때 함께 지워지고, 여기서 골랐다가는 지금 올리고 있는 파일을 지울 수 있다.
-- v1 모형 이름 모양(<uid>/models/<id>.v1.glb)만 본다: 다른 이름과 다른 폴더는 건드리지 않는다.
create or replace function public.avatar_model_strays(p_limit int default 100) returns setof text
language sql stable security definer set search_path = '' as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'avatars'
     and o.name ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/models/'
                   || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]v1[.]glb$')
     and not exists (
       -- 이름에서 그림 id를 꺼낸다. 모양이 맞을 때만 값이 나오므로(아니면 null) uuid로 바꾸다 멈추는 일이 없다
       select 1 from public.avatars a
        where a.id = substring(o.name from '/models/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]v1[.]glb$')::uuid
          and a.user_id::text = split_part(o.name, '/', 1)
          and a.status = 'ready')
   order by o.name
   limit least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;

-- ───────────────────────────── 읽기(명단 손님)
-- 모형 파일의 경로(명단 손님만, 그림도 모형도 ready일 때만). /api/avatar/[id]/model이 쓴다.
-- 경로 모양은 src/lib/avatar/rules.ts의 modelPath()와 같다.
create or replace function public.avatar_model_path(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select a.user_id::text || '/models/' || a.id::text || '.v1.glb'
    from public.avatars a
   where public.is_guest() and a.id = p_id and a.status = 'ready' and a.model_status = 'ready'
$$;

-- 저장소 정책용: 이 파일이 지금 ready인 그림의 ready인 모형 파일인가(명단 손님만).
-- 이름 끝에서 그림 id를 꺼내 그 줄 하나만 보고, 이름 전체가 그 줄의 모형 경로와 꼭 같아야 한다.
create or replace function public.avatar_model_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_guest()
     and exists (
       select 1 from public.avatars a
        where a.id = substring(p_name from '/models/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]v1[.]glb$')::uuid
          and a.status = 'ready' and a.model_status = 'ready'
          and p_name = a.user_id::text || '/models/' || a.id::text || '.v1.glb')
$$;

-- 걷기용 파생 파일(p_kind: 'views' 방향 묶음 | 'model' 3D 모형)이 지금 없을 때, 기다리면 생길 수 있는가.
-- 사이트가 404 답에 X-Avatar-Asset으로 붙인다. 걷기 엔진은 none이면 그 주소를 그 화면에서 다시 묻지 않고,
-- pending일 때만 조금씩 사이를 두고 다시 묻는다(손님 수십 명이 같은 주소를 몇 번씩 묻지 않게).
--   ready    지금 있다(경로 함수가 막 null을 준 뒤에 생겼을 때. 사이트는 pending으로 알린다)
--   pending  그림을 그리는 중이거나, 그림이 ready이고 파생 파일을 아직 안 만들었다(만드는 중이거나 줄에 서 있다)
--   none     만들 계획이 없다: 그런 그림이 없음, 지운·거절된·실패한 그림, 파생 파일이 실패로 굳음,
--            방향 묶음은 여러 방향 그림까지 동의하지 않은 그림(0015 이전의 옛 캐릭터). 명단 손님이 아니어도 none
--            (없는 그림과 볼 수 없는 그림을 같은 답으로: 있는지조차 알리지 않는다)
create or replace function public.avatar_asset_state(p_id uuid, p_kind text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.avatars;
begin
  if p_kind is null or p_kind not in ('views', 'model') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.is_guest() then return 'none'; end if;
  select * into v from public.avatars where id = p_id;
  if not found or v.status not in ('pending', 'queued', 'drawing', 'ready') then return 'none'; end if;
  if p_kind = 'views' then
    if v.views_consent_at is null or v.views_status = 'failed' then return 'none'; end if;
    return case when v.status = 'ready' and v.views_status = 'ready' then 'ready' else 'pending' end;
  end if;
  if v.model_status = 'failed' then return 'none'; end if;
  return case when v.status = 'ready' and v.model_status = 'ready' then 'ready' else 'pending' end;
end $$;

-- ───────────────────────────── 지우기(0015의 avatar_forget을 같은 시그니처로 다시 정의)
-- 지우기 기록. 파일은 서버가 저장소에서 먼저 지운 뒤 부른다. p_part: original | character | both
-- 지운 줄도 오늘 장수에는 남는다(지우고 다시 만들기로 하루 3장을 넘지 않게).
-- 0015와 달라진 것은 하나: 그림이 없어질 때(character·both, 또는 그리는 중이던 작업을 거둘 때) 모형 칸도 모두 비운다
-- (묶음 칸 비우기는 0015 그대로). 모형 파일(<uid>/models/<id>.v1.glb)도 부르는 쪽이 그림과 함께 먼저 지운다.
-- 일꾼이 그 뒤에 모형을 정리하려 하면 avatar_model_settle이 false를 돌려준다.
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
  -- (아래의 고치기는 모두 고치기 전의 값을 본다: status를 deleted로 바꾸는 줄과 같은 고치기 안에서도 앞의 status로 가린다)
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
                             then null else views_reason end,
         model_status = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                             then null else model_status end,
         model_attempts = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                               then 0 else model_attempts end,
         model_bad_fails = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                                then 0 else model_bad_fails end,
         model_claimed_at = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                                 then null else model_claimed_at end,
         model_not_before = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                                 then null else model_not_before end,
         model_worker = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                             then null else model_worker end,
         model_maker = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                            then null else model_maker end,
         model_reason = case when p_part in ('character', 'both') or status in ('pending', 'queued', 'drawing')
                             then null else model_reason end
   where id = p_id and user_id = auth.uid();
  return found;
end $$;

-- ───────────────────────────── 저장소(비공개 버킷 avatars)
-- 버킷이 받는 형식에 GLB를 더한다(일꾼이 model/gltf-binary로 올린다). 형식 목록이 비어 있으면(모두 받음) 그대로 둔다:
-- 하나를 더하면 오히려 그것만 받게 된다. 크기 상한(0003의 8MB)은 그대로: 모형은 일꾼이 1.5MB 아래만 올린다.
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'model/gltf-binary')
 where id = 'avatars' and allowed_mime_types is not null
   and not ('model/gltf-binary' = any (allowed_mime_types));

-- 명단 손님: ready인 모형(*/models/*)만 본다. 본인 보기·지우기 정책(0003)은 <uid>/ 전체라 모형도 그대로 덮는다.
-- 올리기 정책은 여전히 없다: 일꾼(비밀 키)만 올린다.
drop policy if exists avatars_guest_select_models on storage.objects;
create policy avatars_guest_select_models on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[2] = 'models'
         and public.avatar_model_readable(name));

-- ───────────────────────────── 권한 정리
revoke execute on function public.avatar_model_claim(text, int), public.avatar_model_release(uuid, text, int, boolean),
  public.avatar_model_settle(uuid, text, text, text, text), public.avatar_model_strays(int),
  public.avatar_model_path(uuid), public.avatar_model_readable(text), public.avatar_asset_state(uuid, text),
  public.avatar_forget(uuid, text)
  from public, anon, authenticated;

grant execute on function public.avatar_model_path(uuid), public.avatar_model_readable(text),
  public.avatar_asset_state(uuid, text), public.avatar_forget(uuid, text)
  to authenticated;
-- 비밀 키(service_role)만: 잡기·돌려놓기·정리·남은 파일 찾기(일꾼)
grant execute on function public.avatar_model_claim(text, int), public.avatar_model_release(uuid, text, int, boolean),
  public.avatar_model_settle(uuid, text, text, text, text), public.avatar_model_strays(int)
  to service_role;
