'use client';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { CHAT_BODY_MAX, CHAT_MENTIONS_MAX, CHAT_MINUTE_MAX, CHAT_REASON_TEXT, charCount, cleanBody, type ChatMessage, type ChatReason } from '@/lib/social';
import { chatReasonEn, newMessagesEn, peopleEn } from '../hud-text';
import { IconClose, IconPeople } from '../icons';
import { trapTab, useDialogFocus } from '../useDialogFocus';
import { AvatarThumb } from './AvatarThumb';
import { filterPeople, insertMention, keptMentions, mentionAt, mentionsMe, segments, type Person } from './mention';
import { placeLabel, timeLabel } from './places';
import s from './social.module.css';
import type { ChatFeed, SendResult } from './useChatFeed';
import type { OnlinePerson } from './useOnline';
import type { SocialMe } from './useSocialMe';

type Props = {
  me: SocialMe | null;
  feed: ChatFeed;
  /** 지금 접속한 사람(나 빼고). @ 고르기와 머리글 숫자에 쓴다 */
  people: OnlinePerson[];
  peopleSynced: boolean;
  coarse: boolean;
  /** 이 사람을 @멘션한 채로 연다 */
  prefill: Person | null;
  onPrefillUsed: () => void;
  /** 이 글로 스크롤해 잠깐 밝힌다(멘션 카드를 눌렀을 때) */
  focusId: string | null;
  onSend: (body: string, mentions: Person[]) => Promise<SendResult>;
  onClose: () => void;
  onPeople: () => void;
  /** @ 고르기 목록이 열려 있는지(Esc를 목록 닫기에 먼저 쓴다) */
  pickerOpenRef: RefObject<boolean>;
};

const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

/** 알림 한 줄(한국어·영어). 서버가 준 한국어 글은 그대로 두고, 영어는 까닭 코드로 고른다 */
type Notice = { ko: string; en: string };
const LIMITS = { body: CHAT_BODY_MAX, mentions: CHAT_MENTIONS_MAX, minute: CHAT_MINUTE_MAX };
const reasonNotice = (reason: ChatReason, ko: string = CHAT_REASON_TEXT[reason]): Notice => ({ ko, en: chatReasonEn(reason, LIMITS) });
/** 한글이 섞였는가(표에 없는 방 이름) */
const hasKo = (s: string) => /[가-힣]/.test(s);

/**
 * 휴대폰 화면 자판이 가린 만큼(px)과 보이는 높이. 자판이 아래를 덮으면 창을 그 위로 올린다(입력칸이 가려지지 않게).
 * 브라우저가 화면 크기를 줄이지 않고 자판을 덮어 띄우는 경우(iOS, 요즘 안드로이드 Chrome)에만 값이 생긴다
 */
function useKeyboardBox(active: boolean): { bottom: number; height: number } | null {
  const [box, setBox] = useState<{ bottom: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!active || !vv) return;
    const read = () => {
      const bottom = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
      setBox(bottom > 60 ? { bottom: Math.round(bottom), height: Math.round(vv.height) } : null);
    };
    read();
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, [active]);
  return active ? box : null;
}
/** 맨 아래에서 이만큼(px) 안이면 새 글이 올 때 따라 내려간다 */
const STICK_PX = 80;

// 대화창: 전체 이력(위로 올리면 옛 글), 실시간 새 글, @ 멘션 고르기, 내 글 지우기.
// 데스크탑은 오른쪽 세로 창(걸으면서 볼 수 있다), 휴대폰은 아래에서 올라오는 창.
// 화면 말은 한국어·영어를 따르고, 이름과 글(사람이 쓴 말)은 한국어 그대로 lang="ko"로 둔다.
export function ChatPanel({ me, feed, people, peopleSynced, coarse, prefill, onPrefillUsed, focusId, onSend, onClose, onPeople, pickerOpenRef }: Props) {
  const lang = useLang();
  const tr = useTr();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState<Person[]>([]);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [lit, setLit] = useState<string | null>(null);
  const stick = useRef(true);
  const older = useRef<{ height: number; top: number } | null>(null);
  const loadingOlder = useRef(false);
  const lastCount = useRef(0);
  const canChat = Boolean(me?.canChat);
  const { messages } = feed;
  const kb = useKeyboardBox(coarse);

  // 열 때: 데스크탑은 바로 입력칸에, 휴대폰은 제목에(자판이 화면을 덮으니 입력칸을 누를 때까지 둔다). 닫으면 열기 전 자리로
  const title = useRef<HTMLHeadingElement>(null);
  useDialogFocus(coarse ? title : input);

  // 「멘션하기」로 열었으면 그 사람을 넣은 채로
  useEffect(() => {
    if (!prefill) return;
    const t = `@${prefill.name} `;
    queueMicrotask(() => {
      setText(t);
      setCaret(t.length);
      setPicked([prefill]);
      setDismissed(null);
      onPrefillUsed();
      const el = input.current;
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(t.length, t.length);
      }
    });
  }, [prefill, onPrefillUsed]);

  // 글이 바뀌면: 옛 글을 앞에 붙였으면 보던 자리를 지키고, 맨 아래였으면 따라 내려가고, 아니면 「새 글」 수를 센다
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const added = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (older.current) {
      el.scrollTop = older.current.top + (el.scrollHeight - older.current.height);
      older.current = null;
      return;
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (added > 0) queueMicrotask(() => setUnseen((n) => n + added));
  }, [messages]);

  // 멘션 카드로 열었으면 그 글로(한 번만: 그 뒤 새 글이 와도 다시 끌고 가지 않는다)
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focused.current === focusId) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusId)}"]`);
    if (!el) return;
    focused.current = focusId;
    stick.current = false;
    el.scrollIntoView({ block: 'center' });
    queueMicrotask(() => setLit(focusId));
    const t = window.setTimeout(() => setLit(null), 2400);
    return () => window.clearTimeout(t);
  }, [focusId, messages]);

  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirm]);

  const [fetchingOlder, setFetchingOlder] = useState(false);
  /** 가진 가장 옛 글 앞의 한 쪽을 받아 위에 붙인다(보던 자리는 그대로) */
  const loadOlder = () => {
    const el = list.current;
    if (!el || !feed.more || feed.state !== 'ready' || loadingOlder.current) return;
    loadingOlder.current = true;
    setFetchingOlder(true);
    older.current = { height: el.scrollHeight, top: el.scrollTop };
    // 붙일 옛 글이 없었으면(실패 등) 다음 그림에서 자리 기억을 버린다(다음 새 글이 엉뚱하게 자리를 옮기지 않게)
    void feed.loadOlder().finally(() => requestAnimationFrame(() => {
      older.current = null;
      loadingOlder.current = false;
      setFetchingOlder(false);
    }));
  };
  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    if (stick.current && unseen) setUnseen(0);
    // 위로 끝까지 올리면 저절로(글이 적어 올릴 수 없을 때는 맨 위의 「옛 글 더 보기」로)
    if (el.scrollTop < 40) loadOlder();
  };
  const toBottom = () => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setUnseen(0);
  };

  // @ 고르기
  const at = mentionAt(text, caret);
  const choices = useMemo(
    () => (at && at.start !== dismissed && canChat ? filterPeople(people, at.query, me?.sub) : []),
    [at, dismissed, canChat, people, me?.sub],
  );
  const showPicker = Boolean(at) && at?.start !== dismissed && canChat;
  useEffect(() => {
    pickerOpenRef.current = showPicker;
  });
  const choose = (p: Person) => {
    if (!at) return;
    const next = insertMention(text, at.start, caret, p.name);
    setText(next.text);
    setCaret(next.caret);
    setPicked((list0) => (list0.some((x) => x.sub === p.sub) ? list0 : [...list0, p]));
    setPick(0);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const send = async () => {
    if (!canChat || sending) return;
    const body = cleanBody(text);
    if (!body) return;
    if (charCount(body) > CHAT_BODY_MAX) {
      setNotice(reasonNotice('too_long'));
      return;
    }
    setSending(true);
    const r = await onSend(body, keptMentions(body, picked, CHAT_MENTIONS_MAX));
    setSending(false);
    if (r.ok) {
      setText('');
      setCaret(0);
      setPicked([]);
      setNotice(null);
      toBottom();
    } else setNotice(reasonNotice(r.reason, r.text));
  };

  const count = charCount(text);
  const n = peopleSynced ? people.length + 1 : null;
  // 알림 줄은 빈 글이면 CSS(:empty)가 접으므로 고른 말 하나만 글로 넣는다
  const tip = notice
    ? tr(notice.ko, notice.en)
    : !canChat
      ? tr('대화 준비 중이에요. 잠시 뒤에 다시 열어 주세요.', 'Chat is getting ready. Please open it again in a moment.')
      : count > CHAT_BODY_MAX - 40
        ? tr(`${count} / ${CHAT_BODY_MAX}자`, `${count} / ${CHAT_BODY_MAX} characters`)
        : coarse ? '' : tr('Enter 보내기 · @ 멘션 · Esc 닫기', 'Enter to send · @ to mention · Esc to close');

  return (
    <section
      className={`walk-social ${s.sheet}`}
      role="dialog"
      aria-label={tr('대화', 'Chat')}
      onKeyDown={trapTab}
      data-coarse={coarse ? 'true' : undefined}
      style={kb ? { top: 'auto', height: 'auto', bottom: kb.bottom + 8, maxHeight: Math.max(160, kb.height - 16) } : undefined}
    >
      <header className={s.head}>
        <h2 ref={title} className={s.title} tabIndex={-1}><T ko="대화" en="Chat" /></h2>
        <span className={s.live} data-on={feed.live ? 'true' : undefined}>{feed.live ? <T ko="실시간" en="Live" /> : <T ko="잠깐씩 새로 받아요" en="Updates every few seconds" />}</span>
        <button type="button" className={s.headBtn} onClick={onPeople} aria-label={n ? tr(`접속자 ${n}명 보기`, `See the ${peopleEn(n)} here`) : tr('접속자 보기', 'See people here')}>
          <IconPeople size={18} />
          <span>{n ? <T ko={`${n}명`} en={peopleEn(n)} /> : <T ko="접속자" en="People here" />}</span>
        </button>
        <button type="button" className={s.x} onClick={onClose} aria-label={tr('대화창 닫기', 'Close chat')} aria-keyshortcuts="Escape">
          <IconClose size={18} />
        </button>
      </header>

      <ol ref={list} className={s.list} onScroll={onScroll} aria-label={tr('대화 기록', 'Chat log')} aria-live="polite" aria-relevant="additions">
        {feed.state === 'loading' ? <li className={s.notice}><T ko="대화를 불러오는 중이에요" en="Loading the chat" /></li> : null}
        {feed.state === 'error' ? <li className={s.notice}><T ko="대화를 불러오지 못했어요. 닫았다가 다시 열어 주세요." en="Couldn’t load the chat. Close it and open it again." /></li> : null}
        {feed.state === 'ready' && !feed.more && messages.length > 0 ? <li className={s.notice}><T ko="처음 글이에요" en="That’s the very first message" /></li> : null}
        {feed.state === 'ready' && feed.more && messages.length > 0 ? (
          <li className={s.olderRow}>
            <button type="button" className={s.older} onClick={loadOlder} disabled={fetchingOlder}>
              {fetchingOlder ? <T ko="옛 글을 받는 중이에요" en="Loading older messages" /> : <T ko="옛 글 더 보기" en="See older messages" />}
            </button>
          </li>
        ) : null}
        {feed.state === 'ready' && messages.length === 0 ? (
          <li className={s.notice}><T ko="아직 대화가 없어요. 먼저 인사를 남겨 보세요." en="No one has chatted yet. Why not say hello first?" /></li>
        ) : null}
        {messages.map((m) => (
          <Message
            key={m.id}
            m={m}
            me={me}
            lang={lang}
            lit={lit === m.id}
            confirm={confirm === m.id}
            onAsk={() => setConfirm(m.id)}
            onCancel={() => setConfirm(null)}
            onDelete={async () => {
              setConfirm(null);
              if (!(await feed.remove(m.id))) setNotice({ ko: '지우지 못했어요. 다시 해 주세요.', en: 'Couldn’t delete it. Please try again.' });
            }}
          />
        ))}
      </ol>
      {unseen > 0 ? (
        <button type="button" className={s.newPill} onClick={toBottom}><T ko={`새 글 ${unseen}개 ↓`} en={`${newMessagesEn(unseen)} ↓`} /></button>
      ) : null}

      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {showPicker ? (
          <ul id={listId} className={s.picker} role="listbox" aria-label={tr('멘션할 사람', 'People to mention')}>
            {choices.length === 0 ? (
              <li className={s.pickEmpty}>
                {peopleSynced ? <T ko="그 이름의 접속자가 없어요" en="No one here by that name" /> : <T ko="접속한 사람을 불러오는 중이에요" en="Loading the people here" />}
              </li>
            ) : (
              choices.map((p, i) => (
                <li key={p.sub} id={`${listId}-${i}`} role="option" aria-selected={i === pick}>
                  <button
                    type="button"
                    className={i === pick ? s.pickOn : s.pickItem}
                    // 누르는 동안 입력칸이 초점을 잃지 않게(한글 조합이 끊기지 않게)
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(p)}
                  >
                    <AvatarThumb look={p.look} name={p.name} size={24} />
                    <span className={s.pickName} lang="ko">{p.name}</span>
                    <PickWhere space={p.space} lang={lang} />
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
        <input
          ref={input}
          className={s.input}
          type="text"
          value={text}
          disabled={!canChat}
          enterKeyHint="send"
          autoComplete="off"
          maxLength={CHAT_BODY_MAX * 2}
          aria-label={tr(`할 말(${CHAT_BODY_MAX}자까지, @로 멘션)`, `Message (up to ${CHAT_BODY_MAX} characters, @ to mention)`)}
          role="combobox"
          aria-expanded={showPicker}
          aria-controls={showPicker ? listId : undefined}
          aria-activedescendant={showPicker && choices.length > 0 ? `${listId}-${Math.min(pick, choices.length - 1)}` : undefined}
          aria-autocomplete="list"
          placeholder={canChat ? tr('모두에게 할 말 · @이름으로 멘션', 'Say something to everyone · @name to mention') : tr('대화 준비 중', 'Getting chat ready')}
          onChange={(e) => {
            // 고르기 목록과 글자 수는 한글 조합 중에도 바로 따라간다
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setNotice(null);
            setPick(0);
            if (dismissed !== null && !mentionAt(e.target.value, e.target.selectionStart ?? 0)) setDismissed(null);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onCompositionEnd={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            // Enter의 기본 동작(폼 보내기)은 늘 막는다: 조합을 끝내는 Enter가 폼을 보내 버리지 않게. 보내기는 아래에서만
            if (e.key === 'Enter') e.preventDefault();
            // 조합 중의 Enter·Tab·화살표·Esc는 글자를 확정하는 몫이다(보내기·고르기를 하지 않는다)
            if (composing(e)) return;
            if (showPicker && choices.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const d = e.key === 'ArrowDown' ? 1 : -1;
                setPick((i) => (i + d + choices.length) % choices.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                choose(choices[Math.min(pick, choices.length - 1)]);
                return;
              }
            }
            if (showPicker && e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (at) setDismissed(at.start);
              return;
            }
            if (e.key === 'Enter') void send();
          }}
        />
        <button type="submit" className="btn btn-small btn-roof" disabled={!canChat || sending || !text.trim()}><T ko="보내기" en="Send" /></button>
        <p className={s.tip} role="status">{tip}</p>
      </form>
    </section>
  );
}

/** 고르기 목록의 있는 곳(표에 없는 방 이름이면 lang="ko") */
function PickWhere({ space, lang }: { space: string | null; lang: 'ko' | 'en' }) {
  const where = placeLabel(space, lang);
  return <span className={s.pickWhere} lang={lang === 'en' && hasKo(where) ? 'ko' : undefined}>{where}</span>;
}

function Message({ m, me, lang, lit, confirm, onAsk, onCancel, onDelete }: {
  m: ChatMessage; me: SocialMe | null; lang: 'ko' | 'en'; lit: boolean; confirm: boolean;
  onAsk: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const en = lang === 'en';
  const where = placeLabel(m.space, lang);
  const toMe = mentionsMe(m.mentions, me?.sub);
  const canDelete = m.mine || Boolean(me?.admin);
  return (
    <li className={s.msg} data-id={m.id} data-mine={m.mine ? 'true' : undefined} data-to-me={toMe ? 'true' : undefined} data-lit={lit ? 'true' : undefined}>
      <AvatarThumb look={m.look} name={m.name} size={32} />
      <div className={s.msgMain}>
        <p className={s.msgHead}>
          <b className={s.name} lang={m.mine ? undefined : 'ko'}>
            {m.mine ? <T ko={`${m.name} (나)`} en={<><span lang="ko">{m.name}</span> (you)</>} /> : m.name}
          </b>
          <span className={s.meta}>
            {where ? <><span lang={en && hasKo(where) ? 'ko' : undefined}>{where}</span> · </> : ''}
            <time dateTime={new Date(m.ms).toISOString()}>{timeLabel(m.ms, undefined, lang)}</time>
            {m.via === 'say' ? (en ? ' · speech bubble' : ' · 말풍선') : ''}
          </span>
        </p>
        <p className={s.body} lang="ko">
          {segments(m.body, m.mentions).map((g, i) => (g.mention
            ? <strong key={i} className={s.mention} data-me={g.mention === me?.sub ? 'true' : undefined}>{g.text}</strong>
            : <span key={i}>{g.text}</span>))}
        </p>
      </div>
      {canDelete ? (
        confirm ? (
          <span className={s.delAsk}>
            <button type="button" className={s.delYes} onClick={onDelete}><T ko="지우기" en="Delete" /></button>
            <button type="button" className={s.del} onClick={onCancel}><T ko="그대로" en="Keep" /></button>
          </span>
        ) : (
          <button
            type="button"
            className={s.del}
            onClick={onAsk}
            aria-label={en ? (m.mine ? 'Delete my message' : `Delete ${m.name}’s message`) : `${m.mine ? '내 글' : `${m.name}의 글`} 지우기`}
          >
            <T ko="지우기" en="Delete" />
          </button>
        )
      ) : null}
    </li>
  );
}
