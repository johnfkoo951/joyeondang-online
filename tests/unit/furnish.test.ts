// 가구 도형(furnish.ts) 가운데 자리 계산만 본다(그리기는 브라우저에서). three.js 도형은 node에서도 만들어진다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { readFileSync } from 'node:fs';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const { DANGHO_RTL, PINE_LAYERS, PINE_SHAPE, veilGeometry, wishNoteSpots } = await import('../../src/walk/furnish.ts');

test('소원 쪽지는 소나무 아랫단 잎 밑면 안쪽에 매달린다(허공에 뜨지 않는다)', () => {
  const [r, h, cy] = PINE_LAYERS[0];
  const { sides, sy, sz, ox, oz } = PINE_SHAPE;
  const spots = wishNoteSpots();
  assert.equal(spots.length, 7);
  const apothem = r * Math.cos(Math.PI / sides);
  for (const s of spots) {
    // 끈이 달리는 높이는 아랫단 밑면
    assert.ok(Math.abs(s.y - (cy - (h * sy) / 2)) < 1e-9, `높이 ${s.y}`);
    // 눌러 놓기 전 좌표로 되돌려 칠각형 안인지 본다: 모든 변의 바깥 법선 쪽 거리가 변까지 거리보다 짧아야 한다
    const ux = s.x - ox, uz = (s.z - oz) / sz;
    let out = -Infinity;
    for (let i = 0; i < sides; i++) {
      const n = ((i + 0.5) / sides) * Math.PI * 2;
      out = Math.max(out, ux * Math.sin(n) + uz * Math.cos(n));
    }
    assert.ok(out < apothem - 0.05, `테두리 밖(또는 끝에 걸침): ${out.toFixed(2)} / ${apothem.toFixed(2)}`);
    // 줄기 가까이가 아니라 가지 끝 쪽(밖에서 보이게)
    assert.ok(Math.hypot(ux, uz) > r * 0.7, `줄기 쪽으로 너무 들어감: ${Math.hypot(ux, uz).toFixed(2)}`);
  }
  // 한쪽에 몰리지 않는다: 이웃한 쪽지 사이 각도가 반 바퀴를 넘지 않는다
  const as = spots.map((s: { a: number }) => s.a).sort((p: number, q: number) => p - q);
  for (let i = 0; i < as.length; i++) {
    const gap = i ? as[i] - as[i - 1] : as[0] + Math.PI * 2 - as[as.length - 1];
    assert.ok(gap < Math.PI, `쪽지 사이가 ${gap.toFixed(2)}rad`);
  }
});

test('꽃 아치의 천은 평평한 판이 아니다: 세로 주름이 지고 아래 1/3에서 기둥 쪽으로 모인다', () => {
  const W = 0.34, H = 2;
  /** 높이(아래 끝 0 ~ 위 끝 1)마다 그 줄의 x 범위와 z 범위 */
  const rows = (toPost: number) => {
    const p = veilGeometry(W, H, toPost).attributes.position;
    const out = new Map<number, { x1: number; x2: number; z1: number; z2: number }>();
    for (let i = 0; i < p.count; i++) {
      const t = Math.round((p.getY(i) / H + 0.5) * 1000) / 1000;
      const r = out.get(t) ?? { x1: Infinity, x2: -Infinity, z1: Infinity, z2: -Infinity };
      r.x1 = Math.min(r.x1, p.getX(i)); r.x2 = Math.max(r.x2, p.getX(i));
      r.z1 = Math.min(r.z1, p.getZ(i)); r.z2 = Math.max(r.z2, p.getZ(i));
      out.set(t, r);
      assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getZ(i)));
    }
    return out;
  };
  const right = rows(0.12), left = rows(-0.12);
  const ts = [...right.keys()].sort((a, b) => a - b);
  assert.ok(ts.length >= 6, `세로 칸 ${ts.length}`);
  assert.equal(ts[0], 0);
  assert.equal(ts[ts.length - 1], 1);
  const top = right.get(1)!;
  assert.ok(Math.abs(top.x2 - top.x1 - W) < 1e-6, '위 끝은 제 너비');
  // 주름: 위 끝 줄이 앞뒤로 물결친다(손가락 두 마디 안쪽)
  assert.ok(top.z2 - top.z1 > 0.04 && top.z2 <= 0.03 + 1e-9 && top.z1 >= -0.03 - 1e-9, `주름 ${(top.z2 - top.z1).toFixed(3)}`);
  // 묶은 자리: 아래 1/3 높이에 가장 가까운 줄이 가장 좁고, 기둥 쪽으로 치우친다
  const tie = ts.reduce((a, b) => (Math.abs(b - 1 / 3) < Math.abs(a - 1 / 3) ? b : a));
  const narrow = right.get(tie)!;
  assert.ok(narrow.x2 - narrow.x1 < W * 0.65, `묶은 자리 너비 ${(narrow.x2 - narrow.x1).toFixed(3)}`);
  for (const t of ts) assert.ok(right.get(t)!.x2 - right.get(t)!.x1 >= narrow.x2 - narrow.x1 - 1e-9);
  assert.ok((narrow.x1 + narrow.x2) / 2 > 0.03, '오른쪽 기둥 쪽으로 모인다');
  const mirrored = left.get(tie)!;
  assert.ok(Math.abs(mirrored.x1 + narrow.x2) < 1e-9 && Math.abs(mirrored.x2 + narrow.x1) < 1e-9, '왼쪽 천은 거울처럼');
});

test('걷기 화면의 당호는 현판처럼 오른쪽부터 읽는다(堂連造 → 造連堂)', () => {
  assert.equal([...DANGHO_RTL].reverse().join(''), '造連堂');
  // 3D 글씨를 그리는 곳은 이 값만 쓴다: 왼쪽부터 읽는 차례(造連堂)를 캔버스에 직접 적지 않는다
  const src = readFileSync(new URL('../../src/walk/furnish.ts', import.meta.url), 'utf8');
  assert.ok(!/fillText\([^)]*造[^)]*\)/.test(src), '캔버스에 造連堂 차례로 적은 곳이 남아 있다');
});
