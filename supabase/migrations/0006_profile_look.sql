-- 캐릭터 겉모습(직접 꾸민 기본 인형 또는 사진으로 만든 캐릭터 그림). 2026-11-09.
-- 값의 모양은 사이트가 계약(src/walk/look.ts cleanLook)으로 고쳐서 넣는다. 여기서는 객체인지와 크기만 본다.
-- 읽기·쓰기는 이미 있는 profiles 정책 그대로: 본인 행만 읽고 고친다(새 행은 명단 손님만, 0001 profiles_own_*).
-- 다른 사람은 이 열을 직접 읽지 못한다. 함께 걷기 서버에는 출입증(/api/game-token)에 실어 본인 것만 보낸다.

alter table public.profiles
  add column if not exists look jsonb;

alter table public.profiles
  drop constraint if exists profiles_look_shape;
alter table public.profiles
  add constraint profiles_look_shape
  check (look is null or (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 1024));

comment on column public.profiles.look is
  '캐릭터 겉모습 {kind:"doll", doll:{hair,hairColor,skin,top,bottom,acc}} 또는 {kind:"photo", url:"/api/avatar/<id>"}. 사이트 cleanLook으로 고쳐 저장';
