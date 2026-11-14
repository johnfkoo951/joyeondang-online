'use client';
import type { CSSProperties } from 'react';
import { HOUSE_PLAQUE } from '@/content/house-name';
import type { SealMotif, SealShape } from '@/lib/stamp-rally';
import css from './stamp-rally.module.css';

type Props = {
  label: string;
  /** 화면이 영어일 때의 이름(없으면 영어 화면에서도 label) */
  labelEn?: string;
  shape: SealShape;
  motif: SealMotif;
  state: 'stamped' | 'trial' | 'ready' | 'empty';
  size?: number;
  rot?: number;
  press?: boolean;
};

function MotifGlyph({ motif }: { motif: SealMotif }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (motif) {
    case 'arch':
      return (
        <g {...stroke}>
          <path d="M34 62V48a8 8 0 0 1 16 0v14M52 62V45a8 8 0 0 1 16 0v17M70 62V48a8 8 0 0 1 16 0v14" />
          <path d="M30 62h60" />
        </g>
      );
    case 'easel':
      return (
        <g {...stroke}>
          <rect x="44" y="38" width="32" height="20" rx="2" />
          <path d="M50 58l-5 10M70 58l5 10M60 34v4M49 52l6-6 5 4 6-5 5 7" />
        </g>
      );
    case 'pine':
      return (
        <g {...stroke}>
          <path d="M60 35l-14 12h9l-12 11h34L65 47h9L60 35Z" />
          <path d="M60 58v9" />
        </g>
      );
    case 'lantern':
      return (
        <g {...stroke}>
          <path d="M44 43h32l-4-6H48l-4 6ZM49 43h22v14H49zM46 57h28M54 57v9h12v-9" />
          <circle cx="60" cy="50" r="2.5" fill="currentColor" stroke="none" />
        </g>
      );
    case 'shoes':
      return (
        <g {...stroke}>
          <path d="M42 56c0-5 4-9 8-9s6 4 6 9v5H42v-5ZM64 56c0-5 4-9 8-9s6 4 6 9v5H64v-5Z" />
        </g>
      );
    case 'stage':
      return (
        <g {...stroke}>
          <path d="M38 59c8-5 36-5 44 0v5H38v-5Z" />
          <path d="M46 40c0 6-4 11-8 13M74 40c0 6 4 11 8 13M42 40h36" />
        </g>
      );
    case 'quotes':
      return (
        <g {...stroke}>
          <path d="M38 41c14 4 30 4 44 0" />
          <rect x="43" y="44" width="13" height="17" rx="1.5" />
          <rect x="64" y="44" width="13" height="17" rx="1.5" />
        </g>
      );
    case 'cushion':
      return (
        <g {...stroke}>
          <rect x="40" y="46" width="40" height="16" rx="5" />
          <path d="M48 46v-5a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v5" />
        </g>
      );
    case 'jazz':
      return (
        <g {...stroke}>
          <circle cx="52" cy="58" r="5" />
          <circle cx="70" cy="55" r="5" />
          <path d="M57 58V40l18-3v18" />
        </g>
      );
    case 'blocks':
      return (
        <g {...stroke}>
          <rect x="42" y="50" width="15" height="14" rx="2" />
          <rect x="63" y="50" width="15" height="14" rx="2" />
          <path d="M51 50l9-12 9 12Z" />
        </g>
      );
    case 'target':
      return (
        <g {...stroke}>
          <circle cx="60" cy="51" r="14" />
          <circle cx="60" cy="51" r="7" />
          <circle cx="60" cy="51" r="2" fill="currentColor" stroke="none" />
        </g>
      );
    case 'books':
      return (
        <g {...stroke}>
          <path d="M42 62V41h9v21M54 62V38h10v24M68 62l5-20 8 2-5 18M38 62h44" />
        </g>
      );
    case 'wrench':
      return (
        <g {...stroke}>
          <path d="M43 58h34v6H43zM48 58V46M72 58V46M45 46h30M60 37v9" />
        </g>
      );
  }
}

// 인장 아래 글(상태). 두 말을 함께 싣고 CSS가 고른 말만 그린다(<tspan data-ko/data-en>: 그리기 전에 골라 깜박이지 않는다)
const STATE_WORD: Record<Props['state'], [ko: string, en: string]> = {
  stamped: ['인증 도장', 'Official'],
  trial: ['체험 도장', 'Trial'],
  ready: ['찍기 가능', 'Ready'],
  empty: ['도장 자리', 'Not yet'],
};

/** 영어 이름 글자 크기: 인장 안쪽 너비(약 74)에 한 줄로 들어가게 줄인다 */
const enFont = (s: string) => Math.min(14.5, Math.floor((74 / (Math.max(1, s.length) * 0.6)) * 10) / 10);

/** 구역별 전각 인장 SVG. 마당은 둥근 사각인, 1층은 방형 사각인, 2층은 원형 인장 */
export function CarvedSeal({ label, labelEn, shape, motif, state, size = 92, rot = -5, press = false }: Props) {
  const short = label.length > 8 ? `${label.slice(0, 8)}` : label;
  const nameFont = short.length >= 6 ? 12 : 14.5;
  const [stateKo, stateEn] = STATE_WORD[state];
  const style = {
    '--seal-px': `${size}px`,
    '--seal-rot': `${rot}deg`,
  } as CSSProperties;

  return (
    <span className={css.sealFrame} data-state={state} data-press={press || undefined} style={style}>
      <svg className={css.sealSvg} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        {shape === 'circle' ? (
          <>
            <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" strokeWidth="5.5" />
            <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray={state === 'empty' ? '4 4' : undefined} />
          </>
        ) : shape === 'square' ? (
          <>
            <rect x="9" y="9" width="102" height="102" rx="6" fill="none" stroke="currentColor" strokeWidth="5.5" />
            <rect x="17" y="17" width="86" height="86" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray={state === 'empty' ? '4 4' : undefined} />
          </>
        ) : (
          <>
            <rect x="10" y="10" width="100" height="100" rx="22" fill="none" stroke="currentColor" strokeWidth="5.5" />
            <rect x="18" y="18" width="84" height="84" rx="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray={state === 'empty' ? '4 4' : undefined} />
          </>
        )}
        <text x="60" y="31" textAnchor="middle" fontSize="11.5" fontWeight="800" letterSpacing="2" fill="currentColor">
          {HOUSE_PLAQUE}
        </text>
        <MotifGlyph motif={motif} />
        <text x="60" y="83" textAnchor="middle" fontSize={nameFont} fontWeight="800" fill="currentColor">
          {labelEn ? (
            <>
              <tspan data-ko="">{short}</tspan>
              <tspan data-en="" lang="en" fontSize={enFont(labelEn)}>{labelEn}</tspan>
            </>
          ) : (
            short
          )}
        </text>
        <text x="60" y="98" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor">
          <tspan data-ko="">{stateKo}</tspan>
          <tspan data-en="" lang="en">{stateEn}</tspan>
        </text>
      </svg>
      {press ? <span className={css.sealRing} aria-hidden="true" /> : null}
    </span>
  );
}
