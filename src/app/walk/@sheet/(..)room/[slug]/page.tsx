import RoomPage from '@/app/room/[slug]/page';
import { SheetMark } from '@/components/walk/SheetMark';

// 원래 쪽과 같은 방 목록으로 미리 짓는다(주소 값을 빌드 때 알아야 머리줄의 usePathname이 미리 그리기를 막지 않는다)
export { generateStaticParams } from '@/app/room/[slug]/page';

// 걷기 화면에서 연 방 쪽지·게시판(석등 포함): 게임 위의 시트로. 주소를 바로 열면 src/app/room/[slug] 전체 페이지
export default function RoomSheet({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <SheetMark />
      <RoomPage params={params} />
    </>
  );
}
