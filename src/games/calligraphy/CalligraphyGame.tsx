// 글씨의 주인을 찾아라: 恒常心 세 칸을 체본 따라 쓰고(칸마다 체본 60% 이상, 바깥 먹 30% 이하) 낙관을 찍는다.
import { useEffect, useRef, useState } from 'react';
import { useTr } from '@/components/i18n/useLang';
import type { GameContext } from '../types';
import { alphaMask, coverage, dilate, downloadCanvas, dryTip, inkSegment, type Point } from '../atelier/brush';
import s from '../atelier/atelier.module.css';
const SIZE = 320;
const CHARS = ['恒', '常', '心'];
const SOUNDS = ['항', '상', '심'];
const FONT = '"AppleMyungjo", "Batang", "Noto Serif CJK KR", serif';
type Grade = ReturnType<typeof coverage>;
function Letter({ char, sound, onGrade, register }: { char: string; sound: string; onGrade: (grade: Grade) => void; register: (canvas: HTMLCanvasElement | null) => void }) {
  const tr = useTr();
  const guideRef = useRef<HTMLCanvasElement>(null), inkRef = useRef<HTMLCanvasElement>(null);
  const masks = useRef<{ guide: Uint8Array; tolerance: Uint8Array } | null>(null);
  const stroke = useRef<{ id: number; p: Point; before: Point | null; radius: number } | null>(null);
  const undo = useRef<ImageData[]>([]);
  const [ready, setReady] = useState(false);
  const [grade, setGrade] = useState<Grade>({ ratio: 0, overflow: 0, complete: false });
  const onGradeRef = useRef(onGrade);
  useEffect(() => { onGradeRef.current = onGrade; }, [onGrade]);
  useEffect(() => {
    let stop = false;
    void document.fonts.load(`240px ${FONT}`, char).catch(() => []).then(() => {
      if (stop || !guideRef.current) return;
      const maskCanvas = document.createElement('canvas'); maskCanvas.width = maskCanvas.height = SIZE;
      const g = maskCanvas.getContext('2d')!;
      g.font = `240px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(char, SIZE / 2, SIZE / 2 + 8);
      const guide = alphaMask(g.getImageData(0, 0, SIZE, SIZE).data);
      masks.current = { guide, tolerance: dilate(guide, SIZE, 5) };
      const visible = guideRef.current.getContext('2d')!;
      visible.globalAlpha = .11; visible.drawImage(maskCanvas, 0, 0);
      setReady(true);
    });
    return () => { stop = true; };
  }, [char]);
  const evaluate = () => {
    if (!inkRef.current || !masks.current) return;
    const ink = alphaMask(inkRef.current.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data);
    const next = coverage(masks.current.guide, ink, masks.current.tolerance);
    setGrade(next); onGradeRef.current(next);
  };
  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * SIZE / rect.width, y: (e.clientY - rect.top) * SIZE / rect.height, time: e.timeStamp, pressure: e.pressure, pointerType: e.pointerType };
  };
  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = stroke.current;
    if (!st || st.id !== e.pointerId) return;
    dryTip(e.currentTarget.getContext('2d')!, st.p, st.before, st.radius);
    stroke.current = null; evaluate();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div className={s.cell}>
    <div className={s.sheet}><canvas className={s.guide} ref={guideRef} width={SIZE} height={SIZE} aria-hidden="true"/>
      <canvas className={s.draw} ref={el => { inkRef.current = el; register(el); }} width={SIZE} height={SIZE} aria-label={`${char} (${sound}) ${tr('따라 쓰는 칸', 'tracing canvas')}`}
        onPointerDown={e => { if (!ready || stroke.current) return; e.preventDefault(); const g = e.currentTarget.getContext('2d')!; undo.current.push(g.getImageData(0, 0, SIZE, SIZE)); if (undo.current.length > 20) undo.current.shift(); const p = point(e); stroke.current = { id: e.pointerId, p, before: null, radius: inkSegment(g, p, null, 12) }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { const st = stroke.current; if (!st || st.id !== e.pointerId) return; const p = point(e); st.radius = inkSegment(e.currentTarget.getContext('2d')!, p, st.p, 12); st.before = st.p; st.p = p; }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}/></div>
    <div className={s.caption}>{char} <small>{sound}</small> {grade.complete ? '✓' : ''}</div>
    <span className={s.inkInfo}>{ready ? tr(`체본 ${Math.round(grade.ratio * 100)}% · 바깥 먹 ${Math.round(grade.overflow * 100)}%`, `Guide ${Math.round(grade.ratio * 100)}% · Outside ${Math.round(grade.overflow * 100)}%`) : tr('체본을 준비하고 있어요', 'Preparing guide')}</span>
    <button className={s.plain} onClick={() => { const previous = undo.current.pop(); if (previous) inkRef.current?.getContext('2d')!.putImageData(previous, 0, 0); evaluate(); }}>{tr('한 획 되돌리기', 'Undo stroke')}</button>{' '}
    <button className={s.plain} onClick={() => { const g = inkRef.current?.getContext('2d'); if (g) { undo.current.push(g.getImageData(0, 0, SIZE, SIZE)); if (undo.current.length > 20) undo.current.shift(); g.clearRect(0, 0, SIZE, SIZE); } evaluate(); }}>{tr('이 칸 지우기', 'Clear cell')}</button>
  </div>;
}
export function CalligraphyGame({ ctx }: { ctx: GameContext }) {
  const tr = useTr();
  const [grades, setGrades] = useState<boolean[]>([false, false, false]);
  const [sealed, setSealed] = useState(false);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const started = useRef(0);
  useEffect(() => { started.current = performance.now(); }, []);
  const result = () => ({ cleared: true, ms: Math.max(500, Math.round(performance.now() - started.current)), detail: { letters: 3 } });
  const save = () => {
    const combined = document.createElement('canvas'); combined.width = SIZE * 3; combined.height = SIZE;
    const g = combined.getContext('2d')!; canvases.current.forEach((c, i) => { if (c) g.drawImage(c, SIZE * i, 0); });
    g.strokeStyle = '#a53b32'; g.strokeRect(SIZE * 3 - 46, SIZE - 46, 32, 32); g.fillStyle = '#a53b32'; g.font = '20px serif'; g.fillText('心', SIZE * 3 - 40, SIZE - 22);
    downloadCanvas(combined, 'constant-heart.png', '恒常心 · 항상심');
  };
  return <div className={s.room}>
    <header className={s.toolbar}><h2>{tr('글씨의 주인을 찾아라', 'Trace a constant heart')}</h2><span>{tr('恒常心 · 항상심', '恒常心 · A constant heart')}</span></header>
    <p className={`${s.page} ${s.muted}`}>{tr('옅은 체본을 따라 한 글자씩 써 보세요. 세 칸 각각 체본의 60% 이상을 덮고, 먹이 너무 많이 벗어나지 않으면 완성입니다. 펜·손가락은 필압, 마우스는 속도로 굵기가 달라져요.', 'Trace each pale character. Cover at least 60% of every guide with no more than 30% of the ink outside its margin. Pen pressure or mouse speed controls the brush.')}</p>
    <div className={s.cells} inert={sealed || undefined}>{CHARS.map((char, i) => <Letter key={char} char={char} sound={SOUNDS[i]} register={c => { canvases.current[i] = c; }} onGrade={grade => setGrades(prev => prev.map((v, j) => j === i ? grade.complete : v))}/>)}</div>
    {sealed ? <section className={s.complete} aria-live="polite"><span className={s.stamp}>心</span><div><div className={s.morph} aria-label="向上心에서 恒常心으로"><span>向</span><span>恒</span><span className={s.middleChange}><i>上</i><i>常</i></span><span>心</span></div></div><p className={s.muted}>{tr('향상심(向上心)에서 항상심(恒常心)으로', 'From aspiration (向上心) to constancy (恒常心)')}</p><p className={s.quote} lang="ko">저는 위를 향하는 마음보다, 늘 같은 자리에 있는 마음이 좋아요<br/>그래서 저는 향상심보다 <strong>항상심</strong>을 좋아한답니다.</p><div className={s.actions}><button className={s.plain} onClick={save}>{tr('내 글씨 PNG 내려받기', 'Download my calligraphy')}</button><button className={s.plain} onClick={() => ctx.onExit(result())}>{tr('마치기', 'Finish')}</button></div></section> : <div className={s.complete}><button className={s.seal} disabled={!grades.every(Boolean)} onClick={() => { if (!grades.every(Boolean)) return; setSealed(true); ctx.report?.(result()); }}>{tr('낙관 찍기', 'Seal')}</button></div>}
  </div>;
}
