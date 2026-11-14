// 박공 아래 잼·좋아하는 것 선반의 순수 계산(node --test, Node 22 타입 제거)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASS_RANGE, BLUES_FORM, CHORDS, CLEAR_ROUNDS, COARSE_WIDEN, GRID_CELLS, II_V_I, MAX_PIECES, PASS_ACC, ROUNDS, SCALE,
  addPiece, barLen, buildRound, composeTimeline, decodeGrid, emptyGrid, encodeGrid, eventsBetween, exampleGrid, heardAt,
  isCleared, judgePhrase, judgeWindow, makeRound, nearestVerdict, noteCount, parseSong, phraseIndexAt, phraseVerdict, roundTimeline, serializeSong,
  slotTime, songTimeline, summarizeRound, swingRatio, toggleCell, totalScore, verdictOf, walkingBass,
  type Ev, type Piece,
} from '../../src/games/jam/logic.ts';
import {
  MIN_TO_FINISH, SHELF_KEY, SLOTS, canFinish, emptyShelf, firstEmpty, parseShelf, place, placedCount, removeAt,
  serializeShelf, shade, slotName, swap, trayOrder,
} from '../../src/games/shelf/logic.ts';
import { ITEMS } from '../../src/games/shelf/items.ts';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------- 스윙 ----------
test('스윙 8분은 대략 2:1이고, 박 자리는 곧은 박에 떨어진다', () => {
  for (const r of ROUNDS) {
    const beat = 60 / r.bpm;
    const sw = swingRatio(r.bpm);
    assert.ok(sw >= 0.6 && sw <= 0.7, `bpm ${r.bpm} 스윙 ${sw}`);
    assert.ok(close(slotTime(1, r.bpm) / beat, sw));
    const long = slotTime(1, r.bpm);
    const short = slotTime(2, r.bpm) - slotTime(1, r.bpm);
    assert.ok(long / short > 1.5 && long / short < 2.4, '앞 8분이 뒤 8분보다 대략 두 배');
    for (let s = 0; s < 16; s += 2) assert.ok(close(slotTime(s, r.bpm), (s / 2) * beat));
    assert.ok(close(slotTime(8, r.bpm), barLen(r.bpm)));
  }
});

// ---------- 판정 창 ----------
test('판정 창: good 안은 좋아요, ok 안은 빠름·늦음, 그 밖은 짝이 아님', () => {
  for (const { win } of ROUNDS) {
    assert.equal(verdictOf(0, win), 'good');
    assert.equal(verdictOf(win.good, win), 'good');
    assert.equal(verdictOf(-win.good, win), 'good');
    assert.equal(verdictOf(-(win.good + 0.005), win), 'early');
    assert.equal(verdictOf(win.good + 0.005, win), 'late');
    assert.equal(verdictOf(-win.ok, win), 'early');
    assert.equal(verdictOf(win.ok, win), 'late');
    assert.equal(verdictOf(win.ok + 0.001, win), null);
    assert.equal(verdictOf(-(win.ok + 0.001), win), null);
    assert.ok(win.good < win.ok);
  }
  // 판이 오를수록 창이 좁아진다
  for (let i = 1; i < ROUNDS.length; i++) {
    assert.ok(ROUNDS[i].win.ok <= ROUNDS[i - 1].win.ok && ROUNDS[i].win.good <= ROUNDS[i - 1].win.good);
    assert.ok(ROUNDS[i].bpm > ROUNDS[i - 1].bpm);
  }
  // ok 창이 가장 가까운 두 자리(엇박 → 다음 박) 간격보다 좁아 두 음을 헷갈리지 않는다
  for (const r of ROUNDS) {
    const gap = slotTime(2, r.bpm) - slotTime(1, r.bpm);
    if (r.adjacent || r.offbeats[1] > 0) assert.ok(r.win.ok < gap, `bpm ${r.bpm}`);
  }
});

test('마침(도장)은 1판만 넘으면 된다. 2·3판은 덤', () => {
  assert.equal(CLEAR_ROUNDS, 1);
  assert.equal(isCleared([false, false, false]), false);
  assert.equal(isCleared([true, false, false]), true, '1판만 넘어도 마침');
  assert.equal(isCleared([false, true, true]), false, '1판을 못 넘으면 뒤 판을 넘어도 아직');
  assert.equal(isCleared([true, true, true]), true);
  assert.equal(isCleared([]), false);
});

test('손가락 기기 판정 창: 조금 넓고, 엇박 판에서도 가까운 두 자리를 헷갈리지 않는다', () => {
  for (const r of ROUNDS) {
    assert.deepEqual(judgeWindow(r, false), r.win, '마우스·키보드는 그대로');
    const w = judgeWindow(r, true);
    assert.ok(w.ok > r.win.ok && w.good > r.win.good, `bpm ${r.bpm} 넓어짐`);
    assert.ok(w.ok <= r.win.ok * COARSE_WIDEN + 1e-12 && w.good <= r.win.good * COARSE_WIDEN + 1e-12);
    assert.ok(w.good < w.ok);
    const gap = slotTime(2, r.bpm) - slotTime(1, r.bpm);
    if (r.adjacent || r.offbeats[1] > 0) assert.ok(w.ok < gap, `bpm ${r.bpm} 엇박 간격 ${gap}보다 좁게`);
  }
  // 넓힌 창이면 조금 더 늦은 탭도 받아 준다
  const r0 = ROUNDS[0];
  const late = r0.win.ok + 0.02;
  assert.equal(verdictOf(late, r0.win), null);
  assert.equal(verdictOf(late, judgeWindow(r0, true)), 'late');
});

test('받아 친 마디 판정: 다 맞음, 빠름, 놓침, 남는 탭', () => {
  const win = ROUNDS[0].win;
  const exp = [10, 10.7, 11.4];
  const perfect = judgePhrase(exp, [10.01, 10.69, 11.4], win);
  assert.deepEqual(perfect.notes.map((n) => n.verdict), ['good', 'good', 'good']);
  assert.equal(perfect.extras, 0);
  assert.equal(perfect.acc, 1);
  assert.equal(phraseVerdict(perfect), 'good');
  const early = judgePhrase(exp, [9.87, 10.57, 11.27], win);
  assert.deepEqual(early.notes.map((n) => n.verdict), ['early', 'early', 'early']);
  assert.equal(phraseVerdict(early), 'early');
  const late = judgePhrase(exp, [10.13, 10.83, 11.4], win);
  assert.equal(phraseVerdict(late), 'late');
  const missed = judgePhrase(exp, [10], win);
  assert.deepEqual(missed.notes.map((n) => n.verdict), ['good', 'miss', 'miss']);
  assert.equal(phraseVerdict(missed), 'miss');
  const extra = judgePhrase(exp, [10, 10.35, 10.7, 11.4, 11.9], win);
  assert.equal(extra.extras, 2);
  assert.ok(extra.acc < 1 && extra.points < perfect.points);
  // 창 밖의 탭은 어느 음에도 붙지 않는다
  const far = judgePhrase([10], [10.5], win);
  assert.equal(far.notes[0].verdict, 'miss');
  assert.equal(far.extras, 1);
  assert.equal(far.points, 0);
  // 순서를 지키며 더 가까운 음에 짝짓는다(먼저 온 음에 욕심내지 않음)
  const pick = judgePhrase([0, 0.2], [0.15], win);
  assert.deepEqual(pick.notes.map((n) => n.verdict), ['miss', 'good']);
  // 탭 순서가 섞여 들어와도 같은 판정
  assert.deepEqual(judgePhrase(exp, [11.4, 10.01, 10.69], win), perfect);
  assert.equal(judgePhrase([], [], win).acc, 1);
});

test('친 순간 판정과 마디 고르기', () => {
  const tl = buildRound(42, 0);
  const win = ROUNDS[0].win;
  const p = tl.phrases[1];
  const e = p.expected[0];
  assert.deepEqual(nearestVerdict(p.expected, e + 0.01, win)?.verdict, 'good');
  assert.equal(nearestVerdict(p.expected, e - 0.15, win)?.verdict, 'early');
  assert.equal(nearestVerdict([], 1, win), null);
  assert.equal(phraseIndexAt(tl.phrases, p.respAt - win.ok / 2, win), 1, '받아 치기 마디 첫 박을 조금 일찍 쳐도 그 마디');
  assert.equal(phraseIndexAt(tl.phrases, p.callAt + 0.3, win), -1, '들려주는 마디에서 친 것은 세지 않음');
  assert.equal(phraseIndexAt(tl.phrases, 0.2, win), -1, '세는 마디');
  assert.equal(phraseIndexAt(tl.phrases, tl.length + 5, win), -1);
});

test('입력 시각을 들리는 오디오 시각으로 바꾼다(출력 지연·입력 지연 보정)', () => {
  const stamp = { contextTime: 5, performanceTime: 1000 };
  assert.ok(close(heardAt(1000, stamp), 5));
  assert.ok(close(heardAt(1250, stamp), 5.25));
  assert.ok(close(heardAt(1250, stamp, 50), 5.2));
  assert.ok(close(heardAt(900, stamp), 4.9));
});

// ---------- 판 만들기 ----------
test('같은 씨앗이면 같은 판, 판마다 규칙(박 수·엇박·붙은 자리)을 지킨다', () => {
  for (let round = 0; round < ROUNDS.length; round++) {
    const spec = ROUNDS[round];
    assert.deepEqual(makeRound(2026, round), makeRound(2026, round));
    assert.deepEqual(buildRound(77, round, 1), buildRound(77, round, 1));
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const ps = makeRound(seed * 7919, round);
      seen.add(JSON.stringify(ps));
      assert.equal(ps.length, spec.phrases);
      ps.forEach((p, k) => {
        assert.deepEqual(p, [...new Set(p)].sort((a, b) => a - b), '오름차순, 겹침 없음');
        assert.ok(p.every((s) => Number.isInteger(s) && s >= 0 && s < 8));
        assert.ok(p.length >= spec.hits[0] && p.length <= spec.hits[1], `hits ${p}`);
        const off = p.filter((s) => s % 2 === 1).length;
        assert.ok(off >= spec.offbeats[0] && off <= spec.offbeats[1], `offbeats ${p}`);
        if (!spec.adjacent) {
          assert.ok(p.every((s, i) => i === 0 || s - p[i - 1] > 1), `붙은 자리 ${p}`);
          assert.equal(p[0], 0, '쉬운 판은 첫 박에서 시작');
        }
        if (k > 0) assert.notDeepEqual(p, ps[k - 1], '바로 앞과 같은 리듬은 피한다');
      });
    }
    assert.ok(seen.size > 30, '씨앗이 바뀌면 판이 바뀐다');
  }
  assert.notDeepEqual(makeRound(5, 1, 0), makeRound(5, 1, 1), '다시 하기는 새 판');
});

test('판 사건표: 세기 → 들려주기·받아 치기 쌍 → 맺음, 30초 남짓', () => {
  for (let round = 0; round < ROUNDS.length; round++) {
    const tl = buildRound(9, round);
    const spec = ROUNDS[round];
    assert.ok(tl.length > 26 && tl.length < 40, `${round + 1}판 ${tl.length.toFixed(1)}초`);
    assert.equal(tl.phrases.length, spec.phrases);
    assert.equal(tl.countIn.length, 4);
    for (let i = 1; i < tl.events.length; i++) assert.ok(tl.events[i].t >= tl.events[i - 1].t, '시각 순');
    const toms = tl.events.filter((e) => e.i === 'tom');
    assert.equal(toms.length, tl.phrases.reduce((n, p) => n + p.pattern.length, 0), '북은 들려주는 마디에만');
    tl.phrases.forEach((p, k) => {
      assert.ok(close(p.callAt, (1 + 2 * k) * tl.bar, 1e-6));
      assert.ok(close(p.respAt, p.callAt + tl.bar, 1e-6));
      p.pattern.forEach((s, j) => assert.ok(close(p.expected[j], p.respAt + slotTime(s, tl.bpm), 1e-9)));
      for (const t of p.expected) assert.ok(!toms.some((e) => close(e.t, t, 1e-6)), '받아 칠 자리에 미리 북을 치지 않음');
    });
    assert.ok(tl.events.every((e) => e.t >= 0 && e.t <= tl.length && e.v > 0 && e.v <= 1));
  }
  const chords = new Set(roundTimeline([[0, 2]], 90).events.filter((e) => e.i === 'piano').map((e) => (e.n ?? []).join()));
  assert.ok(chords.has(CHORDS.Gm7.voicing.join()) && chords.has(CHORDS.C7.voicing.join()), 'ii-V 반주');
});

test('워킹 베이스: 첫 박은 근음, 넷째 박은 다음 근음으로 반음 다가감, 음역 안', () => {
  for (const prog of [II_V_I, BLUES_FORM, ['F7', 'Bb7']]) {
    for (const seed of [1, 2, 3, 99]) {
      const b = walkingBass(prog, seed);
      assert.equal(b.length, prog.length * 4);
      assert.deepEqual(b, walkingBass(prog, seed));
      prog.forEach((c, i) => {
        assert.equal(((b[4 * i] % 12) + 12) % 12, CHORDS[c].root, `${c} 근음`);
        const next = b[(4 * (i + 1)) % b.length];
        assert.equal(Math.abs(b[4 * i + 3] - next), 1, `${c} → 다음 마디 반음 다가감`);
        assert.notEqual(b[4 * i + 2], b[4 * i + 3], '같은 음을 두 번 치지 않음');
      });
      assert.ok(b.every((n) => n >= BASS_RANGE[0] && n <= BASS_RANGE[1]));
    }
  }
});

test('앞질러 보기 창을 이어 붙이면 사건이 빠지거나 겹치지 않는다(되풀이 포함)', () => {
  const events: Ev[] = [0, 0.25, 0.5, 0.99].map((t) => ({ t, i: 'hat', v: 0.5 }));
  const once = [0, 0.13, 0.4, 0.41, 0.77, 1.2].flatMap((from, k, a) => (k + 1 < a.length ? eventsBetween(events, from, a[k + 1]) : []));
  assert.deepEqual(once.map((x) => x.at), [0, 0.25, 0.5, 0.99]);
  const cuts = [0, 0.3, 0.95, 1.0, 1.6, 2.2, 3.05];
  const looped = cuts.flatMap((from, k) => (k + 1 < cuts.length ? eventsBetween(events, from, cuts[k + 1], 1) : []));
  assert.deepEqual(looped.map((x) => Number(x.at.toFixed(3))), [0, 0.25, 0.5, 0.99, 1, 1.25, 1.5, 1.99, 2, 2.25, 2.5, 2.99, 3]);
  assert.deepEqual(eventsBetween(events, 1, 1), []);
  assert.deepEqual(eventsBetween(events, 2, 1), []);
});

test('판 요약: 통과 기준과 별, 전체 점수', () => {
  const win = ROUNDS[0].win;
  const good = judgePhrase([1, 2], [1, 2], win);
  const none = judgePhrase([1, 2], [], win);
  assert.equal(summarizeRound([good, good]).passed, true);
  assert.equal(summarizeRound([good, good]).stars, 3);
  assert.equal(summarizeRound([none, none]).passed, false);
  assert.equal(summarizeRound([good, none]).acc, 0.5);
  assert.ok(PASS_ACC > 0.5 && PASS_ACC <= 0.7);
  assert.equal(summarizeRound([]).passed, false);
  assert.equal(totalScore([100, 80, 0], 2), 220);
  assert.equal(totalScore([-5, 0, 0], 0), 0);
});

// ---------- 두 마디 격자 ----------
test('두 마디 격자: 16글자로 직렬화하고 그대로 되읽는다', () => {
  let g = emptyGrid();
  assert.equal(g.length, GRID_CELLS);
  assert.equal(encodeGrid(g), '----------------');
  g = toggleCell(g, 0, 0);
  g = toggleCell(g, 3, 4);
  g = toggleCell(g, 15, 6);
  assert.equal(encodeGrid(g), '0--4-----------6');
  assert.deepEqual(decodeGrid(encodeGrid(g)), g);
  assert.equal(noteCount(g), 3);
  // 같은 칸 같은 음은 지우고, 다른 음은 바꾼다(한 칸에 한 음)
  assert.equal(toggleCell(g, 3, 4)[3], null);
  assert.equal(toggleCell(g, 3, 2)[3], 2);
  assert.deepEqual(toggleCell(g, 16, 1), g, '칸 밖은 그대로');
  assert.deepEqual(toggleCell(g, 2, SCALE.length), g, '음계 밖은 그대로');
  assert.equal(encodeGrid([1, 2, 99, -1, 1.5, null]), '12--------------');
  for (const bad of ['', '0123', '0--4-----------7', '0--4-----------x', '0--4------------6', 42, null, undefined, ['0']]) {
    assert.equal(decodeGrid(bad), null, `거름: ${String(bad)}`);
  }
  for (let seed = 1; seed < 30; seed++) {
    const ex = exampleGrid(seed);
    assert.deepEqual(ex, exampleGrid(seed));
    assert.ok(noteCount(ex) >= 2);
    assert.deepEqual(decodeGrid(encodeGrid(ex)), ex);
  }
});

test('두 마디 반주·오늘의 곡 사건표', () => {
  const g = toggleCell(toggleCell(emptyGrid(), 0, 0), 8, 4);
  const c = composeTimeline(g);
  assert.ok(close(c.length, 2 * c.bar));
  assert.equal(c.events.filter((e) => e.i === 'vibe').length, 2);
  assert.equal(c.events.filter((e) => e.i === 'bass').length, 8);
  assert.ok(c.events.every((e) => e.t >= 0 && e.t < c.length));
  const song = songTimeline([g, g, g]);
  assert.deepEqual(song.starts.map((t) => Number((t / song.bar).toFixed(6))), [0, 2, 4]);
  assert.equal(song.events.filter((e) => e.i === 'vibe').length, 3 * 2 + 1);
  assert.ok(close(song.length, 7 * song.bar));
  const roots = song.events.filter((e) => e.i === 'bass' && close((e.t / song.bar) % 1, 0, 1e-6)).slice(0, 6).map((e) => ((e.n?.[0] ?? 0) % 12));
  assert.deepEqual(roots, BLUES_FORM.slice(0, 6).map((c2) => CHORDS[c2].root), '블루스 꼴을 따라 근음이 간다');
  assert.equal(songTimeline([]).starts.length, 0);
});

test('오늘의 곡 저장 형식: 되읽기, 깨진 값 거르기, 길이 제한', () => {
  const g = toggleCell(emptyGrid(), 2, 1);
  let pieces: Piece[] = [];
  pieces = addPiece(pieces, g, 1000);
  pieces = addPiece(pieces, emptyGrid(), 2000);
  assert.equal(pieces.length, 1, '빈 격자는 붙이지 않음');
  const raw = serializeSong(pieces);
  assert.deepEqual(JSON.parse(raw), { v: 1, pieces: [{ g: '--1-------------', t: 1000 }] });
  assert.deepEqual(parseSong(raw), pieces);
  for (const bad of [null, undefined, '', '{', '[]', '{"v":2,"pieces":[]}', '{"v":1}', '{"v":1,"pieces":{}}']) {
    assert.deepEqual(parseSong(bad), [], `거름: ${String(bad)}`);
  }
  const mixed = JSON.stringify({ v: 1, pieces: [{ g: '0---------------', t: 5 }, { g: 'nope', t: 6 }, { g: '----------------', t: 7 }, 3, null, { g: '1---------------', t: 'x' }] });
  assert.deepEqual(parseSong(mixed), [{ g: '0---------------', t: 5 }, { g: '1---------------', t: 0 }]);
  let many: Piece[] = [];
  for (let i = 0; i < MAX_PIECES + 5; i++) many = addPiece(many, g, i);
  assert.equal(many.length, MAX_PIECES);
  assert.equal(many[0].t, 5, '오래된 것부터 밀려남');
  assert.equal(parseSong(JSON.stringify({ v: 1, pieces: Array.from({ length: 40 }, (_, i) => ({ g: '0---------------', t: i })) })).length, MAX_PIECES);
});

// ---------- 좋아하는 것 선반 ----------
const IDS = ITEMS.map((i) => i.id);

test('선반 소품 목록: 24개 안팎, id 겹침 없음, 색은 #rrggbb', () => {
  assert.ok(ITEMS.length >= 20 && ITEMS.length <= 30);
  assert.equal(new Set(IDS).size, IDS.length);
  for (const it of ITEMS) {
    assert.match(it.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(it.name.length > 0 && it.name.length <= 8);
    assert.match(it.color, /^#[0-9a-f]{6}$/i);
    assert.ok(it.shape.length > 0);
  }
  assert.ok(IDS.length > SLOTS, '선반보다 소품이 많아 고를 수 있다');
});

test('선반 놓기·옮기기·바꾸기·내리기', () => {
  let s = emptyShelf();
  assert.equal(s.length, SLOTS);
  s = place(s, 0, 'dino');
  s = place(s, 5, 'car');
  assert.equal(placedCount(s), 2);
  s = place(s, 3, 'dino');
  assert.equal(s[0], null, '이미 놓인 소품을 다른 칸에 놓으면 옮겨진다');
  assert.equal(s[3], 'dino');
  s = place(s, 3, 'train');
  assert.equal(s[3], 'train', '찬 칸에 놓으면 앞 소품은 내려간다');
  assert.ok(!s.includes('dino'));
  s = swap(s, 3, 5);
  assert.deepEqual([s[3], s[5]], ['car', 'train']);
  s = swap(s, 5, 11);
  assert.deepEqual([s[5], s[11]], [null, 'train']);
  assert.deepEqual(swap(s, 1, 99), s);
  s = removeAt(s, 11);
  assert.equal(placedCount(s), 1);
  assert.deepEqual(place(s, 12, 'ball'), s, '칸 밖은 그대로');
  assert.equal(firstEmpty(s), 0);
  assert.equal(firstEmpty(s, 3), 4);
  const full = IDS.slice(0, SLOTS).reduce((acc, id, i) => place(acc, i, id), emptyShelf());
  assert.equal(firstEmpty(full), -1);
  assert.equal(canFinish(full), true);
  assert.equal(canFinish(place(place(emptyShelf(), 0, 'dino'), 1, 'car')), MIN_TO_FINISH <= 2);
  assert.equal(slotName(0), '1단 1번째 칸');
  assert.equal(slotName(11), '3단 4번째 칸');
});

test('선반 저장 형식: 되읽기, 모르는 id·겹친 id·깨진 값 거르기', () => {
  assert.equal(SHELF_KEY, 'jy.shelf.v1');
  const s = place(place(emptyShelf(), 2, 'robot'), 7, 'star');
  const raw = serializeShelf(s, 123);
  const data = JSON.parse(raw);
  assert.equal(data.v, 1);
  assert.equal(data.t, 123);
  assert.equal(data.s.length, SLOTS);
  assert.deepEqual(parseShelf(raw, IDS), s);
  for (const bad of [null, undefined, '', 'x', '{"v":2,"s":[]}', '{"v":1,"s":"dino"}', '[]']) {
    assert.deepEqual(parseShelf(bad, IDS), emptyShelf(), `거름: ${String(bad)}`);
  }
  const odd = JSON.stringify({ v: 1, s: ['dino', 'unicorn', 'dino', 4, null, 'car'] });
  assert.deepEqual(parseShelf(odd, IDS), ['dino', null, null, null, null, 'car', null, null, null, null, null, null]);
  const long = JSON.stringify({ v: 1, s: [...IDS.slice(0, 15)] });
  assert.equal(parseShelf(long, IDS).length, SLOTS);
});

test('고르기 순서는 씨앗으로 정해지고 소품을 빠짐없이 담는다', () => {
  assert.deepEqual(trayOrder(IDS, 7), trayOrder(IDS, 7));
  assert.notDeepEqual(trayOrder(IDS, 7), trayOrder(IDS, 8));
  assert.deepEqual([...trayOrder(IDS, 7)].sort(), [...IDS].sort());
  assert.equal(shade('#000000', 0.5), '#808080');
  assert.equal(shade('#ffffff', -0.5), '#808080');
  assert.equal(shade('#336699', 0), '#336699');
  assert.equal(shade('nope', 0.3), 'nope');
});
