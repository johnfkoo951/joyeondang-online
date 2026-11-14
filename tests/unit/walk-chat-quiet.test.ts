// 말 숨기기: 기기 기억(저장소가 없거나 던져도 동작), 감춘 동안 온 말 수와 단추 숫자, 휴대폰 말 기록 줄 수.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHONE_LINES, QUIET_KEY, isQuiet, readQuiet, saveQuiet, setQuiet, shownLines, subscribeQuiet, unreadBadge, unreadCount,
  type QuietStorage,
} from '../../src/components/walk/chat-quiet.ts';

function store(init: Record<string, string> = {}): QuietStorage & { m: Map<string, string> } {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
/** 사생활 보호 창·앱 안 브라우저처럼 꺼내거나 쓰면 던지는 저장소 */
const broken: QuietStorage = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

test('기억: 숨기면 1, 보이면 0을 쓰고 읽으면 그대로. 없으면 보이기', () => {
  const s = store();
  assert.equal(readQuiet(s), false, '처음에는 보이기');
  assert.equal(saveQuiet(true, s), true);
  assert.equal(s.m.get(QUIET_KEY), '1');
  assert.equal(readQuiet(s), true);
  assert.equal(saveQuiet(false, s), true);
  assert.equal(readQuiet(s), false);
  assert.equal(readQuiet(store({ [QUIET_KEY]: '엉뚱한 값' })), false);
});

test('기억: 저장소가 없거나 던지면 보이기로 읽고, 쓰기는 false(화면은 그대로 동작)', () => {
  assert.equal(readQuiet(null), false);
  assert.equal(saveQuiet(true, null), false);
  assert.equal(readQuiet(broken), false);
  assert.equal(saveQuiet(true, broken), false);
});

test('기기 저장소를 꺼내다 던져도(사생활 보호 창) 기본값으로 지나간다', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.equal(readQuiet(), false);
    assert.equal(saveQuiet(true), false);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('이 탭의 값: 저장소가 없어도 바꾼 값이 남고, 듣는 쪽에 알린다. 저장소가 있으면 다시 열어도 그대로', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const s = store();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: s });
  try {
    let n = 0;
    const off = subscribeQuiet(() => n++);
    assert.equal(isQuiet(), false);
    setQuiet(true);
    assert.equal(isQuiet(), true);
    assert.equal(n, 1);
    assert.equal(s.m.get(QUIET_KEY), '1');
    // 다시 열면(새 페이지) 저장소에서 읽는다
    assert.equal(readQuiet(), true);
    off();
    setQuiet(false);
    assert.equal(n, 1, '그만 들은 뒤에는 알리지 않는다');
    assert.equal(isQuiet(), false);
    assert.equal(s.m.get(QUIET_KEY), '0');
    // 저장소가 사라져도(던져도) 이 탭에서는 바꾼 값을 쓴다
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    setQuiet(true);
    assert.equal(isQuiet(), true);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('감춘 동안 온 말 수: 숨긴 때의 들은 수부터 센다. 보이는 동안은 0', () => {
  assert.equal(unreadCount(false, 12, 3), 0);
  assert.equal(unreadCount(true, 3, 3), 0);
  assert.equal(unreadCount(true, 7, 3), 4);
  // 들은 수가 거꾸로 가도(다시 이었을 때 등) 음수가 되지 않는다
  assert.equal(unreadCount(true, 2, 5), 0);
  // 다시 열어 숨긴 채로 시작하면 처음부터(0) 센다
  assert.equal(unreadCount(true, 5, 0), 5);
});

test('단추 숫자: 없으면 비우고, 100 이상은 99+', () => {
  assert.equal(unreadBadge(0), '');
  assert.equal(unreadBadge(-1), '');
  assert.equal(unreadBadge(Number.NaN), '');
  assert.equal(unreadBadge(1), '1');
  assert.equal(unreadBadge(99), '99');
  assert.equal(unreadBadge(100), '99+');
  assert.equal(unreadBadge(2.7), '2');
});

test('말 기록 줄 수: 데스크탑은 받아 둔 다섯 줄 그대로, 휴대폰은 마지막 세 줄', () => {
  const five = ['가', '나', '다', '라', '마'];
  assert.equal(PHONE_LINES, 3);
  assert.deepEqual(shownLines(five, false), five);
  assert.notEqual(shownLines(five, false), five, '받은 배열을 그대로 돌려주지 않는다(고쳐도 원본이 바뀌지 않게)');
  assert.deepEqual(shownLines(five, true), ['다', '라', '마']);
  assert.deepEqual(shownLines(['가', '나'], true), ['가', '나']);
  assert.deepEqual(shownLines([], true), []);
});
