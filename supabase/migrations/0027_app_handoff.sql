-- 0027 홈 화면 앱 로그인 이어받기(2026-11-13).
-- 아이폰 홈 화면 앱은 사파리와 저장소가 따로라, 앱에서 시작한 구글 로그인이 사파리 쪽에서 끝나고 앱은 로그인되지 않은 채 남는다.
-- 그래서 사파리(로그인한 쪽)에서 짧은 코드를 받고, 홈 화면 앱에 넣으면 서버가 같은 사람의 세션을 앱에 만든다.
-- 원칙:
--   1. 코드는 해시(서버 비밀로 HMAC)만 저장한다. 5분 뒤 끝나고, 한 번 쓰면 끝난다(used_at).
--   2. 표는 서버(비밀 키)만 읽고 쓴다: RLS를 켜고 정책을 두지 않으며, anon·authenticated의 권한을 거둔다.
--   3. 사람을 지우면(auth.users) 그 사람의 코드도 지워진다.

create table if not exists public.app_handoff (
  code_hash text primary key check (char_length(code_hash) = 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_app_handoff_user on public.app_handoff (user_id, created_at desc);
create index if not exists idx_app_handoff_expires on public.app_handoff (expires_at);

alter table public.app_handoff enable row level security;
revoke all on public.app_handoff from anon, authenticated;
