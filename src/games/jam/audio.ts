// 박공 아래 잼의 소리. Web Audio로 그 자리에서 합성한다(음원 파일 없음).
// 스케줄러는 앞질러 보기(lookahead) 방식: 25ms마다 깨어나 0.15초 앞까지의 사건을 오디오 시계 시각에 예약한다.
// setInterval이 늦게 깨어나도 소리는 예약한 오디오 시각에 정확히 나고, 판정도 같은 오디오 시계로 한다.
import { eventsBetween, type ClockStamp, type Ev, type Inst } from './logic';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export type Engine = {
  readonly ctx: AudioContext;
  /** 지금 귀에 들리는 오디오 시각과 그때의 performance 시각(출력 지연 포함) */
  stamp(): ClockStamp;
  voice(i: Inst, at: number, v: number, n?: number[], d?: number, out?: AudioNode): void;
  /** 내 북(지금 바로) */
  hit(v?: number): void;
  /** 격자 칸을 눌렀을 때 그 음 하나 */
  preview(midi: number): void;
  /** 스케줄러 하나가 쓰는 새 묶음(멈출 때 한꺼번에 줄인다) */
  bus(): GainNode;
  setMuted(m: boolean): void;
  close(): void;
};

export function createEngine(muted: boolean): Engine | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.85;
  master.connect(comp);
  // 작은 방 울림: 잦아드는 잡음으로 만든 충격 응답
  const verb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.3);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  master.connect(verb).connect(wet).connect(comp);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const env = (g: GainNode, at: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  };
  const osc = (type: OscillatorType, f: number, at: number, stop: number, out: AudioNode) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    o.connect(out);
    o.start(at);
    o.stop(stop);
    return o;
  };
  const noiseHit = (at: number, dur: number, out: AudioNode, filter: BiquadFilterType, f: number, q = 0.7) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const fl = ctx.createBiquadFilter();
    fl.type = filter;
    fl.frequency.value = f;
    fl.Q.value = q;
    s.connect(fl).connect(out);
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur);
    return fl;
  };

  const kick = (at: number, v: number, out: AudioNode) => {
    const g = ctx.createGain();
    env(g, at, v * 0.9, 0.004, 0.3);
    g.connect(out);
    const o = osc('sine', 110, at, at + 0.36, g);
    o.frequency.exponentialRampToValueAtTime(46, at + 0.12);
  };
  const hat = (at: number, v: number, out: AudioNode) => {
    const g = ctx.createGain();
    env(g, at, v * 0.22, 0.002, 0.05);
    g.connect(out);
    noiseHit(at, 0.08, g, 'highpass', 7200);
  };
  const ride = (at: number, v: number, out: AudioNode) => {
    // 808식 금속음(사각파 여섯 개를 높은 대역만 남김) + 옅은 잡음
    const g = ctx.createGain();
    env(g, at, v * 0.07, 0.002, 0.9);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 9000;
    bp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    bp.connect(hp).connect(g).connect(out);
    for (const r of [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523]) osc('square', 520 * r, at, at + 1, bp);
    const ng = ctx.createGain();
    env(ng, at, v * 0.05, 0.002, 0.25);
    ng.connect(out);
    noiseHit(at, 0.3, ng, 'highpass', 9000);
  };
  const click = (at: number, v: number, out: AudioNode) => {
    const g = ctx.createGain();
    env(g, at, v * 0.32, 0.002, 0.04);
    g.connect(out);
    osc('sine', v > 0.8 ? 1900 : 1500, at, at + 0.06, g);
  };
  const tom = (at: number, v: number, out: AudioNode, pitch = 1) => {
    // 「북」: 내려앉는 사인파 몸통 + 짧은 채 소리
    const g = ctx.createGain();
    env(g, at, v * 0.75, 0.003, 0.34);
    g.connect(out);
    const o = osc('sine', 200 * pitch, at, at + 0.4, g);
    o.frequency.exponentialRampToValueAtTime(118 * pitch, at + 0.2);
    const g2 = ctx.createGain();
    env(g2, at, v * 0.18, 0.002, 0.12);
    g2.connect(out);
    const o2 = osc('triangle', 410 * pitch, at, at + 0.16, g2);
    o2.frequency.exponentialRampToValueAtTime(250 * pitch, at + 0.1);
    const gn = ctx.createGain();
    env(gn, at, v * 0.2, 0.001, 0.025);
    gn.connect(out);
    noiseHit(at, 0.04, gn, 'bandpass', 1400, 1.2);
  };
  const piano = (at: number, v: number, notes: number[], d: number, out: AudioNode) => {
    // 부드러운 FM 전기 피아노: 1:1 변조(잦아드는 변조 지수) + 높은 비율의 짧은 금속 어택
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.connect(out);
    const each = (v * 0.2) / Math.sqrt(Math.max(1, notes.length));
    const stop = at + d + 0.35;
    for (const m of notes) {
      const f = mtof(m) * (1 + (Math.random() - 0.5) * 0.002);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(each, at + 0.006);
      g.gain.exponentialRampToValueAtTime(each * 0.35, at + Math.max(0.05, d));
      g.gain.exponentialRampToValueAtTime(0.0001, stop);
      g.connect(lp);
      const car = osc('sine', f, at, stop, g);
      const mi = ctx.createGain();
      mi.gain.setValueAtTime(f * 1.5, at);
      mi.gain.exponentialRampToValueAtTime(f * 0.2, at + 0.9);
      osc('sine', f, at, stop, mi);
      mi.connect(car.frequency);
      const ti = ctx.createGain();
      ti.gain.setValueAtTime(f * 0.5, at);
      ti.gain.exponentialRampToValueAtTime(0.01, at + 0.07);
      osc('sine', f * 14, at, at + 0.1, ti);
      ti.connect(car.frequency);
    }
  };
  const bass = (at: number, v: number, m: number, d: number, out: AudioNode) => {
    // 콘트라베이스 비슷하게: 삼각파+사인파를 낮게 거르고, 퉁기는 어택에 아주 살짝 음높이가 내려앉음
    const f = mtof(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, at);
    lp.frequency.exponentialRampToValueAtTime(420, at + 0.25);
    const g = ctx.createGain();
    const end = at + d + 0.08;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v * 0.55, at + 0.007);
    g.gain.exponentialRampToValueAtTime(v * 0.24, at + Math.min(0.3, d));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(g).connect(out);
    for (const type of ['triangle', 'sine'] as const) {
      const o = osc(type, f * 1.015, at, end + 0.02, lp);
      o.frequency.exponentialRampToValueAtTime(f, at + 0.04);
    }
  };
  const vibe = (at: number, v: number, m: number, d: number, out: AudioNode) => {
    // 비브라폰 비슷한 가산 합성: 1·4·10배 부분음, 높을수록 빨리 사라짐
    const f = mtof(m);
    const ring = Math.max(0.4, d + 0.6);
    for (const [r, a, dec] of [[1, 1, ring], [3.98, 0.22, 0.32], [9.9, 0.06, 0.1]] as const) {
      const g = ctx.createGain();
      env(g, at, v * 0.2 * a, 0.003, dec);
      g.connect(out);
      osc('sine', f * r, at, at + dec + 0.05, g);
    }
  };

  const engine: Engine = {
    ctx,
    stamp() {
      const now = performance.now();
      const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
      if (ts && ts.contextTime && ts.performanceTime && ts.contextTime > 0 && Math.abs(now - ts.performanceTime) < 500) {
        return { contextTime: ts.contextTime, performanceTime: ts.performanceTime };
      }
      const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      return { contextTime: ctx.currentTime - lat, performanceTime: now };
    },
    voice(i, at, v, n, d = 0.3, out = master) {
      if (at < ctx.currentTime - 0.05) return; // 너무 늦게 깨었으면 몰아서 치지 않고 건너뛴다
      const t = Math.max(at, ctx.currentTime);
      if (i === 'kick') kick(t, v, out);
      else if (i === 'hat') hat(t, v, out);
      else if (i === 'ride') ride(t, v, out);
      else if (i === 'click') click(t, v, out);
      else if (i === 'tom') tom(t, v, out);
      else if (i === 'piano') piano(t, v, n ?? [], d, out);
      else if (i === 'bass') for (const m of n ?? []) bass(t, v, m, d, out);
      else if (i === 'vibe') for (const m of n ?? []) vibe(t, v, m, d, out);
    },
    hit(v = 0.9) {
      if (ctx.state === 'suspended') void ctx.resume();
      tom(ctx.currentTime + 0.003, v, master, 1.12);
    },
    preview(m) {
      if (ctx.state === 'suspended') void ctx.resume();
      vibe(ctx.currentTime + 0.003, 0.75, m, 0.3, master);
    },
    bus() {
      const g = ctx.createGain();
      g.connect(master);
      return g;
    },
    setMuted(m) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.02);
    },
    close() {
      void ctx.close().catch(() => {});
    },
  };
  return engine;
}

export type Transport = {
  /** 사건표를 lead초 뒤부터 예약해 나간다. loop가 있으면 그 길이마다 되풀이. 돌려주는 값 = 시작 오디오 시각 */
  start(events: readonly Ev[], loop: number | null, lead?: number): number;
  /** 되풀이하는 중에 사건표만 바꾼다(아직 예약하지 않은 부분부터 들린다) */
  setEvents(events: readonly Ev[]): void;
  stop(): void;
  running(): boolean;
  /** 시작 오디오 시각 */
  t0(): number;
};

export function createTransport(engine: Engine): Transport {
  const { ctx } = engine;
  let timer = 0;
  let bus: GainNode | null = null;
  let t0 = 0;
  let until = 0;
  let events: readonly Ev[] = [];
  let loop: number | null = null;
  let last = 0;

  const tick = () => {
    if (!bus) return;
    const horizon = ctx.currentTime + LOOKAHEAD - t0;
    if (horizon <= until) return;
    for (const { ev, at } of eventsBetween(events, until, horizon, loop)) engine.voice(ev.i, t0 + at, ev.v, ev.n, ev.d, bus);
    until = horizon;
    if (!loop && until > last + 0.05) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
    const b = bus;
    bus = null;
    if (b) {
      // 이미 예약된 소리도 짧게 줄여 끊고, 잠시 뒤 묶음을 뗀다
      const now = ctx.currentTime;
      b.gain.cancelScheduledValues(now);
      b.gain.setValueAtTime(b.gain.value, now);
      b.gain.linearRampToValueAtTime(0, now + 0.06);
      window.setTimeout(() => b.disconnect(), 400);
    }
  };
  return {
    start(evs, lp, lead = 0.12) {
      stop();
      if (ctx.state === 'suspended') void ctx.resume();
      events = evs;
      loop = lp && lp > 0 ? lp : null;
      last = evs.reduce((m, e) => Math.max(m, e.t), 0);
      bus = engine.bus();
      t0 = ctx.currentTime + lead;
      until = 0;
      timer = window.setInterval(tick, TICK_MS);
      tick();
      return t0;
    },
    setEvents(evs) {
      events = evs;
      last = evs.reduce((m, e) => Math.max(m, e.t), 0);
    },
    stop,
    running: () => bus !== null,
    t0: () => t0,
  };
}
