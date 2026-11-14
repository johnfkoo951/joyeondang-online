// 걷기 화면의 사진 캐릭터 올리기: 원본이 아니라 기기에서 줄인 사진을 보내는지, 못 여는 사진·너무 큰 사진에 맞는 말을 하는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 가져온다: 시험에서는 .ts를 붙여 찾게 한다. 서버 저장 동작은 빈 것으로 바꿔 끼운다
const SRC = new URL('../../src/', import.meta.url);
type Hit = { url: string; shortCircuit?: boolean };
type Next = (spec: string, ctx: unknown) => Hit;
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => Hit }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === '@/app/look-actions') {
      return { url: 'data:text/javascript,export const saveMyLook = async () => ({ ok: true });', shortCircuit: true };
    }
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const { uploadPhoto, PHOTO_EVENT } = await import('../../src/components/walk/useCharacter.ts');
const { fitSize } = await import('../../src/lib/avatar/shrink.ts');
const { MAX_PHOTO_BYTES, MESSAGES, RESIZE_LONG_EDGE } = await import('../../src/lib/avatar/rules.ts');

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
/** 내 사진(만 14세 이상)이고 안내에 동의했다 */
const BOTH = { subject: 'self' as const, guardian: false, terms: true };
const original = () => new File([new Uint8Array(9 * 1024 * 1024)], 'IMG_0001.HEIC', { type: 'image/heic' });
const small = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });

type Sent = { url: string; body: FormData };
/** 가짜 fetch·창·저장소를 깔고, 보낸 요청과 알림을 모아 돌려준다 */
function stage(reply: () => Response) {
  const sent: Sent[] = [];
  const events: string[] = [];
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.fetch = async (url: string, init: { body: FormData }) => {
    sent.push({ url, body: init.body });
    return reply();
  };
  g.window = { dispatchEvent: (e: CustomEvent<string>) => { events.push(`${e.type}:${e.detail}`); return true; } };
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return { sent, events, store };
}
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('줄인 뒤 크기: 긴 변을 맞추고 작은 사진은 키우지 않는다', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: RESIZE_LONG_EDGE, height: 768 });
  assert.deepEqual(fitSize(3000, 4000), { width: 768, height: RESIZE_LONG_EDGE });
  assert.deepEqual(fitSize(640, 480), { width: 640, height: 480 });
  assert.deepEqual(fitSize(8000, 2), { width: RESIZE_LONG_EDGE, height: 1 }, '아주 길쭉해도 0이 되지 않는다');
});

test('올리기는 원본이 아니라 줄인 사진을 보낸다', async () => {
  const { sent, events, store } = stage(() => json(202, { id: ID }));
  const file = original();
  const seen: File[] = [];
  const r = await uploadPhoto(file, BOTH, async (f: File) => { seen.push(f); return small(); });
  assert.deepEqual(r, { ok: true, id: ID, slot: null });
  assert.equal(seen[0], file, '고른 사진을 줄이기에 넘긴다');
  assert.equal(sent.length, 1);
  const photo = sent[0].body.get('photo') as File;
  assert.equal(photo.size, 4, '보낸 것은 줄인 사진이다');
  assert.equal(photo.type, 'image/jpeg');
  assert.equal(photo.name, 'photo.jpg', '원본 파일 이름을 보내지 않는다');
  assert.equal(sent[0].body.get('subject'), 'self', '누구 사진인지 보낸다');
  assert.equal(sent[0].body.get('consent_guardian'), null, '내 사진은 보호자 동의를 보내지 않는다');
  assert.equal(sent[0].body.get('consent_terms'), '1');
  assert.equal(sent[0].body.get('consent_views'), '1', '이 화면의 동의 글은 여러 방향 그림도 안내한다');
  assert.deepEqual(events, [`${PHOTO_EVENT}:${ID}`]);
  // 새로 고쳐도 이어 묻게 그리는 중인 일로 이 기기에 둔다(보낸 때와 들어간 칸도)
  const kept = JSON.parse([...store.values()][0]) as { id: string; phase: string; at: number; slot: number | null };
  assert.deepEqual([kept.id, kept.phase, kept.slot], [ID, 'queued', null]);
  assert.ok(Math.abs(kept.at - Date.now()) < 5000);
});

test('칸이 다 찼다는 거절은 까닭을 함께 돌려준다(창이 칸 비우기를 안내한다)', async () => {
  stage(() => json(429, { ok: false, reason: 'slots_full', message: MESSAGES.slotsFull }));
  assert.deepEqual(await uploadPhoto(original(), BOTH, async () => small()),
    { ok: false, message: MESSAGES.slotsFull, reason: 'slots_full' });
});

test('들어간 칸 번호를 받으면 함께 둔다', async () => {
  const { store } = stage(() => json(202, { id: ID, slot: 2 }));
  assert.deepEqual(await uploadPhoto(original(), BOTH, async () => small()), { ok: true, id: ID, slot: 2 });
  assert.equal((JSON.parse([...store.values()][0]) as { slot: number }).slot, 2);
});

test('동의가 빠지면 줄이지도 보내지도 않는다', async () => {
  const { sent } = stage(() => json(202, { id: ID }));
  let shrunk = 0;
  for (const consents of [
    { subject: 'self' as const, guardian: false, terms: false },
    { subject: null, guardian: false, terms: true },
    { subject: 'child' as const, guardian: false, terms: true },
  ]) {
    const r = await uploadPhoto(original(), consents, async () => { shrunk += 1; return small(); });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.message, consents.subject === 'child' ? MESSAGES.guardian : MESSAGES.consent);
  }
  assert.equal(shrunk, 0);
  assert.equal(sent.length, 0);
});

test('아이 사진: 「아이예요」와 보호자 동의를 함께 보낸다(서버가 그 그림 줄에 동의 때를 적는다)', async () => {
  const { sent } = stage(() => json(202, { id: ID }));
  const r = await uploadPhoto(original(), { subject: 'child', guardian: true, terms: true }, async () => small());
  assert.deepEqual(r, { ok: true, id: ID, slot: null });
  assert.deepEqual([sent[0].body.get('subject'), sent[0].body.get('consent_guardian'), sent[0].body.get('consent_terms')], ['child', '1', '1']);
});

test('브라우저가 못 여는 사진이면 보내지 않고 다른 사진을 권한다', async () => {
  const { sent } = stage(() => json(202, { id: ID }));
  const r = await uploadPhoto(original(), BOTH, async () => { throw new Error('decode failed'); });
  assert.deepEqual(r, { ok: false, message: '이 사진은 열 수 없어요. 다른 사진으로 해 주세요.' });
  assert.equal(sent.length, 0);
});

test('줄여도 한도를 넘으면 보내지 않는다', async () => {
  const { sent } = stage(() => json(202, { id: ID }));
  const r = await uploadPhoto(original(), BOTH, async () => new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)]));
  assert.deepEqual(r, { ok: false, message: MESSAGES.tooBig });
  assert.equal(sent.length, 0);
});

test('플랫폼이 크기에서 끊은 413(JSON 아님)에도 너무 크다고 알린다', async () => {
  stage(() => new Response('Request Entity Too Large', { status: 413 }));
  const r = await uploadPhoto(original(), BOTH, async () => small());
  assert.deepEqual(r, { ok: false, message: MESSAGES.tooBig });
});

test('서버가 준 안내는 그대로, 없으면 쉬운 말로', async () => {
  stage(() => json(429, { ok: false, message: MESSAGES.userLimit(10) }));
  assert.deepEqual(await uploadPhoto(original(), BOTH, async () => small()), { ok: false, message: MESSAGES.userLimit(10) });
  stage(() => new Response('<html>', { status: 502 }));
  const r = await uploadPhoto(original(), BOTH, async () => small());
  assert.equal(r.ok, false);
  assert.equal(!r.ok && /[A-Za-z]{4,}/.test(r.message), false, '영어 오류 문구를 그대로 보이지 않는다');
});

test('서버 한도는 배포 플랫폼의 본문 한도(4.5MB)보다 작다', () => {
  assert.ok(MAX_PHOTO_BYTES + 64 * 1024 < 4.5 * 1024 * 1024);
});
