'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { earnStamp } from '@/app/actions';
import { HOUSE_PLAQUE } from '@/content/house-name';
import { T } from '@/components/i18n/T';
import { markStamped } from '@/components/walk/memory';
import { placeName } from '@/lib/place-names';
import {
  buzz, stampButton, stampButtonEn, stampLine, stampLineEn, stampOutcome, type StampReply, type StampState,
} from './stamp-rules';
import css from './stamp.module.css';

// 도장 찍기의 반응. 누르면 도장이 위에서 내려와 찍히고(줄인 움직임이면 그대로 나타난다), 「○○ 도장을 찍었어요」,
// 단추는 「찍음」으로 바뀌어 다시 눌리지 않는다. 못 찍으면 까닭을 말하고, 다시 해 볼 만하면 「다시 찍기」.
// 휴대폰은 짧게 떤다. 걷기 화면의 살피기 창은 useStamp + StampFeedback으로, 방 화면은 StampButton으로 쓴다.
// 화면이 영어이면 방 이름은 장소 이름 표(lib/place-names)로, 말은 stamp-rules의 영어로 보인다(받은 이름이 이미 영어면 그대로).

/** 도장 그림 아래 글의 영어(알려진 한국어 글만) */
const CAPTION_EN: Readonly<Record<string, string>> = { '방 도장': 'Room stamp', '현장 도장': 'On-site stamp', '도장 자리': 'Stamp spot' };

/** 찍히는 도장 그림. press가 참이면 찍히는 움직임(한 번), state가 new면 휴대폰을 떨게 할 수도 있다(vibrate) */
export function StampSeal({ name, nameEn, state, size = 148, press = false, vibrate = false, caption = '방 도장', captionEn }: {
  name: string; nameEn?: string; state: 'new' | 'have' | 'off'; size?: number; press?: boolean; vibrate?: boolean; caption?: string; captionEn?: string;
}) {
  const label = name.length > 7 ? `${name.slice(0, 7)}…` : name;
  // 영어 이름은 한 줄로 들어가게 글자를 줄인다(안쪽 원 너비 약 104)
  const en = nameEn ?? placeName('en', name);
  const enLabel = en.length > 18 ? `${en.slice(0, 17)}…` : en;
  const enSize = Math.min(19, Math.floor((104 / (Math.max(1, enLabel.length) * 0.6)) * 10) / 10);
  const capKo = state === 'off' ? '도장 자리' : caption;
  const capEn = state === 'off' ? CAPTION_EN['도장 자리'] : captionEn ?? CAPTION_EN[caption] ?? caption;
  // 현장 QR처럼 화면이 열리자마자 찍힌 때: 한 번 떤다(손을 대기 전이라 브라우저가 막으면 그냥 지나간다)
  useEffect(() => {
    if (vibrate && state === 'new') buzz();
  }, [vibrate, state]);
  return (
    <span className={css.sealWrap} data-press={press || undefined} style={{ '--seal-size': `${size}px` } as CSSProperties}>
      <svg className={css.seal} data-state={state} viewBox="0 0 148 148" aria-hidden="true" focusable="false">
        <circle cx="74" cy="74" r="68" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="74" cy="74" r="56" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* 당호는 현판처럼 오른쪽부터 읽는다(堂連造). 그림은 aria-hidden이라 화면 읽기에는 아래 이름만 */}
        <text x="74" y="56" textAnchor="middle" fontSize="15" fill="currentColor">{HOUSE_PLAQUE}</text>
        <text x="74" y="84" textAnchor="middle" fontSize="19" fill="currentColor">
          <tspan data-ko="">{label}</tspan>
          <tspan data-en="" lang="en" fontSize={enSize}>{enLabel}</tspan>
        </text>
        <text x="74" y="108" textAnchor="middle" fontSize="12" fill="currentColor">
          <tspan data-ko="">{capKo}</tspan>
          <tspan data-en="" lang="en">{capEn}</tspan>
        </text>
      </svg>
      {press ? <span className={css.ink} aria-hidden="true" /> : null}
    </span>
  );
}

/** 도장 찍기 상태와 누르기. room이 없으면 아무것도 하지 않는다 */
export function useStamp(room: string | null) {
  const [state, setState] = useState<StampState>({ kind: 'idle' });
  const live = useRef<StampState>(state);
  useEffect(() => {
    live.current = state;
  });
  // 다른 방을 살피면 처음부터
  const [shownRoom, setShownRoom] = useState(room);
  if (shownRoom !== room) {
    setShownRoom(room);
    setState({ kind: 'idle' });
  }
  const press = useCallback(async () => {
    const cur = live.current;
    // 찍는 중·찍은 뒤·다시 해도 소용없는 실패면 눌러도 아무 일 없다(두 번 눌러 두 번 보내지 않게)
    if (!room || cur.kind === 'busy' || cur.kind === 'new' || cur.kind === 'have' || (cur.kind === 'fail' && !cur.again)) return;
    live.current = { kind: 'busy' };
    setState({ kind: 'busy' });
    const fd = new FormData();
    fd.set('room', room);
    let reply: StampReply | null = null;
    try {
      reply = await earnStamp(fd);
    } catch {
      reply = null;
    }
    const next = stampOutcome(reply);
    if (next.kind === 'new' || next.kind === 'have') {
      // 이 기기의 기억(놀이 결과 카드가 쓴다)에도 적는다
      try { markStamped(localStorage, room); } catch { /* 기억 못 해도 도장은 찍혔다 */ }
    }
    if (next.kind === 'new') buzz();
    live.current = next;
    setState(next);
  }, [room]);
  return { state, press };
}

/** 찍은 뒤의 한 줄(찍은 도장 그림과 글). 찍기 전에는 아무것도 없다 */
export function StampFeedback({ state, name }: { state: StampState; name: string }) {
  const line = stampLine(state, name);
  if (!line || (state.kind !== 'new' && state.kind !== 'have' && state.kind !== 'fail')) return null;
  const lineEn = stampLineEn(state, placeName('en', name)) ?? line;
  if (state.kind === 'fail') {
    return (
      <div className={css.feedback} data-kind="fail" role="alert">
        <p className={css.feedbackText}><T ko={line} en={lineEn} /></p>
      </div>
    );
  }
  return (
    <div className={css.feedback} data-kind={state.kind} role="status">
      <StampSeal name={name} state={state.kind === 'new' ? 'new' : 'have'} size={80} press={state.kind === 'new'} />
      <div>
        <p className={css.feedbackText}><T ko={line} en={lineEn} /></p>
        <p className={css.feedbackSub}>
          {state.kind === 'new' ? <T ko="수첩에 찍혔어요." en="It’s in your notebook." /> : <T ko="수첩에 그대로 있어요." en="It’s still in your notebook." />}
        </p>
      </div>
    </div>
  );
}

/** 도장 찍기 단추(찍기 전·찍는 중·찍음·다시 찍기). 찍은 뒤에도 초점을 잃지 않게 disabled 대신 aria-disabled.
 * labelEn: 영어 화면의 단추 글(label을 바꿨는데 labelEn이 없으면 영어 화면에서도 label) */
export function StampPressButton({ state, onPress, label = '도장 찍기', labelEn, className = 'btn btn-small btn-pine' }: {
  state: StampState; onPress: () => void; label?: string; labelEn?: string; className?: string;
}) {
  const b = stampButton(state, label);
  const bEn = stampButtonEn(state, labelEn ?? (label === '도장 찍기' ? 'Get the stamp' : label));
  const done = state.kind === 'new' || state.kind === 'have';
  return (
    <button
      type="button"
      className={`${className} ${css.pressed}`}
      aria-disabled={b.locked || undefined}
      aria-busy={state.kind === 'busy' || undefined}
      data-done={done || undefined}
      onClick={() => { if (!b.locked) onPress(); }}
    >
      {done ? <IconCheck /> : null}
      <T ko={b.text} en={bEn.text} />
    </button>
  );
}

/** 방 화면처럼 단추와 결과를 한 자리에 두는 곳 */
export function StampButton({ room, name, label, labelEn }: { room: string; name: string; label?: string; labelEn?: string }) {
  const { state, press } = useStamp(room);
  return (
    <div className={css.stack}>
      <StampPressButton state={state} onPress={() => void press()} label={label} labelEn={labelEn} className="btn btn-small" />
      <StampFeedback state={state} name={name} />
    </div>
  );
}

function IconCheck() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
