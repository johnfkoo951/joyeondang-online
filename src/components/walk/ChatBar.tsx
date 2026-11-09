'use client';
import { useEffect, useRef, useState } from 'react';
import { IconChat, IconClose } from './icons';
import type { ChatLine } from './useNet';

type InputProps = {
  coarse: boolean;
  /** 보냈으면 true(1.5초에 한 번만 보낼 수 있다) */
  onSend: (text: string) => boolean;
  onClose: () => void;
};

const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

// 말하기 입력칸. Enter 보내기(한글 조합 중이면 무시), Esc 닫기. 걷기 단축키는 입력칸 안의 키를 받지 않는다.
export function ChatInput({ coarse, onSend, onClose }: InputProps) {
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
      aria-label="말하기"
    >
      <input
        ref={input}
        type="text"
        value={text}
        maxLength={80}
        enterKeyHint="send"
        autoComplete="off"
        aria-label="할 말(80자까지)"
        placeholder="할 말을 적어요"
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
      <button type="submit" className="btn btn-small btn-roof">보내기</button>
      <button type="button" className="walk-chat-x" onClick={onClose} aria-label="말하기 닫기" aria-keyshortcuts="Escape">
        <IconClose size={18} />
      </button>
      <span className="walk-chat-tip" role="status">
        {wait ? '조금 뒤에 다시 말할 수 있어요' : coarse ? '' : 'Enter 보내기 · Esc 닫기'}
      </span>
    </form>
  );
}

/** 휴대폰 말풍선 단추 */
export function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="walk-chat-btn" onClick={onClick} aria-label="말하기">
      <IconChat size={22} />
    </button>
  );
}

// 최근 말 5줄. 줄마다 6초 뒤 흐려진다(CSS 지연으로, 움직임 줄이기면 바로 바뀐다).
export function ChatLog({ lines }: { lines: ChatLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ol className="walk-log" aria-label="최근 말" aria-live="polite">
      {lines.map((l) => (
        <li key={l.key} data-me={l.me ? 'true' : undefined}>
          <b>{l.name}</b> {l.text}
        </li>
      ))}
    </ol>
  );
}
