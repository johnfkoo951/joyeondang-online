'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { submitNote, type NoteState } from '@/app/actions';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { NoteMessage, NoteWarnings } from '@/components/NoteMessage';
import { PhotoPicker, type PickedPhoto } from '@/components/PhotoPicker';
import { BODY_MAX, contactWarnings, countChars } from '@/lib/text';

type Props = { room: string; photo?: boolean };

// 쪽지 한 장. 「한 장 더 쓰기」는 빈 종이로 새로 시작한다(그릇을 새로 붙여 보낸 상태를 비운다).
// 페이지를 새로 고치지 않는다: 걷기 화면 위 시트에서 열었으면 새로 고침이 3D 장면을 떠나게 한다(보낸 뒤 목록은 서버가 이미 새로 그렸다).
export function NoteForm(props: Props) {
  const [round, setRound] = useState(0);
  return <OneNote key={round} {...props} again={round > 0} onAgain={() => setRound((n) => n + 1)} />;
}

// 글자 수와 경고는 한글을 조합하는 중에도 바로 보여 주고(input),
// 조합이 끝난 순간(compositionend)에 한 번 더 맞춘다. 제출은 버튼으로만 한다.
// 사진을 받는 방(photo)이면 사진 한 장을 붙일 수 있다. 기기가 다시 그린 두 장만 보내기 직전에 폼에 더한다.
// 화면 말은 한·영(<T>, 속성은 useTr). 서버가 돌려준 안내는 NoteMessage가 아는 말만 옮긴다.
function OneNote({ room, photo = false, again, onAgain }: Props & { again: boolean; onAgain: () => void }) {
  const [state, action, pending] = useActionState<NoteState | null, FormData>(submitNote, null);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'family' | 'guests' | 'public'>('guests');
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const tr = useTr();
  // 「한 장 더 쓰기」로 온 빈 종이는 바로 쓸 수 있게 글칸에 초점
  useEffect(() => {
    if (again) ref.current?.focus({ preventScroll: true });
  }, [again]);
  const count = countChars(text);
  const warnings = contactWarnings(text);
  const send = (fd: FormData) => {
    if (picked) {
      fd.set('photo_view', picked.view, 'view.jpg');
      fd.set('photo_thumb', picked.thumb, 'thumb.jpg');
    }
    action(fd);
  };
  const ready = picked ? count <= BODY_MAX : count > 0 && count <= BODY_MAX;

  if (state?.ok && state.receipt) {
    return (
      <div className="card stack" role="status">
        <p style={{ margin: 0 }}><NoteMessage text={state.message} /></p>
        <p style={{ margin: 0 }}>
          <T ko="철회 번호 " en="Removal code " /><strong>{state.receipt}</strong>
          <br />
          <span className="small muted">
            <T ko="이 번호가 있으면 언제든 이 종이를 거둘 수 있어요. 한 번만 보여 드려요." en="With this code you can take the note down any time. We show it only once." />
          </span>
        </p>
        {state.warnings?.length ? <p className="warn small"><NoteWarnings list={state.warnings} /></p> : null}
        <button type="button" className="btn btn-small" onClick={onAgain}>
          <T ko="한 장 더 쓰기" en="Write another" />
        </button>
      </div>
    );
  }

  return (
    <form action={send} className="stack">
      <input type="hidden" name="room" value={room} />
      <div className="field">
        <label htmlFor="body"><T ko="쪽지" en="Note" /></label>
        <textarea
          id="body"
          name="body"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onCompositionEnd={(e) => setText((e.target as HTMLTextAreaElement).value)}
          maxLength={BODY_MAX + 50}
          required={!picked}
          placeholder={picked ? tr('사진에 붙일 한마디(비워 두어도 돼요)', 'A few words for the photo (you can leave it empty)') : tr('300자 안팎이면 좋아요', 'About 300 characters is plenty')}
        />
        <div className={`counter ${count > BODY_MAX ? 'warn' : ''}`}>{count} / {BODY_MAX}</div>
        {warnings.length ? <p className="warn small" style={{ margin: 0 }}><NoteWarnings list={warnings} /></p> : null}
      </div>
      {photo ? <PhotoPicker value={picked} onChange={setPicked} disabled={pending} /> : null}
      <fieldset>
        <legend><T ko="어디까지 보여 줄까요" en="Who can see it?" /></legend>
        <label className="choice">
          <input type="radio" name="visibility" value="family" checked={scope === 'family'} onChange={() => setScope('family')} />
          <span><T ko="가족만" en="Family only" /></span>
        </label>
        <label className="choice">
          <input type="radio" name="visibility" value="guests" checked={scope === 'guests'} onChange={() => setScope('guests')} />
          <span>
            <T ko="초대 손님까지 " en="Invited guests too " />
            <span className="muted small"><T ko="(가족이 읽은 뒤에)" en="(after the family reads it)" /></span>
          </span>
        </label>
        <label className="choice">
          <input type="radio" name="visibility" value="public" checked={scope === 'public'} onChange={() => setScope('public')} />
          <span>
            <T ko="인터넷 누구나 " en="Anyone online " />
            <span className="muted small"><T ko="(가족이 읽은 뒤에, 한 장씩)" en="(after the family reads it, one note at a time)" /></span>
          </span>
        </label>
        {scope === 'public' ? (
          <label className="choice">
            <input type="checkbox" name="consent_public" />
            <span><T ko="이 종이를 로그인하지 않은 사람도 볼 수 있게 걸어도 좋아요." en="It’s fine to post this note where people who aren’t signed in can see it." /></span>
          </label>
        ) : null}
        {picked ? (
          <p className="small muted" style={{ margin: 0 }}>
            <T ko="사진을 붙인 종이는 고른 범위와 상관없이 지금은 가족에게만 보여요." en="For now, a note with a photo is shown only to the family, whatever you choose." />
          </p>
        ) : null}
      </fieldset>
      {state && !state.ok ? <p className="warn" role="alert"><NoteMessage text={state.message} /></p> : null}
      <div className="btn-row">
        <button className="btn btn-roof" disabled={pending || !ready}>
          {pending ? <T ko="보내는 중" en="Sending" /> : <T ko="종이 걸기" en="Hang the note" />}
        </button>
      </div>
    </form>
  );
}
