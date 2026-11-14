import NotebookPage from '@/app/notebook/page';
import { SheetMark } from '@/components/walk/SheetMark';

// 걷기 화면에서 연 내 수첩: 게임 위의 시트로. 주소를 바로 열면 src/app/notebook 전체 페이지
export default function NotebookSheet() {
  return (
    <>
      <SheetMark />
      <NotebookPage />
    </>
  );
}
