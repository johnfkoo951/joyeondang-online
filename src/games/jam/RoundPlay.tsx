// 받아 치기 한 판: 한 마디 들려주고 한 마디 받아 친다. 화면은 오디오 시계(들리는 시각)를 따라 그린다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { Engine, Transport } from './audio';
import { DrumArt, Face, IconEar, IconHand } from './icons';
import { composing, isTypingTarget } from './keys';
import {
  ROUNDS, buildRound, heardAt, judgePhrase, judgeWindow, nearestVerdict, phraseIndexAt, phraseVerdict, slotTime, swingRatio,
  type PhraseJudge, type Verdict,
} from './logic';
import s from './jam.module.css';

export type Audio = { engine: Engine; transport: Transport };
type Mode = 'count' | 'call' | 'resp' | 'end';
type View = { mode: Mode; phrase: number; slot: number; count: number; pct: number };

export const VERDICT_TEXT: Record<Verdict, string> = { good: '좋아요', early: '조금 빨라요', late: '조금 늦어요', miss: '다시 들어 봐요' };
/** 영어 화면의 판정 말(같은 열쇠) */
export const VERDICT_TEXT_EN: Record<Verdict, string> = { good: 'Nice!', early: 'A bit early', late: 'A bit late', miss: 'Listen again' };
/** 손가락·키가 닿은 뒤 이벤트가 되기까지(ms, 대략) */
const INPUT_LAG = { touch: 14, other: 6 };
/** 북 그림이 번쩍이는 간격의 하한(초당 3번 넘지 않게) */
const PULSE_GAP = 0.34;

type Props = { round: number; attempt: number; seed: number; audio: Audio; coarse?: boolean; onDone: (judges: PhraseJudge[]) => void };

export function RoundPlay({ round, attempt, seed, audio, coarse = false, onDone }: Props) {
  const spec = ROUNDS[round];
  // 손가락 기기는 판정 창이 조금 넓다(logic.judgeWindow)
  const win = useMemo(() => judgeWindow(spec, coarse), [spec, coarse]);
  const tl = useMemo(() => buildRound(seed, round, attempt), [seed, round, attempt]);
  const [view, setView] = useState<View>({ mode: 'count', phrase: 0, slot: -1, count: 0, pct: 0 });
  const [verdicts, setVerdicts] = useState<Array<Verdict | null>>(() => tl.phrases.map(() => null));
  const [flash, setFlash] = useState<{ v: Verdict; n: number } | null>(null);
  const [pulse, setPulse] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const st = useRef({ t0: 0, on: false, taps: [] as number[][], judged: [] as Array<PhraseJudge | null>, prev: -9, lastPulse: -9, n: 0, key: '' });
  const doneRef = useRef(onDone);
  const hitRef = useRef<(ms: number, touch: boolean) => void>(() => {});
  const lang = useLang();
  const tr = useTr();
  const verdictText = lang === 'en' ? VERDICT_TEXT_EN : VERDICT_TEXT;

  useEffect(() => {
    doneRef.current = onDone;
  });

  // 판 하나 돌리기(이어서 하기를 누르면 run이 바뀌어 처음부터 다시)
  useEffect(() => {
    const r = st.current;
    const { engine, transport } = audio;
    const sw = swingRatio(tl.bpm);
    const beat = 60 / tl.bpm;
    const N = tl.phrases.length;
    r.taps = tl.phrases.map(() => []);
    r.judged = tl.phrases.map(() => null);
    r.prev = -9;
    r.lastPulse = -9;
    r.key = '';
    r.t0 = transport.start(tl.events, null);
    r.on = true;
    let raf = 0;
    const slotAt = (rel: number) => {
      let k = -1;
      for (let i = 0; i < 8; i++) if (slotTime(i, tl.bpm, sw) <= rel) k = i;
      return k;
    };
    const frame = () => {
      if (!r.on) return;
      const now = heardAt(performance.now(), engine.stamp()) - r.t0;
      const b = Math.floor(now / tl.bar);
      let v: View = { mode: 'count', phrase: 0, slot: -1, count: 0, pct: Math.max(0, Math.min(100, Math.floor((now / tl.length) * 100))) };
      if (now >= 0 && b === 0) v = { ...v, count: Math.min(4, Math.floor(now / beat) + 1) };
      else if (b >= 1 && b <= 2 * N) v = { ...v, mode: (b - 1) % 2 === 0 ? 'call' : 'resp', phrase: Math.floor((b - 1) / 2), slot: slotAt(now - b * tl.bar) };
      else if (b > 2 * N) v = { ...v, mode: 'end' };
      const key = `${v.mode}|${v.phrase}|${v.slot}|${v.count}|${v.pct}`;
      if (key !== r.key) {
        r.key = key;
        setView(v);
      }
      // 들려주는 마디의 북소리에 맞춰 북 그림을 잠깐 밝힌다
      if (v.mode === 'call') {
        const p = tl.phrases[v.phrase];
        const hitNow = p.pattern.some((sl) => {
          const t = p.callAt + slotTime(sl, tl.bpm, sw);
          return t > r.prev && t <= now;
        });
        if (hitNow && now - r.lastPulse >= PULSE_GAP) {
          r.lastPulse = now;
          setPulse((x) => x + 1);
        }
      }
      r.prev = now;
      // 받아 치기 마디가 지나면 판정
      let changed = false;
      tl.phrases.forEach((p, k) => {
        if (r.judged[k] || now < p.respEnd + win.ok) return;
        r.judged[k] = judgePhrase(p.expected, r.taps[k], win);
        changed = true;
      });
      if (changed) setVerdicts(r.judged.map((j) => (j ? phraseVerdict(j) : null)));
      if (now >= tl.length - 0.1) {
        r.on = false;
        doneRef.current(r.judged.map((j, k) => j ?? judgePhrase(tl.phrases[k].expected, r.taps[k], win)));
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    hitRef.current = (ms, touch) => {
      engine.hit();
      if (!r.on) return;
      const t = heardAt(ms, engine.stamp(), touch ? INPUT_LAG.touch : INPUT_LAG.other) - r.t0;
      const k = phraseIndexAt(tl.phrases, t, win);
      if (k < 0 || r.judged[k]) return;
      r.taps[k].push(t);
      const nv = nearestVerdict(tl.phrases[k].expected, t, win);
      if (nv) setFlash({ v: nv.verdict, n: ++r.n });
    };
    // 탭이 숨으면 멈춘다(숨은 탭에서는 타이머가 늦어 박이 흐트러진다)
    const onVis = () => {
      if (document.visibilityState !== 'hidden' || !r.on) return;
      r.on = false;
      transport.stop();
      setPaused(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      r.on = false;
      cancelAnimationFrame(raf);
      transport.stop();
      hitRef.current = (ms, touch) => { void ms; void touch; engine.hit(); };
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [audio, tl, win, run]);

  // 스페이스바 = 북(반복 키·입력칸·한글 조합 중은 무시). 단추 위에서 눌러도 단추를 누르지 않게 keyup도 막는다
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ';
    const down = (e: KeyboardEvent) => {
      if (!isSpace(e) || composing(e) || isTypingTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (e.repeat) return;
      hitRef.current(e.timeStamp, false);
    };
    const up = (e: KeyboardEvent) => {
      if (isSpace(e) && !isTypingTarget(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onStage = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const t = e.target as HTMLElement;
    const btn = t.closest('button');
    if (btn && !btn.dataset.drum) return;
    e.preventDefault();
    hitRef.current(e.nativeEvent.timeStamp, e.pointerType === 'touch' || e.pointerType === 'pen');
  };
  // Enter·보조기술의 누르기(detail 0)만 여기서. 손가락·마우스는 pointerdown이 이미 받았다
  const onDrumClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) hitRef.current(e.nativeEvent.timeStamp, false);
  };
  const resume = () => {
    setVerdicts(tl.phrases.map(() => null));
    setFlash(null);
    setPaused(false);
    setRun((x) => x + 1);
  };

  const p = tl.phrases[view.phrase];
  const cue =
    view.mode === 'count' ? { icon: null, text: view.count ? String(view.count) : tr('준비', 'Ready') }
    : view.mode === 'call' ? { icon: <IconEar />, text: tr('들어 봐요', 'Listen') }
    : view.mode === 'resp' ? { icon: <IconHand />, text: tr('따라 쳐요', 'Play it back') }
    : { icon: null, text: tr('끝!', 'Done!') };
  return (
    <div className={s.round} data-mode={view.mode}>
      <p className={s.cue} aria-live="polite">
        {cue.icon}
        <span>{cue.text}</span>
      </p>
      <div className={s.dots} aria-hidden="true">
        {view.mode === 'count'
          ? [1, 2, 3, 4].map((k) => <span key={k} className={s.dot} data-beat="" data-on={k <= view.count ? '' : undefined} data-now={k === view.count ? '' : undefined} />)
          : Array.from({ length: 8 }, (_, k) => (
              <span
                key={k}
                className={s.dot}
                data-beat={k % 2 === 0 ? '' : undefined}
                data-on={view.mode !== 'end' && p?.pattern.includes(k) ? '' : undefined}
                data-now={k === view.slot ? '' : undefined}
              />
            ))}
      </div>
      <div className={s.stage} onPointerDown={onStage}>
        <button type="button" data-drum="1" className={s.drum} data-pulse={pulse % 2} onClick={onDrumClick} aria-label={tr('북 치기', 'Hit the drum')} aria-keyshortcuts="Space">
          <span key={pulse} className={s.drumArt} data-lit={pulse > 0 ? '' : undefined}>
            <DrumArt />
          </span>
        </button>
        {flash ? (
          <p key={flash.n} className={s.flash} data-v={flash.v} role="status">
            <Face kind={flash.v} />
            <span>{verdictText[flash.v]}</span>
          </p>
        ) : null}
      </div>
      <ol className={s.phrases} aria-label={tr(`${round + 1}판 마디 결과`, `Round ${round + 1} bar results`)}>
        {verdicts.map((v, k) => (
          <li
            key={k}
            data-v={v ?? undefined}
            aria-label={v ? tr(`${k + 1}번째 마디 ${VERDICT_TEXT[v]}`, `Bar ${k + 1}: ${VERDICT_TEXT_EN[v]}`) : tr(`${k + 1}번째 마디 아직`, `Bar ${k + 1}: not yet`)}
          >
            {v ? <Face kind={v} /> : <span className={s.pending} />}
          </li>
        ))}
      </ol>
      <div className={s.progress} aria-hidden="true">
        <span style={{ width: `${view.pct}%` }} />
      </div>
      <p className={s.hint}>{tr('북 단추나 화면을 톡, 키보드는 Space', 'Tap the drum or the screen, or press Space')}</p>
      {paused ? (
        <div className={s.pause} role="alertdialog" aria-label={tr('잠깐 멈췄어요', 'Paused')}>
          <p>{tr('잠깐 멈췄어요', 'Paused')}</p>
          <button type="button" className={s.primary} onClick={resume} autoFocus>
            {tr('이 판 다시 하기', 'Replay this round')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
