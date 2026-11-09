// 소리는 모두 Web Audio로 그 자리에서 만든다(음원 파일 없음). 첫 소리는 누르는 동작 뒤에 켠다.
export type SoundName = 'throw' | 'pop' | 'gold' | 'duck' | 'can' | 'board' | 'miss' | 'bump' | 'tick' | 'count' | 'go' | 'clear' | 'end';

export type Sound = {
  /** 사용자 동작 안에서 부른다(AudioContext를 만들거나 깨운다) */
  unlock(): void;
  play(name: SoundName, opt?: { streak?: number; ring?: number }): void;
  muted(): boolean;
  setMuted(m: boolean): void;
  close(): void;
};

type Ctor = typeof AudioContext;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export function createSound(initialMuted: boolean): Sound {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let mute = initialMuted;

  const tone = (f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0) => {
    if (!ac || !master) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  const noise = (dur: number, kind: BiquadFilterType, f0: number, f1: number, gain: number, delay = 0, q = 0.8) => {
    if (!ac || !master || !noiseBuf) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ac.createBiquadFilter();
    filt.type = kind;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  };

  const sounds: Record<SoundName, (o: { streak?: number; ring?: number }) => void> = {
    throw: () => noise(0.14, 'bandpass', 700, 2600, 0.16, 0, 1.2),
    // 톡: 짧고 밝은 바람 빠짐 + 아래로 떨어지는 음
    pop: () => {
      noise(0.05, 'highpass', 2400, 1600, 0.5);
      tone(980, 190, 0.08, 'sine', 0.32);
    },
    gold: () => {
      sounds.pop({});
      tone(1320, 1320, 0.18, 'triangle', 0.12, 0.05);
      tone(1760, 1760, 0.22, 'triangle', 0.1, 0.11);
    },
    // 꽥: 올라갔다 내려오는 고무 오리 소리
    duck: () => {
      tone(620, 1040, 0.07, 'square', 0.07);
      tone(1040, 560, 0.12, 'square', 0.06, 0.07);
    },
    can: () => {
      for (const [f, g] of [[523, 0.12], [1187, 0.08], [1873, 0.06], [2650, 0.04]] as const) tone(f, f * 0.98, 0.28, 'square', g * 0.6);
      noise(0.04, 'highpass', 3200, 3000, 0.25);
    },
    board: (o) => {
      tone(170 + (2 - (o.ring ?? 2)) * 30, 85, 0.16, 'sine', 0.5);
      noise(0.06, 'lowpass', 900, 300, 0.3);
    },
    miss: () => noise(0.09, 'lowpass', 700, 250, 0.16),
    bump: () => noise(0.05, 'lowpass', 380, 200, 0.1),
    tick: () => tone(880, 880, 0.06, 'sine', 0.14),
    count: () => tone(660, 660, 0.12, 'triangle', 0.16),
    go: () => {
      tone(1046, 1046, 0.1, 'triangle', 0.16);
      tone(1568, 1568, 0.22, 'triangle', 0.14, 0.09);
    },
    clear: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.13, i * 0.09)),
    end: () => [784, 659, 523].forEach((f, i) => tone(f, f, 0.24, 'triangle', 0.14, i * 0.14)),
  };

  return {
    unlock() {
      try {
        if (!ac) {
          const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
          if (!C) return;
          ac = new C();
          master = ac.createGain();
          master.gain.value = 0.55;
          master.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === 'suspended') void ac.resume();
      } catch {
        ac = null;
      }
    },
    play(name, o = {}) {
      if (mute || !ac || ac.state !== 'running') return;
      try {
        sounds[name](o);
        // 연달아 맞히면 맞힐 때마다 한 음씩 올라가는 딩
        if (o.streak && o.streak >= 2) {
          const n = PENTA[Math.min(o.streak - 2, PENTA.length - 1)];
          tone(784 * 2 ** (n / 12), 784 * 2 ** (n / 12), 0.16, 'triangle', 0.1, 0.06);
        }
      } catch {
        /* 소리가 안 나도 놀이는 된다 */
      }
    },
    muted: () => mute,
    setMuted(m) {
      mute = m;
    },
    close() {
      const a = ac;
      ac = null;
      master = null;
      noiseBuf = null;
      if (a) void a.close().catch(() => {});
    },
  };
}
