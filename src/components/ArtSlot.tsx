'use client';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';

// 그림이 확정되기 전의 자리(JYO-1.2). 그림이 들어오면 이 컴포넌트를 <img>로 바꾼다.
// 사람·사물 그림을 코드로 대충 그려 넣지 않는다.
// label은 부르는 쪽이 준 이름(그대로 보인다). 「그림 준비 중」 같은 덧붙인 말만 화면 말을 따른다
export function ArtSlot({ label, ratio = '4 / 3' }: { label: string; ratio?: string }) {
  const t = useTr();
  return (
    <div className="art-slot" style={{ ['--ratio' as string]: ratio }} role="img" aria-label={t(`${label} (그림 준비 중)`, `${label} (picture coming)`)}>
      <span>
        {label}
        <br />
        <span className="small"><T ko="그림을 그리는 중이에요" en="The picture is being drawn" /></span>
      </span>
    </div>
  );
}
