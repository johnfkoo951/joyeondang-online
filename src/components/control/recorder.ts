// 컨트롤 룸 녹화: 캔버스 영상을 MediaRecorder로 1초 조각씩 모으고, 멈추면 파일 하나로 내보낸다.
// 긴 녹화는 REC_SEGMENT_MS마다 파일을 나눈다(파일마다 따로 열리고, 모은 조각을 그때그때 놓아 메모리가 쌓이지 않게).
// 나눌 때는 다음 녹화를 먼저 열고 앞 것을 닫는다: 두 파일 사이에 빈 순간이 없다(겹치는 몇백 ms는 괜찮다).
// MediaRecorder·시계·타이머는 바꿔 끼울 수 있어 시험에서 그대로 돈다.

/** 조각 길이, 파일을 나누는 길이 */
export const REC_SLICE_MS = 1000;
export const REC_SEGMENT_MS = 30 * 60_000;
/** 녹화 영상의 초당 장수와 가로 상한(px) */
export const REC_FPS = 10;
export const REC_MAX_W = 1920;
/** 앞에 있는 것부터 쓴다(VP9가 같은 화질에 작다). 모두 webm이라 파일 이름 끝은 .webm */
export const REC_MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const;

export function pickMime(supported: (type: string) => boolean): string | null {
  for (const t of REC_MIMES) {
    try {
      if (supported(t)) return t;
    } catch {
      // 묻는 것조차 안 되는 브라우저
    }
  }
  return null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** 조연당-컨트롤룸-YYYYMMDD-HHMM.webm (이 기기 시각) */
export function recFileName(at: Date): string {
  return `조연당-컨트롤룸-${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.webm`;
}

export function formatBytes(n: number): string {
  if (!(n > 0)) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** 걸린 시간: 4:05, 1:02:03 */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 녹화 영상 비트레이트: 화소 수와 장수에 맞춰(감시 화면처럼 느리게 바뀌는 화면 기준), 1~6 Mbps */
export function recBitrate(w: number, h: number, fps = REC_FPS): number {
  return Math.round(Math.min(6e6, Math.max(1e6, w * h * fps * 0.12)));
}

export type RecStatus = {
  on: boolean;
  /** 녹화를 시작한 때와 지금 파일을 시작한 때(ms) */
  startedAt: number;
  segmentAt: number;
  /** 지금 파일에 모인 크기와 이번 녹화 전체 크기(바이트) */
  bytes: number;
  totalBytes: number;
  /** 내보낸 파일 수 */
  files: number;
  error: string | null;
};

type RecorderLike = Pick<MediaRecorder, 'start' | 'stop' | 'state'> & {
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
};

export type RecorderDeps = {
  stream: MediaStream;
  mime: string;
  bitrate: number;
  /** 파일 하나가 다 모이면(멈출 때, 나눌 때). durationMs는 그 파일의 길이 */
  save: (blob: Blob, name: string, durationMs: number) => void;
  onChange: (s: RecStatus) => void;
  segmentMs?: number;
  now?: () => number;
  makeRecorder?: (stream: MediaStream, opts: MediaRecorderOptions) => RecorderLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

type Segment = { rec: RecorderLike; chunks: Blob[]; at: number; closed: Promise<void> | null };

export function startRecording(d: RecorderDeps): { stop: () => Promise<void>; status: () => RecStatus } {
  const now = d.now ?? (() => Date.now());
  const make = d.makeRecorder ?? ((s, o) => new MediaRecorder(s, o) as unknown as RecorderLike);
  const setTimer = d.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = d.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const segMs = d.segmentMs ?? REC_SEGMENT_MS;
  const type = d.mime.split(';')[0] || 'video/webm';
  const t0 = now();
  const st: RecStatus = { on: true, startedAt: t0, segmentAt: t0, bytes: 0, totalBytes: 0, files: 0, error: null };
  const emit = () => {
    try { d.onChange({ ...st }); } catch { /* 화면 쪽 오류는 녹화를 멈추지 않는다 */ }
  };
  let cur: Segment | null = null;
  let timer: unknown;

  const open = (): Segment => {
    const seg: Segment = { rec: make(d.stream, { mimeType: d.mime, videoBitsPerSecond: d.bitrate }), chunks: [], at: now(), closed: null };
    seg.rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      seg.chunks.push(e.data);
      st.totalBytes += e.data.size;
      if (seg === cur) st.bytes += e.data.size;
      emit();
    };
    seg.rec.onerror = () => {
      st.error = 'recorder';
      emit();
    };
    seg.rec.start(REC_SLICE_MS);
    st.segmentAt = seg.at;
    st.bytes = 0;
    return seg;
  };
  /** 묶음을 닫고(남은 조각까지 받은 뒤) 파일로 내보낸다. 조각이 하나도 없으면 내보내지 않는다 */
  const close = (seg: Segment): Promise<void> => {
    seg.closed ??= new Promise<void>((done) => {
      let finished = false;
      const end = () => {
        if (finished) return;
        finished = true;
        if (seg.chunks.length) {
          try {
            d.save(new Blob(seg.chunks, { type }), recFileName(new Date(seg.at)), Math.max(0, now() - seg.at));
            st.files += 1;
          } catch {
            st.error = 'save';
          }
        }
        // 내보낸 조각은 바로 놓는다(긴 녹화에서 메모리가 쌓이지 않게)
        seg.chunks = [];
        emit();
        done();
      };
      seg.rec.onstop = end;
      try {
        if (seg.rec.state === 'inactive') end();
        else seg.rec.stop();
      } catch {
        end();
      }
    });
    return seg.closed;
  };
  const roll = () => {
    if (!st.on || !cur) return;
    const old = cur;
    try {
      cur = open();
    } catch {
      st.error = 'recorder';
      cur = old;
      emit();
      return;
    }
    timer = setTimer(roll, segMs);
    void close(old);
  };

  cur = open();
  timer = setTimer(roll, segMs);
  emit();
  return {
    async stop() {
      if (!st.on) return;
      st.on = false;
      clearTimer(timer);
      const last = cur;
      cur = null;
      if (last) await close(last);
      emit();
    },
    status: () => ({ ...st }),
  };
}
