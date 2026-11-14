import SectionPage from '@/app/exhibit/[slug]/page';
import { SheetMark } from '@/components/walk/SheetMark';

// 원래 쪽과 같은 칸 목록으로 미리 짓는다(주소 값을 빌드 때 알아야 머리줄의 usePathname이 미리 그리기를 막지 않는다)
export { generateStaticParams } from '@/app/exhibit/[slug]/page';

// 걷기 화면(방 쪽지 시트의 「이어진 전시」 등)에서 연 전시 한 칸: 게임 위의 시트로. 주소를 바로 열면 src/app/exhibit/[slug]
export default function SectionSheet({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <SheetMark />
      <SectionPage params={params} />
    </>
  );
}
