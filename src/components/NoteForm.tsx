'use client';
import { useActionState, useRef, useState } from 'react';
import { submitNote, type NoteState } from '@/app/actions';
import { BODY_MAX, contactWarnings, countChars } from '@/lib/text';

// 쪽지 한 장. 글자 수와 경고는 한글을 조합하는 중에도 바로 보여 주고(input),
// 조합이 끝난 순간(compositionend)에 한 번 더 맞춘다. 제출은 버튼으로만 한다.
export function NoteForm({ room }: { room: string }) {
  const [state, action, pending] = useActionState<NoteState | null, FormData>(submitNote, null);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'family' | 'guests' | 'public'>('guests');
  const ref = useRef<HTMLTextAreaElement>(null);
  const count = countChars(text);
  const warnings = contactWarnings(text);

  if (state?.ok && state.receipt) {
    return (
      <div className="card stack" role="status">
        <p style={{ margin: 0 }}>{state.message}</p>
        <p style={{ margin: 0 }}>
          철회 번호 <strong>{state.receipt}</strong>
          <br />
          <span className="small muted">이 번호가 있으면 언제든 이 종이를 거둘 수 있어요. 한 번만 보여 드려요.</span>
        </p>
        {state.warnings?.length ? <p className="warn small">{state.warnings.join(' ')}</p> : null}
        <button type="button" className="btn btn-small" onClick={() => window.location.reload()}>
          한 장 더 쓰기
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="stack">
      <input type="hidden" name="room" value={room} />
      <div className="field">
        <label htmlFor="body">쪽지</label>
        <textarea
          id="body"
          name="body"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onCompositionEnd={(e) => setText((e.target as HTMLTextAreaElement).value)}
          maxLength={BODY_MAX + 50}
          required
          placeholder="300자 안팎이면 좋아요"
        />
        <div className={`counter ${count > BODY_MAX ? 'warn' : ''}`}>{count} / {BODY_MAX}</div>
        {warnings.length ? <p className="warn small" style={{ margin: 0 }}>{warnings.join(' ')}</p> : null}
      </div>
      <fieldset>
        <legend>어디까지 보여 줄까요</legend>
        <label className="choice">
          <input type="radio" name="visibility" value="family" checked={scope === 'family'} onChange={() => setScope('family')} />
          <span>가족만</span>
        </label>
        <label className="choice">
          <input type="radio" name="visibility" value="guests" checked={scope === 'guests'} onChange={() => setScope('guests')} />
          <span>초대 손님까지 <span className="muted small">(가족이 읽은 뒤에)</span></span>
        </label>
        <label className="choice">
          <input type="radio" name="visibility" value="public" checked={scope === 'public'} onChange={() => setScope('public')} />
          <span>인터넷 누구나 <span className="muted small">(가족이 읽은 뒤에, 한 장씩)</span></span>
        </label>
        {scope === 'public' ? (
          <label className="choice">
            <input type="checkbox" name="consent_public" />
            <span>이 종이를 로그인하지 않은 사람도 볼 수 있게 걸어도 좋아요.</span>
          </label>
        ) : null}
      </fieldset>
      {state && !state.ok ? <p className="warn" role="alert">{state.message}</p> : null}
      <div className="btn-row">
        <button className="btn btn-roof" disabled={pending || count === 0 || count > BODY_MAX}>
          {pending ? '보내는 중' : '종이 걸기'}
        </button>
      </div>
    </form>
  );
}
