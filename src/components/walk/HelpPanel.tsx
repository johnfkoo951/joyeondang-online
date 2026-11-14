'use client';
import { useRef } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { ariaKey } from './controls';
import { deskHelpRows } from './help-rows';
import { TOUCH_FULLSCREEN, TOUCH_HELP, TOUCH_NO_FULLSCREEN, TOUCH_TOGETHER, helpFoot, pick } from './hud-text';
import { KeyHint } from './KeyHint';
import { trapTab, useDialogFocus } from './useDialogFocus';

/**
 * gallery: 부엌 사진 갤러리 액자가 걸린 집인가(걸렸을 때만 액자 이야기를 붙인다).
 * fullscreen: 이 브라우저에서 전체 화면을 쓸 수 있는가(못 쓰면 그 줄을 흐리게 두고 까닭을 붙인다)
 */
type Props = { coarse: boolean; real: boolean; room?: boolean; together?: boolean; gallery?: boolean; fullscreen?: boolean; onClose: () => void };

// 조작 도움말. 기기에 맞는 설명만 보여 준다. 데스크탑은 단축키 표(shortcuts.ts) 전체를 보인다.
// 글은 화면 말(한국어·영어)을 따르고(hud-text.ts, help-rows.ts), 키 글자는 두 말 모두 같다.
export function HelpPanel({ coarse, real, room = false, together = false, gallery = false, fullscreen = false, onClose }: Props) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useDialogFocus(closeBtn);
  const lang = useLang();
  const tr = useTr();
  return (
    <div className="walk-panel walk-help" role="dialog" aria-modal="true" aria-label={tr('조작법', 'Controls')} onKeyDown={trapTab}>
      <h2><T ko="걷는 법" en="How to walk" /></h2>
      {coarse ? (
        <ul className="walk-help-list">
          {TOUCH_HELP.map((t) => <li key={t[0]}>{pick(t, lang)}</li>)}
          <li data-off={fullscreen ? undefined : 'true'}>{pick(fullscreen ? TOUCH_FULLSCREEN : TOUCH_NO_FULLSCREEN, lang)}</li>
          {together ? <li>{pick(TOUCH_TOGETHER, lang)}</li> : null}
        </ul>
      ) : (
        <dl className="walk-keys">
          {deskHelpRows(lang).map((r) => {
            const lone = r.together && !together;
            const unable = r.id === 'fullscreen' && !fullscreen;
            return (
              <div key={r.key} data-off={lone || unable ? 'true' : undefined}>
                <dt><kbd>{r.key}</kbd></dt>
                <dd>
                  <strong>{r.label}</strong> {r.text}
                  {lone ? <span className="walk-keys-note"><T ko=" 초대 손님이 함께 걸을 때 써요." en=" Used when invited guests walk together." /></span> : null}
                  {unable ? <span className="walk-keys-note"><T ko=" 이 브라우저에서는 전체 화면을 열 수 없어요." en=" This browser can’t open full screen." /></span> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="small walk-panel-meta">{helpFoot({ room, real, gallery, coarse }, lang)}</p>
      <button ref={closeBtn} type="button" className="btn btn-small" onClick={onClose} aria-keyshortcuts={coarse ? undefined : `${ariaKey('help')} ${ariaKey('menu')}`}>
        <T ko="닫기" en="Close" /> <KeyHint id="menu" />
      </button>
    </div>
  );
}
