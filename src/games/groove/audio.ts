// 리듬 천국 재즈 스튜디오 WebAudio 합성기(음원 파일 없이 실시간 합성).
import { openAudioContext } from '../audio-session';
import type { CueKind, GrooveEvent } from './logic';

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export type GrooveAudio = {
  readonly ctx: AudioContext;
  now(): number;
  triggerCue(ev: GrooveEvent, at: number): void;
  playPlayerSnap(accent: boolean): void;
  setMuted(muted: boolean): void;
  close(): void;
};

export function createGrooveAudio(muted = false): GrooveAudio | null {
  const ctx = openAudioContext({ latencyHint: 'interactive' });
  if (!ctx) return null;
  if (ctx.state === 'suspended') void ctx.resume();

  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3.2;
  master.connect(comp);
  comp.connect(ctx.destination);

  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const playNoise = (at: number, dur: number, freq: number, q: number, peak: number, type: BiquadFilterType = 'bandpass') => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(freq, at);
    flt.Q.setValueAtTime(q, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(flt).connect(g).connect(master);
    src.start(at);
    src.stop(at + dur + 0.02);
  };

  const playTone = (type: OscillatorType, freq: number, at: number, dur: number, peak: number, slideTo?: number) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.03);
  };

  const triggerByKind = (kind: CueKind, at: number, vel: number, midi = 60) => {
    const t = Math.max(ctx.currentTime, at);
    if (kind === 'count') {
      playTone('triangle', vel > 0.8 ? 980 : 740, t, 0.07, 0.35 * vel);
      playNoise(t, 0.03, 2400, 3, 0.2 * vel);
    } else if (kind === 'bass') {
      // 어쿠스틱 콘트라베이스 피치카토
      const f = mtof(midi);
      playTone('triangle', f, t, 0.34, 0.48 * vel, f * 0.992);
      playTone('sine', f * 2, t, 0.14, 0.18 * vel);
    } else if (kind === 'hat') {
      // 2 & 4 하이햇 칙!
      playNoise(t, 0.055, 7600, 2.2, 0.28 * vel, 'highpass');
    } else if (kind === 'clap1' || kind === 'clap2') {
      // 트리오 동료 박수(서로 음색 높낮이를 달리해 눈 감고도 1번·2번 구분 가능)
      const pitch = kind === 'clap1' ? 1350 : 1780;
      playNoise(t, 0.08, pitch, 1.8, 0.55 * vel);
      playTone('triangle', kind === 'clap1' ? 420 : 540, t, 0.06, 0.24 * vel);
    } else if (kind === 'call') {
      // 로즈 일렉트릭 피아노 콜
      const f = mtof(midi);
      playTone('sine', f, t, 0.22, 0.36 * vel);
      playTone('triangle', f * 2, t, 0.09, 0.14 * vel);
    } else if (kind === 'brass') {
      // 재즈 브라스 펀치("밥!")
      const f = mtof(midi);
      for (const semi of [0, 4, 7, 10]) {
        playTone('sawtooth', mtof(midi + semi) * 0.5, t, 0.22, 0.13 * vel);
      }
      playTone('triangle', f, t, 0.2, 0.25 * vel);
    }
  };

  return {
    ctx,
    now: () => ctx.currentTime,
    triggerCue: (ev, at) => triggerByKind(ev.kind, at, ev.vel, ev.midi),
    playPlayerSnap(accent: boolean) {
      const t = ctx.currentTime;
      if (accent) {
        // 스네어 림샷 + 브라스 스파클
        playNoise(t, 0.11, 2200, 1.4, 0.68);
        playTone('triangle', 660, t, 0.14, 0.36, 440);
        playTone('sine', 880, t, 0.16, 0.24);
      } else {
        // 크리스프 핑거 스냅 / 우드블록
        playNoise(t, 0.065, 2600, 2.8, 0.56);
        playTone('triangle', 780, t, 0.065, 0.32, 520);
      }
    },
    setMuted(m: boolean) {
      master.gain.setValueAtTime(m ? 0 : 0.85, ctx.currentTime);
    },
    close() {
      void ctx.close().catch(() => {});
    },
  };
}
