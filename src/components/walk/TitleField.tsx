'use client';
import { useId, useState, type KeyboardEvent } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { TITLE_MAX, cleanTitle } from '@/walk/look';
import { hasHangul } from './PlaceText';
import css from './TitleField.module.css';

type Props = {
  /** 지금 달린 칭호(없으면 빈 글) */
  value: string;
  /** 미리보기 이름표에 쓸 내 이름 */
  name?: string | null;
  /** 칭호를 단다. 빈 글이면 뗀다 */
  onSave: (title: string) => void;
};

/** 칸에 쓴 글을 칭호처럼 줄였을 때의 글자 수(자르기 전): 넘쳤는지 보려고 */
const lengthOf = (s: string) => Array.from(s.replace(/\s+/g, ' ').trim()).length;

// 칭호: 이름표 위에 뜨는 내가 쓴 짧은 한 줄. 함께 걷는 사람 모두에게 보인다.
// 글자 수와 미리보기는 한글을 조합하는 중에도 바로 바뀌고(보여 주기), 달기는 조합이 끝난 뒤 Enter나 단추로 한다(확정하기)
export function TitleField({ value, name, onSave }: Props) {
  const lang = useLang();
  const tr = useTr();
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [note, setNote] = useState<'set' | 'off' | null>(null);
  const count = lengthOf(draft);
  const over = count > TITLE_MAX;
  const clean = cleanTitle(draft);
  const changed = clean !== value;
  const save = () => {
    if (over || !changed) return;
    onSave(clean);
    setNote(clean ? 'set' : 'off');
  };
  const remove = () => {
    setDraft('');
    onSave('');
    setNote('off');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    save();
  };
  const shownName = (name ?? '').trim() || tr('내 이름', 'My name');

  return (
    <section className={css.box} aria-labelledby={`${id}-h`}>
      <div className={css.head}>
        <h3 id={`${id}-h`} className={css.title}><T ko="칭호" en="Title" /></h3>
        <span id={`${id}-n`} className={css.count} data-over={over ? 'true' : undefined}>{count}/{TITLE_MAX}</span>
      </div>
      <p className={`small ${css.help}`}>
        <T ko="이름 위에 짧은 한 줄이 떠요. 함께 걷는 사람 모두에게 보여요." en="A short line shown above your name. Everyone walking with you can see it." />
      </p>
      <div className={css.preview} aria-hidden="true">
        {clean ? <span className={css.badge} lang={lang === 'en' && hasHangul(clean) ? 'ko' : undefined}>{clean}</span> : null}
        <span className={css.name} lang={lang === 'en' && hasHangul(shownName) ? 'ko' : undefined}>{shownName}</span>
      </div>
      <div className={css.row}>
        <input
          type="text"
          className={css.input}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setNote(null);
          }}
          onKeyDown={onKey}
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          // 받는 쪽이 TITLE_MAX자로 자른다. 칸은 넘친 것을 보여 주고(글자 수가 붉어진다) 달기를 막는다
          maxLength={TITLE_MAX * 3}
          placeholder={tr('예: 오늘도 커피 한 잔', 'e.g. One more coffee today')}
          aria-label={tr('칭호', 'Title')}
          aria-describedby={`${id}-n`}
          aria-invalid={over || undefined}
        />
        <button type="button" className="btn btn-small btn-pine" onClick={save} disabled={over || !changed}>
          <T ko="달기" en="Set" />
        </button>
        {value ? (
          <button type="button" className="btn btn-small" onClick={remove}><T ko="떼기" en="Remove" /></button>
        ) : null}
      </div>
      <p className={`small ${css.note}`} role="status">
        {over
          ? <T ko={`${TITLE_MAX}자까지 쓸 수 있어요.`} en={`Up to ${TITLE_MAX} characters.`} />
          : note === 'set' ? <T ko="칭호를 달았어요." en="Title set." />
            : note === 'off' ? <T ko="칭호를 뗐어요." en="Title removed." /> : null}
      </p>
    </section>
  );
}
