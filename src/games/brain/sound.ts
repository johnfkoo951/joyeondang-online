// 소리는 Web Audio로 그 자리에서 합성한다(음원 파일 없음). AudioContext는 첫 사용자 동작(play) 때 만든다.
export type SoundKind = 'pick' | 'drawer' | 'good' | 'bad' | 'link' | 'step' | 'clear';

/** 펜타토닉 위로(순서 칸 번호마다 한 음) */
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
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function tone(c: AudioContext, freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', bend = 1) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq * bend, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** 나무 서랍이 닫히는 듯한 짧은 소리: 낮게 거른 잡음 + 낮은 음 */
  function thunk(c: AudioContext, at: number) {
    if (!noise) {
      noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    }
    const s = c.createBufferSource();
    s.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, at);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.35, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    s.connect(f).connect(g).connect(c.destination);
    s.start(at);
    s.stop(at + 0.2);
    tone(c, 150, at, 0.12, 0.25, 'sine', 0.7);
  }

  return {
    play(kind, step = 0) {
      const c = ensure();
      if (!c) return;
      const t = c.currentTime + 0.01;
      switch (kind) {
        case 'pick':
          tone(c, 880, t, 0.06, 0.08, 'triangle');
          break;
        case 'drawer':
          thunk(c, t);
          break;
        case 'good':
          tone(c, 659.25, t, 0.16, 0.14, 'triangle');
          tone(c, 987.77, t + 0.09, 0.24, 0.14, 'triangle');
          break;
        case 'bad':
          tone(c, 330, t, 0.18, 0.1, 'sine', 0.9);
          tone(c, 262, t + 0.12, 0.26, 0.1, 'sine', 0.9);
          break;
        case 'link':
          // 실을 튕기는 소리
          tone(c, 440, t, 0.3, 0.12, 'triangle', 1.02);
          tone(c, 880, t, 0.18, 0.05, 'sine');
          break;
        case 'step':
          tone(c, STEPS[Math.max(0, Math.min(STEPS.length - 1, step))], t, 0.22, 0.12, 'triangle');
          break;
        case 'clear':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.11, 0.4, 0.12, 'triangle'));
          break;
      }
    },
    setMuted(m) {
      muted = m;
    },
    close() {
      const c = ctx;
      ctx = null;
      if (c) void c.close().catch(() => {});
    },
  };
}
