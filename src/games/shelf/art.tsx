// 선반 소품 그림. 원시 도형만 쓴 단순 SVG(64×64). 모양마다 주색(m)과 그 어두운 색(d)·밝은 색(l)을 받는다.
import type { JSX } from 'react';
import type { ShapeKey } from './items';
import { shade } from './logic';

type C = { m: string; d: string; l: string };
const EYE = '#2a2622';
const WOOD = '#8a5a35';
const CREAM = '#f6efe0';

const ART: Record<ShapeKey, (c: C) => JSX.Element> = {
  dino: ({ m, d, l }) => (
    <>
      <path d="M14 40Q5 42 4 33" stroke={m} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M19 31l3-6 3 6 3-6 3 6 3-6 3 6" fill={l} />
      <ellipse cx="28" cy="40" rx="16" ry="11" fill={m} />
      <path d="M36 34Q42 22 44 15" stroke={m} strokeWidth="8" strokeLinecap="round" fill="none" />
      <ellipse cx="47" cy="13" rx="8" ry="5.5" fill={m} />
      <rect x="18" y="45" width="6" height="12" rx="3" fill={d} />
      <rect x="31" y="45" width="6" height="12" rx="3" fill={d} />
      <circle cx="49" cy="11.5" r="1.6" fill={EYE} />
    </>
  ),
  car: ({ m, d, l }) => (
    <>
      <path d="M6 44v-9c0-3 2-5 5-5h8l6-8h15l8 8h5c3 0 5 2 5 5v9z" fill={m} />
      <path d="M26 25h13l5 5H22z" fill={l} />
      <rect x="6" y="38" width="52" height="3" fill={d} />
      {[18, 46].map((x) => (
        <g key={x}>
          <circle cx={x} cy="45" r="6.5" fill={EYE} />
          <circle cx={x} cy="45" r="2.6" fill="#d9d4cb" />
        </g>
      ))}
    </>
  ),
  train: ({ m, d, l }) => (
    <>
      <rect x="13" y="14" width="8" height="12" fill={d} />
      <rect x="8" y="25" width="30" height="20" rx="3" fill={m} />
      <rect x="34" y="14" width="22" height="31" rx="3" fill={d} />
      <rect x="38" y="19" width="14" height="10" rx="2" fill={l} />
      <path d="M4 45l6-7v7z" fill={d} />
      {[16, 30, 46].map((x) => (
        <circle key={x} cx={x} cy="49" r="5.5" fill={EYE} />
      ))}
    </>
  ),
  blocks: ({ m, l }) => (
    <>
      <rect x="7" y="34" width="23" height="23" rx="3" fill={m} />
      <rect x="34" y="34" width="23" height="23" rx="3" fill="#4b82c4" />
      <rect x="20" y="9" width="23" height="23" rx="3" fill="#5f9e57" />
      <circle cx="18.5" cy="45.5" r="5.5" fill={l} />
      <path d="M45.5 39l6.5 12h-13z" fill="#fff" opacity=".55" />
      <rect x="27.5" y="16.5" width="8" height="8" fill="#fff" opacity=".55" />
    </>
  ),
  robot: ({ m, d, l }) => (
    <>
      <line x1="32" y1="12" x2="32" y2="5" stroke={d} strokeWidth="3" />
      <circle cx="32" cy="5" r="3.2" fill="#e05a4f" />
      <rect x="18" y="12" width="28" height="20" rx="5" fill={m} />
      <circle cx="26" cy="22" r="3.6" fill={EYE} />
      <circle cx="38" cy="22" r="3.6" fill={EYE} />
      <rect x="8" y="36" width="6" height="14" rx="3" fill={m} />
      <rect x="50" y="36" width="6" height="14" rx="3" fill={m} />
      <rect x="16" y="34" width="32" height="22" rx="5" fill={d} />
      <rect x="24" y="40" width="16" height="8" rx="2" fill={l} />
    </>
  ),
  ball: ({ m, l }) => (
    <>
      <circle cx="32" cy="34" r="22" fill={m} />
      <path d="M10 34h44" stroke={l} strokeWidth="5" />
      <path d="M32 12c-9 7-9 37 0 44" stroke={l} strokeWidth="5" fill="none" />
      <circle cx="23" cy="24" r="5" fill="#fff" opacity=".35" />
    </>
  ),
  star: ({ m, d }) => (
    <>
      <path d="M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z" fill={m} stroke={d} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="27" cy="29" r="2" fill={EYE} />
      <circle cx="37" cy="29" r="2" fill={EYE} />
      <path d="M28 35q4 3 8 0" stroke={EYE} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  book: ({ m, d, l }) => (
    <>
      <rect x="14" y="8" width="36" height="48" rx="3" fill={m} />
      <rect x="14" y="8" width="7" height="48" rx="2" fill={d} />
      <rect x="26" y="15" width="18" height="11" rx="2" fill={l} />
      <circle cx="35" cy="40" r="6.5" fill="#f0c43c" />
    </>
  ),
  crayons: ({ m }) => (
    <>
      {[m, '#4b82c4', '#f0c43c'].map((c, i) => {
        const x = 13 + i * 14;
        return (
          <g key={i}>
            <path d={`M${x} 20l5-11 5 11z`} fill={c} />
            <rect x={x} y="19" width="10" height="38" rx="2" fill={c} />
            <rect x={x} y="29" width="10" height="5" fill="#fff" opacity=".45" />
          </g>
        );
      })}
    </>
  ),
  palette: ({ m, d }) => (
    <>
      <path d="M32 8C16 8 6 19 6 32s10 24 22 24c4 0 5-3 4-6s1-6 5-6h7c8 0 14-5 14-12C58 18 47 8 32 8z" fill={m} />
      <circle cx="20" cy="26" r="5" fill="#d2553f" />
      <circle cx="32" cy="18" r="5" fill="#f0c43c" />
      <circle cx="44" cy="22" r="5" fill="#4b82c4" />
      <circle cx="48" cy="34" r="4.5" fill="#5f9e57" />
      <circle cx="20" cy="42" r="4" fill={d} />
    </>
  ),
  drum: ({ m, d }) => (
    <>
      <line x1="40" y1="20" x2="56" y2="5" stroke={WOOD} strokeWidth="3" strokeLinecap="round" />
      <line x1="26" y1="18" x2="12" y2="4" stroke={WOOD} strokeWidth="3" strokeLinecap="round" />
      <rect x="10" y="25" width="44" height="25" fill={m} />
      <ellipse cx="32" cy="50" rx="22" ry="7" fill={d} />
      <path d="M10 29l11 19 11-19 11 19 11-19" stroke="#fff" strokeWidth="2.4" fill="none" opacity=".8" />
      <ellipse cx="32" cy="25" rx="22" ry="7" fill={CREAM} />
    </>
  ),
  guitar: ({ m, d }) => (
    <>
      <rect x="30" y="3" width="6" height="30" rx="2" fill={WOOD} />
      <rect x="28" y="2" width="10" height="6" rx="2" fill={d} />
      <circle cx="33" cy="38" r="11" fill={m} />
      <circle cx="33" cy="50" r="12.5" fill={m} />
      <circle cx="33" cy="43" r="4" fill={EYE} />
      <rect x="27" y="52" width="12" height="3" rx="1.5" fill={d} />
    </>
  ),
  trumpet: ({ m, d }) => (
    <>
      <path d="M14 36q0 10 12 10h10q4 0 4-6" stroke={m} strokeWidth="4" fill="none" />
      <rect x="8" y="28" width="32" height="8" fill={m} />
      <path d="M38 22L56 12v40L38 42z" fill={m} />
      <ellipse cx="56" cy="32" rx="3" ry="20" fill={d} />
      {[18, 25, 32].map((x) => (
        <rect key={x} x={x} y="20" width="4" height="8" fill={d} />
      ))}
      <rect x="4" y="29" width="5" height="6" rx="1" fill={d} />
    </>
  ),
  plane: ({ m, d, l }) => (
    <>
      <path d="M6 34c0-4 4-6 10-6h30l9-12h4l-3 14c2 1 4 3 4 5s-3 3-6 3H14c-5 0-8-2-8-4z" fill={m} />
      <path d="M24 34l10 17h6l-4-17z" fill={d} />
      {[20, 28, 36].map((x) => (
        <circle key={x} cx={x} cy="32" r="2.6" fill={l} />
      ))}
    </>
  ),
  boat: ({ m, d }) => (
    <>
      <rect x="31" y="8" width="3" height="33" fill={WOOD} />
      <path d="M34 10l18 26H34z" fill={CREAM} />
      <path d="M30 14L14 36h16z" fill={m} />
      <path d="M8 40h48l-7 12H15z" fill={d} />
      <path d="M4 57q6-4 12 0t12 0 12 0 12 0 12 0" stroke="#4b9bd4" strokeWidth="3" fill="none" />
    </>
  ),
  rocket: ({ m, d }) => (
    <>
      <path d="M28 48q4 13 8 0z" fill="#f0c43c" />
      <path d="M20 32l-8 13h9zM44 32l8 13h-9z" fill={m} />
      <path d="M32 4c10 8 14 20 12 36H20C18 24 22 12 32 4z" fill="#eef0f2" />
      <path d="M32 4c5 4 8 9 10 14H22c2-5 5-10 10-14z" fill={m} />
      <circle cx="32" cy="27" r="5" fill="#4b82c4" stroke={d} strokeWidth="2" />
      <path d="M25 40h14l-2 8H27z" fill={d} />
    </>
  ),
  teddy: ({ m, d, l }) => (
    <>
      <circle cx="20" cy="12" r="6" fill={m} />
      <circle cx="44" cy="12" r="6" fill={m} />
      <ellipse cx="32" cy="46" rx="16" ry="13" fill={m} />
      <circle cx="32" cy="22" r="14" fill={m} />
      <ellipse cx="32" cy="27" rx="6" ry="4.5" fill={l} />
      <ellipse cx="32" cy="48" rx="8" ry="7" fill={l} />
      <circle cx="26" cy="19" r="2" fill={EYE} />
      <circle cx="38" cy="19" r="2" fill={EYE} />
      <circle cx="32" cy="25.5" r="2" fill={EYE} />
      <circle cx="18" cy="55" r="5" fill={d} />
      <circle cx="46" cy="55" r="5" fill={d} />
    </>
  ),
  cat: ({ m, d }) => (
    <>
      <path d="M44 52q14-2 10-16" stroke={m} strokeWidth="5" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="45" rx="15" ry="12" fill={m} />
      <path d="M17 30L19 11l8 9h10l8-9 2 19c0 8-7 12-15 12s-15-4-15-12z" fill={m} />
      <circle cx="26" cy="28" r="2" fill={EYE} />
      <circle cx="38" cy="28" r="2" fill={EYE} />
      <path d="M30.5 32h3L32 34z" fill="#d24f6e" />
      <path d="M22 33h-8M22 35l-7 3M42 33h8M42 35l7 3" stroke={d} strokeWidth="1.4" />
      <path d="M27 47h10M27 51h10" stroke={d} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  dog: ({ m, d, l }) => (
    <>
      <path d="M45 52q8 2 10-6" stroke={m} strokeWidth="5" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="46" rx="15" ry="12" fill={m} />
      <circle cx="32" cy="26" r="13" fill={m} />
      <ellipse cx="18" cy="27" rx="5" ry="10" fill={d} transform="rotate(15 18 27)" />
      <ellipse cx="46" cy="27" rx="5" ry="10" fill={d} transform="rotate(-15 46 27)" />
      <ellipse cx="32" cy="31" rx="7" ry="5" fill={l} />
      <circle cx="27" cy="24" r="2" fill={EYE} />
      <circle cx="37" cy="24" r="2" fill={EYE} />
      <ellipse cx="32" cy="29" rx="2.6" ry="2" fill={EYE} />
    </>
  ),
  fish: ({ m, d, l }) => (
    <>
      <circle cx="10" cy="16" r="3" fill="none" stroke="#4b9bd4" strokeWidth="1.5" />
      <circle cx="16" cy="9" r="2" fill="none" stroke="#4b9bd4" strokeWidth="1.5" />
      <path d="M46 32l12-10v20z" fill={d} />
      <path d="M8 32c8-12 28-16 40 0-12 16-32 12-40 0z" fill={m} />
      <circle cx="18" cy="30" r="2.5" fill={EYE} />
      <path d="M26 26q4 6 0 12M32 25q4 7 0 14" stroke={l} strokeWidth="2" fill="none" />
    </>
  ),
  flower: ({ m }) => (
    <>
      <rect x="30.5" y="22" width="3" height="23" fill="#5f9e57" />
      <ellipse cx="40" cy="36" rx="6" ry="3" fill="#5f9e57" transform="rotate(-30 40 36)" />
      {[[32, 10.5], [39.1, 15.7], [36.4, 24.1], [27.6, 24.1], [24.9, 15.7]].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r="6.5" fill={m} />
      ))}
      <circle cx="32" cy="18" r="5" fill="#f0c43c" />
      <path d="M22 44h20l-3 14H25z" fill="#c47b3c" />
    </>
  ),
  rainbow: ({ m }) => (
    <>
      {[[26, m], [20, '#f0b23c'], [14, '#5f9e57'], [8, '#4b82c4']].map(([r, c]) => (
        <path key={String(r)} d={`M${32 - Number(r)} 48a${r} ${r} 0 0 1 ${2 * Number(r)} 0`} stroke={String(c)} strokeWidth="6" fill="none" />
      ))}
      <ellipse cx="10" cy="50" rx="8" ry="5" fill="#fff" />
      <ellipse cx="54" cy="50" rx="8" ry="5" fill="#fff" />
    </>
  ),
  balloon: ({ m, d }) => (
    <>
      <path d="M32 46q-6 6 0 10t0 6" stroke="#8a8177" strokeWidth="1.5" fill="none" />
      <ellipse cx="32" cy="24" rx="16" ry="19" fill={m} />
      <path d="M29 42h6l-3 4z" fill={d} />
      <ellipse cx="25" cy="17" rx="4" ry="6" fill="#fff" opacity=".35" />
    </>
  ),
  cupcake: ({ m }) => (
    <>
      <path d="M16 34h32l-5 22H21z" fill="#c99a62" />
      <path d="M22 34l2 22M32 34v22M42 34l-2 22" stroke="#a87b45" strokeWidth="2" />
      <path d="M12 34c0-8 6-12 12-12 1-6 6-10 8-10s7 4 8 10c6 0 12 4 12 12z" fill={m} />
      <circle cx="32" cy="10" r="4" fill="#d9465f" />
      <path d="M22 28l3-1M32 24l3 1M40 29l2-2M27 31l2 1" stroke="#4b82c4" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

/** 소품 그림 하나(크기는 감싸는 요소가 정한다) */
export function ItemArt({ shape, color, className }: { shape: ShapeKey; color: string; className?: string }) {
  const draw = ART[shape] ?? ART.star;
  return (
    <svg className={className} viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false">
      {draw({ m: color, d: shade(color, -0.32), l: shade(color, 0.55) })}
    </svg>
  );
}
