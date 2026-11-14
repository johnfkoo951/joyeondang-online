'use client';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import * as P from './prefs';

/**
 * talk: 함께 걷기가 이어져 말할 수 있음, together: 초대 손님(대화창·접속자 목록을 쓴다),
 * fullscreen: 이 브라우저가 전체 화면을 할 수 있음(그때만 F 칸을 보인다)
 */
type HintProps = { show: boolean; locked: boolean; view: 'first' | 'third'; talk: boolean; together?: boolean; fullscreen?: boolean };

// 데스크탑 조작 안내(처음 8초). 클릭 잠금은 1인칭·3인칭 모두, 잠긴 동안에는 그 자리에 푸는 법을 보여 준다.
// view는 화면 쪽이 넘기는 값이라 받아 두지만 안내는 시점과 관계없이 같다. 키 글자는 두 말 모두 같고, 낱말 키(마우스·클릭)만 옮긴다.
export function WalkHint({ show, locked, talk, together = false, fullscreen = false }: HintProps) {
  const lang = useLang();
  const items = [...P.HINT, ...(talk ? [P.HINT_TALK] : []), ...(together ? P.HINT_TOGETHER : [])].flatMap((h): P.HintItem[] => {
    if (h.tag === 'fullscreen' && !fullscreen) return [];
    if (h.tag === 'click' && locked) return [P.HINT_LOCKED];
    return [h];
  });
  return (
    <ul className="walk-hint" data-show={show ? 'true' : undefined} aria-hidden={show ? undefined : true}>
      {items.map((h) => {
        const k = lang === 'en' ? h.keyEn ?? h.key : h.key;
        const t = lang === 'en' ? h.en : h.ko;
        // 잠긴 동안에는 Esc가 두 번 나온다(마우스 풀기, 메뉴): 키와 뜻을 함께 이름으로
        return <li key={`${k}:${t}`}><kbd>{k}</kbd> {t}</li>;
      })}
    </ul>
  );
}

type OnboardProps = { state: 'on' | 'leaving'; coarse: boolean; onDismiss: () => void };

// 첫 방문 카드. 걷기 시작·화면 누르기·시간이 지나면 접힌다.
export function OnboardCard({ state, coarse, onDismiss }: OnboardProps) {
  const lang = useLang();
  const tr = useTr();
  const text = coarse ? P.ONBOARD_TOUCH : P.ONBOARD_DESK;
  return (
    <div className="walk-onboard" role="note" aria-label={tr('처음 오신 분께', 'For first-time visitors')} data-state={state}>
      <div className="walk-onboard-text">
        <p className="walk-onboard-title"><T ko="조연당에 오신 걸 반겨요" en="Welcome to Joyeondang" /></p>
        <p>
          {(lang === 'en' ? text.en : text.ko).split(' · ').map((seg, i) => (
            // 「·」은 앞 마디에 붙여 줄 끝에 남게 한다(줄 첫머리에 오지 않게)
            <span key={seg}>{i ? ' · ' : ''}<span className="walk-onboard-seg">{seg}</span></span>
          ))}
        </p>
      </div>
      <button type="button" className="btn btn-small btn-roof" onClick={onDismiss}><T ko="알겠어요" en="Got it" /></button>
    </div>
  );
}
