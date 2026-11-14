'use client';
import { useState } from 'react';
import { CLOTH_COLORS, cleanLook, photoId, type DollLook } from '@/walk/look';
import s from './social.module.css';

type Props = { look: unknown; name: string; size?: number };

/** 그림마다 쓸 수 있었던 원천: 0 작은 방향 그림 묶음, 1 그림 한 장, 2 없음(이름 첫 글자). 같은 그림을 다시 그릴 때 실패한 주소를 또 묻지 않는다 */
type Step = 0 | 1 | 2;
const known = new Map<string, Step>();
const stepOf = (id: string | null): Step => (id ? known.get(id) ?? 0 : 0);

/** 이름으로 고르는 색(겉모습을 모를 때의 동그라미) */
function nameColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return CLOTH_COLORS[h % CLOTH_COLORS.length];
}

/** 인형 색으로 그린 작은 얼굴(머리 모양·머리색·피부·윗옷·소품) */
function DollFace({ d }: { d: DollLook }) {
  const hair = d.hairColor;
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
      <rect width="32" height="32" fill="var(--season-soft, #f1dfcd)" />
      {d.hair === 'long' ? <path d="M7.5 25 C6 14 8 7 16 7 C24 7 26 14 24.5 25 Z" fill={hair} /> : null}
      <path d="M4 33 C4.5 25 10 22 16 22 C22 22 27.5 25 28 33 Z" fill={d.top} />
      {d.acc === 'scarf' ? <path d="M10.5 22.5 C13 24.5 19 24.5 21.5 22.5 L21 25 C18.5 26.5 13.5 26.5 11 25 Z" fill="#b4593b" /> : null}
      <circle cx="16" cy="14.5" r="7.2" fill={d.skin} />
      {d.hair === 'bob' ? <path d="M8.3 18.5 C7 9 11 6.6 16 6.6 C21 6.6 25 9 23.7 18.5 L22 18.5 C22.3 13.6 20 11.3 16 11.3 C12 11.3 9.7 13.6 10 18.5 Z" fill={hair} /> : null}
      {d.hair === 'short' || d.hair === 'long' ? <path d="M8.6 14.5 C8 9 11.4 6.8 16 6.8 C20.6 6.8 24 9 23.4 14.5 C21.6 11.6 19 10.6 16 10.6 C13 10.6 10.4 11.6 8.6 14.5 Z" fill={hair} /> : null}
      {d.hair === 'curly' ? (
        <g fill={hair}>
          <circle cx="10" cy="11" r="3" /><circle cx="13.5" cy="8.3" r="3.1" /><circle cx="18.5" cy="8.3" r="3.1" /><circle cx="22" cy="11" r="3" />
          <circle cx="9" cy="14.5" r="2.2" /><circle cx="23" cy="14.5" r="2.2" />
        </g>
      ) : null}
      {d.hair === 'bun' ? (
        <g fill={hair}>
          <circle cx="16" cy="5.2" r="3" />
          <path d="M8.6 14.5 C8 9 11.4 7 16 7 C20.6 7 24 9 23.4 14.5 C21.6 11.8 19 10.8 16 10.8 C13 10.8 10.4 11.8 8.6 14.5 Z" />
        </g>
      ) : null}
      {d.hair === 'cap' ? <path d="M8.4 12.6 C8.4 7.4 11.8 6 16 6 C20.2 6 23.6 7.4 23.6 12.6 L27 13.4 L26.6 14.4 L8.4 13.6 Z" fill={hair} /> : null}
      <circle cx="13.2" cy="15.2" r="0.95" fill="#2b2420" />
      <circle cx="18.8" cy="15.2" r="0.95" fill="#2b2420" />
      <path d="M14.6 18.2 C15.4 18.9 16.6 18.9 17.4 18.2" stroke="#7a4a3a" strokeWidth="0.8" fill="none" strokeLinecap="round" />
      {d.acc === 'glasses' ? (
        <g stroke="#2b2420" strokeWidth="0.8" fill="none">
          <circle cx="13.2" cy="15.2" r="2.1" /><circle cx="18.8" cy="15.2" r="2.1" /><path d="M15.3 15.2 H16.7" />
        </g>
      ) : null}
      {d.acc === 'hat' ? <path d="M7 10.6 H25 L23.4 9.4 C22.6 5.2 20 4 16 4 C12 4 9.4 5.2 8.6 9.4 Z" fill="#3a3a3a" /> : null}
      {d.acc === 'bow' ? <path d="M20.5 7.2 L23.5 5.4 L23.5 9 Z M20.5 7.2 L17.5 5.4 L17.5 9 Z" fill="#d98ca0" /> : null}
      {d.acc === 'headphones' ? (
        <g fill="none" stroke="#3a3a3a" strokeWidth="1.4">
          <path d="M8.2 15 C8 8.6 11.6 5.8 16 5.8 C20.4 5.8 24 8.6 23.8 15" />
          <rect x="6.6" y="13.4" width="2.6" height="4.4" rx="1" fill="#3a3a3a" />
          <rect x="22.8" y="13.4" width="2.6" height="4.4" rx="1" fill="#3a3a3a" />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * 아바타 작은 그림(대화·접속자 목록·멘션 카드). 사진 캐릭터면 그 그림의 얼굴 쪽을 동그랗게(작은 방향 그림 묶음의
 * 앞 모습부터, 없으면 그림 한 장), 인형이면 인형 색으로 그린 작은 얼굴, 모르면 이름 첫 글자.
 */
export function AvatarThumb({ look, name, size = 32 }: Props) {
  const l = look && typeof look === 'object' ? cleanLook(look) : null;
  const id = l ? photoId(l) : null;
  const [tried, setTried] = useState<{ id: string | null; step: Step; loaded: boolean }>(() => ({ id, step: stepOf(id), loaded: false }));
  // 같은 자리에서 다른 사람으로 바뀌면 처음부터
  const cur = tried.id === id ? tried : { id, step: stepOf(id), loaded: false };
  if (cur !== tried) setTried(cur);
  const box = { width: size, height: size };
  const first = Array.from(name.trim())[0] ?? '?';
  if (l?.kind === 'photo' && id && cur.step < 2) {
    // 작은 방향 그림 묶음(다섯 칸 가운데 맨 앞이 앞 모습, 50~60KB)을 먼저: 걷기 엔진이 이미 받아 둔 것일 때가 많다.
    // 없으면(그리기 전·동의 전) 그림 한 장. 받는 동안은 이름 첫 글자를 깔아 둔다
    const step = cur.step;
    const src = step === 0 ? `/api/avatar/${id}/views?s=s` : `/api/avatar/${id}`;
    return (
      <span className={`${s.thumb} ${cur.loaded ? '' : s.thumbText}`} style={cur.loaded ? box : { ...box, background: nameColor(name), fontSize: Math.round(size * 0.45) }} aria-hidden="true">
        {cur.loaded ? null : first}
        {/* eslint-disable-next-line @next/next/no-img-element -- 명단 손님에게만 주는 그림이라 이미지 최적화를 거치지 않는다 */}
        <img
          key={src}
          className={step === 0 ? s.thumbSheet : s.thumbOne}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => {
            known.set(id, step);
            setTried({ id, step, loaded: true });
          }}
          onError={() => {
            const next: Step = step === 0 ? 1 : 2;
            known.set(id, next);
            setTried({ id, step: next, loaded: false });
          }}
        />
      </span>
    );
  }
  if (l?.kind === 'doll') {
    return (
      <span className={s.thumb} style={box} aria-hidden="true">
        <DollFace d={l.doll} />
      </span>
    );
  }
  return (
    <span className={`${s.thumb} ${s.thumbText}`} style={{ ...box, background: nameColor(name), fontSize: Math.round(size * 0.45) }} aria-hidden="true">
      {first}
    </span>
  );
}
