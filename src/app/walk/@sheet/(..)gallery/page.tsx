import GalleryPage from '@/app/gallery/page';
import { SheetMark } from '@/components/walk/SheetMark';

// 걷기 화면에서 연 내 갤러리(메뉴, 사진 알림): 게임 위의 시트로. 주소를 바로 열면 src/app/gallery 전체 페이지
export default function GallerySheet() {
  return (
    <>
      <SheetMark />
      <GalleryPage />
    </>
  );
}
