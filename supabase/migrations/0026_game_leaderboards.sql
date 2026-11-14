-- 0026 방 놀이 리더보드(2026-11-13): 모든 놀이 방과 웹(/games, /room/[slug])에서 함께 보는 최고 점수판.
-- 원칙:
--   1. 직접 테이블 조회는 본인 기록과 관리자만 허용하고, 공개 순위표는 user_id를 뺀 전용 함수로만 내려준다.
--   2. 점수 등록은 명단 손님 이상(role_rank >= 1)만 가능하며, 한 사람·한 놀이당 최고 기록 한 줄만 유지한다(동점이면 짧은 시간 우선).
--   3. 실명 강제 없이 화면 별칭(1~24자, 제어문자 제거)만 저장한다.

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null check (game_id ~ '^[a-z0-9-]{2,24}$'),
  room_slug text not null references public.rooms(slug) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  score int not null check (score between 0 and 100000),
  ms int not null check (ms between 500 and 3600000),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists idx_game_scores_rank on public.game_scores (game_id, score desc, ms asc, updated_at asc);
create index if not exists idx_game_scores_room on public.game_scores (room_slug, score desc);

alter table public.game_scores enable row level security;

drop policy if exists "game_scores_select_own_or_admin" on public.game_scores;
create policy "game_scores_select_own_or_admin" on public.game_scores
  for select to authenticated
  using (user_id = auth.uid() or public.role_rank(public.my_role()) >= 3);

-- 쓰기는 모두 submit_game_score 함수를 거친다(직접 insert/update/delete 차단).

create or replace function public.submit_game_score(
  p_game text,
  p_room text,
  p_display_name text,
  p_score int,
  p_ms int,
  p_detail jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.my_role();
  v_name text;
  v_prev record;
  v_improved boolean := false;
  v_best int;
  v_rank int;
begin
  if v_uid is null or public.role_rank(v_role) < 1 then
    raise exception 'not_allowed';
  end if;
  if p_game is null or p_game !~ '^[a-z0-9-]{2,24}$' then
    raise exception 'invalid_game';
  end if;
  if not exists (select 1 from public.rooms r where r.slug = p_room) then
    raise exception 'invalid_room';
  end if;
  if p_score is null or p_score < 0 or p_score > 100000 then
    raise exception 'invalid_score';
  end if;
  if p_ms is null or p_ms < 500 or p_ms > 3600000 then
    raise exception 'invalid_ms';
  end if;

  v_name := btrim(regexp_replace(coalesce(p_display_name, ''), '[\u0000-\u001f\u007f]+', ' ', 'g'));
  if v_name = '' then
    v_name := '손님';
  end if;
  v_name := left(v_name, 24);

  select gs.score, gs.ms into v_prev
    from public.game_scores gs
    where gs.game_id = p_game and gs.user_id = v_uid;

  if not found then
    insert into public.game_scores (game_id, room_slug, user_id, display_name, score, ms, detail)
      values (p_game, p_room, v_uid, v_name, p_score, p_ms, coalesce(p_detail, '{}'::jsonb));
    v_improved := true;
    v_best := p_score;
  elsif p_score > v_prev.score or (p_score = v_prev.score and p_ms < v_prev.ms) then
    update public.game_scores
      set room_slug = p_room,
          display_name = v_name,
          score = p_score,
          ms = p_ms,
          detail = coalesce(p_detail, '{}'::jsonb),
          updated_at = now()
      where game_id = p_game and user_id = v_uid;
    v_improved := true;
    v_best := p_score;
  else
    -- 점수가 이전 최고 기록보다 낮아도 이름표만 최신으로 맞춘다
    update public.game_scores
      set display_name = v_name
      where game_id = p_game and user_id = v_uid and display_name is distinct from v_name;
    v_best := v_prev.score;
  end if;

  select count(*) + 1 into v_rank
    from public.game_scores gs
    where gs.game_id = p_game
      and (gs.score > v_best or (gs.score = v_best and gs.ms < coalesce(case when v_improved then p_ms else v_prev.ms end, p_ms)));

  return jsonb_build_object(
    'ok', true,
    'improved', v_improved,
    'bestScore', v_best,
    'rank', v_rank
  );
end;
$$;

-- 누구나(웹 /games, 방 리더보드) 볼 수 있는 순위표 조회 함수(user_id 미노출, 본인 줄만 is_me 표시).
create or replace function public.list_game_leaderboard(
  p_game text default null,
  p_limit int default 10
) returns table (
  game_id text,
  room_slug text,
  rank int,
  display_name text,
  score int,
  ms int,
  updated_at timestamptz,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      gs.game_id,
      gs.room_slug,
      row_number() over (partition by gs.game_id order by gs.score desc, gs.ms asc, gs.updated_at asc)::int as rank,
      gs.display_name,
      gs.score,
      gs.ms,
      gs.updated_at,
      (auth.uid() is not null and gs.user_id = auth.uid()) as is_me
    from public.game_scores gs
    where (p_game is null or gs.game_id = p_game)
  )
  select r.game_id, r.room_slug, r.rank, r.display_name, r.score, r.ms, r.updated_at, r.is_me
  from ranked r
  where r.rank <= greatest(1, least(coalesce(p_limit, 10), 30))
  order by r.game_id asc, r.rank asc;
$$;

revoke all on function public.submit_game_score(text, text, text, int, int, jsonb) from public;
grant execute on function public.submit_game_score(text, text, text, int, int, jsonb) to authenticated;

revoke all on function public.list_game_leaderboard(text, int) from public;
grant execute on function public.list_game_leaderboard(text, int) to anon, authenticated;

revoke all on table public.game_scores from public, anon;
revoke insert, update, delete on table public.game_scores from authenticated;
grant select on table public.game_scores to authenticated;
