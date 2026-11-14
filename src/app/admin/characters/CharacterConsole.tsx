'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, lazy, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  GALLERY_VIEWS, VIEW_PARAM, countWord, hrefWithView, modelTone, picTone, readView, rowEndOf, tileState, viewCounts, viewRows,
  type GalleryView,
} from '@/lib/avatar/admin-gallery';
import {
  ADMIN_FILTERS, MODEL_WORD, OP_LABEL, OWNER_ROLES, PAGE_SIZE, PIC_WORD, ROLE_WORD, TOLD_LINE, actorWord, adminFileHref, confirmText,
  confirmYes, failWord, hasShownModel, listHref, logLine, modelNextStep, needsTold, opsFor, ownerLine, readCharacterRows, readCounts,
  readLogRows, reasonWord, remakeLabel, type AdminFilter, type AdminOp, type CharacterRow, type Counts, type LogRow, type OwnerRole,
} from '@/lib/avatar/admin-rules';
import type { ModelProvider } from '@/lib/avatar/consent';
import css from './characters.module.css';
import { ModelSnap, snapQueue } from './ModelSnap';

// 캐릭터 관리 콘솔(집주인 전용, /admin/characters). 휴대폰 먼저: 발표 중에 휴대폰으로 문제 있는 캐릭터를 찾아 지우거나 다시 만든다.
// 캐릭터를 그림 카드의 갤러리로 본다(휴대폰 두 줄, 넓으면 다섯 줄까지). 「2D 그림」·「3D 모형」 보기는 거르기 칩·검색과 따로 논다
// (주소의 ?view=3d로 기억한다). 3D 모형 보기는 3D가 보이는 캐릭터만, 모형의 정지 사진으로 보인다(ModelSnap, 한 그리개가 한 장씩).
// 카드를 누르면 카드는 제자리에 두고 그 줄 바로 아래에 자세히(상태를 쉬운 말로, 조작 단추는 누르면 그 자리에서 한 번 더 묻는다)가
// 한 줄을 다 쓰며 열린다(한 번에 하나). 문서 차례로는 카드 바로 뒤라 키보드·화면 읽기는 카드 다음에 자세히를 만난다.
// 3D 모형 보기에서 카드를 누르면 움직이는 「3D 보기」도 함께 연다(한 번에 하나). 판정은 서버와 DB가 한다(집주인인지, 동의 근거, 주인의 셈).
// 집주인 자신의 캐릭터도 「내 것만」으로 골라 2D 그림 가운데 하나로 3D를 만든다(★ 보관 없이).
// 키보드·화면 읽기: 묻기를 닫거나(Esc, 그만두기) 조작이 끝나면 초점을 그 조작 단추로 돌린다. 카드가 지금 보기에서 사라졌으면
// (지움, 거르기 밖, 3D를 지워 3D 모형 보기 밖) 다음 카드의 첫 단추, 없으면 알림 줄로. 3D 보기를 Esc로 닫으면 그 카드의 「3D 보기」 단추로.

/** 3D 미리보기는 누를 때만 불러온다(three.js와 걷기 엔진의 모형 읽기). 휴대폰에서 목록을 가볍게 */
const ModelPreview = lazy(() => import('./ModelPreview'));

export type ApiReply = { status: number; data: unknown };
/** 서버에 묻는 길(시험·화면 미리보기에서 가짜를 넣을 수 있게) */
export type ConsoleApi = {
  get: (href: string) => Promise<ApiReply>;
  act: (id: string, body: { op: AdminOp; told: boolean }) => Promise<ApiReply>;
  image: (r: CharacterRow) => string;
  model: (r: CharacterRow) => string;
};

async function ask(href: string, init?: RequestInit): Promise<ApiReply> {
  try {
    const res = await fetch(href, { cache: 'no-store', credentials: 'same-origin', ...init });
    return { status: res.status, data: await res.json().catch(() => null) };
  } catch {
    return { status: 0, data: null };
  }
}

export const LIVE_API: ConsoleApi = {
  get: (href) => ask(href),
  act: (id, body) => ask(`/api/admin/characters/${id}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }),
  image: (r) => adminFileHref(r.id, 'char', r.picVer, true),
  model: (r) => adminFileHref(r.id, 'model', r.modelVer),
};

const MADE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const madeAt = (iso: string) => MADE.format(new Date(iso));
/** 검색어를 쳐 넣는 동안 목록을 다시 읽는 사이(ms). 한글 조합 중에도 그대로 반영한다 */
const SEARCH_MS = 250;
/** 3D를 기다리거나 만드는 캐릭터가 보이면 이만큼마다 다시 읽는다 */
const POLL_MS = 20_000;
/** 다시 읽을 때 한 번에 읽는 상한(목록 라우트의 limit 상한과 같다). 3D 모형 보기의 「더 보기」도 이만큼 */
const MAX_RELOAD = 100;

type Note = { id: string; ok: boolean; text: string };
type Confirm = { id: string; op: AdminOp };
type Page = { items: CharacterRow[]; counts: Counts | null; next: { before: string; before_id: string } | null };
/** 초점을 돌려줄 곳: 그 카드의 그 조작 단추(없으면 그 카드의 첫 단추) */
type FocusTo = { id: string; op: AdminOp | 'first' };

function readPage(data: unknown): Page | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.ok !== true) return null;
  const n = o.next && typeof o.next === 'object' ? (o.next as Record<string, unknown>) : null;
  return {
    items: readCharacterRows(o.items),
    counts: readCounts(o.counts),
    next: n && typeof n.before === 'string' && typeof n.before_id === 'string' ? { before: n.before, before_id: n.before_id } : null,
  };
}

const message = (data: unknown, fallback: string) => {
  const m = data && typeof data === 'object' ? (data as Record<string, unknown>).message : null;
  return typeof m === 'string' && m ? m.slice(0, 200) : fallback;
};

export function CharacterConsole({
  provider, modelsOn, store, trashLeft = false, api = LIVE_API,
}: { provider: ModelProvider; modelsOn: boolean; store: boolean; trashLeft?: boolean; api?: ConsoleApi }) {
  const params = useSearchParams();
  const [view, setView] = useState<GalleryView>(() => readView(params.get(VIEW_PARAM)));
  const [filter, setFilter] = useState<AdminFilter>('all');
  const [role, setRole] = useState<OwnerRole | ''>('');
  const [maker, setMaker] = useState('');
  const [mine, setMine] = useState(false);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState<Page | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [told, setTold] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [toast, setToast] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<LogRow[] | 'error' | null>(null);
  const [focusTo, setFocusTo] = useState<FocusTo | null>(null);
  // 카드가 초점을 받으면 요청을 지운다(나중에 거르기를 바꿔 그 카드가 다시 나타날 때 초점을 빼앗지 않게)
  const focused = useCallback(() => setFocusTo(null), []);
  const searchId = useId();
  const statusLine = useRef<HTMLParagraphElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** 갤러리의 칸 수(CSS가 화면 폭으로 정한다). 펼친 카드의 자세히를 그 줄 바로 아래에 놓으려고 잰다 */
  const [cols, setCols] = useState(2);
  // 조작한 뒤와 저절로 다시 읽을 때는 지금 보이는 만큼(더 보기로 넓힌 것까지) 다시 읽는다. 거르기를 바꾸면 첫 장부터
  const shown = useRef(PAGE_SIZE);
  const keep = useRef(false);
  // 조작이 끝난 뒤 다시 읽으면 초점을 어디에 둘지(그 카드가 사라졌으면 그 자리의 다음 카드)
  const afterRun = useRef<{ id: string; op: AdminOp; index: number } | null>(null);
  // 다시 읽은 뒤 초점을 정할 때 지금 보기를 본다(보기를 바꿀 때마다 목록을 다시 읽지 않게 ref로)
  const viewNow = useRef(view);
  useEffect(() => {
    viewNow.current = view;
  }, [view]);
  const refresh = () => {
    keep.current = true;
    setReload((n) => n + 1);
  };

  // 검색어: 치는 대로(한글 조합 중에도) 잠깐 뒤에 반영한다. 조합이 끝나면(compositionend) 바로 한 번 더
  useEffect(() => {
    const t = window.setTimeout(() => setQ(typed.trim()), SEARCH_MS);
    return () => window.clearTimeout(t);
  }, [typed]);

  // 목록 첫 장: 거르기·검색·내 것만이 바뀌거나 조작한 뒤에 다시 읽는다(2D·3D 보기는 읽은 목록에서 화면이 고른다)
  useEffect(() => {
    let stop = false;
    const limit = keep.current ? Math.min(MAX_RELOAD, Math.max(PAGE_SIZE, shown.current)) : PAGE_SIZE;
    keep.current = false;
    api.get(listHref({ filter, role: role || null, maker: maker || null, q: q || null, mine, limit })).then((r) => {
      if (stop) return;
      const p = r.status === 200 ? readPage(r.data) : null;
      if (p) {
        shown.current = p.items.length;
        setPage(p);
        setFailed(null);
        const after = afterRun.current;
        afterRun.current = null;
        if (after) {
          // 조작한 카드가 지금 보기에 그대로면 그 단추로, 사라졌으면(지움, 거르기 밖, 3D를 지워 3D 모형 보기 밖) 그 자리의 다음 카드로,
          // 카드가 없으면 알림 줄로
          const seen = viewRows(p.items, viewNow.current);
          if (seen.some((x) => x.id === after.id)) setFocusTo({ id: after.id, op: after.op });
          else if (seen.length) setFocusTo({ id: seen[Math.min(after.index, seen.length - 1)].id, op: 'first' });
          else requestAnimationFrame(() => statusLine.current?.focus());
        }
      } else {
        const reason = r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>).reason : null;
        setFailed(reason === 'db_old' ? failWord('db_old') : r.status === 404 ? '집주인으로 다시 들어와 주세요.' : failWord('error'));
      }
    });
    return () => {
      stop = true;
    };
  }, [api, filter, role, maker, q, mine, reload]);

  // 3D를 기다리거나 만드는 캐릭터가 보이면 가끔 다시 읽는다(다 되면 「3D 있음」으로 바뀐다)
  const waiting = Boolean(page?.items.some((r) => r.model === 'waiting' || r.model === 'making' || r.status === 'queued' || r.status === 'drawing'));
  useEffect(() => {
    if (!waiting) return;
    const t = window.setTimeout(() => {
      keep.current = true;
      setReload((n) => n + 1);
    }, POLL_MS);
    return () => window.clearTimeout(t);
  }, [waiting, reload]);

  // 움직이는 「3D 보기」가 열려 있는 동안은 3D 모형 보기의 사진을 찍지 않는다: 그림 문맥(WebGL)은 한 번에 하나만
  useEffect(() => {
    if (preview) snapQueue().pause();
    else snapQueue().resume();
  }, [preview]);

  // 갤러리의 칸 수를 잰다(화면을 돌리거나 창을 넓히면 다시). 넓은 화면에서는 목록 폭은 그대로인 채 칸 수만 바뀌기도 해서
  // (폭 상한 1040px, 다섯 칸은 1100px부터) 목록의 크기와 창의 크기를 함께 본다
  useEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const measure = () => setCols(Math.max(1, getComputedStyle(ul).gridTemplateColumns.split(' ').filter(Boolean).length));
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    sizes?.observe(ul);
    if (!sizes) requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      sizes?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // 조작 기록: 열었을 때와 조작한 뒤에 다시 읽는다
  useEffect(() => {
    if (!logOpen) return;
    let stop = false;
    api.get('/api/admin/characters/log?limit=50').then((r) => {
      if (stop) return;
      const o = r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : null;
      setLog(r.status === 200 && o?.ok === true ? readLogRows(o.rows) : 'error');
    });
    return () => {
      stop = true;
    };
  }, [api, logOpen, reload]);

  const loadMore = async () => {
    if (!page?.next || more) return;
    setMore(true);
    const r = await api.get(listHref({
      filter, role: role || null, maker: maker || null, q: q || null, mine, before: page.next.before, beforeId: page.next.before_id,
      // 3D 모형 보기는 3D가 있는 캐릭터만 보이므로 한 번에 넉넉히 읽는다
      limit: view === '3d' ? MAX_RELOAD : undefined,
    }));
    const p = r.status === 200 ? readPage(r.data) : null;
    setMore(false);
    if (!p) {
      setToast(failWord('error'));
      return;
    }
    const merged = { items: [...page.items, ...p.items.filter((x) => !page.items.some((y) => y.id === x.id))], counts: p.counts ?? page.counts, next: p.next };
    shown.current = merged.items.length;
    setPage(merged);
  };

  // 2D 그림 · 3D 모형. 펼친 카드와 3D 보기, 묻기는 닫는다(다른 보기에 숨은 채 남지 않게). 주소에 남겨 다시 열어도 그 보기로
  const pickView = (v: GalleryView) => {
    if (v === view) return;
    setView(v);
    setOpen(null);
    setPreview(null);
    setConfirming(null);
    setTold(false);
    try {
      window.history.replaceState(window.history.state, '', hrefWithView(window.location.href, v));
    } catch {
      // 주소를 못 바꿔도 보기는 바뀐다
    }
  };

  // 카드 펼치기(한 번에 하나). 3D 모형 보기에서 펼치면 움직이는 3D 보기도 연다. 접거나 다른 카드를 펼치면 3D 보기와 묻기를 닫는다
  const toggle = (row: CharacterRow) => {
    if (open === row.id) {
      setOpen(null);
      if (preview === row.id) setPreview(null);
      if (confirming?.id === row.id) {
        setConfirming(null);
        setTold(false);
      }
      return;
    }
    const spin = view === '3d' && store && hasShownModel(row);
    if (spin) snapQueue().pause();
    setOpen(row.id);
    setPreview(spin ? row.id : null);
    if (confirming && confirming.id !== row.id) {
      setConfirming(null);
      setTold(false);
    }
  };

  const run = async (row: CharacterRow, op: AdminOp) => {
    if (busy) return;
    setBusy(row.id);
    const index = viewRows(page?.items ?? [], view).findIndex((x) => x.id === row.id);
    const r = await api.act(row.id, { op, told });
    const ok = r.status === 200 && Boolean(r.data && typeof r.data === 'object' && (r.data as Record<string, unknown>).ok === true);
    const text = message(r.data, r.status === 0 ? '연결이 끊겼어요. 다시 눌러 주세요.' : failWord('error'));
    setBusy(null);
    setConfirming(null);
    setTold(false);
    setNote({ id: row.id, ok, text });
    setToast(`${ownerLine(row)}: ${text}`);
    if (ok && (op === 'forget_model' || op === 'forget' || op === 'redraw') && preview === row.id) setPreview(null);
    // 묻기가 닫혀도 초점이 페이지 맨 위로 떨어지지 않게: 지금은 그 단추로, 다시 읽은 뒤에는 그 카드나 다음 카드로
    setFocusTo({ id: row.id, op });
    afterRun.current = { id: row.id, op, index: Math.max(0, index) };
    refresh();
  };

  const chips = ADMIN_FILTERS.map((f) => ({ ...f, n: page?.counts?.[f.id] }));
  const makers = Object.keys(page?.counts?.makers ?? {}).sort();
  const items = page?.items ?? [];
  const visible = viewRows(items, view);
  const counts = viewCounts(items);
  // 펼친 카드의 자세히는 그 카드가 있는 줄의 끝 다음 자리(CSS order: 카드 i는 2i, 자세히는 2×줄끝+1)
  const rowEnd = rowEndOf(visible.findIndex((x) => x.id === open), cols, visible.length);

  return (
    <div className={css.console}>
      <p className={css.lead}>
        사진으로 만든 캐릭터 모두를 봐요. 카드를 누르면 자세한 상태가 나오고, 지우거나 다시 만들 수 있어요. 원본 사진은 여기서도 보이지 않아요.
      </p>
      <p className={css.where}>
        3D 만드는 곳: {provider === 'trellis' ? '우리 컴퓨터(바깥으로 보내지 않아요)' : 'Meshy(미국, 바깥 서비스)'}
        {!modelsOn ? ' · 지금은 3D 만들기를 쉬고 있어요' : ''}
      </p>
      {!store ? <p className="note-box">서버 비밀 키가 없어 그림을 보이거나 파일을 지울 수 없어요. 목록과 3D 만들기만 돼요.</p> : null}
      {trashLeft ? <p className={css.fine}>지난번에 지우지 못한 파일이 남아 있어요. 다음에 이 화면을 열 때 마저 지워요.</p> : null}

      <div className={css.views} role="group" aria-label="갤러리 보기">
        {GALLERY_VIEWS.map((v) => (
          <button key={v.id} type="button" className={css.view} aria-pressed={view === v.id} onClick={() => pickView(v.id)}>
            {v.label}
            {page ? <span className={css.count}>{countWord(counts[v.id], Boolean(page.next))}</span> : null}
          </button>
        ))}
      </div>

      <div className={css.tools}>
        <label className={css.search} htmlFor={searchId}>
          <span className={css.srOnly}>이름이나 행사 이름표로 찾기</span>
          <input
            id={searchId}
            type="search"
            value={typed}
            placeholder="이름이나 행사 이름표로 찾기"
            enterKeyHint="search"
            autoComplete="off"
            onChange={(e) => setTyped(e.currentTarget.value)}
            onCompositionEnd={(e) => setQ(e.currentTarget.value.trim())}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                setQ(typed.trim());
              }
              if (e.key === 'Escape' && typed) {
                e.preventDefault();
                setTyped('');
                setQ('');
              }
            }}
          />
        </label>
        <div className={css.chips} role="group" aria-label="거르기">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={css.chip}
              aria-pressed={filter === c.id}
              data-tone={c.id === 'model_problem' || c.id === 'pic_problem' ? 'warn' : undefined}
              onClick={() => setFilter(c.id)}
            >
              {c.label}{typeof c.n === 'number' ? <span className={css.count}>{c.n}</span> : null}
            </button>
          ))}
          <button type="button" className={css.chip} aria-pressed={mine} onClick={() => setMine((m) => !m)}>내 것만</button>
        </div>
        <div className={css.selects}>
          <label className={css.select}>
            <span>역할</span>
            <select value={role} onChange={(e) => setRole(e.currentTarget.value as OwnerRole | '')}>
              <option value="">전부</option>
              {OWNER_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_WORD[r]}{page?.counts?.roles[r] !== undefined ? ` ${page.counts.roles[r]}` : ''}</option>
              ))}
            </select>
          </label>
          <label className={css.select}>
            <span>만든 서비스</span>
            <select value={maker} onChange={(e) => setMaker(e.currentTarget.value)}>
              <option value="">전부</option>
              {makers.map((m) => <option key={m} value={m}>{m} {page?.counts?.makers[m]}</option>)}
            </select>
          </label>
        </div>
      </div>

      <p ref={statusLine} tabIndex={-1} className={css.status} role="status" aria-live="polite">{toast}</p>
      {failed ? <p className="note-box" role="alert">{failed}</p> : null}
      {!page && !failed ? <p className="muted">불러오는 중</p> : null}
      {page && !items.length ? <p className="muted">맞는 캐릭터가 없어요.</p> : null}
      {page && items.length > 0 && !visible.length ? (
        <p className="muted">
          {page.next
            ? '지금까지 읽은 캐릭터 가운데 3D가 있는 캐릭터가 없어요. 아래 「더 보기」로 더 찾아 보세요.'
            : '맞는 캐릭터 가운데 3D가 있는 캐릭터가 없어요.'}
        </p>
      ) : null}

      <ul ref={list} className={css.list} data-view={view}>
        {visible.map((r, i) => (
          <CharacterCard
            key={r.id}
            row={r}
            view={view}
            open={open === r.id}
            place={{ order: 2 * i, panel: 2 * rowEnd + 1, col: i % cols, cols }}
            onToggle={() => toggle(r)}
            api={api}
            provider={provider}
            ops={opsFor(r, { modelsOn, store, provider })}
            store={store}
            previewOpen={preview === r.id}
            onPreview={(on) => {
              if (on) snapQueue().pause();
              setPreview(on ? r.id : null);
            }}
            confirming={confirming?.id === r.id ? confirming.op : null}
            onAsk={(op) => {
              // 묻기를 닫으면(Esc, 그만두기) 초점을 연 단추로 돌린다
              if (!op && confirming?.id === r.id) setFocusTo({ id: r.id, op: confirming.op });
              setConfirming(op ? { id: r.id, op } : null);
              setTold(false);
            }}
            focus={focusTo?.id === r.id ? focusTo : null}
            onFocused={focused}
            told={told}
            onTold={setTold}
            busy={busy === r.id}
            anyBusy={busy !== null}
            onRun={(op) => run(r, op)}
            note={note?.id === r.id ? note : null}
          />
        ))}
      </ul>
      {page?.next ? (
        <p className={css.more}>
          <button type="button" className="btn btn-small" disabled={more} onClick={loadMore}>{more ? '불러오는 중' : '더 보기'}</button>
        </p>
      ) : null}

      <section className={css.log} aria-labelledby="char-log">
        <h2 id="char-log" className={css.logTitle}>
          <button type="button" className="btn btn-small" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}>
            {logOpen ? '조작 기록 닫기' : '조작 기록 보기'}
          </button>
        </h2>
        {logOpen ? (
          log === null ? <p className="muted">불러오는 중</p>
            : log === 'error' ? <p className="note-box">기록을 읽지 못했어요.</p>
              : !log.length ? <p className="muted">아직 기록이 없어요.</p>
                : (
                  <ol className={css.logList}>
                    {log.map((l, i) => (
                      <li key={`${l.at}-${i}`}>
                        <span className={css.logWhen}>{madeAt(l.at)}</span>{' '}
                        <strong>{actorWord(l)}</strong>{' → '}{ownerLine({ ownerName: l.ownerName, nickname: l.nickname })}
                        <span className={css.logWhat}>{logLine(l)}</span>
                      </li>
                    ))}
                  </ol>
                )
        ) : null}
      </section>
    </div>
  );
}

type CardProps = {
  row: CharacterRow;
  view: GalleryView;
  /** 펼쳐서 상태와 조작 단추를 보인다 */
  open: boolean;
  /** 자리: 카드와 자세히의 CSS order, 카드가 있는 칸(자세히의 꼭지가 가리킨다)과 칸 수 */
  place: { order: number; panel: number; col: number; cols: number };
  onToggle: () => void;
  api: ConsoleApi;
  provider: ModelProvider;
  ops: AdminOp[];
  store: boolean;
  previewOpen: boolean;
  onPreview: (open: boolean) => void;
  confirming: AdminOp | null;
  onAsk: (op: AdminOp | null) => void;
  told: boolean;
  onTold: (v: boolean) => void;
  busy: boolean;
  anyBusy: boolean;
  onRun: (op: AdminOp) => void;
  note: Note | null;
  /** 초점을 받을 차례면 그 요청(새 요청마다 새 값) */
  focus: FocusTo | null;
  onFocused: () => void;
};

function CharacterCard({
  row: r, view, open, place, onToggle, api, provider, ops, store, previewOpen, onPreview, confirming, onAsk, told, onTold, busy, anyBusy,
  onRun, note, focus, onFocused,
}: CardProps) {
  const card = useRef<HTMLLIElement>(null);
  const panel = useRef<HTMLLIElement>(null);
  const tileButton = useRef<HTMLButtonElement>(null);
  const ask = useRef<HTMLDivElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const qid = useId();
  const did = useId();
  // 물으면 그 물음으로 초점을 옮긴다(화면 읽기 프로그램이 바로 읽고, 휴대폰은 그 자리로 스크롤한다)
  useEffect(() => {
    if (confirming) ask.current?.focus();
  }, [confirming]);
  // 초점을 돌려받는다: 자세히의 그 조작 단추, 없으면(그 조작이 이제 없다) 자세히의 첫 단추, 자세히가 닫혀 있으면 카드 단추, 그것도 없으면 카드
  useEffect(() => {
    if (!focus) return;
    const box = panel.current;
    const byOp = focus.op === 'first' ? null : box?.querySelector<HTMLButtonElement>(`button[data-op="${focus.op}"]:not([disabled])`);
    const first = box?.querySelector<HTMLButtonElement>('button:not([disabled])') ?? tileButton.current;
    (byOp ?? first ?? card.current)?.focus();
    onFocused();
  }, [focus, onFocused]);
  // 자세히는 카드가 있는 줄 아래에 열린다: 화면 밖이면 보이게 옮긴다(줄인 움직임이면 바로)
  useEffect(() => {
    if (!open) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    panel.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [open]);
  /** 자세히를 닫고 초점을 카드 단추로(닫히는 자세히에 있던 초점이 페이지 맨 위로 떨어지지 않게) */
  const close = () => {
    tileButton.current?.focus();
    onToggle();
  };
  const picReason = r.status === 'rejected' || r.status === 'failed' ? reasonWord(r.reason, 'pic') : null;
  const modelReason = r.model === 'failed' ? reasonWord(r.modelReason, 'model') : null;
  const nextStep = modelNextStep(r, { store, provider });
  const shown = hasShownModel(r);
  const owner = ownerLine(r);
  const toldNeeded = confirming === 'remake_model' && needsTold(r, provider);
  const tone = r.status === 'rejected' || r.status === 'failed' || r.model === 'failed' || r.model === 'stuck' ? 'warn' : undefined;
  const brief = tileState(r);
  // 관리자용 작은 그림(판이 붙어 다시 그리면 새로 받는다). 원본 사진이 아니다
  const still = r.status === 'ready' && store ? api.image(r) : null;
  return (
    <>
      <li ref={card} tabIndex={-1} className={css.card} data-tone={tone} data-open={open || undefined} style={{ order: place.order }}>
        <button
          ref={tileButton}
          type="button"
          className={css.tile}
          aria-expanded={open}
          aria-controls={open ? did : undefined}
          onClick={onToggle}
        >
          <span className={css.pic}>
            {view === '3d' && shown ? (
              <ModelSnap id={r.id} ver={r.modelVer} src={store ? api.model(r) : null} still={still} empty={MODEL_WORD[r.model]} />
            ) : still ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={css.picImg} src={still} alt="" width={360} height={540} loading="lazy" decoding="async" />
            ) : (
              <span className={css.picEmpty}>{r.redrawing ? '다시 그리는 중' : PIC_WORD[r.status]}</span>
            )}
            {r.kept || r.worn ? (
              <span className={css.marks}>
                {r.kept ? <span className={css.mark}>★</span> : null}
                {r.worn ? <span className={css.mark}>입고 있음</span> : null}
              </span>
            ) : null}
          </span>
          <span className={css.caption}>
            <strong className={css.tileName}>{owner}</strong>
            <span className={css.tileTags}>
              <span className={css.role} data-role={r.role}>{ROLE_WORD[r.role]}{r.removed ? '(명단에서 뺌)' : ''}</span>
              {r.eventLabel ? <span className={css.tag}>{r.eventLabel}</span> : null}
            </span>
            <span className={css.tileState}>
              <span className={css.badge} data-tone={brief.tone}>{brief.text}</span>
              {brief.prev ? <span className={css.why}>이전 3D</span> : null}
            </span>
          </span>
        </button>
      </li>
      {open ? (
        <li
          ref={panel}
          id={did}
          className={css.panel}
          style={{ order: place.panel, '--col': place.col, '--cols': place.cols } as CSSProperties}
          onKeyDown={(e) => {
            // Esc: 자세히를 닫는다(묻기와 3D 보기는 저마다 먼저 닫고 막는다)
            if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            close();
          }}
        >
          <h2 className={css.panelTitle}>{owner}</h2>
          <p className={css.meta}>
            {madeAt(r.createdAt)}
            {r.slot ? ` · 작업대 ${r.slot}번` : ''}
            {r.kept ? ' · ★' : ''}
            {r.worn ? ' · 지금 입고 있음' : ''}
          </p>
          <p className={css.state}>
            <span className={css.badge} data-tone={picTone(r.status)}>{PIC_WORD[r.status]}</span>
            {picReason ? <span className={css.why}>{picReason}</span> : null}
            {r.redrawing ? <span className={css.why}>집주인이 다시 그리는 중이에요. 그동안 걷기에는 지금 그림이 보여요.</span> : null}
          </p>
          {r.status === 'ready' ? (
            <p className={css.state}>
              <span className={css.badge} data-tone={modelTone(r.model)}>{MODEL_WORD[r.model]}</span>
              {r.prev && r.model !== 'ready' ? <span className={css.why}>이전 3D가 보여요(새 3D가 될 때까지)</span> : null}
              {modelReason ? <span className={css.why}>{modelReason}{nextStep ? `. ${nextStep}` : ''}</span> : null}
              <span className={css.facts}>
                {[
                  r.maker,
                  shown ? `판 ${r.modelVer}` : null,
                  r.via ? (r.via === 'meshy' ? 'Meshy로 요청' : '우리 컴퓨터로 요청') : null,
                  r.byAdmin ? '집주인 요청' : null,
                  r.modelTries ? `돈이 든 시도 ${r.modelTries}` : null,
                  r.modelAttempts ? `잡은 횟수 ${r.modelAttempts}` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </p>
          ) : null}

          {previewOpen ? (
            <Suspense fallback={<p className={css.fine}>3D를 불러오는 중이에요</p>}>
              <ModelPreview
                src={api.model(r)}
                label={owner}
                onClose={() => {
                  // Esc로 닫으면 초점을 이 카드의 「3D 보기」로(닫히는 무대에 있던 초점이 페이지 맨 위로 떨어지지 않게)
                  previewButton.current?.focus();
                  onPreview(false);
                }}
              />
            </Suspense>
          ) : null}

          <div className={css.actions}>
            {shown && store ? (
              <button
                ref={previewButton}
                type="button"
                className="btn btn-small"
                aria-expanded={previewOpen}
                onClick={() => onPreview(!previewOpen)}
              >
                {previewOpen ? '3D 닫기' : '3D 보기'}
              </button>
            ) : null}
            {ops.map((op) => (
              <button
                key={op}
                type="button"
                data-op={op}
                className={`btn btn-small ${op === 'remake_model' ? 'btn-pine' : ''}`}
                aria-expanded={confirming === op}
                disabled={anyBusy}
                onClick={() => onAsk(confirming === op ? null : op)}
              >
                {op === 'remake_model' ? remakeLabel(r) : OP_LABEL[op]}
              </button>
            ))}
            <button type="button" className="btn btn-small" onClick={close}>접기</button>
          </div>

          {confirming ? (
            <div
              ref={ask}
              className={css.ask}
              role="group"
              aria-labelledby={qid}
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                onAsk(null);
              }}
            >
              <p id={qid} className={css.askText}>{confirmText(confirming, r, provider)}</p>
              {toldNeeded ? (
                <label className="choice">
                  <input type="checkbox" checked={told} onChange={(e) => onTold(e.currentTarget.checked)} />
                  <span>{TOLD_LINE}</span>
                </label>
              ) : null}
              <div className="btn-row">
                <button
                  type="button"
                  className={`btn btn-small ${confirming === 'remake_model' ? 'btn-pine' : 'btn-roof'}`}
                  disabled={busy || (toldNeeded && !told)}
                  onClick={() => onRun(confirming)}
                >
                  {busy ? '하는 중' : confirmYes(confirming, provider)}
                </button>
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => onAsk(null)}>그만두기</button>
              </div>
            </div>
          ) : null}

          {note ? <p className={css.note} data-ok={note.ok || undefined}>{note.text}</p> : null}
        </li>
      ) : null}
    </>
  );
}
