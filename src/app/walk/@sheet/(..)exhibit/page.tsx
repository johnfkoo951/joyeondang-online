import ExhibitIndex from '@/app/exhibit/page';
import { SheetMark } from '@/components/walk/SheetMark';

// 걷기 화면(시트 안의 링크 포함)에서 연 전시 목록: 게임 위의 시트로. 주소를 바로 열면 src/app/exhibit 전체 페이지
export default function ExhibitSheet() {
  return (
    <>
      <SheetMark />
      <ExhibitIndex />
    </>
  );
}
