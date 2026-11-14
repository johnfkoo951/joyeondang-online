// 방향 그림 시트 다루기(순수 계산). 캔버스 없이 코드로 만든 그림(색 원과 네모로 만든 사람 다섯)으로 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHEET_VIEWS_SCHEMA } from '../../src/lib/avatar/prompt.ts';
import { VIEW_SIZES } from '../../src/lib/avatar/rules.ts';
import {
  ALPHA_FLOOR,
  SHEET_SIZE,
  VIEW_CELLS,
  VIEW_COUNT,
  VIEW_ORDER,
  arrangeViews,
  checkSheet,
  composeAtlas,
  cutFigure,
  decideViews,
  facingSides,
  findFigures,
  layoutAtlas,
  mirror,
  parseSheetViews,
  paste,
  planSheet,
  seenOrder,
  sharesInOrder,
} from '../../src/lib/avatar/sheet.ts';
import { DRESS, HAIR, SHOES, SKIN, VIEWS, blank, bounds, disc, person, px, rect, resizeNearest, sheet } from './helpers/sheet-fixture.ts';

const cutAll = (img: ReturnType<typeof sheet>) => {
  const found = findFigures(img, VIEW_COUNT);
  return { found, cuts: found.figs.map((f) => cutFigure(img, found.label, f)) };
};
const SEEN_OK = VIEW_ORDER.map((view, i) => ({ view, nose: i >= 1 && i <= 3 ? ('left' as const) : ('none' as const) }));

test('약속한 값: 칸 순서, 칸 크기(2:3), 시트 크기, 비전 스키마의 낱말', () => {
  assert.deepEqual([...VIEW_ORDER], ['front', 'three_quarter_front', 'side', 'three_quarter_back', 'back']);
  assert.equal(VIEW_COUNT, VIEW_ORDER.length);
  assert.deepEqual(VIEW_CELLS, { l: [384, 576], s: [256, 384] });
  assert.deepEqual(Object.keys(VIEW_CELLS), [...VIEW_SIZES], '크기 이름은 저장소 경로(viewsPath)와 같다');
  for (const [w, h] of Object.values(VIEW_CELLS)) assert.equal(w * 3, h * 2);
  assert.equal(SHEET_SIZE, '1536x1024');
  assert.equal(ALPHA_FLOOR, 12, '번진 색 띠의 알파(걷기 엔진의 알파 문턱보다 낮아야 그려지지 않는다)');
  assert.deepEqual([...SHEET_VIEWS_SCHEMA.properties.figures.items.properties.view.enum], [...VIEW_ORDER]);
});

test('사람 찾기: 다섯을 왼쪽부터 찾고, 얼룩과 점은 버린다', () => {
  const img = sheet();
  rect(img, 2, 2, 4, 4, DRESS); // 9화소짜리 점
  rect(img, img.w - 9, 3, img.w - 3, 9, HAIR); // 구석의 얼룩(어느 사람의 상자에도 들지 않는다)
  disc(img, img.lefts[2] + 30, img.base + 14, 5, 3, SKIN); // 발밑에 떨어진 얼룩
  const found = findFigures(img, VIEW_COUNT);
  assert.deepEqual(found.rows, [5]);
  assert.equal(found.spare, 0);
  assert.deepEqual(found.figs.map((f) => [f.x0, f.x1]), img.lefts.map((x) => [x + 2, x + 58]), '읽는 순서, 상자는 머리 폭');
  assert.ok(found.figs.every((f) => f.members.length === 1 && f.y0 === img.base - 120 && f.y1 === img.base - 1), '얼룩은 누구에게도 붙지 않는다');
  assert.deepEqual(checkSheet(found), { ok: true });
});

test('사람 찾기: 떨어져 그려진 작은 덩이(귀걸이)는 가까운 사람에게 붙인다', () => {
  const img = sheet();
  // 둘째 사람의 귀 아래(머리 둥근 곳에서 2화소 떨어진 자리)에 15화소짜리 덩이
  const ex = img.lefts[1] + 57, ey = img.base - 120 + 44;
  rect(img, ex, ey, ex + 2, ey + 4, SKIN);
  const found = findFigures(img, VIEW_COUNT);
  assert.deepEqual(found.figs.map((f) => f.members.length), [1, 2, 1, 1, 1]);
  assert.equal(found.figs[1].x1, ex + 2, '상자가 귀걸이까지 넓어진다');
  const cut = cutFigure(img, found.label, found.figs[1]);
  assert.deepEqual(px(cut, ex + 1 - cut.x0, ey + 2 - cut.y0), [...SKIN, 255], '잘라 낸 조각에 귀걸이가 남는다');
  assert.equal(px(img, ex - 1, ey + 2)[3], 0, '머리와 귀걸이는 떨어져 있다');
  // 사람의 상자에서 멀리 떨어진 같은 크기의 덩이는 붙이지 않는다
  const far = sheet();
  rect(far, far.lefts[1] + 66, ey, far.lefts[1] + 68, ey + 4, SKIN);
  assert.deepEqual(findFigures(far, VIEW_COUNT).figs.map((f) => f.members.length), [1, 1, 1, 1, 1]);
  assert.deepEqual(checkSheet(found), { ok: true });
});

test('사람 찾기: 사람만 한 덩이가 다섯보다 많으면 큰 것부터 다섯을 고르되, 남은 것이 있었다고 알린다', () => {
  const img = sheet();
  rect(img, 2, 2, 60, 14, DRESS); // 사람 넓이의 12%를 넘는 큰 얼룩(누구의 상자에도 들지 않는다)
  assert.equal(findFigures(img).figs.length, 6, '몇 명인지 말하지 않으면 큰 덩이를 모두 돌려준다');
  const found = findFigures(img, VIEW_COUNT);
  assert.deepEqual([found.figs.length, found.spare, found.rows], [5, 1, [5]]);
  assert.ok(found.figs.every((f) => f.y1 === img.base - 1), '고른 다섯은 사람이다');
  assert.deepEqual(checkSheet(found), { ok: false, reason: 'sheet_count' }, '무엇인지 모를 큰 덩이가 있으면 받지 않는다');

  // 사람을 열 그린 시트(두 줄): 위 다섯만 골라 그럴듯해 보여도 받지 않는다
  const ten = blank(img.w, 320);
  paste(ten, sheet(), 0, 0);
  paste(ten, sheet(), 0, 160);
  assert.deepEqual(findFigures(ten).rows, [5, 5]);
  const top = findFigures(ten, VIEW_COUNT);
  assert.deepEqual([top.rows, top.spare], [[5], 5]);
  assert.deepEqual(checkSheet(top), { ok: false, reason: 'sheet_count' });
});

test('시트 검사: 다섯이 두 줄로 서 있으면 거절', () => {
  const img = blank(300, 320);
  for (let i = 0; i < 5; i++) person(img, 30 + (i % 3) * 90, i < 3 ? 20 : 180, 60, 120, VIEWS[i]);
  const found = findFigures(img, VIEW_COUNT);
  assert.deepEqual([found.rows, found.spare], [[3, 2], 0]);
  assert.deepEqual(checkSheet(found), { ok: false, reason: 'sheet_rows' });
});

test('시트 검사: 판의 가장자리에 닿은(잘린) 사람이 있으면 거절', () => {
  const img = sheet();
  const found = findFigures(img, VIEW_COUNT);
  assert.deepEqual(checkSheet(found, img), { ok: true });
  const f = found.figs;
  /** i번째 사람의 상자를 크기는 그대로 두고 (dx, dy)만큼 옮긴다 */
  const moved = (i: number, dx: number, dy = 0) => ({ ...found, figs: f.map((x, k) => (k === i ? { ...x, x0: x.x0 + dx, x1: x.x1 + dx, y0: x.y0 + dy, y1: x.y1 + dy } : x)) });
  assert.deepEqual(checkSheet(moved(0, -f[0].x0), img), { ok: false, reason: 'sheet_edge' }, '왼쪽 끝');
  assert.deepEqual(checkSheet(moved(4, img.w - 1 - f[4].x1), img), { ok: false, reason: 'sheet_edge' }, '오른쪽 끝');
  assert.deepEqual(checkSheet(moved(2, 0, -f[2].y0), img), { ok: false, reason: 'sheet_edge' }, '정수리');
  assert.deepEqual(checkSheet(moved(2, 0, img.h - 1 - f[2].y1), img), { ok: false, reason: 'sheet_edge' }, '발끝');
  assert.deepEqual(checkSheet(moved(0, 1 - f[0].x0), img), { ok: true }, '한 화소라도 떨어져 있으면 닿은 것이 아니다');
  assert.deepEqual(checkSheet(moved(0, -f[0].x0)), { ok: true }, '시트 크기를 주지 않으면 보지 않는다');
});

test('시트 검사: 다섯이 아니면, 키가 들쭉날쭉하면, 너무 넓으면 거절', () => {
  const four = sheet();
  rect(four, four.lefts[0] + 40, four.base - 40, four.lefts[1] + 20, four.base - 30, DRESS); // 두 사람이 붙었다
  assert.deepEqual(checkSheet(findFigures(four, VIEW_COUNT)), { ok: false, reason: 'sheet_count' });
  assert.deepEqual(checkSheet(findFigures(sheet({ heights: [120, 120, 96, 120, 120] }), VIEW_COUNT)), { ok: false, reason: 'sheet_heights' });
  assert.deepEqual(checkSheet(findFigures(sheet({ heights: [120, 118, 110, 116, 120] }), VIEW_COUNT)), { ok: true }, '15% 안쪽은 받는다');
  const wide = sheet();
  rect(wide, wide.lefts[4] - 25, wide.base - 60, wide.lefts[4] + 85, wide.base - 50, DRESS); // 팔을 넓게 벌렸다
  assert.deepEqual(checkSheet(findFigures(wide, VIEW_COUNT)), { ok: false, reason: 'sheet_wide' });
  assert.deepEqual(checkSheet(findFigures(blank(50, 50), VIEW_COUNT)), { ok: false, reason: 'sheet_count' });
});

test('시트 검사: 몸이 좁은 사람 여섯 가운데 이웃 둘이 붙어 덩이가 다섯이 된 시트는 거절', () => {
  const six = blank(520, 160);
  const lefts = [20, 100, 150, 240, 320, 400];
  lefts.forEach((x, i) => {
    person(six, x, 20, 48, 120, VIEWS[Math.min(i, 4)]);
    rect(six, x + 20, 60, x + 28, 80, DRESS); // 목(이 폭에서는 머리와 몸이 떨어져 그려진다)
  });
  rect(six, lefts[1] + 30, 90, lefts[2] + 18, 100, DRESS); // 둘째와 셋째의 팔이 닿았다
  const found = findFigures(six, VIEW_COUNT);
  assert.deepEqual([found.figs.length, found.spare, found.rows], [5, 0, [5]]);
  const pair = found.figs[1];
  assert.ok(pair.x1 - pair.x0 + 1 <= (pair.y1 - pair.y0 + 1) * 0.9, '붙은 덩이도 자기 키의 0.9배보다 좁다(키와 견주는 검사는 지나간다)');
  assert.deepEqual(checkSheet(found), { ok: false, reason: 'sheet_wide' });
  // 앞·뒤 그림이 옆 그림보다 조금 넓은 것(어깨, 치마)은 받는다
  const skirt = blank(520, 160);
  [78, 60, 60, 60, 78].forEach((w, i) => {
    person(skirt, 20 + i * 100, 20, 60, 120, VIEWS[i]);
    rect(skirt, 50 + i * 100 - w / 2, 100, 50 + i * 100 + w / 2, 110, DRESS); // 치맛자락
  });
  assert.deepEqual(checkSheet(findFigures(skirt, VIEW_COUNT)), { ok: true });
});

test('잘라 내기: 흐린 광채와 남의 화소는 투명으로, 투명해진 곳에는 가까운 몸 색을 채운다', () => {
  const img = sheet();
  const fx = img.lefts[0], top = img.base - 120;
  // 몸 둘레의 흐린 광채(알파 60)와 4화소 떨어진 점(9화소)
  for (let y = top + 60; y < top + 100; y++) for (let x = fx + 49; x < fx + 53; x++) {
    const i = (y * img.w + x) * 4;
    img.data.set([255, 255, 200, 60], i);
  }
  rect(img, fx + 53, top + 70, fx + 55, top + 72, HAIR);
  const found = findFigures(img, VIEW_COUNT);
  const cut = cutFigure(img, found.label, found.figs[0]);
  assert.equal(cut.w, found.figs[0].x1 - found.figs[0].x0 + 1 + 8, '상자 둘레로 4화소씩 여유');
  const at = (x: number, y: number) => px(cut, x - cut.x0, y - cut.y0);
  assert.equal(at(fx + 30, top + 70)[3], 255, '몸은 불투명');
  assert.equal(at(fx + 50, top + 70)[3], 0, '광채는 지운다');
  assert.equal(at(fx + 54, top + 71)[3], 0, '남의 점은 지운다');
  assert.deepEqual(at(fx + 50, top + 70).slice(0, 3), [...DRESS], '지운 자리에는 옆의 옷 색이 번져 있다');
  assert.deepEqual(at(fx + 30, top - 2).slice(0, 3), [...HAIR], '머리 위 투명한 곳에는 머리카락 색');
});

// ───────── 보는 쪽

test('보는 쪽: 살갗이 머리에서 치우친 쪽을 읽고, 살갗 몫은 앞에서 뒤로 줄어든다', () => {
  const left = facingSides(cutAll(sheet()).cuts);
  assert.deepEqual(left.sides, ['left', 'left', 'left']);
  assert.ok(left.shares[0] > left.shares[1] && left.shares[1] > left.shares[2] && left.shares[2] > left.shares[3] && left.shares[3] > left.shares[4]);
  assert.equal(left.shares[4], 0, '뒷모습에는 살갗이 없다');
  assert.ok(left.ref && Math.hypot(left.ref[0] - SKIN[0], left.ref[1] - SKIN[1], left.ref[2] - SKIN[2]) < 12, '살갗 색은 앞모습 얼굴에서 찾는다');
  const right = facingSides(cutAll(sheet({ turn: 'right' })).cuts);
  assert.deepEqual(right.sides, ['right', 'right', 'right']);
  assert.deepEqual(right.offsets.map((v) => Math.sign(v)), [0, 1, 1, 1, 0]);
  assert.deepEqual(facingSides(cutAll(sheet({ skew: 0 })).cuts).sides, [null, null, null], '치우침이 없으면 가리지 않는다');
  // 옆모습의 치우침이 기준(0.08)에 못 미치면 옆은 모름. 비스듬은 저마다의 기준(0.02, 0.06)으로 가린다
  assert.deepEqual(facingSides(cutAll(sheet({ skew: 0.2 })).cuts).sides, ['left', null, 'left']);
  assert.deepEqual(facingSides([]).sides, [null, null, null]);
  assert.deepEqual(facingSides([blank(10, 10)]).ref, null);
});

test('보는 쪽: 머리를 민 사람은 살갗 색으로 가릴 수 없다. 살갗 몫이 뒤로 갈수록 커지는 것으로 알아챈다', () => {
  // 머리 전체가 살갗 색이라 안경이 있는 쪽의 살갗이 줄어, 왼쪽을 보는 그림이 오른쪽을 보는 것으로 읽힌다
  const { cuts } = cutAll(sheet({ bald: true }));
  const code = facingSides(cuts);
  assert.deepEqual(code.sides, ['right', null, null]);
  assert.ok(code.shares[0] < code.shares[2] && code.shares[2] < code.shares[4], '살갗 몫이 앞 < 옆 < 뒤');
  const plan = decideViews(code, SEEN_OK);
  assert.deepEqual(plan, { redraw: false, mode: 'full', flip: [false, false, false] }, '비전 답(왼쪽)을 따르고 아무것도 뒤집지 않는다');
  assert.deepEqual(decideViews(code, null), { redraw: false, mode: 'frontback', flip: [false, false, false] });
});

test('방향 정하기: 오른쪽을 보는 시트는 뒤집어 모두 왼쪽을 보게 한다', () => {
  const { cuts } = cutAll(sheet({ turn: 'right' }));
  const plan = decideViews(facingSides(cuts), SEEN_OK.map((v) => ({ ...v, nose: v.nose === 'none' ? v.nose : ('right' as const) })));
  assert.deepEqual(plan, { redraw: false, mode: 'full', flip: [true, true, true] });
  const out = arrangeViews(cuts, plan);
  assert.deepEqual(facingSides(out).sides, ['left', 'left', 'left']);
  assert.equal(out[0], cuts[0], '앞과 뒤는 그대로');
  assert.equal(out[4], cuts[4]);
  assert.deepEqual(mirror(mirror(cuts[2])).data, cuts[2].data);
  // 왼쪽을 보는 시트는 손대지 않는다
  const l = cutAll(sheet()).cuts;
  const same = decideViews(facingSides(l), SEEN_OK);
  assert.deepEqual(same, { redraw: false, mode: 'full', flip: [false, false, false] });
  assert.deepEqual(arrangeViews(l, same), l);
});

test('방향 놓기: 뒤집기는 칸마다 따로 듣는다(앞 비스듬, 옆, 뒤 비스듬 차례)', () => {
  const { cuts } = cutAll(sheet());
  const cases: [boolean, boolean, boolean][] = [[true, false, false], [false, true, false], [false, false, true], [true, false, true]];
  for (const flip of cases) {
    const out = arrangeViews(cuts, { mode: 'full', flip });
    assert.equal(out[0], cuts[0], '앞은 그대로');
    assert.equal(out[4], cuts[4], '뒤는 그대로');
    flip.forEach((on, k) => {
      if (on) assert.deepEqual(out[k + 1].data, mirror(cuts[k + 1]).data, `${flip}: ${k + 1}번 칸은 뒤집힌다`);
      else assert.equal(out[k + 1], cuts[k + 1], `${flip}: ${k + 1}번 칸은 그대로`);
    });
  }
  assert.notDeepEqual(mirror(cuts[1]).data, cuts[1].data, '시험 그림은 좌우가 다르다');
});

test('방향 정하기: 보는 쪽을 모르면 앞·뒤 그림만 쓴다(frontback)', () => {
  const { cuts } = cutAll(sheet({ skew: 0 }));
  const code = facingSides(cuts);
  const plan = decideViews(code, null);
  assert.deepEqual(plan, { redraw: false, mode: 'frontback', flip: [false, false, false] });
  assert.deepEqual(arrangeViews(cuts, plan), [cuts[0], cuts[0], cuts[0], cuts[4], cuts[4]]);
  assert.equal(decideViews(code, SEEN_OK.map((v) => ({ ...v, nose: 'none' as const }))).redraw, false);
  // 코드로는 모르지만 비전 모델이 말해 주면 그쪽으로
  assert.deepEqual(decideViews(code, SEEN_OK), { redraw: false, mode: 'full', flip: [false, false, false] });
});

/** 비전 모델의 답: 순서는 맞고 앞 비스듬·옆·뒤 비스듬의 코가 저마다 fq, side, bq 쪽 */
type Nose = 'left' | 'right' | 'none';
const seenNoses = (fq: Nose, side: Nose, bq: Nose) => VIEW_ORDER.map((view, i) => ({ view, nose: (['none', fq, side, bq, 'none'] as const)[i] }));
/** 정한 결과를 짧게: 'full:010'은 옆만 뒤집는다는 뜻 */
const planOf = (sides: Parameters<typeof decideViews>[0]['sides'], seen: ReturnType<typeof seenNoses> | null, shares = [0.4, 0.35, 0.2, 0.05, 0]) => {
  const p = decideViews({ sides, shares }, seen);
  return p.redraw ? 'redraw' : `${p.mode}:${p.flip.map(Number).join('')}`;
};

test('방향 정하기: 옆모습은 둘이 같으면 그쪽, 한쪽만 말하면 그쪽, 다르면 정하지 않는다', () => {
  assert.equal(planOf(['left', 'left', 'left'], seenNoses('left', 'left', 'left')), 'full:000');
  assert.equal(planOf(['right', 'right', 'right'], seenNoses('right', 'right', 'right')), 'full:111');
  assert.equal(planOf(['left', 'left', 'left'], seenNoses('left', 'right', 'left')), 'frontback:000', '둘이 다르다');
  assert.equal(planOf(['right', 'right', 'right'], seenNoses('right', 'left', 'right')), 'frontback:000');
  assert.equal(planOf(['left', 'left', 'left'], null), 'full:000', '비전 답이 없으면 코드 판정만으로');
  assert.equal(planOf(['right', 'right', 'right'], seenNoses('none', 'none', 'none')), 'full:111');
  assert.equal(planOf([null, null, null], seenNoses('right', 'right', 'right')), 'full:111', '코드 판정이 없으면 비전 답');
  assert.equal(planOf([null, null, null], seenNoses('left', 'none', 'left')), 'frontback:000', '옆을 아무도 모른다');
  assert.equal(planOf([null, null, null], null), 'frontback:000');
  assert.equal(planOf(['left', null, 'left'], null), 'frontback:000', '옆을 모르면 비스듬만으로는 쓰지 않는다');
});

test('방향 정하기: 비스듬 그림은 옆모습을 따르고, 살갗 색 판정과 비전 답이 둘 다 반대라고 할 때만 따로 뒤집는다', () => {
  // 하나만 반대라고 하면 옆모습을 따른다(진짜 시트에서 둘 다 한 번씩 틀렸다)
  assert.equal(planOf(['right', 'left', 'left'], seenNoses('left', 'left', 'left')), 'full:000', '살갗 색 판정만 반대');
  assert.equal(planOf(['left', 'left', 'left'], seenNoses('right', 'left', 'left')), 'full:000', '비전 답만 반대');
  assert.equal(planOf(['left', 'left', 'right'], seenNoses('left', 'left', 'none')), 'full:000');
  assert.equal(planOf(['right', 'left', 'right'], null), 'full:000', '비전 답이 없으면 옆모습을 따른다');
  assert.equal(planOf([null, null, null], seenNoses('right', 'left', 'right')), 'full:000', '살갗 색 판정이 없을 때도');
  // 둘 다 반대라고 하면 그 그림만 뒤집는다(옆모습과 다르게 그려진 시트)
  assert.equal(planOf(['right', 'left', 'left'], seenNoses('right', 'left', 'left')), 'full:100');
  assert.equal(planOf(['left', 'left', 'right'], seenNoses('left', 'left', 'right')), 'full:001');
  assert.equal(planOf(['left', 'right', 'left'], seenNoses('left', 'right', 'left')), 'full:010', '옆만 오른쪽');
  assert.equal(planOf(['left', null, null], seenNoses('left', 'right', 'right')), 'full:011', '옆은 비전 답, 앞 비스듬은 둘 다 왼쪽');
});

test('방향 정하기: 살갗 몫이 앞에서 뒤로 줄지 않으면(머리를 민 캐릭터) 살갗 색 판정을 쓰지 않는다', () => {
  // 진짜 시트에서 잰 값: 머리 전체가 살갗 색이라 몫이 뒤로 갈수록 커지고, 눈·안경 쪽의 살갗이 줄어 반대쪽으로 읽혔다
  const bald = [0.69, 0.7, 0.79, 0.82, 0.83];
  const left = seenNoses('left', 'left', 'left');
  assert.equal(planOf(['right', null, null], left, bald), 'full:000', '비전 답을 따르고, 앞 비스듬을 잘못 뒤집지 않는다');
  assert.equal(planOf(['right', 'right', 'right'], left, bald), 'full:000', '살갗 색 판정이 다 반대여도 다툼으로 치지 않는다');
  assert.equal(planOf(['right', 'right', 'right'], seenNoses('right', 'left', 'left'), bald), 'full:000');
  assert.equal(planOf(['left', 'left', 'left'], seenNoses('right', 'right', 'right'), bald), 'full:111');
  assert.equal(planOf(['right', 'right', 'right'], null, bald), 'frontback:000', '비전 답도 없으면 앞·뒤만');
  assert.equal(planOf(['right', 'right', 'right'], seenNoses('none', 'none', 'none'), bald), 'frontback:000');
  assert.equal(planOf(['left', 'left', 'left'], left, [0.3, 0.3, 0.3, 0.3, 0.3]), 'full:000');
});

test('순서 확인: 살갗 몫이 다섯 그림에서 차례로 줄고 뒷모습에는 거의 없어야 순서가 맞다고 본다', () => {
  assert.equal(sharesInOrder([0.4, 0.35, 0.2, 0.05, 0]), true);
  assert.equal(sharesInOrder([0.32, 0.29, 0.19, 0.09, 0.04]), true, '진짜 시트에서 잰 값');
  assert.equal(sharesInOrder([0.4, 0.2, 0.35, 0.05, 0]), false, '이웃 칸(앞 비스듬과 옆)이 바뀌었다');
  assert.equal(sharesInOrder([0.4, 0.35, 0.2, 0, 0.05]), false, '뒤 비스듬과 뒤가 바뀌었다');
  assert.equal(sharesInOrder([0.91, 0.88, 0.67, 0.47, 0.46]), false, '거꾸로 그려 머리카락 색을 살갗으로 잡은 시트: 차례로 줄지만 뒤에도 가득하다');
  assert.equal(sharesInOrder([0.3, 0.3, 0.3, 0.3, 0.3]), false, '같으면 줄어든 것이 아니다');
  assert.equal(sharesInOrder([]), false);
  assert.equal(sharesInOrder([0.4, 0.35, 0.2, 0.05]), false);
});

test('순서 확인: 비전 모델이 다섯 방향을 하나씩 봤을 때만 그 차례를 쓴다', () => {
  assert.deepEqual(seenOrder(SEEN_OK), [0, 1, 2, 3, 4]);
  assert.deepEqual(seenOrder([...SEEN_OK].reverse()), [4, 3, 2, 1, 0]);
  assert.deepEqual(seenOrder([SEEN_OK[2], SEEN_OK[1], SEEN_OK[0], SEEN_OK[3], SEEN_OK[4]]), [2, 1, 0, 3, 4]);
  assert.equal(seenOrder([SEEN_OK[0], SEEN_OK[2], SEEN_OK[2], SEEN_OK[3], SEEN_OK[4]]), null, '같은 방향이 둘');
  assert.equal(seenOrder(SEEN_OK.slice(0, 4)), null);
  assert.equal(seenOrder(null), null);
});

test('시트 쓰기: 순서를 먼저 확인한다. 비전이 다른 순서로 봤으면 바로잡고, 둘이 어긋나면 다시 그리고, 확인할 길이 없으면 기다린다', () => {
  const act = (cuts: ReturnType<typeof cutAll>['cuts'], seen: Parameters<typeof planSheet>[1]) => {
    const p = planSheet(cuts, seen);
    return p.act === 'use' ? `use:${p.mode}:${p.order.join('')}` : p.act;
  };
  const good = cutAll(sheet()).cuts;
  const reversedSeen = [...SEEN_OK].reverse();
  const swappedSeen = [SEEN_OK[0], SEEN_OK[2], SEEN_OK[1], SEEN_OK[3], SEEN_OK[4]];
  const dup = [SEEN_OK[0], SEEN_OK[2], SEEN_OK[2], SEEN_OK[3], SEEN_OK[4]];
  // 맞게 그린 시트
  assert.equal(act(good, SEEN_OK), 'use:full:01234');
  assert.equal(act(good, null), 'use:full:01234', '비전 답이 없어도 살갗 몫으로 순서가 맞으면 쓴다');
  assert.equal(act(good, dup), 'use:full:01234', '뒤죽박죽인 답은 버리고 살갗 색 판정만으로');
  assert.equal(act(good, swappedSeen), 'redraw', '살갗 몫은 맞다는데 비전은 다른 순서라고 한다: 어긋나면 다시 그린다');
  // 거꾸로 그린 시트, 이웃 칸이 바뀐 시트
  const reversed = cutAll(sheet({ order: ['back', 'bq', 'side', 'fq', 'front'] })).cuts;
  assert.equal(act(reversed, reversedSeen), 'use:full:43210', '비전이 본 대로 바로잡는다');
  assert.equal(act(reversed, null), 'wait', '비전 답이 없으면 확인할 길이 없다');
  // 뒤죽박죽인 답: 양 끝도 앞·뒤가 아니라고 보면 다시 그린다
  assert.equal(act(reversed, [SEEN_OK[4], SEEN_OK[2], SEEN_OK[2], SEEN_OK[1], SEEN_OK[0]]), 'redraw');
  const swapped = cutAll(sheet({ order: ['front', 'side', 'fq', 'bq', 'back'] })).cuts;
  assert.equal(act(swapped, swappedSeen), 'use:full:02134');
  const fixed = planSheet(swapped, swappedSeen);
  assert.ok(fixed.act === 'use' && sharesInOrder(fixed.facing.shares), '바로잡은 뒤에는 살갗 몫이 차례로 준다');
  assert.ok(fixed.act === 'use' && fixed.views.length === VIEW_COUNT);
  // 머리를 민 캐릭터: 살갗 몫으로는 순서를 볼 수 없어 비전 답에 기댄다
  const bald = cutAll(sheet({ bald: true })).cuts;
  assert.equal(act(bald, SEEN_OK), 'use:full:01234');
  assert.equal(act(bald, null), 'wait');
  // 가운데 그림 하나를 헷갈린 답(같은 방향이 둘): 양 끝이 앞·뒤로 맞으면 앞·뒤 그림만으로 쓴다(다시 그리지 않는다)
  assert.equal(act(bald, dup), 'use:frontback:01234');
  const fb = planSheet(bald, dup);
  assert.ok(fb.act === 'use' && fb.views[1] === fb.views[0] && fb.views[2] === fb.views[0] && fb.views[3] === fb.views[4], '옆 칸에는 앞 그림, 뒤 비스듬 칸에는 뒤 그림');
  assert.equal(act(bald, [SEEN_OK[1], SEEN_OK[1], SEEN_OK[2], SEEN_OK[3], SEEN_OK[4]]), 'redraw', '첫 그림이 앞이 아니라고 보면 다시 그린다');
  // 그림이 다섯이 아니면 쓰지 않는다
  assert.equal(act(good.slice(0, 4), SEEN_OK.slice(0, 4)), 'redraw');
});

test('비전 답 읽기: 모양이 맞으면 목록, 조금이라도 다르면 null', () => {
  const ok = { figures: SEEN_OK };
  assert.deepEqual(parseSheetViews(JSON.stringify(ok)), SEEN_OK);
  assert.deepEqual(parseSheetViews(ok), SEEN_OK);
  assert.equal(parseSheetViews({ figures: SEEN_OK.slice(0, 3) })?.length, 3, '몇 개인지는 정하는 쪽이 본다');
  for (const raw of [
    null, undefined, '', 'not json', '[]', '{}', '{"figures":{}}', { figures: [] }, { figures: 'front' },
    { figures: [{ view: 'front' }] },
    { figures: [{ view: 'front', nose: 'up' }] },
    { figures: [{ view: 'top', nose: 'none' }] },
    { figures: [null] },
    { figures: Array.from({ length: 13 }, () => ({ view: 'front', nose: 'none' })) },
  ]) {
    assert.equal(parseSheetViews(raw), null, JSON.stringify(raw));
  }
});

// ───────── 묶음 v1에 놓기

/** 시트 한 장을 묶음으로(크기 조절은 가까운 화소 고르기로 대신한다) */
function atlasOf(img: ReturnType<typeof sheet>, size: 'l' | 's') {
  const { cuts } = cutAll(img);
  const [cw, ch] = VIEW_CELLS[size];
  const lay = layoutAtlas(cuts, cw, ch);
  const pieces = cuts.map((c, i) => resizeNearest(c, lay.slots[i].w, lay.slots[i].h));
  return { atlas: composeAtlas(pieces, lay.slots, cw, ch), lay, cw, ch, scale: cuts.map((c, i) => lay.slots[i].h / c.h) };
}
/** 칸 i에서 몸(불투명 화소)의 상자 */
const body = (a: ReturnType<typeof atlasOf>, i: number) => bounds(a.atlas, 128, i * a.cw, (i + 1) * a.cw - 1)!;

test('묶음: 한 줄 다섯 칸, 키는 칸 높이의 95%, 발끝은 아래에서 1.4% 위, 몸 중심선은 칸 가운데', () => {
  for (const size of ['l', 's'] as const) {
    const a = atlasOf(sheet({ heights: [120, 116, 108, 112, 120] }), size);
    assert.deepEqual([a.atlas.w, a.atlas.h], [a.cw * 5, a.ch]);
    assert.equal(a.atlas.data.length, a.cw * 5 * a.ch * 4);
    assert.equal(a.lay.shrink, 1);
    const foot = a.ch - Math.round(a.ch * 0.014);
    assert.equal(foot, size === 'l' ? 568 : 379);
    for (let i = 0; i < 5; i++) {
      const b = body(a, i);
      // 가까운 화소 고르기로 늘린 그림이라 한 화소씩은 어긋난다. 가운데는 원본 화소 반 칸(늘린 배율의 절반)까지
      assert.ok(Math.abs(b.y1 + 1 - foot) <= 1, `칸 ${i}: 발끝이 같은 선`);
      assert.ok(Math.abs(b.y1 - b.y0 + 1 - a.ch * 0.95) <= 1.5, `칸 ${i}: 본래 키가 달라도 같은 키로 맞춘다`);
      assert.ok(Math.abs((b.x0 + b.x1 + 1) / 2 - (i * a.cw + a.cw / 2)) <= a.scale[i] / 2 + 1.5, `칸 ${i}: 좌우 대칭인 몸은 칸 가운데`);
    }
  }
});

test('묶음: 가장 넓은 그림이 칸을 넘으면 다섯을 같은 비율로 줄이고, 발끝은 그대로', () => {
  const img = sheet();
  // 다섯 모두 치맛자락이 옆으로 퍼졌고(폭 71) 셋째가 가장 넓다(폭 101, 키 120). 이웃과는 닿지 않는다
  img.lefts.forEach((x, i) => rect(img, x - (i === 2 ? 20 : 6), img.base - 40, x + (i === 2 ? 80 : 64), img.base - 30, DRESS));
  assert.deepEqual(checkSheet(findFigures(img, VIEW_COUNT)), { ok: true });
  const a = atlasOf(img, 'l');
  const pad = Math.round(384 * 0.02);
  assert.ok(Math.abs(a.lay.shrink - (384 - 2 * pad) / ((101 * 547) / 120)) < 0.01, '가장 넓은 그림이 여백을 뺀 칸 폭에 딱 맞게');
  const hs = [0, 1, 2, 3, 4].map((i) => body(a, i).y1 - body(a, i).y0 + 1);
  assert.ok(Math.max(...hs) - Math.min(...hs) <= 2, '다섯의 키는 여전히 같다');
  assert.ok(Math.abs(hs[0] - 547 * a.lay.shrink) <= 1.5);
  const widest = body(a, 2);
  assert.ok(widest.x0 >= 2 * 384 + pad - 1 && widest.x1 <= 3 * 384 - pad, '넓은 그림도 칸 안에 든다');
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(body(a, i).y1 + 1 - 568) <= 1, '줄여도 발끝은 같은 선');
});

test('묶음: 몸 중심선은 아래쪽(다리)으로 잰다. 한쪽으로 뻗은 머리카락에 끌려가지 않고, 칸을 넘을 때만 민다', () => {
  const mid = 2 * 384 + 192;
  /** 셋째 사람(옆모습)의 머리 뒤로 머리카락을 len만큼 뻗게 그린 묶음에서, 그 칸의 몸 상자와 다리(칸 아래 10%)의 가운데 */
  const withHair = (len: number) => {
    const img = sheet();
    const top = img.base - 120;
    rect(img, img.lefts[2] + 58, top + 10, img.lefts[2] + 58 + len, top + 30, HAIR);
    const a = atlasOf(img, 'l');
    let sx = 0, n = 0;
    for (let y = Math.round(576 * 0.9); y < 576; y++) for (let x = 2 * 384; x < 3 * 384; x++) {
      if (a.atlas.data[(y * a.atlas.w + x) * 4 + 3] >= 128) { sx += x + 0.5; n++; }
    }
    return { b: body(a, 2), legs: sx / n, a };
  };
  const short = withHair(10);
  assert.equal(short.a.lay.shrink, 1);
  assert.ok(short.b.x1 - mid > mid - short.b.x0 + 30, '머리카락 때문에 상자는 오른쪽으로 치우쳐 있다');
  assert.ok(Math.abs(short.legs - mid) <= short.a.scale[2] / 2 + 1.5, '그래도 다리는 칸 가운데');
  // 칸을 넘을 만큼 길면 다섯을 같이 줄이고, 몸이 칸 안에 들 때까지만 옆으로 민다
  const long = withHair(26);
  const pad = Math.round(384 * 0.02);
  assert.ok(long.a.lay.shrink < 1);
  assert.ok(long.b.x0 >= 2 * 384 + pad - 1 && long.b.x1 <= 3 * 384 - pad);
  assert.ok(mid - long.legs > 10, '다리는 왼쪽으로 밀려 있다');
});

test('묶음: 몸 바깥 띠에는 번진 색과 옅은 알파, 그 밖은 색도 알파도 0', () => {
  for (const size of ['l', 's'] as const) {
    const a = atlasOf(sheet(), size);
    const reach = Math.max(4, Math.round(a.cw / 40));
    const b = body(a, 4); // 뒷모습: 머리가 모두 머리카락 색
    const cx = Math.round((b.x0 + b.x1) / 2);
    assert.deepEqual(px(a.atlas, cx, b.y0 + 3), [...HAIR, 255], '몸은 불투명');
    for (const d of [1, reach]) assert.deepEqual(px(a.atlas, cx, b.y0 - d), [...HAIR, ALPHA_FLOOR], `머리 위 ${d}화소: 머리카락 색이 번져 있다`);
    assert.deepEqual(px(a.atlas, cx, b.y0 - reach - 1), [0, 0, 0, 0], '띠 밖은 완전 투명');
    assert.deepEqual(px(a.atlas, b.x0 - reach - 2, b.y0 + Math.round((b.y1 - b.y0) / 4)), [0, 0, 0, 0]);
    // 오른쪽과 아래로도 번진다(머리의 오른쪽 끝, 신발 밑)
    let row = b.y0;
    while (px(a.atlas, b.x1, row)[3] !== 255) row++;
    assert.deepEqual(px(a.atlas, b.x1 + 1, row), [...HAIR, ALPHA_FLOOR], '머리 오른쪽 1화소');
    let col = b.x0;
    while (px(a.atlas, col, b.y1)[3] !== 255) col++;
    assert.deepEqual(px(a.atlas, col, b.y1 + 1), [...SHOES, ALPHA_FLOOR], '신발 밑 1화소');
    // 알파는 0, 띠, 불투명 셋뿐이다(가까운 화소 고르기라 반투명 가장자리가 없다)
    const seen = new Set<number>();
    for (let k = 3; k < a.atlas.data.length; k += 4) seen.add(a.atlas.data[k]);
    assert.deepEqual([...seen].sort((x, y) => x - y), [0, ALPHA_FLOOR, 255]);
    // 투명한 화소에는 색이 남지 않는다
    for (let k = 0; k < a.atlas.data.length; k += 4) {
      if (a.atlas.data[k + 3] === 0 && (a.atlas.data[k] || a.atlas.data[k + 1] || a.atlas.data[k + 2])) assert.fail(`화소 ${k / 4}: 투명한데 색이 있다`);
    }
  }
});

test('묶음: 몸에서 떨어진 가는 선도 보이는 화소면 지우지 않는다(작은 묶음에서 선이 끊기지 않게)', () => {
  // 몸(또렷한 네모)과, 멀리 떨어진 곳의 흐릿한 선(알파 150: 보이지만 또렷하지는 않다), 보이지 않는 얼룩(알파 60)
  const piece = blank(60, 90);
  rect(piece, 20, 30, 39, 89, DRESS);
  rect(piece, 55, 5, 55, 20, HAIR, 150);
  rect(piece, 2, 2, 3, 3, SKIN, 60);
  const atlas = composeAtlas([piece], [{ w: 60, h: 90, ox: 0, oy: 0 }], 60, 90);
  assert.equal(px(atlas, 55, 10)[3], 150, '보이는 선은 그대로 남는다');
  assert.deepEqual(px(atlas, 55, 10).slice(0, 3), [...HAIR], '색도 그대로');
  assert.deepEqual(px(atlas, 2, 2), [0, 0, 0, 0], '보이지 않는 얼룩은 지운다');
});

test('묶음: 반투명 가장자리는 알파를 지키되 색은 몸 색으로 바꾼다(어두운 테가 생기지 않게)', () => {
  const piece = blank(20, 30);
  rect(piece, 4, 4, 15, 25, DRESS);
  rect(piece, 3, 4, 3, 25, [0, 0, 0], 90); // 줄이다 생긴 어두운 반투명 가장자리
  const atlas = composeAtlas([piece], [{ w: 20, h: 30, ox: 10, oy: 5 }], 40, 60);
  assert.deepEqual(px(atlas, 13, 20), [...DRESS, 90]);
  assert.deepEqual(px(atlas, 12, 20), [...DRESS, ALPHA_FLOOR]);
  assert.deepEqual([atlas.w, atlas.h], [40, 60]);
});

test('그림 옮겨 놓기: 판 밖으로 나간 곳은 잘린다', () => {
  const canvas = blank(6, 4);
  const piece = blank(4, 3);
  rect(piece, 0, 0, 3, 2, SKIN);
  paste(canvas, piece, -2, -1);
  paste(canvas, piece, 4, 2);
  const filled = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) if (px(canvas, x, y)[3]) filled.push(`${x},${y}`);
  assert.deepEqual(filled, ['0,0', '1,0', '0,1', '1,1', '4,2', '5,2', '4,3', '5,3']);
  paste(canvas, piece, 9, 9);
  paste(canvas, piece, -9, 0);
  assert.equal(bounds(canvas, 1)?.n, 8, '아예 밖이면 아무것도 그리지 않는다');
});
