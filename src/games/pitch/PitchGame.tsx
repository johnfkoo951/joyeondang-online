import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import type { GameContext } from '../types';
import { createPitchAudio, type PitchAudio } from './audio';
import {
  CHORD_QUALITIES,
  PIANO_KEYS,
  generateEarDeck,
  scoreEarAnswer,
  type ChordQualityId,
  type EarMode,
  type EarQuestion,
} from './logic';
import s from './pitch.module.css';

/** 단계 이름·딱지·설명(한국어). 영어는 같은 열쇠의 MODE_LABELS_EN */
const MODE_LABELS: Record<EarMode, { title: string; badge: string; desc: string }> = {
  interval: {
    title: '1단계 · 상대음감 & 재즈 음정',
    badge: '입문~중급',
    desc: '기준음(C4) 뒤에 울리는 음을 듣고, 건반에서 같은 음정 자리를 찾아 눌러요.',
  },
  chord: {
    title: '2단계 · 재즈 세븐스 & 텐션 보이싱',
    badge: '전공자 추천',
    desc: 'Maj9 · m9 · 13 · m7(b5) · 7alt · Maj7(#11) 여섯 가지 재즈 피아노 보이싱 색채를 구별해요.',
  },
  lick: {
    title: '3단계 · 비밥 3음 릭 받아적기',
    badge: '마스터 청음',
    desc: '베이스 기준음 위에서 연주되는 세 음짜리 재즈 모티프를 듣고 건반으로 그대로 받아 쳐요.',
  },
};
const MODE_LABELS_EN: Record<EarMode, { title: string; badge: string; desc: string }> = {
  interval: {
    title: 'Level 1 · Relative pitch & jazz intervals',
    badge: 'Beginner to intermediate',
    desc: 'Listen to the note after the reference note (C4), then find the same interval on the keyboard.',
  },
  chord: {
    title: 'Level 2 · Jazz sevenths & tension voicings',
    badge: 'For music majors',
    desc: 'Tell apart six jazz piano voicing colors: Maj9 · m9 · 13 · m7(b5) · 7alt · Maj7(#11).',
  },
  lick: {
    title: 'Level 3 · Copy three-note bebop licks',
    badge: 'Master ear',
    desc: 'Hear a three-note jazz motif over a bass reference note, then play it back on the keys.',
  },
};

/** 알림 한 줄: 두 말을 함께 두고 보일 때 고른다(놀이 중에 화면 말이 바뀌어도 맞게) */
type Feedback = { ko: string; en: string; ok: boolean };

export function PitchGame({ ctx }: { ctx: GameContext }) {
  const [mode, setMode] = useState<EarMode>('interval');
  const [muted, setMuted] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [tries, setTries] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [streak, setStreak] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [activeMidi, setActiveMidi] = useState<number | null>(null);
  const [correctMidi, setCorrectMidi] = useState<number | null>(null);
  const [lickInput, setLickInput] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const lang = useLang();
  const tr = useTr();
  const labels = lang === 'en' ? MODE_LABELS_EN : MODE_LABELS;

  const audioRef = useRef<PitchAudio | null>(null);
  const startMsRef = useRef<number>(0);

  const deck = useMemo(() => generateEarDeck(mode, ctx.seed, 5), [mode, ctx.seed]);
  const question: EarQuestion | undefined = deck[qIdx];

  useEffect(() => {
    startMsRef.current = performance.now();
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const ensureAudio = (): PitchAudio | null => {
    if (!audioRef.current) {
      audioRef.current = createPitchAudio(muted);
    }
    return audioRef.current;
  };

  const playCurrentQuestion = useCallback((q: EarQuestion | undefined, arpeggio = false) => {
    if (!q) return;
    const eng = ensureAudio();
    if (!eng) return;
    if (q.mode === 'interval') {
      eng.playCadenceAndTarget(q.rootMidi, q.targetMidi);
    } else if (q.mode === 'chord') {
      eng.playChord(q.voicing, arpeggio);
    } else {
      eng.playLick(q.rootMidi, q.notes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  const reportProgress = useCallback(
    (nextScore: number, nextSolved: number) => {
      if (nextSolved >= 3) {
        ctx.report?.({
          cleared: true,
          score: nextScore,
          ms: Math.max(1000, Math.round(performance.now() - startMsRef.current)),
          detail: { solved: nextSolved, mode },
        });
      }
    },
    [ctx, mode],
  );

  const advanceNext = (earned: number) => {
    const nextScore = totalScore + earned;
    const nextSolved = solvedCount + 1;
    setTotalScore(nextScore);
    setSolvedCount(nextSolved);
    reportProgress(nextScore, nextSolved);

    window.setTimeout(() => {
      setCorrectMidi(null);
      setLickInput([]);
      setTries(0);
      setUsedHint(false);
      if (qIdx + 1 < deck.length) {
        const nextQ = deck[qIdx + 1];
        setQIdx(qIdx + 1);
        setFeedback(null);
        playCurrentQuestion(nextQ, false);
      } else {
        setFeedback({
          ko: `이 단계 5문제를 모두 마쳤어요! 다른 단계에 도전하거나 점수를 마감해 보세요.`,
          en: 'You finished all 5 questions in this level! Try another level, or finish to post your score.',
          ok: true,
        });
      }
    }, 820);
  };

  const pressPianoKey = useCallback(
    (midi: number) => {
      const eng = ensureAudio();
      eng?.playNote(midi, 0.72, 0, 0.8);
      setActiveMidi(midi);
      window.setTimeout(() => setActiveMidi((cur) => (cur === midi ? null : cur)), 180);

      if (!question || correctMidi !== null) return;

      if (question.mode === 'interval') {
        if (midi === question.targetMidi) {
          const pts = scoreEarAnswer({ mode: 'interval', triesUsed: tries, usedHint, streak });
          setCorrectMidi(midi);
          setStreak((st) => st + 1);
          setFeedback({ ko: `정답! ${question.intervalLabel} (+${pts}점)`, en: `Correct! ${question.intervalLabelEn} (+${pts} pts)`, ok: true });
          advanceNext(pts);
        } else {
          setTries((t) => t + 1);
          setStreak(0);
          const higher = midi < question.targetMidi;
          const diff = higher ? '조금 더 높은 음이에요 ↑' : '조금 더 낮은 음이에요 ↓';
          setFeedback({ ko: `아직 아니에요 — ${diff}`, en: `Not yet: ${higher ? 'a little higher ↑' : 'a little lower ↓'}`, ok: false });
        }
      } else if (question.mode === 'lick') {
        const nextArr = [...lickInput, midi];
        const idx = nextArr.length - 1;
        if (question.notes[idx] !== midi) {
          setTries((t) => t + 1);
          setStreak(0);
          setLickInput([]);
          setFeedback({
            ko: `${idx + 1}번째 음이 달라요. 다시 듣고 처음 음부터 쳐 보세요!`,
            en: `Note ${idx + 1} is different. Listen again and play from the first note!`,
            ok: false,
          });
          return;
        }
        setLickInput(nextArr);
        if (nextArr.length === 3) {
          const pts = scoreEarAnswer({ mode: 'lick', triesUsed: tries, usedHint, streak });
          setCorrectMidi(midi);
          setStreak((st) => st + 1);
          setFeedback({ ko: `완벽한 비밥 카피! "${question.title}" (+${pts}점)`, en: `Perfect bebop copy! "${question.titleEn}" (+${pts} pts)`, ok: true });
          advanceNext(pts);
        } else {
          setFeedback({ ko: `좋아요! (${nextArr.length}/3음 일치)`, en: `Nice! (${nextArr.length}/3 notes match)`, ok: true });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, correctMidi, tries, usedHint, streak, lickInput, totalScore, solvedCount, qIdx, deck],
  );

  const pickChordQuality = (id: ChordQualityId) => {
    if (!question || question.mode !== 'chord' || correctMidi !== null) return;
    const eng = ensureAudio();
    if (id === question.quality.id) {
      eng?.playChord(question.voicing, true);
      const pts = scoreEarAnswer({ mode: 'chord', triesUsed: tries, usedHint, streak });
      setCorrectMidi(question.rootMidi);
      setStreak((st) => st + 1);
      setFeedback({
        ko: `정답! ${question.quality.symbol} (${question.quality.label}) +${pts}점`,
        en: `Correct! ${question.quality.symbol} (${question.quality.labelEn}) +${pts} pts`,
        ok: true,
      });
      advanceNext(pts);
    } else {
      setTries((t) => t + 1);
      setStreak(0);
      setFeedback({
        ko: `다른 색채예요 — 아르페지오 힌트로 내성(3도·7도·텐션)을 들어 보세요!`,
        en: 'A different color. Use the arpeggio hint to hear the inner voices (3rd, 7th, tensions)!',
        ok: false,
      });
    }
  };

  useEffect(() => {
    const map = new Map(PIANO_KEYS.map((k) => [k.shortcut.toLowerCase(), k.midi]));
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        playCurrentQuestion(question, false);
        return;
      }
      const m = map.get(e.key.toLowerCase());
      if (m !== undefined) {
        e.preventDefault();
        pressPianoKey(m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressPianoKey, playCurrentQuestion, question]);

  const switchMode = (nextMode: EarMode) => {
    setMode(nextMode);
    setQIdx(0);
    setTries(0);
    setUsedHint(false);
    setLickInput([]);
    setCorrectMidi(null);
    setFeedback(null);
  };

  const finishGame = () => {
    if (solvedCount === 0 && totalScore === 0) {
      ctx.onExit();
      return;
    }
    ctx.onExit({
      cleared: solvedCount >= 3,
      score: totalScore,
      ms: Math.max(1000, Math.round(performance.now() - startMsRef.current)),
      detail: { solved: solvedCount, mode },
    });
  };

  return (
    <div className={s.root} data-theme={ctx.theme}>
      <div className={s.topBar}>
        <div className={s.modeTabs} role="tablist" aria-label={tr('청음 단계 선택', 'Choose an ear-training level')}>
          {(['interval', 'chord', 'lick'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={s.modeTab}
              data-active={mode === m ? 'true' : undefined}
              onClick={() => switchMode(m)}
            >
              {labels[m].title}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>
            {tr(`누적 ${totalScore}점 (${solvedCount}문제 해결)`, `${totalScore} pts (${solvedCount} solved)`)}
          </span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              audioRef.current?.setMuted(next);
            }}
          >
            {muted ? tr('소리 켜기', 'Unmute') : tr('소리 끄기', 'Mute')}
          </button>
          <button type="button" className="btn btn-pine btn-small" onClick={finishGame}>
            {tr('점수 마감 & 리더보드', 'Finish')}
          </button>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.promptRow}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
              {tr(
                `${MODE_LABELS[mode].badge} · 문제 ${qIdx + 1} / ${deck.length} ${streak >= 2 ? `· 🔥 ${streak}연속 정답` : ''}`,
                `${MODE_LABELS_EN[mode].badge} · Question ${qIdx + 1} / ${deck.length} ${streak >= 2 ? `· 🔥 ${streak} in a row` : ''}`,
              )}
            </span>
            <h3 style={{ margin: '4px 0' }}>{labels[mode].title}</h3>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.84 }}>{labels[mode].desc}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-roof"
              onClick={() => playCurrentQuestion(question, false)}
            >
              {tr(`🔊 문제 소리 듣기 ${ctx.coarse ? '' : '(Space)'}`, `🔊 Play the question ${ctx.coarse ? '' : '(Space)'}`)}
            </button>
            {question?.mode === 'chord' ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setUsedHint(true);
                  playCurrentQuestion(question, true);
                }}
              >
                {tr('🎹 아르페지오 펼쳐 듣기(힌트)', '🎹 Hear it as an arpeggio (hint)')}
              </button>
            ) : null}
            {question?.mode === 'interval' ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  ensureAudio()?.playNote(60, 0.8, 0, 0.8);
                }}
              >
                {tr('기준음 C4만 듣기', 'Play only the C4 reference')}
              </button>
            ) : null}
          </div>
        </div>

        {question?.mode === 'lick' ? (
          <div className={s.lickSlots} aria-label={tr('3음 입력 칸', 'Three-note input')}>
            {[0, 1, 2].map((slot) => {
              const m = lickInput[slot];
              const keyInfo = m !== undefined ? PIANO_KEYS.find((k) => k.midi === m) : undefined;
              return (
                <div key={slot} className={s.lickSlot} data-filled={m !== undefined ? 'true' : undefined}>
                  {keyInfo ? keyInfo.note : tr(`${slot + 1}번째 음`, `Note ${slot + 1}`)}
                </div>
              );
            })}
          </div>
        ) : null}

        {question?.mode === 'chord' ? (
          <div className={s.chordGrid}>
            {CHORD_QUALITIES.map((ch) => (
              <button key={ch.id} type="button" className={s.chordBtn} onClick={() => pickChordQuality(ch.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className={s.chordSym}>{ch.symbol}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{lang === 'en' ? ch.labelEn : ch.label}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, opacity: 0.82 }}>{lang === 'en' ? ch.colorHintEn : ch.colorHint}</p>
              </button>
            ))}
          </div>
        ) : null}

        <div className={s.pianoWrap}>
          <div className={s.piano} role="group" aria-label={tr('재즈 로즈 건반 (C4~D5)', 'Jazz Rhodes keyboard (C4 to D5)')}>
            {PIANO_KEYS.map((k) => (
              <button
                key={k.midi}
                type="button"
                className={k.black ? s.blackKey : s.whiteKey}
                data-hit={activeMidi === k.midi ? 'true' : undefined}
                data-correct={correctMidi === k.midi ? 'true' : undefined}
                onPointerDown={(e) => {
                  e.preventDefault();
                  pressPianoKey(k.midi);
                }}
              >
                <span>{k.note}</span>
                {!ctx.coarse ? <span style={{ opacity: 0.6, fontSize: 10 }}>[{k.shortcut}]</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className={s.feedback} role="status">
          {feedback ? (
            <span className={feedback.ok ? s.okText : s.errText}>{tr(feedback.ko, feedback.en)}</span>
          ) : (
            <span style={{ opacity: 0.74 }}>
              {tr(
                '먼저 「문제 소리 듣기」를 누르고 건반이나 화성 카드를 골라 보세요! (3문제 이상 맞히면 도장 획득)',
                'First press “Play the question”, then pick a key or a chord card! (Get 3 or more right for the stamp.)',
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
