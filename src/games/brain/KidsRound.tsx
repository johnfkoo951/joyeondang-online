'use client';
// 그림 서랍 놀이(글을 몰라도): 그림 카드 여섯 장을 같은 색 서랍 셋에 넣는다. 그림과 소리로만 알려 준다.
// 틀리면 카드가 살짝 흔들리고(움직임 줄이기면 흔들지 않음) 제자리로, 맞으면 서랍 안으로 쏙.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang, useTr } from '@/components/i18n/useLang';
import { shouldHandleShortcut } from '@/lib/keys';
import type { RoundProps } from './BrainGame';
import { KIDS_DRAWERS, type KidsDrawerId, type Picture } from './bank';
import { beginDrag, wasDragged } from './drag';
import { KIDS_COUNT, buildKids } from './logic';
import { Icon, Pic } from './pictures';
import { drawerEn, drawerOf } from './RoundDrawers';
import s from './brain.module.css';

type Props = Omit<RoundProps, 'onDone'> & {
  seed: number;
  onCount: (firstTry: number, placed: number) => void;
  onFinish: () => void;
};

const TONE: Record<KidsDrawerId, string> = { read: 'kRead', screen: 'kScreen', make: 'kMake' };

export function KidsRound({ seed, play, still, onProgress, onCount, onFinish }: Props) {
  const [round, setRound] = useState(0);
  const cards = useMemo(() => buildKids(seed + round * 7919), [seed, round]);
  const [placed, setPlaced] = useState<Picture[]>([]);
  const [missed, setMissed] = useState<Picture[]>([]);
  const [sel, setSel] = useState<Picture | null>(null);
  const [shake, setShake] = useState<Picture | null>(null);
  const shakeTimer = useRef(0);
  const doneBtn = useRef<HTMLButtonElement>(null);
  const done = placed.length >= KIDS_COUNT;
  const en = useLang() === 'en';
  const tr = useTr();

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);
  useEffect(() => {
    if (done) doneBtn.current?.focus();
  }, [done]);

  const drop = (pic: Picture, to: KidsDrawerId) => {
    if (placed.includes(pic)) return;
    const card = cards.find((c) => c.id === pic);
    if (!card) return;
    setSel(null);
    if (card.to === to) {
      const nextPlaced = [...placed, pic];
      setPlaced(nextPlaced);
      play('drawer');
      play(nextPlaced.length >= KIDS_COUNT ? 'clear' : 'good');
      const first = nextPlaced.filter((p) => !missed.includes(p)).length;
      onCount(first, nextPlaced.length);
      onProgress({ at: nextPlaced.length, of: KIDS_COUNT });
      return;
    }
    play('bad');
    if (!missed.includes(pic)) setMissed([...missed, pic]);
    if (!still) {
      setShake(pic);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(null), 450);
    }
  };

  const tapDrawer = (to: KidsDrawerId) => {
    if (sel) drop(sel, to);
    else play('pick');
  };

  const keyRef = useRef<(n: number) => void>(() => {});
  useEffect(() => {
    keyRef.current = (n) => {
      const d = KIDS_DRAWERS[n - 1];
      if (d && sel) drop(sel, d.id);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleShortcut(e) || e.altKey || e.ctrlKey || e.metaKey || e.repeat || !/^[1-3]$/.test(e.key)) return;
      e.preventDefault();
      keyRef.current(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const again = () => {
    setRound((r) => r + 1);
    setPlaced([]);
    setMissed([]);
    setSel(null);
    onCount(0, 0);
    onProgress({ at: 0, of: KIDS_COUNT });
    play('pick');
  };

  const toneOf = (pic: Picture) => {
    const c = cards.find((x) => x.id === pic);
    return c ? s[TONE[c.to]] : '';
  };

  return (
    <section className={`${s.round} ${s.kids}`} aria-labelledby="brain-kids-q">
      <h3 id="brain-kids-q" className={s.roundTitle}>
        {tr('그림을 같은 색 서랍에 넣어요', 'Put each picture in the drawer of the same color')}
      </h3>
      {!done ? (
        <ul className={s.kidTray} aria-label={tr('그림 카드', 'Picture cards')}>
          {cards.map((c) =>
            placed.includes(c.id) ? (
              <li key={c.id} className={s.kidGone} aria-hidden="true" />
            ) : (
              <li key={c.id}>
                <button
                  type="button"
                  className={`${s.kidCard} ${toneOf(c.id)}`}
                  data-drag=""
                  data-shake={shake === c.id ? '' : undefined}
                  aria-pressed={sel === c.id}
                  aria-label={en ? c.en : c.name}
                  onPointerDown={(e) =>
                    beginDrag(e, (d) => {
                      const to = d.dataset.drop as KidsDrawerId | undefined;
                      if (to && to in TONE) drop(c.id, to);
                    })
                  }
                  onClick={(e) => {
                    if (wasDragged(e.currentTarget)) return;
                    setSel((cur) => (cur === c.id ? null : c.id));
                    play('pick');
                  }}
                >
                  <Pic name={c.id} />
                  <span className={s.kidDot} aria-hidden="true" />
                </button>
              </li>
            ),
          )}
        </ul>
      ) : (
        <div className={s.kidDone}>
          <span className={s.doneStar} data-on="">
            <Icon name="star" />
          </span>
          <p className={s.homeTitle}>{tr('다 넣었어요!', 'All in!')}</p>
          <div className={s.kidDoneBtns}>
            <button ref={doneBtn} type="button" className={`${s.btn} ${s.btnPrimary} ${s.bigBtn}`} onClick={onFinish}>
              <Icon name="check" /> {tr('마치기', 'Finish')}
            </button>
            <button type="button" className={`${s.btn} ${s.bigBtn}`} onClick={again}>
              <Icon name="again" /> {tr('한 번 더', 'Play again')}
            </button>
          </div>
        </div>
      )}
      <div className={s.kidDrawers}>
        {KIDS_DRAWERS.map((d, i) => {
          const inside = cards.filter((c) => c.to === d.id && placed.includes(c.id));
          const real = drawerOf(d.drawer);
          return (
            <button
              key={d.id}
              type="button"
              className={`${s.kidDrawer} ${s[TONE[d.id]]}`}
              data-drop={d.id}
              data-ready={sel ? '' : undefined}
              onClick={() => tapDrawer(d.id)}
              aria-keyshortcuts={String(i + 1)}
              aria-label={
                en
                  ? `${d.en}, drawer ${real.code} ${drawerEn(real)}${inside.length ? `, holds ${inside.map((c) => c.en).join(', ')}` : ''}`
                  : `${d.name}, ${real.code} ${real.name} 서랍${inside.length ? `, ${inside.map((c) => c.name).join(', ')} 들어 있음` : ''}`
              }
            >
              <span className={s.kidDrawerPic}>
                <Pic name={d.id} />
              </span>
              <span className={s.kidInside}>
                {inside.map((c) => (
                  <Pic key={c.id} name={c.id} />
                ))}
              </span>
              <span className={s.dHandle} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <p className={s.grownup}>
        {tr(
          '어른에게: 책은 200 문헌, 컴퓨터와 휴대폰은 500 도구, 그림과 노래는 700 창작 서랍이에요. 숫자 1~3으로도 넣을 수 있어요.',
          'For grown-ups: books go in 200 Literature, the computer and phone in 500 Products, painting and songs in 700 Creatives. Keys 1 to 3 work too.',
        )}
      </p>
    </section>
  );
}
