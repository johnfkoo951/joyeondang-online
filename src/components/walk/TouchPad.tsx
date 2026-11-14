'use client';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { Hotspot } from '@/walk/types';
import { IconJump, IconSit } from './icons';
import { hasHangul, spotName } from './PlaceText';
import { Stick } from './Stick';

type Props = {
  near: Hotspot | null;
  /** 가운데 단추 이름: 열린 방 문이면 「들어가기」, 방의 나가는 문이면 「나가기」, 그 밖은 「살피기」 */
  actText?: string;
  onMove: (x: number, y: number) => void;
  onLook: (x: number, y: number) => void;
  onInspect: () => void;
  onJump: () => void;
  /** 앉기·일어서기(걸으면 저절로 일어선다) */
  onSit?: () => void;
};

// 휴대폰 조작: 왼쪽 걷기 스틱, 오른쪽 둘러보기 스틱, 두 스틱 사이 아래에 앉기·점프 단추.
// 살피기·들어가기·나가기(가까이 있을 때)는 오른쪽 스틱 바로 위: 오른손 엄지가 스틱에서 조금만 올리면 닿는다(가운데에 두면 두 손이 다 떠야 했다).
// 가까운 곳 이름은 장소 이름 표로 옮긴다(표에 없는 이름은 한국어 그대로). actText는 부르는 쪽이 지금 말로 준다.
export function TouchPad({ near, actText, onMove, onLook, onInspect, onJump, onSit }: Props) {
  const lang = useLang();
  const tr = useTr();
  const act = actText ?? tr('살피기', 'Look closer');
  const nearName = near ? spotName(lang, near.title, near.kind) : '';
  return (
    <>
      <Stick tone="move" label={tr('걷기 조이스틱', 'Walk joystick')} onChange={onMove} />
      <Stick tone="look" label={tr('둘러보기 조이스틱', 'Look-around joystick')} onChange={onLook} />
      {near ? (
        <div className="walk-act-side">
          <span className="walk-act-name" aria-hidden="true" lang={lang === 'en' && hasHangul(nearName) ? 'ko' : undefined}>{nearName}</span>
          <button type="button" className="walk-act-btn" onClick={onInspect} aria-label={`${act}: ${nearName}`}>{act}</button>
        </div>
      ) : null}
      <div className="walk-act" data-near={near ? 'true' : undefined}>
        <div className="walk-act-row">
          {onSit ? (
            <button
              type="button"
              className="walk-jump walk-sit"
              aria-label={tr('앉기·일어서기', 'Sit or stand')}
              onPointerDown={(e) => {
                e.preventDefault();
                onSit();
              }}
              onClick={(e) => { if (e.detail === 0) onSit(); }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <IconSit size={22} />
            </button>
          ) : null}
          <button
            type="button"
            className="walk-jump"
            aria-label={tr('점프', 'Jump')}
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
