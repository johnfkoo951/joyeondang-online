'use client';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import * as THREE from 'three';
import { createAvatar } from '@/walk/avatar';
import {
  ACCESSORIES, CLOTH_COLORS, DEFAULT_DOLL, HAIR_COLORS, HAIR_STYLES, SKIN_TONES,
  type Accessory, type CharacterLook, type DollLook, type HairStyle,
} from '@/walk/look';
import { uploadPhoto, type PhotoConsents, type PhotoStart } from './useCharacter';
import css from './CharacterPanel.module.css';

// 캐릭터 꾸미기. 기본 인형(머리·색·옷·소품을 목록에서 고른다, 늘 같은 귀여운 비율)과 사진 캐릭터(이미지 세션이 그린다).
// 고르는 즉시 onChange: 화면 쪽이 걷는 캐릭터와 다른 사람 화면, 저장까지 바꾼다.

const HAIR_NAME: Record<HairStyle, string> = { short: '짧은 머리', bob: '단발', long: '긴 머리', curly: '곱슬', bun: '올림머리', cap: '캡 모자' };
const ACC_NAME: Record<Accessory, string> = { none: '없음', glasses: '안경', hat: '밀짚모자', bow: '리본', headphones: '헤드폰', scarf: '목도리' };
const HAIR_COLOR_NAME = ['검은 갈색', '진한 갈색', '갈색', '밝은 갈색', '금빛', '은회색', '초록', '붉은 갈색'];
const CLOTH_NAME = ['숲 초록', '벽돌', '살구 갈색', '남색', '하늘 파랑', '겨자', '보라', '크림', '먹색', '분홍'];

export const CONSENT_MAIN =
  '사진은 캐릭터 그림을 만드는 데에만 써요. 그림을 만드는 동안 외부 AI 서비스(OpenAI)로 보내져요. 원본 사진은 내가 지울 때까지 보관되고, 이 화면에서 언제든 지울 수 있어요. 만든 그림은 조연당 온라인 안에서만 보여요.';
export const CONSENT_SELF = '사진 속 사람은 나 자신이고, 만 14세 이상이에요.';
export const CONSENT_TERMS = '위 내용에 동의해요.';
export const CONSENT_SMALL = '아이로 보이는 사진은 그림을 만들지 않아요. 하루 3장까지 만들 수 있어요. 그림은 늘 밝고 귀엽게 그려요.';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 엔진 아바타를 작은 캔버스에 따로 그린다(천천히 좌우로 돈다, 줄인 움직임이면 비스듬히 멈춰 있다) */
function DollPreview({ doll }: { doll: DollLook }) {
  const host = useRef<HTMLDivElement>(null);
  const want = useRef(doll);
  useEffect(() => {
    want.current = doll;
  }, [doll]);
  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // 캔버스는 여기서 만들고 치울 때 뗀다(다시 붙을 때 잃은 문맥을 물려받지 않게)
    const canvas = document.createElement('canvas');
    canvas.className = css.previewCanvas;
    box.appendChild(canvas);
    const w = box.clientWidth || 180, h = box.clientHeight || 220;
    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      canvas.remove();
      return;
    }
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff7ea', '#b9a58c', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(1.5, 3, 2.5);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
    cam.position.set(0, 0.95, 3.1);
    cam.lookAt(0, 0.62, 0);
    const still = reducedMotion();
    const t0 = performance.now();
    let av: ReturnType<typeof createAvatar> | null = null;
    let shown = '';
    let raf = 0;
    const draw = () => {
      const key = JSON.stringify(want.current);
      const changed = key !== shown;
      if (changed) {
        av?.dispose();
        av = createAvatar({ look: { kind: 'doll', doll: want.current }, reducedMotion: true, shadow: false });
        scene.add(av.group);
        shown = key;
      }
      if (av && (changed || !still)) {
        av.group.rotation.y = still ? -0.5 : -0.5 + Math.sin((performance.now() - t0) / 1600) * 0.7;
        r.render(scene, cam);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      av?.dispose();
      r.dispose();
      r.forceContextLoss();
      canvas.remove();
    };
  }, []);
  return <div ref={host} className={css.preview} aria-hidden="true" />;
}

type Opt = { value: string; label: string; swatch?: string };

/** 한 줄 고르기(라디오 묶음). 색은 동그라미로 보이고 이름은 화면 읽기 프로그램과 말풍선 도움말로 */
function Choice({ legend, value, options, onPick }: { legend: string; value: string; options: Opt[]; onPick: (v: string) => void }) {
  const name = useId();
  return (
    <fieldset className={css.group}>
      <legend className={css.legend}>{legend}</legend>
      <div className={css.options}>
        {options.map((o) => (
          <label key={o.value} className={o.swatch ? css.swatchLabel : css.chip} title={o.label}>
            <input
              type="radio" name={name} value={o.value} checked={value === o.value} className={css.radio}
              onChange={() => onPick(o.value)}
            />
            {o.swatch ? <span className={css.swatch} style={{ background: o.swatch }} aria-hidden="true" /> : null}
            <span className={o.swatch ? css.srOnly : css.chipText}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const HAIR_OPTS: Opt[] = HAIR_STYLES.map((v) => ({ value: v, label: HAIR_NAME[v] }));
const ACC_OPTS: Opt[] = ACCESSORIES.map((v) => ({ value: v, label: ACC_NAME[v] }));
const HAIR_COLOR_OPTS: Opt[] = HAIR_COLORS.map((v, i) => ({ value: v, label: HAIR_COLOR_NAME[i] ?? v, swatch: v }));
const SKIN_OPTS: Opt[] = SKIN_TONES.map((v, i) => ({ value: v, label: `피부 ${i + 1}`, swatch: v }));
const CLOTH_OPTS: Opt[] = CLOTH_COLORS.map((v, i) => ({ value: v, label: CLOTH_NAME[i] ?? v, swatch: v }));

const any = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

function DollTab({ doll, onPick, onRandom }: { doll: DollLook; onPick: (k: keyof DollLook, v: string) => void; onRandom: () => void }) {
  return (
    <div className={css.dollTab}>
      <div className={css.previewBox}>
        <DollPreview doll={doll} />
        <button type="button" className="btn btn-small" onClick={onRandom}>아무거나</button>
      </div>
      <div className={css.choices}>
        <Choice legend="머리 모양" value={doll.hair} options={HAIR_OPTS} onPick={(v) => onPick('hair', v)} />
        <Choice legend="머리색" value={doll.hairColor} options={HAIR_COLOR_OPTS} onPick={(v) => onPick('hairColor', v)} />
        <Choice legend="피부" value={doll.skin} options={SKIN_OPTS} onPick={(v) => onPick('skin', v)} />
        <Choice legend="윗옷" value={doll.top} options={CLOTH_OPTS} onPick={(v) => onPick('top', v)} />
        <Choice legend="아랫옷" value={doll.bottom} options={CLOTH_OPTS} onPick={(v) => onPick('bottom', v)} />
        <Choice legend="소품" value={doll.acc} options={ACC_OPTS} onPick={(v) => onPick('acc', v)} />
      </div>
    </div>
  );
}

export type PhotoOptions = {
  enabled: boolean;
  /** 그리는 중인 사진(useCharacter.pending). 없으면 이 패널에서 올린 것만 안다 */
  pending?: { id: string } | null;
  /** 올리기(useCharacter.startPhoto). 없으면 uploadPhoto를 직접 부른다(useCharacter가 창 이벤트로 이어 받는다) */
  start?: (file: File, consents: PhotoConsents) => Promise<PhotoStart>;
  /** 다 됐거나 못 그렸을 때의 한 줄(useCharacter.note) */
  note?: string | null;
};
const MAX_BYTES = 15 * 1024 * 1024;

function PhotoTab({ look, doll, onChange, photo }: { look: CharacterLook; doll: DollLook; onChange: (l: CharacterLook) => void; photo: PhotoOptions }) {
  const [file, setFile] = useState<File | null>(null);
  const [self, setSelf] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const waiting = Boolean(photo.pending) || Boolean(sent);
  const photoId = look.kind === 'photo' ? look.url.split('/').pop() ?? '' : '';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !self || !terms || busy) return;
    if (file.size > MAX_BYTES) return setMsg('사진이 너무 커요. 15MB보다 작은 사진으로 골라 주세요.');
    setBusy(true);
    setMsg(null);
    const r = await (photo.start ?? uploadPhoto)(file, { self, terms });
    setBusy(false);
    if (r.ok) {
      setSent(r.id);
      setFile(null);
    } else setMsg(r.message);
  };
  const remove = async () => {
    if (!photoId) return;
    const res = await fetch(`/api/avatar/${encodeURIComponent(photoId)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    if (res && (res.ok || res.status === 404)) {
      onChange({ kind: 'doll', doll });
      setGone('올린 사진과 그림을 지웠어요. 기본 인형으로 돌아왔어요.');
    } else setGone('지금은 지우지 못했어요. 잠시 뒤 다시 해 주세요.');
  };
  return (
    <div className={css.photoTab}>
      {look.kind === 'photo' ? (
        <div className={css.row}>
          <p>지금은 사진 캐릭터로 걷고 있어요.</p>
          <button type="button" className="btn btn-small" onClick={() => onChange({ kind: 'doll', doll })}>기본 인형으로 돌아가기</button>
          <button type="button" className="btn btn-small" onClick={remove}>올린 사진 지우기</button>
        </div>
      ) : null}
      {gone ? <p role="status">{gone}</p> : null}
      {waiting ? <p role="status" className={css.status}>그리는 중이에요. 계속 걸어도 돼요.</p> : null}
      {photo.note ? <p role="status">{photo.note}</p> : null}
      <form className={css.form} onSubmit={submit}>
        <p className={css.consent}>{CONSENT_MAIN}</p>
        <label className={css.file}>
          <span>사진 고르기</span>
          <input
            type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => { setFile(e.currentTarget.files?.[0] ?? null); setMsg(null); }}
          />
        </label>
        <label className={css.check}>
          <input type="checkbox" checked={self} onChange={(e) => setSelf(e.currentTarget.checked)} />
          <span>{CONSENT_SELF}</span>
        </label>
        <label className={css.check}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.currentTarget.checked)} />
          <span>{CONSENT_TERMS}</span>
        </label>
        <p className={`small ${css.fine}`}>{CONSENT_SMALL}</p>
        {msg ? <p role="alert" className={css.error}>{msg}</p> : null}
        <button type="submit" className="btn" disabled={!file || !self || !terms || busy}>{busy ? '보내는 중' : '그림 맡기기'}</button>
      </form>
    </div>
  );
}

type Props = { look: CharacterLook; onChange: (l: CharacterLook) => void; onClose: () => void; photo: PhotoOptions };

/** Tab이 패널 안에서만 돈다(단추·입력칸 모두) */
function trap(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="-1"]')]
    .filter((el) => !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked));
  if (items.length === 0) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function CharacterPanel({ look, onChange, onClose, photo }: Props) {
  const [doll, setDoll] = useState<DollLook>(look.kind === 'doll' ? look.doll : DEFAULT_DOLL);
  const [tab, setTab] = useState<'doll' | 'photo'>(look.kind === 'photo' && photo.enabled ? 'photo' : 'doll');
  // 사진 캐릭터 기능이 아직 없으면(404) 탭을 숨기고 한 줄만. null = 확인 중
  const [photoOk, setPhotoOk] = useState<boolean | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const ids = useId();
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    title.current?.focus({ preventScroll: true });
    return () => {
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!photo.enabled) return;
    let stop = false;
    fetch('/api/avatar/status', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => { if (!stop) setPhotoOk(r.status !== 404); })
      .catch(() => { if (!stop) setPhotoOk(false); });
    return () => {
      stop = true;
    };
  }, [photo.enabled]);
  const showPhoto = photo.enabled && photoOk === true;
  const current = showPhoto ? tab : 'doll';

  const pick = (k: keyof DollLook, v: string) => {
    const next = { ...doll, [k]: v } as DollLook;
    setDoll(next);
    onChange({ kind: 'doll', doll: next });
  };
  const random = () => {
    const next: DollLook = {
      hair: any(HAIR_STYLES), hairColor: any(HAIR_COLORS), skin: doll.skin, top: any(CLOTH_COLORS), bottom: any(CLOTH_COLORS), acc: any(ACCESSORIES),
    };
    setDoll(next);
    onChange({ kind: 'doll', doll: next });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    trap(e);
  };

  return (
    <div className={`walk-panel ${css.panel}`} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} onKeyDown={onKey}>
      <h2 id={`${ids}-t`} ref={title} tabIndex={-1}>캐릭터 꾸미기</h2>
      {showPhoto ? (
        <div className={css.tabs} role="tablist" aria-label="꾸미기 방법">
          {(['doll', 'photo'] as const).map((t) => (
            <button
              key={t} type="button" role="tab" id={`${ids}-${t}`} aria-selected={current === t} aria-controls={`${ids}-${t}-p`}
              className={current === t ? css.tabOn : css.tab} onClick={() => setTab(t)}
            >
              {t === 'doll' ? '기본 인형' : '사진 캐릭터'}
            </button>
          ))}
        </div>
      ) : null}
      <div role={showPhoto ? 'tabpanel' : undefined} id={`${ids}-${current}-p`} aria-labelledby={showPhoto ? `${ids}-${current}` : undefined}>
        {current === 'doll' ? (
          <DollTab doll={doll} onPick={pick} onRandom={random} />
        ) : (
          <PhotoTab look={look} doll={doll} onChange={onChange} photo={photo} />
        )}
      </div>
      {photo.enabled && photoOk === false ? <p className="small walk-panel-meta">사진 캐릭터는 아직 준비 중이에요.</p> : null}
      <button type="button" className="btn btn-small" onClick={onClose}>닫기</button>
    </div>
  );
}
