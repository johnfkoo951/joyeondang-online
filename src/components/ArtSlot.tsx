// 그림이 확정되기 전의 자리(JYO-1.2). 그림이 들어오면 이 컴포넌트를 <img>로 바꾼다.
// 사람·사물 그림을 코드로 대충 그려 넣지 않는다.
export function ArtSlot({ label, ratio = '4 / 3' }: { label: string; ratio?: string }) {
  return (
    <div className="art-slot" style={{ ['--ratio' as string]: ratio }} role="img" aria-label={`${label} (그림 준비 중)`}>
      <span>
        {label}
        <br />
        <span className="small">그림을 그리는 중이에요</span>
      </span>
    </div>
  );
}
