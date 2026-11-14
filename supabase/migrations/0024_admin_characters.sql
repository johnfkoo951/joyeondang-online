-- 조연당 온라인 0024: 캐릭터 관리 콘솔(집주인)과 3D 판 번호(2026-11-12)
--
-- 무엇을·왜
--   집주인 요청: 「캐릭터 2D 한 것들 중에 골라서 3D 진행하는 기능(관리자 계정에만)」, 「캐릭터 생성 전체 관리 콘솔을 관리 화면 아래에:
--   3D가 이상하게 나온 사람이나 문제 있는 것을 집주인이 지우거나 새로 만들어 줄 수 있게」.
--   그리고 3D 모형은 같은 주소(<uid>/models/<id>.v1.glb)에 덮어쓰는데 사이트가 /api/avatar/<id>/model을 한 시간 캐시해서,
--   다시 만든 3D가 한 시간까지 옛 모형으로 보였다(실제로 일어났다). 그래서 3D에 판 번호를 붙인다.
--   1. 판 번호(model_ver, 기본 1). 3D가 다 될 때마다(ready로 바뀌거나, 다 된 채 만든 서비스(model_maker)가 바뀌면) 트리거
--      avatars_model_track이 하나 올린다. 일꾼 코드는 고치지 않는다. 손으로 고친 줄도 같은 트리거를 지나므로 다음 판부터 맞다.
--      판 번호는 줄지 않는다(손으로 낮춰도 그대로 둔다: 옛 판의 주소에 새 모형이 묶이지 않게).
--      사이트는 모형 주소를 /api/avatar/<id>/model?v=<판>으로 내고 판이 붙은 주소는 한 시간 캐시한다(예전 판 없는 주소와 같은 수명.
--      오래 두지 않는다: 지운 3D가 본 사람들의 기기에 오래 남지 않게). 판 없이 물으면 지금 판의 주소로 보낸다(302, 캐시하지 않는다).
--      걷기 엔진은 그대로 판 없이 묻고 따라간다. 같은 서비스 이름으로 파일만 손으로 바꿨으면 판을 손으로 하나 올린다(아래 「손으로」).
--   2. 관리자 함수. 모두 is_admin()을 먼저 보고, 표는 클라이언트가 직접 읽지 못한다(새 표 둘은 정책이 없다):
--      admin_characters(…)          지우지 않은 모든 캐릭터(거르기, 역할, 만든 서비스, 이름 검색, 내 것만, 차례대로 넘기기).
--                                   원본 사진 경로는 돌려주지 않는다(원본이 있는지만 has_original).
--      admin_character_counts(mine) 거르기 칩의 수(역할·만든 서비스마다 포함)
--      admin_avatar_remake_model(id, via, told)  3D 다시 만들기(아래 3)
--      admin_avatar_forget_model(id)              3D 지우기(모형 파일은 버릴 목록으로)
--      admin_avatar_redraw(id)                    그림 다시 그리기(아래 4)
--      admin_avatar_forget(id)                    캐릭터 지우기(아래 5)
--      admin_character_file(id, kind)             관리자용 그림·모형 읽기의 경로와 판(사이트가 비밀 키로 읽어 내보낸다. 원본 사진은 없다)
--      admin_avatar_log(limit, id)                조작 기록(누가, 언제, 어느 캐릭터, 주인, 무엇을, 동의 근거)
--   3. 3D 다시 만들기: 다 그린 그림이면 3D가 있든 없든(없음·기다림·실패·다 됨) 요청 상태로 되돌린다. 지금 만드는 중이면
--      'busy'(일꾼이 30분 넘게 잡고 있으면 멈춘 것으로 보고 되돌린다. 목록의 「멈춘 것 같아요」도 만드는 중이면 같은 30분으로 잰다).
--      다시 해도 같은 실패로 굳은 그림은 0021과 같이 'model_blocked'(화면은 그 단추를 두지 않고 그림 다시 그리기를 알린다).
--      이전 모형은 새 모형이 될 때까지 그대로 보인다(model_prev): 파일은 일꾼이 새 모형을 올릴 때 같은 자리에 덮이고, 그때까지
--      avatar_model_shown()과 저장소 정책 avatars_guest_select_models_prev가 옛 파일을 지금 판으로 내준다. 새로 만들다 실패해도
--      이전 모형은 그대로 보인다(관리 화면에서 3D 지우기로 내린다).
--      주인의 셈: 0021의 셈(avatar_quota)은 다시 정의하지 않는다(다른 가지가 같은 함수를 고친다). 그래서 관리자가 만든 3D도
--      주인의 3D 요청 수(models, 손님·가족 한 번)에는 든다(주인이 그 그림을 지우면 빠진다). 화면의 확인 글이 그렇게 알린다.
--      줄의 값으로 맞추는 것은 둘이다: 요청한 때(model_requested_at)를 하루 앞당겨 적어 오늘 모두의 3D 요청 수(model_day)에 들지
--      않게 하고(일꾼의 차례에서는 사람들의 요청보다 앞선다. 일꾼 쪽 Meshy 하루 상한에는 든다), 진짜 때는 model_admin_at과 기록에
--      남긴다. 일꾼이 돈이 든 작업을 알려도(avatar_model_job) 트리거가 주인의 누적(model_tries)을 올리지 않는다.
--      (작업을 만들기 전까지는 0021의 「진행 중 요청」으로 주인의 시도에 한 번 잡힌다. 작업을 만들거나 끝나면 빠진다.)
--      바깥 3D 서비스(Meshy, 미국)로 보내는 것은 동의 문제다. 사이트가 지금 3D를 만드는 곳(p_via)을 넘긴다:
--        trellis(우리 컴퓨터)   바깥으로 보내지 않는다. 근거 local
--        meshy                  주인이 관리자면 owner_admin, 그 그림의 요청 줄에 meshy 동의(model_request_via)가 있으면 owner_meshy
--                               (본인이 Meshy 확인 글을 보고 요청했거나, 앞서 집주인이 본인에게 들었다고 확인한 그림. 그림마다 본다),
--                               아니면(옛 「우리 컴퓨터」 안내만 본 사람) 집주인이 「본인에게 Meshy로 보내도 된다고 들었어요」를 확인해야만
--                               (p_told) told_by_owner. 확인이 없으면 'consent_needed'로 거절하고 아무것도 바꾸지 않는다.
--                               3D를 지워도 요청 줄의 동의(model_request_via)는 남긴다(동의의 기록이다).
--      근거는 조작 기록에 남는다. 보낸 곳(meshy | trellis)은 0021처럼 요청 줄에 적는다(바깥 3D 서비스 일꾼은 그곳으로 요청한 줄만 보낸다).
--   4. 그림 다시 그리기: 원본 사진이 있을 때만(줄의 경로와 저장소의 파일 모두). 같은 줄을 그리기 줄에 다시 세운다(queued).
--      원본 사진은 다시 외부 AI 서비스(OpenAI)로 간다(동의 글이 알린다). 만든 때가 그대로라 주인의 하루 장수·시도·모두의 하루 상한에
--      세지 않는다. 고치지 않은 그리기 일꾼이 그대로 그린다. 그래서 막는 것과 되돌리는 것을 DB가 한다:
--      - 그림 일꾼이 5분 안에 살아 있다고 알리지 않았으면 'worker_down'(기다리는 동안 그 캐릭터가 걷기에서 다시 그리는 중으로 남지 않게).
--      - 3D를 기다리거나 만드는 중이면 'model_busy'. 3D 일꾼(Meshy)은 이어 볼 작업을 그림 id로 적어 두므로, 같은 id에 새 그림이
--        들어온 뒤 옛 그림의 작업을 이어 받지 않게 한다(일꾼이 보낸 그림을 함께 적어 가리기 전까지의 울타리).
--      - 다시 그리기 전의 칸(그림, 방향 그림, 3D, ★, 만든 때)을 redraw_prev에 적어 둔다. 그리는 동안 옛 그림 파일은 같은 자리에 그대로
--        있고(일꾼이 다 그리면 덮는다) avatar_char_shown()과 저장소 정책 avatars_guest_select_chars_prev가 그것을 내준다(걷기 겉모습은
--        그대로, 방향 그림과 3D는 그동안 쉰다). 방향 그림·3D 파일은 끝날 때까지 버리지 않는다(버릴 목록이 남겨 둔다).
--      - 끝나면 트리거(avatars_model_track)가 갈래를 고른다. 다 그림: 새 그림(방향 그림은 일꾼이 다시 그리고, 3D와 ★은 없다).
--        그리기 실패(서비스 문제 포함): 다시 그리기 전으로 되돌린다(그림·방향 그림·3D·★. ★은 그사이 보관 한도가 찼으면 빼고).
--        원본 사진은 일꾼이 이미 지웠다(0003 그대로): 그 뒤로는 다시 그릴 수 없다. 사진 살피기에서 거절: 정책대로 그 캐릭터는
--        없어지고(거절된 시도로 남는다) 입고 있었으면 종이 인형으로 돌린다. 지움: 그대로. 셋 다 조작 기록에 남긴다(누가 없이).
--   5. 캐릭터 지우기: 본인이 지울 때(avatar_forget 'character')와 같은 범위. 그림·방향 그림·3D 파일을 버리고, 아직 그리는 중이면
--      원본도 버린다(다 그린 그림의 원본은 본인이 「내 캐릭터」에서 따로 지운다). 입고 있었으면 걷기 겉모습을 종이 인형으로 돌린다
--      (profiles.look과 avatar_id를 비운다. 사이트는 비어 있으면 기본 인형을 쓴다).
--   6. 버릴 목록(avatar_trash): 위 함수가 줄을 고치는 같은 트랜잭션에서 그 파일 경로를 올린다. 사이트가 만드는 모양의 경로만 오른다
--      (<uid>/chars/<id>.png, <uid>/views/<id>.v1l.webp·.v1s.webp, <uid>/models/<id>.v1.glb, <uid>/originals/<id>.jpg|png|webp).
--      서버가 비밀 키로 avatar_trash_list → 저장소에서 지우기 → avatar_trash_done. 목록을 줄 때 그 경로를 지금 쓰는 줄이 있으면
--      (다시 그려 같은 자리에 새 그림이 생겼다 등) 목록에서 빼고 돌려주지 않는다. 일꾼이 곧 다시 쓸 경로(그리는 중인 그림, 만드는 중인
--      3D)와 다시 그리기가 끝나면 되돌릴 수도 있는 방향 그림·3D는 남겨 두고 나중에 다시 본다. 0022의 shots_trash와 같은 틀이지만
--      그 가지에 기대지 않는다.
--   7. 2D 그림의 판: 다시 그리면 같은 주소(/api/avatar/<id>, …/views)에 다른 그림이 온다. 사이트는 그림 답에 판(그린 차례,
--      queued_at 밀리초)을 ETag로 싣고 짧게(1분) 캐시한다: 1분 뒤에는 서버에 물어 같으면 304, 바뀌었으면 새 그림. 주소가 그대로라
--      걷기 엔진·작은 그림·지우기의 캐시 비우기(forget-cache)가 그대로 돈다. 판과 경로는 avatar_char_shown()·avatar_views_shown()이
--      준다(다시 그리는 동안의 옛 그림 포함). 이 함수들이 없는 DB면 사이트는 예전처럼 판 없이 한 시간 캐시한다.
--   8. 0001·0003·0015·0016·0018~0021의 표·정책·함수는 다시 정의하지 않는다. avatars에 칸 넷, 새 표 둘, 새 함수, 새 트리거 하나,
--      저장소 정책 둘을 더한다.
--
-- 내보내는 순서: 이 파일 → 사이트. 일꾼은 고치지 않고 다시 띄울 필요도 없다.
--   사이트는 이 파일 전에도 돈다: 모형 주소는 판 함수(avatar_model_shown)가 없으면 지금처럼 판 없이 한 시간 캐시하고, 그림 답도
--   지금처럼 한 시간이며, 관리 화면의 캐릭터 관리는 「아직 쓸 수 없어요」를 보인다. 이 파일만 올리고 사이트가 옛것이면 옛 사이트는
--   지금처럼 돈다(관리자가 3D를 다시 만드는 동안 옛 사이트에서는 그 캐릭터가 3D 없이, 그림을 다시 그리는 동안은 그림 없이 보인다).
--   버릴 목록 비우기와 관리자용 그림·모형 읽기는 사이트의 비밀 키(SUPABASE_SECRET_KEY, 이미 운영에 있다)를 쓴다.
-- 여러 번 올려도 된다(add column if not exists, create table if not exists, create or replace, drop … if exists).
-- 0018과 0021 뒤에 올린다(없으면 맨 앞에서 멈추고 아무것도 바꾸지 않는다). 올리는 역할은 저장소 표의 모든 줄을 볼 수 있어야 한다
-- (그림 다시 그리기가 원본 파일이 있는지 그 권한으로 본다. Supabase의 postgres는 그렇다. 아니면 맨 앞에서 멈춘다).
-- 0021 뒤에 0020·0021을 다시 올려도 이 파일은 그대로다(그 파일들이 다시 정의하는 함수를 이 파일은 고치지 않는다).
--
-- 올린 뒤 확인(모두 읽기만 한다):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'avatars'
--      and column_name in ('model_ver', 'model_prev', 'model_admin_at', 'redraw_prev')
--    order by 1;                                                                                                   → 네 줄
--   select tgname from pg_trigger where tgname = 'avatars_model_track' and not tgisinternal;                      → 한 줄
--   select policyname from pg_policies where schemaname = 'storage'
--      and policyname in ('avatars_guest_select_models_prev', 'avatars_guest_select_chars_prev') order by 1;      → 두 줄
--   select has_function_privilege('authenticated', 'public.admin_characters(text, text, text, text, boolean, int, timestamptz, uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_model_shown(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_char_shown(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatar_trash_list(int)', 'execute'),
--          has_function_privilege('service_role', 'public.avatar_trash_list(int)', 'execute'),
--          has_function_privilege('authenticated', 'public.avatars_model_track()', 'execute');                   → t, t, t, f, t, f
--   select model_ver, count(*) from public.avatars group by 1;                                                    → 처음에는 모두 1
--   select count(*) from public.avatar_trash;   → 보통 0. 남아 있으면 서버가 아직 저장소에서 지우지 못한 파일(캐릭터 관리 화면을 열면 마저)
--   select count(*) from public.avatars where redraw_prev is not null;   → 지금 다시 그리는 중인 그림 수(보통 0)
--   select max(seen_at) from public.avatar_workers;   → 그림 일꾼의 마지막 소식. 5분이 넘었으면 다시 그리기를 받지 않는다(worker_down)
--   select at, action, consent from public.avatar_admin_log order by at desc limit 20;                             → 조작 기록
--
-- 손으로
--   같은 서비스 이름으로 모형 파일만 바꿨으면(트리거가 알 수 없다) 판을 하나 올린다:
--     update public.avatars set model_ver = model_ver + 1 where id = '…' and model_status = 'ready';
--   (ready로 바꾸거나 만든 서비스 이름을 바꾸는 고치기는 트리거가 알아서 올린다.)
--
-- 되돌리는 법(한 트랜잭션으로: begin; … commit;)
--   먼저 다시 그리는 중인 그림이 없는지 본다(위 redraw_prev 수가 0). 있는 채로 되돌리면 그 그림은 그리다 실패할 때 되돌아오지 못한다.
--   그다음 버릴 목록을 비운다(캐릭터 관리 화면을 한 번 열면 된다). 남은 채로 지우면 그 파일들은 저장소에 남는다
--   (그때는 0015·0016의 avatar_views_strays·avatar_model_strays로 찾는다. 그림·원본은 저장소 화면에서).
--   사이트는 옛것으로 되돌리지 않아도 된다(판 함수가 없으면 옛 길로 간다).
--   drop policy if exists avatars_guest_select_models_prev on storage.objects;
--   drop policy if exists avatars_guest_select_chars_prev on storage.objects;
--   drop trigger if exists avatars_model_track on public.avatars;
--   drop function if exists public.avatars_model_track(), public.admin_model_state(public.avatars),
--     public.avatar_model_shown(uuid), public.avatar_model_prev_readable(text),
--     public.avatar_char_shown(uuid), public.avatar_char_prev_readable(text), public.avatar_views_shown(uuid, text),
--     public.avatar_trash_path_ok(text), public.avatar_trash_add(text), public.avatar_trash_state(text),
--     public.avatar_trash_list(int), public.avatar_trash_done(text[]),
--     public.admin_characters(text, text, text, text, boolean, int, timestamptz, uuid), public.admin_character_counts(boolean),
--     public.admin_character_file(uuid, text), public.admin_avatar_remake_model(uuid, text, boolean),
--     public.admin_avatar_forget_model(uuid), public.admin_avatar_redraw(uuid), public.admin_avatar_forget(uuid),
--     public.admin_avatar_log(int, uuid);
--   drop table if exists public.avatar_trash, public.avatar_admin_log;
--   alter table public.avatars drop column if exists model_prev, drop column if exists model_admin_at, drop column if exists redraw_prev;
--   판 칸(model_ver)과 그 제약은 남긴다: 다시 올릴 때 판이 이어지고, 3D가 있는 줄은 판을 하나 올린다(아래 「다시 올릴 때」).
--   판이 1부터 다시 시작하면 되돌린 동안 같은 자리에 다시 만든 모형이 그 판의 옛 캐시(?v=<판>)와 겹칠 수 있다.
--   되돌린 뒤: 다시 만드는 중이던 그림(model_prev)은 새 모형이 될 때까지 3D 없이 보이고, 관리자 요청의 요청한 때는 하루 앞선 채로 남는다
--   (그날 모두의 하루 3D 요청 수에 들지 않을 뿐이다).

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regprocedure('public.is_guest()') is null
     or to_regclass('public.roster') is null or to_regclass('public.profiles') is null then
    raise exception '0024_needs_0001';
  end if;
  -- 이력·보관·3D 요청(0021): 요청 함수, 돈이 든 작업 알리기, 다시 해도 같은 실패 판정과 칸 일곱
  if to_regclass('public.avatars') is null
     or to_regprocedure('public.avatar_model_request(uuid, text)') is null
     or to_regprocedure('public.avatar_model_job(uuid)') is null
     or to_regprocedure('public.avatar_model_blocked(text, text)') is null
     or (select count(*) from pg_catalog.pg_attribute
          where attrelid = to_regclass('public.avatars') and not attisdropped
            and attname in ('kept_at', 'model_requested_at', 'model_request_via', 'model_job_at', 'model_tries',
                            'slot_at', 'slot_freed')) <> 7 then
    raise exception '0024_needs_0021';
  end if;
  -- 행사 초대 코드(0018): 목록이 그 사람이 들어온 행사의 이름표를 보인다
  if to_regclass('public.event_codes') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = to_regclass('public.roster') and attname = 'event_code_id' and not attisdropped) then
    raise exception '0024_needs_0018';
  end if;
  -- 그림 다시 그리기는 원본 파일이 저장소에 있는지 올리는 역할의 권한으로 본다(줄이 가려지는 역할이면 늘 없다고 본다)
  if not exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception '0024_needs_role_that_reads_all_storage_rows';
  end if;
end $$;

-- ───────────────────────────── 다시 올릴 때(되돌린 뒤): 판 칸은 남고 트리거만 없다면, 3D가 있는 줄의 판을 하나 올린다
-- 되돌린 동안에는 3D가 다 되어도 판이 오르지 않았다: 같은 판으로 다시 만든 모형이 그 판의 옛 캐시와 겹치지 않게.
-- 처음 올릴 때(판 칸이 없다)와 여러 번 올릴 때(트리거가 있다)는 아무것도 하지 않는다
do $$
begin
  if to_regprocedure('public.avatars_model_track()') is null
     and exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = to_regclass('public.avatars') and attname = 'model_ver' and not attisdropped) then
    update public.avatars set model_ver = model_ver + 1 where model_status = 'ready';
  end if;
end $$;

-- ───────────────────────────── 칸
--   model_ver       3D 판 번호(기본 1). 3D가 다 될 때마다 트리거가 올린다. 사이트의 모형 주소 ?v=<판>
--   model_prev      다시 만드는 동안 이전 모형(같은 자리의 옛 파일)을 보인다. 관리자 다시 만들기가 켜고, 새 모형이 되거나
--                   그림이 다 그린 그림이 아니게 되거나 3D를 지우면 꺼진다
--   model_admin_at  관리자가 3D를 요청한 때(관리자 요청일 때만). 돈이 든 시도 누적과 오늘 모두의 3D 수에 들지 않는다(위 3)
--   redraw_prev     관리자가 그림을 다시 그리는 동안, 다시 그리기 전의 줄(to_jsonb). 그리는 동안 옛 그림을 보이고, 그리다 실패하면
--                   이것으로 되돌린다(위 4). 다시 그리기가 끝나면(다 그림·실패·거절·지움) 비운다
alter table public.avatars
  add column if not exists model_ver int not null default 1,
  add column if not exists model_prev boolean not null default false,
  add column if not exists model_admin_at timestamptz,
  add column if not exists redraw_prev jsonb;
alter table public.avatars drop constraint if exists avatars_model_ver_range;
alter table public.avatars add constraint avatars_model_ver_range check (model_ver >= 1);
alter table public.avatars drop constraint if exists avatars_redraw_prev_shape;
alter table public.avatars add constraint avatars_redraw_prev_shape
  check (redraw_prev is null or (jsonb_typeof(redraw_prev) = 'object' and status in ('pending', 'queued', 'drawing')));

-- ───────────────────────────── 판 번호, 관리자 요청, 그림 다시 그리기의 끝(트리거, 고치기마다)
-- 0. 다시 그리는 중이던 줄이 끝나면(다 그림·실패·거절·지움) 위 4의 갈래대로. 그리기에 실패했으면 다시 그리기 전으로 되돌리고
--    여기서 끝낸다(되돌린 3D는 같은 파일이라 판을 올리지 않는다). 거절이면 입고 있던 겉모습을 종이 인형으로. 기록은 누가 없이
-- 1. 판 번호는 줄지 않는다. 3D가 다 되면(ready로 바뀌거나 다 된 채 만든 서비스가 바뀌면) 하나 올리고 이전 모형 보이기를 끈다
-- 2. 이전 모형 보이기는 다 그린 그림에만
-- 3. 관리자 요청 표시: 다른 길이 요청한 때를 바꾸면(본인이 다시 요청, 0021의 지우기 트리거가 돌려줌 등) 뗀다
-- 4. 관리자 요청의 돈이 든 작업은 주인의 누적(model_tries)에 올리지 않는다(avatar_model_job이 올린 것을 되돌린다)
-- 5. 관리자가 요청한 그림이 지워지면 그 요청을 셈에서 뺀다(0021의 avatars_history_guard 다음에 돈다: 이름 차례)
create or replace function public.avatars_model_track() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := old.redraw_prev;
  v_role text;
  v_cap jsonb;
begin
  if p is not null and old.status in ('pending', 'queued', 'drawing')
     and new.status in ('ready', 'failed', 'rejected', 'deleted') then
    new.redraw_prev := null;
    if new.status = 'failed' then
      -- 그리기 실패(서비스 문제 포함): 옛 그림은 같은 자리에 그대로 있다(일꾼은 다 그렸을 때만 덮는다). 원본 사진은 일꾼이 지웠다
      insert into public.avatar_admin_log (avatar_id, owner_id, action, detail)
      values (new.id, new.user_id, 'redraw_back', jsonb_build_object('reason', new.reason));
      new.status := 'ready';
      new.reason := null;
      new.image_path := p ->> 'image_path';
      new.model := p ->> 'model';
      new.queued_at := (p ->> 'queued_at')::timestamptz;
      -- 방향 그림은 다 그렸거나 굳은 것만(그리던 것은 일꾼이 입은 캐릭터면 다시 잡는다)
      if p ->> 'views_status' in ('ready', 'failed') then
        new.views_status := p ->> 'views_status';
        new.views_mode := p ->> 'views_mode';
        new.views_model := p ->> 'views_model';
        new.views_reason := p ->> 'views_reason';
        new.views_attempts := coalesce((p ->> 'views_attempts')::int, 0);
        new.views_sheet_fails := coalesce((p ->> 'views_sheet_fails')::int, 0);
      end if;
      -- 3D는 다시 그리기가 받을 때 기다리거나 만드는 중이 아니었다(model_busy): 없음·다 됨·실패 그대로
      new.model_status := p ->> 'model_status';
      new.model_maker := p ->> 'model_maker';
      new.model_reason := p ->> 'model_reason';
      new.model_attempts := coalesce((p ->> 'model_attempts')::int, 0);
      new.model_bad_fails := coalesce((p ->> 'model_bad_fails')::int, 0);
      new.model_requested_at := (p ->> 'model_requested_at')::timestamptz;
      new.model_request_via := p ->> 'model_request_via';
      new.model_admin_at := (p ->> 'model_admin_at')::timestamptz;
      new.model_job_at := (p ->> 'model_job_at')::timestamptz;
      new.model_prev := coalesce((p ->> 'model_prev')::boolean, false);
      new.model_claimed_at := null;
      new.model_worker := null;
      new.model_not_before := null;
      -- ★은 그사이 그 사람의 보관 한도가 찼으면 빼고 되돌린다(한도는 0021의 표, 명단 역할로)
      if p ->> 'kept_at' is not null then
        select case r.role when 'admin' then 'admin' when 'family' then 'family' else 'guest' end into v_role
          from public.roster r where r.claimed_by = new.user_id and r.revoked_at is null limit 1;
        v_cap := public.avatar_limits() -> coalesce(v_role, 'guest') -> 'keep_max';
        if v_cap is not null
           and (jsonb_typeof(v_cap) = 'null'
                or (select count(*) from public.avatars a
                     where a.user_id = new.user_id and a.id <> new.id and a.kept_at is not null and a.status = 'ready')
                   < (v_cap #>> '{}')::numeric) then
          new.kept_at := (p ->> 'kept_at')::timestamptz;
        end if;
      end if;
      return new;
    end if;
    if new.status = 'rejected' then
      -- 사진 살피기에서 거절: 정책대로 캐릭터는 없어진다. 입고 있었으면 종이 인형으로(캐릭터 지우기와 같은 고치기)
      update public.profiles pr
         set avatar_id = case when pr.avatar_id = new.id then null else pr.avatar_id end,
             look = case when pr.look ->> 'kind' = 'photo' and pr.look ->> 'url' = '/api/avatar/' || new.id::text then null
                         else pr.look end,
             updated_at = now()
       where pr.user_id = new.user_id
         and (pr.avatar_id = new.id or (pr.look ->> 'kind' = 'photo' and pr.look ->> 'url' = '/api/avatar/' || new.id::text));
    end if;
    if new.status in ('ready', 'rejected') then
      insert into public.avatar_admin_log (avatar_id, owner_id, action, detail)
      values (new.id, new.user_id, case new.status when 'ready' then 'redraw_done' else 'redraw_rejected' end,
              case when new.status = 'rejected' then jsonb_build_object('reason', new.reason) end);
    end if;
  end if;
  if new.model_ver is null or new.model_ver < old.model_ver then
    new.model_ver := old.model_ver;
  end if;
  if new.model_status = 'ready'
     and (old.model_status is distinct from 'ready' or new.model_maker is distinct from old.model_maker) then
    new.model_ver := greatest(new.model_ver, old.model_ver + 1);
    new.model_prev := false;
  end if;
  if new.status is distinct from 'ready' then
    new.model_prev := false;
  end if;
  if new.model_admin_at is not null and new.model_admin_at is not distinct from old.model_admin_at
     and new.model_requested_at is distinct from old.model_requested_at then
    new.model_admin_at := null;
  end if;
  if new.model_admin_at is not null and old.model_job_at is null and new.model_job_at is not null
     and new.model_tries > old.model_tries then
    new.model_tries := old.model_tries;
  end if;
  if new.status = 'deleted' and old.status is distinct from 'deleted' and old.model_admin_at is not null then
    new.model_requested_at := null;
    new.model_admin_at := null;
  end if;
  return new;
end $$;
drop trigger if exists avatars_model_track on public.avatars;
create trigger avatars_model_track before update on public.avatars
  for each row execute function public.avatars_model_track();

-- ───────────────────────────── 걷기용 3D: 지금 보일 모형(명단 손님)
-- 다 만든 모형이거나, 다시 만드는 동안의 이전 모형. {path, ver(판), prev(이전 모형인가)} 또는 null.
-- /api/avatar/<id>/model이 쓴다(0016의 avatar_model_path는 그대로 두고 판 번호가 없는 옛 사이트가 쓴다).
create or replace function public.avatar_model_shown(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('path', a.user_id::text || '/models/' || a.id::text || '.v1.glb', 'ver', a.model_ver,
                            'prev', a.model_status is distinct from 'ready')
    from public.avatars a
   where public.is_guest() and a.id = p_id and a.status = 'ready' and a.image_path is not null
     and (a.model_status = 'ready' or a.model_prev)
$$;

-- 저장소 정책용: 이 파일이 지금 다시 만드는 중인 그림의 이전 모형인가(명단 손님만). 다 만든 모형은 0016의 정책이 연다.
create or replace function public.avatar_model_prev_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_guest()
     and exists (
       select 1 from public.avatars a
        where a.id = substring(p_name from '/models/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]v1[.]glb$')::uuid
          and a.status = 'ready' and a.model_prev
          and p_name = a.user_id::text || '/models/' || a.id::text || '.v1.glb')
$$;
drop policy if exists avatars_guest_select_models_prev on storage.objects;
create policy avatars_guest_select_models_prev on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[2] = 'models'
         and public.avatar_model_prev_readable(name));

-- ───────────────────────────── 2D 그림의 판(명단 손님, 위 7)
-- 판은 그 그림을 그린 차례(queued_at 밀리초, 다시 그리면 바뀐다). 관리자 목록의 pic_ver와 같다.
-- 그림 한 장: 다 그린 그림이면 그 그림, 관리자가 다시 그리는 중이면 다시 그리기 전의 그림(같은 자리. 일꾼이 다 그리면 덮는다).
-- {path, ver, prev(다시 그리는 동안의 옛 그림인가)} 또는 null. /api/avatar/<id>가 쓴다(0003의 avatar_char_path는 옛 사이트가 쓴다)
create or replace function public.avatar_char_shown(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
           when a.status = 'ready' then
             jsonb_build_object('path', a.image_path, 'prev', false,
                                'ver', floor(extract(epoch from coalesce(a.queued_at, a.created_at)) * 1000)::bigint)
           else
             jsonb_build_object('path', a.user_id::text || '/chars/' || a.id::text || '.png', 'prev', true,
                                'ver', floor(extract(epoch from coalesce((a.redraw_prev ->> 'queued_at')::timestamptz, a.created_at))
                                             * 1000)::bigint)
         end
    from public.avatars a
   where public.is_guest() and a.id = p_id
     and ((a.status = 'ready' and a.image_path is not null)
          or (a.status in ('pending', 'queued', 'drawing') and a.redraw_prev ->> 'image_path' is not null))
$$;

-- 저장소 정책용: 이 파일이 지금 다시 그리는 중인 그림의 옛 그림인가(명단 손님만). 다 그린 그림은 0003의 정책이 연다
create or replace function public.avatar_char_prev_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_guest()
     and exists (
       select 1 from public.avatars a
        where a.id = substring(p_name from '/chars/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]png$')::uuid
          and a.status in ('pending', 'queued', 'drawing') and a.redraw_prev ->> 'image_path' is not null
          and p_name = a.user_id::text || '/chars/' || a.id::text || '.png')
$$;
drop policy if exists avatars_guest_select_chars_prev on storage.objects;
create policy avatars_guest_select_chars_prev on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[2] = 'chars'
         and public.avatar_char_prev_readable(name));

-- 방향 그림 묶음(p_size: s | 그 밖은 l): 0015의 avatar_views_path와 같은 때(다 그린 그림, 다 그린 묶음)에 경로와 판.
-- {path, ver} 또는 null. 다시 그리는 동안에는 없다(묶음은 새 그림으로 다시 그린다. 걷기 엔진은 그동안 그림 한 장으로 선다)
create or replace function public.avatar_views_shown(p_id uuid, p_size text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'path', a.user_id::text || '/views/' || a.id::text || '.v1' || (case when p_size = 's' then 's' else 'l' end) || '.webp',
           'ver', floor(extract(epoch from coalesce(a.queued_at, a.created_at)) * 1000)::bigint)
    from public.avatars a
   where public.is_guest() and a.id = p_id and a.status = 'ready' and a.views_status = 'ready'
$$;

-- ───────────────────────────── 버릴 목록(정책 없음: 아래 정의자 함수만 읽고 쓴다)
create table if not exists public.avatar_trash (
  path text primary key check (char_length(path) between 40 and 200),
  at timestamptz not null default now()
);
alter table public.avatar_trash enable row level security;

-- 사이트가 만드는 모양의 경로인가(src/lib/avatar/rules.ts의 originalPath·charPath·viewsPath·modelPath와 같은 모양)
create or replace function public.avatar_trash_path_ok(p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_path ~ ('^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
                            || '(chars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]png'
                            || '|views/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]v1[ls][.]webp'
                            || '|models/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]v1[.]glb'
                            || '|originals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp))$'), false)
$$;

create or replace function public.avatar_trash_add(p_path text) returns void
language sql security definer set search_path = '' as $$
  insert into public.avatar_trash (path) select p_path where public.avatar_trash_path_ok(p_path)
  on conflict (path) do nothing
$$;

-- 버릴 목록의 한 경로가 지금 어떤가: use(그 경로를 지금 쓰는 줄이 있다: 목록에서 뺀다), busy(일꾼이 곧 그 자리에 다시 쓰거나,
-- 다시 그리기가 실패하면 되돌릴 파일이다: 남겨 두고 나중에 본다), free(지운다), bad(사이트가 만드는 모양이 아니다: 지우지 않고 목록에서 뺀다)
create or replace function public.avatar_trash_state(p_path text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.avatars;
  v_kind text := split_part(p_path, '/', 2);
  v_redrawing boolean;
begin
  if not public.avatar_trash_path_ok(p_path) then return 'bad'; end if;
  select * into v from public.avatars a
   where a.id = substring(p_path from '/[a-z]+/([0-9a-f-]{36})[.]')::uuid and a.user_id::text = split_part(p_path, '/', 1);
  if not found then return 'free'; end if;
  v_redrawing := v.redraw_prev is not null and v.status in ('pending', 'queued', 'drawing');
  if v_kind = 'originals' then
    return case when v.original_path = p_path then 'use' else 'free' end;
  elsif v_kind = 'chars' then
    if v.status = 'ready' and v.image_path = p_path then return 'use'; end if;
    if v.status in ('pending', 'queued', 'drawing') then return 'busy'; end if;
    return 'free';
  elsif v_kind = 'views' then
    if v.status = 'ready' and v.views_status = 'ready' then return 'use'; end if;
    if v.status = 'ready' and v.views_status = 'drawing' then return 'busy'; end if;
    if v_redrawing then return 'busy'; end if;
    return 'free';
  end if;
  if v.status = 'ready' and (v.model_status = 'ready' or v.model_prev) then return 'use'; end if;
  if v.status = 'ready' and (v.model_status = 'drawing' or (v.model_status is null and v.model_requested_at is not null)) then
    return 'busy';
  end if;
  if v_redrawing then return 'busy'; end if;
  return 'free';
end $$;

-- 서버(비밀 키) 전용: 지울 경로 목록(오래된 것부터). 쓰는 줄이 생긴 경로와 모양이 틀린 경로는 여기서 목록에서 뺀다
create or replace function public.avatar_trash_list(p_limit int default 100)
returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.avatar_trash t where public.avatar_trash_state(t.path) in ('use', 'bad');
  return query
    select t.path from public.avatar_trash t
     where public.avatar_trash_state(t.path) = 'free'
     order by t.at, t.path
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- 서버(비밀 키) 전용: 저장소에서 지운 파일을 목록에서 뺀다. 뺀 수를 돌려준다
create or replace function public.avatar_trash_done(p_paths text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  delete from public.avatar_trash t where t.path = any (coalesce(p_paths, array[]::text[]));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ───────────────────────────── 조작 기록(정책 없음: admin_avatar_log로만 읽는다)
-- action: 집주인의 조작 넷과, 그림 다시 그리기가 끝난 갈래 셋(redraw_done 다 그림, redraw_back 실패해 되돌림, redraw_rejected 거절.
-- 트리거가 남기므로 actor가 없다)
create table if not exists public.avatar_admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  avatar_id uuid not null,
  owner_id uuid references auth.users (id) on delete set null,
  action text not null,
  consent text check (consent is null or consent in ('owner_admin', 'owner_meshy', 'told_by_owner', 'local')),
  detail jsonb check (detail is null or (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 1000))
);
alter table public.avatar_admin_log drop constraint if exists avatar_admin_log_action_check;
alter table public.avatar_admin_log add constraint avatar_admin_log_action_check
  check (action in ('remake_model', 'forget_model', 'redraw', 'forget', 'redraw_done', 'redraw_back', 'redraw_rejected'));
create index if not exists avatar_admin_log_at on public.avatar_admin_log (at desc);
create index if not exists avatar_admin_log_avatar on public.avatar_admin_log (avatar_id, at desc);
alter table public.avatar_admin_log enable row level security;

-- ───────────────────────────── 3D 상태(목록·거르기 공용)
--   none(없음) | waiting(요청해서 기다림) | making(만드는 중) | ready | failed
--   | stuck(기다린 지 15분, 또는 일꾼이 잡은 지 30분이 넘음. 30분은 3D 다시 만들기가 만드는 중을 멈춘 것으로 보는 때와 같다:
--     「멈춘 것 같아요」가 보이면 다시 만들기가 받는다. Meshy 일꾼의 임대(20분)보다 길다)
--   다 그린 그림이 아니면 none. 관리자 요청은 진짜 요청한 때(model_admin_at)로 잰다
create or replace function public.admin_model_state(a public.avatars) returns text
language sql stable set search_path = '' as $$
  select case
    when a.status is distinct from 'ready' then 'none'
    when a.model_status = 'ready' then 'ready'
    when a.model_status = 'failed' then 'failed'
    when a.model_status = 'drawing' then
      case when a.model_claimed_at < now() - interval '30 minutes' then 'stuck' else 'making' end
    when a.model_requested_at is not null then
      case when coalesce(a.model_admin_at, a.model_requested_at) < now() - interval '15 minutes' then 'stuck' else 'waiting' end
    else 'none'
  end
$$;

-- ───────────────────────────── 집주인: 캐릭터 목록
-- 지우지 않은 모든 캐릭터(그리는 중, 거절·실패 포함). 새것부터, 한 번에 p_limit줄(1~200). 다음 장은 마지막 줄의 (created_at, id)를
-- p_before·p_before_id로 넘긴다.
-- p_filter: all | model_problem(3D 실패·15분 넘게 기다리거나 만드는 중) | model_making(기다림·만드는 중) | model_ready(3D 다 됨)
--           | model_none(다 그린 그림인데 3D 없음) | pic_problem(그림 거절·실패). 그 밖은 오류(bad_filter)
-- p_role: admin | family | guest | visitor(명단 밖). p_maker: 만든 서비스 이름. p_query: 이름(명단 이름, 이름표)이나 행사 이름표에 든 글자.
-- p_mine: 집주인 자신의 캐릭터만. 원본 사진 경로는 돌려주지 않는다(has_original만).
-- redrawing: 관리자가 그림을 다시 그리는 중(그동안 걷기에는 옛 그림이 보인다, 위 4).
-- 돌려주는 모양을 바꿀 때는 지웠다가 만든다(create or replace는 모양을 바꾸지 못한다)
drop function if exists public.admin_characters(text, text, text, text, boolean, int, timestamptz, uuid);
create or replace function public.admin_characters(
  p_filter text default 'all', p_role text default null, p_maker text default null, p_query text default null,
  p_mine boolean default false, p_limit int default 40, p_before timestamptz default null, p_before_id uuid default null
) returns table (
  id uuid, owner_id uuid, owner_name text, nickname text, owner_role text, owner_removed boolean, event_label text,
  created_at timestamptz, status text, reason text, slot smallint, kept boolean, worn boolean, has_original boolean,
  pic_ver bigint, model_state text, model_maker text, model_reason text, model_attempts int, model_tries int,
  model_via text, model_ver int, model_prev boolean, model_by_admin boolean, model_asked_at timestamptz,
  model_claimed_at timestamptz, views_status text, redrawing boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_filter text := coalesce(p_filter, 'all');
  v_q text := lower(nullif(btrim(coalesce(p_query, '')), ''));
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if v_filter not in ('all', 'model_problem', 'model_making', 'model_ready', 'model_none', 'pic_problem') then
    raise exception 'bad_filter' using errcode = '22023';
  end if;
  return query
    select a.id, a.user_id, r.display_name, nullif(btrim(p.nickname), ''),
           case when r.id is null then 'visitor' else r.role end,
           coalesce(r.revoked_at is not null, false), e.label,
           a.created_at, a.status, a.reason, a.slot, a.status = 'ready' and a.kept_at is not null,
           coalesce(p.avatar_id = a.id, false)
             or coalesce(p.look ->> 'kind' = 'photo' and p.look ->> 'url' = '/api/avatar/' || a.id::text, false),
           a.original_path is not null,
           floor(extract(epoch from coalesce(a.queued_at, a.created_at)) * 1000)::bigint,
           public.admin_model_state(a), a.model_maker, a.model_reason, a.model_attempts, a.model_tries,
           a.model_request_via, a.model_ver, a.model_prev and a.status = 'ready', a.model_admin_at is not null,
           case when a.model_requested_at is null then null else coalesce(a.model_admin_at, a.model_requested_at) end,
           a.model_claimed_at, a.views_status,
           a.redraw_prev is not null and a.status in ('pending', 'queued', 'drawing')
      from public.avatars a
      left join public.roster r on r.claimed_by = a.user_id
      left join public.event_codes e on e.id = r.event_code_id
      left join public.profiles p on p.user_id = a.user_id
     where a.status <> 'deleted'
       and (not coalesce(p_mine, false) or a.user_id = auth.uid())
       and (p_role is null or (case when r.id is null then 'visitor' else r.role end) = p_role)
       and (p_maker is null or a.model_maker = p_maker)
       and (v_q is null
            or position(v_q in lower(concat_ws(' ', r.display_name, p.nickname, e.label))) > 0)
       and (p_before is null or (a.created_at, a.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
       and (v_filter = 'all'
            or (v_filter = 'model_problem' and public.admin_model_state(a) in ('failed', 'stuck'))
            or (v_filter = 'model_making' and public.admin_model_state(a) in ('waiting', 'making', 'stuck'))
            or (v_filter = 'model_ready' and public.admin_model_state(a) = 'ready')
            or (v_filter = 'model_none' and a.status = 'ready' and public.admin_model_state(a) = 'none')
            or (v_filter = 'pic_problem' and a.status in ('rejected', 'failed')))
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 40), 1), 200);
end $$;

-- 집주인: 거르기 칩의 수. {all, model_problem, model_making, model_ready, model_none, pic_problem,
--   roles: {역할: 수}, makers: {만든 서비스: 수}}. p_mine이면 집주인 자신의 캐릭터만 센다
create or replace function public.admin_character_counts(p_mine boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  with c as (
    select a.status as st, a.model_maker as maker, public.admin_model_state(a) as ms,
           case when r.id is null then 'visitor' else r.role end as rl
      from public.avatars a
      left join public.roster r on r.claimed_by = a.user_id
     where a.status <> 'deleted' and (not coalesce(p_mine, false) or a.user_id = auth.uid())
  )
  select jsonb_build_object(
    'all', (select count(*) from c),
    'model_problem', (select count(*) from c where ms in ('failed', 'stuck')),
    'model_making', (select count(*) from c where ms in ('waiting', 'making', 'stuck')),
    'model_ready', (select count(*) from c where ms = 'ready'),
    'model_none', (select count(*) from c where st = 'ready' and ms = 'none'),
    'pic_problem', (select count(*) from c where st in ('rejected', 'failed')),
    'roles', coalesce((select jsonb_object_agg(x.rl, x.n) from (select rl, count(*) as n from c group by rl) x), '{}'::jsonb),
    'makers', coalesce((select jsonb_object_agg(y.maker, y.n)
                          from (select maker, count(*) as n from c where maker is not null group by maker) y), '{}'::jsonb))
    into v;
  return v;
end $$;

-- 집주인: 관리자용 그림·모형 읽기의 경로와 판. 다 그린 그림만. p_kind: char(그림, ver = 그린 차례) | model(지금 보이는 모형)
-- {path, ver} 또는 null. 경로는 줄에서 지어 주므로 부르는 쪽이 고를 수 없다. 원본 사진은 이 길로 나가지 않는다
create or replace function public.admin_character_file(p_id uuid, p_kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.avatars;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('char', 'model') then raise exception 'bad_kind' using errcode = '22023'; end if;
  select * into v from public.avatars a where a.id = p_id;
  if not found or v.status <> 'ready' or v.image_path is null then return null; end if;
  if p_kind = 'char' then
    return jsonb_build_object('path', v.user_id::text || '/chars/' || v.id::text || '.png',
                              'ver', floor(extract(epoch from coalesce(v.queued_at, v.created_at)) * 1000)::bigint);
  end if;
  if v.model_status = 'ready' or v.model_prev then
    return jsonb_build_object('path', v.user_id::text || '/models/' || v.id::text || '.v1.glb', 'ver', v.model_ver);
  end if;
  return null;
end $$;

-- ───────────────────────────── 집주인: 3D 다시 만들기(위 3)
-- 결과: {"ok":true,"consent":근거,"prev":이전 모형을 보이는가} 또는
--       {"ok":false,"reason":"not_found|not_ready|busy|model_blocked|consent_needed"}. p_via가 meshy·trellis가 아니면 오류(bad_via)
create or replace function public.admin_avatar_remake_model(p_id uuid, p_via text, p_told boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_owner uuid;
  v_basis text;
  v_prev boolean;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if p_via is null or p_via not in ('meshy', 'trellis') then raise exception 'bad_via' using errcode = '22023'; end if;
  select a.user_id into v_owner from public.avatars a where a.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  -- 주인의 작업대·보관·요청 고치기(0021)와 겹치지 않게 그 사람의 잠금을 함께 쓴다
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(v_owner::text));
  select * into v from public.avatars a where a.id = p_id for update;
  if not found or v.status = 'deleted' then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v.status <> 'ready' or v.image_path is null then return jsonb_build_object('ok', false, 'reason', 'not_ready'); end if;
  if v.model_status = 'drawing' and v.model_claimed_at > now() - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  if v.model_status = 'failed' and public.avatar_model_blocked(v.model_reason, p_via) then
    return jsonb_build_object('ok', false, 'reason', 'model_blocked');
  end if;
  if p_via = 'trellis' then
    v_basis := 'local';
  elsif exists (select 1 from public.roster r where r.claimed_by = v.user_id and r.revoked_at is null and r.role = 'admin') then
    v_basis := 'owner_admin';
  elsif v.model_request_via = 'meshy' then
    v_basis := 'owner_meshy';
  elsif p_told is true then
    v_basis := 'told_by_owner';
  else
    return jsonb_build_object('ok', false, 'reason', 'consent_needed');
  end if;
  v_prev := v.model_status is not distinct from 'ready' or v.model_prev;
  update public.avatars
     set model_status = null, model_attempts = 0, model_bad_fails = 0, model_claimed_at = null, model_worker = null,
         model_not_before = null, model_reason = null,
         model_requested_at = now() - interval '1 day', model_admin_at = now(), model_request_via = p_via,
         model_job_at = null, model_prev = v_prev
   where id = p_id;
  insert into public.avatar_admin_log (actor, avatar_id, owner_id, action, consent, detail)
  values (auth.uid(), p_id, v.user_id, 'remake_model', v_basis,
          jsonb_build_object('via', p_via, 'from', public.admin_model_state(v), 'ver', v.model_ver));
  return jsonb_build_object('ok', true, 'consent', v_basis, 'prev', v_prev);
end $$;

-- ───────────────────────────── 집주인: 3D 지우기
-- 모형 칸과 3D 요청을 비우고(주인의 요청 셈에서도 빠진다. 돈이 든 누적은 그대로) 모형 파일을 버릴 목록에 올린다.
-- 만드는 중이던 일꾼은 정리할 때 거절되어 방금 올린 파일을 스스로 거둔다(0016).
-- 결과: {"ok":true} 또는 {"ok":false,"reason":"not_found|no_model"}
create or replace function public.admin_avatar_forget_model(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_owner uuid;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  select a.user_id into v_owner from public.avatars a where a.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(v_owner::text));
  select * into v from public.avatars a where a.id = p_id for update;
  if not found or v.status = 'deleted' then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v.status <> 'ready' or (v.model_status is null and v.model_requested_at is null and not v.model_prev) then
    return jsonb_build_object('ok', false, 'reason', 'no_model');
  end if;
  update public.avatars
     set model_status = null, model_attempts = 0, model_bad_fails = 0, model_claimed_at = null, model_worker = null,
         model_not_before = null, model_maker = null, model_reason = null,
         model_requested_at = null, model_admin_at = null, model_job_at = null, model_prev = false
   where id = p_id;
  perform public.avatar_trash_add(v.user_id::text || '/models/' || v.id::text || '.v1.glb');
  insert into public.avatar_admin_log (actor, avatar_id, owner_id, action, detail)
  values (auth.uid(), p_id, v.user_id, 'forget_model', jsonb_build_object('from', public.admin_model_state(v), 'ver', v.model_ver));
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────────── 집주인: 그림 다시 그리기(위 4)
-- 결과: {"ok":true} 또는 {"ok":false,"reason":"not_found|not_ready|no_original|model_busy|worker_down"}
--   model_busy   3D를 기다리거나 만드는 중(3D를 지우거나 끝난 뒤에 한다)
--   worker_down  그림 일꾼이 5분 넘게 소식이 없다(일꾼이 돌아오면 한다)
create or replace function public.admin_avatar_redraw(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_owner uuid;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  select a.user_id into v_owner from public.avatars a where a.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(v_owner::text));
  select * into v from public.avatars a where a.id = p_id for update;
  if not found or v.status = 'deleted' then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v.status <> 'ready' or v.image_path is null then return jsonb_build_object('ok', false, 'reason', 'not_ready'); end if;
  if v.original_path is null
     or not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v.original_path) then
    return jsonb_build_object('ok', false, 'reason', 'no_original');
  end if;
  if v.model_status = 'drawing' or (v.model_status is null and v.model_requested_at is not null) then
    return jsonb_build_object('ok', false, 'reason', 'model_busy');
  end if;
  if not exists (select 1 from public.avatar_workers w where w.seen_at > now() - interval '5 minutes') then
    return jsonb_build_object('ok', false, 'reason', 'worker_down');
  end if;
  -- 칸을 내준 그림 되돌리기(0021)는 이 줄이 처음 만들어질 때의 일이라 지운다(다시 그리다 거절돼도 엉뚱한 그림이 돌아오지 않게).
  -- 다시 그리기 전의 줄은 redraw_prev에 둔다(그리는 동안 옛 그림을 보이고, 실패하면 되돌린다)
  update public.avatars
     set redraw_prev = to_jsonb(v),
         status = 'queued', queued_at = now(), attempts = 0, not_before = null, claimed_at = null, worker = null,
         reason = null, image_path = null, model = null, kept_at = null, slot_freed = null,
         views_status = null, views_attempts = 0, views_sheet_fails = 0, views_claimed_at = null, views_not_before = null,
         views_worker = null, views_mode = null, views_model = null, views_reason = null,
         model_status = null, model_attempts = 0, model_bad_fails = 0, model_claimed_at = null, model_worker = null,
         model_not_before = null, model_maker = null, model_reason = null,
         model_requested_at = null, model_admin_at = null, model_job_at = null, model_prev = false
   where id = p_id;
  perform public.avatar_trash_add(v.image_path);
  perform public.avatar_trash_add(v.user_id::text || '/views/' || v.id::text || '.v1l.webp');
  perform public.avatar_trash_add(v.user_id::text || '/views/' || v.id::text || '.v1s.webp');
  perform public.avatar_trash_add(v.user_id::text || '/models/' || v.id::text || '.v1.glb');
  insert into public.avatar_admin_log (actor, avatar_id, owner_id, action, detail)
  values (auth.uid(), p_id, v.user_id, 'redraw',
          jsonb_build_object('model', public.admin_model_state(v), 'kept', v.kept_at is not null));
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────────── 집주인: 캐릭터 지우기(위 5)
-- 결과: {"ok":true,"worn":입고 있었는가} 또는 {"ok":false,"reason":"not_found"}(지운 줄, 거절·실패한 줄)
create or replace function public.admin_avatar_forget(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_owner uuid;
  v_flight boolean;
  v_worn int;
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  select a.user_id into v_owner from public.avatars a where a.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform pg_advisory_xact_lock(hashtext('joyeondang:avatar_user'), hashtext(v_owner::text));
  select * into v from public.avatars a where a.id = p_id for update;
  if not found or v.status not in ('pending', 'queued', 'drawing', 'ready') then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  v_flight := v.status in ('pending', 'queued', 'drawing');
  -- 입고 있었으면 종이 인형으로(사이트는 비어 있는 겉모습을 기본 인형으로 보인다)
  update public.profiles p
     set avatar_id = case when p.avatar_id = p_id then null else p.avatar_id end,
         look = case when p.look ->> 'kind' = 'photo' and p.look ->> 'url' = '/api/avatar/' || p_id::text then null else p.look end,
         updated_at = now()
   where p.user_id = v.user_id
     and (p.avatar_id = p_id or (p.look ->> 'kind' = 'photo' and p.look ->> 'url' = '/api/avatar/' || p_id::text));
  get diagnostics v_worn = row_count;
  -- 본인의 지우기(0016 avatar_forget 'character')와 같은 칸을 같은 값으로
  update public.avatars
     set original_path = case when v_flight then null else original_path end,
         image_path = null, status = 'deleted', deleted_at = now(), claimed_at = null, not_before = null,
         views_status = null, views_attempts = 0, views_sheet_fails = 0, views_claimed_at = null, views_not_before = null,
         views_worker = null, views_mode = null, views_model = null, views_reason = null,
         model_status = null, model_attempts = 0, model_bad_fails = 0, model_claimed_at = null, model_not_before = null,
         model_worker = null, model_maker = null, model_reason = null
   where id = p_id;
  if v.image_path is not null then perform public.avatar_trash_add(v.image_path); end if;
  perform public.avatar_trash_add(v.user_id::text || '/views/' || v.id::text || '.v1l.webp');
  perform public.avatar_trash_add(v.user_id::text || '/views/' || v.id::text || '.v1s.webp');
  perform public.avatar_trash_add(v.user_id::text || '/models/' || v.id::text || '.v1.glb');
  if v_flight and v.original_path is not null then perform public.avatar_trash_add(v.original_path); end if;
  insert into public.avatar_admin_log (actor, avatar_id, owner_id, action, detail)
  values (auth.uid(), p_id, v.user_id, 'forget',
          jsonb_build_object('status', v.status, 'worn', v_worn > 0, 'model', public.admin_model_state(v)));
  return jsonb_build_object('ok', true, 'worn', v_worn > 0);
end $$;

-- ───────────────────────────── 집주인: 조작 기록(새것부터). p_avatar를 주면 그 캐릭터만
-- actor_name: 한 사람의 명단 이름 / owner_name·owner_nickname: 주인의 명단 이름과 이름표
create or replace function public.admin_avatar_log(p_limit int default 50, p_avatar uuid default null)
returns table (at timestamptz, actor_name text, avatar_id uuid, owner_name text, owner_nickname text, action text,
               consent text, detail jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  return query
    select l.at, ra.display_name, l.avatar_id, ro.display_name, nullif(btrim(po.nickname), ''), l.action, l.consent, l.detail
      from public.avatar_admin_log l
      left join public.roster ra on ra.claimed_by = l.actor
      left join public.roster ro on ro.claimed_by = l.owner_id
      left join public.profiles po on po.user_id = l.owner_id
     where p_avatar is null or l.avatar_id = p_avatar
     order by l.at desc, l.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ───────────────────────────── 권한 정리
revoke all on public.avatar_trash, public.avatar_admin_log from public, anon, authenticated;

revoke execute on function public.avatars_model_track(), public.admin_model_state(public.avatars),
  public.avatar_model_shown(uuid), public.avatar_model_prev_readable(text),
  public.avatar_char_shown(uuid), public.avatar_char_prev_readable(text), public.avatar_views_shown(uuid, text),
  public.avatar_trash_path_ok(text), public.avatar_trash_add(text), public.avatar_trash_state(text),
  public.avatar_trash_list(int), public.avatar_trash_done(text[]),
  public.admin_characters(text, text, text, text, boolean, int, timestamptz, uuid), public.admin_character_counts(boolean),
  public.admin_character_file(uuid, text), public.admin_avatar_remake_model(uuid, text, boolean),
  public.admin_avatar_forget_model(uuid), public.admin_avatar_redraw(uuid), public.admin_avatar_forget(uuid),
  public.admin_avatar_log(int, uuid)
  from public, anon, authenticated;

-- 로그인한 사람의 세션으로 부른다(관리자인지는 함수가 본다). 걷기 그림·3D와 저장소 정책은 명단 손님인지 함수가 본다
grant execute on function public.admin_characters(text, text, text, text, boolean, int, timestamptz, uuid),
  public.admin_character_counts(boolean), public.admin_character_file(uuid, text),
  public.admin_avatar_remake_model(uuid, text, boolean), public.admin_avatar_forget_model(uuid),
  public.admin_avatar_redraw(uuid), public.admin_avatar_forget(uuid), public.admin_avatar_log(int, uuid),
  public.avatar_model_shown(uuid), public.avatar_model_prev_readable(text),
  public.avatar_char_shown(uuid), public.avatar_char_prev_readable(text), public.avatar_views_shown(uuid, text)
  to authenticated;
-- 비밀 키(service_role)만: 버릴 목록 비우기
grant execute on function public.avatar_trash_list(int), public.avatar_trash_done(text[]) to service_role;
