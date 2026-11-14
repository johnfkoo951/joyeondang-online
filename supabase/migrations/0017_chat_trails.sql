-- 조연당 온라인 0017: 걷기 화면의 대화(저장), 멘션, 접속자, 걸은 길(2026-11-11)
--
-- 무엇을·왜
--   1. 대화. 걷기 화면에서 한 말(대화창에 쓴 글, Enter로 띄운 말풍선)을 chat_messages에 남긴다. 저절로 지우지 않는다
--      (집주인 결정). 쓴 사람과 관리자는 한 줄씩 지울 수 있다(줄째 지운다. 본문을 남기지 않는다).
--      쓰고 읽고 지우기는 정의자 함수로만 한다(chat_post, chat_list, chat_delete). 표는 직접 만지지 못한다
--      (쓴 사람의 로그인 id를 내보내지 않게). 명단 손님 이상만 쓰고 읽는다. 1:1 대화는 없다: 멘션도 전체 대화에 남는다.
--   2. 사람 구분값(sub). 함께 걷기 서버가 쓰는 gameSubject(로그인 id를 서명 키로 감춘 22자, src/lib/game-token.ts)를
--      대화, 접속자, 멘션도 쓴다. DB는 서명 키를 모르므로 사이트 서버가 비밀 키(service_role)로 chat_register()를 불러
--      「이 로그인 id의 sub」를 chat_people에 적는다. 손님 세션은 이 표를 쓰지 못한다: 글의 sub와 멘션 받는 사람은
--      늘 이 표에서 나온다(남의 sub로 글을 쓰거나, 쓰지 않는 sub를 멘션하지 못한다).
--   3. 빠르기. 사람마다 1.5초에 하나, 1분에 스무 개(chat_rate에 최근 1분의 보낸 때를 둔다. 지운 글도 센다).
--      글은 300자, 멘션은 다섯 명까지. 숫자는 아래 social_limits() 한곳에 있다.
--   4. 실시간(Supabase Realtime 비공개 채널).
--        walk:chat     새 글('new')과 지운 글('gone'). 명단 손님 이상이 듣는다. 보내기는 이 DB의 트리거만 한다
--                      (손님이 보내는 정책이 없다: 지어낸 글을 퍼뜨리지 못한다). 컨트롤 룸(관리자)도 이것을 듣는다.
--        walk:online   접속자 presence(키 sub, 값 {sub, name, look, space, since}). 명단 손님 이상이 알리고 듣는다.
--        walk:me:<sub> 나를 멘션한 글('mention'). 그 사람만 듣는다(멘션 알림 때문에 모두가 모든 글을 받지 않게).
--      무료 요금제의 Realtime은 초당 메시지 100개(받는 사람마다 하나로 센다)가 한도이고 넘으면 연결을 끊는다.
--      그래서 모두에게 퍼뜨리는 새 글은 1초에 몇 개까지만 보낸다(social_limits의 chat_live_per_second).
--      넘친 글도 저장은 되고, 열린 대화창이 잠깐 뒤 다시 물어 채운다. 멘션(받는 사람 다섯까지)과 지운 글은 늘 보낸다.
--      presence 값은 손님 화면이 스스로 알리는 것이라 믿지 않는다(이름표 표시용). 권한과 글은 이 DB가 판정한다.
--   5. 걸은 길. 실제 집과 방 안에서 움직일 때 1초에 한 점 [ms, x, y, z, yaw]를 30초마다(페이지를 떠날 때도) 묶어
--      walk_trails에 남긴다. 가족과 관리자만 읽는다(손님끼리는 서로의 길을 보지 못한다). 쓰기는 trail_post()로만
--      (모양, 때, 양을 확인한다). 한 번에 120점, 1분에 여덟 번, 하루(한국 시간)에 4만 점까지.
--
-- 계정을 지우면(auth.users) 그 사람의 글, 길, sub 기록이 함께 지워진다.
-- 사이트 코드는 이 파일을 올리기 전에도 돈다: 함수가 없으면 /api/chat/me가 canChat:false를 주고 걷기 화면은 대화창
-- 대신 「준비 중」을 보인다. 걸은 길 보내기는 조용히 실패한다.
--
-- 여러 번 올려도 된다(create … if not exists, create or replace, drop … if exists). 0001·0006 뒤에 올린다.
-- Supabase Realtime(realtime.messages, realtime.topic(), realtime.send())이 있어야 한다(없으면 맨 앞에서 멈춘다).
-- realtime.messages의 RLS는 Supabase가 이미 켜 두었다(여기서 켜지 않는다: 켜려 하면 권한 오류로 전체가 멈춘다).
-- 올린 뒤 확인:
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and proname in ('chat_register', 'chat_post', 'chat_list', 'chat_delete', 'chat_my_topic', 'trail_post',
--                      'walk_trails_read', 'social_limits') order by 1;                                       → 여덟 줄
--   select policyname from pg_policies where schemaname = 'realtime' and tablename = 'messages'
--      and policyname like 'jy\_walk\_%' order by 1;                                                         → 네 줄
--   select has_function_privilege('authenticated', 'public.chat_register(uuid, text)', 'execute'),
--          has_function_privilege('service_role', 'public.chat_register(uuid, text)', 'execute');           → f, t
--   사이트 환경 변수 SUPABASE_SECRET_KEY와 GAME_TOKEN_SECRET이 있어야 대화가 열린다(sub를 적는 데 쓴다).
--
-- 되돌리는 법(한 트랜잭션으로)
--   drop policy if exists jy_walk_chat_read on realtime.messages;
--   drop policy if exists jy_walk_online_read on realtime.messages;
--   drop policy if exists jy_walk_online_track on realtime.messages;
--   drop policy if exists jy_walk_me_read on realtime.messages;
--   drop trigger if exists chat_messages_live on public.chat_messages;
--   drop trigger if exists chat_messages_pick_live on public.chat_messages;
--   drop function if exists public.chat_messages_live(), public.chat_messages_pick_live(), public.chat_post(text, text[], text, text),
--     public.chat_list(timestamptz, uuid, timestamptz, uuid, int), public.chat_delete(uuid), public.chat_my_topic(),
--     public.chat_register(uuid, text), public.chat_wire(public.chat_messages), public.chat_name_of(uuid),
--     public.chat_clean_name(text), public.trail_post(text, jsonb),
--     public.walk_trails_read(timestamptz, timestamptz, bigint, int), public.social_limits();
--   drop table if exists public.walk_trails, public.chat_messages, public.chat_rate, public.chat_people;

-- ───────────────────────────── 먼저: 딛고 설 것이 다 있는가(하나라도 없으면 아무것도 바꾸지 않고 멈춘다)
do $$
begin
  if to_regclass('public.roster') is null or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_guest()') is null or to_regprocedure('public.whoami()') is null then
    raise exception '0017_needs_0001';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = to_regclass('public.profiles') and attname = 'look' and not attisdropped) then
    raise exception '0017_needs_0006';
  end if;
  if to_regclass('realtime.messages') is null or to_regprocedure('realtime.topic()') is null
     or to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    raise exception '0017_needs_supabase_realtime';
  end if;
end $$;

-- ───────────────────────────── 숫자(여기만 고치면 된다)
create or replace function public.social_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'chat_body_max', 300,         -- 글 한 줄(글자)
    'chat_mentions_max', 5,       -- 한 글에 멘션할 사람
    'chat_gap_ms', 1500,          -- 같은 사람: 이 간격(ms)에 하나
    'chat_minute_max', 20,        -- 같은 사람: 1분에 이만큼
    'chat_live_per_second', 2,    -- 모두에게 바로 퍼뜨리는 새 글(대화창 글만): 1초에 이만큼(넘친 글은 대화창이 다시 물어 채운다).
                                  --   받는 쪽은 대화창을 연 사람 수만큼 센다: 2 × 연 사람 40 = 초당 80(무료 한도 100).
                                  --   청중이 많은 날은 Realtime 요금제(Pro는 초당 500)를 먼저 올린다
    'trail_points_max', 120,      -- 걸은 길: 한 번에 보내는 점
    'trail_minute_max', 8,        -- 걸은 길: 같은 사람이 1분에 보내는 횟수
    'trail_day_points', 40000,    -- 걸은 길: 같은 사람이 하루(한국 시간)에 남기는 점
    'trail_span_minutes', 15      -- 걸은 길: 한 묶음의 처음과 끝 사이
  )
$$;

-- ───────────────────────────── 1. 사람 구분값(sub) 기록
-- 사이트 서버만(비밀 키) 적는다. 정책이 없다: 정의자 함수만 읽는다.
create table if not exists public.chat_people (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sub text not null unique check (sub ~ '^[A-Za-z0-9_-]{22}$'),
  updated_at timestamptz not null default now()
);
alter table public.chat_people enable row level security;
revoke all on public.chat_people from public, anon, authenticated;

-- 서명 키가 바뀌어 sub가 달라지면 새 값으로 고친다(옛 글의 sub는 그대로 남는다).
-- 다른 사람이 이미 쓰는 sub면 false(일어나지 않아야 한다: sub는 로그인 id의 서명값이다).
create or replace function public.chat_register(p_user uuid, p_sub text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_sub is null or p_sub !~ '^[A-Za-z0-9_-]{22}$' then return false; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then return false; end if;
  insert into public.chat_people as cp (user_id, sub) values (p_user, p_sub)
  on conflict (user_id) do update set sub = excluded.sub, updated_at = now()
    where cp.sub is distinct from excluded.sub;
  return true;
exception when unique_violation then
  return false;
end $$;

-- ───────────────────────────── 2. 이름표
-- 걷기 화면 이름표(gameName)와 같은 모양: 공백·제어문자를 한 칸으로, 16자, 비면 '손님'
create or replace function public.chat_clean_name(p text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(left(btrim(regexp_replace(coalesce(p, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), 16)), ''), '손님')
$$;

-- 멘션 받는 사람의 이름: whoami()와 같은 차례(이름표 별명 → 명단 이름)
create or replace function public.chat_name_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.chat_clean_name(coalesce(
    (select nullif(btrim(p.nickname), '') from public.profiles p where p.user_id = p_user),
    (select r.display_name from public.roster r where r.claimed_by = p_user and r.revoked_at is null limit 1)))
$$;

-- ───────────────────────────── 3. 대화
create table if not exists public.chat_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  recent timestamptz[] not null default '{}'
);
alter table public.chat_rate enable row level security;
revoke all on public.chat_rate from public, anon, authenticated;

--   via   window(대화창에 쓴 글) | say(Enter로 띄운 말풍선, 같은 공간 사람에게 머리 위로도 보였다).
--         말풍선은 그때 같은 공간에 있던 사람에게만 보였던 말이라, 기록은 남기되 대화 이력에는 쓴 사람과 가족·집주인에게만 보이고
--         모두에게 퍼뜨리지 않는다
--   live  모두에게 바로 퍼뜨린 글인가(넣기 전에 DB가 정한다: 대화창 글이고 지난 1초에 퍼뜨린 글이 한도보다 적을 때)
--   space 쓴 사람이 있던 곳: house:real(실제 집) | room:<slug>(방 장면) | null(모름)
--   name·look은 쓴 때의 이름표와 겉모습(나중에 바꿔도 그때 모습으로 남는다)
--   mentions [{sub, name}] 멘션한 사람(다섯까지, 쓴 때의 이름)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sub text not null check (sub ~ '^[A-Za-z0-9_-]{22}$'),
  name text not null check (char_length(name) between 1 and 40),
  look jsonb check (look is null or (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 1024)),
  body text not null check (char_length(body) between 1 and 300 and body !~ '[[:cntrl:]]'),
  mentions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(mentions) = 'array' and jsonb_array_length(mentions) <= 5),
  space text check (space is null or space ~ '^(house:real|room:[a-z0-9-]{2,32})$'),
  via text not null default 'window' check (via in ('window', 'say')),
  live boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.chat_messages add column if not exists live boolean not null default false;
create index if not exists chat_messages_time on public.chat_messages (created_at desc, id desc);
create index if not exists chat_messages_user_time on public.chat_messages (user_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from public, anon, authenticated;

-- 화면과 실시간 채널로 나가는 한 줄(쓴 사람의 로그인 id는 넣지 않는다). ms는 밀리초(정렬·표시용), at은 다음 쪽 묻기용
create or replace function public.chat_wire(m public.chat_messages) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'sub', m.sub, 'name', m.name, 'look', m.look, 'body', m.body, 'mentions', m.mentions,
    'space', m.space, 'via', m.via, 'at', m.created_at,
    'ms', floor(extract(epoch from m.created_at) * 1000)::bigint)
$$;

-- 글 하나 쓰기. 결과 {ok:true, message} 또는 {ok:false, reason}:
--   not_guest(명단 손님이 아님) | no_subject(sub가 아직 없음: 사이트가 chat_register 뒤 다시 부른다) | bad_via
--   empty | too_long | bad_space | too_many_mentions | too_fast(1.5초) | too_many(1분에 스무 개)
create or replace function public.chat_post(p_body text, p_mentions text[] default '{}', p_space text default null,
                                            p_via text default 'window')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lim jsonb := public.social_limits();
  v_sub text;
  v_body text;
  v_via text := coalesce(p_via, 'window');
  v_recent timestamptz[];
  v_mentions jsonb;
  v_row public.chat_messages;
begin
  if v_uid is null or not public.is_guest() then
    return jsonb_build_object('ok', false, 'reason', 'not_guest');
  end if;
  select cp.sub into v_sub from public.chat_people cp where cp.user_id = v_uid;
  if v_sub is null then return jsonb_build_object('ok', false, 'reason', 'no_subject'); end if;
  if v_via not in ('window', 'say') then return jsonb_build_object('ok', false, 'reason', 'bad_via'); end if;
  -- 한 줄로: 줄바꿈·제어문자·겹친 공백을 한 칸으로
  v_body := btrim(regexp_replace(coalesce(p_body, ''), '[[:space:][:cntrl:]]+', ' ', 'g'));
  if v_body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_body) > (v_lim ->> 'chat_body_max')::int then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;
  if p_space is not null and p_space !~ '^(house:real|room:[a-z0-9-]{2,32})$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_space');
  end if;
  if (select count(distinct s) from unnest(coalesce(p_mentions, '{}'::text[])) s) > (v_lim ->> 'chat_mentions_max')::int then
    return jsonb_build_object('ok', false, 'reason', 'too_many_mentions');
  end if;
  -- 멘션: 대화를 쓰는 사람(chat_people)만, 나는 빼고, 같은 사람은 한 번. 이름은 지금의 이름표
  select coalesce(jsonb_agg(jsonb_build_object('sub', x.sub, 'name', public.chat_name_of(x.user_id)) order by x.ord), '[]'::jsonb)
    into v_mentions
    from (select distinct on (cp.sub) cp.sub, cp.user_id, m.ord
            from unnest(coalesce(p_mentions, '{}'::text[])) with ordinality as m(s, ord)
            join public.chat_people cp on cp.sub = m.s
           where cp.user_id <> v_uid
           order by cp.sub, m.ord) x;
  -- 빠르기: 같은 사람의 보내기만 한 줄로 세운다(동시에 여러 번 눌러도 넘지 않게). 다른 사람은 기다리지 않는다
  perform pg_advisory_xact_lock(hashtextextended('joyeondang:chat:' || v_uid::text, 0));
  v_recent := array(select t from unnest(coalesce((select r.recent from public.chat_rate r where r.user_id = v_uid),
                                                   '{}'::timestamptz[])) t
                     where t > now() - interval '1 minute' order by t);
  if cardinality(v_recent) > 0
     and now() - v_recent[cardinality(v_recent)] < make_interval(secs => (v_lim ->> 'chat_gap_ms')::int / 1000.0) then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;
  if cardinality(v_recent) >= (v_lim ->> 'chat_minute_max')::int then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.chat_rate (user_id, recent) values (v_uid, v_recent || now())
  on conflict (user_id) do update set recent = excluded.recent;
  insert into public.chat_messages (user_id, sub, name, look, body, mentions, space, via)
  values (v_uid, v_sub, public.chat_clean_name((public.whoami()) ->> 'name'),
          (select p.look from public.profiles p where p.user_id = v_uid),
          v_body, v_mentions, p_space, v_via)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'message', public.chat_wire(v_row) || jsonb_build_object('mine', true));
end $$;

-- 대화 읽기(명단 손님 이상). 새것부터 p_limit개(1~100).
--   p_before(·p_before_id): 그보다 앞의 글(위로 올려 옛 글 보기). id까지 주면 같은 때에 쓴 글도 빠뜨리지 않는다
--   p_after(·p_after_id): 그보다 뒤의 글을 오래된 것부터(놓친 새 글 채우기). 둘 다 없으면 가장 새 글들
create or replace function public.chat_list(p_before timestamptz default null, p_before_id uuid default null,
                                            p_after timestamptz default null, p_after_id uuid default null,
                                            p_limit int default 50)
returns table (id uuid, sub text, name text, look jsonb, body text, mentions jsonb, space text, via text,
               created_at timestamptz, mine boolean)
language sql stable security definer set search_path = '' as $$
  (select m.id, m.sub, m.name, m.look, m.body, m.mentions, m.space, m.via, m.created_at, m.user_id = auth.uid()
     from public.chat_messages m
    where public.is_guest() and p_after is null
      and (m.via <> 'say' or m.user_id = auth.uid() or public.is_family())
      and (p_before is null
           or (p_before_id is null and m.created_at < p_before)
           or (p_before_id is not null and (m.created_at, m.id) < (p_before, p_before_id)))
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100))
  union all
  (select m.id, m.sub, m.name, m.look, m.body, m.mentions, m.space, m.via, m.created_at, m.user_id = auth.uid()
     from public.chat_messages m
    where public.is_guest() and p_after is not null
      and (m.via <> 'say' or m.user_id = auth.uid() or public.is_family())
      and ((p_after_id is null and m.created_at > p_after)
           or (p_after_id is not null and (m.created_at, m.id) > (p_after, p_after_id)))
    order by m.created_at asc, m.id asc
    limit least(greatest(coalesce(p_limit, 50), 1), 100))
$$;

-- 지우기: 내 글은 언제든(명단에서 빠진 뒤에도), 관리자는 누구의 글이든. 줄째 지운다
create or replace function public.chat_delete(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_id is null then return false; end if;
  delete from public.chat_messages m where m.id = p_id and (m.user_id = auth.uid() or public.is_admin());
  return found;
end $$;

-- 나를 멘션한 글을 받는 채널 이름(명단 손님이고 sub가 적혀 있을 때만). Realtime 정책이 부른다
create or replace function public.chat_my_topic() returns text
language sql stable security definer set search_path = '' as $$
  select 'walk:me:' || cp.sub from public.chat_people cp where cp.user_id = auth.uid() and public.is_guest()
$$;

-- 넣기 전에 모두에게 퍼뜨릴 글인지 정한다: 대화창 글이고, 지난 1초에 퍼뜨린 글이 한도보다 적을 때.
-- 퍼뜨린 글만 센다(넘쳐 퍼뜨리지 않은 글까지 세면 글이 몰리는 동안 실시간이 아예 멈춘다). 같은 순간에 들어오는 글끼리는
-- 트랜잭션 잠금으로 한 줄로 세워 둘이 함께 「아직 한도 안」으로 읽지 않게 한다(커밋하면 풀린다)
create or replace function public.chat_messages_pick_live() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.live := false;
  if new.via = 'window' then
    perform pg_advisory_xact_lock(hashtext('public.chat_messages_live'));
    new.live := (select count(*) from public.chat_messages c where c.live and c.created_at > now() - interval '1 second')
                < (public.social_limits() ->> 'chat_live_per_second')::int;
  end if;
  return new;
end $$;

drop trigger if exists chat_messages_pick_live on public.chat_messages;
create trigger chat_messages_pick_live before insert on public.chat_messages
  for each row execute function public.chat_messages_pick_live();

-- 새 글과 지운 글을 실시간 채널로. realtime.send는 실패해도 경고만 남기고 넣기·지우기를 막지 않는다(Supabase 정의)
create or replace function public.chat_messages_live() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_wire jsonb;
  v_to jsonb;
begin
  if tg_op = 'DELETE' then
    perform realtime.send(jsonb_build_object('id', old.id), 'gone', 'walk:chat', true);
    return null;
  end if;
  v_wire := public.chat_wire(new);
  -- 멘션은 받는 사람에게만(다섯까지), 늘 보낸다
  for v_to in select value from jsonb_array_elements(new.mentions) loop
    perform realtime.send(v_wire, 'mention', 'walk:me:' || (v_to ->> 'sub'), true);
  end loop;
  -- 모두에게 퍼뜨리는 새 글(넣기 전에 정해 둔 live만. Realtime은 받는 사람마다 하나로 센다)
  if new.live then
    perform realtime.send(v_wire, 'new', 'walk:chat', true);
  end if;
  return null;
end $$;

drop trigger if exists chat_messages_live on public.chat_messages;
create trigger chat_messages_live after insert or delete on public.chat_messages
  for each row execute function public.chat_messages_live();

-- ───────────────────────────── 4. 실시간 채널 권한(realtime.messages 정책)
-- 들어올 때 한 번 판정하고 연결 동안 기억한다(새 토큰을 보내면 다시 판정). 명단에서 빠진 사람은 토큰이 끝날 때 끊긴다.
-- walk:chat에는 보내기(insert) 정책을 두지 않는다: 새 글은 위 트리거만 보낸다.
drop policy if exists jy_walk_chat_read on realtime.messages;
create policy jy_walk_chat_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = 'walk:chat'
         and (select public.is_guest()));

drop policy if exists jy_walk_online_read on realtime.messages;
create policy jy_walk_online_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'presence' and (select realtime.topic()) = 'walk:online'
         and (select public.is_guest()));

drop policy if exists jy_walk_online_track on realtime.messages;
create policy jy_walk_online_track on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and (select realtime.topic()) = 'walk:online'
              and (select public.is_guest()));

drop policy if exists jy_walk_me_read on realtime.messages;
create policy jy_walk_me_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = (select public.chat_my_topic()));

-- ───────────────────────────── 5. 걸은 길
--   points [[ms, x, y, z, yaw], …] 사이트가 받은 때에 맞춰 고친 시각(ms), 자리(m), 몸 방향(라디안). n은 점 수
--   t0·t1 첫 점과 끝 점의 때. name·sub는 보낸 때의 이름표와 구분값
create table if not exists public.walk_trails (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sub text,
  name text not null check (char_length(name) between 1 and 40),
  space text not null check (space ~ '^(house:real|room:[a-z0-9-]{2,32})$'),
  t0 timestamptz not null,
  t1 timestamptz not null,
  n int not null check (n between 1 and 120),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) = n),
  created_at timestamptz not null default now(),
  constraint walk_trails_span check (t1 >= t0 and t1 - t0 <= interval '15 minutes')
);
create index if not exists walk_trails_t0 on public.walk_trails (t0);
create index if not exists walk_trails_user_time on public.walk_trails (user_id, created_at desc);
alter table public.walk_trails enable row level security;
revoke all on public.walk_trails from public, anon, authenticated;
grant select on public.walk_trails to authenticated;
drop policy if exists walk_trails_family_select on public.walk_trails;
create policy walk_trails_family_select on public.walk_trails for select to authenticated
  using ((select public.is_family()));

-- 걸은 길 한 묶음 남기기. 결과 {ok:true} 또는 {ok:false, reason}:
--   not_guest | bad_space | bad_points(모양·자리) | bad_time(20분보다 오래됐거나 앞날, 묶음이 15분보다 김) | bad_order
--   too_many(1분에 여덟 번) | too_many_today(하루 4만 점)
create or replace function public.trail_post(p_space text, p_points jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lim jsonb := public.social_limits();
  v_now_ms numeric := floor(extract(epoch from now()) * 1000);
  v_n int;
  v_pt jsonb;
  v_t numeric;
  v_first numeric;
  v_prev numeric;
  v_i int;
begin
  if v_uid is null or not public.is_guest() then return jsonb_build_object('ok', false, 'reason', 'not_guest'); end if;
  if p_space is null or p_space !~ '^(house:real|room:[a-z0-9-]{2,32})$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_space');
  end if;
  if p_points is null or jsonb_typeof(p_points) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_points');
  end if;
  v_n := jsonb_array_length(p_points);
  if v_n < 1 or v_n > (v_lim ->> 'trail_points_max')::int then
    return jsonb_build_object('ok', false, 'reason', 'bad_points');
  end if;
  for v_pt in select value from jsonb_array_elements(p_points) loop
    if jsonb_typeof(v_pt) <> 'array' or jsonb_array_length(v_pt) <> 5 then
      return jsonb_build_object('ok', false, 'reason', 'bad_points');
    end if;
    for v_i in 0..4 loop
      if jsonb_typeof(v_pt -> v_i) <> 'number' then return jsonb_build_object('ok', false, 'reason', 'bad_points'); end if;
    end loop;
    -- 자리는 집 둘레(1km 안), 높이는 100m 안, 몸 방향은 한 바퀴 남짓 안
    if abs((v_pt ->> 1)::numeric) > 1000 or abs((v_pt ->> 2)::numeric) > 100 or abs((v_pt ->> 3)::numeric) > 1000
       or abs((v_pt ->> 4)::numeric) > 7 then
      return jsonb_build_object('ok', false, 'reason', 'bad_points');
    end if;
    v_t := (v_pt ->> 0)::numeric;
    if v_t < v_now_ms - 20 * 60 * 1000 or v_t > v_now_ms + 60 * 1000 then
      return jsonb_build_object('ok', false, 'reason', 'bad_time');
    end if;
    if v_prev is not null and v_t < v_prev then return jsonb_build_object('ok', false, 'reason', 'bad_order'); end if;
    if v_first is null then v_first := v_t; end if;
    v_prev := v_t;
  end loop;
  if v_prev - v_first > (v_lim ->> 'trail_span_minutes')::int * 60 * 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_time');
  end if;
  -- 양: 같은 사람의 보내기만 한 줄로 세운다
  perform pg_advisory_xact_lock(hashtextextended('joyeondang:trail:' || v_uid::text, 0));
  if (select count(*) from public.walk_trails w where w.user_id = v_uid and w.created_at > now() - interval '1 minute')
     >= (v_lim ->> 'trail_minute_max')::int then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  if (select coalesce(sum(w.n), 0) from public.walk_trails w
       where w.user_id = v_uid
         and w.created_at >= ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul'))
     + v_n > (v_lim ->> 'trail_day_points')::int then
    return jsonb_build_object('ok', false, 'reason', 'too_many_today');
  end if;
  insert into public.walk_trails (user_id, sub, name, space, t0, t1, n, points)
  values (v_uid, (select cp.sub from public.chat_people cp where cp.user_id = v_uid),
          public.chat_clean_name((public.whoami()) ->> 'name'), p_space,
          to_timestamp((v_first / 1000.0)::float8), to_timestamp((v_prev / 1000.0)::float8), v_n, p_points);
  return jsonb_build_object('ok', true);
end $$;

-- 걸은 길 읽기(가족·관리자, 컨트롤 룸의 다시 보기). [p_from, p_to)에 걸친 묶음을 id 차례로, p_after 다음부터 p_limit개(1~1000)
create or replace function public.walk_trails_read(p_from timestamptz, p_to timestamptz, p_after bigint default 0,
                                                   p_limit int default 500)
returns table (id bigint, sub text, name text, space text, t0 timestamptz, t1 timestamptz, points jsonb)
language sql stable security definer set search_path = '' as $$
  select w.id, w.sub, w.name, w.space, w.t0, w.t1, w.points
    from public.walk_trails w
   where public.is_family() and w.t1 >= p_from and w.t0 < p_to and w.id > coalesce(p_after, 0)
   order by w.id
   limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;

-- ───────────────────────────── 권한 정리
-- Supabase는 public 스키마의 새 함수에 기본 실행권을 준다. 거두고 필요한 것만 다시 연다.
revoke execute on function public.social_limits(), public.chat_register(uuid, text), public.chat_clean_name(text),
  public.chat_name_of(uuid), public.chat_wire(public.chat_messages),
  public.chat_post(text, text[], text, text), public.chat_list(timestamptz, uuid, timestamptz, uuid, int),
  public.chat_delete(uuid), public.chat_my_topic(), public.chat_messages_live(), public.chat_messages_pick_live(),
  public.trail_post(text, jsonb),
  public.walk_trails_read(timestamptz, timestamptz, bigint, int)
  from public, anon, authenticated;
-- sub 적기는 사이트 서버의 비밀 키로만
grant execute on function public.chat_register(uuid, text) to service_role;
-- 로그인한 사람의 세션으로 부르는 것들(명단 손님인지는 함수가 다시 본다). chat_my_topic은 Realtime 정책이 부른다
grant execute on function public.social_limits(), public.chat_post(text, text[], text, text),
  public.chat_list(timestamptz, uuid, timestamptz, uuid, int), public.chat_delete(uuid), public.chat_my_topic(),
  public.trail_post(text, jsonb), public.walk_trails_read(timestamptz, timestamptz, bigint, int)
  to authenticated;
