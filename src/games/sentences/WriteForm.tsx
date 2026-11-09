'use client';
// 옮겨 적기: 원고지 느낌 칸에 문장(1~300자)과 출처(필수)를 적어 「걸어 두기」. 손님 이상만.
// 글자 수·경고는 조합 중에도 바로 보이고(input), 조합이 끝나면 한 번 더 맞춘다. 조합 중 Enter는 보내지 않는다.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { canUse, type Role } from '@/lib/access';
import { contactWarnings } from '@/lib/text';
import type { HangInput, HangState } from './actions';
import { CheckIcon } from './icons';
import { SENTENCE_MAX, SOURCE_MAX, chars, checkSentence, type Visibility } from './logic';
import type { Sound } from './sound';
import s from './sentences.module.css';

type Props = {
  role: Role;
  loginHref: string;
  hang: (input: HangInput) => Promise<HangState>;
  play: Sound['play'];
  onHung: () => void;
  onRead: () => void;
  onFinish: () => void;
};

export function WriteForm({ role, loginHref, hang, play, onHung, onRead, onFinish }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [scope, setScope] = useState<Visibility>('guests');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<HangState | null>(null);

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const head = (
    <h2 id="sent-write-h" ref={heading} tabIndex={-1} className={s.title}>
      옮겨 적기
    </h2>
  );

  if (!canUse(role, 'write')) {
    return (
      <section className={s.write} aria-labelledby="sent-write-h">
        {head}
        <div className={s.notice}>
          {role === 'visitor' ? (
            <p>
              명단에서 아직 찾지 못했어요. <a href="/notebook">수첩</a>에서 초대 코드를 넣으면 문장을 걸 수 있어요.
            </p>
          ) : (
            <p>
              손님 로그인 뒤 걸 수 있어요. <a href={loginHref}>손님 로그인</a>
            </p>
          )}
          <p className={s.small}>그동안 읽기 벽과 빛 무늬 퍼즐은 그대로 할 수 있어요.</p>
        </div>
      </section>
    );
  }

  if (state?.ok) {
    return (
      <section className={s.write} aria-labelledby="sent-write-h">
        {head}
        <div className={s.done} role="status">
          <CheckIcon size={32} />
          <p>{state.message}</p>
          {state.receipt ? (
            <p>
              철회 번호 <strong className={s.code}>{state.receipt}</strong>
              <br />
              <span className={s.small}>이 번호가 있으면 언제든 이 종이를 거둘 수 있어요. 한 번만 보여 드려요.</span>
            </p>
          ) : null}
          {state.warnings?.length ? <p className={s.warn}>{state.warnings.join(' ')}</p> : null}
          <div className={s.row}>
            <button type="button" className={s.btnMain} onClick={onRead}>읽기 벽 보기</button>
            <button
              type="button"
              className={s.btn}
              onClick={() => {
                setText('');
                setSource('');
                setConsent(false);
                setState(null);
              }}
            >
              한 장 더 쓰기
            </button>
            <button type="button" className={s.btn} onClick={onFinish}>마치기</button>
          </div>
        </div>
      </section>
    );
  }

  const count = chars(text.trim());
  const warnings = contactWarnings(`${text} ${source}`);
  const ready = count > 0 && count <= SENTENCE_MAX && source.trim().length > 0 && (scope !== 'public' || consent);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const local = checkSentence(text, source);
    if (!local.ok) {
      setState({ ok: false, field: local.field, message: local.reason });
      (local.field === 'text' ? textRef : sourceRef).current?.focus();
      return;
    }
    setPending(true);
    try {
      const r = await hang({ text: local.text, source: local.source, visibility: scope, consent });
      setState(r);
      if (r.ok) {
        play('hang');
        onHung();
      } else {
        play('bad');
        if (r.field === 'text') textRef.current?.focus();
        if (r.field === 'source') sourceRef.current?.focus();
      }
    } catch {
      setState({ ok: false, message: '걸지 못했어요. 잠시 뒤 다시 눌러 주세요.' });
    } finally {
      setPending(false);
    }
  };

  const err = state && !state.ok ? state : null;
  return (
    <section className={s.write} aria-labelledby="sent-write-h">
      {head}
      <form className={s.form} onSubmit={submit} noValidate>
        <div className={s.field}>
          <label htmlFor="sent-text">문장</label>
          <textarea
            id="sent-text"
            ref={textRef}
            className={s.grid}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCompositionEnd={(e) => setText((e.target as HTMLTextAreaElement).value)}
            maxLength={SENTENCE_MAX + 40}
            rows={5}
            placeholder="요즘 만난 좋은 문장 하나"
            aria-invalid={err?.field === 'text' || undefined}
            aria-describedby="sent-count"
          />
          <span id="sent-count" className={count > SENTENCE_MAX ? s.countWarn : s.counter}>
            {count} / {SENTENCE_MAX}
          </span>
        </div>
        <div className={s.field}>
          <label htmlFor="sent-source">출처 (책 이름, 글쓴이)</label>
          <input
            id="sent-source"
            ref={sourceRef}
            className={s.input}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onCompositionEnd={(e) => setSource((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
            }}
            maxLength={SOURCE_MAX + 20}
            required
            placeholder="예: 『논어』 학이편"
            aria-invalid={err?.field === 'source' || undefined}
          />
        </div>
        <Scope scope={scope} setScope={setScope} consent={consent} setConsent={setConsent} />
        {warnings.length ? <p className={s.warn}>{warnings.join(' ')}</p> : null}
        <p className={s.small}>검토 뒤 걸려요. 가족이 읽은 뒤에 벽에 보여요.</p>
        {err ? (
          <p className={s.warn} role="alert">
            {err.message}
            {err.field === 'role' ? <> <a href={loginHref}>손님 로그인</a></> : null}
          </p>
        ) : null}
        <div className={s.row}>
          <button type="submit" className={s.btnMain} disabled={pending || !ready}>
            {pending ? '거는 중' : '걸어 두기'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Scope(p: { scope: Visibility; setScope: (v: Visibility) => void; consent: boolean; setConsent: (b: boolean) => void }) {
  const opt = (v: Visibility, label: string, note?: string) => (
    <label className={s.choice}>
      <input type="radio" name="sent-scope" value={v} checked={p.scope === v} onChange={() => p.setScope(v)} />
      <span>
        {label} {note ? <span className={s.small}>{note}</span> : null}
      </span>
    </label>
  );
  return (
    <fieldset className={s.scope}>
      <legend>어디까지 보여 줄까요</legend>
      {opt('guests', '초대 손님까지', '(기본)')}
      {opt('family', '가족만')}
      {opt('public', '인터넷 누구나', '(한 장씩 가족이 읽은 뒤에)')}
      {p.scope === 'public' ? (
        <label className={s.choice}>
          <input type="checkbox" checked={p.consent} onChange={(e) => p.setConsent(e.target.checked)} />
          <span>이 문장을 로그인하지 않은 사람도 볼 수 있게 걸어도 좋아요.</span>
        </label>
      ) : null}
    </fieldset>
  );
}
