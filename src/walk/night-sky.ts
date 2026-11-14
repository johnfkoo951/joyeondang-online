import * as THREE from 'three';
// @ts-expect-error Direct Node TypeScript tests require an explicit extension.
import { MILKY_WAY_AXIS, meteorAt, starField, type SkyLook } from './sky.ts';

// 밤하늘: 하늘 구(밤 그러데이션과 은하수), 별(점), 가끔 떨어지는 별똥별.
// 별은 픽셀 크기로 찍는 점이라 화면이 아무리 촘촘해도 한 픽셀보다 작아져 깜빡이지 않는다.
// 걷기 화면은 움직임이 없으면 0.5초에 한 장만 그린다: 별의 반짝임은 그 사이 천천히 바뀌고,
// 별똥별이 떨어지는 1초 남짓만 매 프레임 그리게 한다(update가 참을 돌려준다).

/** 별과 별똥별을 거는 구의 반지름(m). 하늘 구(4800) 안쪽, 산줄기 바깥이라 산이 별을 가린다 */
const STAR_R = 4600;

export type NightSky = {
  group: THREE.Group;
  /**
   * 프레임마다 부른다. pixelRatio는 지금 그리기 배율(창 크기와 화질 조절로 바뀐다, 별 크기를 맞춘다).
   * 별똥별이 화면 안에 보이는 동안만 참(그동안은 매 프레임 그려야 한다). 집 안이거나 화면 밖이면 거짓
   */
  update: (now: number, camera: THREE.Camera, pixelRatio: number, outdoors: boolean) => boolean;
  dispose: () => void;
};

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 은하수 구름은 방향(3차원)으로 고른 잡음이라 띠를 따라 이음매가 없다. 띠 밖 픽셀은 잡음을 계산하지 않는다
const DOME_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uBand; uniform vec3 uAxis;
  float h3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { return n3(p) * 0.55 + n3(p * 2.03) * 0.3 + n3(p * 4.11) * 0.15; }
  void main() {
    vec3 d = normalize(vDir);
    float alt = d.y;
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.55, alt));
    // 지평선 위의 옅은 빛(먼 마을 불빛이 하늘에 비친 것)
    col += uGlow * exp(-max(alt, 0.0) * 9.0) * smoothstep(-0.14, 0.02, alt);
    float off = dot(d, uAxis);
    float band = exp(-off * off / 0.04);
    if (band > 0.01) {
      float cloud = fbm3(d * 5.0 + 3.1);
      // 띠 한가운데를 따라 어두운 먼지 줄, 가운데가 조금 더 밝은 빛 무리
      float dust = smoothstep(0.46, 0.72, fbm3(d * 11.0 + 7.7)) * exp(-off * off / 0.004);
      float core = exp(-off * off / 0.008) * smoothstep(0.35, 0.8, cloud);
      col += uBand * (band * (0.25 + 0.75 * cloud) + 0.5 * core) * (1.0 - 0.65 * dust) * smoothstep(-0.02, 0.22, alt) * 0.55;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize; attribute vec3 aColor; attribute float aPhase;
  uniform float uTime; uniform float uScale; uniform float uTwinkle;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float rate = 0.6 + fract(aPhase * 3.7) * 1.4;
    float twinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * rate + aPhase));
    // 지평선 가까운 별은 공기에 묻혀 흐리다
    vAlpha = twinkle * smoothstep(-0.02, 0.14, normalize(position).y);
    vColor = aColor;
    gl_PointSize = aSize * uScale;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // 가장자리 값이 거꾸로 된 smoothstep은 GLSL에서 정의되지 않는다(기기마다 다를 수 있다): 뒤집어 쓴다
    float a = 1.0 - smoothstep(0.05, 0.5, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
  }
`;

const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), h: new THREE.Vector3(), t: new THREE.Vector3(), cam: new THREE.Vector3(), side: new THREE.Vector3(), w: new THREE.Vector3() };
const view = { m: new THREE.Matrix4(), f: new THREE.Frustum() };

export function buildNightSky(cx: number, cz: number, look: SkyLook, opts: { lite: boolean; still: boolean; pixelRatio: number }): NightSky {
  const group = new THREE.Group();
  group.name = 'night-sky';
  group.position.set(cx, 0, cz);
  const own: Array<{ dispose: () => void }> = [];

  // 하늘 구
  const domeGeo = new THREE.SphereGeometry(4800, 32, 20);
  const domeMat = new THREE.ShaderMaterial({
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    uniforms: {
      uZenith: { value: new THREE.Color(look.dome.zenith) },
      uHorizon: { value: new THREE.Color(look.dome.horizon) },
      uGlow: { value: new THREE.Color(look.dome.glow) },
      uBand: { value: new THREE.Color(look.dome.band) },
      uAxis: { value: new THREE.Vector3(...MILKY_WAY_AXIS) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'night-dome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);
  own.push(domeGeo, domeMat);

  // 별
  const stars = starField(opts.lite ? 2600 : 4200);
  const pos = new Float32Array(stars.length * 3), col = new Float32Array(stars.length * 3);
  const size = new Float32Array(stars.length), phase = new Float32Array(stars.length);
  const cool = new THREE.Color('#c7d6ff'), white = new THREE.Color('#ffffff'), warm = new THREE.Color('#ffe2b8'), c = new THREE.Color();
  stars.forEach((s, i) => {
    pos[i * 3] = s.x * STAR_R; pos[i * 3 + 1] = s.y * STAR_R; pos[i * 3 + 2] = s.z * STAR_R;
    c.copy(s.warm < 0.5 ? cool : white).lerp(s.warm < 0.5 ? white : warm, s.warm < 0.5 ? s.warm * 2 : (s.warm - 0.5) * 2);
    const b = 0.42 + 0.58 * s.mag;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    // 가장 밝은 몇 개만 크게(1.2~4.4픽셀)
    size[i] = 1.2 + s.mag * 3.2;
    phase[i] = s.phase;
  });
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: { uTime: { value: 0 }, uScale: { value: opts.pixelRatio }, uTwinkle: { value: opts.still ? 0 : 0.38 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(starGeo, starMat);
  points.name = 'night-stars';
  points.renderOrder = -9;
  points.frustumCulled = false;
  group.add(points);
  own.push(starGeo, starMat);

  // 별똥별: 머리는 밝고 꼬리로 갈수록 사라지는 가는 띠 하나를 카메라 쪽으로 세워 그린다
  const mPos = new Float32Array(4 * 3), mCol = new Float32Array(4 * 3);
  const meteorGeo = new THREE.BufferGeometry();
  meteorGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  meteorGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  meteorGeo.setIndex([0, 1, 2, 2, 1, 3]);
  const meteorMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  const meteor = new THREE.Mesh(meteorGeo, meteorMat);
  meteor.name = 'night-meteor';
  meteor.visible = false;
  meteor.frustumCulled = false;
  meteor.renderOrder = -8;
  group.add(meteor);
  own.push(meteorGeo, meteorMat);

  const t0 = performance.now();
  /** 지난 프레임에 별똥별이 화면 안에 있었는가(사라지는 프레임을 한 번 더 그리려고) */
  let shown = false;
  const update = (now: number, camera: THREE.Camera, pixelRatio: number, outdoors: boolean) => {
    const t = (now - t0) / 1000;
    starMat.uniforms.uTime.value = t;
    starMat.uniforms.uScale.value = pixelRatio;
    if (opts.still) return false;
    const m = meteorAt(t);
    if (!m) {
      meteor.visible = false;
      const redraw = shown;
      shown = false;
      return redraw;
    }
    const head = Math.min(1, m.p * 1.15), tailP = Math.max(0, head - m.tail);
    tmp.a.fromArray(m.from); tmp.b.fromArray(m.to);
    tmp.h.copy(tmp.a).lerp(tmp.b, head).normalize().multiplyScalar(STAR_R * 0.98);
    tmp.t.copy(tmp.a).lerp(tmp.b, tailP).normalize().multiplyScalar(STAR_R * 0.98);
    tmp.cam.setFromMatrixPosition(camera.matrixWorld).sub(group.position);
    tmp.side.copy(tmp.h).sub(tmp.t).cross(tmp.cam.sub(tmp.h)).normalize();
    const wHead = STAR_R * 0.0016, wTail = STAR_R * 0.0004;
    const put = (i: number, p: THREE.Vector3, w: number, sign: number) => {
      mPos[i * 3] = p.x + tmp.side.x * w * sign; mPos[i * 3 + 1] = p.y + tmp.side.y * w * sign; mPos[i * 3 + 2] = p.z + tmp.side.z * w * sign;
    };
    put(0, tmp.t, wTail, 1); put(1, tmp.t, wTail, -1); put(2, tmp.h, wHead, 1); put(3, tmp.h, wHead, -1);
    // 처음과 끝은 부드럽게 켜지고 꺼진다
    const fade = Math.min(1, m.p / 0.12) * Math.min(1, (1 - m.p) / 0.25);
    for (const i of [2, 3]) { mCol[i * 3] = 1.0 * fade; mCol[i * 3 + 1] = 0.95 * fade; mCol[i * 3 + 2] = 0.85 * fade; }
    for (const i of [0, 1]) { mCol[i * 3] = 0; mCol[i * 3 + 1] = 0; mCol[i * 3 + 2] = 0; }
    (meteorGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (meteorGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    meteor.visible = true;
    // 매 프레임 그리는 것은 별똥별이 실제로 보일 때만: 바깥에서, 머리나 꼬리가 화면 안에 있을 때(그 밖엔 쉬는 그리기에 맡긴다)
    let inView = false;
    if (outdoors) {
      view.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      view.f.setFromProjectionMatrix(view.m);
      inView = view.f.containsPoint(tmp.w.copy(tmp.h).add(group.position)) || view.f.containsPoint(tmp.w.copy(tmp.t).add(group.position));
    }
    const redraw = inView || shown;
    shown = inView;
    return redraw;
  };

  let disposed = false;
  return {
    group,
    update,
    dispose: () => { if (disposed) return; disposed = true; group.removeFromParent(); own.forEach((o) => o.dispose()); },
  };
}
