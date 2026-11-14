import AvatarPage from '@/app/avatar/page';
import { SheetMark } from '@/components/walk/SheetMark';

// 걷기 화면에서 연 사진 캐릭터 만들기(포토존): 게임 위의 시트로. 주소를 바로 열면 src/app/avatar 전체 페이지
export default function AvatarSheet() {
  return (
    <>
      <SheetMark />
      <AvatarPage />
    </>
  );
}
