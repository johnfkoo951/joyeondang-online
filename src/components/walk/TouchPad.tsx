'use client';
import type { Hotspot } from '@/walk/types';
import { IconJump } from './icons';
import { Stick } from './Stick';

type Props = {
  near: Hotspot | null;
  /** 가운데 단추 이름: 열린 방 문이면 「들어가기」, 방의 나가는 문이면 「나가기」, 그 밖은 「살피기」 */
  actText?: string;
  onMove: (x: number, y: number) => void;
  onLook: (x: number, y: number) => void;
  onInspect: () => void;
  onJump: () => void;
};

// 휴대폰 조작: 왼쪽 걷기 스틱, 오른쪽 둘러보기 스틱, 그 사이 아래에 살피기·들어가기·나가기(가까이 있을 때)와 점프 단추.
export function TouchPad({ near, actText = '살피기', onMove, onLook, onInspect, onJump }: Props) {
  return (
    <>
      <Stick tone="move" label="걷기 조이스틱" onChange={onMove} />
      <Stick tone="look" label="둘러보기 조이스틱" onChange={onLook} />
      <div className="walk-act" data-near={near ? 'true' : undefined}>
        {near ? <span className="walk-act-name" aria-hidden="true">{near.title}</span> : null}
        <div className="walk-act-row">
          {near ? (
            <button type="button" className="walk-act-btn" onClick={onInspect} aria-label={`${actText}: ${near.title}`}>{actText}</button>
          ) : null}
          <button
            type="button"
            className="walk-jump"
            aria-label="점프"
            // 누르는 순간 뛴다(손을 뗄 때까지 기다리지 않게). 키보드로 누르면 click으로 받는다.
            onPointerDown={(e) => {
              e.preventDefault();
              onJump();
            }}
            onClick={(e) => { if (e.detail === 0) onJump(); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <IconJump size={24} />
          </button>
        </div>
      </div>
    </>
  );
}
