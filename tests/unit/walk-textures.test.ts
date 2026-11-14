// 장면을 정리할 때 2D 캔버스 비우기: 가짜 캔버스로 크기만 본다(그리기는 브라우저 몫).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOB, blob, releaseCanvas } from '../../src/walk/textures.ts';

const fakeCanvas = (w: number, h: number) => ({ width: w, height: h }) as unknown as HTMLCanvasElement;

test('캔버스 텍스처는 원본 캔버스를 비운다. 복제본으로 불러도 같은 캔버스가 비워진다', () => {
  const c = fakeCanvas(512, 512);
  const t = new THREE.CanvasTexture(c);
  t.dispose();
  releaseCanvas(t);
  assert.deepEqual([c.width, c.height], [0, 0]);

  const c2 = fakeCanvas(256, 128);
  const copy = new THREE.CanvasTexture(c2).clone();
  releaseCanvas(copy);
  assert.deepEqual([c2.width, c2.height], [0, 0]);
});

test('캔버스 텍스처가 아니면 건드리지 않고, 무엇이 와도 던지지 않는다', () => {
  const img = { width: 64, height: 32 };
  const plain = new THREE.Texture(img as unknown as HTMLImageElement);
  releaseCanvas(plain);
  assert.deepEqual(img, { width: 64, height: 32 });
  // 장면의 놓을 것 목록에는 재질·기하·묶음도 섞여 있다
  for (const other of [new THREE.MeshStandardMaterial(), new THREE.PlaneGeometry(1, 1), { dispose() {} }, null, undefined]) {
    assert.doesNotThrow(() => releaseCanvas(other));
  }
});

test('발밑 그림자: 넓고 옅은 원과 작고 진한 원을 한 장에 담는다(그리기 호출은 그대로 하나)', () => {
  // 그리는 호출만 받아 적는 가짜 캔버스
  const made: Array<{ width: number; height: number }> = [];
  const rings: Array<{ r0: number; r1: number; stops: Array<[number, string]> }> = [];
  let fills = 0;
  const ctx = {
    createRadialGradient: (_x0: number, _y0: number, r0: number, _x1: number, _y1: number, r1: number) => {
      const ring = { r0, r1, stops: [] as Array<[number, string]> };
      rings.push(ring);
      return { addColorStop: (at: number, color: string) => ring.stops.push([at, color]) };
    },
    fillRect: () => { fills++; },
    fillStyle: null as unknown,
  };
  const g = globalThis as unknown as { document?: unknown };
  const before = g.document;
  g.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ctx }; made.push(c); return c; } };
  try {
    const t = blob();
    assert.ok((t as THREE.CanvasTexture).isCanvasTexture);
    assert.equal(made.length, 1, '캔버스 한 장');
    assert.equal(made[0].width, made[0].height);
    assert.equal(rings.length, 2, '두 겹');
    assert.equal(fills, 2);
    const half = made[0].width / 2;
    const [wide, core] = rings;
    // 넓은 원은 판 끝까지 옅게, 작은 원은 그 절반이 안 되는 크기로 더 진하게. 둘 다 가장자리에서 0으로 사라진다
    assert.ok(wide.r1 > half * 0.9 && wide.r1 <= half);
    assert.ok(Math.abs(core.r1 / half - BLOB.coreSize) < 1e-9 && BLOB.coreSize > 0.3 && BLOB.coreSize < 0.5);
    assert.deepEqual(wide.stops, [[0, `rgba(0,0,0,${BLOB.wide})`], [1, 'rgba(0,0,0,0)']]);
    assert.deepEqual(core.stops, [[0, `rgba(0,0,0,${BLOB.core})`], [1, 'rgba(0,0,0,0)']]);
    assert.ok(BLOB.core > BLOB.wide && BLOB.wide >= 0.15 && BLOB.core <= 0.7);
    t.dispose();
  } finally {
    g.document = before;
  }
});
