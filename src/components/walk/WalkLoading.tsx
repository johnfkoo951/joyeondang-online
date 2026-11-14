import { T } from '@/components/i18n/T';
import { IconHouse } from './icons';

// 불러오는 화면. 서버 화면(Suspense 대기)과 걷기 화면이 같이 쓴다. 진행 막대는 움직임만 있는 표시다.
// 오래 걸리면(느린 연결·느린 기기, 화면 코드를 못 받았을 때) 기다리라는 말과 나갈 길이 뜬다. 화면 코드가 아직
// 안 왔어도 먹어야 하므로 CSS로만 늦춰 보이고(.walk-loading-late), 단추는 코드 없이 열리는 보통 링크다.
// 글은 두 말을 함께 싣고 CSS가 고른 말만 보인다(<T>: 화면 코드 없이도 바뀐다).
export function WalkLoading() {
  return (
    <div className="walk-loading" role="status" aria-live="polite">
      <span className="walk-loading-icon"><IconHouse /></span>
      <p><T ko="집을 짓는 중이에요" en="Building the house" /></p>
      <span className="walk-loading-bar" aria-hidden="true"><span /></span>
      <div className="walk-loading-late">
        <p className="walk-loading-slow"><T ko="조금 오래 걸려요. 잠시만 더 기다려 주세요." en="This is taking a little while. Please wait a moment longer." /></p>
        <div className="btn-row">
          {/* 화면 코드가 오기 전에도 눌려야 해서 next/link가 아닌 보통 링크로 쪽을 새로 연다 */}
          <a className="btn btn-pine" href="/walk"><T ko="다시 열기" en="Open again" /></a>
          <a className="btn btn-roof" href="/map"><T ko="그림 지도로 둘러보기" en="Browse the picture map" /></a>
        </div>
      </div>
    </div>
  );
}
