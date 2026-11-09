-- 0002 방 장면과 방 놀이(2026-11-09): 새 방 셋의 문패를 만들고, 방 장면이 있는 다섯을 연다.
-- 그림과 글은 코드(src/content/rooms.ts, room-worlds.ts)에 있고, DB에는 문패 상태만 둔다.
-- 0001의 정책·함수·트리거는 건드리지 않는다.

-- 새 방: 좋아하는 것 방, 종이공 과녁 방, 생각 지도 방(이미 있으면 그대로 둔다)
insert into public.rooms (slug, door_state, accepts_records) values
  ('toybox', 'open', false),
  ('target', 'open', false),
  ('mind', 'open', false)
on conflict (slug) do nothing;

-- 방 장면으로 들어가는 다섯은 열림. 문패가 열려야 「들어가기」와 놀이 도장이 된다.
update public.rooms
  set door_state = 'open', updated_at = now()
  where slug in ('study', 'gable', 'toybox', 'target', 'mind');

-- 빛이 드는 방은 「문장 걸어 두기」 기록(format 'sentence')을 받는다. 검토 뒤 걸리는 규칙은 0001 그대로.
update public.rooms
  set accepts_records = true, updated_at = now()
  where slug = 'study';
