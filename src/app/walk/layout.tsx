import type { ReactNode } from 'react';
import { WalkSheetFrame } from '@/components/walk/WalkSheetFrame';

// 집 안 걷기. 걷기 화면(children) 위에 시트 자리(@sheet)를 둔다: 걷기 화면에서 방 쪽지·수첩·갤러리·사진 캐릭터·전시로 가면
// 그 페이지를 가로채(@sheet/(..)…) 게임 위의 시트로 띄운다. 3D 장면은 그대로 살아 있고, 닫으면 바로 걷기로 돌아온다.
// 주소를 바로 열면(새로 고침, 공유 링크) 가로채지 않아 지금처럼 전체 페이지다.
export default function WalkLayout({ children, sheet }: { children: ReactNode; sheet: ReactNode }) {
  return (
    <>
      {children}
      <WalkSheetFrame>{sheet}</WalkSheetFrame>
    </>
  );
}
