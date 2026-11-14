// 걷기 화면 대화·멘션·걸은 길의 순수 규칙(src/lib/social.ts, src/components/walk/social/mention.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHAT_BODY_MAX, CHAT_GAP_MS, CHAT_MENTIONS_MAX, CHAT_MINUTE_MAX, TRAIL_POINTS_MAX, chatReason, charCount, cleanBody, clip,
  mergeMessages, movedEnough, readChatInput, readChatMessage, readTrailInput, trailPoint, type ChatMessage,
} from '../../src/lib/social.ts';
import { filterPeople, insertMention, keptMentions, mentionAt, mentionsMe, segments } from '../../src/components/walk/social/mention.ts';

const SUB = (c: string) => c.repeat(22);

test('숫자는 DB의 social_limits()와 같다', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0017_chat_trails.sql', import.meta.url), 'utf8');
  const num = (k: string) => Number(new RegExp(`'${k}', (\\d+)`).exec(sql)?.[1]);
  assert.equal(num('chat_body_max'), CHAT_BODY_MAX);
  assert.equal(num('chat_mentions_max'), CHAT_MENTIONS_MAX);
  assert.equal(num('chat_gap_ms'), CHAT_GAP_MS);
  assert.equal(num('chat_minute_max'), CHAT_MINUTE_MAX);
  assert.equal(num('trail_points_max'), TRAIL_POINTS_MAX);
});

test('글 고치기: 한 줄로, 제어문자와 겹친 공백은 한 칸. 글자 수는 이모지도 한 글자', () => {
  assert.equal(cleanBody('  안녕\n\n하세요\t\u0007 !  '), '안녕 하세요 !');
  assert.equal(cleanBody(42), '');
  assert.equal(charCount('가🙂나'), 3);
  assert.equal(clip('가나다라마', 3), '가나…');
  assert.equal(clip('가나', 3), '가나');
});

test('보낸 글 읽기: 비면 empty, 300자 넘으면 too_long, 멘션은 모양이 맞는 sub만 한 번씩, 다섯 명 넘으면 거절', () => {
  assert.deepEqual(readChatInput({ body: '  ' }), { ok: false, reason: 'empty' });
  assert.deepEqual(readChatInput({ body: '가'.repeat(301) }), { ok: false, reason: 'too_long' });
  assert.equal(readChatInput({ body: '🙂'.repeat(300) }).ok, true, '이모지 300개는 300자');
  const r = readChatInput({ body: '안녕', mentions: [SUB('a'), SUB('a'), 'bad', 7, SUB('b')], space: 'room:study', via: 'say' });
  assert.deepEqual(r, { ok: true, input: { body: '안녕', mentions: [SUB('a'), SUB('b')], space: 'room:study', via: 'say' } });
  assert.deepEqual(readChatInput({ body: '안녕', space: 'house:fake', via: 'dm' }),
    { ok: true, input: { body: '안녕', mentions: [], space: null, via: 'window' } });
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(SUB);
  assert.deepEqual(readChatInput({ body: '안녕', mentions: six }), { ok: false, reason: 'too_many_mentions' });
  assert.equal(chatReason('too_fast'), 'too_fast');
  assert.equal(chatReason('weird'), 'error');
});

test('받은 글 읽기: 모양이 틀리면 null, mine이 없으면 내 sub와 견준다, 멘션은 다섯까지', () => {
  const base = { id: 'm1', sub: SUB('a'), name: '손님', body: '안녕', at: '2026-11-11T10:00:00.123456+00:00', mentions: [] };
  const m = readChatMessage(base, SUB('a'));
  assert.ok(m);
  assert.equal(m.mine, true);
  assert.equal(m.ms, Date.parse(base.at));
  assert.equal(readChatMessage({ ...base, mine: false }, SUB('a'))?.mine, false);
  assert.equal(readChatMessage({ ...base, sub: 'short' }), null);
  assert.equal(readChatMessage({ ...base, body: '' }), null);
  assert.equal(readChatMessage({ ...base, at: 'nope' }), null);
  const many = Array.from({ length: 8 }, (_, i) => ({ sub: SUB(String.fromCharCode(98 + i)), name: `n${i}` }));
  assert.equal(readChatMessage({ ...base, mentions: [...many, { sub: 'x', name: 'y' }] })?.mentions.length, 5);
  assert.equal(readChatMessage({ ...base, look: 'str' })?.look, null);
});

test('글 합치기: 같은 id는 하나, 오래된 것부터, 많으면 뒤에서 max개', () => {
  const mk = (id: string, ms: number) => ({ id, ms } as ChatMessage);
  const out = mergeMessages([mk('b', 2), mk('a', 1)], [mk('c', 3), { ...mk('b', 2), body: '새' } as ChatMessage]);
  assert.deepEqual(out.map((m) => m.id), ['a', 'b', 'c']);
  assert.equal(out[1].body, '새');
  assert.deepEqual(mergeMessages([], [mk('x', 1), mk('y', 1), mk('z', 0)], 2).map((m) => m.id), ['x', 'y']);
});

test('멘션 찾기: 커서 앞의 「@낱말」, 맨 앞이거나 공백 뒤만, 공백이 들면 끝', () => {
  assert.deepEqual(mentionAt('안녕 @손', 5), { start: 3, query: '손' });
  assert.deepEqual(mentionAt('@', 1), { start: 0, query: '' });
  assert.equal(mentionAt('mail@example', 12), null);
  assert.equal(mentionAt('@손님 하나', 6), null);
  assert.deepEqual(mentionAt('@손님 하나', 3), { start: 0, query: '손님' });
  assert.equal(mentionAt('안녕', 2), null);
});

test('멘션 넣기: 「@낱말」을 「@이름 」으로 바꾸고 커서는 그 뒤, 뒤의 글은 그대로', () => {
  assert.deepEqual(insertMention('안녕 @손', 3, 5, '손님하나'), { text: '안녕 @손님하나 ', caret: 9 });
  assert.deepEqual(insertMention('@손 반가워요', 0, 2, '손님 둘'), { text: '@손님 둘 반가워요', caret: 6 });
});

test('보낼 멘션: 글에 「@이름」이 남은 사람만, 같은 사람은 한 번, 다섯까지', () => {
  const p = (c: string, name: string) => ({ sub: SUB(c), name });
  const picked = [p('a', '하나'), p('b', '둘'), p('a', '하나'), p('c', '셋')];
  assert.deepEqual(keptMentions('@하나 @셋 안녕', picked), [p('a', '하나'), p('c', '셋')]);
  const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((c) => p(c, c));
  assert.equal(keptMentions(many.map((m) => `@${m.name}`).join(' '), many).length, 5);
  assert.equal(mentionsMe([p('a', '하나')], SUB('a')), true);
  assert.equal(mentionsMe([p('a', '하나')], null), false);
});

test('글 속 멘션 나누기: 긴 이름부터 맞추고, 멘션이 아닌 @는 글 그대로', () => {
  const m = [{ sub: SUB('a'), name: '손님' }, { sub: SUB('b'), name: '손님하나' }];
  assert.deepEqual(segments('@손님하나 와 @손님, me@x', m), [
    { text: '@손님하나', mention: SUB('b') }, { text: ' 와 ' }, { text: '@손님', mention: SUB('a') }, { text: ', me@x' },
  ]);
  assert.deepEqual(segments('그냥 글', []), [{ text: '그냥 글' }]);
});

test('고를 사람: 그 글자가 든 이름, 그 글자로 시작하는 이름 먼저, 나는 빼고, 조합 중인 글자도 찾는다', () => {
  const people = [{ sub: SUB('a'), name: '김손님' }, { sub: SUB('b'), name: '손님둘' }, { sub: SUB('c'), name: '가족' }, { sub: SUB('d'), name: '손' }];
  assert.deepEqual(filterPeople(people, '손').map((p) => p.name), ['손', '손님둘', '김손님']);
  assert.deepEqual(filterPeople(people, '손', SUB('d')).map((p) => p.name), ['손님둘', '김손님']);
  assert.deepEqual(filterPeople(people, '').map((p) => p.name), ['가족', '김손님', '손', '손님둘']);
  assert.deepEqual(filterPeople(people, '소').map((p) => p.name), [], '조합 중인 「소」는 「손」과 다른 글자다');
});

test('걸은 길 점: cm·밀리라디안으로 줄이고, 5cm 넘게 움직였을 때만 새 점', () => {
  const p = trailPoint(1000.4, { x: 1.23456, y: 0, z: -2.5, yaw: Math.PI * 3 });
  assert.deepEqual(p, [1000, 1.23, 0, -2.5, 3.142]);
  assert.equal(movedEnough(null, { x: 0, y: 0, z: 0 }), true);
  assert.equal(movedEnough(p, { x: 1.25, y: 0, z: -2.5 }), false);
  assert.equal(movedEnough(p, { x: 1.3, y: 0, z: -2.5 }), true);
  assert.equal(movedEnough(p, { x: 1.23, y: 0.2, z: -2.5 }), true, '계단');
});

test('걸은 길 받기: 기기 시계를 받은 때에 맞추고, 틀린 점·오래된 점은 버리고, 차례대로 120점·15분 안으로', () => {
  const now = 1_800_000_000_000;
  // 기기 시계가 한 시간 늦다: 보낸 때(sent)로 맞춘다
  const late = now - 3_600_000;
  const r = readTrailInput({ space: 'house:real', sent: late, points: [[late - 2000, 1, 0, 2, 0.5], [late - 1000, 1.5, 0, 2, 0.5], ['x', 1, 2, 3, 4]] }, now);
  assert.deepEqual(r, { ok: true, space: 'house:real', points: [[now - 2000, 1, 0, 2, 0.5], [now - 1000, 1.5, 0, 2, 0.5]] });
  assert.deepEqual(readTrailInput({ space: 'house:x', points: [[now, 0, 0, 0, 0]] }, now), { ok: false, reason: 'bad_space' });
  assert.deepEqual(readTrailInput({ space: 'house:real', points: [[now - 40 * 60_000, 0, 0, 0, 0]] }, now), { ok: false, reason: 'empty' });
  assert.deepEqual(readTrailInput({ space: 'house:real', points: [[now, 5000, 0, 0, 0]] }, now), { ok: false, reason: 'empty' });
  const many = Array.from({ length: 200 }, (_, i) => [now - (200 - i) * 1000, i, 0, 0, 0]);
  const cut = readTrailInput({ space: 'room:study', points: many.reverse() }, now);
  assert.ok(cut.ok);
  assert.equal(cut.points.length, TRAIL_POINTS_MAX);
  assert.deepEqual(cut.points.map((p) => p[0]), [...cut.points.map((p) => p[0])].sort((a, b) => a - b));
  const long = readTrailInput({ space: 'house:real', points: [[now - 18 * 60_000, 0, 0, 0, 0], [now, 1, 0, 0, 0]] }, now);
  assert.deepEqual(long.ok && long.points.length, 1, '15분보다 긴 묶음은 끝 쪽만');
});
