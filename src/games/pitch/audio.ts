// 재즈 이어 트레이닝용 따뜻한 FM 일렉트릭 피아노(Rhodes) & 어쿠스틱 배음 합성기.
import { openAudioContext } from '../audio-session';

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export type PitchAudio = {
  playNote(midi: number, dur?: number, delay?: number, vel?: number): void;
  playCadenceAndTarget(rootMidi: number, targetMidi: number): void;
  playChord(voicing: readonly number[], arpeggio?: boolean): void;
  playLick(rootMidi: number, notes: readonly number[]): void;
  setMuted(muted: boolean): void;
  close(): void;
};

export function createPitchAudio(muted = false): PitchAudio | null {
  const ctx = openAudioContext({ latencyHint: 'interactive' });
  if (!ctx) return null;
  if (ctx.state === 'suspended') void ctx.resume();

  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  const playNote = (midi: number, dur = 0.85, delay = 0, vel = 0.72) => {
    const t = ctx.currentTime + Math.max(0, delay);
    const f = mtof(midi);

    // Rhodes-style carrier + soft bell tine modulator
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(f, t);

    const warmth = ctx.createOscillator();
    warmth.type = 'triangle';
    warmth.frequency.setValueAtTime(f * 2, t);

    const tine = ctx.createOscillator();
    tine.type = 'sine';
    tine.frequency.setValueAtTime(f * 4, t);

    const gMain = ctx.createGain();
    gMain.gain.setValueAtTime(0.0001, t);
    gMain.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.01);
    gMain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const gWarm = ctx.createGain();
    gWarm.gain.setValueAtTime(0.0001, t);
    gWarm.gain.exponentialRampToValueAtTime(0.11 * vel, t + 0.008);
    gWarm.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.65);

    const gTine = ctx.createGain();
    gTine.gain.setValueAtTime(0.0001, t);
    gTine.gain.exponentialRampToValueAtTime(0.045 * vel, t + 0.004);
    gTine.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.18, dur * 0.3));

    carrier.connect(gMain).connect(master);
    warmth.connect(gWarm).connect(master);
    tine.connect(gTine).connect(master);

    carrier.start(t);
    warmth.start(t);
    tine.start(t);
    carrier.stop(t + dur + 0.04);
    warmth.stop(t + dur + 0.04);
    tine.stop(t + dur + 0.04);
  };

  return {
    playNote,
    playCadenceAndTarget(rootMidi: number, targetMidi: number) {
      // 기준 으뜸음(C4) → 목표 음
      playNote(rootMidi - 12, 0.9, 0, 0.52);
      playNote(rootMidi, 0.55, 0, 0.72);
      playNote(targetMidi, 1.05, 0.58, 0.85);
    },
    playChord(voicing: readonly number[], arpeggio = false) {
      voicing.forEach((m, idx) => {
        const delay = arpeggio ? idx * 0.22 : idx * 0.022;
        playNote(m, arpeggio ? 1.15 : 1.45, delay, idx === 0 ? 0.68 : 0.58);
      });
    },
    playLick(rootMidi: number, notes: readonly number[]) {
      // 짧은 베이스 기준음 뒤 스윙 3음 릭 연주
      playNote(rootMidi - 12, 0.5, 0, 0.55);
      notes.forEach((m, idx) => {
        const swingGap = idx === 0 ? 0.42 : idx === 1 ? 0.42 + 0.34 : 0.42 + 0.34 + 0.28;
        playNote(m, 0.52, swingGap, 0.82);
      });
    },
    setMuted(m: boolean) {
      master.gain.setValueAtTime(m ? 0 : 0.85, ctx.currentTime);
    },
    close() {
      void ctx.close().catch(() => {});
    },
  };
}
