import { IconHouse } from './icons';

// 불러오는 화면. 서버 화면(Suspense 대기)과 걷기 화면이 같이 쓴다. 진행 막대는 움직임만 있는 표시다.
export function WalkLoading() {
  return (
    <div className="walk-loading" role="status" aria-live="polite">
      <span className="walk-loading-icon"><IconHouse /></span>
      <p>집을 짓는 중이에요</p>
      <span className="walk-loading-bar" aria-hidden="true"><span /></span>
    </div>
  );
}
