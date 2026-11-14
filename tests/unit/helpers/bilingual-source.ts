// 시험용: 화면 코드(.tsx)에 한국어와 영어를 나란히 적은 곳을 소스 글로 읽어 본다(.tsx는 노드가 바로 불러오지 못한다).
// 첫 화면의 작은 문·더 둘러볼 곳(i18n-entry), 글씨 전시(i18n-pages)가 함께 쓴다.
import assert from 'node:assert/strict';

export const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const DASH = /[—–]/;
/** 쓸 만한 영어: 비지 않고, 한글이 없고, 긴 줄표가 없다 */
export const goodEn = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && !HANGUL.test(v) && !DASH.test(v);

/**
 * 표(객체 배열)에서 칸 이름별 값 글을 모은다. 여러 줄에 걸친 삼항식도 한 값으로 잇는다.
 * 줄이 `이름: …`이면 새 칸, 괄호로 시작하는 줄이면 칸이 끝난다
 */
export function tableFields(code: string): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  let cur: { name: string; text: string } | null = null;
  const flush = () => {
    if (cur) fields.set(cur.name, [...(fields.get(cur.name) ?? []), cur.text]);
    cur = null;
  };
  for (const line of code.split('\n')) {
    const m = /^\s*(\w+):\s*(.*)$/.exec(line);
    if (m) {
      flush();
      cur = { name: m[1], text: m[2] };
    } else if (/^\s*[{}[\]()]/.test(line)) flush();
    else if (cur) cur.text += ` ${line.trim()}`;
  }
  flush();
  return fields;
}

/** 값 글 속의 글자 글(작은따옴표·템플릿 글). 견주는 값(who === 'visitor')은 빼고, 템플릿의 ${…}도 빼고 본다 */
export const literals = (text: string) =>
  [...text.matchAll(/`((?:[^`\\]|\\.)*)`|'((?:[^'\\]|\\.)*)'/g)]
    .filter((m) => !/[=!]==\s*$/.test(text.slice(0, m.index)))
    .map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, ''));

/** 표의 한국어 칸과 영어 칸(이름 뒤에 En): 수가 같고, 한국어 칸 글에는 한글, 영어 칸 글은 쓸 만한 영어, 갈래(삼항식) 수도 같다 */
export function pairedFields(code: string, names: readonly string[], rows: number, where: string) {
  const f = tableFields(code);
  for (const name of names) {
    const ko = f.get(name) ?? [];
    const en = f.get(`${name}En`) ?? [];
    assert.equal(ko.length, rows, `${where} ${name}: ${ko.length}칸`);
    assert.equal(en.length, rows, `${where} ${name}En: ${en.length}칸`);
    ko.forEach((k, i) => {
      const kl = literals(k);
      const el = literals(en[i]);
      assert.equal(el.length, kl.length, `${where} ${name}[${i}] 갈래 수`);
      for (const s of kl) assert.match(s, HANGUL, `${where} ${name}[${i}]`);
      for (const s of el) assert.ok(goodEn(s), `${where} ${name}En[${i}]: ${s}`);
    });
  }
}

/** 두 말 글: <T ko="…" en="…">의 영어와 속성 쌍(label·alt·title={['한국어', '영어']})의 영어. 찾은 쌍의 수를 돌려준다 */
export function inlinePairs(code: string, where: string): number {
  let n = 0;
  for (const m of code.matchAll(/<T\s+ko="([^"]*)"\s+en="([^"]*)"/g)) {
    assert.match(m[1], HANGUL, `${where}: ${m[1]}`);
    assert.ok(goodEn(m[2]), `${where}: ${m[2]}`);
    n++;
  }
  for (const m of code.matchAll(/(?:label|alt|title)=\{\[\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'\s*\]\}/g)) {
    assert.match(m[1], HANGUL, `${where}: ${m[1]}`);
    assert.ok(goodEn(m[2]), `${where}: ${m[2]}`);
    n++;
  }
  return n;
}
