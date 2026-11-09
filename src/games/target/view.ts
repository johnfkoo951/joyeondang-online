// 종이공 과녁 장면: 렌더러·카메라·빛, 판의 상태(logic)를 그대로 따라 그리는 과녁과 종이공, 맞힐 때의 손맛.
// 그림만 맡는다. 점수·판정은 logic.ts가 하고 여기서는 읽기만 한다.
import * as THREE from 'three';
import { CAN, EYE, ROOM, SHELF, fitFov, type GameEvent, type Ray, type Round, type Target, type Vec3 } from './logic';
import { createConfetti } from './fx';
import type { Palette } from './palette';
import { balloonGeometry, ballGeometry, boardTexture, canGeometry, duckGeometry } from './props';
import { buildRoom, type Bin } from './room';

type Opts = { palette: Palette; reducedMotion: boolean; coarse: boolean };

export type View = {
  canvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  /** 그림 칸 안의 화면 자리(px)에서 쏜 광선 */
  ray(x: number, y: number): Ray;
  /** 장면 자리 → 그림 칸 안의 화면 자리(px) */
  project(p: Vec3): { x: number; y: number };
  /** 던질 공이 보이는 손 자리(화면 오른쪽 아래) */
  hand(): Vec3;
  /** 새 판: 과녁 그림을 다시 놓는다 */
  reset(s: Round): void;
  events(s: Round, ev: GameEvent[]): void;
  frame(s: Round, dt: number, ready: boolean): void;
  dispose(): void;
};

type Sprite = {
  obj: THREE.Object3D;
  kind: Target['kind'];
  t: number;
  /** 오리 넘어짐 각도, 판 흔들림, 깡통 날아감 */
  angle: number;
  wobble: number;
  fly: { v: THREE.Vector3; w: THREE.Vector3; rest: boolean } | null;
  home: THREE.Vector3;
};

export function createView(host: HTMLElement, opt: Opts): View {
  const p = opt.palette;
  const renderer = new THREE.WebGLRenderer({ antialias: !opt.coarse, powerPreference: 'default', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opt.coarse ? 1.5 : 2));
  renderer.setClearColor(p.dark ? '#1d1b19' : '#f6f1e7');
  const canvas = renderer.domElement;
  host.appendChild(canvas);

  const bin: Bin = new Set();
  const keep = <T extends { dispose(): void }>(x: T) => (bin.add(x), x);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 30);
  camera.position.set(EYE.x, EYE.y, EYE.z);
  const look = new THREE.Vector3(0, 1.3, ROOM.wallZ);
  camera.lookAt(look);

  scene.add(new THREE.HemisphereLight('#fffaf0', '#c9b294', p.dark ? 0.8 : 1.7));
  const sun = new THREE.DirectionalLight(p.dark ? '#ffd6a0' : '#fff2dc', p.dark ? 0.7 : 1.5);
  sun.position.set(-1.5, 3.5, 4);
  scene.add(sun);
  if (p.dark) {
    const lamp = new THREE.PointLight('#ffc77a', 2.2, 7, 1.4);
    lamp.position.set(0, ROOM.ceil - 0.3, -1.6);
    scene.add(lamp);
  }
  scene.add(buildRoom(p, bin, opt.coarse));

  const vc = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const vcFlat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const geo = {
    duck: keep(duckGeometry(p)),
    balloon: keep(balloonGeometry([p.roof, p.lamp, p.focus, p.season, p.pine, p.paper])),
    gold: keep(balloonGeometry([p.lamp, '#f7dc8a'])),
    ball: keep(ballGeometry()),
    face: keep(new THREE.CircleGeometry(1, 40)),
    rim: keep(new THREE.CylinderGeometry(1.05, 1.05, 0.05, 40)),
    rail: keep(new THREE.BoxGeometry(1, 0.035, 0.02)),
    cans: [p.roof, p.focus, p.pine, p.lamp, p.season, p.roof].map((c) => keep(canGeometry(c, p))),
  };
  const faceMat = keep(new THREE.MeshLambertMaterial({ map: keep(boardTexture(p)) }));
  const rimMat = keep(new THREE.MeshLambertMaterial({ color: p.oak }));
  const ballMat = keep(new THREE.MeshLambertMaterial({ color: p.ballPaper, flatShading: true }));
  const confetti = createConfetti(opt.reducedMotion);
  scene.add(confetti.mesh);

  const props = new THREE.Group();
  scene.add(props);
  const sprites = new Map<number, Sprite>();
  const balls = new Map<number, THREE.Mesh>();
  const ready = new THREE.Mesh(geo.ball, ballMat);
  scene.add(ready);
  let readyPop = 1;
  let w = 1;
  let h = 1;
  const tmp = new THREE.Vector3();
  const caster = new THREE.Raycaster();

  function spriteFor(tg: Target, s: Round): Sprite {
    let obj: THREE.Object3D;
    if (tg.kind === 'board') {
      const g = new THREE.Group();
      const face = new THREE.Mesh(geo.face, faceMat);
      face.position.z = 0.026;
      const rim = new THREE.Mesh(geo.rim, rimMat);
      rim.rotation.x = Math.PI / 2;
      g.add(rim, face);
      g.scale.setScalar(tg.r);
      obj = g;
    } else if (tg.kind === 'duck') {
      obj = new THREE.Mesh(geo.duck, vc);
      obj.scale.setScalar(tg.r / 0.15);
    } else if (tg.kind === 'can') {
      const i = s.targets.filter((t) => t.kind === 'can').indexOf(tg);
      obj = new THREE.Mesh(geo.cans[Math.max(0, i) % geo.cans.length], vc);
    } else {
      obj = new THREE.Mesh(tg.gold ? geo.gold : geo.balloon, vcFlat);
      obj.scale.setScalar(0.001);
    }
    const home = tg.kind === 'duck' ? new THREE.Vector3(tg.x, SHELF.y, tg.z) : new THREE.Vector3(tg.x, tg.y, tg.z);
    obj.position.copy(home);
    props.add(obj);
    const sp: Sprite = { obj, kind: tg.kind, t: 0, angle: 0, wobble: 0, fly: null, home };
    sprites.set(tg.id, sp);
    return sp;
  }

  function drop(id: number) {
    const sp = sprites.get(id);
    if (!sp) return;
    props.remove(sp.obj);
    sprites.delete(id);
  }

  let rail: THREE.Mesh | null = null;
  function reset(s: Round) {
    for (const id of [...sprites.keys()]) drop(id);
    for (const m of balls.values()) scene.remove(m);
    balls.clear();
    confetti.clear();
    if (rail) props.remove(rail);
    rail = null;
    for (const tg of s.targets) {
      spriteFor(tg, s);
      if (tg.slide > 0) {
        rail = new THREE.Mesh(geo.rail, rimMat);
        rail.scale.x = (tg.slide + tg.r) * 2;
        rail.position.set(tg.baseX, tg.y, ROOM.wallZ + 0.012);
        props.add(rail);
      }
    }
  }

  const bits = { board: [p.paper, p.ballPaper, p.lamp], duck: [p.duck, p.paper], can: [p.paper, '#c9c6bf', p.ballPaper] };
  function events(s: Round, ev: GameEvent[]) {
    for (const e of ev) {
      if (e.t === 'spawn') {
        const tg = s.targets.find((t) => t.id === e.target);
        if (tg) spriteFor(tg, s);
      } else if (e.t === 'gone') drop(e.target);
      else if (e.t === 'hit') {
        const sp = sprites.get(e.target);
        if (e.kind === 'balloon') {
          const colors = e.gold ? [p.lamp, '#f7dc8a', p.paper] : [p.roof, p.lamp, p.focus, p.season, p.pine, p.paper];
          confetti.burst(e.at, colors, e.gold ? 40 : 28, 1);
          drop(e.target);
        } else {
          confetti.burst(e.at, bits[e.kind], 9, 0.55);
          if (sp && e.kind === 'board' && !opt.reducedMotion) sp.wobble = 1;
        }
      } else if (e.t === 'fall') {
        const sp = sprites.get(e.target);
        if (sp && sp.kind === 'can') {
          const side = (Math.random() - 0.5) * 1.6;
          sp.fly = {
            v: new THREE.Vector3(side, 1.2 + Math.random() * 0.8, -0.2 - Math.random() * 0.5),
            w: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 9),
            rest: false,
          };
        }
      } else if (e.t === 'reset') {
        const sp = sprites.get(e.target);
        if (sp) {
          sp.fly = null;
          sp.obj.position.copy(sp.home);
          sp.obj.rotation.set(0, 0, 0);
          sp.t = 0;
        }
      }
    }
  }

  const GROW = 0.28;
  function frame(s: Round, dt: number, isReady: boolean) {
    const byId = new Map(s.targets.map((t) => [t.id, t] as const));
    for (const [id, sp] of sprites) {
      const tg = byId.get(id);
      sp.t += dt;
      const o = sp.obj;
      if (sp.kind === 'balloon' && tg) {
        o.position.set(tg.x, tg.y, tg.z);
        o.rotation.y += dt * 0.7;
        o.scale.setScalar(tg.r * Math.min(1, sp.t / GROW));
      } else if (sp.kind === 'board' && tg) {
        o.position.x = tg.x;
        if (sp.wobble > 0) {
          sp.wobble = Math.max(0, sp.wobble - dt * 1.8);
          o.rotation.x = 0.16 * sp.wobble * Math.sin((1 - sp.wobble) * 26);
        } else o.rotation.x = 0;
      } else if (sp.kind === 'duck' && tg) {
        const want = tg.down ? -Math.PI / 2 : 0;
        sp.angle += (want - sp.angle) * (1 - Math.exp(-dt * (tg.down ? 16 : 9)));
        o.rotation.x = sp.angle;
      } else if (sp.kind === 'can') {
        if (sp.fly && !sp.fly.rest) {
          const f = sp.fly;
          f.v.y -= 9.8 * dt;
          o.position.addScaledVector(f.v, dt);
          o.rotation.x += f.w.x * dt;
          o.rotation.y += f.w.y * dt;
          o.rotation.z += f.w.z * dt;
          if (o.position.y < CAN.r) {
            o.position.y = CAN.r;
            f.v.multiplyScalar(0.35);
            f.v.y = Math.abs(f.v.y) * 0.4;
            f.w.multiplyScalar(0.4);
            if (f.v.length() < 0.25) {
              f.rest = true;
              o.rotation.set(0, o.rotation.y, Math.PI / 2);
            }
          }
          o.position.z = Math.max(ROOM.wallZ + CAN.r, o.position.z);
        } else if (!sp.fly) {
          o.scale.setScalar(Math.min(1, 0.4 + sp.t / GROW));
        }
      }
    }
    const seen = new Set<number>();
    for (const b of s.balls) {
      seen.add(b.id);
      let m = balls.get(b.id);
      if (!m) {
        m = new THREE.Mesh(geo.ball, ballMat);
        balls.set(b.id, m);
        scene.add(m);
      }
      m.position.set(b.x, b.y, b.z);
      if (b.state !== 'rest') {
        m.rotation.x -= dt * (b.state === 'fly' ? 14 : 5);
        m.rotation.z += dt * 3;
      }
    }
    for (const [id, m] of balls) {
      if (seen.has(id)) continue;
      scene.remove(m);
      balls.delete(id);
    }
    readyPop = isReady ? Math.min(1, readyPop + dt / 0.16) : 0;
    ready.visible = readyPop > 0;
    ready.position.copy(hand());
    ready.scale.setScalar(0.8 * (opt.reducedMotion ? 1 : 0.4 + 0.6 * readyPop));
    ready.rotation.y += dt * 0.8;
    confetti.update(dt);
    renderer.render(scene, camera);
  }

  function hand(): Vec3 {
    tmp.set(0.62, -0.72, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(1.1).add(camera.position);
    return { x: tmp.x, y: tmp.y, z: tmp.z };
  }

  return {
    canvas,
    resize(nw, nh) {
      w = Math.max(1, nw);
      h = Math.max(1, nh);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = fitFov(camera.aspect);
      camera.updateProjectionMatrix();
      camera.lookAt(look);
    },
    ray(x, y) {
      caster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera);
      const { origin: o, direction: d } = caster.ray;
      return { o: { x: o.x, y: o.y, z: o.z }, d: { x: d.x, y: d.y, z: d.z } };
    },
    project(pt) {
      tmp.set(pt.x, pt.y, pt.z).project(camera);
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h };
    },
    hand,
    reset,
    events,
    frame,
    dispose() {
      confetti.dispose();
      for (const x of bin) x.dispose();
      bin.clear();
      sprites.clear();
      balls.clear();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
