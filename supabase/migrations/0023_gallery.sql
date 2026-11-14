-- 조연당 온라인 0023: 부엌 사진 갤러리 버킷(2026-11-12)
--
-- 무엇을·왜
--   실제 집 걷기에서 부엌 두 곳의 벽에 액자 틀을 건다(src/walk/gallery.ts). 액자에 걸 전시물(그림, 제목, 설명)은
--   집주인이 나중에 채운다. 그 목록과 그림을 두는 비공개 버킷 gallery를 만든다.
--   1. 버킷 안에는 전시 목록 manifest.json 한 장과 그림(images/…)만 둔다. 목록 모양은 src/lib/gallery-manifest.ts.
--   2. 저장소에는 손님 정책을 두지 않는다(쪽지 사진 notes와 같은 틀). 읽기·쓰기·서명 주소 만들기는 서버(비밀 키)만 한다.
--      손님에게는 /api/gallery가 명단 손님인지 확인한 뒤 지금 걸린 액자의 그림에만 세 시간짜리 서명 주소를 준다.
--   3. 집주인은 승인함의 「부엌 사진 갤러리」 칸에서 채운다(사진은 기기에서 다시 그려 위치·기기 정보를 지운 JPEG만).
--      Supabase 대시보드(Storage → gallery)에서 manifest.json과 그림을 손으로 올려도 된다(README 「부엌 사진 갤러리」).
--   4. 한 파일 5MB까지, 그림(JPEG·PNG·WebP)과 목록(JSON)만.
--
-- 사이트 코드는 이 파일을 올리기 전에도 돈다: 버킷이 없으면 목록을 읽지 못해 모든 액자가 「곧 전시해요」로 보이고,
-- 승인함 칸은 「전시 목록을 읽지 못했어요」를 보인다(빈 목록으로 덮어쓰지 않는다). 여러 번 올려도 된다.
-- 올린 뒤 확인(읽기만 한다):
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'gallery';
--     → gallery | f | 5242880 | {image/jpeg,image/png,image/webp,application/json}
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
--     and (qual like '%gallery%' or with_check like '%gallery%');      → 0줄(정책 없음: 서버만 만진다)
-- 되돌리기: 버킷을 비운 뒤(대시보드) delete from storage.buckets where id = 'gallery';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/json'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
