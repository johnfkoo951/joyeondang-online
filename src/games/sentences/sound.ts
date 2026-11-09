// 소리는 Web Audio로 그 자리에서 합성한다(음원 파일 없음). AudioContext는 첫 사용자 동작 때 만든다.
export type SoundKind = 'flip' | 'pick' | 'good' | 'bad' | 'clear' | 'hang';

/** 펜타토닉 위로(퍼즐 조각 번호마다 한 음) */
const STEPS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

export type Sound = {
  play: (kind: SoundKind, step?: number) => void;
  setMuted: (m: boolean) => void;
  close: () => void;
};

export function createSound(initialMuted: boolean): Sound {
  let ctx: AudioContext | null = null;
  let muted = initialMuted;
  let noise: AudioBuffer | null = null;

  function ensure(): AudioContext | null {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function tone(c: AudioContext, freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  function rustle(c: AudioContext, at: number, dur: number, gain: number) {
    if (!noise) {
      noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.4), c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource();
    s.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2400, at);
    f.frequency.exponentialRampToValueAtTime(900, at + dur);
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(at);
    s.stop(at + dur + 0.02);
  }

  return {
    play(kind, step = 0) {
      const c = ensure();
      if (!c) return;
      const t = c.currentTime + 0.01;
      switch (kind) {
        case 'flip':
          rustle(c, t, 0.18, 0.12);
          break;
        case 'pick':
          tone(c, STEPS[Math.max(0, Math.min(STEPS.length - 1, step))], t, 0.32, 0.12, 'triangle');
          break;
        case 'good':
          tone(c, 659.25, t, 0.3, 0.12);
          tone(c, 987.77, t + 0.1, 0.45, 0.1);
          break;
        case 'bad':
          tone(c, 220, t, 0.25, 0.1, 'triangle');
          tone(c, 196, t + 0.12, 0.3, 0.08, 'triangle');
          break;
        case 'clear':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.11, 0.5, 0.1));
          break;
        case 'hang':
          rustle(c, t, 0.12, 0.08);
          tone(c, 1318.5, t + 0.08, 0.2, 0.06, 'square');
          tone(c, 783.99, t + 0.18, 0.6, 0.1);
          break;
      }
    },
    setMuted(m) {
      muted = m;
      if (m && ctx && ctx.state === 'running') void ctx.suspend();
    },
    close() {
      const c = ctx;
      ctx = null;
      if (c) void c.close().catch(() => {});
    },
  };
}
