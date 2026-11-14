'use client';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import * as THREE from 'three';
import { enAttrs } from '@/components/avatar/en-attrs';
import { Say } from '@/components/avatar/Say';
import { T } from '@/components/i18n/T';
import { useLang } from '@/components/i18n/useLang';
import { ACC_NAMES, CLOTH_NAMES, HAIR_COLOR_NAMES, HAIR_NAMES, type DollName } from '@/content/dolls';
import {
  CONSENT_GUARDIAN, CONSENT_GUARDIAN_EN, CONSENT_TERMS, CONSENT_TERMS_EN, SUBJECT_LABEL, SUBJECT_LABEL_EN, SUBJECT_QUESTION, SUBJECT_QUESTION_EN,
  consentPoints, modelConfirm, modelConfirmYes, type ModelProvider, type PhotoSubject,
} from '@/lib/avatar/consent';
import { dropCachedAvatar } from '@/lib/avatar/forget-cache';
import {
  HISTORY_SHOWN, SLOTS, canRequestModel, deleteWarning, headLine, itemBadge, modelChance, modelChanceLine, modelRoom, readSlotsReply, slotNumbers,
  type CharItem, type ModelChance, type SlotsReply,
} from '@/lib/avatar/rules';
import { tr, type Lang } from '@/lib/i18n';
import { createAvatar } from '@/walk/avatar';
import {
  ACCESSORIES, CLOTH_COLORS, DEFAULT_DOLL, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type CharacterLook, type DollLook,
} from '@/walk/look';
import { IconClose } from './icons';
import { adoptMaking, clearMaking, getMaking, type Making } from './making';
import { adoptModelMaking, clearModelMaking, getModelMaking, startModelMaking, type ModelMaking } from './making-3d';
import { MakingProgress, ModelProgress } from './MakingChip';
import { PickCard } from './PickCard';
import { consentsReady, uploadPhoto, type PhotoConsents, type PhotoStart } from './useCharacter';
import { trapTab } from './useDialogFocus';
import { useMaking, useModelMaking } from './useMaking';
import css from './CharacterPanel.module.css';
import { TitleField } from './TitleField';

// 캐릭터 꾸미기. 기본 인형(머리·색·옷·소품을 목록에서 고른다, 늘 같은 귀여운 비율)과 사진 캐릭터(그림 일꾼이 그린다).
// 고르는 즉시 onChange: 화면 쪽이 걷는 캐릭터와 다른 사람 화면, 저장까지 바꾼다.
// 사진 캐릭터: 새 그림은 작업대 칸(손님 3칸, 가족·관리자 9칸: 서버가 칸 답의 max로 알려 준다)에 들어가고(다 차면 DB가 오래
// 있던 칸을 비워 준다), 지우지 않은 그림은 모두 이력에 남는다. 칸은 늘 세 칸씩 한 줄(9칸이면 휴대폰에서도 3×3).
// 차례: 작업대 → 사진으로 새로 만들기 → ★ 보관함 → 이력. 그림을 눌러 갈아입고, ★로 보관하고, 보관함의 그림은 골라서 3D로
// 만든다(무엇을 어디로 보내는지 한 번 더 묻는다). 그림 하나에서 한 일의 안내는 그 그림 바로 아래에 보인다(스크롤하지 않는다).
// 사진을 보내면 그리는 동안 단계와 걸린 시간을 이 창에 보인다(창을 닫으면 메인 화면의 작은 칩이 이어 보인다. MakingChip).
// 다 그리면 맨 위에 확인 카드(PickCard): 새 그림을 크게, 「이걸로 3D 만들기」(남은 3D 수, 실패하면 한 번 더 할 수 있는지)와
// 「다른 그림 더 만들고 나중에 고르기」. 3D를 맡기면 3D 단계(요청함 → 차례 → 만드는 중 → 다 됐어요)를 같은 자리에 보인다.
// 화면 말: 보이는 글은 두 말을 함께 싣고(T), 속성(aria-label, title, alt)은 지금 말로 고른다. 서버 답과 이 창이 적는 안내는
// 한국어로 두었다가 보일 때 옮긴다(Say). 인형의 고르는 이름은 「내 캐릭터」 화면과 같은 표(content/dolls.ts).

// 동의 글(consentPoints, 누구 사진인지, 보호자 동의, CONSENT_TERMS)은 내 캐릭터 화면과 같은 것을 쓴다(@/lib/avatar/consent).
// 3D를 어디서 만드는지는 서버가 칸 답(provider)으로 알려 준다
// 하루에 몇 장까지인지는 역할마다 달라 여기 적지 않고, 작업대 머리줄에 오늘 남은 장수로 보인다
export const CONSENT_SMALL = '그림은 늘 밝고 귀엽게 그려요.';
export const CONSENT_SMALL_EN = 'Pictures are always drawn bright and cute.';

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

type Opt = { value: string; label: DollName; swatch?: string };

/** 한 줄 고르기(라디오 묶음). 색은 동그라미로 보이고 이름은 화면 읽기 프로그램과 말풍선 도움말로 */
function Choice({ legend, value, options, onPick }: { legend: DollName; value: string; options: Opt[]; onPick: (v: string) => void }) {
  const name = useId();
  const lang = useLang();
  return (
    <fieldset className={css.group}>
      <legend className={css.legend}><T ko={legend.ko} en={legend.en} /></legend>
      <div className={css.options}>
        {options.map((o) => (
          <label key={o.value} className={o.swatch ? css.swatchLabel : css.chip} title={tr(lang, o.label.ko, o.label.en)}>
            <input
              type="radio" name={name} value={o.value} checked={value === o.value} className={css.radio}
              onChange={() => onPick(o.value)}
            />
            {o.swatch ? <span className={css.swatch} style={{ background: o.swatch }} aria-hidden="true" /> : null}
            <span className={o.swatch ? css.srOnly : css.chipText}><T ko={o.label.ko} en={o.label.en} /></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const HAIR_OPTS: Opt[] = HAIR_STYLES.map((v) => ({ value: v, label: HAIR_NAMES[v] }));
const ACC_OPTS: Opt[] = ACCESSORIES.map((v) => ({ value: v, label: ACC_NAMES[v] }));
const HAIR_COLOR_OPTS: Opt[] = HAIR_COLORS.map((v, i) => ({ value: v, label: HAIR_COLOR_NAMES[i] ?? { ko: v, en: v }, swatch: v }));
const SKIN_OPTS: Opt[] = SKIN_TONES.map((v, i) => ({ value: v, label: { ko: `피부 ${i + 1}`, en: `Skin ${i + 1}` }, swatch: v }));
const CLOTH_OPTS: Opt[] = CLOTH_COLORS.map((v, i) => ({ value: v, label: CLOTH_NAMES[i] ?? { ko: v, en: v }, swatch: v }));

const any = <V,>(list: readonly V[]) => list[Math.floor(Math.random() * list.length)];

function DollTab({ doll, onPick, onRandom }: { doll: DollLook; onPick: (k: keyof DollLook, v: string) => void; onRandom: () => void }) {
  return (
    <div className={css.dollTab}>
      <div className={css.previewBox}>
        <DollPreview doll={doll} />
        <button type="button" className="btn btn-small" onClick={onRandom}><T ko="아무거나" en="Random" /></button>
      </div>
      <div className={css.choices}>
        <Choice legend={{ ko: '머리 모양', en: 'Hairstyle' }} value={doll.hair} options={HAIR_OPTS} onPick={(v) => onPick('hair', v)} />
        <Choice legend={{ ko: '머리색', en: 'Hair color' }} value={doll.hairColor} options={HAIR_COLOR_OPTS} onPick={(v) => onPick('hairColor', v)} />
        <Choice legend={{ ko: '피부', en: 'Skin' }} value={doll.skin} options={SKIN_OPTS} onPick={(v) => onPick('skin', v)} />
        <Choice legend={{ ko: '윗옷', en: 'Top' }} value={doll.top} options={CLOTH_OPTS} onPick={(v) => onPick('top', v)} />
        <Choice legend={{ ko: '아랫옷', en: 'Bottoms' }} value={doll.bottom} options={CLOTH_OPTS} onPick={(v) => onPick('bottom', v)} />
        <Choice legend={{ ko: '소품', en: 'Extras' }} value={doll.acc} options={ACC_OPTS} onPick={(v) => onPick('acc', v)} />
      </div>
    </div>
  );
}

export type PhotoOptions = {
  enabled: boolean;
  /** 올리기(useCharacter.startPhoto). 없으면 uploadPhoto를 직접 부른다(그리는 중인 일은 making.ts가 이어 본다) */
  start?: (file: File, consents: PhotoConsents) => Promise<PhotoStart>;
};
/** 줄이기 전 원본 한도(보내는 것은 기기에서 줄인 사진). 넉넉히 받되, 휴대폰에서 풀다가 탭이 죽을 만큼 큰 것만 막는다 */
const MAX_BYTES = 40 * 1024 * 1024;
/** 3D를 기다리거나 만드는 그림이 있으면 창을 연 동안 이만큼마다 다시 읽는다(다 되면 「3D」 표시로 바뀐다) */
const MODEL_POLL_MS = 20_000;

/** 칸 목록: null은 읽는 중, 'error'는 못 읽음(그때는 지금처럼 만들기 칸만 보인다. 서버가 한 번 더 막는다) */
type Slots = SlotsReply | null | 'error';

const isRunning = (m: Making | null): boolean => m !== null && (m.phase === 'queued' || m.phase === 'drawing');
const isRunning3d = (m: ModelMaking | null): boolean => m !== null && (m.phase === 'waiting' || m.phase === 'making');
const MADE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const MADE_EN = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const madeAt = (iso: string, lang: Lang = 'ko') => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > 0 ? (lang === 'en' ? MADE_EN : MADE).format(new Date(t)) : '';
};

/** 고치기 요청 한 번(POST). 상태 코드와 답의 JSON(없으면 null). 연결이 끊기면 상태 0 */
async function postJson(url: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }).catch(() => null);
  if (!res) return { status: 0, data: null };
  const data: unknown = await res.json().catch(() => null);
  return { status: res.status, data: data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null };
}
/** 고치기 답의 안내: 서버가 준 글, 없으면 상태로 */
function replyNote(r: { status: number; data: Record<string, unknown> | null }): string {
  if (typeof r.data?.message === 'string' && r.data.message) return r.data.message.slice(0, 160);
  if (r.status === 401) return '로그인이 끊겼어요. 다시 들어온 뒤 해 주세요.';
  if (r.status === 403) return '초대 손님만 할 수 있어요.';
  return '지금은 하지 못했어요. 잠시 뒤 다시 해 주세요.';
}

/** 그림이 놓인 곳: 작업대, ★ 보관함, 이력. 그림 하나에서 한 일의 안내는 누른 곳의 그 그림 바로 아래에 보인다 */
type Place = 'bench' | 'keep' | 'history';
/** 그림 하나 아래에 보이는 안내(누른 곳에서만) */
type ItemNote = { id: string; place: Place; text: string };

/** 그림 한 장에서 하는 일: 입기, ★ 보관, 작업대로, 3D 만들기(묻고 나서, 보관함에서만), 지우기 */
type CardActions = {
  busy: boolean;
  /** 이 사람의 3D 한도(null = 제한 없음). 3D가 있거나 만드는 중인 그림을 지울 때 한 번뿐인 3D를 잃는다고 알린다 */
  modelCap: number | null;
  onWear: (item: CharItem, place: Place) => void;
  onKeep: (item: CharItem, on: boolean, place: Place) => void;
  onBench: (item: CharItem, place: Place, slot: number | null) => void;
  onModel: (item: CharItem) => void;
  onRemove: (item: CharItem, place: Place) => void;
};

/** ★ 단추(그림의 오른쪽 위). 이름은 늘 「★ 보관」이고, 눌림(aria-pressed)과 채운 별로 보관했는지 알린다 */
function KeepStar({ item, place, busy, onKeep }: { item: CharItem; place: Place; busy: boolean; onKeep: CardActions['onKeep'] }) {
  const lang = useLang();
  return (
    <button
      type="button" className={css.star} aria-pressed={item.kept} disabled={busy} onClick={() => onKeep(item, !item.kept, place)}
      aria-label="★ 보관" title="★ 보관" {...enAttrs(lang, { 'aria-label': '★ Favorite', title: '★ Favorite' })}
    >
      <span aria-hidden="true">{item.kept ? '★' : '☆'}</span>
    </button>
  );
}

/** 지우기(한 번 더 묻는다). 그리는 중이면 「그만 그리기」. warn: 물을 때 함께 보이는 한 줄(한 번뿐인 3D를 잃는다), warnEn: 그 영어 */
function RemoveButton({ item, busy, emph, warn, warnEn, onRemove }: {
  item: CharItem; busy: boolean; emph: boolean; warn: string | null; warnEn: string | null; onRemove: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const word = item.status !== 'ready' ? <T ko="그만 그리기" en="Stop drawing" /> : <T ko="지우기" en="Delete" />;
  if (asking) {
    return (
      <span className={css.slotAsk}>
        {warn ? <span className={css.askWarn}><T ko={warn} en={warnEn ?? warn} /></span> : null}
        <button type="button" className={css.slotActWarn} disabled={busy} onClick={() => { setAsking(false); onRemove(); }}>{word}</button>
        <button type="button" className={css.slotAct} onClick={() => setAsking(false)}><T ko="두기" en="Cancel" /></button>
      </span>
    );
  }
  return (
    <button type="button" className={css.slotAct} data-emph={emph || undefined} disabled={busy} onClick={() => setAsking(true)}>{word}</button>
  );
}

/** 그림 아래 한 줄: 3D 상태와 단추들(작업대로, 3D 만들기, 지우기). 3D 만들기는 ★ 보관함에서만(★ 그림만 3D로 만든다) */
function CardFoot({ item, place, features, left, emph, actions, extra }: {
  item: CharItem; place: Place; features: boolean; left: number | null; emph: boolean; actions: CardActions; extra?: ReactNode;
}) {
  const badge = features ? itemBadge(item, left) : '';
  return (
    <>
      {badge ? <span className={css.badge3d} data-state={item.model}><T ko={badge} en={itemBadge(item, left, 'en')} /></span> : null}
      <span className={css.cardActs}>
        {extra}
        {features && place === 'keep' && canRequestModel(item, left) ? (
          <button type="button" className={css.slotAct} data-emph disabled={actions.busy} onClick={() => actions.onModel(item)}>
            <T ko="3D 만들기" en="Make 3D" />
          </button>
        ) : null}
        <RemoveButton
          item={item} busy={actions.busy} emph={emph} warn={features ? deleteWarning(item.model, actions.modelCap) : null}
          warnEn={features ? deleteWarning(item.model, actions.modelCap, 'en') : null}
          onRemove={() => actions.onRemove(item, place)}
        />
      </span>
    </>
  );
}

/** 누른 곳의 그 그림 바로 아래 안내 한 줄(스크롤하지 않는다. 화면 읽기 프로그램에는 읽힌다) */
function NoteFor({ note, item, place }: { note: ItemNote | null; item: CharItem; place: Place }) {
  return note && note.id === item.id && note.place === place ? <p role="status" className={css.itemNote}><Say text={note.text} /></p> : null;
}

/** 작업대 칸 하나: 다 그린 캐릭터(누르면 입는다), 그리는 중, 빈 칸(누르면 새로 만들기) */
function SlotCell({
  n, item, on, making, canMake, features, left, emph, actions, note, onMake,
}: {
  n: number; item: CharItem | null; on: boolean; making: Making | null; canMake: boolean; features: boolean;
  left: number | null; emph: boolean; actions: CardActions; note: ItemNote | null; onMake: () => void;
}) {
  const lang = useLang();
  if (!item) {
    return (
      <li className={css.slot}>
        <button type="button" className={`${css.slotBtn} ${css.slotEmpty}`} onClick={onMake} disabled={!canMake}>
          <span className={css.slotNum}>{n}</span>
          <span className={css.slotPlus} aria-hidden="true">+</span>
          <span>{canMake ? <T ko="새로 만들기" en="Make new" /> : <T ko="빈 칸" en="Empty" />}</span>
        </button>
      </li>
    );
  }
  const drawing = item.status !== 'ready';
  const tracked = drawing && making && making.id === item.id ? making : null;
  return (
    <li className={css.slot}>
      {drawing ? (
        <div className={`${css.slotBtn} ${css.slotMaking}`} role="img" aria-label={tr(lang, `${n}번 칸: 그리는 중`, `Slot ${n}: drawing`)}>
          <span className={css.slotNum}>{n}</span>
          <span className={css.slotSpin} aria-hidden="true" />
          <span>
            {tracked?.phase === 'queued' || item.status === 'queued' ? <T ko="차례 기다리는 중" en="Waiting" /> : <T ko="그리는 중" en="Drawing" />}
          </span>
        </div>
      ) : (
        <div className={css.cardBox}>
          <button
            type="button" className={css.slotBtn} aria-pressed={on} onClick={() => actions.onWear(item, 'bench')} disabled={actions.busy}
            aria-label={on ? tr(lang, `${n}번 칸: 지금 입은 캐릭터`, `Slot ${n}: wearing now`) : tr(lang, `${n}번 칸 캐릭터 입기`, `Wear the character in slot ${n}`)}
          >
            {/* 비공개 그림이라 이미지 최적화 서버를 거치지 않고 세션으로 바로 받는다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={css.slotImg} src={`/api/avatar/${item.id}`} alt="" loading="lazy" />
            <span className={css.slotNum}>{n}</span>
            {on ? <span className={css.slotOn}><T ko="지금 입은 것" en="Wearing" /></span> : null}
          </button>
          {features ? <KeepStar item={item} place="bench" busy={actions.busy} onKeep={actions.onKeep} /> : null}
        </div>
      )}
      <CardFoot item={item} place="bench" features={features} left={left} emph={emph} actions={actions} />
      <NoteFor note={note} item={item} place="bench" />
    </li>
  );
}

/**
 * 작업대가 다 찼을 때 누른 그림 바로 아래에 펼치는 바꿀 칸. 펼치면 줄이 다 보이게 스크롤한 뒤 첫 단추로 초점을 옮긴다
 * (이력 아래쪽의 그림에서 펼쳐도 화면 밖에 열리지 않게). size: 작업대 칸 수, bench: 작업대 칸의 그림(칸 번호 차례).
 * 단추마다 그 칸에 있는 그림을 작게 보인다(작업대는 한참 위에 있다). 칸이 많으면(9칸) 단추 글은 번호만이고,
 * 화면 읽기 프로그램에는 「N번 칸과 바꾸기」로 읽힌다
 */
function SwapRow({ size, bench, busy, onPick, onCancel }: {
  size: number; bench: readonly (CharItem | null)[]; busy: boolean; onPick: (slot: number) => void; onCancel: () => void;
}) {
  const row = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    row.current?.scrollIntoView({ block: 'nearest' });
    first.current?.focus();
  }, []);
  const many = size > SLOTS;
  const lang = useLang();
  return (
    <span ref={row} className={css.swapRow} role="group" aria-label="바꿀 작업대 칸" {...enAttrs(lang, { 'aria-label': 'Workbench slot to swap' })}>
      <span className={css.swapText}>
        <T
          ko="작업대가 다 찼어요. 바꿀 칸을 골라 주세요(바꾼 그림은 이력에 그대로 있어요)."
          en="The workbench is full. Choose a slot to swap (the swapped picture stays in your history)."
        />
      </span>
      {slotNumbers(size).map((n) => (
        <button
          key={n} ref={n === 1 ? first : undefined} type="button" className={many ? css.swapNum : `${css.slotAct} ${css.swapWide}`} data-emph
          disabled={busy} onClick={() => onPick(n)} aria-label={tr(lang, `${n}번 칸과 바꾸기`, `Swap with slot ${n}`)}
        >
          <SwapThumb item={bench[n - 1] ?? null} />
          <span><T ko={many ? `${n}번` : `${n}번 칸과 바꾸기`} en={many ? `#${n}` : `Swap with slot\u00a0${n}`} /></span>
        </button>
      ))}
      <button type="button" className={css.slotAct} onClick={onCancel}><T ko="그만두기" en="Cancel" /></button>
    </span>
  );
}

/** 바꿀 칸 단추 안의 작은 그림: 그 칸에 지금 있는 그림(그리는 중이거나 비었으면 빈 틀) */
function SwapThumb({ item }: { item: CharItem | null }) {
  if (!item || item.status !== 'ready') return <span className={css.swapThumb} data-empty aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={css.swapThumb} src={`/api/avatar/${item.id}`} alt="" loading="lazy" />;
}

/**
 * ★ 보관함과 이력의 그림 하나(최근부터): 입기, ★, 작업대로(작업대에 없을 때), 3D 만들기(보관함), 지우기.
 * size: 작업대 칸 수, bench: 작업대 칸의 그림(바꿀 칸 단추에 작게 보인다)
 */
function HistoryItem({ item, place, on, left, emph, actions, swapping, onSwapCancel, note, size, bench }: {
  item: CharItem; place: Place; on: boolean; left: number | null; emph: boolean; actions: CardActions;
  swapping: boolean; onSwapCancel: () => void; note: ItemNote | null; size: number; bench: readonly (CharItem | null)[];
}) {
  const lang = useLang();
  const made = madeAt(item.since);
  const madeEn = madeAt(item.since, 'en');
  return (
    <li className={css.hItem}>
      {item.status !== 'ready' ? (
        <div className={`${css.hThumb} ${css.slotMaking}`} role="img" aria-label={tr(lang, `${made} 그림: 그리는 중`, `Picture from ${madeEn}: drawing`)}>
          <span className={css.slotSpin} aria-hidden="true" />
          <span><T ko="그리는 중" en="Drawing" /></span>
        </div>
      ) : (
        <div className={css.cardBox}>
          <button
            type="button" className={css.hThumb} aria-pressed={on} onClick={() => actions.onWear(item, place)} disabled={actions.busy}
            aria-label={on
              ? tr(lang, `${made}에 만든 캐릭터: 지금 입은 것`, `Character made ${madeEn}: wearing now`)
              : tr(lang, `${made}에 만든 캐릭터 입기`, `Wear the character made ${madeEn}`)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={css.slotImg} src={`/api/avatar/${item.id}`} alt="" loading="lazy" />
            {item.slot ? <span className={css.slotNum}><T ko={`${item.slot}번 칸`} en={`Slot\u00a0${item.slot}`} /></span> : null}
            {on ? <span className={css.slotOn}><T ko="입은 것" en="Wearing" /></span> : null}
          </button>
          <KeepStar item={item} place={place} busy={actions.busy} onKeep={actions.onKeep} />
        </div>
      )}
      <span className={css.hMeta}><T ko={made} en={madeEn} /></span>
      <CardFoot
        item={item} place={place} features left={left} emph={emph} actions={actions}
        extra={item.slot === null && item.status === 'ready' && !swapping ? (
          <button type="button" className={css.slotAct} disabled={actions.busy} onClick={() => actions.onBench(item, place, null)}>
            <T ko="작업대로" en="To workbench" />
          </button>
        ) : null}
      />
      {swapping ? (
        <SwapRow size={size} bench={bench} busy={actions.busy} onPick={(n) => actions.onBench(item, place, n)} onCancel={onSwapCancel} />
      ) : null}
      <NoteFor note={note} item={item} place={place} />
    </li>
  );
}

/**
 * 3D 만들기 확인: 무엇을 어디로 보내는지 보여 주고 한 번 더 받는다. Esc는 이 확인만 닫는다(창은 그대로).
 * chance: 남은 3D 수와 실패하면 한 번 더 해 볼 수 있는지(실제 셈대로. 확인 카드와 같은 한 줄)
 */
function ModelConfirm({ item, provider, cap, optOut, chance, busy, onYes, onNo }: {
  item: CharItem; provider: ModelProvider; cap: number | null; optOut: boolean; chance: ModelChance | null; busy: boolean;
  onYes: () => void; onNo: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const lang = useLang();
  // 열 때 확인으로 초점을 옮기고, 닫으면 누른 단추로 돌려준다(단추가 없어졌으면 그대로)
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus();
    return () => {
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onNo();
    }
  };
  return (
    <div ref={box} className={css.confirm} role="group" aria-labelledby={`${id}-q`} tabIndex={-1} onKeyDown={onKey}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={css.confirmImg} src={`/api/avatar/${item.id}`} alt={tr(lang, '3D로 만들 캐릭터', 'Character to make into 3D')} />
      <div className={css.confirmBody}>
        <p id={`${id}-q`} className={css.confirmText}>
          <T ko={modelConfirm(provider, cap, optOut)} en={modelConfirm(provider, cap, optOut, 'en')} />
        </p>
        {chance ? <p className={css.confirmChance}><T ko={modelChanceLine(chance)} en={modelChanceLine(chance, 'en')} /></p> : null}
        <div className={css.row}>
          <button type="button" className="btn btn-small btn-roof" disabled={busy} onClick={onYes}>
            <T ko={modelConfirmYes(provider)} en={modelConfirmYes(provider, 'en')} />
          </button>
          <button type="button" className="btn btn-small" onClick={onNo}><T ko="그만두기" en="Cancel" /></button>
        </div>
      </div>
    </div>
  );
}

function PhotoTab({ look, doll, onChange, photo }: { look: CharacterLook; doll: DollLook; onChange: (l: CharacterLook) => void; photo: PhotoOptions }) {
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState<PhotoSubject | null>(null);
  const [guardian, setGuardian] = useState(false);
  const [terms, setTerms] = useState(false);
  const consents = { subject, guardian, terms };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** 창 전체의 안내(사진 보내기·지운 뒤). 만들기 폼 바로 위에 보인다 */
  const [note, setNote] = useState<string | null>(null);
  /** 그림 하나에서 한 일의 안내(누른 곳의 그 그림 바로 아래. ★·작업대로·입기·지우기 실패 등) */
  const [itemNote, setItemNote] = useState<ItemNote | null>(null);
  const [slots, setSlots] = useState<Slots>(null);
  const [slotBusy, setSlotBusy] = useState(false);
  const [reload, setReload] = useState(0);
  /** 작업대가 다 차서 바꿀 칸을 고르는 중인 그림(누른 곳의 그 그림 바로 아래에 펼친다) */
  const [swapFor, setSwapFor] = useState<{ id: string; place: Place } | null>(null);
  /** 3D 만들기를 묻는 중인 그림 */
  const [asking3d, setAsking3d] = useState<CharItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const making = useMaking();
  const making3d = useModelMaking();
  // 못 그린 결과(2D)와 끝난 3D는 이 창을 연 동안 계속 보인다(보고 나면 칩의 알림은 뜨지 않는다)
  const [keepId, setKeepId] = useState<string | null>(null);
  if (making && making.phase === 'failed' && !making.seen && keepId !== making.id) setKeepId(making.id);
  const [keep3dId, setKeep3dId] = useState<string | null>(null);
  if (making3d && !isRunning3d(making3d) && !making3d.seen && keep3dId !== making3d.id) setKeep3dId(making3d.id);
  // 다 그렸으면 고를 때까지 확인 카드(PickCard), 그리는 중이거나 못 그렸으면 진행 상자
  const pick = making && making.phase === 'ready' && !making.seen ? making : null;
  const showProgress = making && (isRunning(making) || (making.phase === 'failed' && keepId === making.id)) ? making : null;
  const show3d = making3d && (isRunning3d(making3d) || keep3dId === making3d.id) ? making3d : null;
  const photoId = look.kind === 'photo' ? look.url.split('/').pop() ?? '' : '';
  const lang = useLang();

  // 작업대와 이력: 창을 열 때, 보낸 뒤, 고친 뒤, 다 그렸거나 못 그린 뒤, 3D가 끝난 뒤에 다시 읽는다
  const doneKey = [
    making && (making.phase === 'ready' || making.phase === 'failed') ? `${making.id}:${making.phase}` : '',
    making3d && (making3d.phase === 'ready' || making3d.phase === 'failed') ? `3d:${making3d.id}:${making3d.phase}` : '',
  ].join('|');
  useEffect(() => {
    let stop = false;
    fetch('/api/avatar/slots', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (r) => {
        const data = r.ok ? readSlotsReply(await r.json().catch(() => null)) : null;
        if (stop) return;
        setSlots(data ?? 'error');
        // 다른 기기·화면에서 보낸 그리는 중인 것이 있으면 이어 본다(메인 화면 칩과 알림). 작업대 밖(이력)에 있어도
        const run = [...(data?.cells ?? []), ...(data?.history ?? [])].find((c) => c && c.status !== 'ready');
        if (run) adoptMaking(run.id, run.since || null, run.slot);
        // 3D를 기다리거나 만드는 그림이 있으면 그 진행도 이어 본다(다른 화면이나 「내 캐릭터」에서 맡긴 것)
        const run3d = (data?.history ?? []).find((c) => c.model === 'waiting' || c.model === 'making');
        if (run3d) adoptModelMaking(run3d.id);
      })
      .catch(() => { if (!stop) setSlots('error'); });
    return () => {
      stop = true;
    };
  }, [reload, doneKey]);

  const layout = slots && slots !== 'error' ? slots : null;
  // 3D를 기다리거나 만드는 그림이 있으면 창을 연 동안 가끔 다시 읽는다
  const modelBusy = Boolean(layout?.history?.some((h) => h.model === 'waiting' || h.model === 'making'));
  useEffect(() => {
    if (!modelBusy) return;
    const t = window.setTimeout(() => setReload((n) => n + 1), MODEL_POLL_MS);
    return () => window.clearTimeout(t);
  }, [modelBusy, reload]);

  /** 0021의 이력·★·3D가 있는 DB인가(전이면 예전처럼 칸 셋만) */
  const features = Boolean(layout?.history);
  /** 작업대 칸 수(서버가 세션의 역할로 준다: 손님 3, 가족·관리자 9) */
  const size = layout ? layout.cells.length : SLOTS;
  const full = layout ? layout.cells.every(Boolean) : false;
  const quota = layout?.quota ?? null;
  const canMake = !quota || quota.ok;
  const blocked = quota && !quota.ok ? quota : null;
  const historyFull = blocked?.reason === 'history_full';
  const counts = layout?.counts ?? null;
  const modelsOnNow = layout?.modelsOn !== false;
  const left = modelRoom(counts, modelsOnNow).left;
  const provider: ModelProvider = layout?.provider ?? 'meshy';
  const optOut = layout?.trainingOptOut === true;
  // ★ 보관함: 작업대와 이력(최근 HISTORY_SHOWN개)에서 ★ 그림만, 최근부터. 손님·가족은 이력이 그보다 작아 모두 보인다
  const kept = layout
    ? [...new Map([...layout.cells, ...(layout.history ?? [])].filter((c): c is CharItem => Boolean(c?.kept)).map((c) => [c.id, c])).values()]
      .sort((a, b) => b.since.localeCompare(a.since))
    : [];
  const keepRoom = counts && counts.keeps.cap !== null ? Math.max(0, counts.keeps.cap - kept.length) : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !consentsReady(consents) || busy) return;
    if (file.size > MAX_BYTES) return setMsg('사진이 너무 커요. 40MB보다 작은 사진으로 골라 주세요.');
    // 작업대가 다 차 있었으면 DB가 가장 오래 있던 칸을 비워 새 그림에 준다(비운 그림은 지우지 않고 이력에 남는다)
    const rotates = features && full;
    setBusy(true);
    setMsg(null);
    setNote(null);
    const r = await (photo.start ?? uploadPhoto)(file, consents);
    setBusy(false);
    if (r.ok) {
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      if (rotates) setNote('작업대가 다 차서 가장 오래 있던 그림이 작업대에서 빠졌어요(이력에는 그대로 있어요).');
    } else setMsg(r.message);
    setReload((n) => n + 1);
  };
  const wear = (item: CharItem, place: Place) => {
    if (item.id === photoId) return;
    onChange({ kind: 'photo', url: `/api/avatar/${item.id}` });
    setItemNote({ id: item.id, place, text: '이 캐릭터로 갈아입었어요.' });
  };
  const empty = async (item: CharItem, place: Place) => {
    setSlotBusy(true);
    setNote(null);
    setItemNote(null);
    const res = await fetch(`/api/avatar/${encodeURIComponent(item.id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    setSlotBusy(false);
    if (res && (res.ok || res.status === 404)) {
      // 이 기기의 브라우저 캐시에 남은 그림도 버린다
      void dropCachedAvatar(item.id);
      clearMaking(item.id);
      clearModelMaking(item.id);
      if (item.id === photoId) onChange({ kind: 'doll', doll });
      setNote(item.status !== 'ready'
        ? '그리기를 그만두고 지웠어요.'
        : item.id === photoId
          ? '그림을 지웠어요. 지금은 기본 인형으로 걸어요. 원본 사진은 「내 캐릭터」 화면에서 지울 수 있어요.'
          : '그림을 지웠어요. 원본 사진은 「내 캐릭터」 화면에서 지울 수 있어요.');
    } else {
      setItemNote({
        id: item.id, place,
        text: res?.status === 401 ? '로그인이 끊겼어요. 다시 들어온 뒤 지워 주세요.'
          : res?.status === 403 ? '초대 손님만 지울 수 있어요.'
            : '지금은 지우지 못했어요. 잠시 뒤 다시 해 주세요.',
      });
    }
    setReload((n) => n + 1);
  };
  const make = () => {
    // 빈 칸을 누르면 사진 고르기를 바로 연다(손가락 한 번). 동의 칸은 보낸 앞에서 확인한다
    fileRef.current?.scrollIntoView({ block: 'nearest' });
    fileRef.current?.click();
  };
  /** ★: 되면 별 모양만 바뀐다(스크롤하지 않고 안내도 없다). 안 되면 그 그림 아래에 까닭 */
  const keep = async (item: CharItem, on: boolean, place: Place) => {
    setSlotBusy(true);
    setItemNote(null);
    const r = await postJson(`/api/avatar/${encodeURIComponent(item.id)}/keep`, { on });
    setSlotBusy(false);
    if (r.data?.ok !== true) setItemNote({ id: item.id, place, text: replyNote(r) });
    setReload((n) => n + 1);
  };
  /** 작업대로: slot이 없으면 빈 칸에, 빈 칸이 없으면 그 그림 바로 아래에 바꿀 칸을 펼친다 */
  const place = async (item: CharItem, where: Place, slot: number | null) => {
    setSlotBusy(true);
    setItemNote(null);
    const r = await postJson(`/api/avatar/${encodeURIComponent(item.id)}/bench`, slot === null ? {} : { slot });
    setSlotBusy(false);
    if (r.data?.ok === true) {
      setSwapFor(null);
      setItemNote({ id: item.id, place: where, text: typeof r.data.slot === 'number' ? `작업대 ${r.data.slot}번 칸에 놓았어요.` : '작업대에 놓았어요.' });
    } else if (r.data?.reason === 'bench_full') {
      setSwapFor({ id: item.id, place: where });
    } else {
      setSwapFor(null);
      setItemNote({ id: item.id, place: where, text: replyNote(r) });
    }
    setReload((n) => n + 1);
  };
  const askModel = (item: CharItem) => {
    setItemNote(null);
    setSwapFor(null);
    setAsking3d(item);
  };
  const sendModel = async () => {
    const item = asking3d;
    if (!item) return;
    setSlotBusy(true);
    const r = await postJson(`/api/avatar/${encodeURIComponent(item.id)}/model`);
    setSlotBusy(false);
    setAsking3d(null);
    // 줄에 섰으면 3D 단계(요청함 → 차례 → 만드는 중 → 다 됐어요)를 창 위와 메인 화면 칩에서 이어 본다
    if (r.data?.ok === true && r.data.already !== true) startModelMaking(item.id);
    setItemNote({
      id: item.id, place: 'keep',
      text: r.data?.ok !== true
        ? replyNote(r)
        : r.data.already === true
          ? '이미 3D가 있거나 만드는 중이에요.'
          : '3D 만들기를 맡겼어요. 보통 1~2분 걸려요. 다 되면 이 그림에 「3D」가 붙고, 이 캐릭터를 입고 걸으면 3D로 보여요.',
    });
    setReload((n) => n + 1);
  };
  const actions: CardActions = {
    busy: slotBusy, modelCap: counts ? counts.models.cap : null,
    onWear: wear, onKeep: keep, onBench: place, onModel: askModel, onRemove: empty,
  };
  const head = headLine(quota, counts, modelsOnNow);
  const headEn = headLine(quota, counts, modelsOnNow, 'en');
  const historyHint = left === 0
    ? <T ko="최근부터" en="Newest first" />
    : <T ko="최근부터 · ☆을 누르면 보관함에 놓여요" en="Newest first · Press ☆ to add to favorites" />;
  const extraN = layout ? layout.extra.length : 0;

  return (
    <div className={css.photoTab}>
      {showProgress ? <MakingProgress m={showProgress} /> : null}
      {pick ? (
        <PickCard
          key={pick.id} id={pick.id} info={slots} where="panel"
          onClose={() => clearMaking(pick.id)}
          onSent={() => { clearMaking(pick.id); setReload((n) => n + 1); }}
        />
      ) : null}
      {show3d ? <ModelProgress m={show3d} /> : null}
      {layout ? (
        <section className={css.slotsBox} aria-label="작업대" {...enAttrs(lang, { 'aria-label': 'Workbench' })}>
          <div className={css.slotsHead}>
            <h3 className={css.slotsTitle}><T ko="작업대" en="Workbench" /></h3>
            {/* 오늘 남은 장수, 이력·★ 수, 3D 남은 수(제한이 없거나 쉬거나 다 썼으면 그렇다고). 0021 전이면 오늘 장수만 */}
            {head ? <span className="small walk-panel-meta"><T ko={head} en={headEn} /></span> : null}
          </div>
          {!features && full && blocked?.reason === 'slots_full' ? (
            <p className={css.fullNote}>
              <T
                ko="칸 세 개가 다 찼어요. 바꿀 칸의 「지우기」를 누르면 그 자리에 새로 만들 수 있어요."
                en="All three slots are full. Press “Delete” on a slot to make a new one there."
              />
            </p>
          ) : null}
          <ol className={size > SLOTS ? `${css.slots} ${css.slotsMany}` : css.slots}>
            {layout.cells.map((item, i) => (
              <SlotCell
                key={item?.id ?? `empty-${i}`} n={i + 1} item={item} on={Boolean(item) && item!.id === photoId} making={making}
                canMake={canMake && !busy} features={features} left={left}
                emph={historyFull || (!features && full && blocked?.reason === 'slots_full')} actions={actions} note={itemNote} onMake={make}
              />
            ))}
          </ol>
          {layout.extra.length ? (
            <p className="small walk-panel-meta">
              <T
                ko={<>칸 밖에 캐릭터가 {layout.extra.length}개 더 있어요. 「내 캐릭터」 화면에서 고르거나 지울 수 있어요.</>}
                en={`${extraN === 1 ? 'There is 1 more character' : `There are ${extraN} more characters`} outside the slots. You can choose or delete them on the “My character” page.`}
              />
            </p>
          ) : null}
        </section>
      ) : slots === null ? (
        <p className="small walk-panel-meta" role="status"><T ko="작업대를 여는 중이에요" en="Opening the workbench" /></p>
      ) : null}
      {/* 사진으로 새로 만들기: 작업대 바로 아래(이력이 길어도 내려가지 않게) */}
      {note ? <p role="status" className={css.status}><Say text={note} /></p> : null}
      {look.kind === 'photo' ? (
        <div className={css.row}>
          <p><T ko="지금은 사진 캐릭터로 걷고 있어요." en="You're walking as a photo character now." /></p>
          <button type="button" className="btn btn-small" onClick={() => { onChange({ kind: 'doll', doll }); setNote(null); }}>
            <T ko="기본 인형으로 걷기" en="Walk as the basic doll" />
          </button>
        </div>
      ) : null}
      {blocked && blocked.reason !== 'slots_full' && blocked.reason !== 'history_full'
        ? <p className={css.fullNote} role="status"><Say text={blocked.message} /></p> : null}
      <form className={css.form} onSubmit={submit} hidden={Boolean(blocked)}>
        {/* 동의 글: 짧은 다섯 줄. 자세한 글은 개인정보 화면에 */}
        <div className={css.consent}>
          <T
            ko={<ul className={css.consentList}>{consentPoints(provider, optOut).map((p) => <li key={p.head}><b>{p.head}</b> {p.text}</li>)}</ul>}
            en={<ul className={css.consentList}>{consentPoints(provider, optOut, 'en').map((p) => <li key={p.head}><b>{p.head}</b> {p.text}</li>)}</ul>}
          />
          <a className={css.consentMore} href="/privacy" target="_blank" rel="noopener"><T ko="자세히 보기" en="Read more" /></a>
        </div>
        <label className={css.file}>
          <span><T ko="사진 고르기" en="Choose a photo" /></span>
          <input
            ref={fileRef} type="file" accept="image/*"
            onChange={(e) => { setFile(e.currentTarget.files?.[0] ?? null); setMsg(null); }}
          />
        </label>
        <fieldset className={css.subject}>
          <legend><T ko={SUBJECT_QUESTION} en={SUBJECT_QUESTION_EN} /></legend>
          {(['self', 'child'] as const).map((s) => (
            <label key={s} className={css.check}>
              <input type="radio" name="photo-subject" value={s} checked={subject === s} onChange={() => setSubject(s)} />
              <span><T ko={SUBJECT_LABEL[s]} en={SUBJECT_LABEL_EN[s]} /></span>
            </label>
          ))}
          {subject === 'child' ? (
            <label className={`${css.check} ${css.guardian}`}>
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.currentTarget.checked)} />
              <span><T ko={CONSENT_GUARDIAN} en={CONSENT_GUARDIAN_EN} /></span>
            </label>
          ) : null}
        </fieldset>
        <label className={css.check}>
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.currentTarget.checked)} />
          <span><T ko={CONSENT_TERMS} en={CONSENT_TERMS_EN} /></span>
        </label>
        <p className={`small ${css.fine}`}><T ko={CONSENT_SMALL} en={CONSENT_SMALL_EN} /></p>
        {msg ? <p role="alert" className={css.error}><Say text={msg} /></p> : null}
        <button type="submit" className="btn" disabled={!file || !consentsReady(consents) || busy}>
          {busy ? <T ko="보내는 중" en="Sending" /> : <T ko="그림 맡기기" en="Send to draw" />}
        </button>
      </form>
      {layout?.history ? (
        <section className={css.slotsBox} aria-label="★ 보관함" {...enAttrs(lang, { 'aria-label': '★ Favorites' })}>
          <div className={css.slotsHead}>
            <h3 className={css.slotsTitle}><T ko="★ 보관함" en="★ Favorites" /></h3>
            <span className="small walk-panel-meta">
              {left === 0 ? <T ko="★ 그림" en="★ pictures" /> : <T ko="★ 그림 가운데 하나를 골라 3D로 만들 수 있어요" en="Pick one ★ picture to make into 3D" />}
            </span>
          </div>
          {asking3d ? (
            <ModelConfirm
              key={asking3d.id} item={asking3d} provider={provider} cap={counts?.models.cap ?? null} optOut={optOut}
              chance={modelChance(counts, modelsOnNow)} busy={slotBusy} onYes={sendModel} onNo={() => setAsking3d(null)}
            />
          ) : null}
          {kept.length || keepRoom ? (
            <ul className={css.history}>
              {kept.map((item) => (
                <HistoryItem
                  key={item.id} item={item} place="keep" on={item.id === photoId} left={left} emph={false} actions={actions}
                  swapping={swapFor?.id === item.id && swapFor.place === 'keep'} onSwapCancel={() => setSwapFor(null)} note={itemNote}
                  size={size} bench={layout.cells}
                />
              ))}
              {Array.from({ length: keepRoom }, (_, i) => (
                <li key={`keep-empty-${i}`} className={css.keepEmpty}><T ko="이력에서 ☆을 누르면 여기 놓여요" en="Press ☆ in your history to put it here" /></li>
              ))}
            </ul>
          ) : (
            <p className="small walk-panel-meta"><T ko="이력에서 ☆을 누르면 여기 놓여요." en="Press ☆ in your history to put it here." /></p>
          )}
        </section>
      ) : null}
      {layout?.history ? (
        <section className={css.slotsBox} aria-label="이력" {...enAttrs(lang, { 'aria-label': 'History' })}>
          <div className={css.slotsHead}>
            <h3 className={css.slotsTitle}><T ko="이력" en="History" /></h3>
            <span className="small walk-panel-meta">{historyHint}</span>
          </div>
          {historyFull && blocked ? (
            <p className={css.fullNote} role="status">
              <Say text={blocked.message} /> <T ko="3D가 있는 그림과 ★ 그림은 남겨 두세요." en="Keep the pictures with 3D and your ★ pictures." />
            </p>
          ) : null}
          {layout.history.length ? (
            <ul className={css.history}>
              {layout.history.map((item) => (
                <HistoryItem
                  key={item.id} item={item} place="history" on={item.id === photoId} left={left} emph={historyFull} actions={actions}
                  swapping={swapFor?.id === item.id && swapFor.place === 'history'} onSwapCancel={() => setSwapFor(null)} note={itemNote}
                  size={size} bench={layout.cells}
                />
              ))}
            </ul>
          ) : (
            <p className="small walk-panel-meta">
              <T ko="아직 만든 그림이 없어요. 위에서 사진으로 만들면 여기에 쌓여요." en="No pictures yet. Make one from a photo above and it will show up here." />
            </p>
          )}
          {layout.more ? (
            <p className="small walk-panel-meta">
              <T
                ko={<>이력이 더 있어요. 최근 {HISTORY_SHOWN}개만 보여요. 지우면 그다음 것이 보여요.</>}
                en={<>There is more history. Only the latest {HISTORY_SHOWN} are shown. Delete some to see the next ones.</>}
              />
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** name: 칭호 미리보기에 쓸 내 이름 */
type Props = { look: CharacterLook; onChange: (l: CharacterLook) => void; onClose: () => void; photo: PhotoOptions; name?: string | null };

export function CharacterPanel({ look, onChange, onClose, photo, name }: Props) {
  const [doll, setDoll] = useState<DollLook>(look.kind === 'doll' ? look.doll : DEFAULT_DOLL);
  // 사진으로 걷거나, 그리는 중이거나, 방금 못 그린 일(「다시 해 보기」로 열었다)이나 고를 확인 카드가 있거나,
  // 3D를 만드는 중이거나 막 끝났으면(칩을 눌러 연 때) 사진 탭부터
  const [tab, setTab] = useState<'doll' | 'photo'>(() => {
    const m = getMaking();
    const m3 = getModelMaking();
    const photoFirst = look.kind === 'photo' || isRunning(m) || m?.phase === 'failed' || (m?.phase === 'ready' && !m.seen)
      || isRunning3d(m3) || (m3 !== null && !m3.seen);
    return photoFirst && photo.enabled ? 'photo' : 'doll';
  });
  // 사진 캐릭터 기능이 아직 없으면(404) 탭을 숨기고 한 줄만. null = 확인 중
  const [photoOk, setPhotoOk] = useState<boolean | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const ids = useId();
  const lang = useLang();
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
    trapTab(e);
  };

  return (
    <div className={`walk-panel walk-panel-long ${css.panel}`} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} onKeyDown={onKey}>
      <div className="walk-panel-head">
        <h2 id={`${ids}-t`} ref={title} tabIndex={-1}><T ko="캐릭터 꾸미기" en="Customize character" /></h2>
        <button type="button" className="walk-panel-x" onClick={onClose} aria-label={tr(lang, '캐릭터 꾸미기 닫기', 'Close character panel')}><IconClose /></button>
      </div>
      <div className="walk-panel-body">
      {/* 칭호는 인형·사진 어느 쪽이든 단다(겉모습을 바꿔도 그대로 남는다). 칸을 늘 보내야 지운 칭호가 지워진다 */}
      <TitleField value={look.title ?? ''} name={name} onSave={(t) => onChange({ ...look, title: t })} />
      {showPhoto ? (
        <div className={css.tabs} role="tablist" aria-label={tr(lang, '꾸미기 방법', 'How to customize')}>
          {(['doll', 'photo'] as const).map((t) => (
            <button
              key={t} type="button" role="tab" id={`${ids}-${t}`} aria-selected={current === t} aria-controls={`${ids}-${t}-p`}
              className={current === t ? css.tabOn : css.tab} onClick={() => setTab(t)}
            >
              {t === 'doll' ? <T ko="기본 인형" en="Basic doll" /> : <T ko="사진 캐릭터" en="Photo character" />}
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
      {photo.enabled && photoOk === false ? (
        <p className="small walk-panel-meta"><T ko="사진 캐릭터는 아직 준비 중이에요." en="Photo characters aren't ready yet." /></p>
      ) : null}
      <button type="button" className="btn btn-small" onClick={onClose}><T ko="닫기" en="Close" /></button>
      </div>
    </div>
  );
}
