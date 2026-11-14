'use client';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import type { NetStatus } from '@/walk/net';
import type { RemotePlayer } from '@/walk/types';
import { peopleEn } from './hud-text';
import { IconPeople } from './icons';
import { WALK_EVENT, emitWalk } from './walk-events';
import { useEnTight } from './WalkTools';

/** covered: 패널·놀이·말하기 칸이 열려 있음(예전 이름 목록이 Esc를 나눠 받던 자리. 지금은 쓰지 않는다) */
type Props = { status: NetStatus; players: RemotePlayer[]; me: string; covered: boolean };

// 위 단추 줄의 「함께 N」 칩(같은 공간 사람 수, 나 포함). 누르면 접속자 목록(social/PeoplePanel: 집·방 어디 있는지,
// 멘션하기)이 열린다. 잇는 중이면 숫자 대신 「…」. 함께 걷기를 쓸 수 없으면 부르는 쪽이 아예 그리지 않는다.
// 영어 화면은 「People N」(숫자 칸은 두 말이 같은 자리에 둔다: 휴대폰은 이름 없이 숫자만 보인다)
export function PeopleChip({ status, players }: Props) {
  const tr = useTr();
  // 영어 이름이 위 단추 줄을 넘칠 폭이면 이름을 접는다(위 단추 줄과 같은 판단, WalkTools)
  const tight = useEnTight();
  const live = status === 'live';
  const n = players.length + 1;
  const label = live
    ? tr(`함께 걷는 사람 ${n}명, 접속자 목록 열기`, `${peopleEn(n)} walking together, open the list of people here`)
    : tr('함께 걷기 잇는 중, 접속자 목록 열기', 'Connecting to walk together, open the list of people here');
  return (
    <div className="walk-people-wrap">
      <button
        type="button"
        className="walk-tool walk-people-chip"
        data-live={live ? 'true' : undefined}
        onClick={() => emitWalk(WALK_EVENT.openPeople)}
        aria-haspopup="dialog"
        aria-label={label}
        aria-keyshortcuts="U"
        title={live ? tr('접속자 (U)', 'People here (U)') : tr('잇는 중 · 접속자 (U)', 'Connecting · People here (U)')}
      >
        <IconPeople />
        <span className="walk-tool-text" aria-hidden="true" style={tight ? { display: 'none' } : undefined}><T ko="함께" en="People" /></span>
        <span className="walk-people-n" aria-hidden="true">{live ? n : '…'}</span>
      </button>
    </div>
  );
}
