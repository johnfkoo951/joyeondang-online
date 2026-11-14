'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { saveMyLook } from '@/app/look-actions';
import { T } from '@/components/i18n/T';
import { useTr } from '@/components/i18n/useLang';
import { emitWalk, WALK_EVENT } from '@/components/walk/walk-events';
import { ACC_NAMES, CLOTH_NAMES, HAIR_COLOR_NAMES, HAIR_NAMES, type DollName } from '@/content/dolls';
import { createAvatar } from '@/walk/avatar';
import {
  ACCESSORIES,
  CLOTH_COLORS,
  DEFAULT_DOLL,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  cleanLook,
  type Accessory,
  type DollLook,
  type HairStyle,
} from '@/walk/look';
import css from './web-doll.module.css';

const LOOK_KEY = 'jy.walk.look.v1';
// 고르는 이름(머리 모양·소품·색)은 걷기 화면의 캐릭터 창과 같은 표(content/dolls.ts)에서 두 말로 온다

/** 추천 옷차림(이름은 두 말) */
const PRESETS: { label: DollName; doll: DollLook }[] = [
  {
    label: { ko: '마당 산책꾼', en: 'Yard stroller' },
    doll: { hair: 'short', hairColor: HAIR_COLORS[1], skin: SKIN_TONES[1], top: CLOTH_COLORS[0], bottom: CLOTH_COLORS[7], acc: 'hat' },
  },
  {
    label: { ko: '서재 독서가', en: 'Study reader' },
    doll: { hair: 'bob', hairColor: HAIR_COLORS[0], skin: SKIN_TONES[0], top: CLOTH_COLORS[2], bottom: CLOTH_COLORS[8], acc: 'glasses' },
  },
  {
    label: { ko: '박공 재즈팬', en: 'Attic jazz fan' },
    doll: { hair: 'curly', hairColor: HAIR_COLORS[2], skin: SKIN_TONES[2], top: CLOTH_COLORS[3], bottom: CLOTH_COLORS[7], acc: 'headphones' },
  },
  {
    label: { ko: '따뜻한 목도리', en: 'Warm scarf' },
    doll: { hair: 'bun', hairColor: HAIR_COLORS[1], skin: SKIN_TONES[1], top: CLOTH_COLORS[1], bottom: CLOTH_COLORS[7], acc: 'scarf' },
  },
];

/** 아래 안내 줄(저장 상태). 두 말 */
const STATUS = {
  intro: { ko: '머리 모양과 옷, 소품을 고르면 걷기 화면에 바로 반영돼요.', en: 'Pick a hairstyle, clothes and extras, and the walk screen updates right away.' },
  local: {
    ko: '✓ 이 기기에 내 인형 모습을 저장했어요! 집 안 걷기에 들어가면 이 모습으로 걸어요.',
    en: "✓ Saved your doll's look on this device! You'll walk with this look when you walk the house.",
  },
  saving: { ko: '저장하는 중…', en: 'Saving…' },
  account: { ko: '✓ 내 계정 캐릭터로 저장했어요! 어디서 들어와도 이 모습으로 걸어요.', en: "✓ Saved to your account! You'll walk with this look wherever you sign in." },
  deviceFirst: { ko: '이 기기에 먼저 저장해 두었어요.', en: 'Saved on this device for now.' },
} as const satisfies Record<string, DollName>;

const pickRandom = <V,>(arr: readonly V[]): V => arr[Math.floor(Math.random() * arr.length)];

function SpinningDollCanvas({ doll, spin }: { doll: DollLook; spin: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dollRef = useRef(doll);
  const spinRef = useRef(spin);
  useEffect(() => {
    dollRef.current = doll;
  }, [doll]);
  useEffect(() => {
    spinRef.current = spin;
  }, [spin]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const canvas = document.createElement('canvas');
    canvas.className = css.canvas;
    box.appendChild(canvas);
    const w = box.clientWidth || 210;
    const h = box.clientHeight || 240;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      canvas.remove();
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff7ea', '#b9a58c', 2.25));
    const sun = new THREE.DirectionalLight('#ffffff', 1.65);
    sun.position.set(1.6, 3.1, 2.6);
    scene.add(sun);

    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
    cam.position.set(0, 0.95, 3.1);
    cam.lookAt(0, 0.62, 0);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    let av: ReturnType<typeof createAvatar> | null = null;
    let shown = '';
    let raf = 0;

    const frame = () => {
      const key = JSON.stringify(dollRef.current);
      const changed = key !== shown;
      if (changed) {
        av?.dispose();
        av = createAvatar({ look: { kind: 'doll', doll: dollRef.current }, reducedMotion: true, shadow: false });
        scene.add(av.group);
        shown = key;
      }
      const moving = spinRef.current && !reduced;
      if (av && (changed || moving)) {
        av.group.rotation.y = moving ? -0.45 + Math.sin((performance.now() - t0) / 1600) * 0.68 : -0.35;
        renderer.render(scene, cam);
      }
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      av?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div ref={boxRef} className={css.canvasBox} aria-hidden="true" />;
}

type Opt = { value: string; label: DollName; swatch?: string };

function OptionRow({ legend, value, options, onPick }: { legend: DollName; value: string; options: Opt[]; onPick: (v: string) => void }) {
  const name = useId();
  const tr = useTr();
  return (
    <fieldset className={css.group}>
      <legend className={css.legend}><T ko={legend.ko} en={legend.en} /></legend>
      <div className={css.options}>
        {options.map((o) => (
          <label key={o.value} className={o.swatch ? css.swatchLabel : css.chip} title={tr(o.label.ko, o.label.en)}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              className={css.radio}
              onChange={() => onPick(o.value)}
            />
            {o.swatch ? <span className={css.swatchDot} style={{ background: o.swatch }} aria-hidden="true" /> : null}
            <span className={o.swatch ? 'sr-only' : undefined}><T ko={o.label.ko} en={o.label.en} /></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const HAIR_OPTS: Opt[] = HAIR_STYLES.map((v) => ({ value: v, label: HAIR_NAMES[v] }));
const ACC_OPTS: Opt[] = ACCESSORIES.map((v) => ({ value: v, label: ACC_NAMES[v] }));
const HAIR_COLOR_OPTS: Opt[] = HAIR_COLORS.map((v, i) => ({ value: v, label: HAIR_COLOR_NAMES[i] ?? { ko: v, en: v }, swatch: v }));
const SKIN_OPTS: Opt[] = SKIN_TONES.map((v, i) => ({ value: v, label: { ko: `피부 톤 ${i + 1}`, en: `Skin tone ${i + 1}` }, swatch: v }));
const CLOTH_OPTS: Opt[] = CLOTH_COLORS.map((v, i) => ({ value: v, label: CLOTH_NAMES[i] ?? { ko: v, en: v }, swatch: v }));

export function WebDollStudio({
  canSaveServer,
  initialLook,
}: {
  canSaveServer: boolean;
  initialLook?: unknown;
}) {
  const [doll, setDoll] = useState<DollLook>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LOOK_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as { v?: unknown; unsynced?: boolean };
          if (stored?.v && (!canSaveServer || stored.unsynced)) {
            const localParsed = cleanLook(stored.v);
            if (localParsed.kind === 'doll') return localParsed.doll;
          }
        }
      } catch {
        // 무시
      }
    }
    const parsed = cleanLook(initialLook);
    return parsed.kind === 'doll' ? parsed.doll : DEFAULT_DOLL;
  });
  const tr = useTr();
  const [spin, setSpin] = useState(true);
  const [status, setStatus] = useState<keyof typeof STATUS>('intro');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const applyDoll = (next: DollLook) => {
    setDoll(next);
    const look = { kind: 'doll' as const, doll: next };
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify({ v: look, unsynced: canSaveServer }));
    } catch {
      // 무시
    }
    emitWalk(WALK_EVENT.lookChanged, { look });
    if (!canSaveServer) {
      setStatus('local');
      return;
    }
    setStatus('saving');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveMyLook(look).then(
        (res) => {
          if (res.ok) {
            try {
              localStorage.setItem(LOOK_KEY, JSON.stringify({ v: look }));
            } catch {
              // 무시
            }
            setStatus('account');
          } else {
            setStatus('deviceFirst');
          }
        },
        () => setStatus('deviceFirst'),
      );
    }, 550);
  };

  const randomize = () => {
    applyDoll({
      hair: pickRandom(HAIR_STYLES),
      hairColor: pickRandom(HAIR_COLORS),
      skin: pickRandom(SKIN_TONES),
      top: pickRandom(CLOTH_COLORS),
      bottom: pickRandom(CLOTH_COLORS),
      acc: pickRandom(ACCESSORIES),
    });
  };

  return (
    <section className={css.studio} aria-labelledby="doll-studio-title">
      <div className={css.head}>
        <div>
          <p className={css.kicker}>3D CHIBI CUSTOMIZER</p>
          <h2 id="doll-studio-title" className={css.title}><T ko="기본 3D 인형 마음대로 꾸미기" en="Dress up the basic 3D doll" /></h2>
        </div>
        <span className="small muted"><T ko="로그인 없이도 누구나 꾸미고 바로 걸을 수 있어요" en="Anyone can dress it up and walk right away, no sign-in needed" /></span>
      </div>

      <div className={css.presets} aria-label={tr('추천 옷차림', 'Suggested outfits')}>
        {PRESETS.map((p) => (
          <button key={p.label.ko} type="button" className={css.presetBtn} onClick={() => applyDoll(p.doll)}>
            <T ko={`추천 · ${p.label.ko}`} en={`Try · ${p.label.en}`} />
          </button>
        ))}
      </div>

      <div className={css.body}>
        <div className={css.stageCard}>
          <SpinningDollCanvas doll={doll} spin={spin} />
          <div className={css.stageTools}>
            <button type="button" className="btn btn-small" onClick={randomize}>
              <T ko="아무거나 조합" en="Random mix" />
            </button>
            <button type="button" className="btn btn-small" aria-pressed={!spin} onClick={() => setSpin((s) => !s)}>
              {spin ? <T ko="회전 멈추기" en="Stop spinning" /> : <T ko="천천히 돌리기" en="Spin slowly" />}
            </button>
          </div>
        </div>

        <div className={css.controls}>
          <OptionRow
            legend={{ ko: '머리 모양', en: 'Hairstyle' }} value={doll.hair} options={HAIR_OPTS} onPick={(v) => applyDoll({ ...doll, hair: v as HairStyle })}
          />
          <OptionRow
            legend={{ ko: '머리색', en: 'Hair color' }} value={doll.hairColor} options={HAIR_COLOR_OPTS} onPick={(v) => applyDoll({ ...doll, hairColor: v })}
          />
          <OptionRow legend={{ ko: '피부 톤', en: 'Skin tone' }} value={doll.skin} options={SKIN_OPTS} onPick={(v) => applyDoll({ ...doll, skin: v })} />
          <OptionRow legend={{ ko: '윗옷 색깔', en: 'Top color' }} value={doll.top} options={CLOTH_OPTS} onPick={(v) => applyDoll({ ...doll, top: v })} />
          <OptionRow
            legend={{ ko: '아랫옷 색깔', en: 'Bottom color' }} value={doll.bottom} options={CLOTH_OPTS} onPick={(v) => applyDoll({ ...doll, bottom: v })}
          />
          <OptionRow
            legend={{ ko: '소품 (안경·모자·목도리)', en: 'Extras (glasses, hat, scarf)' }} value={doll.acc} options={ACC_OPTS}
            onPick={(v) => applyDoll({ ...doll, acc: v as Accessory })}
          />
        </div>
      </div>

      <div className={css.foot}>
        <span className={css.savedMsg} role="status"><T ko={STATUS[status].ko} en={STATUS[status].en} /></span>
        <Link className="btn btn-roof" href="/walk">
          <T ko="이 캐릭터로 집 안 걷기 →" en="Walk the house as this character →" />
        </Link>
      </div>
    </section>
  );
}
