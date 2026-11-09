'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { View } from '@/walk/scene';
import { IconCamera, IconExit, IconEye, IconHelp, IconMap, IconMenu, IconPerson, IconRoute } from './icons';

type Props = {
  ready: boolean;
  /** 휴대폰: 줄이 넘치지 않게 메뉴·사진·함께만 둔다(나머지는 메뉴 안에) */
  coarse: boolean;
  view: View;
  inRoom: boolean;
  mapOpen: boolean;
  wayOpen: boolean;
  help: boolean;
  menuOpen: boolean;
  /** 「함께 N」 칩(함께 걷기를 쓸 수 있을 때만) */
  people?: ReactNode;
  onView: () => void;
  onMap: () => void;
  onWay: () => void;
  onHelp: () => void;
  onMenu: () => void;
  onShot: () => void;
  onLeaveRoom: () => void;
};

type ToolProps = { label: string; text: string; title: string; keys?: string; popup?: boolean; expanded?: boolean; onClick: () => void; children: ReactNode };

function Tool({ label, text, title, keys, popup, expanded, onClick, children }: ToolProps) {
  return (
    <button
      type="button"
      className="walk-tool"
      onClick={onClick}
      aria-keyshortcuts={keys}
      aria-haspopup={popup ? 'dialog' : undefined}
      aria-expanded={popup ? expanded : undefined}
      aria-label={label}
      title={title}
    >
      {children}
      <span className="walk-tool-text">{text}</span>
    </button>
  );
}

// 위 단추 줄. 데스크탑: 시점, 지도, 길 찾기, 함께, 조작, 메뉴, 나가기. 휴대폰: 메뉴, 사진, 함께.
export function WalkTools(p: Props) {
  const { ready, coarse, view, inRoom } = p;
  if (coarse) {
    return (
      <div className="walk-tools" role="group" aria-label="걷기 도구">
        {ready ? (
          <>
            <Tool label="메뉴" text="메뉴" title="메뉴" popup expanded={p.menuOpen} onClick={p.onMenu}><IconMenu /></Tool>
            <Tool label="사진 찍기" text="사진" title="사진 찍기" onClick={p.onShot}><IconCamera /></Tool>
            {p.people}
          </>
        ) : (
          <Link className="walk-tool" href="/" aria-label="나가기" title="나가기">
            <IconExit />
            <span className="walk-tool-text">나가기</span>
          </Link>
        )}
      </div>
    );
  }
  const viewLabel = view === 'first' ? '1인칭 시점, 3인칭으로 바꾸기' : '3인칭 시점, 1인칭으로 바꾸기';
  return (
    <div className="walk-tools" role="group" aria-label="걷기 도구">
      {ready ? (
        <>
          <Tool label={viewLabel} text={view === 'first' ? '1인칭' : '3인칭'} title={view === 'first' ? '3인칭으로 보기 (V)' : '1인칭으로 보기 (V)'} keys="V" onClick={p.onView}>
            {view === 'first' ? <IconEye /> : <IconPerson />}
          </Tool>
          <Tool label="지도" text="지도" title={inRoom ? '방 지도 (M)' : '집 지도 (M)'} keys="M" popup expanded={p.mapOpen} onClick={p.onMap}><IconMap /></Tool>
          <Tool label="길 찾기" text="길 찾기" title="길 찾기 (G)" keys="G" popup expanded={p.wayOpen} onClick={p.onWay}><IconRoute /></Tool>
          {p.people}
          <Tool label="조작" text="조작" title="조작법 (?)" keys="?" popup expanded={p.help} onClick={p.onHelp}><IconHelp /></Tool>
          <Tool label="메뉴" text="메뉴" title="메뉴 (Esc)" keys="Escape" popup expanded={p.menuOpen} onClick={p.onMenu}><IconMenu /></Tool>
        </>
      ) : null}
      {inRoom ? (
        <button type="button" className="walk-tool" onClick={p.onLeaveRoom} aria-label="방에서 나가기" title="방에서 나가기 (문 앞에서 E)">
          <IconExit />
          <span className="walk-tool-text">방에서 나가기</span>
        </button>
      ) : (
        <Link className="walk-tool" href="/" aria-label="나가기" title="나가기">
          <IconExit />
          <span className="walk-tool-text">나가기</span>
        </Link>
      )}
    </div>
  );
}
