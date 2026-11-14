// 재즈 이어 트레이닝(음정·화성·비밥 릭 받아적기) 순수 계산.
// 입문자도 1단계에서 즐겁게 음정을 찾고, 재즈·실용음악 전공자도 2·3단계의 텐션 보이싱(7alt, Maj7#11, m7b5)과
// 3음 비밥 릭 청음에서 진지하게 귀를 시험할 수 있도록 구성한다.

export type EarMode = 'interval' | 'chord' | 'lick';

export type PianoKeySpec = {
  midi: number;
  note: string;
  black: boolean;
  shortcut: string;
  intervalName: string;
  /** 영어 화면의 음정 이름 */
  intervalNameEn: string;
};

// C4(60) ~ D5(74) 15건반
export const PIANO_KEYS: readonly PianoKeySpec[] = [
  { midi: 60, note: 'C4', black: false, shortcut: 'A', intervalName: '완전1도 (Root)', intervalNameEn: 'Perfect unison (Root)' },
  { midi: 61, note: 'Db4', black: true, shortcut: 'W', intervalName: '단2도 (b9)', intervalNameEn: 'Minor 2nd (b9)' },
  { midi: 62, note: 'D4', black: false, shortcut: 'S', intervalName: '장2도 (9th)', intervalNameEn: 'Major 2nd (9th)' },
  { midi: 63, note: 'Eb4', black: true, shortcut: 'E', intervalName: '단3도 (m3 / #9)', intervalNameEn: 'Minor 3rd (m3 / #9)' },
  { midi: 64, note: 'E4', black: false, shortcut: 'D', intervalName: '장3도 (M3)', intervalNameEn: 'Major 3rd (M3)' },
  { midi: 65, note: 'F4', black: false, shortcut: 'F', intervalName: '완전4도 (11th)', intervalNameEn: 'Perfect 4th (11th)' },
  { midi: 66, note: 'Gb4', black: true, shortcut: 'T', intervalName: '증4도/감5도 (#11 / Tritone)', intervalNameEn: 'Aug 4th / dim 5th (#11 / Tritone)' },
  { midi: 67, note: 'G4', black: false, shortcut: 'G', intervalName: '완전5도 (P5)', intervalNameEn: 'Perfect 5th (P5)' },
  { midi: 68, note: 'Ab4', black: true, shortcut: 'Y', intervalName: '단6도 (b13)', intervalNameEn: 'Minor 6th (b13)' },
  { midi: 69, note: 'A4', black: false, shortcut: 'H', intervalName: '장6도 (13th)', intervalNameEn: 'Major 6th (13th)' },
  { midi: 70, note: 'Bb4', black: true, shortcut: 'U', intervalName: '단7도 (m7)', intervalNameEn: 'Minor 7th (m7)' },
  { midi: 71, note: 'B4', black: false, shortcut: 'J', intervalName: '장7도 (Maj7)', intervalNameEn: 'Major 7th (Maj7)' },
  { midi: 72, note: 'C5', black: false, shortcut: 'K', intervalName: '완전8도 (Octave)', intervalNameEn: 'Perfect octave (Octave)' },
  { midi: 73, note: 'Db5', black: true, shortcut: 'O', intervalName: '단9도 (Flat 9)', intervalNameEn: 'Minor 9th (Flat 9)' },
  { midi: 74, note: 'D5', black: false, shortcut: 'L', intervalName: '장9도 (9th)', intervalNameEn: 'Major 9th (9th)' },
];

export type ChordQualityId = 'maj9' | 'min9' | 'dom13' | 'm7b5' | 'alt7' | 'lydMaj7';

export type ChordQualitySpec = {
  id: ChordQualityId;
  label: string;
  symbol: string;
  colorHint: string;
  /** 영어 화면의 이름과 색채 한 줄 */
  labelEn: string;
  colorHintEn: string;
  /** 근음으로부터의 반음 간격(재즈 피아노 보이싱) */
  semitones: readonly number[];
};

export const CHORD_QUALITIES: readonly ChordQualitySpec[] = [
  {
    id: 'maj9',
    label: '메이저 나인',
    symbol: 'Maj9',
    colorHint: '맑고 따뜻한 오후 햇살 같은 해결감 (1-3-5-7-9)',
    labelEn: 'Major nine',
    colorHintEn: 'A clear, warm resolution like afternoon sun (1-3-5-7-9)',
    semitones: [0, 4, 7, 11, 14],
  },
  {
    id: 'min9',
    label: '마이너 나인',
    symbol: 'm9',
    colorHint: '차분하고 도시적인 빌 에반스풍 색채 (1-b3-5-b7-9)',
    labelEn: 'Minor nine',
    colorHintEn: 'A calm, urban Bill Evans-style color (1-b3-5-b7-9)',
    semitones: [0, 3, 7, 10, 14],
  },
  {
    id: 'dom13',
    label: '도미넌트 써틴',
    symbol: '13',
    colorHint: '스윙 블루스의 탱탱한 추진력 (1-3-b7-9-13)',
    labelEn: 'Dominant thirteen',
    colorHintEn: 'The springy drive of swing blues (1-3-b7-9-13)',
    semitones: [0, 4, 10, 14, 21],
  },
  {
    id: 'm7b5',
    label: '하프 디미니시드',
    symbol: 'm7(b5)',
    colorHint: '마이너 투파이브의 애수 어린 긴장감 (1-b3-b5-b7)',
    labelEn: 'Half-diminished',
    colorHintEn: 'The wistful tension of a minor ii-V (1-b3-b5-b7)',
    semitones: [0, 3, 6, 10, 15],
  },
  {
    id: 'alt7',
    label: '얼터드 도미넌트',
    symbol: '7alt',
    colorHint: '트라이톤 위에 #9·b13이 부딪히는 강렬한 재즈 텐션',
    labelEn: 'Altered dominant',
    colorHintEn: 'Intense jazz tension: #9 and b13 clashing over the tritone',
    semitones: [0, 4, 10, 15, 20],
  },
  {
    id: 'lydMaj7',
    label: '리디안 메이저',
    symbol: 'Maj7(#11)',
    colorHint: '밤하늘로 떠오르는 듯한 신비로운 #11 사운드',
    labelEn: 'Lydian major',
    colorHintEn: 'A mysterious #11 sound that floats up into the night sky',
    semitones: [0, 4, 7, 11, 18],
  },
];

export type IntervalQuestion = {
  mode: 'interval';
  rootMidi: number;
  targetMidi: number;
  intervalLabel: string;
  /** 영어 화면의 음정 이름(예: 「E4 · Major 3rd (M3)」) */
  intervalLabelEn: string;
};

export type ChordQuestion = {
  mode: 'chord';
  rootMidi: number;
  quality: ChordQualitySpec;
  voicing: number[];
};

export type LickQuestion = {
  mode: 'lick';
  rootMidi: number;
  notes: [number, number, number];
  title: string;
  titleEn: string;
};

export type EarQuestion = IntervalQuestion | ChordQuestion | LickQuestion;

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

const INTERVAL_POOL = [62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 74];

export const BEBOP_LICKS: ReadonlyArray<{ notes: [number, number, number]; title: string; titleEn: string }> = [
  { notes: [60, 64, 67], title: '메이저 트라이어드 도약 (1-3-5)', titleEn: 'Major triad leap (1-3-5)' },
  { notes: [62, 65, 69], title: '도리안 마이너 셀 (2-4-6)', titleEn: 'Dorian minor cell (2-4-6)' },
  { notes: [67, 66, 64], title: '블루노트 크로매틱 어프로치 (5-#4-3)', titleEn: 'Blue-note chromatic approach (5-#4-3)' },
  { notes: [64, 67, 71], title: '루트리스 메이저 세븐 (3-5-7)', titleEn: 'Rootless major seventh (3-5-7)' },
  { notes: [70, 69, 67], title: '믹솔리디안 하행 라인 (b7-6-5)', titleEn: 'Mixolydian descending line (b7-6-5)' },
  { notes: [60, 63, 66], title: '디미니시드 트라이톤 모티프 (1-b3-b5)', titleEn: 'Diminished tritone motif (1-b3-b5)' },
  { notes: [64, 66, 69], title: '리디안 어퍼 스트럭처 (3-#11-6)', titleEn: 'Lydian upper structure (3-#11-6)' },
  { notes: [72, 70, 67], title: '펜타토닉 소울 드롭 (8-b7-5)', titleEn: 'Pentatonic soul drop (8-b7-5)' },
];

export function generateEarDeck(mode: EarMode, seed: number, count = 5): EarQuestion[] {
  const r = rng((seed + (mode === 'interval' ? 101 : mode === 'chord' ? 202 : 303)) >>> 0);
  const out: EarQuestion[] = [];
  let prevKey = '';

  for (let i = 0; i < count; i++) {
    if (mode === 'interval') {
      let target = INTERVAL_POOL[Math.floor(r() * INTERVAL_POOL.length)];
      if (String(target) === prevKey) {
        target = INTERVAL_POOL[(INTERVAL_POOL.indexOf(target) + 3) % INTERVAL_POOL.length];
      }
      prevKey = String(target);
      const spec = PIANO_KEYS.find((k) => k.midi === target) ?? PIANO_KEYS[4];
      out.push({
        mode: 'interval',
        rootMidi: 60,
        targetMidi: target,
        intervalLabel: `${spec.note} · ${spec.intervalName}`,
        intervalLabelEn: `${spec.note} · ${spec.intervalNameEn}`,
      });
    } else if (mode === 'chord') {
      const roots = [53, 55, 57, 58, 60]; // F3, G3, A3, Bb3, C4
      const rootMidi = roots[Math.floor(r() * roots.length)];
      let qIdx = Math.floor(r() * CHORD_QUALITIES.length);
      if (CHORD_QUALITIES[qIdx].id === prevKey) qIdx = (qIdx + 1) % CHORD_QUALITIES.length;
      const quality = CHORD_QUALITIES[qIdx];
      prevKey = quality.id;
      out.push({
        mode: 'chord',
        rootMidi,
        quality,
        voicing: quality.semitones.map((s) => rootMidi + s),
      });
    } else {
      let lIdx = Math.floor(r() * BEBOP_LICKS.length);
      if (String(lIdx) === prevKey) lIdx = (lIdx + 1) % BEBOP_LICKS.length;
      prevKey = String(lIdx);
      const lick = BEBOP_LICKS[lIdx];
      out.push({
        mode: 'lick',
        rootMidi: 60,
        notes: [...lick.notes] as [number, number, number],
        title: lick.title,
        titleEn: lick.titleEn,
      });
    }
  }
  return out;
}

export function scoreEarAnswer(opts: {
  mode: EarMode;
  triesUsed: number;
  usedHint: boolean;
  streak: number;
}): number {
  const base = opts.mode === 'interval' ? 120 : opts.mode === 'chord' ? 160 : 180;
  const penalty = opts.triesUsed * 35 + (opts.usedHint ? 25 : 0);
  const raw = Math.max(30, base - penalty);
  const streakBonus = Math.min(50, opts.streak * 10);
  return raw + streakBonus;
}
