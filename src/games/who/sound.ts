// 누구의 문장일까 소리. Web Audio로 그 자리에서 합성한다(음원 파일 없음). AudioContext는 첫 사용자 동작(시작) 때 연다.
// iOS 무음 스위치와 상관없이 들리게 재생 세션으로 연다(../audio-session).
import { openAudioContext } from '../audio-session';

export type WhoSound = 'open' | 'rise' | 'right' | 'wrong' | 'end';
export type Sound = { play: (k: WhoSound) => void; setMuted: (m: boolean) => void; close: () => void };

export function createSound(initialMuted: boolean): Sound {
  let ctx: AudioContext | null = null;
  let muted = initialMuted;

  const ensure = (): AudioContext | null => {
    if (muted) return null;
    if (!ctx) ctx = openAudioContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };
  const tone = (c: AudioContext, f: number, at: number, dur: number, gain: number, type: OscillatorType = 'triangle', f1 = f) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  // 막이 걷히는 소리: 잦아드는 잡음을 낮은 쪽으로 거른다
  const swish = (c: AudioContext, at: number) => {
    const len = Math.floor(c.sampleRate * 0.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, at);
    lp.frequency.exponentialRampToValueAtTime(400, at + 0.5);
    const g = c.createGain();
    g.gain.value = 0.12;
    src.connect(lp).connect(g).connect(c.destination);
    src.start(at);
  };

  return {
    play(k) {
      const c = ensure();
      if (!c) return;
      try {
        const t = c.currentTime + 0.01;
        if (k === 'open') swish(c, t);
        else if (k === 'rise') tone(c, 392, t, 0.18, 0.06, 'sine', 523);
        else if (k === 'right') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.08, 0.28, 0.12));
        else if (k === 'wrong') [330, 262].forEach((f, i) => tone(c, f, t + i * 0.13, 0.22, 0.07, 'sine'));
        else [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.1, 0.4, 0.1));
      } catch {
        /* 소리가 안 나도 놀이는 된다 */
      }
    },
    setMuted(m) {
      muted = m;
    },
    close() {
      const c = ctx;
      ctx = null;
      void c?.close().catch(() => {});
    },
  };
}
