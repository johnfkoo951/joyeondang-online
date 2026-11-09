'use client';
import { useRef } from 'react';
import { trapTab, useDialogFocus } from './useDialogFocus';

type Props = { coarse: boolean; real: boolean; room?: boolean; together?: boolean; onClose: () => void };

const DESK: Array<[string, string]> = [
  ['마우스', '움직이면 바로 둘러봐요. 화면을 한 번 누르면 화면 끝 없이 돌아요(Esc로 풀기).'],
  ['W A S D', '걷기. A와 D는 옆걸음, 방향키 ←→는 제자리에서 돌기.'],
  ['Shift', '누른 채 걸으면 달려요.'],
  ['Space', '점프. 걸으면서 뛰어도 돼요.'],
  ['E', '가까운 곳 쓰기. 열린 방 문이면 바로 들어가고, 방의 나가는 문이면 바로 나가요. 놀이 자리와 물건은 「살피기」(Enter도 돼요).'],
  ['P', '포털 바로 가기. 걷지 않고 열린 방으로 바로 옮겨 가요. 목록 앞의 숫자키로 골라요.'],
  ['M', '지도. 1층과 2층이 함께 나오고 지금 층만 색이 들어와요.'],
  ['G', '길 찾기. 가고 싶은 곳을 고르면 걸어서 데려다주거나 그 앞으로 바로 옮겨 줘요.'],
  ['V', '눈높이(1인칭)와 인형 뒤(3인칭) 시점 바꾸기. 3인칭에서는 휠로 당겨 보고 물러나 봐요.'],
  ['C', '캐릭터 꾸미기. 머리, 옷, 소품을 골라요.'],
  ['F2', '지금 화면 사진 찍기. 로그인했으면 내 갤러리에 담기고, 아니면 이 기기에 내려받아요.'],
  ['Esc', '열린 창 닫기. 아무것도 없으면 메뉴(설정)를 열어요. 마우스가 잠겨 있으면 먼저 풀려요.'],
  ['?', '이 안내 열고 닫기.'],
];

const TOUCH: string[] = [
  '왼쪽 동그라미로 걸어요. 옆으로만 밀면 그 자리에서 돌고, 비스듬히 밀면 돌면서 걸어요(3인칭에서는 민 쪽으로 걷고 화면이 천천히 따라 돌아요). 끝까지 밀면 달려요.',
  '오른쪽 동그라미로 둘러봐요. 두 동그라미는 같이 쓸 수 있어요.',
  '화면을 끌어도 둘러볼 수 있어요. 3인칭에서는 두 손가락을 벌리고 오므려 거리를 바꿔요.',
  '아래 가운데 화살표 단추로 뛰어요. 방이나 물건 가까이 가면 그 옆에 「살피기」 단추가 떠요.',
  '오른쪽 위 지도를 누르면 1층과 2층 지도가 크게 열려요.',
  '방 문 가까이에서는 가운데 단추가 「들어가기」, 방의 나가는 문에서는 「나가기」로 바뀌어요. 누르면 바로 옮겨 가요.',
  '위 줄의 「메뉴」에 길 찾기, 포털 바로 가기, 캐릭터 꾸미기, 시점, 설정이 있어요. 사진기 단추로 지금 화면을 찍어요.',
];
const DESK_TOGETHER: [string, string] = ['Enter', '말하기. 가까이 살필 것이 없을 때 입력칸이 열려요. 적고 Enter로 보내요.'];
const TOUCH_TOGETHER = '오른쪽 말풍선 단추로 말을 걸어요. 같은 곳에 있는 분들 머리 위에 떠요.';

// 조작 도움말. 기기에 맞는 설명만 보여 준다.
export function HelpPanel({ coarse, real, room = false, together = false, onClose }: Props) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useDialogFocus(closeBtn);
  return (
    <div className="walk-panel walk-help" role="dialog" aria-modal="true" aria-label="조작법" onKeyDown={trapTab}>
      <h2>걷는 법</h2>
      {coarse ? (
        <ul className="walk-help-list">
          {(together ? [...TOUCH, TOUCH_TOGETHER] : TOUCH).map((t) => <li key={t}>{t}</li>)}
        </ul>
      ) : (
        <dl className="walk-keys">
          {(together ? [...DESK, DESK_TOGETHER] : DESK).map(([k, t]) => (
            <div key={k}>
              <dt><kbd>{k}</kbd></dt>
              <dd>{t}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="small walk-panel-meta">
        {room
          ? '나가는 문 앞에서 E(휴대폰은 「나가기」)나 메뉴의 「방에서 나가기」로 들어온 문 앞에 돌아가요.'
          : real
          ? '실제 집 크기 그대로예요. 가족 방은 문이 닫혀 있어요.'
          : '계단은 현관 옆 홀에 있어요. 그림 속 집은 놀기 좋게 다시 지은 집이라 실제 도면과 달라요.'}
      </p>
      <button ref={closeBtn} type="button" className="btn btn-small" onClick={onClose}>닫기</button>
    </div>
  );
}
