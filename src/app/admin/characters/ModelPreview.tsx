'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import * as THREE from 'three';
import css from './characters.module.css';
import { STAGE_FOV, START_YAW, frameModel, lightStage, stageMaterial } from './stage';

// 캐릭터 관리 콘솔의 「3D 보기」: 한 카드 안의 작은 three.js 화면. 한 번에 하나만 연다(콘솔이 정한다).
// 모형은 걷기 엔진과 같은 길(fetchModel → parseModel)로 읽어 걷기에서 보이는 모양 그대로 세운다(발바닥 원점, 키 맞춤).
// 빛, 처음 각도, 사진기 자리는 3D 모형 보기의 정지 사진과 같다(stage.ts).
// 끌거나 좌우 화살표로 돌려 본다. 줄인 움직임이 아니면 천천히 저절로 돈다(끌면 멈춘다). 닫으면 그림 문맥까지 놓는다.
// 주소는 관리자용 모형 읽기(/api/admin/characters/<id>/model?v=<판>)라 판이 바뀌면 새로 받는다.
// 필요할 때만 그린다(발표 중 휴대폰의 배터리와 목록 스크롤): 저절로 도는 동안만 매 프레임 그리고, 멈춘 뒤에는 끌거나 화살표를
// 누르거나 크기가 바뀌거나 모형이 왔을 때 한 번씩만. 무대가 화면 밖이면 돌기도 쉰다. 모형이 없거나 못 불러오면 빈 무대를 한 번만 그린다.
// 무대 위에서 위아래로 밀면 페이지가 스크롤된다(touch-action: pan-y). 돌리기는 좌우 끌기만 쓴다.

type State = 'loading' | 'ready' | 'missing' | 'error';
const WORDS: Record<State, string> = {
  loading: '3D를 불러오는 중이에요',
  ready: '좌우로 끌거나 좌우 화살표로 돌려 보세요',
  missing: '지금 보일 3D가 없어요(지웠거나 아직 만드는 중이에요)',
  error: '3D를 불러오지 못했어요',
};
/** 화살표 한 번에 도는 각(rad)과 저절로 도는 빠르기(rad/초) */
const STEP = 0.35;
const SPIN = 0.6;
/** 이만큼(px) 좌우로 움직여야 끌기로 본다(세로로 스크롤하려고 댄 손가락이 돌기를 멈추지 않게) */
const DRAG_START_PX = 6;

export default function ModelPreview({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const yaw = useRef(START_YAW);
  const spin = useRef(true);
  /** 한 프레임을 그려 달라고 한다(이미 걸려 있으면 그대로). 무대를 만든 뒤에 채워진다 */
  const kick = useRef<() => void>(() => {});
  const [state, setState] = useState<State>('loading');
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    let alive = true;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (still) {
      spin.current = false;
      queueMicrotask(() => alive && setSpinning(false));
    }
    // 캔버스는 여기서 만들고 닫을 때 뗀다(다시 열 때 잃은 문맥을 물려받지 않게)
    const canvas = document.createElement('canvas');
    canvas.className = css.previewCanvas;
    box.appendChild(canvas);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      canvas.remove();
      queueMicrotask(() => alive && setState('error'));
      return;
    }
    const size = () => ({ w: Math.max(1, box.clientWidth), h: Math.max(1, box.clientHeight) });
    let { w, h } = size();
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    lightStage(scene);
    const cam = new THREE.PerspectiveCamera(STAGE_FOV, w / h, 0.05, 20);
    const holder = new THREE.Group();
    scene.add(holder);
    let mesh: THREE.Mesh | null = null;
    let free: (() => void) | null = null;
    // 모형이 오기 전에는 보통 키에 맞춰 둔다(모형은 발바닥이 원점이고 걷기 엔진의 키로 맞춰져 있다)
    frameModel(cam, null);

    // 필요할 때만 그린다: kick이 한 프레임을 걸고, 저절로 도는 중(모형이 있고 무대가 보일 때)에만 다음 프레임을 잇는다
    let raf = 0;
    let last = 0;
    let visible = true;
    const draw = (now: number) => {
      raf = 0;
      const turning = spin.current && mesh !== null && visible;
      const dt = turning && last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = turning ? now : 0;
      if (turning) yaw.current += SPIN * dt;
      holder.rotation.y = yaw.current;
      renderer.render(scene, cam);
      if (turning) raf = requestAnimationFrame(draw);
    };
    const request = () => {
      if (!raf && visible && alive) raf = requestAnimationFrame(draw);
    };
    kick.current = request;
    request();

    // 크기가 바뀔 때만 다시 맞춘다(매 프레임 재지 않는다)
    const resize = () => {
      const next = size();
      if (next.w === w && next.h === h) return;
      ({ w, h } = next);
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      request();
    };
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    sizes?.observe(box);
    if (!sizes) window.addEventListener('resize', resize);
    // 무대가 화면 밖으로 나가면(목록을 멀리 스크롤) 돌기도 쉰다. 돌아오면 이어서
    const seen = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (!visible && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
          last = 0;
        }
        if (visible) request();
      })
      : null;
    seen?.observe(box);

    import('@/walk/avatar')
      .then(async ({ fetchModel, freeModel }) => {
        const data = await fetchModel(src, 1024);
        if (!alive) {
          if (data && data !== 'none') freeModel(data);
          return;
        }
        if (!data || data === 'none') {
          setState('missing');
          return;
        }
        const mat = stageMaterial(data.texture);
        mesh = new THREE.Mesh(data.geometry, mat);
        holder.add(mesh);
        data.geometry.computeBoundingBox();
        // 키 전체가 보이고 돌려도 옆이 잘리지 않게
        frameModel(cam, data.geometry.boundingBox);
        free = () => {
          mat.dispose();
          freeModel(data);
        };
        setState('ready');
        request();
      })
      .catch(() => {
        if (alive) setState('error');
      });

    return () => {
      alive = false;
      kick.current = () => {};
      if (raf) cancelAnimationFrame(raf);
      sizes?.disconnect();
      if (!sizes) window.removeEventListener('resize', resize);
      seen?.disconnect();
      if (mesh) holder.remove(mesh);
      free?.();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [src]);

  // 좌우로 끌어서 돌리기(손가락·마우스). 좌우로 조금 움직인 뒤에야 끌기로 보고 저절로 돌기를 멈춘다
  const drag = useRef<{ x: number; yaw: number; id: number; moved: boolean } | null>(null);
  const stopSpin = () => {
    spin.current = false;
    setSpinning(false);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, yaw: yaw.current, id: e.pointerId, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      d.moved = true;
      stopSpin();
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    yaw.current = d.yaw + (dx / Math.max(1, e.currentTarget.clientWidth)) * Math.PI * 2;
    kick.current();
  };
  // 손을 떼거나, 세로 스크롤이 시작돼 브라우저가 끌기를 거둬 가면(pointercancel) 끝
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      stopSpin();
      yaw.current += e.key === 'ArrowLeft' ? -STEP : STEP;
      kick.current();
    }
    // 닫기 단추는 카드의 「3D 닫기」 하나다. 3D 화면에 초점이 있으면 Esc로도 닫는다(카드가 초점을 「3D 보기」로 돌린다)
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className={css.preview}>
      <div
        ref={host}
        className={css.stage}
        role="img"
        aria-label={`${label}의 3D. ${WORDS[state]}`}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      />
      <p className={css.previewNote} aria-live="polite">{WORDS[state]}</p>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-small"
          aria-pressed={spinning}
          onClick={() => {
            spin.current = !spin.current;
            setSpinning(spin.current);
            kick.current();
          }}
        >
          {spinning ? '돌기 멈추기' : '천천히 돌리기'}
        </button>
      </div>
    </div>
  );
}
