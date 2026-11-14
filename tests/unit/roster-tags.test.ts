// 승인함 명단의 행사 태그(src/lib/roster-tags.ts): 행사 초대 코드로 들어온 줄에 그 코드의 이름표를 달고, 그 태그로 거른다.
// 이미 들어온 줄에도 붙고(줄의 event_code_id만 본다), 관리 화면에만 보인다(DB 쪽 읽기 권한은 tests/sql/event-codes.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const T = await import('../../src/lib/roster-tags.ts');
const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

const AIB = '0f8fad5b-d9cb-469f-a165-70867728950e';
const TALK = '11111111-1111-4111-8111-111111111111';
const GONE = '22222222-2222-4222-8222-222222222222';
const labels = T.readLabels([
  { id: AIB, label: 'AI&B' },
  { id: TALK, label: '  11월 강연  ' },
  { id: 'not-a-uuid', label: '이상한 줄' },
  { id: GONE, label: '   ' },
  null,
]);
const rows = [
  { id: 'a', event_code_id: null },
  { id: 'b', event_code_id: AIB },
  { id: 'c', event_code_id: TALK },
  { id: 'd', event_code_id: AIB },
  { id: 'e' },
  { id: 'f', event_code_id: GONE },
  { id: 'g', event_code_id: AIB },
];

test('행사 코드 목록 읽기: 이름표의 앞뒤 빈칸을 자르고, 모양이 이상한 줄과 빈 이름표는 뺀다', () => {
  assert.deepEqual([...labels], [[AIB, 'AI&B'], [TALK, '11월 강연']]);
  assert.deepEqual([...T.readLabels(null)], []);
  assert.deepEqual([...T.readLabels({ id: AIB, label: 'x' })], [], '배열이 아니면 비운다');
});

test('줄의 태그: 행사 코드로 들어온 줄은 그 코드의 이름표, 사람별 초대·이메일로 들어온 줄과 모르는 코드는 없음', () => {
  assert.deepEqual(T.tagOf(rows[1], labels), { id: AIB, label: 'AI&B' });
  assert.equal(T.tagOf(rows[0], labels), null);
  assert.equal(T.tagOf(rows[4], labels), null);
  assert.equal(T.tagOf(rows[5], labels), null, '이름표가 비었거나 지운 코드');
});

test('명단의 태그: 많이 달린 것부터, 달린 줄이 없는 코드는 뺀다', () => {
  assert.deepEqual(T.rosterTags(rows, labels), [
    { id: AIB, label: 'AI&B', count: 3 },
    { id: TALK, label: '11월 강연', count: 1 },
  ]);
  assert.deepEqual(T.rosterTags([{ event_code_id: null }], labels), []);
});

test('거르기: 주소의 ?tag=로 그 태그·태그 없음·모두. 모르는 값은 모두(차례는 그대로)', () => {
  const tags = T.rosterTags(rows, labels);
  assert.equal(T.readTagFilter(AIB, tags), AIB);
  assert.equal(T.readTagFilter([TALK, AIB], tags), TALK, '여러 번 오면 처음 것');
  assert.equal(T.readTagFilter('none', tags), 'none');
  for (const bad of [undefined, '', 'x', GONE, 3, null]) assert.equal(T.readTagFilter(bad, tags), 'all', String(bad));
  const ids = (f: string) => T.filterByTag(rows, f, labels).map((r) => r.id);
  assert.deepEqual(ids(AIB), ['b', 'd', 'g']);
  assert.deepEqual(ids(TALK), ['c']);
  assert.deepEqual(ids('none'), ['a', 'e', 'f']);
  assert.deepEqual(ids('all'), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.equal(T.tagHref('all'), '/admin#roster');
  assert.equal(T.tagHref('none'), '/admin?tag=none#roster');
  assert.equal(T.tagHref(AIB), `/admin?tag=${AIB}#roster`);
});

test('승인함: 명단 줄의 코드와 코드 이름표를 집주인의 세션으로 읽어 이름 옆에 태그로 달고, 태그로 거르는 칩을 둔다', () => {
  const page = src('app/admin/page.tsx');
  assert.match(page, /supabase\.from\('roster'\)\.select\('id, display_name, role, slot, email, claimed_by, revoked_at, created_at, event_code_id'\)/);
  assert.match(page, /supabase\.from\('event_codes'\)\.select\('id, label'\)/);
  assert.match(page, /const labels = readLabels\(codes\.error \? null : codes\.data\);/, '0018 전(표 없음)이면 태그 없이');
  assert.match(page, /<RosterSection rows=\{roster\.data \?\? \[\]\} labels=\{labels\} tag=\{sp\.tag\} \/>/);
  // 집주인 확인 뒤에만 읽고, 주소 값은 Suspense 안에서 읽는다(Cache Components)
  const body = page.slice(page.indexOf('async function AdminBody'));
  assert.ok(body.indexOf("viewer.role !== 'admin'") < body.indexOf('await searchParams'));
  assert.match(page, /<Suspense fallback=\{<p className="muted">불러오는 중<\/p>\}>\n        <AdminBody searchParams=\{searchParams\} \/>/);
  const section = src('app/admin/RosterSection.tsx');
  assert.match(section, /const filter = readTagFilter\(tag, tags\);\n  const shown = filterByTag\(rows, filter, labels\);/);
  assert.match(section, /\{shown\.map\(\(r\) => \{\n            const t = tagOf\(r, labels\);/);
  assert.match(section, /\{t \? <span className=\{`badge \$\{rosterCss\.tag\}`\}/);
  assert.match(section, /\{tags\.length \? <TagFilterBar tags=\{tags\} filter=\{filter\} total=\{rows\.length\} untagged=\{untagged\} \/> : null\}/);
  assert.match(section, /aria-current=\{filter === f \? 'page' : undefined\}/);
});

test('태그는 관리 화면에만: 손님이 보는 화면과 API는 명단 태그를 쓰지 않는다', () => {
  // roster-tags를 가져오는 곳은 승인함과 그 명단 칸뿐이다
  const users = ['app/admin/page.tsx', 'app/admin/RosterSection.tsx'];
  for (const f of ['components/walk/social/PeoplePanel.tsx', 'components/walk/social/SocialLayer.tsx', 'app/api/who/route.ts',
    'app/notebook/page.tsx', 'app/avatar/page.tsx', 'components/WalkClient.tsx']) {
    assert.doesNotMatch(src(f), /roster-tags|event_code_id|from\('event_codes'\)/, f);
  }
  for (const f of users) assert.match(src(f), /@\/lib\/roster-tags/);
});
