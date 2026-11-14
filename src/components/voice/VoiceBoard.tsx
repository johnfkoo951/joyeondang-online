'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveRoomVoice } from '@/app/voice/actions';
import { useLang } from '@/components/i18n/useLang';
import {
  GROUP_LABEL, MARKS, MARK_LABEL, voiceQuestions, type Mark, type VoiceGroupId, type VoiceQuestion,
} from '@/content/room-voice';
import { houseLine } from '@/lib/house-lines';
import { tr, type Lang } from '@/lib/i18n';
import { placeName } from '@/lib/place-names';
import type { VoiceItem, VoiceRoom } from '@/lib/room-voice';
import type { StampRoomView, StampView } from '@/lib/room-voice-ledger';
import s from './voice.module.css';

// 가족이 방마다 지금 놓인 것에 표시와 한마디를 남기는 판. 쓰는 대로 저장하고(잠깐 멈추면 저장), 다른 가족의 의견은 아래에 모아 보인다.
// 글칸은 사람이 고르는 대로만 바뀐다: 저장 결과로 글칸 값을 덮지 않는다(한글 조합 중에 글이 튀지 않게).

export type VoiceEntry = {
  room: string;
  writer: string;
  mine: boolean;
  marks: Record<string, Mark>;
  notes: Record<string, string>;
  answers: Record<string, string>;
  status: 'draft' | 'done';
  seen: string[];
  hash: string;
  version: string;
  updatedAt: string;
};

type Draft = { marks: Record<string, Mark>; notes: Record<string, string>; answers: Record<string, string>; status: 'draft' | 'done' };
type Meta = { updatedAt: string; version: string; hash: string; seen: string[] };
type SaveState = 'dirty' | 'saving' | 'saved' | 'error';

const EMPTY: Draft = { marks: {}, notes: {}, answers: {}, status: 'draft' };
const GROUPS: readonly VoiceGroupId[] = ['base', 'game', 'spot', 'thing', 'view'];
const SAVE_AFTER_MS = 900;
const RETRY_MS = 5000;

const ERROR_WORD: Record<string, [string, string]> = {
  not_allowed: ['가족 계정만 저장할 수 있어요.', 'Only family accounts can save.'],
  not_ready: ['아직 저장할 수 없어요.', 'Saving is not available yet.'],
  too_large: ['글이 너무 길어요. 조금 줄여 주세요.', 'That is too long. Please shorten it.'],
};

function when(lang: Lang, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function changesSince(seen: readonly string[], now: readonly string[]) {
  if (seen.length === 0) return { added: new Set<string>(), removed: [] as string[] };
  const before = new Set(seen);
  const nowSet = new Set(now);
  return { added: new Set(now.filter((id) => !before.has(id))), removed: seen.filter((id) => !nowSet.has(id)) };
}

export function VoiceBoard({
  rooms,
  owners,
  stamps,
  entries,
  appVersion,
  loadFailed,
}: {
  rooms: VoiceRoom[];
  owners: Record<string, string>;
  stamps: Record<string, StampRoomView>;
  entries: VoiceEntry[];
  appVersion: string;
  loadFailed: boolean;
}) {
  const lang = useLang();
  const t = useCallback((ko: string, en: string) => tr(lang, ko, en), [lang]);
  const router = useRouter();

  const mineInit = useMemo(() => new Map(entries.filter((e) => e.mine).map((e) => [e.room, e])), [entries]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    for (const [room, e] of mineInit) out[room] = { marks: e.marks, notes: e.notes, answers: e.answers, status: e.status };
    return out;
  });
  const [meta, setMeta] = useState<Record<string, Meta>>(() => {
    const out: Record<string, Meta> = {};
    for (const [room, e] of mineInit) out[room] = { updatedAt: e.updatedAt, version: e.version, hash: e.hash, seen: e.seen };
    return out;
  });
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>(rooms[0]?.slug ?? '');
  const [openNotes, setOpenNotes] = useState<ReadonlySet<string>>(() => {
    const open = new Set<string>();
    for (const [room, e] of mineInit) for (const id of Object.keys(e.notes)) open.add(`${room}|${id}`);
    return open;
  });

  const draftsRef = useRef(drafts);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflight = useRef<Record<string, boolean>>({});
  const again = useRef<Record<string, boolean>>({});
  const retries = useRef<Record<string, number>>({});
  const saveStateRef = useRef(saveState);
  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  // 주소의 #방 으로 바로 연다(다른 가족에게 「#toybox」 링크를 보낼 수 있게)
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (rooms.some((r) => r.slug === h)) setCurrent(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [rooms]);

  // 다시 하기·이어 저장은 이 줄을 거친다(flush가 자기 자신을 부르지 않게)
  const flushRef = useRef<(slug: string) => void>(() => {});
  const flush = useCallback(async (slug: string) => {
    clearTimeout(timers.current[slug]);
    if (inflight.current[slug]) {
      again.current[slug] = true;
      return;
    }
    inflight.current[slug] = true;
    setSaveState((p) => ({ ...p, [slug]: 'saving' }));
    let res: Awaited<ReturnType<typeof saveRoomVoice>>;
    try {
      res = await saveRoomVoice(slug, draftsRef.current[slug] ?? EMPTY);
    } catch {
      res = { ok: false, error: 'save_failed' };
    }
    inflight.current[slug] = false;
    if (res.ok) {
      retries.current[slug] = 0;
      const seen = rooms.find((r) => r.slug === slug)?.items.map((i) => i.id) ?? [];
      setMeta((p) => ({ ...p, [slug]: { updatedAt: res.updatedAt, version: res.version, hash: res.hash, seen } }));
      setSaveState((p) => ({ ...p, [slug]: again.current[slug] ? 'dirty' : 'saved' }));
      setSaveError(null);
    } else {
      setSaveState((p) => ({ ...p, [slug]: 'error' }));
      setSaveError(res.error);
      const n = (retries.current[slug] ?? 0) + 1;
      retries.current[slug] = n;
      // 잠깐 끊긴 것이면 저절로 다시(세 번까지). 권한·모양 문제는 다시 해도 같으니 두지 않는다
      if (n <= 3 && (res.error === 'save_failed' || res.error === 'not_ready')) {
        timers.current[slug] = setTimeout(() => flushRef.current(slug), RETRY_MS);
      }
    }
    if (again.current[slug]) {
      again.current[slug] = false;
      flushRef.current(slug);
    }
  }, [rooms]);
  useEffect(() => {
    flushRef.current = (slug: string) => void flush(slug);
  }, [flush]);

  const update = useCallback((slug: string, fn: (d: Draft) => Draft, now = false) => {
    const next = { ...draftsRef.current, [slug]: fn(draftsRef.current[slug] ?? EMPTY) };
    draftsRef.current = next;
    setDrafts(next);
    setSaveState((p) => ({ ...p, [slug]: 'dirty' }));
    clearTimeout(timers.current[slug]);
    if (now) void flush(slug);
    else timers.current[slug] = setTimeout(() => void flush(slug), SAVE_AFTER_MS);
  }, [flush]);

  // 화면을 떠나거나 다른 앱으로 가면 기다리던 저장을 바로 보낸다. 아직 저장 중이면 떠나기 전에 한 번 묻는다
  useEffect(() => {
    const flushAll = () => {
      for (const slug of Object.keys(timers.current)) {
        if (saveStateRef.current[slug] === 'dirty') void flush(slug);
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const pending = Object.values(saveStateRef.current).some((v) => v === 'dirty' || v === 'saving');
      if (!pending) return;
      flushAll();
      e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flush]);

  const room = rooms.find((r) => r.slug === current) ?? rooms[0];
  if (!room) return null;

  const pick = (slug: string) => {
    setCurrent(slug);
    window.history.replaceState(null, '', `#${slug}`);
    document.getElementById('voice-room')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const others = entries.filter((e) => !e.mine);

  return (
    <div className={s.board}>
      <section className={`card ${s.intro}`}>
        <p style={{ margin: 0 }}>
          {t(
            '지금 지어진 방 그대로예요. 하나씩 「좋아요 · 바꿀래요 · 빼 주세요」를 고르고, 하고 싶은 말은 「✎ 한마디」에 적어 주세요. 고르고 쓰는 대로 저장돼요.',
            'These are the rooms as they are built now. Mark each thing Keep, Change or Remove, and write anything else under “✎ Note”. Everything saves as you go.',
          )}
        </p>
        <p className={`small muted ${s.versionLine}`}>
          {t(`지금 집 버전 v${appVersion}`, `House version v${appVersion}`)}
          {' · '}
          {t('방을 고쳐 올리면 이 목록도 같이 바뀌고, 방마다 바뀐 버전과 시각이 적혀요.', 'When a room is updated, this list follows it and each room shows when it changed.')}
        </p>
        {loadFailed ? (
          <p className="small" role="alert" style={{ margin: 0 }}>
            {t('지난 의견을 불러오지 못했어요. 새로 고침해 주세요.', 'Could not load earlier feedback. Please reload.')}
          </p>
        ) : null}
      </section>

      <nav className={s.rooms} aria-label={t('방 고르기', 'Choose a room')}>
        {rooms.map((r) => {
          const d = drafts[r.slug];
          const m = meta[r.slug];
          const top = stamps[r.slug]?.history[0];
          const changed = Boolean(m?.hash && top && m.hash !== top.hash);
          const status = d?.status === 'done' ? 'done' : d && (Object.keys(d.marks).length || Object.keys(d.notes).length || Object.keys(d.answers).length) ? 'draft' : 'none';
          const count = entries.filter((e) => e.room === r.slug && !e.mine).length;
          return (
            <button
              key={r.slug}
              type="button"
              className={s.roomTab}
              aria-pressed={r.slug === room.slug}
              onClick={() => pick(r.slug)}
            >
              <strong lang={lang === 'en' && placeName('en', r.nameKo) === r.nameKo ? 'ko' : undefined}>{placeName(lang, r.nameKo)}</strong>
              {owners[r.slug] ? <span className={s.owner} lang="ko">{owners[r.slug]}</span> : null}
              <span className={s.tabMeta}>
                <span className={s.status} data-status={status}>
                  {status === 'done' ? t('다 썼어요', 'Done') : status === 'draft' ? t('쓰는 중', 'In progress') : t('아직', 'Not yet')}
                </span>
                {changed ? <span className={s.badgeNew}>{t('방이 바뀜', 'Updated')}</span> : null}
                {count ? <span className="small muted">{t(`가족 ${count}`, `${count} from family`)}</span> : null}
              </span>
              {top ? <span className={`small muted ${s.tabStamp}`}>v{top.version} · {when(lang, top.at)}</span> : null}
            </button>
          );
        })}
      </nav>

      <RoomPanel
        key={room.slug}
        room={room}
        owner={owners[room.slug] ?? null}
        stamp={stamps[room.slug] ?? null}
        draft={drafts[room.slug] ?? EMPTY}
        meta={meta[room.slug] ?? null}
        state={saveState[room.slug] ?? null}
        error={saveError}
        openNotes={openNotes}
        lang={lang}
        t={t}
        onMark={(id, mark) =>
          update(room.slug, (d) => {
            const marks = { ...d.marks };
            if (marks[id] === mark) delete marks[id];
            else marks[id] = mark;
            return { ...d, marks };
          })
        }
        onNote={(id, text) =>
          update(room.slug, (d) => {
            const notes = { ...d.notes };
            if (text) notes[id] = text;
            else delete notes[id];
            return { ...d, notes };
          })
        }
        onAnswer={(id, text) =>
          update(room.slug, (d) => {
            const answers = { ...d.answers };
            if (text) answers[id] = text;
            else delete answers[id];
            return { ...d, answers };
          })
        }
        onToggleNote={(id) =>
          setOpenNotes((p) => {
            const key = `${room.slug}|${id}`;
            const next = new Set(p);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onDone={(done) => update(room.slug, (d) => ({ ...d, status: done ? 'done' : 'draft' }), true)}
      />

      <section className="stack" aria-labelledby="voice-all">
        <div className={s.allHead}>
          <h2 id="voice-all" style={{ margin: 0 }}>{t('가족 의견 모아 보기', 'Everyone’s feedback')}</h2>
          <button type="button" className="btn btn-small" onClick={() => router.refresh()}>
            {t('새로 불러오기', 'Refresh')}
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t('다른 가족이 남긴 의견이에요. 내 의견은 위 방에서 바로 고칠 수 있어요.', 'What the rest of the family wrote. Edit your own above.')}
        </p>
        {others.length === 0 ? (
          <p className="note-box">{t('아직 다른 가족의 의견이 없어요.', 'No one else has written yet.')}</p>
        ) : (
          rooms
            .filter((r) => others.some((e) => e.room === r.slug))
            .map((r) => (
              <div key={r.slug} className="card stack">
                <h3 style={{ margin: 0 }}>
                  <button type="button" className={s.linkBtn} onClick={() => pick(r.slug)}>{placeName(lang, r.nameKo)}</button>
                  {owners[r.slug] ? <span className={s.owner} lang="ko"> {owners[r.slug]}</span> : null}
                </h3>
                {others.filter((e) => e.room === r.slug).map((e) => (
                  <EntryView key={`${e.room}-${e.writer}-${e.updatedAt}`} entry={e} room={r} stamp={stamps[r.slug] ?? null} lang={lang} t={t} />
                ))}
              </div>
            ))
        )}
      </section>
    </div>
  );
}

function itemName(lang: Lang, it: VoiceItem): string {
  return lang === 'en' ? (it.en ?? placeName('en', it.ko)) : it.ko;
}

function itemDetail(lang: Lang, it: VoiceItem): string | null {
  if (!it.detailKo) return null;
  return lang === 'en' ? (it.detailEn ?? houseLine('en', it.detailKo)) : it.detailKo;
}

function StampLine({ entry, names, lang, t }: { entry: StampView; names: Record<string, string>; lang: Lang; t: (ko: string, en: string) => string }) {
  const added = entry.added.map((id) => names[id] ?? id);
  const removed = entry.removed.map((r) => r.ko);
  return (
    <li>
      <strong>v{entry.version}</strong> · {when(lang, entry.at)}
      {added.length ? <> · {t('새로', 'Added')}: <span lang="ko">{added.join(', ')}</span></> : null}
      {removed.length ? <> · {t('빠짐', 'Removed')}: <span lang="ko">{removed.join(', ')}</span></> : null}
      {entry.first ? <> · {t('의견함에 처음 올라옴', 'First listed here')}</> : null}
      {!entry.first && !added.length && !removed.length ? <> · {t('모양·배치·설명이 바뀜', 'Look, layout or wording changed')}</> : null}
    </li>
  );
}

function RoomPanel({
  room, owner, stamp, draft, meta, state, error, openNotes, lang, t, onMark, onNote, onAnswer, onToggleNote, onDone,
}: {
  room: VoiceRoom;
  owner: string | null;
  stamp: StampRoomView | null;
  draft: Draft;
  meta: Meta | null;
  state: SaveState | null;
  error: string | null;
  openNotes: ReadonlySet<string>;
  lang: Lang;
  t: (ko: string, en: string) => string;
  onMark: (id: string, mark: Mark) => void;
  onNote: (id: string, text: string) => void;
  onAnswer: (id: string, text: string) => void;
  onToggleNote: (id: string) => void;
  onDone: (done: boolean) => void;
}) {
  const voice = room.kid ? 'kid' : 'adult';
  const top = stamp?.history[0] ?? null;
  const ids = room.items.map((i) => i.id);
  const since = meta && top && meta.hash && meta.hash !== top.hash ? changesSince(meta.seen, ids) : null;
  const names = stamp?.names ?? {};
  const questions: VoiceQuestion[] = voiceQuestions(room.slug);
  const goneWithWords = since
    ? since.removed.filter((id) => draft.marks[id] || draft.notes[id])
    : [];

  return (
    <section id="voice-room" className={`card stack ${s.panel}`} aria-labelledby="voice-room-title">
      <div className={s.panelHead}>
        <div>
          <h2 id="voice-room-title" style={{ margin: 0 }}>
            {placeName(lang, room.nameKo)}
            {owner ? <span className={s.owner} lang="ko"> {owner}</span> : null}
          </h2>
          <p className="muted" style={{ margin: '6px 0 0' }}>{houseLine(lang, room.lineKo)}</p>
        </div>
        <SaveBadge state={state} meta={meta} error={error} lang={lang} t={t} />
      </div>

      {top ? (
        <details className={s.stamp}>
          <summary>
            {t('이 방이 마지막으로 바뀐 때', 'Last changed')}: <strong>v{top.version}</strong> · {when(lang, top.at)}
          </summary>
          <ul className="small">
            {stamp!.history.map((h) => <StampLine key={`${h.hash}-${h.at}`} entry={h} names={names} lang={lang} t={t} />)}
          </ul>
        </details>
      ) : null}

      {since ? (
        <div className={s.changed} role="note">
          <strong>{t('의견을 쓴 뒤 방이 바뀌었어요.', 'This room changed after you wrote.')}</strong>{' '}
          {t(
            `v${meta!.version || '?'}에서 썼고 지금은 v${top!.version}이에요. 「새로」 붙은 것을 봐 주세요.`,
            `You wrote on v${meta!.version || '?'}; it is now v${top!.version}. Check the items marked New.`,
          )}
          {goneWithWords.length ? (
            <p className="small" style={{ margin: '6px 0 0' }}>
              {t('지금은 없는 것(내가 남긴 표시와 한마디는 그대로 있어요)', 'No longer in the room (your marks and notes are kept)')}:{' '}
              <span lang="ko">{goneWithWords.map((id) => names[id] ?? id).join(', ')}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {room.items.length === 0 ? (
        <p className="note-box" style={{ margin: 0 }}>
          {t('아직 지어진 장면이 없는 방이에요. 아래 질문에 무엇으로 채울지 적어 주세요.', 'This room is not built yet. Tell us below what should fill it.')}
        </p>
      ) : (
        GROUPS.filter((g) => room.items.some((i) => i.group === g)).map((g) => (
          <fieldset key={g} className={s.group}>
            <legend>{t(GROUP_LABEL[voice][g].ko, GROUP_LABEL[voice][g].en)}</legend>
            <ul className={s.items}>
              {room.items.filter((i) => i.group === g).map((it) => {
                const noteKey = `${room.slug}|${it.id}`;
                const noteOpen = openNotes.has(noteKey) || Boolean(draft.notes[it.id]);
                const detail = itemDetail(lang, it);
                const name = itemName(lang, it);
                const isNew = since?.added.has(it.id) ?? false;
                return (
                  <li key={it.id} className={s.item} data-mark={draft.marks[it.id] ?? undefined}>
                    <div className={s.itemText}>
                      <span className={s.itemName} lang={lang === 'en' && name === it.ko ? 'ko' : undefined}>
                        {name}
                        {it.count ? <span className="muted"> ×{it.count}</span> : null}
                        {isNew ? <span className={s.badgeNew}>{t('새로', 'New')}</span> : null}
                      </span>
                      {detail ? <span className={`small muted ${s.itemDetail}`}>{detail}</span> : null}
                      {it.parts?.length ? (
                        <span className={`small ${s.parts}`}>
                          {t('놓인 것', 'Object')}: {it.parts.map((p) => `${lang === 'en' ? p.en : p.ko}${p.count > 1 ? ` ×${p.count}` : ''}`).join(', ')}
                        </span>
                      ) : null}
                    </div>
                    <div className={s.marks} role="group" aria-label={t(`${it.ko} 표시`, `Mark for ${name}`)}>
                      {MARKS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`chip ${s.mark}`}
                          data-kind={m}
                          aria-pressed={draft.marks[it.id] === m}
                          onClick={() => onMark(it.id, m)}
                        >
                          {t(MARK_LABEL[voice][m].ko, MARK_LABEL[voice][m].en)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`chip ${s.mark}`}
                        aria-expanded={noteOpen}
                        aria-controls={`note-${it.id}`}
                        onClick={() => onToggleNote(it.id)}
                      >
                        ✎ {t('한마디', 'Note')}
                      </button>
                    </div>
                    {noteOpen ? (
                      <textarea
                        id={`note-${it.id}`}
                        className={s.note}
                        rows={2}
                        maxLength={600}
                        value={draft.notes[it.id] ?? ''}
                        placeholder={room.kid ? t('어떻게 바뀌면 좋겠어?', 'How should it change?') : t('어떻게 바꾸면 좋을지, 좋은 점, 참고할 것', 'How to change it, what you like, references')}
                        aria-label={t(`${it.ko}에 한마디`, `Note on ${name}`)}
                        onChange={(e) => onNote(it.id, e.target.value)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))
      )}

      <fieldset className={s.group}>
        <legend>{room.kid ? t('더 하고 싶은 말', 'Tell us more') : t('더 묻고 싶은 것', 'A few questions')}</legend>
        <div className="stack">
          {questions.map((q) => (
            <label key={q.id} className={s.question}>
              <span className={s.qLabel}>{t(q.ko, q.en)}</span>
              {q.hintKo ? <span className="small muted">{t(q.hintKo, q.hintEn ?? q.hintKo)}</span> : null}
              {q.long ? (
                <textarea rows={3} maxLength={2000} value={draft.answers[q.id] ?? ''} onChange={(e) => onAnswer(q.id, e.target.value)} />
              ) : (
                <input type="text" maxLength={2000} value={draft.answers[q.id] ?? ''} onChange={(e) => onAnswer(q.id, e.target.value)} />
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={s.footer}>
        <SaveBadge state={state} meta={meta} error={error} lang={lang} t={t} />
        {draft.status === 'done' ? (
          <button type="button" className="btn" onClick={() => onDone(false)}>{t('아직 더 쓸래요', 'Keep editing')}</button>
        ) : (
          <button type="button" className="btn btn-pine" onClick={() => onDone(true)}>{t('이 방은 다 썼어요', 'Done with this room')}</button>
        )}
      </div>
    </section>
  );
}

function SaveBadge({ state, meta, error, lang, t }: { state: SaveState | null; meta: Meta | null; error: string | null; lang: Lang; t: (ko: string, en: string) => string }) {
  if (state === 'saving') return <span className={`small ${s.save}`} role="status">{t('저장 중…', 'Saving…')}</span>;
  if (state === 'dirty') return <span className={`small muted ${s.save}`} role="status">{t('곧 저장해요', 'Saving soon')}</span>;
  if (state === 'error') {
    const w = error && ERROR_WORD[error] ? ERROR_WORD[error] : ['저장하지 못했어요. 잠시 뒤 다시 해 볼게요.', 'Could not save. Trying again shortly.'];
    return <span className={`small ${s.save} ${s.saveError}`} role="alert">{t(w[0], w[1])}</span>;
  }
  if (meta?.updatedAt) {
    return (
      <span className={`small muted ${s.save}`} role="status">
        {t('저장됨', 'Saved')} · {when(lang, meta.updatedAt)}{meta.version ? ` · v${meta.version}` : ''}
      </span>
    );
  }
  return <span className={`small muted ${s.save}`}>{t('아직 저장한 것이 없어요', 'Nothing saved yet')}</span>;
}

function EntryView({ entry, room, stamp, lang, t }: { entry: VoiceEntry; room: VoiceRoom; stamp: StampRoomView | null; lang: Lang; t: (ko: string, en: string) => string }) {
  const voice = room.kid ? 'kid' : 'adult';
  const byId = new Map(room.items.map((i) => [i.id, i]));
  const names = stamp?.names ?? {};
  const nameOf = (id: string) => {
    const it = byId.get(id);
    return it ? itemName(lang, it) : names[id] ?? id;
  };
  const top = stamp?.history[0] ?? null;
  const changed = Boolean(entry.hash && top && entry.hash !== top.hash);
  const questions = voiceQuestions(room.slug);
  const qLabel = (id: string) => {
    const q = questions.find((x) => x.id === id);
    return q ? t(q.ko, q.en) : id;
  };
  const ordered = room.items.map((i) => i.id);
  const extra = [...new Set([...Object.keys(entry.marks), ...Object.keys(entry.notes)])].filter((id) => !byId.has(id));
  const ids = [...ordered, ...extra].filter((id) => entry.marks[id] || entry.notes[id]);
  const keepCount = Object.values(entry.marks).filter((m) => m === 'keep').length;
  const shown = ids.filter((id) => entry.marks[id] !== 'keep' || entry.notes[id]);

  return (
    <article className={s.entry}>
      <header className={s.entryHead}>
        <strong lang="ko">{entry.writer}</strong>
        <span className={s.status} data-status={entry.status === 'done' ? 'done' : 'draft'}>
          {entry.status === 'done' ? t('다 썼어요', 'Done') : t('쓰는 중', 'In progress')}
        </span>
        <span className="small muted">
          {entry.version ? `v${entry.version} · ` : ''}{when(lang, entry.updatedAt)}
        </span>
        {changed ? <span className={s.badgeNew}>{t('쓴 뒤 방이 바뀜', 'Room changed since')}</span> : null}
      </header>
      {keepCount ? (
        <p className="small muted" style={{ margin: 0 }}>
          {t(`「${MARK_LABEL[voice].keep.ko}」 ${keepCount}개`, `${keepCount} marked Keep`)}
        </p>
      ) : null}
      {shown.length ? (
        <ul className={s.entryList}>
          {shown.map((id) => (
            <li key={id}>
              {entry.marks[id] ? (
                <span className={s.markTag} data-kind={entry.marks[id]}>
                  {t(MARK_LABEL[voice][entry.marks[id]].ko, MARK_LABEL[voice][entry.marks[id]].en)}
                </span>
              ) : null}{' '}
              <span lang={byId.has(id) ? undefined : 'ko'}>{nameOf(id)}</span>
              {!byId.has(id) ? <span className="small muted"> ({t('지금은 없음', 'gone now')})</span> : null}
              {entry.notes[id] ? <span className={s.noteText} lang="ko"> — {entry.notes[id]}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {Object.keys(entry.answers).length ? (
        <dl className={s.answers}>
          {Object.entries(entry.answers).map(([id, text]) => (
            <div key={id}>
              <dt>{qLabel(id)}</dt>
              <dd lang="ko">{text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
