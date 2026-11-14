// 리듬 천국 재즈 스튜디오 순수 계산(DOM·오디오 없음, 단위 시험 대상).
// 리듬게임천국 시리즈의 핵심 문법(오디오 큐 → 정박·엇박·연타 응답, 트리오 박수, 콜앤리스폰스, 5/4 변박, 올스타 리믹스)을
// 재즈 쿼텟 워킹 베이스와 스윙 비율 위에 올린다.

export type CueKind = 'clap1' | 'clap2' | 'call' | 'brass' | 'count' | 'bass' | 'hat';
export type GrooveEvent = {
  /** 사건 시각(초, 시작 기준) */
  t: number;
  kind: CueKind;
  /** 음높이(MIDI) 또는 세기 */
  midi?: number;
  vel: number;
  /** 화면 자막·말풍선 힌트 */
  cueText?: string;
  /** 트리오 캐릭터 번호(0=베이스 동료, 1=혼 동료) */
  actor?: 0 | 1;
};

export type TargetHit = {
  index: number;
  /** 목표 타격 시각(초) */
  t: number;
  /** 'snap' 일반 탭, 'accent' 강박 브라스 스탭 */
  style: 'snap' | 'accent';
  label: string;
};

export type StageSpec = {
  id: 'trio' | 'bebop' | 'odd5' | 'remix';
  title: string;
  subtitle: string;
  /** 영어 화면의 제목·한 줄 */
  titleEn: string;
  subtitleEn: string;
  bpm: number;
  /** 박자표 분자(4 또는 5) */
  meter: 4 | 5;
  swing: number;
  bars: number;
  goodWindow: number;
  okWindow: number;
};

export const STAGES: readonly StageSpec[] = [
  {
    id: 'trio',
    title: '1막 · 스윙 트리오 박수',
    subtitle: '두 동료가 "짝! 짝!" 신호를 주면 세 번째 스윙 포켓에 맞춰 "챱!" 하고 받아 쳐요.',
    titleEn: 'Act 1 · Swing trio claps',
    subtitleEn: 'Two bandmates go "Clap! Clap!", then you answer "Snap!" right in the third swing pocket.',
    bpm: 98,
    meter: 4,
    swing: 0.65,
    bars: 8,
    goodWindow: 0.052,
    okWindow: 0.125,
  },
  {
    id: 'bebop',
    title: '2막 · 비밥 브라스 랠리',
    subtitle: '"두-밥!" 혼 섹션의 엇박 콜을 듣고 바로 다음 박자에 똑같은 리듬으로 응답해요.',
    titleEn: 'Act 2 · Bebop brass rally',
    subtitleEn: 'Hear the horn section’s offbeat "Doo-bop!" call and answer with the same rhythm on the very next beat.',
    bpm: 108,
    meter: 4,
    swing: 0.64,
    bars: 8,
    goodWindow: 0.048,
    okWindow: 0.115,
  },
  {
    id: 'odd5',
    title: '3막 · 5/4 변박 베이스 포켓',
    subtitle: '1-2-3, 1-2! 다섯 박자 재즈 오스티나토 위에서 1박과 4박 클라베 포인트를 정확히 짚어요.',
    titleEn: 'Act 3 · 5/4 bass pocket',
    subtitleEn: '1-2-3, 1-2! Over a five-beat jazz ostinato, hit the clave points on beats 1 and 4.',
    bpm: 114,
    meter: 5,
    swing: 0.60,
    bars: 8,
    goodWindow: 0.046,
    okWindow: 0.112,
  },
  {
    id: 'remix',
    title: '4막 · 올스타 재즈 리믹스',
    subtitle: '트리오 박수, 비밥 연타, 브라스 스탭이 쉴 새 없이 교차하는 피날레 세션!',
    titleEn: 'Act 4 · All-star jazz remix',
    subtitleEn: 'A finale session where trio claps, bebop runs and brass stabs keep trading off!',
    bpm: 120,
    meter: 4,
    swing: 0.63,
    bars: 10,
    goodWindow: 0.045,
    okWindow: 0.110,
  },
];

/**
 * 말풍선·예고에 뜨는 소리 말(cueText, label)의 영어. 판 차리기(buildStageChart)는 한국어를 그대로 쓰고, 화면이 영어면 보일 때 옮긴다.
 * 숫자(카운트 1·2·3…)는 그대로 둔다. tests/unit/i18n-games.test.ts가 모든 판의 소리 말이 여기 있는지 본다.
 */
export const CUE_EN: Readonly<Record<string, string>> = {
  '레디!': 'Ready!',
  '짝!': 'Clap!',
  '챱!': 'Snap!',
  '스윙-': 'Swing-',
  '잇-': 'it-',
  '투-탭': 'Two-tap',
  '간다!': 'Here we go!',
  '두-': 'Doo-',
  '밥!': 'Bop!',
  '들어봐!': 'Listen!',
  '원-투-쓰리': 'One-two-three',
  '원-투!': 'One-two!',
  '포켓!': 'Pocket!',
  '쓰리+투!': 'Three+two!',
  '앤-': 'And-',
  '포!': 'Four!',
  '리믹스': 'Remix',
  '스윙!': 'Swing!',
  '더블!': 'Double!',
  '예!': 'Yeah!',
  '원': 'One',
  '투': 'Two',
  '쓰리': 'Three',
  '포&!': 'Four-and!',
};

/** 지금 말의 소리 말(모르는 말·숫자는 그대로) */
export function cueWord(text: string, lang: 'ko' | 'en'): string {
  return lang === 'en' ? CUE_EN[text] ?? text : text;
}

export type HitVerdict = 'pocket' | 'good' | 'early' | 'late' | 'miss';

export type HitRecord = {
  targetIndex: number;
  verdict: HitVerdict;
  /** 실제 입력 - 목표 시각(ms, 음수면 빠름, 양수면 레이드백) */
  deltaMs: number;
  points: number;
};

export type StageSummary = {
  stageIndex: number;
  pocket: number;
  good: number;
  off: number;
  miss: number;
  maxCombo: number;
  accuracy: number;
  points: number;
  grade: 'SUPERB' | 'OK' | 'TRY_AGAIN';
  passed: boolean;
  avgDeltaMs: number;
};

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALK_BASS_4 = [36, 40, 43, 45, 41, 45, 48, 46, 38, 41, 45, 48, 43, 47, 50, 48];
const WALK_BASS_5 = [38, 45, 48, 41, 43, 38, 45, 50, 43, 40];

/** 박 번호(실수, 0부터)를 스윙 초 시각으로 변환 */
export function beatToSec(beat: number, bpm: number, swing: number): number {
  const spb = 60 / bpm;
  const whole = Math.floor(beat);
  const frac = beat - whole;
  if (Math.abs(frac - 0.5) < 0.02) {
    return (whole + swing) * spb;
  }
  return beat * spb;
}

export function buildStageChart(stageIndex: number, seed: number): {
  spec: StageSpec;
  events: GrooveEvent[];
  targets: TargetHit[];
  totalDuration: number;
} {
  const spec = STAGES[Math.max(0, Math.min(STAGES.length - 1, stageIndex))];
  const r = rng((seed + Math.imul(stageIndex + 1, 7919)) >>> 0);
  const events: GrooveEvent[] = [];
  const targets: TargetHit[] = [];
  const at = (beat: number) => beatToSec(beat, spec.bpm, spec.swing);

  // 1마디 카운트인
  for (let b = 0; b < spec.meter; b++) {
    events.push({
      t: at(b),
      kind: 'count',
      vel: b === 0 ? 0.95 : 0.7,
      cueText: b === spec.meter - 1 ? '레디!' : `${b + 1}`,
    });
  }

  const startBeat = spec.meter;
  const totalBeats = startBeat + spec.bars * spec.meter;

  // 워킹 베이스 + 하이햇 기본 반주
  for (let b = startBeat; b < totalBeats; b++) {
    const barBeat = (b - startBeat) % spec.meter;
    const bassLine = spec.meter === 5 ? WALK_BASS_5 : WALK_BASS_4;
    const midi = bassLine[(b - startBeat) % bassLine.length];
    events.push({ t: at(b), kind: 'bass', midi, vel: barBeat === 0 ? 0.85 : 0.68 });
    if (spec.meter === 4 && (barBeat === 1 || barBeat === 3)) {
      events.push({ t: at(b), kind: 'hat', vel: 0.72 });
    } else if (spec.meter === 5 && (barBeat === 2 || barBeat === 4)) {
      events.push({ t: at(b), kind: 'hat', vel: 0.72 });
    }
  }

  let hitIdx = 0;
  const pushTarget = (beat: number, style: 'snap' | 'accent', label: string) => {
    targets.push({ index: hitIdx++, t: at(beat), style, label });
  };

  if (spec.id === 'trio') {
    // 8마디: 정박 트리오, 빠른 스윙 트리오, 엇박 싱코페이션 트리오 교차
    for (let bar = 0; bar < spec.bars; bar++) {
      const base = startBeat + bar * 4;
      const pattern = bar === 0 ? 0 : bar === spec.bars - 1 ? 2 : Math.floor(r() * 3);
      if (pattern === 0) {
        // 원(짝) - 투(짝) - 쓰리(내 차례!)
        events.push({ t: at(base + 0), kind: 'clap1', vel: 0.85, actor: 0, cueText: '짝!' });
        events.push({ t: at(base + 1), kind: 'clap2', vel: 0.85, actor: 1, cueText: '짝!' });
        pushTarget(base + 2, 'snap', '챱!');
      } else if (pattern === 1) {
        // 스윙 퀵 트리오: 2박(짝) - 2박반(짝) - 3박(내 차례!)
        events.push({ t: at(base + 1.0), kind: 'clap1', vel: 0.88, actor: 0, cueText: '스윙-' });
        events.push({ t: at(base + 1.5), kind: 'clap2', vel: 0.88, actor: 1, cueText: '잇-' });
        pushTarget(base + 2.0, 'accent', '챱!');
      } else {
        // 더블 챱: 1박(짝) - 2박(짝) - 3박 & 3박반(내 더블!)
        events.push({ t: at(base + 0), kind: 'clap1', vel: 0.85, actor: 0, cueText: '투-탭' });
        events.push({ t: at(base + 1), kind: 'clap2', vel: 0.9, actor: 1, cueText: '간다!' });
        pushTarget(base + 2.0, 'snap', '두-');
        pushTarget(base + 2.5, 'accent', '밥!');
      }
    }
  } else if (spec.id === 'bebop') {
    // 2마디 단위 콜앤리스폰스(4쌍 = 8마디)
    for (let pair = 0; pair < 4; pair++) {
      const callBase = startBeat + pair * 8;
      const respBase = callBase + 4;
      const offsets = pair === 0
        ? [0, 1.5, 2.5]
        : pair === 1
          ? [0.5, 1.5, 3.0]
          : pair === 2
            ? [0, 0.5, 2.0, 2.5]
            : [0.5, 1.5, 2.0, 3.5];
      offsets.forEach((off, idx) => {
        events.push({
          t: at(callBase + off),
          kind: idx === offsets.length - 1 ? 'brass' : 'call',
          midi: 60 + ((idx * 3 + pair * 2) % 10),
          vel: 0.86,
          actor: (idx % 2) as 0 | 1,
          cueText: idx === 0 ? '들어봐!' : idx === offsets.length - 1 ? '밥!' : '두-',
        });
        pushTarget(respBase + off, idx === offsets.length - 1 ? 'accent' : 'snap', idx === offsets.length - 1 ? '밥!' : '두-');
      });
    }
  } else if (spec.id === 'odd5') {
    // 5/4 변박(3+2): 1박·2.5박·4박 포켓
    for (let bar = 0; bar < spec.bars; bar++) {
      const base = startBeat + bar * 5;
      if (bar % 2 === 0) {
        events.push({ t: at(base + 0), kind: 'clap1', vel: 0.85, actor: 0, cueText: '원-투-쓰리' });
        events.push({ t: at(base + 3), kind: 'clap2', vel: 0.88, actor: 1, cueText: '원-투!' });
        pushTarget(base + 4, 'accent', '포켓!');
      } else {
        events.push({ t: at(base + 0), kind: 'brass', midi: 62, vel: 0.84, actor: 0, cueText: '쓰리+투!' });
        pushTarget(base + 1.5, 'snap', '앤-');
        pushTarget(base + 3.0, 'accent', '포!');
      }
    }
  } else {
    // 4막 리믹스: 10마디 동안 트리오·브라스·싱코페이션 총출동
    for (let bar = 0; bar < spec.bars; bar++) {
      const base = startBeat + bar * 4;
      const mode = bar % 3;
      if (mode === 0) {
        events.push({ t: at(base + 0.5), kind: 'clap1', vel: 0.88, actor: 0, cueText: '리믹스' });
        events.push({ t: at(base + 1.5), kind: 'clap2', vel: 0.88, actor: 1, cueText: '스윙!' });
        pushTarget(base + 2.5, 'accent', '챱!');
      } else if (mode === 1) {
        events.push({ t: at(base + 0), kind: 'brass', midi: 65, vel: 0.9, actor: 1, cueText: '더블!' });
        pushTarget(base + 1.0, 'snap', '두-');
        pushTarget(base + 1.5, 'accent', '밥!');
        pushTarget(base + 3.0, 'accent', '예!');
      } else {
        events.push({ t: at(base + 0), kind: 'clap1', vel: 0.85, actor: 0, cueText: '원' });
        events.push({ t: at(base + 1), kind: 'clap2', vel: 0.85, actor: 1, cueText: '투' });
        pushTarget(base + 2.0, 'snap', '쓰리');
        pushTarget(base + 3.5, 'accent', '포&!');
      }
    }
  }

  events.sort((a, b) => a.t - b.t);
  const totalDuration = at(totalBeats + 1.5);
  return { spec, events, targets, totalDuration };
}

export function judgeTap(
  tapSec: number,
  targets: readonly TargetHit[],
  taken: ReadonlySet<number>,
  spec: StageSpec,
  coarse = false,
): HitRecord | null {
  const widen = coarse ? 1.22 : 1.0;
  const pocketWin = spec.goodWindow * 0.52 * widen;
  const goodWin = spec.goodWindow * widen;
  const okWin = spec.okWindow * widen;

  let best: TargetHit | null = null;
  let bestAbs = Infinity;
  for (const t of targets) {
    if (taken.has(t.index)) continue;
    const d = Math.abs(tapSec - t.t);
    if (d <= okWin && d < bestAbs) {
      best = t;
      bestAbs = d;
    }
  }
  if (!best) return null;
  const delta = tapSec - best.t;
  const deltaMs = Math.round(delta * 1000);
  if (bestAbs <= pocketWin) {
    return { targetIndex: best.index, verdict: 'pocket', deltaMs, points: 120 };
  }
  if (bestAbs <= goodWin) {
    return { targetIndex: best.index, verdict: 'good', deltaMs, points: 95 };
  }
  return {
    targetIndex: best.index,
    verdict: delta < 0 ? 'early' : 'late',
    deltaMs,
    points: 55,
  };
}

export function summarizeStage(
  stageIndex: number,
  targets: readonly TargetHit[],
  records: ReadonlyMap<number, HitRecord>,
): StageSummary {
  let pocket = 0, good = 0, off = 0, miss = 0;
  let combo = 0, maxCombo = 0, points = 0;
  let deltaSum = 0, deltaN = 0;

  for (const t of targets) {
    const rec = records.get(t.index);
    if (!rec || rec.verdict === 'miss') {
      miss++;
      combo = 0;
      continue;
    }
    deltaSum += rec.deltaMs;
    deltaN++;
    if (rec.verdict === 'pocket') {
      pocket++;
      combo++;
    } else if (rec.verdict === 'good') {
      good++;
      combo++;
    } else {
      off++;
      combo = 0;
    }
    if (combo > maxCombo) maxCombo = combo;
    const comboBonus = Math.min(40, combo * 4);
    points += rec.points + comboBonus;
  }

  const total = Math.max(1, targets.length);
  const weighted = (pocket * 1.0 + good * 0.9 + off * 0.5) / total;
  const accuracy = Math.round(weighted * 100);
  const grade: StageSummary['grade'] = accuracy >= 84 && miss <= 1 ? 'SUPERB' : accuracy >= 58 ? 'OK' : 'TRY_AGAIN';
  return {
    stageIndex,
    pocket,
    good,
    off,
    miss,
    maxCombo,
    accuracy,
    points,
    grade,
    passed: grade !== 'TRY_AGAIN',
    avgDeltaMs: deltaN ? Math.round(deltaSum / deltaN) : 0,
  };
}
