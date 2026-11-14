'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { earnStamp, submitNote } from '@/app/actions';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { NoteMessage, NoteWarnings } from '@/components/NoteMessage';
import { PhotoPicker, type PickedPhoto } from '@/components/PhotoPicker';
import { PhotoThumb } from '@/components/PhotoThumb';
import { CarvedSeal } from '@/components/stamp-map/CarvedSeal';
import { markStamped } from '@/components/walk/memory';
import { hangSentence } from '@/games/sentences/actions';
import { SENTENCE_MAX, SOURCE_MAX } from '@/games/sentences/logic';
import { SCOPE_LABEL } from '@/lib/access';
import { SCOPE_EN, WALL_STATUS, countEn, dayLabel, hangulLang } from '@/lib/page-words';
import { placeName } from '@/lib/place-names';
import { SPOT_BY_SLUG, markVisited } from '@/lib/stamp-rally';
import { BODY_MAX, contactWarnings, countChars } from '@/lib/text';
import { DESTINATIONS, SAMPLE_WALL, type DestSpec, type WallItem } from './guestbook-words';
import css from './guestbook.module.css';

export type { WallItem } from './guestbook-words';

// 화면 말은 한·영(<T>, 속성은 지금 말로 고른다). 글 남길 곳·예시 벽의 말은 guestbook-words.ts.
// 쓴 사람의 글(벽의 쪽지와 문장, 이름, 쓰는 중인 글)은 옮기지 않는다: 한글이 있으면 lang="ko"

const draftKey = (slug: string) => `jy.draft.gb.v1.${slug}`;

/** 이 기기에 적어 둔 초안(없거나 못 읽으면 빈 글) */
function readDraft(slug: string): { text: string; source: string } {
  if (typeof window === 'undefined') return { text: '', source: '' };
  try {
    const saved = localStorage.getItem(draftKey(slug));
    if (saved) {
      const parsed = JSON.parse(saved) as { text?: string; source?: string };
      return {
        text: typeof parsed.text === 'string' ? parsed.text : '',
        source: typeof parsed.source === 'string' ? parsed.source : '',
      };
    }
  } catch {
    // 무시
  }
  return { text: '', source: '' };
}

type Props = {
  canWrite: boolean;
  signedIn: boolean;
  ready: boolean;
  /** 이름표의 이름. 없으면 「손님」(영어 화면은 Guest) */
  nickname: string | null;
  initialRoom?: string;
  wall: WallItem[];
};

export function GuestbookStudio({ canWrite, signedIn, ready, nickname, initialRoom, wall }: Props) {
  const [destSlug, setDestSlug] = useState<DestSpec['slug']>(() => {
    const found = DESTINATIONS.find((d) => d.slug === initialRoom);
    return found ? found.slug : 'living';
  });
  const dest = useMemo(() => DESTINATIONS.find((d) => d.slug === destSlug) ?? DESTINATIONS[0], [destSlug]);
  const spot = SPOT_BY_SLUG.get(dest.slug);
  const lang = useLang();
  const en = lang === 'en';

  // 초안은 그린 뒤에 읽는다(아래 효과): 서버 그림과 첫 그림이 같아야 하이드레이션이 어긋나지 않는다.
  // 고른 곳을 바꿀 때(selectDestination)도 그곳 초안을 다시 읽으므로 같은 값이 한 번 더 들어와도 그대로다
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  useEffect(() => {
    queueMicrotask(() => {
      const d = readDraft(dest.slug);
      setText(d.text);
      setSource(d.source);
    });
  }, [dest.slug]);
  const [scope, setScope] = useState<'family' | 'guests' | 'public'>('guests');
  const [consentPublic, setConsentPublic] = useState(false);
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [pending, setPending] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [doneReceipt, setDoneReceipt] = useState<{ message: string; receipt?: string; warnings?: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  // 읽기 벽 필터·검색(조합 중에도 즉시 반영!)
  const [wallFilter, setWallFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const selectDestination = (nextSlug: DestSpec['slug']) => {
    setDestSlug(nextSlug);
    setErrMsg(null);
    setDoneReceipt(null);
    setPicked(null);
    const d = readDraft(nextSlug);
    setText(d.text);
    setSource(d.source);
  };

  const updateDraft = (nextText: string, nextSource = source) => {
    setText(nextText);
    setSource(nextSource);
    try {
      if (!nextText && !nextSource) localStorage.removeItem(draftKey(dest.slug));
      else localStorage.setItem(draftKey(dest.slug), JSON.stringify({ text: nextText, source: nextSource }));
    } catch {
      // 무시
    }
  };

  const applyStarter = (starter: string) => {
    if (!text.trim()) {
      updateDraft(starter, source);
      return;
    }
    updateDraft(`${text.trimEnd()}\n${starter}`, source);
  };

  const maxLen = dest.quoteMode ? SENTENCE_MAX : BODY_MAX;
  const count = countChars(text);
  const sourceCount = countChars(source);
  const warnings = contactWarnings(`${text} ${source}`);

  const canSubmit = dest.quoteMode
    ? count > 0 && count <= SENTENCE_MAX && sourceCount > 0 && sourceCount <= SOURCE_MAX
    : picked
      ? count <= BODY_MAX
      : count > 0 && count <= BODY_MAX;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !canSubmit) return;
    setPending(true);
    setErrMsg(null);

    if (dest.quoteMode) {
      const res = await hangSentence({
        text,
        source,
        visibility: scope,
        consent: scope === 'public' && consentPublic,
      }).catch(() => null);
      setPending(false);
      if (!res) {
        setErrMsg('보내지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        return;
      }
      if (!res.ok) {
        setErrMsg(res.message);
        return;
      }
      try {
        localStorage.removeItem(draftKey(dest.slug));
        markVisited(localStorage, dest.slug);
        markStamped(localStorage, dest.slug);
      } catch {
        // 무시
      }
      const sfd = new FormData();
      sfd.set('room', dest.slug);
      void earnStamp(sfd).catch(() => null);
      setDoneReceipt({ message: res.message, receipt: res.receipt, warnings: res.warnings });
      setText('');
      setSource('');
      return;
    }

    const fd = new FormData();
    fd.set('room', dest.slug);
    fd.set('body', text);
    fd.set('visibility', scope);
    if (scope === 'public' && consentPublic) fd.set('consent_public', 'on');
    if (dest.photo && picked) {
      fd.set('photo_view', picked.view, 'view.jpg');
      fd.set('photo_thumb', picked.thumb, 'thumb.jpg');
    }
    const res = await submitNote(null, fd).catch(() => null);
    setPending(false);
    if (!res) {
      setErrMsg('보내지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    if (!res.ok) {
      setErrMsg(res.message);
      return;
    }
    try {
      localStorage.removeItem(draftKey(dest.slug));
      markVisited(localStorage, dest.slug);
      markStamped(localStorage, dest.slug);
    } catch {
      // 무시
    }
    const sfd = new FormData();
    sfd.set('room', dest.slug);
    void earnStamp(sfd).catch(() => null);
    setDoneReceipt({ message: res.message, receipt: res.receipt, warnings: res.warnings });
    setText('');
    setPicked(null);
  };

  const sourceWall = wall.length > 0 ? wall : SAMPLE_WALL;
  const qNorm = query.normalize('NFC').trim().toLowerCase();
  const filteredWall = useMemo(() => {
    return sourceWall.filter((item) => {
      if (wallFilter !== 'all' && item.roomSlug !== wallFilter) return false;
      if (!qNorm) return true;
      // 영어 화면에서는 보이는 영어(방 이름, 예시 글)로도 찾는다
      const shown = en ? ` ${item.sampleEn ? `${item.sampleEn.body} ${item.sampleEn.author} ${item.sampleEn.roomName}` : placeName('en', item.roomName)}` : '';
      const hay = `${item.body} ${item.author_name} ${item.roomName}${shown}`.normalize('NFC').toLowerCase();
      return hay.includes(qNorm);
    });
  }, [sourceWall, wallFilter, qNorm, en]);

  return (
    <div className={css.wrap}>
      <section className={css.hero} aria-label={en ? 'About the guestbook and notes' : '방명록과 글 남기기 소개'}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 일러스트 */}
        <img
          src="/web/collage/collage-writing-v2.webp"
          alt={
            en
              ? 'Illustration of two blank hanji postcards, a fountain pen, and a cup of warm tea on a sunlit wooden desk'
              : '햇살 드는 나무 책상 위 빈 한지 엽서 두 장과 만년필, 따뜻한 차 한 잔이 놓인 일러스트'
          }
          className={css.heroImg}
        />
        <div>
          <p className={css.kicker}>GUESTBOOK &amp; QUOTE STUDIO</p>
          <h1 className={css.heroTitle}><T ko="방명록과 마음 걸어 두기" en="Guestbook and notes" /></h1>
          <p className={css.heroLead}>
            <T
              ko="거실 방명록 축하 인사부터 앞마당 소나무 소원 쪽지, 서재 창가에 거는 좋은 문장까지 한자리에서 쓰고 읽을 수 있어요. 글을 남기면 그 공간의 도장도 함께 찍혀요."
              en="Write and read it all in one place: congratulations in the living room guestbook, wish notes on the front yard pine, and good sentences hung by the study window. When you leave a note, you get that spot’s stamp too."
            />
          </p>
          <div className="btn-row">
            <a className="btn btn-small" href="#reading-wall">
              <T ko={`걸린 글 ${sourceWall.length}장 먼저 읽기 ↓`} en={`Read the ${countEn(sourceWall.length, 'note')} first ↓`} />
            </a>
            <Link className="btn btn-small" href="/map"><T ko="도장 투어 맵 보기" en="See the stamp tour map" /></Link>
          </div>
        </div>
      </section>

      {/* 어디에 걸지 고르기 */}
      <div className={css.destTabs} role="tablist" aria-label={en ? 'Where to leave your note' : '글을 남길 공간'}>
        {DESTINATIONS.map((d) => (
          <button
            key={d.slug}
            type="button"
            role="tab"
            aria-selected={d.slug === dest.slug}
            className={css.destTab}
            data-active={d.slug === dest.slug || undefined}
            onClick={() => selectDestination(d.slug)}
          >
            <span className={css.destName}><T ko={d.tabLabel} en={d.en.tabLabel} /></span>
            <span className={css.destSub}><T ko={d.subLabel} en={d.en.subLabel} /></span>
          </button>
        ))}
      </div>

      {/* 쓰기 칸 + 한지 엽서 실시간 미리보기 */}
      <div className={css.studioGrid}>
        <section className={css.composerCard} aria-labelledby="composer-heading">
          <h2 id="composer-heading" className={css.promptTitle}><T ko={dest.prompt} en={dest.en.prompt} /></h2>

          {doneReceipt ? (
            <div className="card stack" role="status">
              <p style={{ margin: 0, fontWeight: 700 }}><NoteMessage text={doneReceipt.message} /></p>
              <p className="small" style={{ margin: 0, color: 'var(--roof)', fontWeight: 700 }}>
                <T ko={`✓ ${dest.tabLabel} 도장도 함께 찍혔어요!`} en={`✓ You got the ${dest.en.tabLabel} stamp too!`} />
              </p>
              {doneReceipt.receipt ? (
                <div className="stack">
                  <p style={{ margin: 0 }}>
                    <T ko="철회 번호 " en="Removal code " /><strong>{doneReceipt.receipt}</strong>
                    <br />
                    <span className="small muted">
                      <T ko="이 번호가 있으면 언제든 내 수첩에서 이 글을 거둘 수 있어요." en="With this code you can take the note down from your notebook any time." />
                    </span>
                  </p>
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        void navigator.clipboard?.writeText(doneReceipt.receipt ?? '').then(
                          () => setCopied(true),
                          () => undefined,
                        );
                      }}
                    >
                      {copied ? <T ko="번호 복사됨 ✓" en="Code copied ✓" /> : <T ko="철회 번호 복사" en="Copy removal code" />}
                    </button>
                    <button
                      type="button"
                      className="btn btn-roof btn-small"
                      onClick={() => {
                        setDoneReceipt(null);
                        setCopied(false);
                      }}
                    >
                      <T ko="한 장 더 쓰기" en="Write another" />
                    </button>
                    <Link className="btn btn-small" href={`/map?spot=${dest.slug}`}><T ko="도장 맵에서 확인" en="Check the stamp map" /></Link>
                  </div>
                </div>
              ) : null}
              {doneReceipt.warnings?.length ? <p className="warn small"><NoteWarnings list={doneReceipt.warnings} /></p> : null}
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="stack">
              <div className="stack" style={{ gap: 6 }}>
                <span className="small muted"><T ko="글감 한 줄 고르기 (누르면 칸에 들어가요)" en="Pick a starter line (tap to add it)" /></span>
                <div className={css.starters}>
                  {dest.starters.map((st, i) => {
                    // 영어 화면에서는 영어 글감을 넣는다(글감이 모자라면 한국어 그대로)
                    const stEn = dest.en.starters[i] ?? st;
                    return (
                      <button key={st} type="button" className={css.starterChip} onClick={() => applyStarter(en ? stEn : st)}>
                        <T ko={`+ ${st}`} en={`+ ${stEn}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field">
                <label htmlFor="gb-body">{dest.quoteMode ? <T ko="걸어 둘 문장" en="Sentence to hang" /> : <T ko="남길 글" en="Your note" />}</label>
                <textarea
                  id="gb-body"
                  value={text}
                  onChange={(e) => updateDraft(e.target.value, source)}
                  onCompositionEnd={(e) => updateDraft((e.target as HTMLTextAreaElement).value, source)}
                  maxLength={maxLen + 50}
                  placeholder={
                    dest.quoteMode
                      ? en ? 'Copy out a line that stayed with you' : '마음에 남은 구절을 옮겨 적어 주세요'
                      : en ? 'Write freely, about 300 characters' : '300자 안팎으로 편하게 적어 주세요'
                  }
                />
                <div className={`counter ${count > maxLen ? 'warn' : ''}`}>{count} / {maxLen}</div>
              </div>

              {dest.quoteMode ? (
                <div className="field">
                  <label htmlFor="gb-source"><T ko="출처 (책 이름, 노래, 말한 사람)" en="Source (a book, a song, or who said it)" /></label>
                  <input
                    id="gb-source"
                    type="text"
                    value={source}
                    onChange={(e) => updateDraft(text, e.target.value)}
                    onCompositionEnd={(e) => updateDraft(text, (e.target as HTMLInputElement).value)}
                    maxLength={SOURCE_MAX + 20}
                    placeholder={en ? 'e.g. The Summer Book · Tove Jansson' : '예: 여름의 책 · 김초엽'}
                  />
                  <div className={`counter ${sourceCount > SOURCE_MAX ? 'warn' : ''}`}>{sourceCount} / {SOURCE_MAX}</div>
                </div>
              ) : null}

              {warnings.length ? <p className="warn small" style={{ margin: 0 }}><NoteWarnings list={warnings} /></p> : null}

              {dest.photo ? <PhotoPicker value={picked} onChange={setPicked} disabled={pending} /> : null}

              <fieldset>
                <legend><T ko="어디까지 보여 줄까요" en="Who can see it?" /></legend>
                <label className="choice">
                  <input type="radio" name="gb-vis" value="family" checked={scope === 'family'} onChange={() => setScope('family')} />
                  <span><T ko="가족만 보기" en="Family only" /></span>
                </label>
                <label className="choice">
                  <input type="radio" name="gb-vis" value="guests" checked={scope === 'guests'} onChange={() => setScope('guests')} />
                  <span>
                    <T ko="초대 손님까지 " en="Invited guests too " />
                    <span className="muted small"><T ko="(가족이 먼저 읽은 뒤에 걸려요)" en="(goes up after the family reads it)" /></span>
                  </span>
                </label>
                <label className="choice">
                  <input type="radio" name="gb-vis" value="public" checked={scope === 'public'} onChange={() => setScope('public')} />
                  <span>
                    <T ko="인터넷 누구나 " en="Anyone online " />
                    <span className="muted small"><T ko="(가족이 읽은 뒤에 공개 벽에도 걸려요)" en="(also goes on the public wall after the family reads it)" /></span>
                  </span>
                </label>
                {scope === 'public' ? (
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={consentPublic}
                      onChange={(e) => setConsentPublic(e.target.checked)}
                    />
                    <span><T ko="로그인하지 않은 방문자도 이 글을 볼 수 있게 걸어도 좋아요." en="It’s fine for visitors who aren’t signed in to see this note." /></span>
                  </label>
                ) : null}
                {picked ? (
                  <p className="small muted" style={{ margin: 0 }}>
                    <T ko="사진을 붙인 쪽지는 고른 범위와 상관없이 지금은 가족에게만 안전하게 보여요." en="For now, a note with a photo is shown safely to the family only, whatever you choose." />
                  </p>
                ) : null}
              </fieldset>

              {errMsg ? <p className="warn" role="alert"><NoteMessage text={errMsg} /></p> : null}

              {!canWrite ? (
                <div className="note-box stack" style={{ padding: '12px 14px' }}>
                  <p className="small" style={{ margin: 0 }}>
                    <T ko="지금 적어 두신 초안은 이 기기에 임시 저장돼요!" en="Your draft is saved on this device for now!" />{' '}
                    {!ready
                      ? <T ko="서버 연결이 열리면 바로 걸 수 있어요." en="You can post it as soon as the server connection opens." />
                      : !signedIn
                        ? <T ko="초대 손님으로 로그인하면 작성한 그대로 벽에 걸 수 있어요." en="Sign in as an invited guest to post it on the wall just as you wrote it." />
                        : <T ko="수첩에서 초대 코드를 확인하면 바로 벽에 걸 수 있어요." en="Confirm your invite code in your notebook to post it on the wall right away." />}
                  </p>
                  <div className="btn-row">
                    {!signedIn ? (
                      <Link className="btn btn-roof btn-small" href="/login?next=/guestbook"><T ko="초대 손님 로그인하고 걸기" en="Sign in as a guest and post" /></Link>
                    ) : (
                      <Link className="btn btn-roof btn-small" href="/notebook"><T ko="수첩에서 초대 코드 넣기" en="Enter your invite code in the notebook" /></Link>
                    )}
                    {text || source ? (
                      <button type="button" className="btn btn-small" onClick={() => updateDraft('', '')}>
                        <T ko="초안 지우기" en="Clear the draft" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="btn-row">
                  <button type="submit" className="btn btn-roof" disabled={pending || !canSubmit}>
                    {pending ? <T ko="봉투에 담는 중…" en="Putting it in the envelope…" /> : <T ko={dest.submitLabel} en={dest.en.submitLabel} />}
                  </button>
                  {text || source ? (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => updateDraft('', '')}
                    >
                      <T ko="지우고 다시 쓰기" en="Clear and start over" />
                    </button>
                  ) : null}
                </div>
              )}
            </form>
          )}
        </section>

        {/* 한지 엽서 실시간 미리보기 */}
        <aside className={css.postcard} aria-label={en ? 'Postcard preview' : '엽서 미리보기'}>
          <div className={css.postcardHead}>
            <div>
              <p className={css.kicker}>POSTCARD PREVIEW</p>
              <strong><T ko={dest.tabLabel} en={dest.en.tabLabel} /></strong>
            </div>
            {spot ? (
              <CarvedSeal
                label={spot.shortName}
                labelEn={spot.en.short}
                shape={spot.sealShape}
                motif={spot.motif}
                state="stamped"
                size={54}
                rot={spot.rot}
              />
            ) : null}
          </div>
          <p className={`${css.postcardBody} ${!text.trim() ? css.postcardEmpty : ''}`} lang={hangulLang(text.trim())}>
            {text.trim() || <T ko="여기에 적으시는 글이 한지 엽서 모양으로 미리 보여요." en="What you write shows up here as a hanji postcard." />}
          </p>
          {dest.quoteMode && source.trim() ? (
            <p className={css.postcardSource}><T ko="출처: " en="Source: " /><span lang={hangulLang(source)}>{source.trim()}</span></p>
          ) : null}
          <div className={css.postcardFoot}>
            <span>
              <T ko="보내는 이: " en="From: " />
              <strong lang={hangulLang(nickname)}>{nickname ?? <T ko="손님" en="Guest" />}</strong>
            </span>
            <span className="badge"><T ko={SCOPE_LABEL[scope]} en={SCOPE_EN[scope]} /></span>
          </div>
        </aside>
      </div>

      {/* 걸린 마음과 문장 읽기 벽 */}
      <section id="reading-wall" className={css.wallSection} aria-labelledby="wall-title">
        <div className={css.wallToolbar}>
          <h2 id="wall-title" style={{ margin: 0 }}>
            <T ko={`걸린 쪽지와 문장 (${filteredWall.length})`} en={`Notes and sentences (${filteredWall.length})`} />
          </h2>
          <div className={css.searchBox}>
            <input
              type="search"
              aria-label={en ? 'Search the notes' : '걸린 글 검색'}
              placeholder={en ? 'Find a word or a name…' : '낱말이나 이름으로 찾기…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionEnd={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        <div className={css.wallFilters} role="tablist" aria-label={en ? 'Notes by place' : '공간별 글 보기'}>
          <button
            type="button"
            role="tab"
            aria-selected={wallFilter === 'all'}
            className={css.filterBtn}
            data-active={wallFilter === 'all' || undefined}
            onClick={() => setWallFilter('all')}
          >
            <T ko="전체 보기" en="All" />
          </button>
          {DESTINATIONS.map((d) => (
            <button
              key={d.slug}
              type="button"
              role="tab"
              aria-selected={wallFilter === d.slug}
              className={css.filterBtn}
              data-active={wallFilter === d.slug || undefined}
              onClick={() => setWallFilter(d.slug)}
            >
              <T ko={d.tabLabel} en={d.en.tabLabel} />
            </button>
          ))}
        </div>

        {filteredWall.length === 0 ? (
          <p className="note-box">
            {query.trim()
              ? <T ko="찾으시는 낱말이 들어간 글이 아직 없어요." en="No notes with that word yet." />
              : <T ko="아직 이 자리에 걸린 글이 없어요. 첫 번째 인사를 남겨 주실래요?" en="Nothing is hung here yet. Would you like to leave the first hello?" />}
          </p>
        ) : (
          <div className={css.wallGrid}>
            {filteredWall.map((r) => (
              <article key={r.id} className={css.wallCard} data-status={r.status}>
                <div className="stack" style={{ gap: 8 }}>
                  <span className={css.wallRoomPill}><T ko={r.roomName} en={r.sampleEn?.roomName ?? placeName('en', r.roomName)} /></span>
                  {r.photo ? <PhotoThumb thumb={r.photo.thumb} view={r.photo.view} label={`${r.author_name} 님이 붙인 사진`} /> : null}
                  {r.sampleEn ? (
                    <p className={css.wallBody}><T ko={r.body} en={r.sampleEn.body} /></p>
                  ) : (
                    <p className={css.wallBody} lang={hangulLang(r.body)}>{r.body}</p>
                  )}
                </div>
                <div className={css.wallMeta}>
                  {r.sampleEn ? (
                    <strong><T ko={r.author_name} en={r.sampleEn.author} /></strong>
                  ) : (
                    <strong lang={hangulLang(r.author_name)}>{r.author_name}</strong>
                  )}
                  <span><T ko={dayLabel('ko', r.created_at)} en={dayLabel('en', r.created_at)} /></span>
                  {r.mine || r.status !== 'approved' ? <span className="badge"><T ko={WALL_STATUS[r.status].ko} en={WALL_STATUS[r.status].en} /></span> : null}
                  {r.mine ? <span className="badge"><T ko={SCOPE_LABEL[r.visibility]} en={SCOPE_EN[r.visibility]} /></span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
