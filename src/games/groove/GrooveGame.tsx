import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { GameContext, GameResult } from '../types';
import { createGrooveAudio, type GrooveAudio } from './audio';
import {
  STAGES,
  buildStageChart,
  cueWord,
  judgeTap,
  summarizeStage,
  type HitRecord,
  type HitVerdict,
  type StageSummary,
} from './logic';
import s from './groove.module.css';

/** 판정 말 [한국어, 영어](예전 한국어 화면 글 그대로) */
const VERDICT_WORDS: Record<HitVerdict, readonly [string, string]> = {
  pocket: ['JUST POCKET!', 'JUST POCKET!'],
  good: ['SWING GOOD', 'SWING GOOD'],
  early: ['조금 빨라요 (EARLY)', 'A bit early (EARLY)'],
  late: ['레이드백 (LATE)', 'Laid back (LATE)'],
  miss: ['아쉬워요 (MISS)', 'So close (MISS)'],
};

type Phase =
  | { k: 'menu' }
  | { k: 'playing'; stageIndex: number }
  | { k: 'summary'; summary: StageSummary };

export function GrooveGame({ ctx }: { ctx: GameContext }) {
  const [phase, setPhase] = useState<Phase>({ k: 'menu' });
  const [muted, setMuted] = useState(false);
  const [eyesClosed, setEyesClosed] = useState(false);
  const [stageScores, setStageScores] = useState<number[]>([0, 0, 0, 0]);
  const [stagePassed, setStagePassed] = useState<boolean[]>([false, false, false, false]);
  const [cueBubbles, setCueBubbles] = useState<[string, string, string]>(['', '', '']);
  const [popped, setPopped] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [lastHit, setLastHit] = useState<{ v: HitVerdict; deltaMs: number; cls: string; combo: number } | null>(null);
  // 다음 응답 예고. 22ms마다 같은 값을 다시 넣으므로 문자열 열쇠로 둔다(같은 글이면 다시 그리지 않는다): listen · count|말 · now|말 · next|말
  const [nextHint, setNextHint] = useState<string>('listen');
  const lang = useLang();
  const tr = useTr();
  const en = lang === 'en';

  const audioRef = useRef<GrooveAudio | null>(null);
  const startAtRef = useRef<number>(0);
  const tapHandlerRef = useRef<() => void>(() => {});
  const startedMsRef = useRef<number>(0);

  useEffect(() => {
    startedMsRef.current = performance.now();
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const ensureAudio = (): GrooveAudio | null => {
    if (!audioRef.current) {
      audioRef.current = createGrooveAudio(muted);
    }
    return audioRef.current;
  };

  const buildResult = useCallback(
    (scores: number[], passed: boolean[]): GameResult => ({
      cleared: passed.some(Boolean),
      score: scores.reduce((a, b) => a + b, 0),
      ms: Math.max(1000, Math.round(performance.now() - startedMsRef.current)),
      detail: {
        clearedStages: passed.filter(Boolean).length,
      },
    }),
    [],
  );

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  const launchStage = (stageIndex: number) => {
    const eng = ensureAudio();
    if (!eng) return;
    setLastHit(null);
    setCueBubbles(['', '', '']);
    setPhase({ k: 'playing', stageIndex });
  };

  useEffect(() => {
    if (phase.k !== 'playing') {
      tapHandlerRef.current = () => {};
      return;
    }
    const eng = audioRef.current;
    if (!eng) return;

    const chart = buildStageChart(phase.stageIndex, ctx.seed);
    const t0 = eng.now() + 0.12;
    startAtRef.current = t0;

    let evCursor = 0;
    const firedUi = new Set<number>();
    const taken = new Set<number>();
    const records = new Map<number, HitRecord>();
    let comboNow = 0;
    let finished = false;

    tapHandlerRef.current = () => {
      if (finished) return;
      const rel = eng.now() - t0;
      const upcoming = chart.targets.find((t) => !taken.has(t.index) && Math.abs(rel - t.t) <= 0.18);
      eng.playPlayerSnap(upcoming?.style === 'accent');

      setPopped((p) => [p[0], p[1], true]);
      window.setTimeout(() => setPopped((p) => [p[0], p[1], false]), 110);

      const hit = judgeTap(rel, chart.targets, taken, chart.spec, ctx.coarse);
      if (!hit) return;
      taken.add(hit.targetIndex);
      records.set(hit.targetIndex, hit);
      if (hit.verdict === 'pocket' || hit.verdict === 'good') comboNow++;
      else comboNow = 0;

      const cls =
        hit.verdict === 'pocket'
          ? s.verdictPocket
          : hit.verdict === 'good'
            ? s.verdictGood
            : s.verdictOff;
      const target = chart.targets[hit.targetIndex];
      setCueBubbles((b) => [b[0], b[1], target?.label ?? '챱!']);
      setLastHit({ v: hit.verdict, deltaMs: hit.deltaMs, cls, combo: comboNow });
    };

    const sched = window.setInterval(() => {
      const now = eng.now();
      const rel = now - t0;

      // 오디오 앞질러 예약(0.14초)
      while (evCursor < chart.events.length && chart.events[evCursor].t <= rel + 0.14) {
        const ev = chart.events[evCursor];
        eng.triggerCue(ev, t0 + ev.t);
        evCursor++;
      }

      // 화면 말풍선·점프 연출
      chart.events.forEach((ev, idx) => {
        if (firedUi.has(idx)) return;
        if (rel >= ev.t - 0.015) {
          firedUi.add(idx);
          if (ev.cueText && ev.actor !== undefined) {
            const actor = ev.actor;
            setCueBubbles((b) => {
              const next: [string, string, string] = [...b];
              next[actor] = ev.cueText!;
              return next;
            });
            setPopped((p) => {
              const next: [boolean, boolean, boolean] = [...p];
              next[actor] = true;
              return next;
            });
            window.setTimeout(() => {
              setPopped((p) => {
                const next: [boolean, boolean, boolean] = [...p];
                next[actor] = false;
                return next;
              });
            }, 130);
          } else if (ev.kind === 'count' && ev.cueText) {
            setNextHint(`count|${ev.cueText}`);
          }
        }
      });

      // 놓친 타겟 체크
      const missLimit = chart.spec.okWindow * (ctx.coarse ? 1.22 : 1.0);
      for (const t of chart.targets) {
        if (!taken.has(t.index) && rel > t.t + missLimit) {
          taken.add(t.index);
          records.set(t.index, { targetIndex: t.index, verdict: 'miss', deltaMs: 0, points: 0 });
          comboNow = 0;
          setLastHit({ v: 'miss', deltaMs: 0, cls: s.verdictMiss, combo: 0 });
        }
      }

      // 다음 타겟 예고(청음 전용 모드가 아닐 때)
      const nextT = chart.targets.find((t) => !taken.has(t.index) && t.t >= rel - 0.05);
      if (nextT) {
        const remain = nextT.t - rel;
        if (remain < 0.32) setNextHint(`now|${nextT.label}`);
        else setNextHint(`next|${nextT.label}`);
      }

      if (rel >= chart.totalDuration && !finished) {
        finished = true;
        window.clearInterval(sched);
        const summary = summarizeStage(phase.stageIndex, chart.targets, records);
        setStageScores((prev) => {
          const next = prev.slice();
          next[phase.stageIndex] = Math.max(next[phase.stageIndex], summary.points);
          setStagePassed((prevPass) => {
            const nextPass = prevPass.slice();
            if (summary.passed) nextPass[phase.stageIndex] = true;
            const res = buildResult(next, nextPass);
            if (res.cleared) ctx.report?.(res);
            return nextPass;
          });
          return next;
        });
        setPhase({ k: 'summary', summary });
      }
    }, 22);

    return () => {
      finished = true;
      window.clearInterval(sched);
    };
  }, [phase, ctx, buildResult]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.repeat) return;
      if (phase.k !== 'playing') return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'j' || e.key === 'J' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        tapHandlerRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase]);

  const finishAll = () => {
    const res = buildResult(stageScores, stagePassed);
    if (res.score === 0 && !res.cleared) ctx.onExit();
    else ctx.onExit(res);
  };

  /** 예고 열쇠를 지금 말로 */
  const hintText = (() => {
    const bar = nextHint.indexOf('|');
    const kind = bar < 0 ? nextHint : nextHint.slice(0, bar);
    const cue = bar < 0 ? '' : nextHint.slice(bar + 1);
    if (kind === 'count') return tr(`카운트: ${cue}`, `Count: ${cueWord(cue, 'en')}`);
    if (kind === 'now') return tr(`지금! "${cue}"`, `Now! "${cueWord(cue, 'en')}"`);
    if (kind === 'next') return tr(`다음 응답: "${cue}"`, `Next answer: "${cueWord(cue, 'en')}"`);
    return tr('귀를 기울여 보세요', 'Listen closely');
  })();

  const needleLeft = lastHit
    ? `${Math.max(6, Math.min(94, 50 + (lastHit.deltaMs / 110) * 44))}%`
    : '50%';

  return (
    <div className={s.root} data-theme={ctx.theme}>
      <div className={s.topBar}>
        <ol className={s.stagePills} aria-label={tr('리듬 스테이지', 'Rhythm stages')}>
          {STAGES.map((st, idx) => (
            <li
              key={st.id}
              className={s.stagePill}
              data-active={(phase.k === 'playing' && phase.stageIndex === idx) || undefined}
              data-done={stagePassed[idx] || undefined}
            >
              {tr(`${idx + 1}막`, `Act ${idx + 1}`)} {stagePassed[idx] ? '✓' : ''}
            </li>
          ))}
        </ol>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-small" onClick={() => setEyesClosed((v) => !v)}>
            {eyesClosed ? tr('시각 큐 켜기', 'Show visual cues') : tr('전공자 청음 모드(시각 힌트 숨김)', 'Ear-only mode')}
          </button>
          <button type="button" className="btn btn-small" onClick={toggleMute}>
            {muted ? tr('소리 켜기', 'Unmute') : tr('소리 끄기', 'Mute')}
          </button>
          <button type="button" className="btn btn-small" onClick={finishAll}>
            {tr(`점수 마감 (${stageScores.reduce((a, b) => a + b, 0)}점)`, `Finish (${stageScores.reduce((a, b) => a + b, 0)} pts)`)}
          </button>
        </div>
      </div>

      {phase.k === 'menu' ? (
        <div className={s.card}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 22 }}>{tr('리듬 천국 재즈 스튜디오', 'Jazz rhythm studio')}</h3>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.86 }}>
              {tr(
                '리듬게임천국 스타일로 동료 연주자의 박수·브라스 신호를 듣고 스윙 포켓에 맞춰 응답해 보세요! 1막만 통과해도 방 도장을 받고, 4막까지 모두 합산해 리더보드 최고 점수가 기록됩니다.',
                'Rhythm Heaven style: listen for your bandmates’ claps and brass cues and answer in the swing pocket! Clear Act 1 to get the room stamp; all four acts add up to your leaderboard best.',
              )}
            </p>
          </div>
          <div className={s.stageGrid}>
            {STAGES.map((st, idx) => (
              <button key={st.id} type="button" className={s.stageBtn} onClick={() => launchStage(idx)}>
                <div className={s.stageBtnTitle}>
                  <span>{en ? st.titleEn : st.title}</span>
                  <span>{stageScores[idx] > 0 ? tr(`${stageScores[idx]}점`, `${stageScores[idx]} pts`) : `${st.bpm} BPM`}</span>
                </div>
                <p className={s.stageBtnSub}>{en ? st.subtitleEn : st.subtitle}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {phase.k === 'playing' ? (
        <div className={s.arena}>
          <div style={{ textAlign: 'center' }}>
            <strong>{en ? STAGES[phase.stageIndex].titleEn : STAGES[phase.stageIndex].title}</strong>
            <span style={{ marginLeft: 10, fontSize: 13, opacity: 0.8 }}>
              {tr(
                `${STAGES[phase.stageIndex].bpm} BPM · ${STAGES[phase.stageIndex].meter}/4 박자`,
                `${STAGES[phase.stageIndex].bpm} BPM · ${STAGES[phase.stageIndex].meter}/4 time`,
              )}
            </span>
          </div>

          <div className={s.trioStage}>
            <div className={s.ribbonGlow} />
            {[
              { emoji: '🎻', role: tr('콘트라베이스 큐', 'Bass cue'), idx: 0 },
              { emoji: '🎺', role: tr('브라스 큐', 'Brass cue'), idx: 1 },
              { emoji: '🥁', role: tr('내 스윙 스냅!', 'My swing snap!'), idx: 2 },
            ].map((m) => (
              <div
                key={m.idx}
                className={s.musician}
                data-pop={(!eyesClosed || m.idx === 2) && popped[m.idx] ? 'true' : undefined}
                data-me={m.idx === 2 ? 'true' : undefined}
              >
                <div
                  className={s.bubble}
                  data-show={(!eyesClosed || m.idx === 2) && Boolean(cueBubbles[m.idx]) ? 'true' : undefined}
                >
                  {cueBubbles[m.idx] ? cueWord(cueBubbles[m.idx], lang) : '…'}
                </div>
                <div className={s.avatarCircle} aria-hidden="true">{m.emoji}</div>
                <span className={s.roleLabel}>{m.role}</span>
              </div>
            ))}
          </div>

          <div className={s.grooveBarWrap}>
            {!eyesClosed ? (
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{hintText}</div>
            ) : (
              <div style={{ fontSize: 13.5, opacity: 0.78 }}>{tr('귀로만 큐를 듣고 포켓을 짚어 보세요!', 'Listen for the cues by ear and find the pocket!')}</div>
            )}
            <div className={s.needleTrack} aria-label={tr('마이크로 타이밍 게이지', 'Micro-timing gauge')}>
              <div className={s.needleCenter} />
              <div className={s.needleDot} style={{ left: needleLeft }} />
            </div>
            <div className={s.verdictRow} role="status">
              {lastHit ? (
                <>
                  <span className={lastHit.cls}>{tr(...VERDICT_WORDS[lastHit.v])}</span>
                  {lastHit.deltaMs !== 0 ? (
                    <span style={{ fontSize: 13, opacity: 0.8 }}>
                      ({lastHit.deltaMs > 0 ? `+${lastHit.deltaMs}` : lastHit.deltaMs}ms)
                    </span>
                  ) : null}
                  {lastHit.combo >= 2 ? <span>🔥 {lastHit.combo} COMBO</span> : null}
                </>
              ) : (
                <span style={{ fontSize: 13.5, opacity: 0.72 }}>{tr('스페이스바 · J · F 또는 아래 패드를 눌러 응답!', 'Answer with Space · J · F or the pad below!')}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            className={s.hitPad}
            onPointerDown={(e) => {
              e.preventDefault();
              tapHandlerRef.current();
            }}
          >
            {tr(`스윙 스냅! ${ctx.coarse ? '(터치)' : '(Space / J / F)'}`, `Swing snap! ${ctx.coarse ? '(tap)' : '(Space / J / F)'}`)}
          </button>
        </div>
      ) : null}

      {phase.k === 'summary' ? (
        <div className={s.card} style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className={`${s.gradeBadge} ${s[`grade${phase.summary.grade}`]}`}>
            {phase.summary.grade === 'SUPERB'
              ? tr('★ SUPERB · 완벽한 재즈 포켓!', '★ SUPERB · Perfect jazz pocket!')
              : phase.summary.grade === 'OK'
                ? tr('✓ OK · 스윙 통과!', '✓ OK · Swing passed!')
                : tr('다시 도전해 볼까요?', 'Try again?')}
          </span>
          {/* 한국어 제목 줄의 대시는 예전 글자 그대로 둔다. 영어 줄은 가운뎃점 */}
          <h3 style={{ margin: 0 }}>
            {tr(
              `${STAGES[phase.summary.stageIndex].title} — ${phase.summary.points}점`,
              `${STAGES[phase.summary.stageIndex].titleEn} · ${phase.summary.points} pts`,
            )}
          </h3>
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.82 }}>
            {tr(
              `정확도 ${phase.summary.accuracy}% · 최대 콤보 ${phase.summary.maxCombo} · 평균 그루브 편차 ${phase.summary.avgDeltaMs > 0 ? `+${phase.summary.avgDeltaMs}ms(레이드백)` : `${phase.summary.avgDeltaMs}ms`}`,
              `Accuracy ${phase.summary.accuracy}% · Max combo ${phase.summary.maxCombo} · Average groove offset ${phase.summary.avgDeltaMs > 0 ? `+${phase.summary.avgDeltaMs}ms (laid back)` : `${phase.summary.avgDeltaMs}ms`}`,
            )}
          </p>
          <div className={s.statsRow} style={{ width: '100%' }}>
            <div className={s.statBox}><div className={s.statNum}>{phase.summary.pocket}</div><div className={s.statLbl}>POCKET</div></div>
            <div className={s.statBox}><div className={s.statNum}>{phase.summary.good}</div><div className={s.statLbl}>GOOD</div></div>
            <div className={s.statBox}><div className={s.statNum}>{phase.summary.off}</div><div className={s.statLbl}>EARLY/LATE</div></div>
            <div className={s.statBox}><div className={s.statNum}>{phase.summary.miss}</div><div className={s.statLbl}>MISS</div></div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {phase.summary.stageIndex + 1 < STAGES.length ? (
              <button type="button" className="btn btn-roof" onClick={() => launchStage(phase.summary.stageIndex + 1)}>
                {tr(`다음 막 도전 (${STAGES[phase.summary.stageIndex + 1].title})`, `Next act (${STAGES[phase.summary.stageIndex + 1].titleEn})`)}
              </button>
            ) : null}
            <button type="button" className="btn btn-small" onClick={() => launchStage(phase.summary.stageIndex)}>
              {tr('이 막 다시 하기', 'Replay this act')}
            </button>
            <button type="button" className="btn btn-small" onClick={() => setPhase({ k: 'menu' })}>
              {tr('스테이지 고르기', 'Choose an act')}
            </button>
            <button type="button" className="btn btn-pine btn-small" onClick={finishAll}>
              {tr('결과 카드 & 리더보드 등록', 'Result card & leaderboard')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
