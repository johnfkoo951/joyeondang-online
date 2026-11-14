import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildWorld } from '../../src/content/world.ts';
import { buildScenery, terrain } from '../../src/walk/scenery.ts';
import { MILKY_WAY_AXIS, SKY_KEY, WALK_SKIES, meteorAt, pickSky, pickSkyKept, skyLook, skyOf, starField } from '../../src/walk/sky.ts';

test('하늘 이름: 모르는 값은 낮이고, 주소의 ?sky= 가 사이트 기본값보다 앞선다', () => {
  assert.equal(skyOf(undefined), 'day');
  assert.equal(skyOf(''), 'day');
  assert.equal(skyOf('night'), 'day');
  assert.equal(skyOf(' Stars '), 'stars');
  assert.equal(pickSky('stars', ''), 'stars');
  assert.equal(pickSky('stars', '?sky=day'), 'day');
  assert.equal(pickSky('day', '?room=x&sky=stars'), 'stars');
  assert.equal(pickSky('stars', '?sky=nope'), 'day');
});

test('낮은 원래 값을 그대로 쓰고(null), 다른 하늘은 모든 칸을 채운다', () => {
  assert.equal(skyLook('day'), null);
  for (const s of WALK_SKIES.filter((k) => k !== 'day')) {
    const l = skyLook(s);
    assert.ok(l, s);
    const colors = [...l.background, l.fog, l.hemi[0], l.hemi[1], l.sun[0], l.landscape, l.glass[0], ...Object.values(l.dome)];
    for (const c of colors) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.ok(l.hemi[2] > 0 && l.sun[1] > 0 && l.environment > 0 && l.pools >= 1);
  }
});

test('별: 같은 씨앗이면 같은 하늘이고, 지평선 아래는 없고, 은하수 띠 가까이가 더 짙다', () => {
  const a = starField(2000), b = starField(2000);
  assert.equal(a.length, 2000);
  assert.deepEqual(a.slice(0, 5), b.slice(0, 5));
  assert.ok(a.every((s) => s.y >= -0.04 && Math.abs(Math.hypot(s.x, s.y, s.z) - 1) < 1e-9 && s.mag >= 0 && s.mag <= 1));
  const [ax, ay, az] = MILKY_WAY_AXIS;
  const near = a.filter((s) => Math.abs(s.x * ax + s.y * ay + s.z * az) < 0.15).length / a.length;
  // 띠(|off| < 0.15)는 하늘의 약 15%다. 띠 가까이는 거의 다 남기니 그보다 짙어야 한다
  assert.ok(near > 0.2, `near=${near}`);
  // 밝은 별은 드물다
  assert.ok(a.filter((s) => s.mag > 0.5).length < a.length * 0.15);
});

test('별똥별: 11초 칸마다 1초 남짓 하나, 시각만으로 정해지고 높은 데서 낮은 데로 떨어진다', () => {
  let active = 0, total = 0;
  for (let t = 0; t < 1100; t += 0.05) {
    total++;
    const m = meteorAt(t);
    if (!m) continue;
    active++;
    assert.ok(m.p >= 0 && m.p <= 1);
    assert.ok(m.from[1] > m.to[1] && m.to[1] > 0);
  }
  const share = active / total;
  assert.ok(share > 0.06 && share < 0.16, `share=${share}`);
  assert.deepEqual(meteorAt(123.4), meteorAt(123.4));
  assert.equal(meteorAt(-1), null);
  assert.equal(meteorAt(Number.NaN), null);
});

test('밤 풍경: 낮 하늘 구 대신 밤하늘을 걸고 땅 색을 낮춘다. 낮은 그대로다', () => {
  const world = buildWorld({});
  const day = buildScenery(world, 'autumn', true);
  assert.ok(day.group.getObjectByName('scenery-sky'));
  assert.equal(day.group.getObjectByName('night-sky'), undefined);
  assert.equal(day.update, undefined);
  assert.equal(((day.group.getObjectByName('scenery-ground') as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHexString(), 'ffffff');

  const night = buildScenery(world, 'autumn', true, () => {}, { sky: 'stars', pixelRatio: 2 });
  assert.equal(night.group.getObjectByName('scenery-sky'), undefined);
  const stars = night.group.getObjectByName('night-stars') as THREE.Points;
  assert.equal(stars.geometry.attributes.position.count, 2600);
  assert.equal(((night.group.getObjectByName('scenery-ground') as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHexString(), skyLook('stars')!.landscape.slice(1));
  // 동네 창: 밤에는 빛을 받지 않는 재질에 집마다 색(불 켠 창과 꺼진 창)
  const lit = [] as THREE.InstancedMesh[];
  night.group.traverse((o) => { const m = o as THREE.InstancedMesh; if (m.isInstancedMesh && m.instanceColor && (m.material as THREE.Material).type === 'MeshBasicMaterial') lit.push(m); });
  assert.ok(lit.length >= 1);
  const cam = new THREE.PerspectiveCamera();
  cam.updateMatrixWorld();
  assert.equal(typeof night.update?.(performance.now(), cam, 2, true), 'boolean');
  // 움직임 줄이기: 반짝임도 별똥별도 없어 다시 그리라고 하지 않는다
  const still = buildScenery(world, 'autumn', true, () => {}, { sky: 'stars', still: true });
  for (let i = 0; i < 50; i++) assert.equal(still.update?.(performance.now() + i * 1000, cam, 1, true), false);
  day.dispose(); night.dispose(); still.dispose();
});

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

test('연결: 서버가 WALK_SKY와 WALK_SKY_NOTE를 넘기고, 화면은 주소의 ?sky= 를 앞세워 한 번 정한 하늘을 엔진과 안내 띠에 같이 쓴다', () => {
  const page = src('app/walk/page.tsx');
  assert.match(page, /sky=\{skyOf\(process\.env\.WALK_SKY\)\}/);
  assert.match(page, /skyNote=\{guest \? Array\.from\(process\.env\.WALK_SKY_NOTE\?\.trim\(\) \?\? ''\)\.slice\(0, 80\)\.join\(''\) \|\| undefined : undefined\}/);
  const client = src('components/WalkClient.tsx');
  assert.match(client, /pickSkyKept\(sky, window\.location\.search, store\)/);
  // 로그인을 다녀와도 링크의 하늘이 남는다
  assert.match(page, /login\?next=\$\{encodeURIComponent\(back\)\}/);
  assert.match(client, /sky: skyNow,/);
  assert.match(client, /<SkyHint note=\{skyNote\} \/>/);
  // 방 장면은 방마다 창밖 세계가 따로 있어 하늘을 바꾸지 않는다
  assert.match(src('walk/scene.ts'), /const SKY = isRoom \? null : skyLook\(opt\.sky \?\? 'day'\)/);
});

test('별똥별은 화면 안에 보일 때만 매 프레임 그리게 한다(집 안이거나 등 뒤면 쉬는 그리기에 맡긴다)', () => {
  const world = buildWorld({});
  // 별똥별이 떨어지는 중인 시각. 하늘의 시계는 풍경을 짓는 도중에 시작해 아래 t0보다 조금 늦으므로 0.5초 앞까지 떨어지는 중인 때를 고른다
  let t = 0;
  for (let s = 0.5; s < 400; s += 0.01) if (meteorAt(s - 0.5) && meteorAt(s)) { t = s; break; }
  assert.ok(t > 0);
  const t0 = performance.now();
  const sc = buildScenery(world, 'autumn', true, () => {}, { sky: 'stars' });
  const m = meteorAt(t)!;
  const head = new THREE.Vector3(...m.from).lerp(new THREE.Vector3(...m.to), Math.min(1, m.p * 1.15)).normalize();
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 6000);
  const { cx, cz } = terrain(world);
  const aim = (dir: THREE.Vector3) => { cam.position.set(cx, 1.6, cz); cam.lookAt(dir.clone().multiplyScalar(1000).add(cam.position)); cam.updateMatrixWorld(); cam.updateProjectionMatrix(); };
  aim(head);
  assert.equal(sc.update?.(t0 + t * 1000, cam, 1, true), true);
  // 집 안이면 보이는 쪽을 봐도 매 프레임 그리지 않는다(사라지는 프레임 한 장은 그린다)
  sc.update?.(t0 + t * 1000, cam, 1, false);
  assert.equal(sc.update?.(t0 + t * 1000, cam, 1, false), false);
  aim(head.clone().negate());
  sc.update?.(t0 + t * 1000, cam, 1, true);
  assert.equal(sc.update?.(t0 + t * 1000, cam, 1, true), false);
  sc.dispose();
});

test('링크로 고른 하늘은 이 탭이 닫힐 때까지 남고, ?sky=day면 지운다. 저장소가 없거나 막혀도 주소는 따른다', () => {
  const box = new Map<string, string>();
  const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => { box.set(k, v); }, removeItem: (k: string) => { box.delete(k); } };
  assert.equal(pickSkyKept('day', '?sky=stars', store), 'stars');
  assert.equal(box.get(SKY_KEY), 'stars');
  // 첫 화면을 다녀와 주소에 ?sky가 없어도 남는다
  assert.equal(pickSkyKept('day', '', store), 'stars');
  assert.equal(pickSkyKept('day', '?room=x', store), 'stars');
  assert.equal(pickSkyKept('day', '?sky=day', store), 'day');
  assert.equal(box.has(SKY_KEY), false);
  assert.equal(pickSkyKept('day', '', store), 'day');
  assert.equal(pickSkyKept('stars', '', null), 'stars');
  assert.equal(pickSkyKept('day', '?sky=stars', null), 'stars');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(pickSkyKept('day', '?sky=stars', broken), 'stars');
  assert.equal(pickSkyKept('stars', '', broken), 'stars');
});
