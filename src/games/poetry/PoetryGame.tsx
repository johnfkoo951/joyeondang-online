// 문장의 주인을 찾아라: 구절 카드와 시인 낙관 넷. 맞히면 빛이 카드로 옮겨 오고 제목·연도·시인 소개, 끝에 오늘의 문장.
import { useEffect, useRef, useState } from 'react';
import { useTr } from '@/components/i18n/useLang';
import type { GameContext } from '../types';
import { COLLECTION_KEY, POETS, QUESTIONS, makeQuiz, parseCollection } from './questions';
import s from '../atelier/atelier.module.css';

export function PoetryGame({ ctx }: { ctx: GameContext }) {
  const tr = useTr();
  const [deck] = useState(() => makeQuiz(ctx.seed));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [hint, setHint] = useState(false);
  const [points, setPoints] = useState(0);
  const [done, setDone] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [collection, setCollection] = useState<string[]>(() => { try { return parseCollection(localStorage.getItem(COLLECTION_KEY)); } catch { return []; } });
  const [notice, setNotice] = useState('');
  const started = useRef(0);
  useEffect(() => { started.current = performance.now(); }, []);
  const locked = useRef(false);
  const { question, choices } = deck[index];
  const today = deck[ctx.seed % deck.length].question;
  const result = (score: number) => ({ cleared: true, score, ms: Math.max(500, Math.round(performance.now() - started.current)), detail: { questions: deck.length } });
  const pick = (poet: string) => {
    if (locked.current || answer || wrong.includes(poet)) return;
    if (poet !== question.poet) { setWrong(prev => [...prev, poet]); return; }
    locked.current = true;
    setAnswer(poet);
    setPoints(p => p + Math.max(25, 100 - wrong.length * 25 - (hint ? 10 : 0)));
  };
  const next = () => {
    if (!answer) return;
    if (index === deck.length - 1) { setDone(true); ctx.report?.(result(points)); return; }
    setIndex(i => i + 1); setAnswer(null); setWrong([]); setHint(false); locked.current = false;
  };
  const collect = (id: string) => {
    const nextIds = [...new Set([...collection, id])];
    try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(nextIds)); setCollection(nextIds); setNotice(tr('이 기기의 문장 수집함에 담았어요.', 'Saved in this browser’s sentence collection.')); }
    catch { setNotice(tr('이 기기에 저장할 수 없어요. 아래 파일로 내려받기를 이용해 주세요.', 'Browser storage is unavailable. Use the download below.')); }
  };
  const download = () => {
    const ids = [...new Set([...collection, today.id])];
    const text = ids.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean).map(q => `${q!.passage}\n${q!.poet} · ${q!.title} (${q!.year}, 제공 자료의 연도)`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'my-poetry-collection.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className={s.room}>
    <header className={s.toolbar}><h2>{tr('문장의 주인을 찾아라', 'Find the poet')}</h2><button className={s.plain} onClick={() => setShowCollection(v => !v)}>{showCollection ? tr('놀이로 돌아가기', 'Back to the game') : tr(`문장 수집함 (${collection.length})`, `My sentences (${collection.length})`)}</button></header>
    {showCollection ? <section className={s.collection}>
      <h3>{tr('따로 모아 둔 문장', 'Collected sentences')}</h3><p className={s.muted}>{tr('이 브라우저에만 보관됩니다. 다른 기기로 옮기려면 파일로 내려받으세요.', 'Stored in this browser only. Download a copy to keep it elsewhere.')}</p>
      <ul>{collection.map(id => { const q = QUESTIONS.find(q => q.id === id)!; return <li key={id}>{q.passage}<br/><small>{q.poet} · {q.title}</small></li>; })}</ul>
      {!collection.length && <p>{tr('아직 모은 문장이 없어요.', 'No sentences collected yet.')}</p>}
      <button className={s.plain} onClick={download}>{tr('문장 파일 내려받기', 'Download sentences')}</button>
    </section> : done ? <section className={s.complete}>
      <span className={s.stamp}>文</span><h3>{tr('오늘 당신에게 온 문장', 'A sentence for you today')}</h3>
      <blockquote className={s.poem}>{today.passage}</blockquote><p>{today.poet} · 『{today.title}』</p>
      <div className={s.actions}><button className={s.plain} onClick={() => collect(today.id)}>{tr('문장 수집함에 담기', 'Collect this sentence')}</button><button className={s.plain} onClick={download}>{tr('파일로 내려받기', 'Download a copy')}</button><button className={s.plain} onClick={() => ctx.onExit(result(points))}>{tr('퀴즈 마치기', 'Finish quiz')}</button></div>
    </section> : <main className={s.page}>
      <p className={s.muted}>{index + 1} / {deck.length} · {tr('이 문장을 쓴 시인의 낙관을 골라 주세요.', 'Choose the seal of the poet who wrote this line.')}</p>
      <blockquote className={s.poem} data-correct={Boolean(answer)}>{question.passage}</blockquote>
      <div className={s.seals}>{choices.map(poet => <button key={poet} className={s.seal} data-picked={answer === poet} disabled={Boolean(answer) || wrong.includes(poet)} aria-label={poet} onClick={() => pick(poet)}>{poet}</button>)}</div>
      <div className={s.answer} aria-live="polite">{answer ? <><p><strong>{question.title}</strong> · {question.year}</p><p>{POETS[question.poet]}</p><p className={s.muted}>{tr('현대어로 다듬은 제공 구절입니다. 연도·소개는 제공 문항 기준이며 초출 서지는 별도 확인이 필요합니다.', 'The supplied excerpt is modernized. Dates and notes follow the supplied questions; original publication details remain to be checked.')}</p><button className={s.plain} onClick={next}>{index === deck.length - 1 ? tr('오늘의 문장 만나기', 'Meet today’s sentence') : tr('다음 문장', 'Next sentence')}</button></> : <><p>{wrong.length ? tr('아직 낙관이 찍히지 않았어요. 다른 시인을 골라 보세요.', 'No seal yet. Try another poet.') : tr('천천히 읽어도 괜찮아요.', 'Take your time reading.')}</p><button className={s.plain} onClick={() => setHint(v => !v)}>{tr('힌트', 'Hint')}</button>{hint && <p lang="ko">{question.hint}</p>}</>}</div>
    </main>}
    <p className={s.status} role="status">{notice}</p>
  </div>;
}
