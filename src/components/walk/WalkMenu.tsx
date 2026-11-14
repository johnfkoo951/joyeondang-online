'use client';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LangToggle } from '@/components/i18n/LangToggle';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { IDEAS_NEW_URL } from '@/content/links';
import type { View } from '@/walk/scene';
import { ariaKey } from './controls';
import { MENU_TEXT, pick, type MenuTextId } from './hud-text';
import { KeyHint } from './KeyHint';
import * as P from './prefs';
import type { ShortcutId } from './shortcuts';
import { trapTab, useDialogFocus } from './useDialogFocus';

export type MenuAction = 'resume' | 'view' | 'look' | 'chat' | 'people' | 'shot' | 'gallery' | 'games' | 'guestbook' | 'map' | 'way' | 'portal' | 'help' | 'leaveRoom';

type Props = {
  coarse: boolean;
  view: View;
  inRoom: boolean;
  /** 캐릭터 꾸미기를 열 수 있는지(패널이 준비됐을 때) */
  canLook: boolean;
  /** 초대 손님 이상: 대화창·접속자 목록을 연다 */
  together?: boolean;
  signedIn?: boolean;
  onAction: (a: MenuAction) => void;
  onSens: (v: number) => void;
  /** 메뉴 맨 위에 붙는 안내(앱 안 브라우저에서는 로그인이 안 된다는 말) */
  note?: ReactNode;
};

/** id: 단축키 표(shortcuts.ts)의 항목. 키 글자는 표에서 읽는다. text: 보이는 이름(hud-text.ts의 한국어·영어) */
type Item = { a: MenuAction; text: MenuTextId; id?: ShortcutId };

/** 이름과 단추를 한 줄에 양 끝으로(화면 밝기 줄과 같은 꼴) */
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };

// 메뉴(데스크탑 Esc, 휴대폰 위 줄 「메뉴」). 열려 있는 동안 걷기는 멈춘다.
// 이름 옆의 단축키(「지도 M」)는 키보드 기기에서만 보인다(KeyHint, 손가락 기기에서는 CSS가 숨긴다).
// 맨 위에 화면 말 바꾸기(한국어 ↔ English)를 둔다: 영어를 찾는 손님이 걷기를 떠나지 않고 바로 바꾸게
export function WalkMenu({ coarse, view, inRoom, canLook, together = false, signedIn = false, onAction, onSens, note }: Props) {
  const first = useRef<HTMLButtonElement>(null);
  useDialogFocus(first);
  const lang = useLang();
  const tr = useTr();
  const [sens, setSens] = useState(P.readSens);
  const [sound, setSound] = useState(P.readGameSound);
  const still = P.isStill();
  const items: Item[] = [
    { a: 'view', text: view === 'first' ? 'view1' : 'view3', id: 'view' },
    ...(canLook ? [{ a: 'look' as const, text: 'look' as const, id: 'character' as const }] : []),
    ...(together ? [{ a: 'chat' as const, text: 'chat' as const, id: 'chat' as const }, { a: 'people' as const, text: 'people' as const, id: 'people' as const }] : []),
    { a: 'shot', text: 'shot', id: 'shot' },
    { a: 'games', text: 'games' },
    { a: 'guestbook', text: 'guestbook' },
    { a: 'gallery', text: 'gallery' },
    { a: 'map', text: 'map', id: 'map' },
    { a: 'way', text: 'way', id: 'way' },
    { a: 'portal', text: 'portal', id: 'portal' },
    { a: 'help', text: 'help', id: 'help' },
  ];
  return (
    <div className="walk-panel walk-menu" role="dialog" aria-modal="true" aria-label={tr('메뉴', 'Menu')} onKeyDown={trapTab}>
      <h2><T ko="메뉴" en="Menu" /></h2>
      <div style={ROW}>
        <span><T ko="언어" en="Language" /></span>
        <LangToggle className="btn btn-small" />
      </div>
      {note}
      <button ref={first} type="button" className="btn btn-roof walk-menu-resume" onClick={() => onAction('resume')} aria-keyshortcuts={coarse ? undefined : ariaKey('menu')}>
        <T ko="계속하기" en="Continue" /> <KeyHint id="menu" />
      </button>
      <ul className="walk-menu-list">
        {items.map((it) => (
          <li key={it.a}>
            <button type="button" className="walk-menu-item" onClick={() => onAction(it.a)} aria-keyshortcuts={coarse || !it.id ? undefined : ariaKey(it.id)}>
              <span>{pick(MENU_TEXT[it.text], lang)}</span>
              {it.id ? <KeyHint id={it.id} /> : null}
            </button>
          </li>
        ))}
      </ul>
      <div className="walk-menu-set">
        <div style={ROW}>
          <span><T ko="화면 밝기" en="Theme" /></span>
          <ThemeToggle />
        </div>
        <label className="walk-menu-range">
          <span>{coarse ? <T ko="둘러보기 빠르기" en="Look-around speed" /> : <T ko="마우스 감도" en="Mouse sensitivity" />} <output>{sens.toFixed(1)}</output></span>
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.1}
            value={sens}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              setSens(v);
              P.saveSens(v);
              onSens(v);
            }}
          />
        </label>
        <label className="walk-menu-check">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              setSound(on);
              P.saveGameSound(on);
            }}
          />
          <span><T ko="놀이 소리 켜기 (놀이 안에서 다시 바꿀 수 있어요)" en="Game sounds on (you can change this in each game)" /></span>
        </label>
        <p className="small walk-panel-meta">
          {still
            ? <T ko="기기에서 「동작 줄이기」가 켜져 있어 흔들림, 번쩍임, 화면 전환을 줄였어요." en="“Reduce motion” is on in your device settings, so shaking, flashes and screen transitions are toned down." />
            : <T ko="기기 설정에서 「동작 줄이기」를 켜면 흔들림, 번쩍임, 화면 전환이 줄어요." en="Turn on “Reduce motion” in your device settings to tone down shaking, flashes and screen transitions." />}
        </p>
      </div>
      <div className="btn-row">
        {inRoom ? (
          <button type="button" className="btn btn-small" onClick={() => onAction('leaveRoom')}><T ko="방에서 나가기" en="Leave room" /></button>
        ) : null}
        {/* 3D가 버겁거나 화면을 보지 않고 쓰는 손님이 메뉴에서 바로 빠져나갈 길 */}
        <Link className="btn btn-small" href="/map"><T ko="도장 투어 맵 보기 (3D 없이)" en="Stamp tour map (no 3D)" /></Link>
        <a className="btn btn-small" href={IDEAS_NEW_URL} target="_blank" rel="noopener noreferrer"><T ko="아이디어 제안하기" en="Suggest an idea" /></a>
        {signedIn ? (
          <form action="/auth/signout" method="post" className="inline-form"><button type="submit" className="btn btn-small"><T ko="로그아웃" en="Sign out" /></button></form>
        ) : (
          <Link className="btn btn-small btn-pine" href="/login?next=/walk"><T ko="로그인" en="Sign in" /></Link>
        )}
        <Link className="btn btn-small" href="/"><T ko="첫 화면으로" en="Home" /></Link>
      </div>
    </div>
  );
}
