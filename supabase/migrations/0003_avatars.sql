-- 조연당 온라인 0003: AI 사진 캐릭터
--
-- 원칙
--   1. 사진과 그림은 비공개 버킷 avatars에만 둔다. 원본 <uid>/originals/<id>.jpg, 그림 <uid>/chars/<id>.png
--   2. 원본은 본인이 지울 때까지 보관한다. 원본은 본인만 보고 지운다. 그림은 명단 손님끼리만 본다.
--   3. 그림을 'ready'로 바꾸고 파일을 올리는 것은 서버(비밀 키, service_role)만 한다.
--      손님이 직접 올린 아무 그림이 다른 손님에게 캐릭터로 보이지 않게, 저장소에 손님 쓰기 정책을 두지 않는다.
--   4. 하루(KST) 한 사람 3장, 거절·실패까지 포함한 시도 8번. 모두 합친 하루 상한은 서버가 넘겨 준다
--      (환경 변수 AVATAR_DAILY_CAP_TOTAL). 숫자는 src/lib/avatar/rules.ts 와 같아야 한다.
--   5. 0001 위에 바로 올라가고 0002와는 무관하다.
--   6. 그리기는 대기열로 한다. 운영 서버는 원본을 올리고 queued로 남길 뿐, 그림은 Mac Studio의 일꾼
--      (worker/avatar, 비밀 키)이 avatar_claim()으로 하나씩 가져가 그린 뒤 avatar_settle()로 정리한다.
--      상태: pending(원본 올리는 중) → queued → drawing → ready | rejected | failed. 지우면 deleted.
--      한 작업은 세 번까지 잡는다(재시도 두 번). 일꾼이 죽어 임대가 끝나면 다음 잡기가 되돌린다.

-- ───────────────────────────── 캐릭터 한 장(만들기 한 번)
create table public.avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'drawing', 'ready', 'rejected', 'failed', 'deleted')),
  original_path text,
  image_path text,
  model text check (model is null or model ~ '^[A-Za-z0-9._:-]{1,64}$'),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 대기열: 잡은 횟수, 줄 선 때, 다시 잡을 수 있는 때, 지금 잡은 일꾼과 그때, 거절·실패 까닭
  attempts int not null default 0 check (attempts between 0 and 10),
  queued_at timestamptz,
  not_before timestamptz,
  claimed_at timestamptz,
  worker text check (worker is null or worker ~ '^[A-Za-z0-9._-]{1,40}$'),
  reason text check (reason is null or reason ~ '^[a-z_]{1,32}$'),
  constraint avatars_original_path_shape check (
    original_path is null or original_path in (
      user_id::text || '/originals/' || id::text || '.jpg',
      user_id::text || '/originals/' || id::text || '.png',
      user_id::text || '/originals/' || id::text || '.webp')),
  constraint avatars_image_path_shape check (
    image_path is null or image_path = user_id::text || '/chars/' || id::text || '.png'),
  constraint avatars_ready_has_image check (status <> 'ready' or image_path is not null),
  constraint avatars_queued_has_original check (status not in ('queued', 'drawing') or original_path is not null)
);
create index avatars_user_created on public.avatars (user_id, created_at desc);
create index avatars_created on public.avatars (created_at);
create index avatars_queue on public.avatars (queued_at) where status in ('queued', 'drawing');
alter table public.avatars enable row level security;

-- 직접 읽기는 내 것만. 다른 손님의 그림은 아래 함수로 경로만 얻는다(원본 경로·user_id를 내보내지 않게).
create policy avatars_own_select on public.avatars for select to authenticated
  using (user_id = (select auth.uid()));
-- insert/update/delete 정책 없음: 만들기는 avatar_begin(), 정리는 avatar_settle()(서버), 지우기는 avatar_forget().

-- 지금 보는 사람에게 쓰는 캐릭터
alter table public.profiles
  add column if not exists avatar_id uuid references public.avatars (id) on delete set null;

-- ───────────────────────────── 하루(KST)와 장수
create or replace function public.avatar_day_start() returns timestamptz
language sql stable set search_path = '' as $$
  select ((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')
$$;

-- used: 오늘 만든 장수(기다리는 것·지운 것 포함, 거절·실패 제외) / attempts: 오늘 시도 전부 / total: 오늘 모두가 만든 장수
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
    'per_user', 3,
    'attempts_max', 8
  )
$$;

-- 그림 만들기를 시작한다. 장수 확인과 줄 만들기를 한 번에(동시에 여러 번 눌러도 넘지 않게).
-- 결과: {"ok":true,"id":...} 또는 {"ok":false,"reason":"not_guest|consent|user_limit|attempt_limit|total_limit"}
create or replace function public.avatar_begin(p_consented boolean, p_total_cap int default 150) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_q jsonb;
  v_id uuid;
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
  insert into public.avatars (user_id, status, consent_at) values (auth.uid(), 'pending', now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 서버(service_role)만: 그리기를 마치면 상태와 경로를 적는다. 처음 만든 그림이면 바로 내 캐릭터로 쓴다.
-- ready는 원본을 남긴다(본인이 지울 때까지). rejected·failed는 원본 경로를 비운다(부르는 쪽이 파일을 먼저 지운다).
create or replace function public.avatar_settle(
  p_id uuid, p_status text, p_original_path text default null,
  p_image_path text default null, p_model text default null, p_reason text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
begin
  if p_status not in ('ready', 'failed', 'rejected') then
    raise exception 'bad_status' using errcode = '22023';
  end if;
  select * into v from public.avatars
   where id = p_id and status in ('pending', 'queued', 'drawing') for update;
  if not found then return false; end if;
  update public.avatars
     set status = p_status,
         original_path = case when p_status = 'ready' then coalesce(p_original_path, v.original_path) end,
         image_path = case when p_status = 'ready' then p_image_path end,
         model = p_model,
         reason = case when p_status = 'ready' then null else p_reason end,
         not_before = null, claimed_at = null
   where id = p_id;
  if p_status = 'ready' then
    insert into public.profiles (user_id, avatar_id) values (v.user_id, p_id)
    on conflict (user_id) do update set avatar_id = excluded.avatar_id, updated_at = now()
      where public.profiles.avatar_id is null
         or not exists (select 1 from public.avatars a
                         where a.id = public.profiles.avatar_id and a.status = 'ready');
  end if;
  return true;
end $$;

-- ───────────────────────────── 대기열(운영 서버·일꾼 전용, service_role)
-- 운영 서버: 원본을 올린 뒤 줄에 세운다.
create or replace function public.avatar_enqueue(p_id uuid, p_original_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.avatars
     set status = 'queued', original_path = p_original_path, queued_at = now()
   where id = p_id and status = 'pending';
  return found;
end $$;

-- 일꾼이 살아 있다는 기록. 화면은 이것을 보고 「일꾼이 쉬는 중이라 조금 늦어요」를 띄운다.
create table public.avatar_workers (
  worker text primary key check (worker ~ '^[A-Za-z0-9._-]{1,40}$'),
  seen_at timestamptz not null default now(),
  version text check (version is null or version ~ '^[A-Za-z0-9._:+-]{1,40}$')
);
alter table public.avatar_workers enable row level security;  -- 정책 없음: 아래 함수로만

create or replace function public.avatar_worker_beat(p_worker text, p_version text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.avatar_workers (worker, seen_at, version) values (p_worker, now(), p_version)
  on conflict (worker) do update set seen_at = now(), version = coalesce(excluded.version, public.avatar_workers.version)
$$;

-- 일꾼이 작업 하나를 잡는다. 여러 일꾼이 동시에 불러도 한 작업을 둘이 잡지 않는다(skip locked).
-- 결과: null(할 일 없음) 또는 {id, user_id, original_path, attempts, give_up}
--   give_up: 세 번 잡고도 끝나지 않은 작업(일꾼이 도중에 멈춤). 일꾼은 원본을 지우고 failed로 정리한다.
create or replace function public.avatar_claim(p_worker text, p_lease_seconds int default 600) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.avatars;
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 600), 60));
begin
  perform public.avatar_worker_beat(p_worker);
  -- 원본을 못 올리고 멈춘 줄은 실패로(장수에 세지 않는다)
  update public.avatars set status = 'failed', reason = 'stale_upload'
   where status = 'pending' and created_at < now() - interval '30 minutes';
  -- 임대가 끝난 작업: 세 번 미만이면 다시 줄에
  update public.avatars set status = 'queued', claimed_at = null, worker = null, not_before = null
   where status = 'drawing' and claimed_at < now() - v_lease and attempts < 3;
  select * into v from public.avatars
   where status = 'drawing' and claimed_at < now() - v_lease and attempts >= 3
   order by claimed_at limit 1 for update skip locked;
  if found then
    update public.avatars set claimed_at = now(), worker = p_worker where id = v.id;
    return jsonb_build_object('id', v.id, 'user_id', v.user_id, 'original_path', v.original_path,
                              'attempts', v.attempts, 'give_up', true);
  end if;
  select * into v from public.avatars
   where status = 'queued' and (not_before is null or not_before <= now())
   order by queued_at, created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.avatars
     set status = 'drawing', attempts = attempts + 1, claimed_at = now(), worker = p_worker
   where id = v.id;
  return jsonb_build_object('id', v.id, 'user_id', v.user_id, 'original_path', v.original_path,
                            'attempts', v.attempts + 1, 'give_up', false);
end $$;

-- 잠깐의 실패(프록시가 바쁨 등): 조금 뒤 다시 잡도록 줄에 돌린다. 세 번째 실패는 일꾼이 failed로 정리한다.
create or replace function public.avatar_release(p_id uuid, p_worker text, p_delay_seconds int default 60)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.avatars
     set status = 'queued', claimed_at = null, worker = null,
         not_before = now() + make_interval(secs => least(greatest(coalesce(p_delay_seconds, 60), 0), 3600))
   where id = p_id and status = 'drawing' and worker = p_worker;
  return found;
end $$;

-- 내 작업 하나의 상태(본인만). /api/avatar/status가 쓴다.
-- {status, reason, created_at, ahead: 내 앞에 선 작업 수, worker_seen_at: 일꾼이 마지막으로 살아 있던 때}
create or replace function public.avatar_job_status(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', a.status, 'reason', a.reason, 'created_at', a.created_at,
    'ahead', (select count(*) from public.avatars q
               where q.status in ('queued', 'drawing') and q.queued_at < coalesce(a.queued_at, now())),
    'worker_seen_at', (select max(w.seen_at) from public.avatar_workers w))
    from public.avatars a
   where a.id = p_id and a.user_id = auth.uid()
$$;

-- 내 캐릭터 고르기. p_id가 null이면 종이 인형으로 돌아간다.
create or replace function public.avatar_choose(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_guest() then return false; end if;
  if p_id is null then
    update public.profiles set avatar_id = null, updated_at = now() where user_id = auth.uid();
    return true;
  end if;
  if not exists (select 1 from public.avatars where id = p_id and user_id = auth.uid() and status = 'ready') then
    return false;
  end if;
  insert into public.profiles (user_id, avatar_id) values (auth.uid(), p_id)
  on conflict (user_id) do update set avatar_id = excluded.avatar_id, updated_at = now();
  return true;
end $$;

-- 지우기 기록. 파일은 서버가 저장소에서 먼저 지운 뒤 부른다. p_part: original | character | both
-- 지운 줄도 오늘 장수에는 남는다(지우고 다시 만들기로 하루 3장을 넘지 않게).
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
         claimed_at = null, not_before = null
   where id = p_id and user_id = auth.uid();
  return found;
end $$;

-- 다른 손님(또는 나)의 지금 캐릭터 그림 경로. 명단 손님만 얻는다. 걷기·함께 걷기에서 쓴다.
create or replace function public.avatar_image_path(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select a.image_path
    from public.profiles p
    join public.avatars a on a.id = p.avatar_id
   where public.is_guest() and p.user_id = p_user and a.status = 'ready'
$$;

-- 그림 한 장의 경로(명단 손님만, ready만). /api/avatar/[id]가 쓴다.
create or replace function public.avatar_char_path(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select a.image_path from public.avatars a
   where public.is_guest() and a.id = p_id and a.status = 'ready'
$$;

-- 저장소 정책용: 이 파일이 지금 ready인 그림인가(명단 손님만)
create or replace function public.avatar_char_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_guest()
     and exists (select 1 from public.avatars a where a.status = 'ready' and a.image_path = p_name)
$$;

-- 이름표를 저장할 때 다른 사람의 그림이나 지운 그림을 내 캐릭터로 걸 수 없게
create or replace function public.profiles_guard_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_id is not null
     and (tg_op = 'INSERT' or new.avatar_id is distinct from old.avatar_id)
     and not exists (select 1 from public.avatars a
                      where a.id = new.avatar_id and a.user_id = new.user_id and a.status = 'ready') then
    raise exception 'avatar_not_yours' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_avatar before insert or update of avatar_id on public.profiles
  for each row execute function public.profiles_guard_avatar();

-- ───────────────────────────── 저장소(비공개 버킷)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 본인: 내 폴더(<uid>/) 안의 원본과 그림을 보고 지운다. 올리기는 서버만(위 원칙 3).
create policy avatars_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- 명단 손님: ready인 그림(*/chars/*)만 본다. 원본은 볼 수 없다.
create policy avatars_guest_select_chars on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[2] = 'chars'
         and public.avatar_char_readable(name));

-- ───────────────────────────── 권한 정리
revoke all on public.avatars from anon;
revoke insert, update, delete on public.avatars from authenticated;
revoke all on public.avatar_workers from anon, authenticated;

revoke execute on function public.avatar_day_start(), public.avatar_quota(),
  public.avatar_begin(boolean, int),
  public.avatar_settle(uuid, text, text, text, text, text), public.avatar_choose(uuid),
  public.avatar_forget(uuid, text), public.avatar_image_path(uuid), public.avatar_char_path(uuid),
  public.avatar_char_readable(text), public.profiles_guard_avatar(),
  public.avatar_enqueue(uuid, text), public.avatar_worker_beat(text, text), public.avatar_claim(text, int),
  public.avatar_release(uuid, text, int), public.avatar_job_status(uuid)
  from public, anon, authenticated;

grant execute on function public.avatar_quota(), public.avatar_begin(boolean, int),
  public.avatar_choose(uuid), public.avatar_forget(uuid, text), public.avatar_job_status(uuid),
  public.avatar_image_path(uuid), public.avatar_char_path(uuid), public.avatar_char_readable(text)
  to authenticated;
-- 비밀 키(service_role)만: 줄 세우기(운영 서버), 잡기·되돌리기·살아 있음·정리(일꾼)
grant execute on function public.avatar_settle(uuid, text, text, text, text, text),
  public.avatar_enqueue(uuid, text), public.avatar_worker_beat(text, text), public.avatar_claim(text, int),
  public.avatar_release(uuid, text, int)
  to service_role;
