// 단축키 표: 키가 겹치지 않고, 글자 키는 자판 자리로 읽을 수 있는지, 도움말이 표 전체를 보이는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { SHORTCUTS, letterOf, type ShortcutId } from '../../src/components/walk/shortcuts.ts';

// help-rows.ts는 앱과 같은 꼴(확장자 없는 './shortcuts')로 표를 가져온다. 이 시험 프로세스에서만 .ts를 풀어 준다.
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
const { HELP_ORDER, deskHelpRows } = await import('../../src/components/walk/help-rows.ts');

test('단축키 표: 키가 서로 겹치지 않는다', () => {
  const keys = Object.values(SHORTCUTS).map((s) => s.key.toLowerCase());
  assert.equal(new Set(keys).size, keys.length, keys.join(','));
});

test('단축키 표: 캐릭터 B, 대화 C, 접속자 U, 지도 M', () => {
  const want: Partial<Record<ShortcutId, string>> = { character: 'B', chat: 'C', people: 'U', map: 'M' };
  for (const [id, key] of Object.entries(want)) assert.equal(SHORTCUTS[id as ShortcutId].key, key);
  assert.equal(letterOf('character'), 'b');
  assert.equal(letterOf('menu'), null, 'Esc는 글자 키가 아니다');
});

test('도움말: 단축키 표의 모든 항목을 한 번씩, 표의 키와 이름 그대로 보인다', () => {
  const ids = Object.keys(SHORTCUTS) as ShortcutId[];
  assert.deepEqual([...HELP_ORDER].sort(), [...ids].sort(), '차례에 빠지거나 두 번 나온 항목이 없다');
  const rows = deskHelpRows();
  for (const id of ids) {
    const row = rows.find((r) => r.key === SHORTCUTS[id].key);
    assert.ok(row, `${id}(${SHORTCUTS[id].key}) 줄이 있다`);
    assert.equal(row.label, SHORTCUTS[id].label);
    assert.ok(row.text.length > 0);
  }
  // 표 밖의 조작(마우스, 방향키 둘러보기, 걷기)이 앞에 온다. 방향키는 걷기가 아니라 둘러보기다(↑↓ 위아래 보기)
  assert.deepEqual(rows.slice(0, 3).map((r) => r.key), ['마우스', '← → ↑ ↓', 'W A S D']);
  assert.match(rows[1].text, /←→로 제자리에서 돌고 ↑↓로 위아래를 봐요/);
  assert.doesNotMatch(rows[2].text, /방향키/, '걷기 줄에 방향키가 없다');
  assert.match(rows[0].text, /1인칭에서는 휠이나 트랙패드로 위아래를 봐요/);
  // 함께 걷기에서만 쓰는 것: 말하기, 대화, 접속자
  assert.deepEqual(rows.filter((r) => r.together).map((r) => r.label).sort(), ['대화', '말하기', '접속자'].sort());
});

test('도움말: 표의 줄에는 항목 id가 붙는다(브라우저가 못 하는 전체 화면 줄을 흐리게 하려고). 표 밖 조작 줄에는 없다', () => {
  const rows = deskHelpRows();
  assert.deepEqual(rows.slice(0, 3).map((r) => r.id), [undefined, undefined, undefined]);
  const fs = rows.find((r) => r.id === 'fullscreen');
  assert.ok(fs, '전체 화면 줄');
  assert.equal(fs.key, 'F');
  assert.equal(fs.label, '전체 화면');
  // 시점 바로 다음(화면 보기 묶음)
  assert.equal(HELP_ORDER[HELP_ORDER.indexOf('fullscreen') - 1], 'view');
  // 말하기 줄은 말 숨기기도 알려 준다
  assert.match(rows.find((r) => r.id === 'talk')?.text ?? '', /말 숨기기/);
});
