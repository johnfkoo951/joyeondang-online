-- 0008 방 셋 더(2026-11-09): 손님방·작업 차고의 문패를 열고, 아직 비어 있는 방은 닫힌 문패로 만든다.
-- 그림과 글은 코드(src/content/rooms.ts, room-worlds.ts)에 있고, DB에는 문패 상태만 둔다.
-- 0001의 정책·함수·트리거는 건드리지 않는다. 이미 있는 방은 그대로 둔다.

insert into public.rooms (slug, door_state, accepts_records) values
  ('guest', 'open', false),
  ('garage', 'open', false),
  ('spare', 'closed', false)
on conflict (slug) do nothing;
