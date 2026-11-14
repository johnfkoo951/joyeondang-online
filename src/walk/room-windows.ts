// 각 방의 창문 너머로 펼쳐지는 고유한 세계(디오라마 + 360도 곡면 하늘 돔).
// 사진 사각형 모서리나 잘림이 보이지 않도록 반구형 그라데이션 스카이돔 안에 입체 지형·오브제를 층별로 배치한다.
// 모든 재질은 실내 그림자 맵과 무관하게 자체 색감(MeshBasicMaterial)으로 그려 창밖이 늘 맑고 선명하게 빛난다.
import * as THREE from 'three';
import type { HouseWorld } from './types';

export type RoomVista = {
  group: THREE.Group;
  skyTop: string;
  skyHorizon: string;
  dispose: () => void;
};

type Palette = {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  ground: string;
  ridgeNear: string;
  ridgeFar: string;
  accentA: string;
  accentB: string;
  glow: string;
};


export type RoomShellSpec = {
  wallKind: 'brick' | 'plaster' | 'hanji';
  wallColor: string;
  wainscotColor: string;
  wainscotStroke: string;
  capRailColor: string;
  frameColor: string;
  ceilingColor: string;
  lampColor: string;
  lampIntensity: number;
  epoxyFloor?: [string, string];
};

export const ROOM_SHELLS: Record<string, RoomShellSpec> = {
  // 생각 지도 방: CMDS 딥그린 박물관 갤러리 월 + 먹빛 옻칠 하단 + 브러시드 실버 몰딩
  mind: {
    wallKind: 'plaster',
    wallColor: '#1a3830',
    wainscotColor: '#191e1d',
    wainscotStroke: '#2d3835',
    capRailColor: '#b8c0c8',
    frameColor: '#252b29',
    ceilingColor: '#1f2624',
    lampColor: '#fff0d4',
    lampIntensity: 10.5,
  },
  // 작업 차고: 빈티지 노출 적벽돌(Eagle 005 감성) + 다크 월넛/스틸 트림 + 다크 차콜 에폭시 바닥
  garage: {
    wallKind: 'brick',
    wallColor: '#9e5d47',
    wainscotColor: '#2c231d',
    wainscotStroke: '#1b1511',
    capRailColor: '#22262b',
    frameColor: '#1d2126',
    ceilingColor: '#282c32',
    lampColor: '#fff5e4',
    lampIntensity: 11.5,
    epoxyFloor: ['#343942', '#4c5360'],
  },
  // 재즈가 흐르는 방: 미드나잇 인디고 클럽 월 + 따뜻한 어쿠스틱 월넛 하단 + 앰버 무대광
  gable: {
    wallKind: 'plaster',
    wallColor: '#242942',
    wainscotColor: '#5c3b26',
    wainscotStroke: '#3d2516',
    capRailColor: '#8c5e3c',
    frameColor: '#36261b',
    ceilingColor: '#2a221d',
    lampColor: '#ffd89e',
    lampIntensity: 10.0,
  },
  // 빛이 드는 방: 따뜻한 한지 회벽 + 고려청자 비색(세이지) 하단·창틀
  study: {
    wallKind: 'hanji',
    wallColor: '#f6f1e5',
    wainscotColor: '#e5dbc6',
    wainscotStroke: '#cfc0a5',
    capRailColor: '#b3a180',
    frameColor: '#594435',
    ceilingColor: '#f7f2e6',
    lampColor: '#ffecd0',
    lampIntensity: 9.5,
  },
  // 종이공 과녁 방: 쾌청한 알파인 스카이 회벽 + 네이비 & 메이플 트림
  target: {
    wallKind: 'plaster',
    wallColor: '#eef3f8',
    wainscotColor: '#2f4b70',
    wainscotStroke: '#1e334f',
    capRailColor: '#d9a426',
    frameColor: '#2b4263',
    ceilingColor: '#f5f7fa',
    lampColor: '#fff2d9',
    lampIntensity: 9.5,
  },
  // 좋아하는 것 & 소드 콘티넌트 방: 도화지 크림 월 + 코랄·골드 포인트 트림
  toybox: {
    wallKind: 'plaster',
    wallColor: '#fff9ee',
    wainscotColor: '#d97898',
    wainscotStroke: '#b55676',
    capRailColor: '#e8b339',
    frameColor: '#5e493a',
    ceilingColor: '#fffaf0',
    lampColor: '#ffefd2',
    lampIntensity: 9.5,
  },
  // 손님방: 차분한 리넨 베이지 + 원목 몰딩
  guest: {
    wallKind: 'hanji',
    wallColor: '#f3ede1',
    wainscotColor: '#7a593e',
    wainscotStroke: '#593f2b',
    capRailColor: '#694b33',
    frameColor: '#59402c',
    ceilingColor: '#f4eee2',
    lampColor: '#ffe6be',
    lampIntensity: 9.0,
  },
};

export const ROOM_VISTA_THEMES: Record<string, Palette> = {
  // 생각 지도 방: 밤하늘에서 새벽으로 이어지는 지식 별자리와 수묵 능선
  mind: {
    skyTop: '#0f2430',
    skyMid: '#19453c',
    skyHorizon: '#e9a896',
    ground: '#162826',
    ridgeNear: '#1d3b35',
    ridgeFar: '#2e5750',
    accentA: '#f5cf76',
    accentB: '#e985a2',
    glow: '#fff3c4',
  },
  // 작업 차고: 새벽 알파인 능선 도로와 저궤도 위성 궤적
  garage: {
    skyTop: '#152238',
    skyMid: '#35557a',
    skyHorizon: '#f2a86b',
    ground: '#8c5338',
    ridgeNear: '#a85c3a',
    ridgeFar: '#78483c',
    accentA: '#8ce0ff',
    accentB: '#ffc266',
    glow: '#e6f7ff',
  },
  // 재즈가 흐르는 방: 미드나잇 하버 스카이라인과 빛의 리본
  gable: {
    skyTop: '#121329',
    skyMid: '#272c54',
    skyHorizon: '#d97a6c',
    ground: '#161a30',
    ridgeNear: '#212747',
    ridgeFar: '#373f6e',
    accentA: '#f5c45a',
    accentB: '#e985a2',
    glow: '#7aa6f7',
  },
  // 빛이 드는 방: 고려청자 비색 안개 언덕과 따뜻한 오후 햇살
  study: {
    skyTop: '#7ea89f',
    skyMid: '#cfe0d8',
    skyHorizon: '#f7cfa4',
    ground: '#9ab39f',
    ridgeNear: '#6f9486',
    ridgeFar: '#98b8ac',
    accentA: '#fff0cc',
    accentB: '#d98a6c',
    glow: '#fff7e0',
  },
  // 종이공 과녁 방: 반석 같은 큰 바위산 봉우리와 쾌청한 하늘 열기구
  target: {
    skyTop: '#3f82d1',
    skyMid: '#8bc1f2',
    skyHorizon: '#fff1cf',
    ground: '#6ea864',
    ridgeNear: '#58875a',
    ridgeFar: '#849fb5',
    accentA: '#ff7a59',
    accentB: '#ffd24c',
    glow: '#ffffff',
  },
  // 좋아하는 것 방: 파스텔 노을 바닷가 조개섬과 반짝이는 조약돌 언덕
  toybox: {
    skyTop: '#6ec3d4',
    skyMid: '#f4bfd1',
    skyHorizon: '#ffe7b3',
    ground: '#52b2c2',
    ridgeNear: '#e8b98a',
    ridgeFar: '#9ad4de',
    accentA: '#fff5fa',
    accentB: '#ff9ebb',
    glow: '#fff7c2',
  },
  // 손님방: 고요한 달빛 소나무 정원과 돌등 불빛
  guest: {
    skyTop: '#1d2d3a',
    skyMid: '#3d5958',
    skyHorizon: '#e6cfa8',
    ground: '#263832',
    ridgeNear: '#2f473f',
    ridgeFar: '#4c6960',
    accentA: '#ffd894',
    accentB: '#a8ccb8',
    glow: '#ffeac2',
  },
};

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeDomeTexture(pal: Palette): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0.0, pal.skyTop);
  grad.addColorStop(0.36, pal.skyMid);
  grad.addColorStop(0.54, pal.skyHorizon);
  grad.addColorStop(0.62, pal.ground);
  grad.addColorStop(1.0, pal.ground);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 창문이 낸 바깥 방향 단위벡터들의 중심 방향(주요 전망 방향) */
function primaryOutwardDir(world: HouseWorld): { dx: number; dz: number; yaw: number } {
  const wins = world.windows;
  if (!wins.length) return { dx: 0, dz: -1, yaw: 0 };
  let sx = 0, sz = 0;
  for (const w of wins) {
    const span = Math.max(0.4, Math.abs(w.to - w.from));
    if (w.axis === 'x') {
      sz += (w.at < 0 ? -1 : 1) * span;
    } else {
      sx += (w.at < 0 ? -1 : 1) * span;
    }
  }
  const len = Math.hypot(sx, sz) || 1;
  const dx = sx / len, dz = sz / len;
  // 기본 디오라마는 -z 쪽을 정면으로 짓고 yaw만큼 돌린다
  const yaw = Math.atan2(-dx, -dz);
  return { dx, dz, yaw };
}

export function buildRoomVista(world: HouseWorld): RoomVista | null {
  const slug = world.room?.slug;
  if (!slug) return null;
  const pal = ROOM_VISTA_THEMES[slug] ?? ROOM_VISTA_THEMES.guest;

  const group = new THREE.Group();
  group.name = `room-vista-${slug}`;

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const G = <T extends THREE.BufferGeometry>(g: T): T => (geos.push(g), g);
  const M = <T extends THREE.Material>(m: T): T => (mats.push(m), m);

  const basic = (color: string, opacity = 1) =>
    M(new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    }));

  // 1. 이음매 없는 360도 반구 스카이돔(반지름 68m) — 어떤 각도에서도 평면 잘림이 없다
  const domeTex = makeDomeTexture(pal);
  texs.push(domeTex);
  const domeMat = M(new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide, depthWrite: false }));
  const dome = new THREE.Mesh(G(new THREE.SphereGeometry(68, 32, 20)), domeMat);
  dome.position.set(0, 1.4, 0);
  dome.renderOrder = -10;
  group.add(dome);

  // 2. 방 바깥 넓게 깔리는 수평 대지/수면 원판(반지름 66m, 방 바닥보다 약간 아래 y=-0.45)
  const groundPlane = new THREE.Mesh(G(new THREE.CircleGeometry(66, 40)), basic(pal.ground));
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -0.45;
  group.add(groundPlane);

  // 3. 창문이 가장 크게 난 쪽을 정면(-z 기준)으로 삼는 세계 디오라마 묶음
  const stage = new THREE.Group();
  const { yaw } = primaryOutwardDir(world);
  stage.rotation.y = yaw;
  group.add(stage);

  // 공통 부드러운 원경 능선(360도 둘러싼 언덕 고리 두 겹)
  const rand = seeded(slug.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  for (const [radius, heightBase, color, seedShift] of [
    [46, 7.5, pal.ridgeFar, 1],
    [30, 4.4, pal.ridgeNear, 2],
  ] as const) {
    const segs = 48;
    const cyl = G(new THREE.CylinderGeometry(radius, radius + 3, 1, segs, 1, true));
    const pos = cyl.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const x = pos.getX(i), z = pos.getZ(i);
        const a = Math.atan2(z, x);
        const wave =
          Math.sin(a * 3 + seedShift) * 0.42 +
          Math.cos(a * 7 - seedShift * 2) * 0.24 +
          Math.sin(a * 11 + 0.7) * 0.12;
        pos.setY(i, Math.max(0.6, heightBase * (0.65 + 0.45 * wave)));
      } else {
        pos.setY(i, -2.5);
      }
    }
    cyl.computeVertexNormals();
    const ring = new THREE.Mesh(cyl, M(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })));
    stage.add(ring);
  }

  // 4. 방마다 전혀 다른 창밖 세계 연출(정면 z = -9m ~ -38m 구간)
  if (slug === 'mind') {
    // 지식 별자리 + 9요한 궤도 고리 + 떠 있는 서가 섬
    const nodeMat = basic(pal.accentA);
    const pinkMat = basic(pal.accentB);
    const lineMat = M(new THREE.LineBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.55 }));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const x = (rand() - 0.5) * 26;
      const y = 1.8 + rand() * 9.5;
      const z = -11 - rand() * 20;
      const p = new THREE.Vector3(x, y, z);
      pts.push(p);
      const orb = new THREE.Mesh(G(new THREE.OctahedronGeometry(0.24 + rand() * 0.26, 0)), i % 3 === 0 ? pinkMat : nodeMat);
      orb.position.copy(p);
      stage.add(orb);
    }
    const lineCoords: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[i].distanceTo(pts[j]) < 9.5) {
          lineCoords.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        }
      }
    }
    if (lineCoords.length) {
      const lg = G(new THREE.BufferGeometry());
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lineCoords, 3));
      stage.add(new THREE.LineSegments(lg, lineMat));
    }
    // 하늘의 큰 궤도 고리 둘
    const ring1 = new THREE.Mesh(G(new THREE.TorusGeometry(6.8, 0.06, 8, 64)), basic(pal.accentA, 0.65));
    ring1.position.set(0, 6.2, -22);
    ring1.rotation.set(0.95, 0.25, 0.2);
    const ring2 = new THREE.Mesh(G(new THREE.TorusGeometry(9.2, 0.045, 8, 64)), basic(pal.accentB, 0.5));
    ring2.position.set(0, 6.2, -22);
    ring2.rotation.set(1.2, -0.35, -0.15);
    stage.add(ring1, ring2);
  } else if (slug === 'garage') {
    // 알파인 원정 도로 + 침엽수 실루엣 + 저궤도 스타링크 위성 궤적과 통신 빔
    const road = new THREE.Mesh(G(new THREE.PlaneGeometry(3.8, 34)), basic('#37414d'));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.38, -20);
    const centerLine = new THREE.Mesh(G(new THREE.PlaneGeometry(0.16, 32)), basic('#f2b857', 0.85));
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, -0.36, -20);
    stage.add(road, centerLine);

    const pineMat = basic('#1d2b36');
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const px = side * (3.6 + rand() * 14);
      const pz = -8 - rand() * 24;
      const h = 2.4 + rand() * 2.8;
      const cone = new THREE.Mesh(G(new THREE.ConeGeometry(0.95, h, 7)), pineMat);
      cone.position.set(px, h / 2 - 0.4, pz);
      stage.add(cone);
    }

    // 저궤도 스타링크 위성 열과 궤도 아크
    const satMat = basic(pal.accentA);
    const satCoords: number[] = [];
    for (let k = 0; k < 9; k++) {
      const t = (k - 4) * 2.8;
      const sx = t * 1.35;
      const sy = 8.4 + Math.cos(k * 0.35) * 1.8;
      const sz = -18 - k * 1.1;
      const sat = new THREE.Mesh(G(new THREE.BoxGeometry(0.42, 0.08, 0.24)), satMat);
      sat.position.set(sx, sy, sz);
      stage.add(sat);
      if (k > 0) {
        const pt = (k - 5) * 2.8;
        satCoords.push(pt * 1.35, 8.4 + Math.cos((k - 1) * 0.35) * 1.8, -18 - (k - 1) * 1.1, sx, sy, sz);
      }
    }
    const satGeo = G(new THREE.BufferGeometry());
    satGeo.setAttribute('position', new THREE.Float32BufferAttribute(satCoords, 3));
    stage.add(new THREE.LineSegments(satGeo, M(new THREE.LineBasicMaterial({ color: pal.accentA, transparent: true, opacity: 0.5 }))));
  } else if (slug === 'gable') {
    // 밤바다 항구 빌딩 불빛 + 초승달 + 재즈블렌드 빛의 리본 곡선
    const moon = new THREE.Mesh(G(new THREE.CircleGeometry(1.6, 28)), basic('#fff3c9'));
    moon.position.set(-6.5, 8.2, -26);
    stage.add(moon);

    for (let i = 0; i < 16; i++) {
      const bx = -15 + i * 2.0 + (rand() - 0.5) * 0.6;
      const bh = 2.2 + rand() * 5.6;
      const bz = -19 - rand() * 8;
      const bldg = new THREE.Mesh(G(new THREE.BoxGeometry(1.35, bh, 1.35)), basic('#1c213d'));
      bldg.position.set(bx, bh / 2 - 0.4, bz);
      stage.add(bldg);
      const winGlow = new THREE.Mesh(
        G(new THREE.PlaneGeometry(0.8, Math.max(0.5, bh * 0.55))),
        basic(i % 2 === 0 ? pal.accentA : pal.accentB, 0.72),
      );
      winGlow.position.set(bx, bh * 0.52 - 0.4, bz + 0.69);
      stage.add(winGlow);
    }

    // 흐르는 세 가닥 빛의 리본
    for (const [idx, col] of (['#f5c45a', '#e985a2', '#7aa6f7'] as const).entries()) {
      const curvePts: THREE.Vector3[] = [];
      for (let s = 0; s <= 24; s++) {
        const u = (s / 24 - 0.5) * 28;
        curvePts.push(new THREE.Vector3(u, 4.2 + idx * 0.85 + Math.sin(s * 0.45 + idx) * 1.15, -14 - Math.cos(s * 0.25) * 3));
      }
      const tube = G(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), 36, 0.11, 6, false));
      stage.add(new THREE.Mesh(tube, basic(col, 0.78)));
    }
  } else if (slug === 'study') {
    // 따뜻한 호두나무 언덕 + 큰 오후 태양 후광 + 종이새 편지
    const sunHalo = new THREE.Mesh(G(new THREE.CircleGeometry(3.4, 32)), basic(pal.glow, 0.42));
    sunHalo.position.set(3.5, 6.4, -25);
    const sunCore = new THREE.Mesh(G(new THREE.CircleGeometry(1.7, 32)), basic('#fff8e6'));
    sunCore.position.set(3.5, 6.4, -24.8);
    stage.add(sunHalo, sunCore);

    for (let i = 0; i < 9; i++) {
      const tx = -11 + i * 2.8 + (rand() - 0.5);
      const tz = -10 - rand() * 12;
      const trunk = new THREE.Mesh(G(new THREE.CylinderGeometry(0.14, 0.2, 1.5, 6)), basic('#6e503b'));
      trunk.position.set(tx, 0.35, tz);
      const crown = new THREE.Mesh(
        G(new THREE.SphereGeometry(1.15 + rand() * 0.5, 12, 10)),
        basic(i % 2 === 0 ? '#d6986a' : '#85a898'),
      );
      crown.position.set(tx, 1.7, tz);
      stage.add(trunk, crown);
    }
    // 바람에 나는 종이 편지 새
    for (let k = 0; k < 8; k++) {
      const note = new THREE.Mesh(G(new THREE.OctahedronGeometry(0.22, 0)), basic('#fffaf0'));
      note.scale.set(1.6, 0.35, 1.1);
      note.position.set(-6 + k * 1.8, 3.0 + Math.sin(k) * 1.2, -9 - (k % 4) * 2.2);
      note.rotation.z = 0.25;
      stage.add(note);
    }
  } else if (slug === 'target') {
    // 웅장한 화강암 산봉우리 + 초록 언덕 트랙 + 알록달록 하늘 열기구
    const peakMain = new THREE.Mesh(G(new THREE.ConeGeometry(8.5, 14.5, 7)), basic('#7c90a6'));
    peakMain.position.set(0, 6.6, -24);
    const peakCap = new THREE.Mesh(G(new THREE.ConeGeometry(4.1, 5.2, 7)), basic('#dce6f0'));
    peakCap.position.set(0, 11.4, -23.9);
    stage.add(peakMain, peakCap);

    const balloonColors = ['#ff7a59', '#ffd24c', '#5fb878', '#5a9dee'];
    for (let i = 0; i < 4; i++) {
      const bx = -8 + i * 5.4;
      const by = 5.2 + (i % 2) * 2.1;
      const bz = -13 - (i % 3) * 3.5;
      const orb = new THREE.Mesh(G(new THREE.SphereGeometry(0.95, 14, 12)), basic(balloonColors[i]));
      orb.position.set(bx, by, bz);
      const basket = new THREE.Mesh(G(new THREE.BoxGeometry(0.36, 0.28, 0.36)), basic('#8a5e3b'));
      basket.position.set(bx, by - 1.25, bz);
      stage.add(orb, basket);
    }
  } else if (slug === 'toybox') {
    // 파스텔 조개섬 + 색색의 둥근 조약돌 + 하얀 종이배와 뭉게구름
    for (let i = 0; i < 7; i++) {
      const px = -10 + i * 3.3;
      const pz = -9 - (i % 3) * 3.4;
      const stone = new THREE.Mesh(
        G(new THREE.DodecahedronGeometry(0.75 + (i % 3) * 0.35, 1)),
        basic(['#ff9ebb', '#ffd97d', '#9ad9c5', '#b5b2f2'][i % 4]),
      );
      stone.scale.set(1.3, 0.68, 1.1);
      stone.position.set(px, -0.15, pz);
      stage.add(stone);
    }
    // 종이배 세 척
    for (let b = 0; b < 3; b++) {
      const boat = new THREE.Mesh(G(new THREE.ConeGeometry(0.65, 0.9, 4)), basic('#fffcf5'));
      boat.position.set(-4.5 + b * 4.5, 0.1, -14 - b * 2.5);
      boat.rotation.y = 0.4;
      stage.add(boat);
    }
    // 뭉게구름
    for (let c = 0; c < 5; c++) {
      const cloud = new THREE.Mesh(G(new THREE.SphereGeometry(1.3, 12, 10)), basic('#fff8fb', 0.9));
      cloud.scale.set(1.9, 0.72, 1.0);
      cloud.position.set(-9 + c * 4.6, 6.8 + (c % 2) * 1.1, -19);
      stage.add(cloud);
    }
  } else {
    // 손님방: 달빛 소나무 정원과 돌등 불빛·반딧불
    const moon = new THREE.Mesh(G(new THREE.CircleGeometry(1.4, 28)), basic('#fff4d4'));
    moon.position.set(4.5, 7.6, -24);
    stage.add(moon);
    for (let i = 0; i < 8; i++) {
      const lx = -8 + i * 2.3;
      const lz = -9 - (i % 3) * 3.2;
      const lantern = new THREE.Mesh(G(new THREE.SphereGeometry(0.22, 10, 8)), basic(pal.accentA));
      lantern.position.set(lx, 0.65 + (i % 2) * 0.4, lz);
      stage.add(lantern);
    }
  }

  return {
    group,
    skyTop: pal.skyTop,
    skyHorizon: pal.skyHorizon,
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}
