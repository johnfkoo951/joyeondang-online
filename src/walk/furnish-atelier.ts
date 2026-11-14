import * as THREE from 'three';
import type { RoomPieceCtx } from './furnish-rooms';
function box(p: RoomPieceCtx, w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), p.kit.paint(color, .82)); m.position.set(x, y, z); p.g.add(m); return m;
}
export function poetryShelf(p: RoomPieceCtx) {
  const { W, D, kit, g } = p;
  for (const x of [-W / 2 + .03, W / 2 - .03]) box(p, .06, 1.05, D, '#856044', x, .525, 0);
  for (const y of [.08, .48, 1.02]) box(p, W, .045, D, '#856044', 0, y, 0);
  for (let i = 0; i < 11; i++) box(p, .065, .25 + i % 3 * .015, D * .7, ['#b0a087', '#737b6d', '#a8b7b0'][i % 3], -W * .42 + i * W * .077, .23, 0);
  // 가운데 칸: 시집과 문고본(몇 권은 기울여 꽂는다)
  for (let i = 0; i < 9; i++) {
    const b = box(p, .055, .22 + (i % 4) * .02, D * .65, ['#c9b48f', '#8a6d58', '#9fb0a6', '#d8cdb5'][i % 4], -W * .4 + i * W * .07, .61 + (i % 4) * .01, 0);
    if (i === 6) b.rotation.z = -0.22;
  }
  // One distinct closed poetry volume on the shelf is the game entrance.
  box(p, .44, .045, .28, '#544e43', 0, 1.07, .03);
  box(p, .41, .025, .27, '#eee4cc', 0, 1.094, .03);
  const texture = kit.tex('atelier-poetry-cover', 256, 160, (c, w, h) => {
    c.fillStyle = '#e9dec6'; c.fillRect(0, 0, w, h); c.fillStyle = '#333125'; c.textAlign = 'center'; c.font = '42px serif'; c.fillText('詩', w / 2, 95);
    c.strokeStyle = '#a53b32'; c.strokeRect(194, 106, 30, 30);
  });
  const mat = kit.once('atelier-poetry-mat', () => new THREE.MeshStandardMaterial({ map: texture, roughness: .9 }));
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(.41, .27), mat); cover.rotation.x = -Math.PI / 2; cover.position.set(0, 1.11, .03); g.add(cover);
}
export function inkWritingDesk(p: RoomPieceCtx) {
  const { W, D } = p;
  box(p, W, .05, D, '#79543a', 0, .64, 0);
  for (const x of [-W * .4, W * .4]) box(p, .06, .62, D * .8, '#79543a', x, .31, 0);
  box(p, W * .5, .008, D * .64, '#f5efdf', -W * .12, .672, 0);
  // Inkstone, black ink well, bamboo brush and a red seal.
  box(p, .19, .045, .13, '#3c3d38', W * .32, .69, -.06);
  box(p, .14, .008, .08, '#161a17', W * .32, .716, -.06);
  const brush = box(p, .014, .016, .28, '#b78c50', W * .24, .688, .12); brush.rotation.y = .25;
  box(p, .016, .014, .065, '#292820', W * .24 + .03, .69, .25);
  box(p, .045, .07, .045, '#8b4034', -W * .36, .71, .08);
}
export function watercolorEasel(p: RoomPieceCtx) {
  const { g, kit } = p;
  for (const x of [-.24, .24]) { const leg = box(p, .035, 1.62, .04, '#96724b', x, .81, 0); leg.rotation.z = x < 0 ? -.08 : .08; }
  const rear = box(p, .04, 1.3, .04, '#96724b', 0, .65, -.2); rear.rotation.x = -.22;
  box(p, .8, .04, .16, '#96724b', 0, .9, .045);
  box(p, .69, .52, .025, '#f6eedc', 0, 1.2, .03);
  const tex = kit.tex('watercolor-easel-preview', 320, 240, (c, w, h) => {
    c.fillStyle = '#fff9e8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { c.globalAlpha = .13; c.fillStyle = i % 2 ? '#689c99' : '#8c9db8'; c.beginPath(); c.ellipse(150 + i * 5, 135 + i * 4, 100, 30, -.2, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
  });
  const mat = kit.once('watercolor-easel-preview-mat', () => new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.65, .48), mat); face.position.set(0, 1.2, .045); g.add(face);
  box(p, .28, .02, .16, '#d6c4a1', .18, .93, .1);
  ['#637f9e', '#789d7f', '#b66878', '#c5a24c'].forEach((color, i) => box(p, .035, .009, .04, color, .07 + i * .055, .948, .1));
}

/** 창 하나로 비스듬히 드는 빛줄기: 창(+z) 위쪽에서 방 안쪽 바닥(-z)으로 기울어진 빛 판 네 줄(더하기 혼합, 그림자 없음) */
export function lightShaft({ W, D, g, kit }: RoomPieceCtx) {
  const tex = kit.tex('atelier-light-shaft', 64, 256, (c, w, h) => {
    // 세로: 창 쪽이 밝고 바닥 쪽으로 옅어진다. 가로: 판 가장자리를 흐려 판 모양이 보이지 않게 한다
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      const along = 0.62 * (1 - v) ** 1.4 + 0.03;
      for (let x = 0; x < w; x++) {
        const across = Math.sin(Math.PI * (x + 0.5) / w) ** 1.6;
        const i = (y * w + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 236; img.data[i + 2] = 196;
        img.data[i + 3] = Math.round(255 * along * across);
      }
    }
    c.putImageData(img, 0, 0);
  });
  const mat = kit.once('m:atelierShaft', () => new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  const top = 2.2, zTop = D / 2 - 0.02, zBottom = -D / 2, lean = -W * 0.16, gap = -0.05;
  for (let i = 0; i < 4; i++) {
    const x0 = -W / 2 + (W * i) / 4 + gap, x1 = -W / 2 + (W * (i + 1)) / 4 - gap;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, top, zTop, x1, top, zTop, x1 * 1.12 + lean, 0.03, zBottom, x0 * 1.12 + lean, 0.03, zBottom,
    ], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    g.add(mesh);
  }
}
