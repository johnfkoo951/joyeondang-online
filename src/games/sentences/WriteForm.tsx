'use client';
// 옮겨 적기: 원고지 느낌 칸에 문장(1~300자)과 출처(필수)를 적어 「걸어 두기」. 손님 이상만.
// 글자 수·경고는 조합 중에도 바로 보이고(input), 조합이 끝나면 한 번 더 맞춘다. 조합 중 Enter는 보내지 않는다.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { canUse, type Role } from '@/lib/access';
import { contactWarnings } from '@/lib/text';
import type { HangInput, HangState } from './actions';
import { CheckIcon } from './icons';
import { SENTENCE_MAX, SOURCE_MAX, chars, checkSentence, type Visibility } from './logic';
import type { Sound } from './sound';
import { sentenceWordEn } from './words-en';
import s from './sentences.module.css';

/** 서버·검사가 돌려준 한국어 말: 영어 화면이면 아는 말은 영어로, 모르는 말은 한국어 그대로(lang="ko") */
function Said({ ko }: { ko: string }) {
  const lang = useLang();
  if (lang !== 'en') return <>{ko}</>;
  const en = sentenceWordEn(ko);
  return en ? <>{en}</> : <span lang="ko">{ko}</span>;
}

/** 경고 여러 줄(한국어 말 목록)을 한 줄로 */
function Warnings({ list }: { list: string[] }) {
  const lang = useLang();
  if (lang !== 'en') return <>{list.join(' ')}</>;
  return (
    <>
      {list.map((w, i) => (
        <span key={i}>
          {i ? ' ' : null}
          <Said ko={w} />
        </span>
      ))}
    </>
  );
}

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
  const tr = useTr();

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const head = (
    <h2 id="sent-write-h" ref={heading} tabIndex={-1} className={s.title}>
      {tr('옮겨 적기', 'Copy a sentence')}
    </h2>
  );

  if (!canUse(role, 'write')) {
    return (
      <section className={s.write} aria-labelledby="sent-write-h">
        {head}
        <div className={s.notice}>
          {/* 가는 길은 문장 속 밑줄 글자 대신 단추 꼴 링크로(손끝에 한 줄 높이는 작다) */}
          {role === 'visitor' ? (
            <>
              <p>
                {tr(
                  '명단에서 아직 찾지 못했어요. 수첩에서 초대 코드를 넣으면 문장을 걸 수 있어요.',
                  'We couldn’t find you on the guest list yet. Enter your invite code in your notebook to hang sentences.',
                )}
              </p>
              <a className={s.btn} href="/notebook">
                {tr('수첩으로 가기', 'Go to your notebook')}
              </a>
            </>
          ) : (
            <>
              <p>{tr('손님 로그인 뒤 걸 수 있어요.', 'Sign in as a guest to hang a sentence.')}</p>
              <a className={s.btnMain} href={loginHref}>
                {tr('손님 로그인', 'Guest sign in')}
              </a>
            </>
          )}
          <p className={s.small}>{tr('그동안 읽기 벽과 빛 무늬 퍼즐은 그대로 할 수 있어요.', 'Meanwhile, the reading wall and the light puzzle are open to you.')}</p>
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
          <p>
            <Said ko={state.message} />
          </p>
          {state.receipt ? (
            <p>
              {tr('철회 번호', 'Removal code')} <strong className={s.code}>{state.receipt}</strong>
              <br />
              <span className={s.small}>
                {tr('이 번호가 있으면 언제든 이 종이를 거둘 수 있어요. 한 번만 보여 드려요.', 'With this code you can take this paper down anytime. It is shown only once.')}
              </span>
            </p>
          ) : null}
          {state.warnings?.length ? (
            <p className={s.warn}>
              <Warnings list={state.warnings} />
            </p>
          ) : null}
          <div className={s.row}>
            <button type="button" className={s.btnMain} onClick={onRead}>
              {tr('읽기 벽 보기', 'See the reading wall')}
            </button>
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
              {tr('한 장 더 쓰기', 'Write another')}
            </button>
            <button type="button" className={s.btn} onClick={onFinish}>
              <CheckIcon size={20} /> {tr('마치기', 'Finish')}
            </button>
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
          <label htmlFor="sent-text">{tr('문장', 'Sentence')}</label>
          <textarea
            id="sent-text"
            ref={textRef}
            className={s.grid}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCompositionEnd={(e) => setText((e.target as HTMLTextAreaElement).value)}
            maxLength={SENTENCE_MAX + 40}
            rows={5}
            placeholder={tr('요즘 만난 좋은 문장 하나', 'A good sentence you came across lately')}
            aria-invalid={err?.field === 'text' || undefined}
            aria-describedby="sent-count"
          />
          <span id="sent-count" className={count > SENTENCE_MAX ? s.countWarn : s.counter}>
            {count} / {SENTENCE_MAX}
          </span>
        </div>
        <div className={s.field}>
          <label htmlFor="sent-source">{tr('출처 (책 이름, 글쓴이)', 'Source (book title, author)')}</label>
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
            placeholder={tr('예: 『논어』 학이편', 'e.g. The Analects, Book 1')}
            aria-invalid={err?.field === 'source' || undefined}
          />
        </div>
        <Scope scope={scope} setScope={setScope} consent={consent} setConsent={setConsent} />
        {warnings.length ? (
          <p className={s.warn}>
            <Warnings list={warnings} />
          </p>
        ) : null}
        <p className={s.small}>{tr('검토 뒤 걸려요. 가족이 읽은 뒤에 벽에 보여요.', 'It goes up after review: it shows on the wall once the family has read it.')}</p>
        {err ? (
          <div className={s.field} role="alert">
            <p className={s.warn}>
              <Said ko={err.message} />
            </p>
            {err.field === 'role' ? (
              <a className={s.btn} href={loginHref}>
                {tr('손님 로그인', 'Guest sign in')}
              </a>
            ) : null}
          </div>
        ) : null}
        <div className={s.row}>
          <button type="submit" className={s.btnMain} disabled={pending || !ready}>
            {pending ? tr('거는 중', 'Hanging…') : tr('걸어 두기', 'Hang it')}
          </button>
        </div>
      </form>
    </section>
  );
}

function Scope(p: { scope: Visibility; setScope: (v: Visibility) => void; consent: boolean; setConsent: (b: boolean) => void }) {
  const tr = useTr();
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
      <legend>{tr('어디까지 보여 줄까요', 'Who can see it?')}</legend>
      {opt('guests', tr('초대 손님까지', 'Invited guests'), tr('(기본)', '(default)'))}
      {opt('family', tr('가족만', 'Family only'))}
      {opt('public', tr('인터넷 누구나', 'Anyone online'), tr('(한 장씩 가족이 읽은 뒤에)', '(each one after the family reads it)'))}
      {p.scope === 'public' ? (
        <label className={s.choice}>
          <input type="checkbox" checked={p.consent} onChange={(e) => p.setConsent(e.target.checked)} />
          <span>{tr('이 문장을 로그인하지 않은 사람도 볼 수 있게 걸어도 좋아요.', 'It’s OK to show this sentence to people who aren’t signed in.')}</span>
        </label>
      ) : null}
    </fieldset>
  );
}
