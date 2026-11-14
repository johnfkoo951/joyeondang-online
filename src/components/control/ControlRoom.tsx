'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dollCss } from '@/content/dolls';
import { assignPeople, planScreens, type ScreenPeople } from '@/walk/observe';
import type { ObserveScreen, Season, WalkController } from '@/walk/scene';
import type { HouseWorld, RemotePlayer } from '@/walk/types';
import { HEAD_H, clockText, drawCell, drawHead, readPalette, type Palette } from './compose';
import { fovForAspect, fullRect, gridRects, type Rect } from './layout';
import { REC_FPS, REC_MAX_W, formatBytes, formatElapsed, pickMime, recBitrate, startRecording, type RecStatus } from './recorder';
import { useChatFeed } from './useChatFeed';
import { useObservers, type HeardLine, type ObserveSummary } from './useObservers';
import { withDuration } from './webm';
import styles from './control.module.css';

/** 격자에서 화면마다 고를 수 있는 초당 장수, 크게 볼 때의 장수 */
const RATES = [2, 4, 8] as const;
const BIG_FPS = 15;
/** 사람을 화면에 다시 나누는 간격 */
const ASSIGN_MS = 250;
/** 층 전체 화면은 그 층 사람이 이보다 많으면 머리 위 이름표를 접는다(아래 띠에는 이름이 그대로 나온다) */
const OVERVIEW_NAMES = 14;
/** 옆에 남기는 말풍선 줄 수 */
const HEARD_MAX = 60;

const STATUS_TEXT: Record<ObserveSummary, string> = {
  live: '실시간',
  partial: '실시간',
  connecting: '잇는 중',
  retrying: '다시 잇는 중',
  denied: '관전 출입증을 받지 못했어요',
  full: '관전 자리가 꽉 찼어요',
  off: '쉬는 중',
};

type Problem = 'none' | 'error' | 'webgl' | 'lost';
type Row = { plan: number; title: string; count: number; names: string[] };

async function fetchHouse(): Promise<HouseWorld | 'none' | null> {
  try {
    const r = await fetch('/api/house', { cache: 'no-store', credentials: 'same-origin' });
    if (r.status === 404) return 'none';
    if (!r.ok) return null;
    const w = (await r.json()) as HouseWorld;
    return w && w.kind === 'real' ? w : 'none';
  } catch {
    return null;
  }
}

function hasWebGL(): boolean {
  const probe = document.createElement('canvas');
  const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGLRenderingContext | null;
  const ok = Boolean(gl);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return ok;
}

/** 파일로 내려받는다(주소는 1분 뒤 놓는다) */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type Recording = { stop: () => Promise<void>; timer: number; stream: MediaStream; lock: { release: () => Promise<void> } | null };

/**
 * 컨트롤 룸: 집 구획마다 고정 카메라 화면을 격자로(한 WebGL 문맥에서 나눠 그림), 누르면 크게, 녹화.
 * 3D는 보이지 않는 캔버스에 그리고, 표시 캔버스(2D)가 칸마다 옮겨 담은 뒤 이름표를 얹는다. 녹화는 표시 캔버스를 그대로 담는다.
 */
export function ControlRoom({ backHref }: { backHref: string | null }) {
  const [world, setWorld] = useState<HouseWorld | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const plans = useMemo(() => (world ? planScreens(world) : []), [world]);
  const [big, setBig] = useState<number | null>(null);
  const [rate, setRate] = useState<number>(4);
  /** 칸 자리(벽 안 CSS px, 맨 위 띠 아래 기준)와 칸마다의 계획 차례 */
  const [cells, setCells] = useState<{ rects: Rect[]; plan: number[] }>({ rects: [], plan: [] });
  /** 녹화 시간 표시용 지금 시각(1초마다) */
  const [now, setNow] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [rec, setRec] = useState<RecStatus | null>(null);
  const [recNote, setRecNote] = useState<string | null>(null);
  const [heard, setHeard] = useState<HeardLine[]>([]);
  const [ready, setReady] = useState(false);

  const wall = useRef<HTMLDivElement>(null);
  const glHost = useRef<HTMLDivElement>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<WalkController | null>(null);
  const players = useRef<RemotePlayer[]>([]);
  const assigned = useRef<ScreenPeople[]>([]);
  /** 엔진에 넘긴 화면들, 화면마다의 계획 차례, 그릴 사람 Set(제자리에서 고친다) */
  const screens = useRef<{ list: ObserveScreen[]; plan: number[]; sets: Set<string>[] }>({ list: [], plan: [], sets: [] });
  const pal = useRef<Palette | null>(null);
  const recording = useRef<Recording | null>(null);
  const rowsKey = useRef('');
  const head = useRef({ total: 0, status: '잇는 중', rec: null as RecStatus | null });
  /** 엔진이 그린 직후 부르는 일(렌더마다 바꿔 끼운다) */
  const compose = useRef<(drawn: readonly number[]) => void>(() => {});
  const live = useRef({ plans, big, rate });
  useEffect(() => {
    live.current = { plans, big, rate };
  });

  const onPlayers = useCallback((all: RemotePlayer[]) => {
    players.current = all;
    ctrl.current?.setOthers(all);
  }, []);
  const onHeard = useCallback((l: HeardLine) => setHeard((hs) => [...hs, l].slice(-HEARD_MAX)), []);
  const net = useObservers({ enabled: world !== null, onPlayers, onHeard });
  // 대화 기록(저장된 대화창·말하기). 아직 없으면 관전 연결로 들은 집 안 말풍선을 대신 보인다
  const feed = useChatFeed(world !== null);
  useEffect(() => {
    head.current.status = STATUS_TEXT[net.summary];
  }, [net.summary]);

  // 집 데이터(명단 손님 이상, 서버가 한 번 더 확인)
  useEffect(() => {
    let alive = true;
    void fetchHouse().then((w) => {
      if (!alive) return;
      if (w === 'none') setProblem('none');
      else if (!w) setProblem('error');
      else setWorld(w);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 맨 위 띠(1초마다, 사람 수·녹화가 바뀔 때) */
  const paintHead = useCallback(() => {
    const cv = display.current, w = wall.current, p = pal.current;
    const g = cv?.getContext('2d');
    if (!cv || !g || !w || !p || cv.width < 2) return;
    const s = cv.width / Math.max(1, w.clientWidth);
    const r = head.current.rec;
    drawHead(g, cv.width, s, {
      left: `조연당 컨트롤 룸 · ${clockText(new Date())}`,
      middle: `집 안 ${head.current.total}명`,
      right: r?.on ? `녹화 ${formatElapsed(Date.now() - r.startedAt)} · ${formatBytes(r.totalBytes)}` : head.current.status,
      recording: Boolean(r?.on),
    }, p);
  }, []);

  /** 칸 자리를 다시 셈하고 엔진에 화면을 넘긴다(벽 크기, 크게 보기, 장수가 바뀔 때) */
  const layout = useCallback(() => {
    const el = wall.current;
    const { plans: ps, big: b, rate: fps } = live.current;
    if (!el || !ps.length) return;
    const W = Math.max(1, el.clientWidth), H = Math.max(1, el.clientHeight - HEAD_H);
    const idx = b !== null && b < ps.length ? [b] : ps.map((_, i) => i);
    const rects = idx.length === 1 && b !== null ? [fullRect(W, H)] : gridRects(idx.length, W, H);
    const sets = idx.map((pi) => new Set(assigned.current[pi]?.draw ?? []));
    const list: ObserveScreen[] = idx.map((pi, k) => {
      const p = ps[pi], r = rects[k];
      const crowd = (assigned.current[pi]?.here.length ?? 0) > OVERVIEW_NAMES;
      return { x: r.x, y: r.y, w: r.w, h: r.h, eye: p.eye, at: p.at, fov: fovForAspect(p.fov, r.w / r.h), cut: p.cut, people: sets[k], names: p.cut === 0 || !crowd };
    });
    screens.current = { list, plan: idx, sets };
    setCells({ rects, plan: idx });
    // 칸 자리가 바뀌면 표시 캔버스를 벽 색으로 비우고 다시 채운다
    const cv = display.current, g = cv?.getContext('2d'), p = pal.current;
    if (cv && g && p) {
      g.fillStyle = p.wall;
      g.fillRect(0, 0, cv.width, cv.height);
      paintHead();
    }
    ctrl.current?.setScreens?.(list, b !== null ? BIG_FPS : fps);
  }, [paintHead]);

  // 엔진이 그린 칸을 표시 캔버스로 옮기고 이름표를 얹는다(그린 직후 같은 작업 안에서: 그리기 버퍼는 그 프레임에만 남는다)
  useEffect(() => {
    compose.current = (drawn) => {
      const cv = display.current, host = glHost.current, w = wall.current;
      const glc = host?.querySelector('canvas');
      const g = cv?.getContext('2d');
      if (!cv || !g || !glc || !w || !host) return;
      const s = glc.width / Math.max(1, host.clientWidth);
      const top = Math.round(HEAD_H * s);
      pal.current ??= readPalette();
      const p = pal.current;
      if (cv.width !== glc.width || cv.height !== glc.height + top) {
        cv.width = glc.width;
        cv.height = glc.height + top;
        g.fillStyle = p.wall;
        g.fillRect(0, 0, cv.width, cv.height);
        paintHead();
        // 크기를 바꾸면 캔버스가 비므로 이번에 안 그린 칸도 곧 다시 그리게 한다
        ctrl.current?.redrawScreens?.();
      }
      const { list, plan } = screens.current;
      for (const k of drawn) {
        const sc = list[k];
        if (!sc) continue;
        const x = Math.round(sc.x * s), y = Math.round(sc.y * s), cw = Math.round(sc.w * s), ch = Math.round(sc.h * s);
        g.drawImage(glc, x, y, cw, ch, x, y + top, cw, ch);
        const pi = plan[k];
        const here = assigned.current[pi]?.here ?? [];
        drawCell(g, { x, y: y + top, w: cw, h: ch }, { title: plans[pi]?.title ?? '', count: here.length, names: here.map((h) => h.name) }, s, p);
      }
    };
  });

  // 3D 장면(관전): 집이 오면 한 번 짓는다
  useEffect(() => {
    if (!world) return;
    let disposed = false;
    let c: WalkController | null = null;
    if (!hasWebGL()) {
      queueMicrotask(() => setProblem('webgl'));
      return;
    }
    void import('@/walk/scene').then(({ createWalk }) => {
      if (disposed || !glHost.current) return;
      const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      pal.current = readPalette();
      c = createWalk(glHost.current, {
        world,
        dollColor: dollCss(null),
        season: (document.documentElement.dataset.season ?? 'autumn') as Season,
        reducedMotion: still,
        coarse,
        view: 'first',
        label: null,
        onNear: () => {},
        onPlace: () => {},
        onInteract: () => {},
        onView: () => {},
        onLost: () => setProblem('lost'),
        onRestored: () => {
          setProblem((p) => (p === 'lost' ? null : p));
          c?.redrawScreens?.();
        },
        observe: { onScreens: (drawn) => compose.current(drawn) },
      });
      // 걷기 키·끌기는 쓰지 않는다
      c.setPaused(true);
      ctrl.current = c;
      c.setOthers(players.current);
      layout();
      const built = c;
      void built.ready.then(() => {
        if (!disposed && ctrl.current === built) setReady(true);
      });
    }).catch(() => {
      if (!disposed) setProblem('error');
    });
    return () => {
      disposed = true;
      c?.dispose();
      if (ctrl.current === c) ctrl.current = null;
    };
  }, [world, layout]);

  // 벽 크기가 바뀌면 다시 늘어놓는다. 크게 보기·장수·계획이 바뀌어도
  useEffect(() => {
    const el = wall.current;
    if (!el) return;
    const ro = new ResizeObserver(() => layout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);
  useEffect(() => {
    layout();
  }, [big, rate, plans, layout]);

  // 사람을 화면에 나눈다(ASSIGN_MS마다): 엔진의 Set을 제자리에서 고치고, 옆 목록은 바뀌었을 때만 다시 그린다
  useEffect(() => {
    if (!world || !plans.length) return;
    const tick = () => {
      const seen = players.current.map((p) => ({ id: p.id, name: p.name || '손님', level: p.level, x: p.x, z: p.z }));
      const got = assignPeople(world, plans, seen);
      assigned.current = got;
      const { list, plan, sets } = screens.current;
      plan.forEach((pi, k) => {
        const want = got[pi]?.draw ?? new Set<string>();
        const set = sets[k];
        for (const id of set) if (!want.has(id)) set.delete(id);
        for (const id of want) set.add(id);
        if (list[k] && plans[pi].cut !== 0) list[k].names = (got[pi]?.here.length ?? 0) <= OVERVIEW_NAMES;
      });
      const next: Row[] = plans.map((p, i) => ({ plan: i, title: p.title, count: got[i].here.length, names: got[i].here.map((h) => h.name) }));
      const key = next.map((r) => `${r.count}:${r.names.join(',')}`).join('|');
      if (key !== rowsKey.current) {
        rowsKey.current = key;
        setRows(next);
        setTotal(seen.length);
        head.current.total = seen.length;
        paintHead();
      }
    };
    tick();
    const t = window.setInterval(tick, ASSIGN_MS);
    return () => window.clearInterval(t);
  }, [world, plans, paintHead]);

  // 시계: 1초마다 맨 위 띠(녹화 중이면 걸린 시간도)
  useEffect(() => {
    const t = window.setInterval(() => {
      paintHead();
      if (head.current.rec?.on) setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(t);
  }, [paintHead]);

  // 이름표 글꼴: 처음 한 번 기다렸다가 칸을 다시 그린다(늦게 온 글꼴로 바뀌게)
  useEffect(() => {
    if (!ready || !document.fonts?.load) return;
    const text = `조연당 컨트롤 룸 집 안 녹화 명 외 0123456789:-·${plans.map((p) => p.title).join('')}`;
    void document.fonts.load('600 16px "Pretendard Variable"', text).then(() => {
      paintHead();
      ctrl.current?.redrawScreens?.();
    }, () => {});
  }, [ready, plans, paintHead]);
  const names = rows.map((r) => r.names.join('')).join('');
  useEffect(() => {
    if (!ready || !names || !document.fonts?.load) return;
    void document.fonts.load('500 16px "Pretendard Variable"', names).then((faces) => {
      if (faces.length) ctrl.current?.redrawScreens?.();
    }, () => {});
  }, [ready, names]);

  // 크게 본 화면은 Esc로 격자로 돌아간다(한글 조합 중인 키는 받지 않는다)
  useEffect(() => {
    if (big === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      setBig(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big]);

  const stopRec = useCallback(async () => {
    const r = recording.current;
    if (!r) return;
    recording.current = null;
    window.clearInterval(r.timer);
    await r.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    void r.lock?.release().catch(() => {});
  }, []);

  const startRec = useCallback(async () => {
    const cv = display.current;
    if (!cv || recording.current) return;
    const mime = typeof MediaRecorder === 'undefined' ? null : pickMime((t) => MediaRecorder.isTypeSupported(t));
    if (!mime || typeof cv.captureStream !== 'function') {
      setRecNote('이 브라우저는 화면 녹화를 지원하지 않아요. 데스크탑 Chrome에서 열어 주세요.');
      return;
    }
    // 녹화 캔버스: 가로 REC_MAX_W 이하, 짝수 크기. 창 크기가 바뀌면 비율을 지켜 가운데에 담는다
    const k = Math.min(1, REC_MAX_W / Math.max(1, cv.width));
    const rc = document.createElement('canvas');
    rc.width = Math.max(2, Math.round((cv.width * k) / 2) * 2);
    rc.height = Math.max(2, Math.round((cv.height * k) / 2) * 2);
    const rg = rc.getContext('2d');
    if (!rg) return;
    let stream = rc.captureStream(0);
    let track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    if (typeof track?.requestFrame !== 'function') {
      stream.getTracks().forEach((t) => t.stop());
      stream = rc.captureStream(REC_FPS);
      track = stream.getVideoTracks()[0];
    }
    const sample = () => {
      const p = pal.current;
      if (p) {
        rg.fillStyle = p.wall;
        rg.fillRect(0, 0, rc.width, rc.height);
      }
      const f = Math.min(rc.width / Math.max(1, cv.width), rc.height / Math.max(1, cv.height));
      const dw = cv.width * f, dh = cv.height * f;
      rg.drawImage(cv, (rc.width - dw) / 2, (rc.height - dh) / 2, dw, dh);
      track.requestFrame?.();
    };
    sample();
    const timer = window.setInterval(sample, 1000 / REC_FPS);
    let lock: Recording['lock'] = null;
    try {
      // 오래 녹화하는 동안 화면이 꺼지지 않게(꺼지면 그리기와 녹화가 멈춘다)
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      lock = wl ? await wl.request('screen') : null;
    } catch {
      lock = null;
    }
    try {
      const r = startRecording({
        stream,
        mime,
        bitrate: recBitrate(rc.width, rc.height),
        // 파일 머리에 길이를 적어 내려받는다(재생기에서 뒤로 건너뛸 수 있게)
        save: (blob, name, ms) => void withDuration(blob, ms).then((b) => download(b, name)),
        onChange: (st) => {
          head.current.rec = st;
          setRec(st);
          paintHead();
        },
      });
      recording.current = { stop: r.stop, timer, stream, lock };
      setRecNote(null);
    } catch {
      window.clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void lock?.release().catch(() => {});
      setRecNote('녹화를 시작하지 못했어요. 다시 눌러 주세요.');
    }
  }, [paintHead]);

  // 녹화 중에 페이지를 떠나려 하면 한 번 묻고, 정말 떠나면(화면이 닫히면) 모은 것까지 저장한다
  const recOn = Boolean(rec?.on);
  useEffect(() => {
    if (!recOn) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recOn]);
  useEffect(() => () => void stopRec(), [stopRec]);

  // 브라우저 시험용 손잡이(개인 정보 없이 수만)
  useEffect(() => {
    const debug = {
      get plans() { return plans.map((p) => ({ id: p.id, title: p.title, cut: p.cut })); },
      get screens() { return screens.current.list.map((s, k) => ({ plan: screens.current.plan[k], x: s.x, y: s.y, w: s.w, h: s.h, draw: s.people.size })); },
      get counts() { return assigned.current.map((a) => a.here.length); },
      get players() { return players.current.length; },
      get big() { return live.current.big; },
    };
    (window as unknown as { __jyControl?: typeof debug }).__jyControl = debug;
    return () => {
      delete (window as unknown as { __jyControl?: unknown }).__jyControl;
    };
  }, [plans]);

  const bigOn = big !== null;
  const statusTone = net.summary === 'live' || net.summary === 'partial' ? 'live' : net.summary === 'connecting' || net.summary === 'off' ? undefined : 'warn';
  const shown = cells.plan;
  const coverText = problem === 'none' ? '집 데이터를 받을 수 없어요(명단 손님 이상, 서버에 집 데이터가 있어야 해요).'
    : problem === 'webgl' ? '이 기기에서는 3D 화면을 열 수 없어요(WebGL). 다른 브라우저나 컴퓨터에서 열어 주세요.'
      : problem === 'lost' ? '3D 화면이 잠깐 끊겼어요. 곧 돌아오지 않으면 새로 고쳐 주세요.'
        : problem === 'error' ? '컨트롤 룸을 열지 못했어요. 새로 고쳐 주세요.'
          : !ready ? '집을 짓는 중이에요' : null;

  return (
    <div className={styles.room}>
      <div className={styles.bar}>
        <h1 className={styles.title}>컨트롤 룸</h1>
        <span className={styles.chip} data-tone={statusTone}>
          <span className={styles.dot} aria-hidden="true" />
          {STATUS_TEXT[net.summary]}
        </span>
        <span className={styles.chip}>집 안 {total}명</span>
        <label className={styles.field}>
          화면마다 초당
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} disabled={bigOn} aria-label="화면마다 초당 그리는 장수">
            {RATES.map((r) => <option key={r} value={r}>{r}장</option>)}
          </select>
        </label>
        {bigOn ? <button type="button" className="btn btn-small" onClick={() => setBig(null)}>격자로 (Esc)</button> : null}
        <span className={styles.spacer} />
        {rec?.on ? (
          <span className={styles.chip} data-tone="rec" aria-live="polite">
            <span className={styles.dot} aria-hidden="true" />
            {formatElapsed(Math.max(now, rec.segmentAt) - rec.startedAt)} · {formatBytes(rec.totalBytes)}
          </span>
        ) : rec && rec.files > 0 ? (
          <span className={styles.chip}>저장함 {rec.files}개 · {formatBytes(rec.totalBytes)}</span>
        ) : null}
        {rec?.on ? (
          <button type="button" className="btn btn-small btn-roof" onClick={() => void stopRec()}>멈추고 저장</button>
        ) : (
          <button type="button" className="btn btn-small btn-pine" onClick={() => void startRec()} disabled={!ready}>녹화</button>
        )}
        {backHref ? <Link className="btn btn-small" href={backHref}>승인함</Link> : null}
      </div>
      <div className={styles.main}>
        <div className={styles.wall} ref={wall}>
          <div className={styles.gl} ref={glHost} style={{ top: HEAD_H }} aria-hidden="true" />
          <canvas className={styles.display} ref={display} role="img" aria-label="구획별 실시간 화면" />
          {ready ? cells.rects.map((r, k) => {
            const pi = shown[k];
            const row = rows[pi];
            if (pi === undefined || !plans[pi]) return null;
            const who = row && row.count ? `, ${row.count}명: ${row.names.join(', ')}` : ', 비어 있음';
            return (
              <button
                key={`${pi}-${bigOn ? 'big' : 'grid'}`}
                type="button"
                className={styles.cell}
                data-big={bigOn ? '' : undefined}
                style={{ left: r.x, top: r.y + HEAD_H, width: r.w, height: r.h }}
                aria-label={bigOn ? `${plans[pi].title} 화면${who}. 누르면 격자로` : `${plans[pi].title} 크게 보기${who}`}
                onClick={() => setBig(bigOn ? null : pi)}
              />
            );
          }) : null}
          {coverText ? <div className={styles.cover} role="status">{coverText}</div> : null}
        </div>
        <aside className={styles.side} aria-label="구획별 사람">
          <section className="stack" style={{ gap: 6 }}>
            <h2>구획별 사람</h2>
            <ul className={styles.list}>
              {rows.map((r) => (
                <li key={r.plan}>
                  <button type="button" className={styles.row} aria-current={big === r.plan ? 'true' : undefined} onClick={() => setBig(r.plan)}>
                    <span className={styles.rowTitle}>{r.title}</span>
                    <span className={styles.rowCount}>{r.count}명</span>
                    {r.count ? <span className={styles.rowNames}>{r.names.join(' · ')}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="stack" style={{ gap: 6 }}>
            <h2>{feed.state === 'live' ? '대화' : '집 안에서 들린 말'}</h2>
            {feed.state === 'live' ? (
              feed.lines.length ? (
                <ul className={styles.chat} aria-live="polite">
                  {[...feed.lines].reverse().map((l) => (
                    <li key={l.id}>
                      <span>
                        <span className={styles.chatWho}>{l.name}</span>{' '}
                        <span className={styles.chatMeta}>{clockText(new Date(l.ms)).slice(11)}{l.where ? ` · ${l.where}` : ''}</span>
                      </span>
                      <span className={styles.chatBody}>{l.text}</span>
                      {l.mentions.length ? <span className={styles.chatMeta}>멘션 {l.mentions.join(', ')}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.note}>아직 대화가 없어요.</p>
            ) : (
              <>
                {feed.state === 'none' ? <p className={styles.note}>대화 기록이 아직 열리지 않아, 집 안 말풍선만 보여요.</p> : null}
                {heard.length ? (
                  <ul className={styles.chat}>
                    {[...heard].reverse().map((l) => (
                      <li key={l.key}>
                        <span><span className={styles.chatWho}>{l.name}</span> <span className={styles.chatMeta}>{clockText(new Date(l.at)).slice(11)}</span></span>
                        <span className={styles.chatBody}>{l.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.note}>아직 없어요. 집 안에서 누가 말하면 여기 쌓여요.</p>}
              </>
            )}
          </section>
          {recNote ? <p className={styles.warn} role="alert">{recNote}</p> : null}
          <p className={styles.note}>
            서버에는 관전 연결만 더해져요(집 공간마다 하나, 손님 수에 세지 않아요). 그리는 일은 이 기기가 해요.
            녹화는 이 화면 그대로 {REC_FPS}장/초 webm으로, 30분마다 파일을 나눠 내려받아요(두 번째 파일에서 브라우저가 여러 파일 내려받기를 물으면 허용해 주세요).
            녹화하는 동안 이 창을 가리지 마세요(가려지면 그림이 멈춰요).
          </p>
        </aside>
      </div>
    </div>
  );
}
