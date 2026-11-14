'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { useStandalone } from '@/components/pwa/pwa-store';
import s from '@/components/pwa/pwa.module.css';
import { HANDOFF_LEN, HANDOFF_TTL_MS, formatHandoffCode, normalizeHandoffCode } from '@/lib/app-handoff-code';
import { SITE_URL } from '@/lib/env';

// 보는 쪽에 따라 셋 가운데 하나를 그린다:
// - 로그인한 브라우저(사파리): 코드 받기(5분, 한 번)
// - 로그인 안 된 홈 화면 앱: 코드 넣기(먼저), 사파리에서 받는 길 안내
// - 로그인 안 된 브라우저: 로그인하러 가기(먼저), 다른 기기에서 받은 코드 넣기
// - 이미 로그인한 홈 화면 앱: 들어가 있다고 알린다
export function AppLinkClient({ signedIn, name }: { signedIn: boolean; name: string | null }) {
  const standalone = useStandalone();
  if (signedIn && standalone) return <AlreadyIn name={name} />;
  if (signedIn) return <CodeMaker />;
  return <CodeTaker standalone={standalone} />;
}

function AlreadyIn({ name }: { name: string | null }) {
  return (
    <section className="card stack">
      <p style={{ margin: 0 }}>
        <T ko={`이미 ${name ?? '손님'} 님으로 로그인되어 있어요.`} en={`You're already signed in${name ? ` as ${name}` : ''}.`} />
      </p>
      <div className="btn-row">
        <Link className="btn btn-roof" href="/walk">
          <T ko="집 안 걷기" en="Walk the house" />
        </Link>
      </div>
    </section>
  );
}

type Made = { code: string; deadline: number };

function CodeMaker() {
  const t = useTr();
  const [made, setMade] = useState<Made | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!made) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((made.deadline - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [made]);

  async function make() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch('/api/app-handoff', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (res.ok && body.code) {
        // 서버 시계와 어긋나도 괜찮게, 받은 순간부터 센다(조금 일찍 끝난 것으로 본다)
        setMade({ code: body.code, deadline: Date.now() + HANDOFF_TTL_MS - 3000 });
      } else {
        setMade(null);
        setError(
          body.error === 'busy'
            ? t('코드를 너무 자주 받았어요. 몇 분 뒤에 다시 받아 주세요.', 'Too many codes in a short time. Please try again in a few minutes.')
            : body.error === 'signed_out'
              ? t('로그인이 풀렸어요. 다시 로그인해 주세요.', 'You were signed out. Please sign in again.')
              : body.error === 'not_ready'
                ? t('지금은 앱 로그인을 쓸 수 없어요.', 'App sign-in is not available right now.')
                : t('코드를 받지 못했어요. 다시 눌러 주세요.', "Couldn't get a code. Please try again."),
        );
      }
    } catch {
      setError(t('연결이 끊겼어요. 다시 눌러 주세요.', 'Connection lost. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  const live = made && left > 0;
  return (
    <section className="card stack">
      <p style={{ margin: 0 }}>
        <T
          ko="홈 화면에 둔 조연당 앱은 사파리와 로그인이 따로예요. 여기서 코드를 받아 앱의 「코드로 로그인」에 넣으면 앱도 같은 계정으로 들어와요."
          en="The Joyeondang app on your home screen keeps its own sign-in. Get a code here and enter it in the app under “Sign in with a code” to sign in with this account."
        />
      </p>
      {live ? (
        <>
          <p className={s.code} aria-label={made.code.split('').join(' ')}>
            {formatHandoffCode(made.code)}
          </p>
          <p className={s.note} role="note">
            <T
              ko="이 코드는 내 휴대폰의 조연당 앱에만 넣으세요. 코드를 넣는 사람은 누구든 내 계정으로 들어오니, 다른 사람에게 알려 주지 마세요."
              en="Enter this code only in the Joyeondang app on your own phone. Whoever enters it is signed in as you, so don't share it."
            />
          </p>
          <p className={`${s.timer} small muted`} aria-live="polite">
            <T
              ko={`${Math.floor(left / 60)}분 ${String(left % 60).padStart(2, '0')}초 동안 한 번 쓸 수 있어요.`}
              en={`Valid once, for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.`}
            />
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(made.code);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <T ko="복사했어요" en="Copied" /> : <T ko="코드 복사" en="Copy code" />}
            </button>
            <button type="button" className="btn" onClick={make} disabled={busy}>
              <T ko="새 코드 받기" en="New code" />
            </button>
          </div>
          <ol className={s.steps}>
            <li>
              <T ko="홈 화면의 조연당 앱을 열어요." en="Open the Joyeondang app on your home screen." />
            </li>
            <li>
              <T ko="「로그인」 → 「코드로 로그인」에서 이 코드를 넣어요." en="Go to “Sign in” → “Sign in with a code” and enter this code." />
            </li>
          </ol>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn-roof" onClick={make} disabled={busy}>
            {made ? <T ko="시간이 지났어요 · 새 코드 받기" en="Expired · Get a new code" /> : <T ko="앱 로그인 코드 받기" en="Get an app sign-in code" />}
          </button>
        </div>
      )}
      {error ? (
        <p className="warn" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

function CodeTaker({ standalone }: { standalone: boolean }) {
  const t = useTr();
  const [copied, setCopied] = useState(false);
  const address = `${SITE_URL.replace(/^https?:\/\//, '')}/app-link`;

  const form = <CodeForm />;
  const howTo = (
    <section className="card stack">
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
        <T ko="코드는 사파리에서 받아요" en="Get the code in Safari" />
      </h2>
      <ol className={s.steps}>
        <li>
          <T ko="사파리에서 이 주소를 열어요: " en="Open this address in Safari: " />
          <strong>{address}</strong>
        </li>
        <li>
          <T ko="구글 계정으로 로그인한 뒤 「앱 로그인 코드 받기」를 눌러요." en="Sign in with Google, then tap “Get an app sign-in code”." />
        </li>
        <li>
          <T ko="이 앱으로 돌아와 여섯 글자를 넣어요." en="Come back to this app and enter the six characters." />
        </li>
      </ol>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${SITE_URL}/app-link`);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <T ko="주소를 복사했어요" en="Address copied" /> : <T ko="주소 복사" en="Copy address" />}
        </button>
      </div>
    </section>
  );

  if (standalone) {
    return (
      <>
        {form}
        {howTo}
      </>
    );
  }
  return (
    <>
      <section className="card stack">
        <p style={{ margin: 0 }}>
          <T
            ko="홈 화면 앱에 넣을 코드를 받으려면 먼저 이 브라우저에서 로그인해 주세요."
            en="To get a code for the home-screen app, sign in on this browser first."
          />
        </p>
        <div className="btn-row">
          <Link className="btn btn-roof" href="/login?next=%2Fapp-link">
            <T ko="로그인하러 가기" en="Go to sign-in" />
          </Link>
        </div>
      </section>
      <details className="card">
        <summary>{t('다른 기기에서 받은 코드가 있어요', 'I have a code from another device')}</summary>
        <div className="stack" style={{ marginTop: 12 }}>
          {form}
        </div>
      </details>
    </>
  );
}

function CodeForm() {
  const t = useTr();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 붙여넣기 단추는 클립보드 읽기가 되는 브라우저에서만(아이폰은 「붙여넣기」 확인 말풍선이 뜬다)
    const ok = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';
    queueMicrotask(() => setCanPaste(ok));
  }, []);

  async function send(raw: string) {
    const code = normalizeHandoffCode(raw);
    if (!code) {
      setError(t(`영문과 숫자 ${HANDOFF_LEN}글자를 넣어 주세요.`, `Enter the ${HANDOFF_LEN} letters and numbers.`));
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/app-handoff/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        // 새 쿠키로 처음부터 다시 그린다(머리줄의 계정 칸까지 새로 읽게 전체를 다시 연다. router.push는 머리줄을 그대로 둔다)
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/walk');
        return;
      }
      setError(
        body.error === 'bad_code'
          ? t('코드가 맞지 않거나 시간이 지났어요. 사파리에서 새 코드를 받아 주세요.', 'That code is wrong or has expired. Please get a new code in Safari.')
          : body.error === 'busy'
            ? t('잠깐 너무 많이 시도했어요. 몇 분 뒤에 다시 해 주세요.', 'Too many tries. Please wait a few minutes.')
            : body.error === 'no_email'
              ? t('이 계정은 코드로 이어 받을 수 없어요.', "This account can't sign in with a code.")
              : body.error === 'not_ready'
                ? t('지금은 앱 로그인을 쓸 수 없어요.', 'App sign-in is not available right now.')
                : t('들어가지 못했어요. 다시 눌러 주세요.', "Couldn't sign in. Please try again."),
      );
    } catch {
      setError(t('연결이 끊겼어요. 다시 눌러 주세요.', 'Connection lost. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 자판으로 조합 중에 누른 Enter는 제출하지 않는다
    if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="app-code">
          <T ko="사파리에서 받은 코드" en="Code from Safari" />
        </label>
        <input
          ref={inputRef}
          id="app-code"
          className={s.codeInput}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={HANDOFF_LEN + 3}
          placeholder="ABC DEF"
          aria-describedby={error ? 'app-code-error' : undefined}
        />
      </div>
      <div className="btn-row">
        <button type="submit" className="btn btn-roof" disabled={busy}>
          {busy ? <T ko="들어가는 중…" en="Signing in…" /> : <T ko="코드로 로그인" en="Sign in with code" />}
        </button>
        {canPaste ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                setValue(text.trim().slice(0, HANDOFF_LEN + 3));
                if (normalizeHandoffCode(text)) void send(text);
              } catch {
                inputRef.current?.focus();
              }
            }}
          >
            <T ko="붙여넣기" en="Paste" />
          </button>
        ) : null}
      </div>
      {error ? (
        <p id="app-code-error" className="warn" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
