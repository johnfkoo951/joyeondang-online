'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { modelConfirm, modelConfirmYes } from '@/lib/avatar/consent';
import { MESSAGES, modelChance, modelChanceLine, modelNoneLine, readSlotsReply, type CharItem, type SlotsReply } from '@/lib/avatar/rules';
import { startModelMaking } from './making-3d';
import css from './Making.module.css';

// 2D 캐릭터 그림을 다 그린 뒤의 확인 카드(걷기 화면의 칩 자리와 캐릭터 창이 함께 쓴다).
// 새 그림을 크게 보이고 둘 가운데 고르게 한다:
//   「이걸로 3D 만들기」 남은 3D 수와 실패하면 한 번 더 해 볼 수 있는지(실제 셈대로)를 보이고, 무엇을 어디로 보내는지 한 번 더
//     묻는다(3D 확인 글은 consent.ts의 것 그대로). ★가 없으면 서버가 ★로 보관한 뒤 요청한다(보관함이 차 있으면 안내).
//   「다른 그림 더 만들고 나중에 고르기」 카드만 닫는다(그림은 작업대와 이력에 그대로 있다).
// 3D를 더 맡길 수 없으면(다 씀·다 해 봄·오늘 상한·쉬는 중) 단추 대신 그 까닭 한 줄과 닫기만 보인다.
// 한도·★·3D 판정은 서버의 DB 함수가 한 번 더 한다(여러 번 누르거나 동시에 보내도 한 사람 몫을 넘지 않는다).
// 낮은 화면(휴대폰 가로, LOW_SCREEN)의 걷기 화면에서는 긴 3D 확인 글을 칩 자리에서 묻지 않는다: 「이걸로 3D 만들기」가 캐릭터 창을
// 열고, 창 맨 위의 같은 카드가 바로 확인을 묻는다(askInPanel. 창은 스크롤되고, 걷기 화면의 스틱을 덮지 않는다).

/** 이 높이 아래의 화면은 3D 확인을 캐릭터 창에서 묻는다(Making.module.css의 같은 미디어 조건) */
export const LOW_SCREEN = '(max-height: 500px)';
/** 걷기 화면이 캐릭터 창으로 넘긴 3D 확인(그림 id). 창의 카드가 열리면서 한 번 가져간다 */
let askInPanel: string | null = null;
/** 넘겨받은 확인이 이 그림의 것이면 가져간다(한 번만) */
export function takePanelAsk(id: string): boolean {
  if (askInPanel !== id) return false;
  askInPanel = null;
  return true;
}
/** 걷기 화면에서: 이 그림의 3D 확인을 캐릭터 창에서 묻게 한다 */
export function askModelInPanel(id: string): void {
  askInPanel = id;
}
const lowScreen = () => {
  try {
    return typeof window !== 'undefined' && window.matchMedia(LOW_SCREEN).matches;
  } catch {
    return false;
  }
};

/** 칸 답: 위에서 받았으면 그것(캐릭터 창), 없으면(undefined) 이 카드가 한 번 읽는다(걷기 화면). null은 읽는 중, 'error'는 못 읽음 */
export type PickInfo = SlotsReply | null | 'error';

/** 실패 알림: 서버가 준 한국어 글(영어가 없으면 그대로 보인다)과 이 카드가 아는 영어 */
type Msg = { ko: string; en?: string };

type Step = 'pick' | 'confirm' | 'keepFull' | 'sending' | 'fail';

/** 마우스로 누른 단추는 초점을 놓는다(걷기 화면: 뒤의 Space가 점프 대신 이 단추를 다시 누르지 않게) */
const tap = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  if (e.detail !== 0) e.currentTarget.blur();
  fn();
};

/** 칸 답에서 그 그림(작업대·이력) */
function itemOf(info: SlotsReply | null, id: string): CharItem | null {
  if (!info) return null;
  return [...info.cells, ...(info.history ?? [])].find((c): c is CharItem => Boolean(c && c.id === id)) ?? null;
}

export function PickCard({ id, info: given, where, onClose, onSent, onOpenPanel, autoClose }: {
  id: string;
  info?: PickInfo;
  where: 'walk' | 'panel';
  /** 카드를 닫는다(「나중에 고르기」, 「닫기」) */
  onClose: () => void;
  /** 3D 요청이 들어갔다(카드는 닫고, 3D 진행이 이어 보인다) */
  onSent: () => void;
  /** 걷기 화면에서만: 캐릭터 창을 연다(보관함이 찼을 때 ★을 빼러 가기) */
  onOpenPanel?: () => void;
  /** 걷기 화면에서만: 고를 것이 없으면(3D를 맡길 수 없음) 다 그린 때(from)부터 after ms 뒤 저절로 닫는다(예전 알림처럼) */
  autoClose?: { after: number; from: number };
}) {
  const [own, setOwn] = useState<PickInfo>(null);
  const [step, setStep] = useState<Step>('pick');
  /** 걷기 화면(낮은 화면)이 넘긴 3D 확인: 칸 답을 읽은 뒤 바로 묻는다(확인 글이 제공자를 알아야 한다) */
  const [handoff, setHandoff] = useState(() => where === 'panel' && takePanelAsk(id));
  const [msg, setMsg] = useState<Msg | null>(null);
  const lang = useLang();
  const tr = useTr();
  const confirmRef = useRef<HTMLDivElement>(null);
  const ids = useId();
  // 걷기 화면: 남은 3D 수와 ★ 보관함을 한 번 읽는다(캐릭터 창은 이미 읽은 칸 답을 넘긴다)
  const fetchOwn = given === undefined;
  useEffect(() => {
    if (!fetchOwn) return;
    let stop = false;
    fetch('/api/avatar/slots', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (r) => {
        const data = r.ok ? readSlotsReply(await r.json().catch(() => null)) : null;
        if (!stop) setOwn(data ?? 'error');
      })
      .catch(() => { if (!stop) setOwn('error'); });
    return () => {
      stop = true;
    };
  }, [fetchOwn]);
  const info = fetchOwn ? own : given;
  const reply = info && info !== 'error' ? info : null;
  // 확인을 열면 확인으로 초점을 옮긴다(누른 단추가 사라지므로)
  useEffect(() => {
    if (step === 'confirm' || step === 'keepFull' || step === 'fail') confirmRef.current?.focus({ preventScroll: true });
  }, [step]);

  const counts = reply?.history ? reply.counts : null;
  const on = reply?.modelsOn !== false;
  const item = itemOf(reply, id);
  // 한 사람 몫의 3D를 지금 다른 그림으로 기다리거나 만드는 중이면 「이미 만들었다」고 하지 않는다
  const busy3d = Boolean(reply?.history?.some((h) => h.model === 'waiting' || h.model === 'making'));
  const chance = counts && (!item || item.model === 'none') ? modelChance(counts, on) : null;
  const none = counts && !chance ? modelNoneLine(counts, on, busy3d) : null;
  const kept = item?.kept === true;
  const keepFull = !kept && counts !== null && counts.keeps.cap !== null && counts.keeps.n >= counts.keeps.cap;
  const keepCap = counts?.keeps.cap ?? null;
  // 고를 것이 없으면(3D를 맡길 수 없음, 0021 전, 못 읽음) 걷기 화면의 카드는 예전 알림처럼 잠시 뒤 저절로 닫는다
  const idle = step === 'pick' && info !== null && !chance;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const after = autoClose?.after ?? 0;
  const from = autoClose?.from ?? 0;
  useEffect(() => {
    if (!after || !idle) return;
    const t = window.setTimeout(() => closeRef.current(), Math.max(1500, after - (Date.now() - from)));
    return () => window.clearTimeout(t);
  }, [idle, after, from]);

  const ask = () => {
    // 낮은 화면의 걷기 화면: 긴 확인 글은 캐릭터 창에서 묻는다(창 맨 위의 같은 카드가 이어 묻는다)
    if (where === 'walk' && onOpenPanel && lowScreen()) {
      askModelInPanel(id);
      onOpenPanel();
      return;
    }
    setMsg(null);
    setStep(keepFull ? 'keepFull' : 'confirm');
  };
  // 넘겨받은 확인: 칸 답을 읽으면 한 번 묻는다(3D를 더 맡길 수 없게 됐으면 묻지 않고 그 까닭이 보인다).
  // 렌더 중에 한 번 고친다(효과에서 상태를 바로 바꾸지 않는다)
  if (handoff && info !== null) {
    setHandoff(false);
    if (chance && step === 'pick') {
      setMsg(null);
      setStep(keepFull ? 'keepFull' : 'confirm');
    }
  }
  const send = async () => {
    setStep('sending');
    const res = await fetch(`/api/avatar/${encodeURIComponent(id)}/model`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keep: true }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (res && data?.ok === true) {
      startModelMaking(id);
      onSent();
      return;
    }
    if (data?.reason === 'keep_full') {
      setStep('keepFull');
      return;
    }
    setMsg(typeof data?.message === 'string' && data.message ? { ko: data.message.slice(0, 160) }
      : res?.status === 401 ? { ko: '로그인이 끊겼어요. 다시 들어온 뒤 해 주세요.', en: 'You were signed out. Please sign in again and try once more.' }
      : { ko: MESSAGES.tryLater });
    setStep('fail');
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape' && (step === 'confirm' || step === 'keepFull')) {
      e.preventDefault();
      e.stopPropagation();
      setStep('pick');
    }
  };

  // 걷기 화면에서는 카드가 저절로 나타나므로 제목을 화면 낭독기에 한 번 알린다(창 안에서는 진행 상자가 이미 알렸다)
  const title = (
    <p id={`${ids}-t`} className={css.pickTitle} role={where === 'walk' ? 'status' : undefined}>
      <T ko="새 캐릭터를 다 그렸어요" en="Your new character is ready" />
    </p>
  );
  /* 비공개 그림이라 이미지 최적화 서버를 거치지 않고 세션으로 바로 받는다 */
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img className={css.pickImg} src={`/api/avatar/${id}`} alt={tr('새로 그린 캐릭터', 'Your newly drawn character')} />;
  const later = (
    <button type="button" className="btn btn-small" onClick={tap(onClose)}><T ko={<>다른 그림 더 만들고 나중에 고르기</>} en="Make more pictures and choose later" /></button>
  );

  let body;
  if (step === 'confirm' || step === 'sending') {
    body = (
      <div ref={confirmRef} className={css.pickAsk} role="group" aria-labelledby={`${ids}-q`} tabIndex={-1}>
        <p id={`${ids}-q`} className={css.pickConfirm}>{modelConfirm(reply?.provider ?? 'meshy', counts?.models.cap ?? null, reply?.trainingOptOut === true)}</p>
        {chance ? <p className={css.pickChance}>{modelChanceLine(chance)}</p> : null}
        {!kept ? <p className={css.pickLine}><T ko="보내면 이 그림을 ★ 보관함에 넣어요." en="Sending it also puts this picture in your ★ box." /></p> : null}
        <div className={css.pickBtns}>
          <button type="button" className="btn btn-small btn-roof" disabled={step === 'sending'} onClick={tap(() => void send())}>
            {step === 'sending' ? <T ko="보내는 중" en="Sending" /> : modelConfirmYes(reply?.provider ?? 'meshy')}
          </button>
          <button type="button" className="btn btn-small" disabled={step === 'sending'} onClick={tap(() => setStep('pick'))}><T ko="그만두기" en="Cancel" /></button>
        </div>
      </div>
    );
  } else if (step === 'keepFull') {
    body = (
      <div ref={confirmRef} className={css.pickAsk} role="alert" tabIndex={-1}>
        <p className={css.pickConfirm}>{MESSAGES.pickKeepFull(keepCap)}</p>
        <div className={css.pickBtns}>
          {/* 걷기 화면은 창을 연다(★ 보관함이 거기 있다). 창 안에서는 바로 아래 보관함에서 ★을 뺀 뒤 다시 고른다 */}
          {where === 'walk' && onOpenPanel ? (
            <button type="button" className="btn btn-small btn-pine" onClick={tap(onOpenPanel)}><T ko="캐릭터 창 열기" en="Open the character window" /></button>
          ) : (
            <button type="button" className="btn btn-small btn-pine" onClick={tap(() => setStep('pick'))}><T ko="다시 고르기" en="Choose again" /></button>
          )}
          {later}
        </div>
      </div>
    );
  } else if (step === 'fail') {
    body = (
      <div ref={confirmRef} className={css.pickAsk} role="alert" tabIndex={-1}>
        <p className={css.pickConfirm}>{msg ? (lang === 'en' && msg.en ? msg.en : msg.ko) : null}</p>
        <div className={css.pickBtns}>
          <button type="button" className="btn btn-small" onClick={tap(onClose)}><T ko="닫기" en="Close" /></button>
        </div>
      </div>
    );
  } else if (info === null) {
    body = (
      <>
        <p className={css.pickLine} role="status"><T ko="3D 남은 수를 확인하는 중이에요." en="Checking how many 3D models you have left." /></p>
        <div className={css.pickBtns}>
          <button type="button" className="btn btn-small btn-roof" disabled><T ko={<>이걸로 3D 만들기</>} en="Make 3D from this" /></button>
          {later}
        </div>
      </>
    );
  } else if (info === 'error') {
    body = (
      <>
        <p className={css.pickLine}>
          <T ko="지금은 3D 남은 수를 읽지 못했어요. 캐릭터 창의 ★ 보관함에서 고를 수 있어요." en="Couldn’t check how many 3D models you have left. You can choose from the ★ box in the character window." />
        </p>
        <div className={css.pickBtns}>
          <button type="button" className="btn btn-small" onClick={tap(onClose)}><T ko="닫기" en="Close" /></button>
        </div>
      </>
    );
  } else if (chance) {
    body = (
      <>
        <p className={css.pickChance}>{modelChanceLine(chance)}</p>
        <div className={css.pickBtns}>
          <button type="button" className="btn btn-small btn-roof" onClick={tap(ask)}><T ko={<>이걸로 3D 만들기</>} en="Make 3D from this" /></button>
          {later}
        </div>
      </>
    );
  } else {
    body = (
      <>
        {none ? <p className={css.pickChance}>{none}</p> : null}
        <div className={css.pickBtns}>
          <button type="button" className="btn btn-small" onClick={tap(onClose)}><T ko="닫기" en="Close" /></button>
        </div>
      </>
    );
  }

  // 3D를 고를 수 있을 때만 「고르지 않아도 남는다」를 말한다(3D가 없으면 고를 것이 없다). 0021 전의 DB에는 이력이 없다
  const lead = chance
    ? tr('이 그림으로 3D를 만들까요? 고르지 않아도 그림은 작업대와 이력에 남아요.', 'Make a 3D model from this picture? If you don’t, the picture still stays on your workbench and in your history.')
    : reply?.history
      ? tr('그림은 작업대와 이력에 있어요.', 'The picture is on your workbench and in your history.')
      : tr('캐릭터 창에서 다른 칸으로 바꿀 수 있어요.', 'You can switch to another slot in the character window.');
  return (
    <section
      className={`${where === 'walk' ? 'walk-making ' : ''}${css.pick}`} data-where={where} data-step={step === 'pick' ? undefined : 'ask'}
      aria-labelledby={`${ids}-t`} onKeyDown={onKey}
    >
      {img}
      <div className={css.pickHead}>
        {title}
        {step === 'pick' ? <p className={`${css.pickLine} ${css.pickLead}`}>{lead}</p> : null}
      </div>
      <div className={css.pickBody}>{body}</div>
    </section>
  );
}
