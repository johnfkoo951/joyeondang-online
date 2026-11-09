'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { IDEAS_NEW_URL } from '@/content/links';
import type { View } from '@/walk/scene';
import * as P from './prefs';
import { trapTab, useDialogFocus } from './useDialogFocus';

export type MenuAction = 'resume' | 'view' | 'look' | 'shot' | 'gallery' | 'map' | 'way' | 'portal' | 'help' | 'leaveRoom';

type Props = {
  coarse: boolean;
  view: View;
  inRoom: boolean;
  /** 캐릭터 꾸미기를 열 수 있는지(패널이 준비됐을 때) */
  canLook: boolean;
  onAction: (a: MenuAction) => void;
  onSens: (v: number) => void;
};

type Item = { a: MenuAction; label: string; key?: string };

// 메뉴(데스크탑 Esc, 휴대폰 위 줄 「메뉴」). 열려 있는 동안 걷기는 멈춘다.
export function WalkMenu({ coarse, view, inRoom, canLook, onAction, onSens }: Props) {
  const first = useRef<HTMLButtonElement>(null);
  useDialogFocus(first);
  const [sens, setSens] = useState(P.readSens);
  const [sound, setSound] = useState(P.readGameSound);
  const still = P.isStill();
  const items: Item[] = [
    { a: 'view', label: view === 'first' ? '시점: 1인칭 (3인칭으로 바꾸기)' : '시점: 3인칭 (1인칭으로 바꾸기)', key: 'V' },
    ...(canLook ? [{ a: 'look' as const, label: '캐릭터 꾸미기', key: 'C' }] : []),
    { a: 'shot', label: '사진 찍기', key: 'F2' },
    { a: 'gallery', label: '내 갤러리' },
    { a: 'map', label: '지도', key: 'M' },
    { a: 'way', label: '길 찾기', key: 'G' },
    { a: 'portal', label: '포털 바로 가기', key: 'P' },
    { a: 'help', label: '조작법', key: '?' },
  ];
  return (
    <div className="walk-panel walk-menu" role="dialog" aria-modal="true" aria-label="메뉴" onKeyDown={trapTab}>
      <h2>메뉴</h2>
      <button ref={first} type="button" className="btn btn-roof walk-menu-resume" onClick={() => onAction('resume')} aria-keyshortcuts={coarse ? undefined : 'Escape'}>
        계속하기
      </button>
      <ul className="walk-menu-list">
        {items.map((it) => (
          <li key={it.a}>
            <button type="button" className="walk-menu-item" onClick={() => onAction(it.a)} aria-keyshortcuts={coarse ? undefined : it.key}>
              <span>{it.label}</span>
              {!coarse && it.key ? <kbd>{it.key}</kbd> : null}
            </button>
          </li>
        ))}
      </ul>
      <div className="walk-menu-set">
        <label className="walk-menu-range">
          <span>{coarse ? '둘러보기 빠르기' : '마우스 감도'} <output>{sens.toFixed(1)}</output></span>
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
          <span>놀이 소리 켜기 (놀이 안에서 다시 바꿀 수 있어요)</span>
        </label>
        <p className="small walk-panel-meta">
          {still
            ? '기기에서 「동작 줄이기」가 켜져 있어 흔들림, 번쩍임, 화면 전환을 줄였어요.'
            : '기기 설정에서 「동작 줄이기」를 켜면 흔들림, 번쩍임, 화면 전환이 줄어요.'}
        </p>
      </div>
      <div className="btn-row">
        {inRoom ? (
          <button type="button" className="btn btn-small" onClick={() => onAction('leaveRoom')}>방에서 나가기</button>
        ) : null}
        <a className="btn btn-small" href={IDEAS_NEW_URL} target="_blank" rel="noopener noreferrer">아이디어 제안하기</a>
        <Link className="btn btn-small" href="/">나가기</Link>
      </div>
    </div>
  );
}
