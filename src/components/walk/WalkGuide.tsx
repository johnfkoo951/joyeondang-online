'use client';
import * as P from './prefs';

type HintProps = { show: boolean; locked: boolean; view: 'first' | 'third'; talk: boolean };

// 데스크탑 조작 안내(처음 8초). 클릭 잠금은 1인칭에서만, 잠긴 동안에는 그 자리에 푸는 법을 보여 준다.
export function WalkHint({ show, locked, view, talk }: HintProps) {
  const items = [...P.HINT, ...(talk ? [P.HINT_TALK] : [])].flatMap(([k, t]): Array<[string, string]> => {
    if (k !== '클릭') return [[k, t]];
    if (locked) return [['Esc', '마우스 풀기']];
    return view === 'first' ? [[k, t]] : [];
  });
  return (
    <ul className="walk-hint" data-show={show ? 'true' : undefined} aria-hidden={show ? undefined : true}>
      {items.map(([k, t]) => (
        <li key={k}><kbd>{k}</kbd> {t}</li>
      ))}
    </ul>
  );
}

type OnboardProps = { state: 'on' | 'leaving'; coarse: boolean; onDismiss: () => void };

// 첫 방문 카드. 걷기 시작·화면 누르기·시간이 지나면 접힌다.
export function OnboardCard({ state, coarse, onDismiss }: OnboardProps) {
  return (
    <div className="walk-onboard" role="note" aria-label="처음 오신 분께" data-state={state}>
      <div className="walk-onboard-text">
        <p className="walk-onboard-title">조연당에 오신 걸 반겨요</p>
        <p>
          {(coarse ? P.ONBOARD_TOUCH : P.ONBOARD_DESK).split(' · ').map((seg, i) => (
            // 「·」은 앞 마디에 붙여 줄 끝에 남게 한다(줄 첫머리에 오지 않게)
            <span key={seg}>{i ? ' · ' : ''}<span className="walk-onboard-seg">{seg}</span></span>
          ))}
        </p>
      </div>
      <button type="button" className="btn btn-small btn-roof" onClick={onDismiss}>알겠어요</button>
    </div>
  );
}
