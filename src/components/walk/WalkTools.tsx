'use client';
import Link from 'next/link';
import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { View } from '@/walk/scene';
import { ariaKey } from './controls';
import { IconCamera, IconExit, IconExpand, IconEye, IconHelp, IconMap, IconMenu, IconPerson, IconRoute, IconShrink } from './icons';
import { KeyHint } from './KeyHint';
import { SHORTCUTS, type ShortcutId } from './shortcuts';

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
  /** 전체 화면: 지금 켜져 있는가. null이면 이 브라우저에서 못 써서 단추를 두지 않는다(아이폰 사파리 등) */
  full: boolean | null;
  onFullscreen: () => void;
  onView: () => void;
  onMap: () => void;
  onWay: () => void;
  onHelp: () => void;
  onMenu: () => void;
  onShot: () => void;
  onLeaveRoom: () => void;
};

/**
 * id: 단축키 표의 항목. 이름 옆에 그 키를 보이고(키보드 기기에서만) aria-keyshortcuts로도 알린다.
 * showText: true면 휴대폰에서도 이름을 보인다(휴대폰 위 줄의 「메뉴」. 예전에는 CSS가 aria-label="메뉴"로 골랐는데, 이름이 영어여도 같게).
 * false면 이름을 접는다(영어 이름이 길어 줄이 넘칠 폭, useEnTight). 주지 않으면 CSS가 정한다
 */
type ToolProps = {
  label: string; text: ReactNode; title: string; id?: ShortcutId; popup?: boolean; expanded?: boolean; showText?: boolean; onClick: () => void; children: ReactNode;
};

const SHOW_TEXT: CSSProperties = { display: 'inline' };
const HIDE_TEXT: CSSProperties = { display: 'none' };
const textStyle = (showText: boolean | undefined) => (showText === true ? SHOW_TEXT : showText === false ? HIDE_TEXT : undefined);

/**
 * 영어 이름은 한국어보다 길어서, 위 단추 줄이 이름을 다는 폭(1024px부터)에서도 이 폭 아래면 한 줄을 넘는다
 * (방 안, 「People N」 칩까지 여덟 단추). 그 사이에는 영어 이름을 접고 그림과 키만 둔다(이름은 낭독 이름과 title에 그대로).
 * 한국어 화면은 늘 예전 그대로다
 */
const EN_TIGHT = '(max-width: 1239px)';
const subscribeTight = (cb: () => void) => {
  const mq = window.matchMedia(EN_TIGHT);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isTight = () => window.matchMedia(EN_TIGHT).matches;
/** 영어 화면이고 위 단추 줄이 좁은 폭인가(이름을 접는다) */
export function useEnTight(): boolean {
  const lang = useLang();
  const tight = useSyncExternalStore(subscribeTight, isTight, () => false);
  return lang === 'en' && tight;
}

function Tool({ label, text, title, id, popup, expanded, showText, onClick, children }: ToolProps) {
  return (
    <button
      type="button"
      className="walk-tool"
      onClick={onClick}
      aria-keyshortcuts={id ? ariaKey(id) : undefined}
      aria-haspopup={popup ? 'dialog' : undefined}
      aria-expanded={popup ? expanded : undefined}
      aria-label={label}
      title={title}
    >
      {children}
      <span className="walk-tool-text" style={textStyle(showText)}>{text}</span>
      {id ? <KeyHint id={id} /> : null}
    </button>
  );
}

/** 「함께 N」 칩(다른 묶음의 부품)에는 CSS가 이 값으로 접속자 키를 붙인다(칩 안을 고치지 않게) */
const PEOPLE_KEY = { ['--walk-people-key' as string]: JSON.stringify(SHORTCUTS.people.key) } as CSSProperties;

/** 전체 화면 단추. 보이는 이름은 늘 「전체 화면」, 낭독 이름과 그림은 할 일(열기·끝내기)을 따른다 */
function FullscreenTool({ full, keys, showText, onClick }: { full: boolean; keys: boolean; showText?: boolean; onClick: () => void }) {
  const tr = useTr();
  const label = full ? tr('전체 화면 끝내기', 'Exit full screen') : tr('전체 화면으로 보기', 'View in full screen');
  return (
    <Tool label={label} text={<T ko="전체 화면" en="Full screen" />} title={keys ? `${label} (${SHORTCUTS.fullscreen.key})` : label} id={keys ? 'fullscreen' : undefined} showText={showText} onClick={onClick}>
      {full ? <IconShrink /> : <IconExpand />}
    </Tool>
  );
}

// 위 단추 줄. 데스크탑: 시점, 지도, 길 찾기, 함께, 조작, 전체 화면, 메뉴, 나가기. 휴대폰: 메뉴, 사진, 함께, 전체 화면.
// 데스크탑은 이름 옆에 단축키(「지도 M」)를 보인다. 휴대폰은 키가 없으므로 보이지 않는다.
// 전체 화면은 브라우저가 할 수 있을 때만 둔다(아이폰 사파리·막힌 앱 안 브라우저에는 없다).
// 이름은 화면 말(한국어·영어)을 따른다. 키 글자는 두 말 모두 같다.
export function WalkTools(p: Props) {
  const { ready, coarse, view, inRoom } = p;
  const tr = useTr();
  const tight = useEnTight();
  const menu = tr('메뉴', 'Menu');
  const menuText = <T ko="메뉴" en="Menu" />;
  const leave = tr('나가기', 'Leave');
  const leaveText = <T ko="나가기" en="Leave" />;
  if (coarse) {
    return (
      <div className="walk-tools" role="group" aria-label={tr('걷기 도구', 'Walk tools')}>
        {ready ? (
          <>
            <Tool label={menu} text={menuText} title={menu} popup expanded={p.menuOpen} showText onClick={p.onMenu}><IconMenu /></Tool>
            <Tool label={tr('사진 찍기', 'Take a photo')} text={<T ko="사진" en="Photo" />} title={tr('사진 찍기', 'Take a photo')} onClick={p.onShot}><IconCamera /></Tool>
            {p.people}
            {p.full !== null ? <FullscreenTool full={p.full} keys={false} onClick={p.onFullscreen} /> : null}
          </>
        ) : (
          <Link className="walk-tool" href="/" aria-label={leave} title={leave}>
            <IconExit />
            <span className="walk-tool-text">{leaveText}</span>
          </Link>
        )}
      </div>
    );
  }
  const viewLabel = view === 'first'
    ? tr('1인칭 시점, 3인칭으로 바꾸기', 'First person view, switch to third person')
    : tr('3인칭 시점, 1인칭으로 바꾸기', 'Third person view, switch to first person');
  const k = (id: ShortcutId) => SHORTCUTS[id].key;
  const leaveRoom = tr('방에서 나가기', 'Leave room');
  // 영어 이름이 줄을 넘칠 폭이면 이름을 접는다(한국어는 늘 undefined: CSS 그대로)
  const fold = tight ? false : undefined;
  return (
    <div className="walk-tools" role="group" aria-label={tr('걷기 도구', 'Walk tools')} style={PEOPLE_KEY}>
      {ready ? (
        <>
          <Tool
            label={viewLabel}
            text={view === 'first' ? <T ko="1인칭" en="1st person" /> : <T ko="3인칭" en="3rd person" />}
            title={`${view === 'first' ? tr('3인칭으로 보기', 'Switch to third person') : tr('1인칭으로 보기', 'Switch to first person')} (${k('view')})`}
            id="view"
            showText={fold}
            onClick={p.onView}
          >
            {view === 'first' ? <IconEye /> : <IconPerson />}
          </Tool>
          <Tool label={tr('지도', 'Map')} text={<T ko="지도" en="Map" />} title={`${inRoom ? tr('방 지도', 'Room map') : tr('집 지도', 'House map')} (${k('map')})`} id="map" popup expanded={p.mapOpen} showText={fold} onClick={p.onMap}><IconMap /></Tool>
          <Tool label={tr('길 찾기', 'Find the way')} text={<T ko="길 찾기" en="Find the way" />} title={`${tr('길 찾기', 'Find the way')} (${k('way')})`} id="way" popup expanded={p.wayOpen} showText={fold} onClick={p.onWay}><IconRoute /></Tool>
          {p.people}
          <Tool label={tr('조작', 'Controls')} text={<T ko="조작" en="Controls" />} title={`${tr('조작법', 'Controls')} (${k('help')})`} id="help" popup expanded={p.help} showText={fold} onClick={p.onHelp}><IconHelp /></Tool>
          {p.full !== null ? <FullscreenTool full={p.full} keys showText={fold} onClick={p.onFullscreen} /> : null}
          <Tool label={menu} text={menuText} title={`${menu} (${k('menu')})`} id="menu" popup expanded={p.menuOpen} showText={fold} onClick={p.onMenu}><IconMenu /></Tool>
        </>
      ) : null}
      {inRoom ? (
        <button type="button" className="walk-tool" onClick={p.onLeaveRoom} aria-label={leaveRoom} title={tr('방에서 나가기 (문 앞에서 E)', 'Leave room (E at the door)')}>
          <IconExit />
          <span className="walk-tool-text" style={textStyle(fold)}><T ko="방에서 나가기" en="Leave room" /></span>
        </button>
      ) : (
        <Link className="walk-tool" href="/" aria-label={leave} title={leave}>
          <IconExit />
          <span className="walk-tool-text" style={textStyle(fold)}>{leaveText}</span>
        </Link>
      )}
    </div>
  );
}
