import { inkWritingDesk, lightShaft, poetryShelf, watercolorEasel } from './furnish-atelier';
// 방 업그레이드 전용 입체 가구·차량·장비·전시물 조형(furnish.ts PIECES에서 호출).
// 공개 번들에 포함되므로 가족 실명·동네·방위·모형 약호는 쓰지 않는다.
import * as THREE from 'three';
import type { Furniture, FurnitureKind } from './types';
import type { FurnitureKit, FurnitureMats, FurnishEnv } from './furnish';

type AddLight = (color: string, intensity: number, dist: number, x: number, y: number, z: number) => void;
export type RoomPieceCtx = {
  f: Furniture;
  W: number;
  D: number;
  g: THREE.Group;
  m: FurnitureMats;
  kit: FurnitureKit;
  addLight: AddLight;
  env: FurnishEnv;
};

const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
};
const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.position.set(x, y, z);
  return mesh;
};
const spotHash = (f: Furniture) => Math.abs(Math.round(f.x1 * 37 + f.z1 * 91 + f.x2 * 13 + f.z2 * 7));

function artCanvasMat(kit: FurnitureKit, key: string, url: string, w: number, h: number, fallbackBg = '#f5efe2', title = '') {
  const tex = kit.once(`roomart:${key}`, () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = fallbackBg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#134538';
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    if (title) {
      ctx.fillStyle = '#1f2623';
      ctx.font = '700 32px "Pretendard Variable", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, w / 2, h / 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    kit.image(t, url, { x: 0, y: 0, w, h });
    return t;
  });
  return kit.once(`roomartmat:${key}`, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78 }));
}

// ───────── 1. 생각 지도 방(요한의 방): 지식관리 일러스트 월, 지산 책상, 강의 자산 보드, 9성 모빌
function pkmGallery({ W, g, m, kit, f, addLight }: RoomPieceCtx) {
  const seed = spotHash(f);
  const urls = f.z1 < 0
    ? [
        ['/rooms/pkm-graph.webp', 'Knowledge Graph'],
        ['/rooms/pkm-process.webp', 'CMDS Process'],
        ['/rooms/pkm-conductor.webp', 'Agent Conductor'],
        ['/rooms/pkm-multivault.webp', 'Multi-Vault'],
      ]
    : [
        ['/rooms/pkm-zettelkasten.webp', 'Zettelkasten'],
        ['/rooms/pkm-blueprint.webp', 'System Blueprint'],
        ['/rooms/pkm-luhmann.webp', 'Card Archive'],
        ['/rooms/pkm-workbench.webp', 'Workbench'],
      ];
  const count = Math.max(2, Math.min(4, Math.floor(W / 0.85)));
  const span = W / count;
  const frameMat = kit.paint('#1d2024', 0.38, 0.25);
  for (let i = 0; i < count; i++) {
    const [url, label] = urls[i % urls.length];
    const x = -W / 2 + span * (i + 0.5);
    const y = 1.56 + (i % 2 === 0 ? 0.05 : -0.05);
    const fw = Math.min(0.76, span * 0.82);
    const fh = fw * 0.82;
    g.add(box(fw + 0.06, fh + 0.06, 0.035, frameMat, x, y, 0.018));
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(fw, fh),
      artCanvasMat(kit, `${seed}-${i}`, url, 512, 420, '#f6f1e6', label),
    );
    art.position.set(x, y, 0.038);
    art.userData.live = true;
    g.add(art);
    // 갤러리 픽처 라이트
    g.add(box(fw * 0.48, 0.025, 0.09, m.silver, x, y + fh / 2 + 0.09, 0.05));
  }
  addLight('#fff1d6', 4.5, 4.2, 0, 2.05, 0.35);
}

function jisanDesk({ W, D, g, m, kit, addLight }: RoomPieceCtx) {
  const darkWood = kit.paint('#26211e', 0.45, 0.08);
  const greenMat = kit.paint('#134538', 0.65);
  const pinkGlow = kit.glow('#e985a2', 0.9);
  // 넓은 서재 데스크 상판과 실버 프레임 다리
  g.add(box(W, 0.055, D, darkWood, 0, 0.74, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.05, 0.72, 0.05, m.silver, sx * (W / 2 - 0.08), 0.36, sz * (D / 2 - 0.08)));
    }
  }
  // 데스크 패드(CMDS 딥그린)
  g.add(box(W * 0.62, 0.008, D * 0.54, greenMat, 0, 0.772, 0.04));

  // 울트라와이드 리뷰 모니터(CmdMD 프리뷰 & 그래프 화면)
  const monTex = kit.tex('jisanMonitor', 512, 256, (c, w, h) => {
    c.fillStyle = '#141918';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#134538';
    c.fillRect(16, 16, w * 0.44, h - 32);
    c.fillStyle = '#fbf7ef';
    c.fillRect(w * 0.48, 16, w * 0.48, h - 32);
    c.fillStyle = '#e985a2';
    for (const [nx, ny] of [[75, 70], [150, 110], [110, 180], [185, 65], [60, 155]]) {
      c.beginPath();
      c.arc(nx, ny, 9, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(233,133,162,0.7)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(75, 70); c.lineTo(150, 110); c.lineTo(110, 180); c.lineTo(60, 155); c.closePath();
    c.moveTo(150, 110); c.lineTo(185, 65);
    c.stroke();
    c.fillStyle = '#1f2421';
    c.font = '800 22px "Pretendard Variable", sans-serif';
    c.fillText('紙散 · JISAN ESSAYS', w * 0.52, 54);
    c.font = '500 15px "Pretendard Variable", sans-serif';
    c.fillText('명령은 없다, 연결만 있다', w * 0.52, 92);
    c.fillText('Schema는 Harness다', w * 0.52, 122);
    c.fillText('나만의 확률값 · 9Yohan', w * 0.52, 152);
  });
  const screenMat = kit.once('m:jisanMon', () => new THREE.MeshStandardMaterial({ map: monTex, emissive: '#1d2b27', emissiveIntensity: 0.55, roughness: 0.3 }));
  g.add(cyl(0.03, 0.04, 0.24, m.silver, 0, 0.88, -D * 0.24, 12));
  g.add(box(0.86, 0.42, 0.03, kit.paint('#181a1c', 0.35, 0.4), 0, 1.08, -D * 0.24));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.38), screenMat);
  scr.position.set(0, 1.08, -D * 0.24 + 0.018);
  g.add(scr);

  // 32:9 XENEON EDGE 보조 터치 스크린 + 주 관제 노트북 + 모바일 리모컨 거치대
  g.add(box(0.52, 0.11, 0.02, kit.paint('#1b2024', 0.35, 0.4), 0, 0.825, -D * 0.08));
  g.add(box(0.49, 0.088, 0.008, kit.glow('#1f5c4b', 0.75), 0, 0.825, -D * 0.068));
  g.add(box(0.34, 0.014, 0.23, m.silver, -0.02, 0.782, 0.14));
  g.add(box(0.08, 0.13, 0.06, kit.paint('#22262c', 0.4, 0.5), 0.28, 0.835, 0.08));
  // 커맨디(초록)·스페이시(분홍) 데스크 마스코트 + 만년필 원고 & 알렉산드리아 홍차 티팟·찻잔
  g.add(box(0.055, 0.065, 0.055, kit.paint('#134538', 0.5), -0.34, 0.805, -0.14));
  g.add(box(0.05, 0.095, 0.05, kit.paint('#e985a2', 0.5), -0.26, 0.82, -0.14));
  g.add(box(0.28, 0.045, 0.21, kit.paint('#f7f1e3', 0.92), -W * 0.34, 0.79, 0.1));
  g.add(cyl(0.065, 0.075, 0.11, kit.paint('#d9cfc1', 0.38), W * 0.26, 0.825, 0.04, 16));
  g.add(cyl(0.042, 0.036, 0.085, kit.paint('#e8dfd1', 0.4), W * 0.35, 0.81, 0.12, 14));
  // 작은 핑크 포인트 스탠드
  g.add(cyl(0.07, 0.08, 0.02, m.silver, W * 0.36, 0.78, -D * 0.2, 14));
  g.add(cyl(0.012, 0.012, 0.32, m.silver, W * 0.36, 0.94, -D * 0.2, 8));
  g.add(cyl(0.06, 0.09, 0.1, pinkGlow, W * 0.33, 1.1, -D * 0.16, 14));
  addLight('#ffe7cf', 4.5, 3.8, 0, 1.25, 0.1);
}

function lectureWall({ W, g, m, kit }: RoomPieceCtx) {
  const boardTex = kit.tex('lectureArchiveWall', 1024, 640, (c, w, h) => {
    c.fillStyle = '#172320';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c9a36b';
    c.lineWidth = 10;
    c.strokeRect(16, 16, w - 32, h - 32);

    c.fillStyle = '#e985a2';
    c.font = '800 24px "Pretendard Variable", sans-serif';
    c.fillText('MAIN VAULT · LECTURE ASSET ARCHIVE', 48, 66);
    c.fillStyle = '#f6f1e6';
    c.font = '800 38px "Pretendard Variable", sans-serif';
    c.fillText('메인 볼트 강의 자산 & 핵심 명제 보드', 48, 118);

    const cards = [
      ['AI Agent Workflow', '에이전트와 일할 때 가장 먼저 설계할 것은 저장이다'],
      ['PKM for AI Agent', '인풋과 아웃풋을 먼저 고정하면 그 사이의 일이 보인다'],
      ['CMDS LLM Wiki', '위키는 쌓은 수가 아니라 소화한 수로 센다 (Ingest·Query·Lint)'],
      ['Executive AX', '조직 도입은 인력 대체가 아니라 줄어든 시간으로 설득한다'],
      ['Second Brain', '초심자에게는 도구 목록보다 첫 성공의 경로가 필요하다'],
      ['Record & Share', '기록은 보관이 아니라 전달이다 · 감사의 한 줄은 사람이 쓴다'],
    ];
    cards.forEach(([tag, line], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 48 + col * 470;
      const y = 158 + row * 146;
      c.fillStyle = 'rgba(255,250,240,0.08)';
      c.fillRect(x, y, 444, 124);
      c.strokeStyle = 'rgba(233,133,162,0.45)';
      c.lineWidth = 2;
      c.strokeRect(x, y, 444, 124);
      c.fillStyle = '#8fd9be';
      c.font = '800 20px "Pretendard Variable", sans-serif';
      c.fillText(`0${idx + 1} · ${tag}`, x + 18, y + 36);
      c.fillStyle = '#fbf7ef';
      c.font = '600 21px "Pretendard Variable", sans-serif';
      c.fillText(line.slice(0, 21), x + 18, y + 74);
      if (line.length > 21) c.fillText(line.slice(21), x + 18, y + 102);
    });
  });
  const mat = kit.once('m:lectureWall', () => new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.55 }));
  const H = Math.min(1.52, W * 0.62);
  g.add(box(W, H + 0.08, 0.04, m.lacquer, 0, 1.52, 0.02));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, H), mat);
  face.position.set(0, 1.52, 0.043);
  g.add(face);
}

function constellationMobile({ g, m, kit, env, f }: RoomPieceCtx) {
  const top = env.ceilingAt(f);
  g.add(cyl(0.008, 0.008, 0.45, m.silver, 0, top - 0.22, 0, 8));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.014, 8, 40), m.brass);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = top - 0.46;
  g.add(ring);
  const starGlow = kit.glow('#f5cf76', 1.3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rx = Math.cos(a) * 0.68;
    const rz = Math.sin(a) * 0.68;
    const drop = 0.16 + (i % 3) * 0.09;
    g.add(cyl(0.004, 0.004, drop, m.silver, rx, top - 0.46 - drop / 2, rz, 6));
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), starGlow);
    star.position.set(rx, top - 0.46 - drop, rz);
    g.add(star);
  }
}

function leaderboardStand({ W, D, g, m, kit }: RoomPieceCtx) {
  const screenTex = kit.tex('leaderboardKiosk', 384, 512, (c, w, h) => {
    c.fillStyle = '#18151d';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f2b84b';
    c.lineWidth = 8;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = '#f2b84b';
    c.font = '900 32px "Pretendard Variable", sans-serif';
    c.textAlign = 'center';
    c.fillText('🏆 HALL OF FAME', w / 2, 70);
    c.fillStyle = '#fbf7ef';
    c.font = '700 24px "Pretendard Variable", sans-serif';
    c.fillText('실시간 방 & 웹 리더보드', w / 2, 114);
    const medals = ['#f5c85b', '#d6dce5', '#dfb08c'];
    for (let r = 0; r < 5; r++) {
      const y = 158 + r * 62;
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(32, y, w - 64, 48);
      c.fillStyle = medals[r] ?? '#9aa4b2';
      c.font = '800 22px "Pretendard Variable", sans-serif';
      c.textAlign = 'left';
      c.fillText(`#${r + 1}`, 48, y + 31);
      c.fillStyle = '#f4ede2';
      c.fillText('도전자 기록 보기', 102, y + 31);
      c.textAlign = 'right';
      c.fillStyle = '#f5c85b';
      c.fillText('E / 클릭', w - 48, y + 31);
    }
  });
  const scrMat = kit.once('m:lbScreen', () => new THREE.MeshStandardMaterial({ map: screenTex, emissive: '#261f12', emissiveIntensity: 0.65, roughness: 0.32 }));
  g.add(box(Math.min(W, 0.56), 0.08, Math.min(D, 0.44), m.walnut, 0, 0.04, 0));
  g.add(box(0.12, 1.05, 0.1, kit.paint('#28231f', 0.5), 0, 0.56, -0.04));
  const head = new THREE.Group();
  head.position.set(0, 1.28, 0.02);
  head.rotation.x = -0.18;
  head.add(box(0.52, 0.68, 0.05, m.brass, 0, 0, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), scrMat);
  face.position.set(0, 0, 0.028);
  head.add(face);
  g.add(head);
}

// ───────── 2. 작업 차고 · 이동식 작전 본부(이네오스 그레나디어 + 스타링크, CLA 45 AMG, ~~X3~~→티구안 도면/다이캐스트, 하네스 랙)
function grenadier({ W, D, g, kit }: RoomPieceCtx) {
  const bodyBlack = kit.paint('#1c1e21', 0.34, 0.45);
  const matteTrim = kit.paint('#2c2f33', 0.72, 0.2);
  const glassDark = kit.paint('#24303a', 0.18, 0.6);
  const tireMat = kit.paint('#191a1c', 0.92, 0.05);
  const ledGlow = kit.glow('#fff8e6', 1.5);

  // GLB가 로드되기 전 즉시 보이는 정통 각진 오프로더 폴백 차체
  const cw = Math.min(W * 0.92, 1.98);
  const cd = Math.min(D * 0.94, 4.55);
  g.add(box(cw, 0.68, cd, bodyBlack, 0, 0.68, 0));
  g.add(box(cw * 0.94, 0.74, cd * 0.66, bodyBlack, 0, 1.38, -cd * 0.12));
  g.add(box(cw * 0.95, 0.52, cd * 0.62, glassDark, 0, 1.4, -cd * 0.12));
  g.add(box(cw * 1.02, 0.22, 0.28, matteTrim, 0, 0.44, cd / 2 - 0.08));
  // 시그니처 원형 헤드라이트 2+2
  for (const sx of [-1, 1]) {
    g.add(cyl(0.11, 0.11, 0.04, ledGlow, sx * cw * 0.34, 0.78, cd / 2 + 0.01, 16).rotateX(Math.PI / 2));
    g.add(cyl(0.065, 0.065, 0.04, ledGlow, sx * cw * 0.14, 0.78, cd / 2 + 0.01, 14).rotateX(Math.PI / 2));
    for (const sz of [-1, 1]) {
      g.add(cyl(0.39, 0.39, 0.26, tireMat, sx * (cw / 2 - 0.06), 0.39, sz * cd * 0.32, 18).rotateZ(Math.PI / 2));
    }
  }

  // ★ 루프랙 위 스타링크 위성 안테나 어레이(keepWithModel=true: GLB 지붕 위 내장 루프랙 높이에 딱 맞춰 결합!)
  const starlinkRig = new THREE.Group();
  const mountY = 1.82;
  const rackSteel = kit.paint('#22252a', 0.45, 0.5);
  const dishWhite = kit.paint('#f4f6f8', 0.32, 0.08);
  const dishEdge = kit.paint('#363e47', 0.42, 0.25);
  const linkLed = kit.glow('#49d49d', 1.6);
  starlinkRig.add(
    box(0.28, 0.028, 0.24, rackSteel, 0, mountY, -0.36),
    cyl(0.028, 0.045, 0.11, rackSteel, 0, mountY + 0.06, -0.36, 14),
  );
  const dish = new THREE.Group();
  dish.position.set(0, mountY + 0.125, -0.36);
  dish.rotation.x = -0.24;
  dish.add(
    box(0.56, 0.024, 0.36, dishEdge, 0, 0, 0),
    box(0.52, 0.014, 0.32, dishWhite, 0, 0.014, 0),
    box(0.036, 0.018, 0.036, linkLed, 0.2, 0.022, 0.12),
  );
  starlinkRig.add(dish);
  g.add(starlinkRig);
}

function cla45({ W, D, g, kit }: RoomPieceCtx) {
  // Meshy 7.1 PBR GLB 로드 전 즉시 보이는 AMG CLA 45 쿠페 폴백(실버 스트라이프 + 옐로우 립 포인트)
  const bodyBlack = kit.paint('#1b1d21', 0.26, 0.58);
  const silverStripe = kit.paint('#c8cfd8', 0.32, 0.7);
  const yellowLip = kit.paint('#f2c230', 0.35, 0.2);
  const glassDark = kit.paint('#232c36', 0.16, 0.65);
  const tireMat = kit.paint('#18191b', 0.88, 0.1);
  const cw = Math.min(W * 0.92, 1.88);
  const cd = Math.min(D * 0.94, 4.45);

  g.add(box(cw, 0.5, cd, bodyBlack, 0, 0.48, 0));
  g.add(box(cw * 0.86, 0.46, cd * 0.52, bodyBlack, 0, 0.94, -cd * 0.06));
  g.add(box(cw * 0.88, 0.34, cd * 0.48, glassDark, 0, 0.95, -cd * 0.06));
  // 실버 후드 레이싱 스트라이프 & 옐로우 프론트 스플리터 립
  g.add(box(0.14, 0.01, cd * 0.34, silverStripe, -cw * 0.14, 0.736, cd * 0.28));
  g.add(box(cw * 0.96, 0.035, 0.12, yellowLip, 0, 0.23, cd / 2 - 0.04));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.33, 0.33, 0.24, tireMat, sx * (cw / 2 - 0.05), 0.33, sz * cd * 0.31, 18).rotateZ(Math.PI / 2));
    }
  }
}

function tiguanPlanWall({ W, g, m, kit }: RoomPieceCtx) {
  const planTex = kit.tex('tiguanPlanBoard', 1024, 640, (c, w, h) => {
    // 엔지니어링 블루프린트 보드 바탕
    c.fillStyle = '#f4efe2';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(38, 72, 108, 0.14)';
    c.lineWidth = 1;
    for (let x = 32; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 32; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.strokeStyle = '#243b55';
    c.lineWidth = 8;
    c.strokeRect(18, 18, w - 36, h - 36);

    c.fillStyle = '#1f2d3d';
    c.font = '900 30px "Pretendard Variable", sans-serif';
    c.fillText('NEXT VEHICLE ACQUISITION PLAN · 구매 계획 변경 이력', 44, 68);

    // 왼쪽 칸: BMW X3 (빨간 취소선 ✕)
    c.strokeStyle = '#4a6583';
    c.lineWidth = 3;
    c.strokeRect(44, 104, 410, 360);
    c.fillStyle = '#3b5169';
    c.font = '800 34px "Pretendard Variable", sans-serif';
    c.fillText('1차 희망: BMW X3', 72, 162);
    // X3 측면 윤곽 도면
    c.strokeStyle = '#3b5169';
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(86, 238, 320, 88, 18);
    c.moveTo(132, 238); c.lineTo(175, 188); c.lineTo(340, 188); c.lineTo(382, 238);
    c.stroke();
    c.beginPath(); c.arc(148, 330, 32, 0, Math.PI * 2); c.arc(342, 330, 32, 0, Math.PI * 2); c.stroke();

    // 굵은 빨간 취소선 X!!
    c.strokeStyle = '#d63638';
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(64, 124); c.lineTo(434, 440);
    c.moveTo(434, 124); c.lineTo(64, 440);
    c.stroke();

    // 가운데 화살표
    c.fillStyle = '#d63638';
    c.font = '900 54px sans-serif';
    c.fillText('➔', 472, 295);

    // 오른쪽 칸: VW TIGUAN (최종 확정!)
    c.fillStyle = 'rgba(30, 110, 82, 0.08)';
    c.fillRect(546, 104, 434, 360);
    c.strokeStyle = '#134538';
    c.lineWidth = 4;
    c.strokeRect(546, 104, 434, 360);
    c.fillStyle = '#134538';
    c.font = '900 36px "Pretendard Variable", sans-serif';
    c.fillText('최종 확정: VW TIGUAN', 572, 162);
    c.font = '700 22px "Pretendard Variable", sans-serif';
    c.fillText('실속 · 적재공간 · 패밀리 투어러 합격!', 572, 198);

    // 티구안 측면 윤곽 도면
    c.strokeStyle = '#134538';
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(596, 250, 336, 86, 14);
    c.moveTo(642, 250); c.lineTo(680, 198); c.lineTo(876, 198); c.lineTo(914, 250);
    c.stroke();
    c.beginPath(); c.arc(660, 340, 32, 0, Math.PI * 2); c.arc(868, 340, 32, 0, Math.PI * 2); c.stroke();

    // 빨간 도장 "최종 확정"
    c.save();
    c.translate(888, 160);
    c.rotate(-0.18);
    c.strokeStyle = '#c9382b';
    c.lineWidth = 5;
    c.strokeRect(-62, -28, 124, 56);
    c.fillStyle = '#c9382b';
    c.font = '900 24px "Pretendard Variable", sans-serif';
    c.textAlign = 'center';
    c.fillText('최종 확정', 0, 8);
    c.restore();

    // 노란 포스트잇 사연 메모
    c.fillStyle = '#fff099';
    c.fillRect(56, 486, 916, 114);
    c.strokeStyle = '#d9b83c';
    c.lineWidth = 3;
    c.strokeRect(56, 486, 916, 114);
    c.fillStyle = '#2d2412';
    c.textAlign = 'left';
    c.font = '800 26px "Pretendard Variable", sans-serif';
    c.fillText('📌 긴급 수정 사유: 아버님께 "왜 X3를 사냐!!" 호되게 혼나고 티구안으로 전격 선회 😂', 80, 536);
    c.font = '600 21px "Pretendard Variable", sans-serif';
    c.fillText('아쉬운 X3는 아래 선반 미니카로 남기고, 실물 드림카는 든든한 폭스바겐 티구안으로 출고 예정!', 80, 576);
  });
  const mat = kit.once('m:tiguanPlan', () => new THREE.MeshStandardMaterial({ map: planTex, roughness: 0.65 }));
  const H = Math.min(1.48, W * 0.64);
  g.add(box(W, H + 0.06, 0.04, m.dark, 0, 1.62, 0.02));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, H), mat);
  face.position.set(0, 1.62, 0.043);
  g.add(face);
}

function diecastDisplay({ W, D, g, m, kit, addLight }: RoomPieceCtx) {
  // 월넛 전시장 스탠드 + 투명 아크릴 케이스 + 작은 X3(아쉬움용) & 주인공 1:18 폭스바겐 티구안 다이캐스트!
  const pedestalW = Math.min(W, 1.15);
  const pedestalD = Math.min(D, 0.58);
  g.add(box(pedestalW, 0.92, pedestalD, m.walnut, 0, 0.46, 0));
  g.add(box(pedestalW + 0.04, 0.04, pedestalD + 0.04, kit.paint('#1f2328', 0.35, 0.4), 0, 0.94, 0));

  // 왼쪽 작은 1:24 구 계획 미니카(차콜 블루 + 빨간 X 딱지)
  const miniX3 = new THREE.Group();
  miniX3.position.set(-pedestalW * 0.25, 0.96, 0);
  miniX3.rotation.y = 0.35;
  miniX3.add(
    box(0.15, 0.06, 0.32, kit.paint('#465a70', 0.3, 0.5), 0, 0.05, 0),
    box(0.13, 0.05, 0.18, kit.paint('#2c3a48', 0.2, 0.6), 0, 0.1, -0.02),
    box(0.06, 0.015, 0.06, kit.paint('#d63638', 0.5), 0, 0.132, 0),
  );
  g.add(miniX3);

  // 오른쪽 주인공 1:18 폭스바겐 티구안 다이캐스트(퓨어 화이트/실버 메탈릭 + 루프레일 + LED 라이트바)
  const tiguan = new THREE.Group();
  tiguan.position.set(pedestalW * 0.16, 0.96, 0.02);
  tiguan.rotation.y = -0.32;
  const tigBody = kit.paint('#eef2f6', 0.22, 0.45);
  const tigGlass = kit.paint('#23303d', 0.18, 0.65);
  const tigWheel = kit.paint('#1c1e22', 0.85, 0.15);
  tiguan.add(
    box(0.22, 0.085, 0.48, tigBody, 0, 0.07, 0),
    box(0.195, 0.075, 0.29, tigBody, 0, 0.145, -0.03),
    box(0.198, 0.058, 0.26, tigGlass, 0, 0.146, -0.03),
    // VW 수평 LED 라이트바 & 테일바
    box(0.19, 0.014, 0.015, kit.glow('#e8f6ff', 1.4), 0, 0.085, 0.242),
    box(0.19, 0.016, 0.015, kit.glow('#ff4d4d', 1.2), 0, 0.092, -0.242),
    // 루프레일
    box(0.012, 0.014, 0.26, m.silver, -0.085, 0.19, -0.03),
    box(0.012, 0.014, 0.26, m.silver, 0.085, 0.19, -0.03),
  );
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      tiguan.add(cyl(0.042, 0.042, 0.03, tigWheel, sx * 0.105, 0.042, sz * 0.145, 14).rotateZ(Math.PI / 2));
    }
  }
  g.add(tiguan);

  // 아크릴 투명 돔 커버
  const glass = new THREE.MeshStandardMaterial({ color: '#dceaf5', transparent: true, opacity: 0.18, roughness: 0.08, depthWrite: false });
  const cover = box(pedestalW * 0.94, 0.34, pedestalD * 0.88, kit.once('m:diecastGlass', () => glass), 0, 1.13, 0);
  g.add(cover);
  addLight('#fff4db', 3.5, 3.2, 0, 1.45, 0.2);
}

function opsCommandRig({ W, D, g, m, kit, addLight }: RoomPieceCtx) {
  // 구요한의 멀티디바이스 AI 하네스 & 이동식 작전 본부 장비 설계 벤치
  const steel = kit.paint('#20242a', 0.45, 0.55);
  const topOak = kit.paint('#5c422d', 0.62);
  g.add(box(W, 0.06, D, topOak, 0, 0.82, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.06, 0.8, 0.06, steel, sx * (W / 2 - 0.08), 0.4, sz * (D / 2 - 0.08)));
    }
  }
  // 하단 인산철 파워뱅크(2048Wh) & 데스크탑 연산 서버 랙
  g.add(box(0.48, 0.34, 0.34, kit.paint('#2b3036', 0.5, 0.35), -W * 0.28, 0.19, 0));
  g.add(box(0.16, 0.08, 0.015, kit.glow('#46d99a', 1.3), -W * 0.28, 0.24, 0.175));
  g.add(box(0.26, 0.26, 0.26, m.silver, W * 0.28, 0.15, 0)); // 컴팩트 데스크탑 스튜디오 워커

  // 트리플 관제 모니터(오케스트레이션 보드 + 스타링크 텔레메트리 + 3D 뷰)
  const rigTex = kit.tex('opsCommandScreens', 768, 220, (c, w, h) => {
    c.fillStyle = '#0f1419';
    c.fillRect(0, 0, w, h);
    // Screen 1: Starlink Uplink
    c.strokeStyle = '#3ba4f7';
    c.lineWidth = 3;
    c.strokeRect(12, 12, 236, h - 24);
    c.fillStyle = '#7fd4ff';
    c.font = '800 18px monospace';
    c.fillText('STARLINK UPLINK', 26, 44);
    c.fillStyle = '#49d49d';
    c.fillText('ONLINE · 218 Mbps', 26, 76);
    c.fillText('LATENCY · 26 ms', 26, 104);
    // Screen 2: AI Harness Orchestrator
    c.strokeStyle = '#e985a2';
    c.strokeRect(264, 12, 240, h - 24);
    c.fillStyle = '#e985a2';
    c.fillText('AI HARNESS CTRL', 280, 44);
    c.fillStyle = '#f5f0e6';
    c.fillText('PRIMARY · ACTIVE', 280, 76);
    c.fillText('STUDIO  · 4 WORKERS', 280, 104);
    c.fillText('GPU 5090· STANDBY', 280, 132);
    // Screen 3: Field Checklist
    c.strokeStyle = '#f5c85b';
    c.strokeRect(520, 12, 236, h - 24);
    c.fillStyle = '#f5c85b';
    c.fillText('MOC FIELD KIT', 536, 44);
    c.fillStyle = '#9fe6c3';
    c.fillText('[OK] LiFePO4 100%', 536, 76);
    c.fillText('[OK] AUDIO REC', 536, 104);
    c.fillText('[OK] VAULT SYNC', 536, 132);
  });
  const scrMat = kit.once('m:opsScreens', () => new THREE.MeshStandardMaterial({ map: rigTex, emissive: '#142029', emissiveIntensity: 0.72, roughness: 0.28 }));
  g.add(cyl(0.035, 0.05, 0.3, steel, 0, 0.98, -D * 0.24, 12));
  g.add(box(Math.min(W * 0.86, 1.56), 0.42, 0.035, steel, 0, 1.2, -D * 0.24));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(W * 0.84, 1.52), 0.38), scrMat);
  scr.position.set(0, 1.2, -D * 0.24 + 0.02);
  g.add(scr);

  // 주 관제 노트북 + 모바일 관제기 독 + 필드 마이크
  g.add(box(0.36, 0.016, 0.25, m.silver, -0.12, 0.86, 0.08));
  g.add(box(0.11, 0.16, 0.08, steel, 0.34, 0.92, 0.06));
  addLight('#dff2ff', 5.0, 4.5, 0, 1.48, 0.15);
}

function blueprintWall({ W, g, kit, f }: RoomPieceCtx) {
  const seed = spotHash(f);
  const pairs = f.x1 > 0
    ? [
        ['/rooms/garage-blueprint-dual.webp', 'INEOS × AMG DUAL SCHEMATIC'],
        ['/rooms/garage-blueprint-starlink.webp', 'STARLINK EXPEDITION ARRAY'],
      ]
    : [
        ['/rooms/garage-moc-iso.webp', 'MOBILE OPS CUTAWAY'],
        ['/rooms/garage-moc-cargo.webp', 'REAR CARGO WORKSTATION'],
      ];
  const count = Math.min(2, Math.max(1, Math.floor(W / 1.1)));
  const span = W / count;
  const frameMat = kit.paint('#23272d', 0.4, 0.5);
  for (let i = 0; i < count; i++) {
    const [url, label] = pairs[i % pairs.length];
    const x = -W / 2 + span * (i + 0.5);
    const fw = Math.min(1.26, span * 0.88);
    const fh = fw * 0.74;
    g.add(box(fw + 0.07, fh + 0.07, 0.04, frameMat, x, 1.62, 0.02));
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(fw, fh),
      artCanvasMat(kit, `bp-${seed}-${i}`, url, 768, 572, '#f2ecdf', label),
    );
    face.position.set(x, 1.62, 0.043);
    face.userData.live = true;
    g.add(face);
  }
}

function toolCabinet({ W, D, g, m, kit }: RoomPieceCtx) {
  const cabRed = kit.paint('#b83b32', 0.42, 0.35);
  const darkSteel = kit.paint('#23262b', 0.48, 0.5);
  g.add(box(W, 0.96, D, cabRed, 0, 0.52, 0));
  g.add(box(W + 0.02, 0.04, D + 0.02, darkSteel, 0, 1.02, 0));
  for (let i = 0; i < 5; i++) {
    const y = 0.18 + i * 0.165;
    g.add(box(W * 0.9, 0.13, 0.02, darkSteel, 0, y, D / 2 + 0.01));
    g.add(box(W * 0.55, 0.018, 0.03, m.silver, 0, y + 0.02, D / 2 + 0.025));
  }
}

// ───────── 3. 재즈가 흐르는 방: 리듬천국 콘솔, 로즈 이어트레이너, 재즈블렌드 빛의 리본 월
function grooveStation({ W, D, g, m, kit, addLight }: RoomPieceCtx) {
  const body = kit.paint('#2b2129', 0.45, 0.25);
  g.add(box(Math.min(W, 0.92), 0.82, Math.min(D, 0.62), body, 0, 0.41, 0));
  const padColors = ['#f5c45a', '#e985a2', '#6ec4a7'];
  padColors.forEach((hex, idx) => {
    const x = (idx - 1) * 0.24;
    g.add(cyl(0.095, 0.105, 0.04, kit.glow(hex, 1.15), x, 0.85, 0.06, 20));
    g.add(cyl(0.11, 0.11, 0.02, m.brass, x, 0.825, 0.06, 20));
  });
  addLight('#ffd59a', 3.5, 3.2, 0, 1.2, 0.15);
}

function earTrainerDesk({ W, D, g, m, kit }: RoomPieceCtx) {
  // 빈티지 로즈 수트케이스 일렉트릭 피아노 + 헤드폰 + 소리굽쇠
  const caseBlack = kit.paint('#201f24', 0.55, 0.2);
  const silverTop = kit.paint('#c4cad2', 0.28, 0.82);
  const pw = Math.min(W, 1.18);
  const pd = Math.min(D, 0.56);
  g.add(box(pw, 0.22, pd, caseBlack, 0, 0.72, 0));
  g.add(box(pw * 0.96, 0.07, pd * 0.68, silverTop, 0, 0.86, -0.05));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.018, 0.014, 0.62, m.silver, sx * (pw / 2 - 0.08), 0.31, sz * (pd / 2 - 0.08), 10));
    }
  }
  // 흰 건반 + 검은 건반 줄
  g.add(box(pw * 0.88, 0.03, 0.14, kit.paint('#faf7f0', 0.3), 0, 0.84, pd / 2 - 0.08));
  for (let k = -4; k <= 4; k++) {
    if (k === -1 || k === 3) continue;
    g.add(box(0.026, 0.024, 0.085, caseBlack, k * 0.09, 0.862, pd / 2 - 0.1));
  }
}

function ledRibbonWall({ W, g, kit }: RoomPieceCtx) {
  const tex = kit.tex('jazzBlendRibbons', 512, 256, (c, w, h) => {
    c.fillStyle = '#181424';
    c.fillRect(0, 0, w, h);
    const cols = ['#f5c45a', '#e985a2', '#6f8fca', '#5cc4a4'];
    cols.forEach((col, idx) => {
      c.strokeStyle = col;
      c.lineWidth = 14;
      c.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const y = h * (0.24 + idx * 0.17) + Math.sin((x / w) * Math.PI * 2.5 + idx) * 24;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    });
  });
  const mat = kit.once('m:ledRibbonWall', () => new THREE.MeshStandardMaterial({ map: tex, emissive: '#281d38', emissiveIntensity: 0.75, roughness: 0.4 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.18), mat);
  face.position.set(0, 1.65, 0.025);
  g.add(face);
}

// ───────── 4. 빛이 드는 방 / 과녁 방 / 좋아하는 것 방 특화 오브제
function celadonShelf({ W, D, g, m, kit }: RoomPieceCtx) {
  // 고려청자 비색 매병 + 작은 호두 그릇 + 단청 문양 책자
  g.add(box(W, 0.78, D, m.walnut, 0, 0.39, 0));
  const celadon = kit.paint('#8fb5a3', 0.24, 0.08);
  g.add(cyl(0.06, 0.09, 0.28, celadon, -W * 0.24, 0.92, 0, 18));
  g.add(cyl(0.035, 0.06, 0.08, celadon, -W * 0.24, 1.09, 0, 16));
  // 우주의 호두 오브제 그릇
  g.add(cyl(0.11, 0.07, 0.06, kit.paint('#5c3d28', 0.6), 0.08, 0.81, 0.02, 16));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), kit.paint('#8c6239', 0.75)).translateX(0.06).translateY(0.85));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), kit.paint('#9c6f44', 0.75)).translateX(0.12).translateY(0.845));
}

function trophyDesk({ W, D, g, m, kit }: RoomPieceCtx) {
  // 만능 도전자 책상: 스포츠 공, 정십이면체 수학 퍼즐, 산봉우리 페넌트, 첫 개인 노트북
  g.add(box(W, 0.72, D, m.walnut, 0, 0.36, 0));
  const poly = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), kit.paint('#f3c623', 0.35, 0.2));
  poly.position.set(-W * 0.25, 0.81, 0.04);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), kit.paint('#e07a3c', 0.65));
  ball.position.set(W * 0.26, 0.83, 0);
  const notebook = box(0.28, 0.03, 0.21, kit.paint('#2d5a88', 0.7), 0, 0.74, 0.05);
  g.add(poly, ball, notebook);
}

function treasureTable({ W, D, g, kit }: RoomPieceCtx) {
  // 바닷가 조개껍데기와 산길의 예쁜 조약돌 보물 진열 테이블
  const wood = kit.paint('#d9b384', 0.72);
  g.add(box(W, 0.52, D, wood, 0, 0.26, 0));
  const tray = kit.paint('#f7efe2', 0.85);
  g.add(box(W * 0.82, 0.04, D * 0.72, tray, 0, 0.54, 0));
  const colors = ['#ff9ebb', '#7ec8d9', '#ffd97d', '#a8d5ba', '#c3b1e1'];
  for (let i = 0; i < 5; i++) {
    const gem = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055, 1), kit.paint(colors[i], 0.35));
    gem.scale.set(1.2, 0.65, 1.0);
    gem.position.set((i - 2) * (W * 0.14), 0.58, (i % 2 === 0 ? 0.04 : -0.04));
    g.add(gem);
  }
}


function swordArcade({ W, D, g, m, kit, addLight }: RoomPieceCtx) {
  // 소드 콘티넌트 3D 대검 아케이드 포털: 4대 왕국 크리스탈 + 공중 황금 대검 + 듀얼 협동 패드(7794)
  const baseBody = kit.paint('#1c233b', 0.42, 0.35);
  const goldTrim = kit.paint('#f5c45a', 0.28, 0.75);
  const bladeGlow = kit.glow('#ffe07d', 1.35);
  const aw = Math.min(W, 1.05);
  const ad = Math.min(D, 0.72);

  g.add(box(aw, 0.78, ad, baseBody, 0, 0.39, 0));
  g.add(box(aw + 0.04, 0.05, ad + 0.04, goldTrim, 0, 0.8, 0));

  // 1P(블루) & 2P(레드) 협동 조이스틱 패드
  g.add(cyl(0.075, 0.085, 0.03, kit.glow('#4da6ff', 1.2), -0.22, 0.84, 0.14, 16));
  g.add(cyl(0.075, 0.085, 0.03, kit.glow('#ff5c5c', 1.2), 0.22, 0.84, 0.14, 16));

  // 아케이드 전광판 화면
  const scrTex = kit.tex('swordContinentScreen', 512, 280, (c, w, h) => {
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#0f162e');
    grd.addColorStop(1, '#261838');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f5c45a';
    c.lineWidth = 8;
    c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = '#ffe082';
    c.font = '900 34px "Pretendard Variable", sans-serif';
    c.textAlign = 'center';
    c.fillText('🗡️ THE SWORD CONTINENT', w / 2, 74);
    c.fillStyle = '#9ed6ff';
    c.font = '800 22px "Pretendard Variable", sans-serif';
    c.fillText('4 KINGDOMS · 18 STAGES · 10 SKINS', w / 2, 124);
    c.fillStyle = '#ff9ebb';
    c.fillText('2P CO-OP ROOM: 7794 · LIVE SYNC', w / 2, 168);
    c.fillStyle = '#9bf0be';
    c.font = '800 24px "Pretendard Variable", sans-serif';
    c.fillText('▶ PRESS E OR CLICK TO RAID!', w / 2, 224);
  });
  const scrMat = kit.once('m:swordScr', () => new THREE.MeshStandardMaterial({ map: scrTex, emissive: '#1e2444', emissiveIntensity: 0.78, roughness: 0.28 }));
  g.add(box(aw * 0.92, 0.52, 0.05, baseBody, 0, 1.12, -ad * 0.28));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(aw * 0.86, 0.46), scrMat);
  face.position.set(0, 1.12, -ad * 0.28 + 0.028);
  g.add(face);

  // 상단에 꽂힌 상징적인 황금 대검 & 4대 왕국(풀·캣·얼음·불) 속성 오브
  g.add(box(0.09, 0.62, 0.025, bladeGlow, 0, 1.66, -ad * 0.28));
  g.add(box(0.28, 0.045, 0.05, goldTrim, 0, 1.42, -ad * 0.28));
  g.add(cyl(0.022, 0.022, 0.14, m.silver, 0, 1.98, -ad * 0.28, 8));
  const realmColors = ['#58d68d', '#f5c85b', '#7fd4ff', '#ff6b57'];
  realmColors.forEach((col, i) => {
    const x = (i - 1.5) * 0.24;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), kit.glow(col, 1.25));
    gem.position.set(x, 1.46, -ad * 0.12);
    g.add(gem);
  });
  addLight('#ffd97d', 4.2, 3.8, 0, 1.55, 0.15);
}

function garageTrackLight({ W, D, g, kit, addLight, env, f }: RoomPieceCtx) {
  // Eagle 005.jpg 스타일 사각 매트블랙 트랙 스포트라이트 레일
  const top = env.ceilingAt(f) - 0.14;
  const matteBlack = kit.paint('#1a1d21', 0.45, 0.6);
  const spotGlow = kit.glow('#fff4dc', 1.55);
  const rw = Math.max(1.8, W);
  const rd = Math.max(1.8, D);
  g.add(
    box(rw, 0.035, 0.045, matteBlack, 0, top, -rd / 2),
    box(rw, 0.035, 0.045, matteBlack, 0, top, rd / 2),
    box(0.045, 0.035, rd, matteBlack, -rw / 2, top, 0),
    box(0.045, 0.035, rd, matteBlack, rw / 2, top, 0),
    box(0.04, 0.03, rd, matteBlack, 0, top, 0),
  );
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 0, 1]) {
      const lx = sx * (rw / 2);
      const lz = sz * (rd * 0.36);
      g.add(cyl(0.042, 0.052, 0.11, matteBlack, lx, top - 0.07, lz, 12));
      g.add(cyl(0.036, 0.036, 0.018, spotGlow, lx, top - 0.128, lz, 12));
    }
  }
  addLight('#fff3dc', 7.5, 6.8, -rw * 0.28, top - 0.25, 0);
  addLight('#fff3dc', 7.5, 6.8, rw * 0.28, top - 0.25, 0);
}

function garageBayLines({ W, D, g, kit }: RoomPieceCtx) {
  // 에폭시 바닥 위 주차 베이 가이드라인 & 휠 스토퍼
  const lineYellow = kit.paint('#e5b53a', 0.55, 0.1);
  const stopperMat = kit.paint('#1c1f24', 0.85, 0.15);
  for (const bx of [-W * 0.25, W * 0.25]) {
    for (const s of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.065, D * 0.86), lineYellow);
      line.rotation.x = -Math.PI / 2;
      line.position.set(bx + s * 1.18, 0.008, 0);
      g.add(line);
    }
    g.add(box(1.52, 0.085, 0.16, stopperMat, bx, 0.045, -D * 0.38));
    g.add(box(0.42, 0.088, 0.165, lineYellow, bx, 0.046, -D * 0.38));
  }
}

function mccFieldCart({ W, D, g, m, kit }: RoomPieceCtx) {
  // 그레나디어 뒤편 이동식 작전 본부(MCC) 4-Layer 필드 전개 카트(EcoFlow 파워뱅크 + 5G/Starlink 듀얼WAN 케이스 + 차량용 iPad mini 독)
  const darkFrame = kit.paint('#22262c', 0.5, 0.55);
  const oliveCase = kit.paint('#3b4a3e', 0.65, 0.2);
  const cw = Math.min(W, 1.25);
  const cd = Math.min(D, 0.58);
  g.add(box(cw, 0.04, cd, darkFrame, 0, 0.08, 0));
  g.add(box(cw, 0.04, cd, darkFrame, 0, 0.56, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.04, 0.82, 0.04, darkFrame, sx * (cw / 2 - 0.04), 0.42, sz * (cd / 2 - 0.04)));
    }
  }
  // 1단: EcoFlow DELTA 3 Plus LiFePO4 파워뱅크
  g.add(box(0.44, 0.32, 0.28, kit.paint('#2b3038', 0.45, 0.4), -cw * 0.22, 0.26, 0));
  g.add(box(0.14, 0.07, 0.015, kit.glow('#46e0a3', 1.4), -cw * 0.22, 0.31, 0.145));
  // 1단 우측: 5G + Starlink Dual-WAN 펠리컨 러기드 케이스
  g.add(box(0.42, 0.24, 0.32, oliveCase, cw * 0.22, 0.22, 0));
  // 2단: 스윙암 필드 노트북 & 차량용 iPad mini 컨트롤 독
  g.add(box(0.34, 0.016, 0.24, m.silver, -0.18, 0.59, 0.02));
  g.add(box(0.22, 0.15, 0.02, darkFrame, 0.24, 0.68, -0.04));
  g.add(box(0.19, 0.125, 0.008, kit.glow('#6ec3ff', 0.95), 0.24, 0.68, -0.028));
}

export const ROOM_UPGRADE_PIECES: Partial<Record<FurnitureKind, (p: RoomPieceCtx) => void>> = {
  poetryShelf, inkWritingDesk, watercolorEasel, lightShaft,
  swordArcade,
  garageTrackLight,
  garageBayLines,
  mccFieldCart,
  pkmGallery,
  jisanDesk,
  lectureWall,
  constellationMobile,
  leaderboardStand,
  grenadier,
  cla45,
  tiguanPlanWall,
  diecastDisplay,
  opsCommandRig,
  blueprintWall,
  toolCabinet,
  grooveStation,
  earTrainerDesk,
  ledRibbonWall,
  celadonShelf,
  trophyDesk,
  treasureTable,
};
