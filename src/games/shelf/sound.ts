// 선반 소리. Web Audio로 그 자리에서 합성한다(음원 파일 없음). AudioContext는 첫 사용자 동작 때 만든다.
export type ShelfSound = 'pick' | 'place' | 'remove' | 'done';

/** 칸마다 한 음(위 단이 높다): C 장조 5음 음계 */
const STEPS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

export type Sound = { play: (k: ShelfSound, slot?: number) => void; setMuted: (m: boolean) => void; close: () => void };

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let muted = false;
  const ensure = (): AudioContext | null => {
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
  };
  // 실로폰 비슷하게: 기본음 + 빨리 사라지는 4배 부분음
  const bar = (c: AudioContext, f: number, at: number, gain: number, dur = 0.5) => {
    for (const [r, a, d] of [[1, 1, dur], [4, 0.25, 0.08]] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(f * r, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain * a, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(g).connect(c.destination);
      o.start(at);
      o.stop(at + d + 0.03);
    }
  };
  const slide = (c: AudioContext, f0: number, f1: number, at: number, dur: number, gain: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  };
  return {
    play(k, slot = 0) {
      const c = ensure();
      if (!c) return;
      const t = c.currentTime + 0.005;
      if (k === 'pick') slide(c, 700, 1050, t, 0.09, 0.12);
      else if (k === 'remove') slide(c, 620, 380, t, 0.14, 0.12);
      else if (k === 'place') {
        const row = Math.floor(slot / 4);
        const col = slot % 4;
        bar(c, STEPS[Math.min(STEPS.length - 1, (2 - row) * 2 + Math.floor(col / 2))], t, 0.2);
      } else for (let i = 0; i < 5; i++) bar(c, STEPS[i * 2 > 7 ? 7 : i * 2] ?? 1046.5, t + i * 0.09, 0.16, 0.6);
    },
    setMuted(m) {
      muted = m;
    },
    close() {
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
