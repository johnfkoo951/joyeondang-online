-- 조연당 온라인 0021: 사진 캐릭터 이력·작업대·보관(★)·3D 요청(2026-11-12)
--
-- 무엇을·왜
--   집주인 요청: 사진으로 만든 캐릭터 그림은 지우지 않는 한 모두 이력에 남기고, 마음에 드는 것은 ★로 보관하고,
--   보관한 그림 가운데 하나를 사람이 골라 3D로 바꾼다. 3D는 돈이 드는 외부 서비스라 저절로 만들지 않고 한 사람 한 번이다.
--   지금의 칸(0019)은 작업대로 쓰고, 칸 수를 역할마다 둔다(집주인 결정: 관리자·가족 9칸, 손님 3칸).
--   1. 이력: 지우지 않은 그림(pending·queued·drawing·ready)은 모두 남는다. 역할마다 이력 한도(history_max)를 두고,
--      다 차면 avatar_begin이 'history_full'로 막는다. 저절로 지우지 않는다(사람이 지울 것을 고른다).
--      하루 규칙(내 장수 → 내 시도 → 모두의 상한)을 먼저 본다: 오늘 더 만들 수 없는 사람에게 지우라고 하지 않는다.
--   2. 작업대: 0019의 칸 번호(slot)를 그대로 쓴다. 칸 수는 역할마다 avatar_limits()의 bench_max(손님 3, 가족·관리자 9)이고
--      세션(auth.uid())의 명단 역할로만 정한다(부르는 쪽이 넘기는 값으로 늘릴 수 없다). 0019의 범위 검사(1~3)는 1~9로 넓힌다.
--      부분 고유 색인(보관 중인 줄끼리 한 사람의 번호가 겹치지 않는다)은 범위와 상관없어 그대로 둔다.
--      역할이 줄면(가족 → 손님) 칸 수 밖의 번호(4~9번)는 작업대가 아니라 이력으로 본다: 만들기·꺼내기는 1~칸 수만 쓰고,
--      번호는 지우지 않는다(역할이 돌아오면 그 칸에 다시 보인다). 이미 운영에 있는 1~3번 줄은 그대로 작업대다.
--      새 그림은 늘 작업대에 들어간다. 빈 칸이 있으면 가장 작은 번호에, 다 차 있으면 막지 않고
--      한 칸을 비워(slot = null, 이력에만 남는다) 새 그림에 준다. 비울 칸은 ★로 보관하지 않았고 지금 걷기에 입지 않은
--      다 그린 그림 가운데 작업대에 가장 오래 있던 것부터 고른다. 그다음은 그리는 중인 그림, 맨 나중이 ★이나 입은 그림이다.
--      그래서 'slots_full'은 이제 나오지 않는다. 「가장 오래」는 만든 때가 아니라 작업대에 들어온 때(slot_at)로 잰다:
--      이력에서 막 꺼낸 옛 그림이 다음 만들기에 바로 밀려나지 않게. 이력의 그림은 avatar_to_bench()로 작업대에 꺼낸다
--      (빈 칸, 또는 고른 칸과 맞바꾸기).
--      칸을 비운 만들기는 새 줄에 칸을 내준 그림을 적어 둔다(slot_freed). 사진이 거절되거나 그리기에 실패하거나 본인이
--      그만두면 트리거가 그 그림을 그 칸에 되돌린다(그사이 그 그림이 지워졌거나 다른 칸에 있거나 그 칸이 다른 그림에
--      쓰이면 그대로 둔다). 비운 그림의 slot_at은 지우지 않는다(되돌리면 작업대에 있던 차례도 그대로).
--   3. 보관(★): kept_at. 다 그린 그림(ready)만, 역할마다 keep_max까지. avatar_keep(p_id, p_on)으로 켜고 끈다.
--      넘으면 'keep_full'.
--   4. 3D 요청: model_requested_at. 보관한 다 그린 그림 하나를 사람이 골라 avatar_model_request(id, via)로 요청한다.
--      셈은 셋이다(숫자는 아래 avatar_limits()).
--      model_max: 지금 센 요청(기다림·만드는 중·다 만듦). 실패(model_status failed)한 요청은 빼 준다(다시 요청할 수 있다).
--      model_tries_max: 돈이 든 시도의 평생 누적(model_tries). 바깥 3D 서비스가 작업을 실제로 만들면(작업 id를 받으면)
--        일꾼이 avatar_model_job()으로 알리고, DB는 그 요청을 한 번 센다(그때를 model_job_at에 적는다. 결과가 이상해 새로
--        만든 둘째 작업도 같은 요청이라 한 번). 값은 이미 냈으므로 결과가 이 맥의 확인에 걸려 실패해도, 다시 요청해도,
--        그림을 지워도 줄지 않는다. 작업을 만들기 전에 끝난 요청(키·잔액·쉬는 중·하루 상한·연결 실패·만들기 전 거절,
--        동의한 곳이 달라 보내지 않음(reconsent))은 세지 않는다(돌려준다). 아직 작업을 만들지 않고 기다리거나 만드는
--        중인 요청은 끝날 때까지 한 번으로 잡아 둔다(동시에 여럿을 걸어 상한을 넘지 않게). 우리 컴퓨터(trellis)는 값이
--        들지 않아 알리지 않는다(누적에 들지 않는다).
--      model_day_max: 모두 합친 하루(한국 시간) 3D 요청 수의 상한. 모두의 상한 밖 역할(관리자, 표의 total_exempt)은
--        상한을 보지도, 셈에 들지도 않는다. 작업을 만들지 못하고 실패한 요청은 빼 준다. 넘으면 'model_day_full'.
--      다시 해도 같은 실패(그 그림 탓으로 굳음: bad_char·bad_job과, 같은 곳의 blocked·meshy_input·meshy_rejected(meshy)·
--      bad_input(trellis))는 'model_blocked'로 거절한다(avatar_model_blocked). 화면도 그 그림의 「3D 만들기」를 숨긴다.
--      일꾼의 avatar_model_claim()은 이제 요청한 줄만 요청한 차례로 잡는다. 「지금 걷기에 입은 캐릭터」라서 저절로
--      만들지 않는다. 그것도 일꾼이 넘긴 제공자(p_via, 새 셋째 인자)로 요청한 줄만 준다(위 8). 반환 모양은 0016의
--      {id, user_id, image_path, attempts, bad_fails}에 요청한 때(requested_at)와 요청한 곳(via)을 더한 것이다.
--      제공자를 넘기지 않는 옛 일꾼(인자 이름 둘로 부른다)에게는 아무것도 주지 않는다: 옛 일꾼은 돈이 든 시도를 알리지도,
--      바깥 서비스의 사본을 지우지도 않고, 바깥 서비스로 동의한 요청을 우리 컴퓨터로 만들어 한 번뿐인 3D를 써 버릴 수 있다.
--      이미 만든 3D(0016에서 저절로 만든 것)는 그대로 쓰고 셈에 넣지 않는다. 여러 방향 그림(0015)은
--      그대로 입은 캐릭터에 저절로 그린다.
--   5. 숫자는 0020의 avatar_limits() 한곳에 더한다(역할마다 bench_max, history_max, keep_max, model_max, model_tries_max와
--      모두 합친 model_day_max. null은 제한 없음. bench_max만은 칸 수라 제한 없음이 없다: avatar_bench_max가 1~9로 묶는다).
--      한도는 세션(auth.uid())의 명단 역할로만 정한다. 부르는 쪽이 넘기는 값으로 늘릴 수 없다.
--   6. 그림이 지워지면(status가 deleted로) 트리거가 보관 표시를 지우고, 3D 요청은 바깥 3D 서비스가 아직 작업을 만들지
--      않았고 지금 만드는 중도 아니면(기다림) 셈에서 돌려준다. 실패했으면 셈에서 이미 빠졌으니 요청 표시만 지운다.
--      만드는 중이거나, 작업을 만든 뒤 돌려놓아 기다리거나, 다 만든 3D의 요청은 그림을 지워도 센다(외부 서비스에 이미
--      보냈다). 돈이 든 시도의 누적(model_tries)은 지워도 그대로다. 지우는 길(avatar_forget, 0016)은 다시 정의하지 않는다:
--      트리거라 지우는 길이 늘어도 같다.
--   7. 걷기 엔진이 없는 3D를 다시 묻는 일(avatar_asset_state 'model'): 요청한 그림은 pending. 요청하지 않은 그림은
--      그 주인의 화면에만 pending(걷다가 3D를 요청하면 그 화면이 이어 받는다), 다른 사람의 화면에는 none(다시 묻지 않는다).
--   8. 요청한 곳(model_request_via: meshy | trellis): 사람이 「3D 만들기」를 누를 때 본 확인 글이 알린 곳이다. 사이트가
--      자기 환경 변수(AVATAR_MODEL_PROVIDER)대로 넘기고 DB는 값의 모양만 본다(직접 부르는 사람은 스스로 고른 곳에 동의한
--      셈이다). 사이트와 일꾼이 같은 이름의 환경 변수를 따로, 다른 때에 읽으므로 동의는 줄에 묶어 둔다: 일꾼의 잡기는
--      그 일꾼의 제공자로 요청한 줄만 준다(avatar_model_claim의 p_via). 바깥 3D 서비스(meshy) 일꾼은 Meshy로 보낸다고
--      알린 요청만 받고, 우리 컴퓨터(trellis) 일꾼도 우리 컴퓨터로 요청한 줄만 받는다(Meshy로 고른 손님의 한 번뿐인 3D를
--      다른 곳의 결과로 써 버리지 않게. 두 일꾼을 함께 돌려도 줄이 섞이지 않는다). 다른 곳으로 요청한 줄은 그곳의 일꾼이
--      올 때까지 기다린다. 제공자를 바꿀 때 옛 곳으로 요청하고 아직 잡히지 않은 줄은 worker/avatar/README.md의 SQL로
--      failed('reconsent')로 돌려준다(실패라 셈에서 빠지고 화면이 새 확인 글로 다시 묻는다). 일꾼도 한 번 더 본다:
--      잡은 줄의 via가 제 제공자와 다르면(이 파일 전의 잡기) 보내지 않고 reconsent로 돌려준다.
--
-- 장수 응답(avatar_quota)에서 0019의 kept(보관 중 수, 셋이면 slots_full)는 뺀다. 그 자리에 history(이력 수),
-- keeps(★ 수), models(센 3D 요청 수), model_tries(돈이 든 시도의 누적과 아직 작업을 만들지 않은 진행 중 요청),
-- model_day(오늘 모두의 3D 요청 수)와 그 한도 history_cap·keep_cap·model_cap·model_tries_cap·model_day_cap
-- (null = 제한 없음)을 싣는다. slots는 이 세션의 역할의 작업대 칸 수(손님 3, 가족·관리자 9)가 된다.
-- 0020의 값(used·attempts·total·cap·attempt_cap·total_exempt)은 그대로다.
--
-- 내보내는 순서: 일꾼 → 이 파일 → 일꾼 다시 띄우기 → 사이트.
--   1. 3D를 만드는 일꾼을 모두(plist마다) 이 판(시작 줄의 version이 avatar-worker-6)으로 바꾸거나, 바꾸지 않을 일꾼은
--      AVATAR_MODELS=0으로 다시 띄운다. 옛 일꾼 스냅숏(avatar-worker-4·5)에서 AVATAR_MODEL_PROVIDER만 meshy로 바꾸지 않는다:
--      옛 일꾼은 이 파일 전에는 걷기에 입은 캐릭터를 저절로 바깥 서비스로 보내고, 판에 따라 돈이 든 시도를 알리지 않고
--      (avatar_model_job) 바깥 서비스의 사본도 지우지 않는다. 이 판의 일꾼은 이 파일 전의 DB에서 meshy면 첫 줄(requested_at이
--      없다)을 보내지 않고 돌려놓은 뒤 3D 모형을 멈추고(그 줄의 잡은 횟수 하나는 쓴다), trellis면 지금처럼 입은 캐릭터를
--      우리 컴퓨터에서 만든다(worker/avatar/models.mjs의 processModel, supabase.mjs의 modelClaim).
--   2. 이 파일(모두 합친 하루 3D 요청 상한 100). 이 파일부터 잡기는 제공자를 넘기는 일꾼(이 판)에게 그 제공자로 요청한 줄만 주고,
--      넘기지 않는 옛 일꾼에게는 아무것도 주지 않는다(위 4, DB가 막는다: 일꾼을 잊고 못 바꿔도 돈이 들거나 3D가 엉뚱한 곳에서
--      만들어지지 않는다). select public.avatar_limits() ->> 'model_day_max'가 100인지 본다.
--   3. 일꾼을 모두 다시 띄우고 plist마다 시작 줄의 version(avatar-worker-6)과 models·modelProvider를 본다(업데이트 스크립트가
--      고쳐 쓰지 않는 plist도). 같은 Meshy 키로는 meshy 일꾼 하나만 켜고 나머지는 AVATAR_MODELS=0으로 둔다(키마다 잠금이 하나라
--      둘째부터는 3D가 꺼진다. worker/avatar/README.md의 「Meshy」).
--   4. 사이트(AVATAR_MODEL_PROVIDER를 일꾼의 제공자와 같게). 사이트를 먼저 내도 새 요청은 그 제공자의 일꾼이 올 때까지
--      기다리기만 한다(위 2: 옛 일꾼이 받지 않는다).
--   사이트의 AVATAR_MODELS=0은 사이트의 단추와 라우트만 쉰다(이 파일의 avatar_model_request는 로그인한 손님이 직접
--   부를 수 있다). 돈을 실제로 멈추는 것은 일꾼의 AVATAR_MODELS=0이다(worker/avatar/README.md).
--   사이트는 이 파일 전에도 뒤에도 돈다. 이 파일 전(새 사이트, 옛 DB): 이력·★·3D가 숨고 예전처럼 칸 셋만 보인다.
--   이 파일만 올리고 사이트가 옛것이면: 옛 사이트는 kept가 없어 칸을 미리 막지 않고, 만들기는 이 파일의 작업대
--   돌리기를 따른다(옛 화면은 작업대 밖의 그림을 「칸 밖」으로 보인다). 두 쪽이 다 올라가야 새 화면이 된다.
--   이 파일 뒤에 0020을 다시 올리지 않는다(0020이 avatar_limits·avatar_quota·avatar_begin을 옛것으로 되돌린다).
--   다시 올렸으면 이 파일을 한 번 더 올린다.
-- 여러 번 올려도 된다(add column if not exists, drop … if exists, create or replace). 0016·0019·0020 뒤에 올린다
-- (없으면 맨 앞에서 멈추고 아무것도 바꾸지 않는다).
-- 올린 뒤 확인(모두 읽기만 한다. avatar_model_claim은 부르지 않는다: 줄을 잡아 버린다):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'avatars'
--      and column_name in ('kept_at', 'model_requested_at', 'slot_at', 'model_tries', 'model_request_via', 'slot_freed',
--                          'model_job_at')
--    order by 1;                                                                                     → 일곱 줄
--   select tgname from pg_trigger where tgname in ('avatars_history_guard', 'avatars_bench_restore') and not tgisinternal;
--     → 두 줄
--   select public.avatar_limits();
--     → 역할마다 bench_max·history_max·keep_max·model_max·model_tries_max가 더해졌다
--       (손님 3·10·3·1·2, 가족 9·20·5·1·2, 관리자 9·null·null·null·null). 모두 합친 model_day_max는 100
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'avatars_slot_range';
--     → CHECK (((slot IS NULL) OR ((slot >= 1) AND (slot <= 9))))(작업대 칸 번호 1~9)
--   select has_function_privilege('authenticated', 'public.avatar_bench_max(text)', 'execute');      → f(함수 안에서만)
--   select has_function_privilege('authenticated', 'public.avatar_keep(uuid, boolean)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_to_bench(uuid, smallint)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_model_request(uuid, text)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_model_claim(text, int, text)', 'execute'),
--          has_function_privilege('service_role', 'public.avatar_model_claim(text, int, text)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_model_job(uuid)', 'execute'),
--          has_function_privilege('service_role', 'public.avatar_model_job(uuid)', 'execute');      → t, t, t, f, t, f, t
--   select to_regprocedure('public.avatar_model_request(uuid)'),
--          to_regprocedure('public.avatar_model_claim(text, integer)');                               → null, null(옛 모양은 없다)
--   select count(*) from public.avatars where model_requested_at is not null;
--     → 처음에는 0(요청은 사이트의 「3D 만들기」로만 생긴다). 일꾼이 잡을 줄도 그래서 처음에는 없다
--   select coalesce((select prosrc like '%''requested_at''%' and prosrc like '%''via''%' and prosrc like '%model_request_via = p_via%'
--     from pg_proc where oid = to_regprocedure('public.avatar_model_claim(text, integer, text)')), false);
--     → t(잡기가 일꾼의 제공자로 요청한 줄만 주고 요청한 때와 곳을 함께 준다. 일꾼을 다시 띄우기 전에 본다)
--   select user_id, count(*) from public.avatars where status in ('pending', 'queued', 'drawing', 'ready')
--    group by 1 having count(*) >= 10;
--     → 손님 이력 한도(10)에 이미 닿은 사람. 그 사람이 손님이면 지울 것을 고를 때까지 새로 만들지 못한다(history_full)
--   select count(*) from public.avatars where slot is not null and slot_at is null
--      and status in ('pending', 'queued', 'drawing', 'ready');                                      → 0(작업대 줄은 들어온 때가 있다)
--
-- 되돌리는 법(한 트랜잭션으로: begin; … commit;)
--   먼저 Meshy 일꾼을 멈춘다(되돌리면 0016의 잡기가 입은 캐릭터를 모두 저절로 잡는다. 멈추지 않아도 meshy 일꾼은
--   requested_at이 없는 첫 줄에서 스스로 3D 모형을 멈추지만, 미리 멈추는 것이 깔끔하다).
--   0020 파일을 그대로 다시 올린다(avatar_limits·avatar_quota·avatar_begin과 권한이 0020으로 돌아간다. kept·slots_full도 돌아온다).
--   0019의 「create or replace function public.avatars_slot_assign()」 정의를 다시 올린다(작업대에 들어온 때를 적지 않는 옛것).
--   잡기는 셋째 인자를 더한 모양을 먼저 지운다(남겨 두면 인자 둘로 부르는 0016의 부름이 어느 쪽인지 정하지 못한다):
--   drop function if exists public.avatar_model_claim(text, int, text);
--   0016의 「create or replace function public.avatar_model_claim(…)」과 「… public.avatar_asset_state(…)」 정의를 다시 올리고,
--   새로 만든 잡기의 권한도 0016대로 다시 건다(지웠다 만든 함수는 누구나 부를 수 있게 만들어진다):
--   revoke execute on function public.avatar_model_claim(text, int) from public, anon, authenticated;
--   grant execute on function public.avatar_model_claim(text, int) to service_role;
--   칸 번호를 0019의 범위(1~3)로: 4~9번 칸의 그림은 먼저 작업대에서 뺀다(지우지 않는다. 이력에만 남는다).
--   update public.avatars set slot = null where slot > 3;
--   alter table public.avatars drop constraint if exists avatars_slot_range;
--   alter table public.avatars add constraint avatars_slot_range check (slot is null or slot between 1 and 3);
--   drop trigger if exists avatars_history_guard on public.avatars;
--   drop trigger if exists avatars_bench_restore on public.avatars;
--   drop function if exists public.avatars_history_guard(), public.avatars_bench_restore(), public.avatar_keep(uuid, boolean),
--     public.avatar_to_bench(uuid, smallint), public.avatar_model_request(uuid, text), public.avatar_model_blocked(text, text),
--     public.avatar_model_job(uuid), public.avatar_bench_max(text);
--   drop index if exists public.avatars_model_requests;
--   drop index if exists public.avatars_model_day;
--   alter table public.avatars drop constraint if exists avatars_kept_ready,
--     drop constraint if exists avatars_model_request_state, drop constraint if exists avatars_model_tries_range,
--     drop constraint if exists avatars_model_request_via_known;
--   alter table public.avatars drop column if exists kept_at, drop column if exists model_requested_at,
--     drop column if exists slot_at, drop column if exists model_tries, drop column if exists model_request_via,
--     drop column if exists slot_freed, drop column if exists model_job_at;
--   되돌린 뒤에는 보관 중(지우지 않은)이 셋을 넘는 사람은 셋 아래로 지울 때까지 새로 만들지 못한다(0019의 slots_full).

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.avatars') is null
     or to_regprocedure('public.my_role()') is null
     or to_regprocedure('public.is_guest()') is null
     or to_regprocedure('public.avatar_day_start()') is null
     or to_regprocedure('public.avatar_begin(boolean, integer)') is null then
    raise exception '0021_needs_0001_0003';
  end if;
  -- 3D 칸과 잡기(0016). 그림을 지울 때 모형 칸까지 비우는 지우기(0016의 avatar_forget)가 있어야 트리거의 돌려주기가 맞다.
  -- 잡기는 이 파일이 셋째 인자를 더한 모양으로 바꾸므로 다시 올릴 때는 그 모양이 있다
  if (to_regprocedure('public.avatar_model_claim(text, integer)') is null
      and to_regprocedure('public.avatar_model_claim(text, integer, text)') is null)
     or to_regprocedure('public.avatar_asset_state(uuid, text)') is null
     or (select count(*) from pg_catalog.pg_attribute
          where attrelid = to_regclass('public.avatars') and not attisdropped
            and attname in ('model_status', 'model_attempts', 'model_bad_fails', 'model_claimed_at', 'model_not_before',
                            'model_worker', 'model_maker', 'model_reason')) <> 8 then
    raise exception '0021_needs_0016';
  end if;
  -- 칸 번호(0019)
  if to_regprocedure('public.avatars_slot_assign()') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = to_regclass('public.avatars') and attname = 'slot' and not attisdropped) then
    raise exception '0021_needs_0019';
  end if;
  -- 역할마다의 숫자 표(0020)
  if to_regprocedure('public.avatar_limits()') is null then
    raise exception '0021_needs_0020';
  end if;
end $$;

-- ───────────────────────────── 칸
--   kept_at             ★로 보관한 때(null = 보관 안 함). 다 그린 그림(ready)에만 있다
--   model_requested_at  사람이 3D를 요청한 때. 일꾼은 이 값이 있는 줄만 이 차례로 잡는다.
--                       그림을 지워도 셈에 남을 수 있어 지운 줄(deleted)에도 있을 수 있다(위 6)
--   model_request_via   요청할 때 확인 글이 알린 3D 만드는 곳(meshy | trellis, 위 8)
--   model_job_at        지금 요청으로 바깥 3D 서비스가 처음 작업을 만든 때(위 4. 일꾼이 avatar_model_job으로 적고, 다시 요청하면 비운다)
--   model_tries         이 그림으로 돈이 든 3D 시도의 누적(위 4). 다시 요청해도, 지워도 되돌리지 않는다
--   slot_at             작업대 칸에 들어온 때(칸을 비울 차례를 잰다)
--   slot_freed          이 줄을 만들 때 작업대 칸을 내준 그림(위 2. 이 줄이 다 그려지지 못하면 그 그림을 되돌린다)
alter table public.avatars
  add column if not exists kept_at timestamptz,
  add column if not exists model_requested_at timestamptz,
  add column if not exists model_request_via text,
  add column if not exists model_job_at timestamptz,
  add column if not exists model_tries int not null default 0,
  add column if not exists slot_at timestamptz,
  add column if not exists slot_freed uuid;

alter table public.avatars
  drop constraint if exists avatars_kept_ready,
  drop constraint if exists avatars_model_request_state,
  drop constraint if exists avatars_model_tries_range,
  drop constraint if exists avatars_model_request_via_known;
alter table public.avatars
  add constraint avatars_kept_ready check (kept_at is null or status = 'ready'),
  add constraint avatars_model_request_state check (model_requested_at is null or status in ('ready', 'deleted')),
  add constraint avatars_model_tries_range check (model_tries >= 0),
  add constraint avatars_model_request_via_known check (model_request_via is null or model_request_via in ('meshy', 'trellis'));

-- 작업대 칸 번호의 범위: 0019의 1~3을 1~9로(9는 가장 넓은 역할의 칸 수. 아래 avatar_bench_max가 칸 수를 이 끝 안으로 묶는다).
-- 이미 있는 줄(1~3번)은 그대로 맞는다. 다시 올려도 같다
alter table public.avatars drop constraint if exists avatars_slot_range;
alter table public.avatars add constraint avatars_slot_range check (slot is null or slot between 1 and 9);

-- 이미 작업대에 있는 줄은 만든 때를 들어온 때로 본다(다시 올려도 이미 적힌 때는 그대로)
update public.avatars set slot_at = created_at
 where slot is not null and slot_at is null and status in ('pending', 'queued', 'drawing', 'ready');

-- 일꾼이 몇 초마다 찾는 요청 줄(요청한 차례). 0016의 잡을 차례 색인(avatars_model_queue)은 이제 쓰지 않지만
-- 되돌리기를 쉽게 하려고 그대로 둔다
create index if not exists avatars_model_requests on public.avatars (model_requested_at)
  where status = 'ready' and model_status is null and model_requested_at is not null;
-- 오늘 모두의 3D 요청 수(위 4의 model_day)를 세는 색인
create index if not exists avatars_model_day on public.avatars (model_requested_at)
  where model_requested_at is not null;

-- ───────────────────────────── 숫자(여기만 고치면 된다. 0020의 표에 역할마다 다섯, 모두 합친 것 하나를 더한다)
-- per_day·attempts·total_exempt: 0020 그대로(하루 장수, 거절·실패까지 포함한 시도 수, 모두의 하루 상한 밖인가)
-- bench_max: 작업대 칸 수(집주인 결정: 손님 3, 가족·관리자 9). 칸 수라 제한 없음이 없다: 아래 avatar_bench_max가 1~9로 묶고,
--   칸이 빠졌거나 숫자가 아니면 3(0019의 칸 수)으로 읽는다
-- history_max: 지우지 않은 그림(이력) 수 / keep_max: ★ 보관 수 / model_max: 3D 요청 수(실패는 세지 않는다)
-- model_tries_max: 돈이 든 3D 시도의 누적(실패도 센다. 한 번 만들고, 못 만들면 한 번 더 해 볼 수 있게 2)
-- model_day_max(역할 밖, 모두 합친 값): 하루(한국 시간) 3D 요청 수(집주인 결정: 관리자 빼고 100). total_exempt인 역할은
--   보지도 셈에 들지도 않는다. Meshy 일꾼의 하루 만들기 상한(MESHY_DAILY_MAX, 기본 120)은 이보다 작게 두지 않는다: 일꾼의 셈은
--   결과 탓으로 다시 만든 작업과 관리자의 요청까지 세어, 작으면 여기서 받은 요청이 다음 날까지 기다린다. 둘은 함께 바꾼다
-- null은 제한 없음. 표에서 칸이 빠지면 그 한도는 0이다(모르면 막는다. avatar_quota가 그렇게 읽는다. bench_max만 위처럼 3).
create or replace function public.avatar_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'guest', jsonb_build_object('per_day', 10, 'attempts', 22, 'total_exempt', false, 'bench_max', 3,
                                'history_max', 10, 'keep_max', 3, 'model_max', 1, 'model_tries_max', 2),
    'family', jsonb_build_object('per_day', 20, 'attempts', 42, 'total_exempt', false, 'bench_max', 9,
                                 'history_max', 20, 'keep_max', 5, 'model_max', 1, 'model_tries_max', 2),
    'admin', jsonb_build_object('per_day', null, 'attempts', null, 'total_exempt', true, 'bench_max', 9,
                                'history_max', null, 'keep_max', null, 'model_max', null, 'model_tries_max', null),
    'model_day_max', 100
  )
$$;

-- ───────────────────────────── 작업대 칸 수(역할 → 칸 수)
-- 표의 bench_max를 1~9(칸 번호 범위 검사의 끝)로 묶는다. 칸이 빠졌거나 숫자가 아니면(null 포함) 3: 표를 고치다 칸을 지워도
-- 작업대가 사라지거나 넓어지지 않는다. 역할 → 표의 열쇠는 avatar_quota와 같다(admin·family는 그대로, 그 밖은 guest).
-- 이 함수를 부르는 함수들(avatar_quota·avatar_begin·avatar_to_bench, 칸 트리거)은 세션(auth.uid())의 역할이나 줄 주인의
-- 명단 역할만 넘긴다. 아무도 직접 부르지 못한다(맨 아래 권한 정리).
create or replace function public.avatar_bench_max(p_role text) returns int
language sql stable set search_path = '' as $$
  select case when jsonb_typeof(s.v) = 'number' then least(greatest(floor(s.v::text::numeric), 1), 9)::int else 3 end
    from (select public.avatar_limits()
                   -> (case p_role when 'admin' then 'admin' when 'family' then 'family' else 'guest' end) -> 'bench_max' as v) s
$$;

-- ───────────────────────────── 장수와 칸 수(0020에서 kept를 빼고 이력·보관·3D를 더한다)
-- used·attempts·total·cap·attempt_cap·total_exempt: 0020 그대로
-- slots: 이 세션의 역할의 작업대 칸 수(avatar_bench_max: 손님 3, 가족·관리자 9. 사이트가 이 수만큼 칸을 그린다)
-- history: 지우지 않은 내 그림 수(그리는 중 포함) / keeps: ★로 보관한 내 그림 수
-- models: 센 내 3D 요청 수(요청이 있고 실패하지 않은 줄. 지운 그림의 것도 위 6대로 남은 것은 센다)
-- model_tries: 돈이 든 내 3D 시도의 누적(지운 그림의 줄까지 모두 더한다)과, 아직 작업을 만들지 않은 진행 중 요청
--   (다 그린 그림에서 기다리거나 만드는 중. 작업을 만들면 누적으로 옮겨 가고, 만들지 못하고 끝나면 빠진다)
-- model_day: 오늘(한국 시간) 모두의 3D 요청 수. 모두의 상한 밖 역할의 요청과, 작업을 만들지 못하고 실패한 요청은 빼고 센다
-- history_cap·keep_cap·model_cap·model_tries_cap: 이 세션의 역할의 한도(null = 제한 없음, 표에서 빠지면 0)
-- model_day_cap: 모두 합친 하루 3D 상한(이 세션의 역할이 그 밖이면 null, 표에서 빠지면 0)
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
                  and not (a.status = 'deleted' and a.queued_at is null)
                  and coalesce(lim.t -> (case r.role when 'admin' then 'admin' when 'family' then 'family' else 'guest' end)
                                     -> 'total_exempt', 'false'::jsonb) <> 'true'::jsonb)
             else 0 end,
    'slots', public.avatar_bench_max(lim.k),
    'history', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.status in ('pending', 'queued', 'drawing', 'ready')),
    'keeps', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.kept_at is not null and a.status = 'ready'),
    'models', (select count(*) from public.avatars a
              where a.user_id = auth.uid() and a.model_requested_at is not null
                and a.model_status is distinct from 'failed'),
    'model_tries', (select coalesce(sum(a.model_tries), 0) from public.avatars a where a.user_id = auth.uid())
                 + (select count(*) from public.avatars a
                     where a.user_id = auth.uid() and a.status = 'ready' and a.model_requested_at is not null
                       and a.model_job_at is null and (a.model_status is null or a.model_status = 'drawing')),
    'model_day', case when public.is_guest() then
              (select count(*) from public.avatars a
                 left join public.roster r on r.claimed_by = a.user_id and r.revoked_at is null
                where a.model_requested_at >= public.avatar_day_start()
                  and (a.model_status is distinct from 'failed' or a.model_job_at is not null)
                  and coalesce(lim.t -> (case r.role when 'admin' then 'admin' when 'family' then 'family' else 'guest' end)
                                     -> 'total_exempt', 'false'::jsonb) <> 'true'::jsonb)
             else 0 end,
    'cap', coalesce(lim.t -> lim.k -> 'per_day', '0'::jsonb),
    'attempt_cap', coalesce(lim.t -> lim.k -> 'attempts', '0'::jsonb),
    'total_exempt', coalesce(lim.t -> lim.k -> 'total_exempt', 'false'::jsonb) = 'true'::jsonb,
    'history_cap', coalesce(lim.t -> lim.k -> 'history_max', '0'::jsonb),
    'keep_cap', coalesce(lim.t -> lim.k -> 'keep_max', '0'::jsonb),
    'model_cap', coalesce(lim.t -> lim.k -> 'model_max', '0'::jsonb),
    'model_tries_cap', coalesce(lim.t -> lim.k -> 'model_tries_max', '0'::jsonb),
    'model_day_cap', case when coalesce(lim.t -> lim.k -> 'total_exempt', 'false'::jsonb) = 'true'::jsonb then 'null'::jsonb
                          else coalesce(lim.t -> 'model_day_max', '0'::jsonb) end
  )
  from lim
$$;

-- ───────────────────────────── 작업대 칸 번호(0019의 트리거 함수를 다시 정의: 칸 수를 역할로, 들어온 때를 함께 적는다)
-- 칸 번호 없이 넣으면 줄 주인의 작업대(1~칸 수)에서 비어 있는 가장 작은 번호를 준다. 다 찼으면 비워 둔다.
-- 만들기(avatar_begin)는 칸을 골라 번호를 붙여 넣으므로 여기를 지나지 않는다. 번호 없이 넣는 길은 비밀 키·관리 연결뿐이라
-- 칸 수는 줄 주인의 역할로 본다: 세션이 곧 주인이면 세션의 역할(my_role), 아니면 주인이 묶인 명단 줄의 역할.
create or replace function public.avatars_slot_assign() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max int;
begin
  if new.slot is null and new.status in ('pending', 'queued', 'drawing', 'ready') then
    v_max := public.avatar_bench_max(case when new.user_id = auth.uid() then public.my_role()
                                          else (select r.role from public.roster r
                                                 where r.claimed_by = new.user_id and r.revoked_at is null) end);
    select min(n)::smallint into new.slot
      from generate_series(1, v_max) n
     where not exists (select 1 from public.avatars a
                        where a.user_id = new.user_id and a.slot = n
                          and a.status in ('pending', 'queued', 'drawing', 'ready'));
  end if;
  if new.slot is not null and new.slot_at is null then
    new.slot_at := now();
  end if;
  return new;
end $$;
drop trigger if exists avatars_slot_assign on public.avatars;
create trigger avatars_slot_assign before insert on public.avatars
  for each row execute function public.avatars_slot_assign();

-- ───────────────────────────── 그림이 지워질 때(위 6)
-- 보관 표시를 지운다. 3D 요청은 바깥 3D 서비스가 아직 작업을 만들지 않았고 지금 만드는 중도 아니면(기다림) 돌려주고(셈과
-- 하루 수에서 빠진다), 실패했으면 요청 표시만 지운다(셈에서는 이미 빠졌다). 만드는 중이거나, 작업을 만든 뒤 돌려놓아
-- 기다리거나, 다 만든 3D의 요청은 남는다(센다). 돈이 든 시도의 누적(model_tries)은 어느 쪽이든 그대로다.
-- 고치기 전의 값(old)으로 본다: 지우기(avatar_forget)는 같은 고치기에서 모형 칸을 모두 비운다.
create or replace function public.avatars_history_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'deleted' and old.status is distinct from 'deleted' then
    new.kept_at := null;
    if old.model_requested_at is not null
       and (old.model_status = 'failed' or (old.model_status is null and old.model_job_at is null)) then
      new.model_requested_at := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists avatars_history_guard on public.avatars;
create trigger avatars_history_guard before update of status on public.avatars
  for each row execute function public.avatars_history_guard();

-- ───────────────────────────── 칸을 내준 그림 되돌리기(위 2)
-- 칸을 비우고 시작한 줄이 다 그려지지 못하면(거절·실패·그리다 그만둠) 그 칸을 내준 그림을 그 칸에 되돌린다.
-- 그사이 그 그림이 지워졌거나 다른 칸에 있거나, 그 칸을 지금 다른 그림이 쓰면 그대로 둔다.
-- 고친 뒤에(after) 본다: 다 그려지지 못한 줄은 이미 작업대(보관 중) 밖이라 같은 칸 번호와 겹치지 않는다.
create or replace function public.avatars_bench_restore() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('pending', 'queued', 'drawing') and new.status in ('rejected', 'failed', 'deleted')
     and old.slot_freed is not null and new.slot is not null then
    update public.avatars a set slot = new.slot
     where a.id = old.slot_freed and a.user_id = new.user_id and a.slot is null
       and a.status in ('pending', 'queued', 'drawing', 'ready')
       and not exists (select 1 from public.avatars b
                        where b.user_id = new.user_id and b.slot = new.slot
                          and b.status in ('pending', 'queued', 'drawing', 'ready'));
  end if;
  return null;
end $$;
drop trigger if exists avatars_bench_restore on public.avatars;
create trigger avatars_bench_restore after update of status on public.avatars
  for each row execute function public.avatars_bench_restore();

-- ───────────────────────────── 만들기 시작(0020과 같은 시그니처)
-- 결과: {"ok":true,"id":...,"slot":1~칸 수,"freed":칸을 내준 그림 id 또는 null} 또는
--       {"ok":false,"reason":"not_guest|consent|user_limit|attempt_limit|total_limit|history_full"}
-- 확인 순서: 내 장수 → 내 시도 → 모두의 상한 → 이력. 하루 규칙을 먼저 본다(오늘 못 만드는 사람에게 지우라고 하지 않는다).
-- 작업대는 1~칸 수(avatar_quota의 slots: 세션의 역할로만)다. 빈 칸이 있으면 가장 작은 번호에 넣고, 다 찼으면 그 가운데 한 칸을
-- 비워(위 2의 차례: ★도 입은 것도 아닌 다 그린 그림 → 그리는 중 → ★이나 입은 그림, 같은 무리 안에서는 작업대에 가장 오래
-- 있던 것) 그 번호를 새 줄에 붙여 넣는다. 칸 수 밖의 번호(역할이 줄어 남은 칸)는 비우지도 주지도 않는다.
-- 새 줄에 비운 그림을 적는다(slot_freed: 새 그림이 다 그려지지 못하면 avatars_bench_restore가 그 그림을 되돌린다).
-- 비운 그림의 slot_at은 둔다.
-- 잠금: 모두의 상한 때문에 하나(0003부터), 그다음 이 사람의 작업대·보관·요청을 고치는 다른 함수와 겹치지 않게 사람마다 하나.
create or replace function public.avatar_begin(p_consented boolean, p_total_cap int default 150) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_q jsonb;
  v_id uuid;
  v_slot smallint;
  v_freed uuid;
  v_max int;
begin
  if auth.uid() is null or not public.is_guest() then
    return jsonb_build_object('ok', false, 'reason', 'not_guest');
  end if;
  if p_consented is not true then return jsonb_build_object('ok', false, 'reason', 'consent'); end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_begin'));
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(auth.uid()::text));
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
  if (v_q ->> 'history_cap') is not null and (v_q ->> 'history')::int >= (v_q ->> 'history_cap')::int then
    return jsonb_build_object('ok', false, 'reason', 'history_full');
  end if;
  v_max := (v_q ->> 'slots')::int;
  select min(n)::smallint into v_slot
    from generate_series(1, v_max) n
   where not exists (select 1 from public.avatars a
                      where a.user_id = auth.uid() and a.slot = n
                        and a.status in ('pending', 'queued', 'drawing', 'ready'));
  if v_slot is null then
    -- 작업대(1~칸 수)가 다 찼다: 한 칸을 비우고 그 번호를 새 줄에 준다
    select a.id, a.slot into v_freed, v_slot from public.avatars a
     where a.user_id = auth.uid() and a.slot between 1 and v_max
       and a.status in ('pending', 'queued', 'drawing', 'ready')
     order by (a.kept_at is not null
               or exists (select 1 from public.profiles p
                           where p.user_id = a.user_id and p.look ->> 'kind' = 'photo'
                             and p.look ->> 'url' = '/api/avatar/' || a.id::text)),
              a.status <> 'ready', coalesce(a.slot_at, a.created_at), a.created_at, a.id
     limit 1
     for update;
    update public.avatars set slot = null where id = v_freed;
  end if;
  insert into public.avatars (user_id, status, consent_at, slot, slot_freed)
  values (auth.uid(), 'pending', now(), v_slot, v_freed)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'slot', v_slot, 'freed', v_freed);
end $$;

-- ───────────────────────────── ★ 보관(본인)
-- p_on 참: 보관한다. 다 그린 내 그림만, 역할의 keep_max까지(이미 보관이면 그대로 ok).
-- p_on 거짓: 보관을 뺀다(지우지 않은 내 그림이면 언제나). 3D 요청은 그대로 남는다.
-- 결과: {"ok":true,"kept":true|false} 또는 {"ok":false,"reason":"not_guest|not_found|not_ready|keep_full"[, "cap":n]}
create or replace function public.avatar_keep(p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_q jsonb;
begin
  if auth.uid() is null or not public.is_guest() then
    return jsonb_build_object('ok', false, 'reason', 'not_guest');
  end if;
  if p_on is null then raise exception 'bad_on' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(auth.uid()::text));
  select * into v from public.avatars
   where id = p_id and user_id = auth.uid() and status in ('pending', 'queued', 'drawing', 'ready')
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not p_on then
    update public.avatars set kept_at = null where id = p_id;
    return jsonb_build_object('ok', true, 'kept', false);
  end if;
  if v.status <> 'ready' or v.image_path is null then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;
  if v.kept_at is not null then return jsonb_build_object('ok', true, 'kept', true); end if;
  v_q := public.avatar_quota();
  if (v_q ->> 'keep_cap') is not null and (v_q ->> 'keeps')::int >= (v_q ->> 'keep_cap')::int then
    return jsonb_build_object('ok', false, 'reason', 'keep_full', 'cap', v_q -> 'keep_cap');
  end if;
  update public.avatars set kept_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'kept', true);
end $$;

-- ───────────────────────────── 이력에서 작업대로(본인)
-- 작업대는 1~칸 수(세션의 역할로만: 손님 3, 가족·관리자 9). 칸 수 밖의 번호(역할이 줄어 남은 칸)에 있는 그림은 이력에 있는
-- 것으로 본다.
-- p_slot null: 비어 있는 가장 작은 칸에 놓는다(빈 칸이 없으면 'bench_full': 화면이 바꿀 칸을 고르게 한다).
-- p_slot 1~칸 수: 그 칸에 놓는다. 그 칸에 다른 그림이 있으면, 꺼내는 그림이 이력에서 왔을 때는 그 그림이 이력으로 가고,
-- 작업대의 다른 칸에서 왔을 때는 두 그림이 칸을 맞바꾼다. 이미 그 칸이면 그대로 ok.
-- 지우지 않은 내 그림이면 그리는 중이어도 된다. 결과: {"ok":true,"slot":n,"moved":자리를 옮긴 그림 id 또는 null}
--   또는 {"ok":false,"reason":"not_guest|not_found|bench_full"}. 칸 번호가 1~칸 수가 아니면 오류(bad_slot).
create or replace function public.avatar_to_bench(p_id uuid, p_slot smallint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_max int;
  v_cur smallint;
  v_slot smallint := p_slot;
  v_moved uuid;
begin
  if auth.uid() is null or not public.is_guest() then
    return jsonb_build_object('ok', false, 'reason', 'not_guest');
  end if;
  v_max := public.avatar_bench_max(public.my_role());
  if p_slot is not null and (p_slot < 1 or p_slot > v_max) then raise exception 'bad_slot' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(auth.uid()::text));
  select * into v from public.avatars
   where id = p_id and user_id = auth.uid() and status in ('pending', 'queued', 'drawing', 'ready')
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  -- 꺼내는 그림의 지금 작업대 칸(칸 수 밖이면 이력에서 오는 것)
  v_cur := case when v.slot between 1 and v_max then v.slot end;
  if v_slot is null then
    if v_cur is not null then return jsonb_build_object('ok', true, 'slot', v_cur, 'moved', null); end if;
    select min(n)::smallint into v_slot
      from generate_series(1, v_max) n
     where not exists (select 1 from public.avatars a
                        where a.user_id = auth.uid() and a.slot = n
                          and a.status in ('pending', 'queued', 'drawing', 'ready'));
    if v_slot is null then return jsonb_build_object('ok', false, 'reason', 'bench_full'); end if;
  elsif v_cur = v_slot then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'moved', null);
  end if;
  select a.id into v_moved from public.avatars a
   where a.user_id = auth.uid() and a.slot = v_slot and a.id <> p_id
     and a.status in ('pending', 'queued', 'drawing', 'ready')
   for update;
  if v_moved is not null then
    -- 같은 칸 번호가 잠깐이라도 둘이 되지 않게(고유 색인) 꺼내는 그림의 칸을 먼저 비운다
    update public.avatars set slot = null where id = p_id;
    if v_cur is null then
      update public.avatars set slot = null, slot_at = null where id = v_moved;
    else
      update public.avatars set slot = v_cur where id = v_moved;
    end if;
  end if;
  update public.avatars set slot = v_slot, slot_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'slot', v_slot, 'moved', v_moved);
end $$;

-- ───────────────────────────── 다시 해도 같은 실패인가(위 4)
-- 그 그림 자체가 문제인 까닭(저장소의 그림이 PNG가 아님, 잡은 줄의 모양이 틀림)과, 요청할 곳(p_via)이 받지 않는다고 한
-- 까닭(meshy: 내용 검사·입력 거절, trellis: 입력 거절). 다른 곳의 거절은 막지 않는다(그곳은 받을 수 있다).
-- 사이트의 같은 판정은 src/lib/avatar/rules.ts의 MODEL_BLOCKED(시험이 두 목록을 맞춰 본다).
create or replace function public.avatar_model_blocked(p_reason text, p_via text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_reason in ('bad_char', 'bad_job')
                  or (p_via = 'meshy' and p_reason in ('blocked', 'meshy_input', 'meshy_rejected'))
                  or (p_via = 'trellis' and p_reason in ('bad_input')), false)
$$;

-- ───────────────────────────── 3D 요청(본인)
-- ★로 보관한 다 그린 내 그림 하나. 역할의 model_max까지(실패한 요청은 세지 않는다), model_tries_max까지(돈이 든 시도의
-- 누적과 진행 중 요청), 모두 합친 model_day_max까지(오늘, 모두의 상한 밖 역할은 보지 않는다. 위 4).
-- p_via: 요청하는 사람에게 확인 글이 알린 3D 만드는 곳(meshy | trellis, 위 8). 그 밖의 값은 오류(bad_via).
-- 이미 3D가 있거나(0016에서 만든 것 포함) 요청해서 기다리거나 만드는 중이면 그대로 ok(already). 다시 보내지 않는다.
-- 실패로 굳은 그림을 다시 요청하면 모형 칸을 처음부터(잡은 횟수 포함) 다시 센다. 누적(model_tries)은 그대로이고,
-- 새 요청의 작업을 만들면 일꾼의 avatar_model_job이 하나 올린다. 다시 해도 같은 실패로 굳은 그림은 다시 보내지 않는다(model_blocked).
-- 잠금: 모두의 하루 상한 때문에 하나, 그다음 이 사람의 작업대·보관·요청을 고치는 다른 함수와 겹치지 않게 사람마다 하나.
-- 결과: {"ok":true,"already":true|false} 또는
--       {"ok":false,"reason":"not_guest|not_found|not_ready|model_blocked|not_kept|model_full|model_tries_full|model_day_full"
--        [, "cap":n]}
drop function if exists public.avatar_model_request(uuid);
create or replace function public.avatar_model_request(p_id uuid, p_via text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_q jsonb;
begin
  if auth.uid() is null or not public.is_guest() then
    return jsonb_build_object('ok', false, 'reason', 'not_guest');
  end if;
  if p_via is null or p_via not in ('meshy', 'trellis') then raise exception 'bad_via' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_model_day'));
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(auth.uid()::text));
  select * into v from public.avatars
   where id = p_id and user_id = auth.uid() and status in ('pending', 'queued', 'drawing', 'ready')
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v.status <> 'ready' or v.image_path is null then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;
  if v.model_status = 'ready'
     or (v.model_requested_at is not null and v.model_status is distinct from 'failed') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v.model_status = 'failed' and public.avatar_model_blocked(v.model_reason, p_via) then
    return jsonb_build_object('ok', false, 'reason', 'model_blocked');
  end if;
  if v.kept_at is null then return jsonb_build_object('ok', false, 'reason', 'not_kept'); end if;
  v_q := public.avatar_quota();
  if (v_q ->> 'model_cap') is not null and (v_q ->> 'models')::int >= (v_q ->> 'model_cap')::int then
    return jsonb_build_object('ok', false, 'reason', 'model_full', 'cap', v_q -> 'model_cap');
  end if;
  if (v_q ->> 'model_tries_cap') is not null and (v_q ->> 'model_tries')::int >= (v_q ->> 'model_tries_cap')::int then
    return jsonb_build_object('ok', false, 'reason', 'model_tries_full', 'cap', v_q -> 'model_tries_cap');
  end if;
  if (v_q ->> 'model_day_cap') is not null and (v_q ->> 'model_day')::int >= (v_q ->> 'model_day_cap')::int then
    return jsonb_build_object('ok', false, 'reason', 'model_day_full');
  end if;
  -- 0016이 저절로 잡아 만드는 중(drawing)이던 줄은 그대로 이어 만든다(요청으로 센다). 그 밖에는 모형 칸을 처음부터.
  -- 새 요청이라 작업을 만든 때(model_job_at)는 비운다(이 요청의 작업을 만들면 일꾼이 다시 적고 누적이 하나 는다)
  update public.avatars
     set model_requested_at = now(),
         model_request_via = p_via,
         model_job_at = null,
         model_status = case when model_status = 'drawing' then model_status end,
         model_attempts = case when model_status = 'drawing' then model_attempts else 0 end,
         model_bad_fails = case when model_status = 'drawing' then model_bad_fails else 0 end,
         model_claimed_at = case when model_status = 'drawing' then model_claimed_at end,
         model_worker = case when model_status = 'drawing' then model_worker end,
         model_not_before = case when model_status = 'drawing' then model_not_before end,
         model_maker = case when model_status = 'drawing' then model_maker end,
         model_reason = case when model_status = 'drawing' then model_reason end
   where id = p_id;
  return jsonb_build_object('ok', true, 'already', false);
end $$;

-- ───────────────────────────── 3D 잡기(일꾼 전용, service_role. 0016의 두 인자에 제공자 p_via를 더한다)
-- 요청한 줄(model_requested_at) 가운데 일꾼의 제공자(p_via: meshy | trellis)로 요청한 줄(model_request_via)만 요청한 차례로
-- 잡는다(위 8). 입은 캐릭터라서 저절로 잡지 않는다.
-- p_via가 없으면(null: 이 인자를 모르는 옛 일꾼이 인자 이름 둘로 부른다) 아무것도 주지 않는다(위 4). 다른 값은 오류(bad_via).
-- 돌려놓은 줄(model_status null, model_not_before가 지났다)도 다시 잡는다. 임대가 끝난 줄을 되돌리고 여덟 번에서
-- 굳히는 것, 열 번을 마지막 울타리로 두는 것은 0016 그대로다.
-- 결과: null(할 일 없음) 또는 {id, user_id, image_path, attempts, bad_fails, requested_at, via}. 살아 있음(avatar_worker_beat)도 남긴다.
-- requested_at(요청한 때)과 via(요청할 때 알린 곳)는 0016의 모양에 더한 값이다: 바깥 3D 서비스 일꾼은 요청한 때가 있고
-- via가 자기(meshy)인 줄만 보낸다(0016의 잡기에는 둘 다 없다. 일꾼이 한 번 더 본다).
-- 0016의 두 인자 모양은 지운다(남겨 두면 인자 둘로 부르는 옛 일꾼의 부름이 어느 쪽인지 정하지 못한다). 다시 올려도 같다.
drop function if exists public.avatar_model_claim(text, int);
create or replace function public.avatar_model_claim(p_worker text, p_lease_seconds int default 600, p_via text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 600), 60));
begin
  if p_via is null then return null; end if;
  if p_via not in ('meshy', 'trellis') then raise exception 'bad_via' using errcode = '22023'; end if;
  perform public.avatar_worker_beat(p_worker);
  update public.avatars
     set model_status = case when model_attempts >= 8 then 'failed' end,
         model_reason = case when model_attempts >= 8 then 'timeout' end,
         model_claimed_at = null, model_worker = null, model_not_before = null
   where model_status = 'drawing' and model_claimed_at < now() - v_lease;
  loop
    -- 이 일꾼의 제공자로 요청한 것 가운데 먼저 요청한 것부터
    select * into v from public.avatars
     where status = 'ready' and image_path is not null and model_status is null
       and model_requested_at is not null and model_request_via = p_via
       and (model_not_before is null or model_not_before <= now())
     order by model_requested_at, id limit 1 for update skip locked;
    if not found then return null; end if;
    exit when v.model_attempts < 10;
    update public.avatars set model_status = 'failed', model_reason = 'attempts', model_not_before = null
     where id = v.id;
  end loop;
  update public.avatars
     set model_status = 'drawing', model_attempts = model_attempts + 1, model_claimed_at = now(),
         model_worker = p_worker, model_not_before = null, model_reason = null
   where id = v.id;
  return jsonb_build_object('id', v.id, 'user_id', v.user_id, 'image_path', v.image_path,
                            'attempts', v.model_attempts + 1, 'bad_fails', v.model_bad_fails,
                            'requested_at', v.model_requested_at, 'via', v.model_request_via);
end $$;

-- ───────────────────────────── 돈이 든 작업을 만들었다(일꾼 전용, service_role. 위 4)
-- 바깥 3D 서비스가 이 그림의 작업을 만든(작업 id를 받은) 바로 뒤에 일꾼이 부른다. 이어 보는 작업도 다시 알린다(앞의 알림이
-- 끊겼을 수 있다). 지금 요청에서 처음이면 누적(model_tries)을 하나 올리고 그때(model_job_at)를 적는다. 같은 요청에서
-- 결과가 이상해 새로 만든 둘째 작업과 다시 온 알림은 그대로다. 그사이 본인이 그림을 지웠어도 센다(값은 이미 냈다).
-- 결과: 그 줄이 있으면 true(이번에 셌거나 이미 셌다), 없으면 false
create or replace function public.avatar_model_job(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.avatars set model_job_at = now(), model_tries = model_tries + 1
   where id = p_id and model_job_at is null;
  return found or exists (select 1 from public.avatars where id = p_id);
end $$;

-- ───────────────────────────── 없는 파생 파일: 기다리면 생기는가(0016과 같은 시그니처. 모형 쪽만 바뀐다)
--   ready    지금 있다 / pending  기다리면 생길 수 있다 / none  만들 계획이 없다(다시 묻지 않는다)
-- 방향 그림 묶음(views)은 0016 그대로. 3D 모형(model):
--   실패로 굳음 → none, 다 만듦 → ready, 요청했거나(기다림·만드는 중) 0016에서 잡혀 만드는 중 → pending,
--   요청하지 않은 다 그린 그림 → 그 주인에게만 pending(걷다가 요청하면 그 화면이 이어 받는다), 다른 사람에게는 none.
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
  if v.status <> 'ready' or v.model_status = 'failed' then return 'none'; end if;
  if v.model_status = 'ready' then return 'ready'; end if;
  if v.model_status = 'drawing' or v.model_requested_at is not null then return 'pending'; end if;
  return case when v.user_id = auth.uid() then 'pending' else 'none' end;
end $$;

-- ───────────────────────────── 권한 정리(0016·0019·0020과 같은 모양)
revoke execute on function public.avatar_limits(), public.avatar_bench_max(text), public.avatar_quota(), public.avatar_begin(boolean, int),
  public.avatars_slot_assign(), public.avatars_history_guard(), public.avatars_bench_restore(),
  public.avatar_model_blocked(text, text),
  public.avatar_keep(uuid, boolean), public.avatar_to_bench(uuid, smallint), public.avatar_model_request(uuid, text),
  public.avatar_model_claim(text, int, text), public.avatar_model_job(uuid), public.avatar_asset_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.avatar_quota(), public.avatar_begin(boolean, int),
  public.avatar_keep(uuid, boolean), public.avatar_to_bench(uuid, smallint), public.avatar_model_request(uuid, text),
  public.avatar_asset_state(uuid, text)
  to authenticated;
-- 비밀 키(service_role)만: 잡기와 돈이 든 작업 알리기(일꾼)
grant execute on function public.avatar_model_claim(text, int, text), public.avatar_model_job(uuid) to service_role;
