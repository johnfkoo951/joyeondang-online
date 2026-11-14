'use client';
import { useEffect, useRef, useState } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { shownLines, unreadBadge } from './chat-quiet';
import { newMessagesEn } from './hud-text';
import { IconChat, IconChatOff, IconClose } from './icons';
import type { ChatLine } from './useNet';

type InputProps = {
  coarse: boolean;
  /** 보냈으면 true(1.5초에 한 번만 보낼 수 있다) */
  onSend: (text: string) => boolean;
  onClose: () => void;
  /** 말 숨기기 중: 내 말풍선도 뜨지 않으니 보내기 전에 알려 둔다 */
  quiet?: boolean;
};

const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

// 말하기 입력칸. Enter 보내기(한글 조합 중이면 무시), Esc 닫기. 걷기 단축키는 입력칸 안의 키를 받지 않는다.
// 화면 말은 한국어·영어를 따른다. 손님이 쓰는 말 자체는 옮기지 않는다.
export function ChatInput({ coarse, onSend, onClose, quiet = false }: InputProps) {
  const tr = useTr();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [wait, setWait] = useState(false);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!wait) return;
    const t = window.setTimeout(() => setWait(false), 1600);
    return () => window.clearTimeout(t);
  }, [wait]);

  const send = () => {
    const t = text.trim();
    if (!t) return onClose();
    if (onSend(t)) {
      setText('');
      onClose();
    } else setWait(true);
  };

  return (
    <form
      className="walk-chat"
      data-coarse={coarse ? 'true' : undefined}
      onSubmit={(e) => { e.preventDefault(); send(); }}
      aria-label={tr('말하기', 'Say')}
    >
      <input
        ref={input}
        type="text"
        value={text}
        maxLength={80}
        enterKeyHint="send"
        autoComplete="off"
        aria-label={tr('할 말(80자까지)', 'What to say (up to 80 characters)')}
        placeholder={tr('할 말을 적어요', 'Type what to say')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // 조합을 끝내는 Enter는 글자를 확정할 뿐 보내지 않는다
            e.preventDefault();
            if (!composing(e)) send();
          } else if (e.key === 'Escape' && !composing(e)) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <button type="submit" className="btn btn-small btn-roof"><T ko="보내기" en="Send" /></button>
      <button type="button" className="walk-chat-x" onClick={onClose} aria-label={tr('말하기 닫기', 'Close the chat box')} aria-keyshortcuts="Escape">
        <IconClose size={18} />
      </button>
      {/* 빈 알림 줄은 CSS(:empty)가 접는다: 쓸 말이 없으면 아무것도 넣지 않는다 */}
      <span className="walk-chat-tip" role="status">
        {wait
          ? tr('조금 뒤에 다시 말할 수 있어요', 'You can say something again in a moment')
          : quiet
            ? tr(
              `말을 숨겨 둬서 내 말풍선도 뜨지 않아요. 다른 분들께는 보여요.${coarse ? '' : ' · Enter 보내기 · Esc 닫기'}`,
              `Chat is hidden, so your own bubble won’t show either. Others still see it.${coarse ? '' : ' · Enter to send · Esc to close'}`,
            )
            : coarse ? '' : tr('Enter 보내기 · Esc 닫기', 'Enter to send · Esc to close')}
      </span>
    </form>
  );
}

/**
 * 말 숨기기·보이기. 말 기록과 사람들 머리 위 말풍선을 함께 감춘다. 감춘 동안 온 말 수를 작은 숫자로 보인다.
 * 이름은 할 일(「말 숨기기」, 「말 보이기」), 그림도 할 일을 따른다(숨기기는 빗금 친 말풍선)
 */
export function ChatQuietButton({ hidden, unread, onToggle }: { hidden: boolean; unread: number; onToggle: () => void }) {
  const tr = useTr();
  const badge = unreadBadge(unread);
  const text = hidden ? tr('말 보이기', 'Show chat') : tr('말 숨기기', 'Hide chat');
  return (
    <button
      type="button"
      className="walk-chat-quiet"
      data-hidden={hidden ? 'true' : undefined}
      onClick={onToggle}
      aria-label={badge ? tr(`${text}, 새 말 ${badge}개`, `${text}, ${unread > 99 ? `${badge} new messages` : newMessagesEn(Math.floor(unread))}`) : text}
      title={hidden ? tr('말 기록과 말풍선 다시 보기', 'Show the chat log and bubbles again') : tr('말 기록과 말풍선 감추기', 'Hide the chat log and bubbles')}
    >
      {hidden ? <IconChat size={18} /> : <IconChatOff size={18} />}
      <span>{hidden ? <T ko="말 보이기" en="Show chat" /> : <T ko="말 숨기기" en="Hide chat" />}</span>
      {badge ? <span className="walk-chat-unread" aria-hidden="true">{badge}</span> : null}
    </button>
  );
}

/** 휴대폰 말풍선 단추 */
export function ChatButton({ onClick }: { onClick: () => void }) {
  const tr = useTr();
  return (
    <button type="button" className="walk-chat-btn" onClick={onClick} aria-label={tr('말하기', 'Say')}>
      <IconChat size={22} />
    </button>
  );
}

type LogProps = {
  lines: ChatLine[];
  coarse?: boolean;
  /** 말을 숨기기 전에 이미 본 줄(key). 다시 보일 때 새 줄처럼 떠오르지 않고 흐린 채로 나온다 */
  seen?: ReadonlySet<string>;
};

// 최근 말 5줄(휴대폰 3줄, chat-quiet.ts). 줄마다 6초 뒤 흐려진다(CSS 지연으로, 움직임 줄이기면 바로 바뀐다).
// 이름과 말은 사람이 쓴 글이라 한국어 그대로 둔다(lang="ko").
export function ChatLog({ lines, coarse = false, seen }: LogProps) {
  const tr = useTr();
  if (lines.length === 0) return null;
  return (
    <ol className="walk-log" aria-label={tr('최근 말', 'Recent chat')} aria-live="polite">
      {shownLines(lines, coarse).map((l) => (
        <li key={l.key} data-me={l.me ? 'true' : undefined} data-old={seen?.has(l.key) ? 'true' : undefined}>
          {/* 휴대폰은 이 안쪽 칸을 두 줄로 자른다(줄 칸의 여백으로 셋째 줄이 비치지 않게 안쪽에서 자른다) */}
          <span className="walk-log-text" lang="ko"><b>{l.name}</b> {l.text}</span>
        </li>
      ))}
    </ol>
  );
}
