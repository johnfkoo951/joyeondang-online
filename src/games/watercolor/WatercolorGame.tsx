// 창가에서 수채 그림그리기: 점수 없는 그리기. 자동 저장하지 않으므로 내려받지 않고 나가려 하면 한 번 알린다.
import { useRef, useState } from 'react';
import { useTr } from '@/components/i18n/useLang';
import { downloadCanvas, waterSegment, type Point } from '../atelier/brush';
import type { GameContext } from '../types';
import s from '../atelier/atelier.module.css';
const COLORS = ['#526a94', '#669788', '#bb6476', '#c5a24c', '#6c5e82', '#855c42'];
const NAMES = [['쪽빛', 'Indigo'], ['풀빛', 'Sage'], ['장미', 'Rose'], ['황토', 'Ochre'], ['보라', 'Violet'], ['갈색', 'Umber']];
export function WatercolorGame({ ctx }: { ctx: GameContext }) {
  const tr = useTr(), canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(22), [water, setWater] = useState(.65);
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [leaveArmed, setLeaveArmed] = useState(false);
  const undo = useRef<ImageData[]>([]);
  const stroke = useRef<{ id: number; point: Point } | null>(null);
  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => { const b = e.currentTarget.getBoundingClientRect(); return { x: (e.clientX - b.left) * 960 / b.width, y: (e.clientY - b.top) * 720 / b.height, pressure: e.pressure, pointerType: e.pointerType, time: e.timeStamp }; };
  const remember = () => { const g = canvas.current?.getContext('2d'); if (g) { undo.current.push(g.getImageData(0, 0, 960, 720)); if (undo.current.length > 15) undo.current.shift(); } };
  const end = (e: React.PointerEvent<HTMLCanvasElement>) => { if (stroke.current?.id !== e.pointerId) return; stroke.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
  return <div className={s.room}>
    <header className={s.toolbar}><h2>{tr('창가에서 수채 그림그리기', 'Watercolors by the window')}</h2><button className={s.plain} onClick={() => { if (dirty && !leaveArmed) { setLeaveArmed(true); setNotice(tr('아직 내려받지 않은 그림이 있어요. 한 번 더 누르면 그림 없이 나가요.', 'This painting has not been downloaded. Press again to leave without it.')); return; } ctx.onExit(); }}>{leaveArmed ? tr('그림 없이 나가기', 'Leave without painting') : tr('그리기 마치기', 'Finish painting')}</button></header>
    <p className={`${s.page} ${s.muted}`}>{tr('종이 위에 물감을 겹쳐 보세요. 정답도 점수도 없습니다. 그림은 자동으로 저장되지 않으니 떠나기 전에 내려받아 주세요.', 'Layer washes on paper. There is no score or right answer. Download your painting before leaving; it is not saved automatically.')}</p>
    <div className={s.toolbar}>
      <div className={s.actions}>{COLORS.map((c, i) => <button key={c} className={s.swatch} style={{ '--color': c } as React.CSSProperties} aria-label={tr(NAMES[i][0], NAMES[i][1])} aria-pressed={color === c} onClick={() => setColor(c)}/>)}</div>
      <label>{tr('붓 크기', 'Brush size')} <input type="range" min={4} max={65} value={size} onChange={e => setSize(Number(e.target.value))}/></label>
      <label>{tr('물의 양', 'Water')} <input type="range" min={0} max={1} step={.05} value={water} onChange={e => setWater(Number(e.target.value))}/></label>
    </div>
    <div className={s.paintSurface}><canvas ref={canvas} width={960} height={720} aria-label={tr('빈 수채화 도화지', 'Blank watercolor paper')}
      onPointerDown={e => { if (stroke.current) return; e.preventDefault(); remember(); setDirty(true); setLeaveArmed(false); const p = point(e); stroke.current = { id: e.pointerId, point: p }; e.currentTarget.setPointerCapture(e.pointerId); waterSegment(e.currentTarget.getContext('2d')!, p, null, size, color, water); }}
      onPointerMove={e => { const st = stroke.current; if (!st || st.id !== e.pointerId) return; const p = point(e); waterSegment(e.currentTarget.getContext('2d')!, p, st.point, size, color, water); st.point = p; }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/></div>
    <div className={s.toolbar}><div className={s.actions}>
      <button className={s.plain} onClick={() => { const previous = undo.current.pop(); if (previous) canvas.current?.getContext('2d')!.putImageData(previous, 0, 0); }}>{tr('한 획 되돌리기', 'Undo stroke')}</button>
      <button className={s.plain} onClick={() => { remember(); canvas.current?.getContext('2d')!.clearRect(0, 0, 960, 720); }}>{tr('새 종이 (되돌리기 가능)', 'New paper (can undo)')}</button>
      <button className={s.plain} onClick={() => { if (!canvas.current) return; downloadCanvas(canvas.current, 'window-watercolor.png'); setDirty(false); setLeaveArmed(false); setNotice(tr('PNG 내려받기를 요청했어요.', 'PNG download requested.')); }}>{tr('내 수채화 PNG 내려받기', 'Download my watercolor')}</button>
    </div><span role="status">{notice}</span></div>
  </div>;
}
