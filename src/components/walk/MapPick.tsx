'use client';
import { useState, useSyncExternalStore, type MouseEvent } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { chooseMap, readChosenMap, subscribeChosenMap, type WalkMap } from './walk-map';
import css from './MapPick.module.css';

// 관리자(집주인 부부)만 보는 지도 고르기: 지금 집과 「실측 1층 (시험)」. 위 단추 줄 아래 왼쪽의 작은 두 칸 단추.
// 고른 것은 이 기기에 기억하고(walk-map.ts), 바꾸면 onSwitch가 새 세계를 받아 장면을 다시 짓는다.
// 실측 지도를 골랐는데 받지 못했으면(데이터가 없거나 서버가 거절) 평소 집을 보여 주며 한 줄로 알린다.

/** 마우스로 누른 단추는 초점을 놓는다(뒤의 Space가 점프 대신 이 단추를 다시 누르지 않게) */
const tap = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  if (e.detail !== 0) e.currentTarget.blur();
  fn();
};

const serverMap = (): WalkMap => 'house';

/** current: 지금 걷는 세계(실측 지도면 'shell'). onSwitch: 고른 지도로 새 세계를 받는다(끝나면 풀리는 약속) */
export function MapPick({ current, onSwitch }: { current: WalkMap; onSwitch: () => Promise<void> }) {
  const tr = useTr();
  const chosen = useSyncExternalStore(subscribeChosenMap, readChosenMap, serverMap);
  const [busy, setBusy] = useState(false);
  const pick = (m: WalkMap) => {
    if (busy || (m === current && m === chosen)) return;
    chooseMap(m);
    setBusy(true);
    void onSwitch().finally(() => setBusy(false));
  };
  const failed = !busy && chosen === 'shell' && current !== 'shell';
  return (
    <div className={css.pick} role="group" aria-label={tr('지도 고르기 (관리자만)', 'Choose map (admin only)')} aria-busy={busy || undefined}>
      <div className={css.row}>
        <button type="button" className={css.opt} aria-pressed={current === 'house'} disabled={busy} onClick={tap(() => pick('house'))}>
          <T ko="집" en="House" />
        </button>
        <button type="button" className={css.opt} aria-pressed={current === 'shell'} disabled={busy} onClick={tap(() => pick('shell'))}>
          <T ko="실측 1층 (시험)" en="Measured 1F (test)" />
        </button>
      </div>
      {busy ? (
        <p className={css.note} role="status"><T ko="지도를 바꾸는 중…" en="Switching map…" /></p>
      ) : failed ? (
        <p className={css.note} role="status"><T ko="실측 지도를 받지 못해 집을 보여 드려요" en="Couldn't load the measured map, showing the house" /></p>
      ) : null}
    </div>
  );
}
