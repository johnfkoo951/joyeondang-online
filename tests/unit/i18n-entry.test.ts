// 들머리(머리줄·첫 화면·로그인·초대장·현장 도장·개인정보)의 한·영 표: 모든 줄에 영어가 있고(한글 없이, 긴 줄표 없이),
// 한국어는 예전 그대로이며, 서버 액션이 돌려주는 말은 모두 영어로 옮길 수 있다.
// 개인정보 화면이 다른 파일에서 끼우는 문장은 옮긴 때의 한국어와 지금의 한국어가 같은지 본다(바뀌면 영어도 고칠 차례).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { inlinePairs, pairedFields } from './helpers/bilingual-source.ts';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
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

const src = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const DASH = /[—–]/;
/** 쓸 만한 영어: 비지 않고, 한글이 없고, 긴 줄표가 없다 */
const goodEn = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && !HANGUL.test(v) && !DASH.test(v);

const access = await import('../../src/lib/access.ts');
const ev = await import('../../src/lib/event-code.ts');
const code = await import('../../src/lib/code.ts');
const text = await import('../../src/lib/text.ts');
const inapp = await import('../../src/lib/inapp.ts');
const front = await import('../../src/lib/front.ts');
const qr = await import('../../src/lib/qr.ts');
const M = await import('../../src/lib/messages-en.ts');
const names = await import('../../src/lib/name-lang.ts');
const P = await import('../../src/lib/privacy-en.ts');
const site = await import('../../src/components/site-words.ts');
const home = await import('../../src/components/home/home-words.ts');
const W = await import('../../src/lib/page-words.ts');

test('역할·공개 범위 이름: 한국어 표와 같은 열쇠에 영어가 모두 있고, 한국어는 그대로다', () => {
  assert.deepEqual(Object.keys(access.ROLE_LABEL_EN).sort(), Object.keys(access.ROLE_LABEL).sort());
  assert.deepEqual(Object.keys(access.SCOPE_LABEL_EN).sort(), Object.keys(access.SCOPE_LABEL).sort());
  for (const v of [...Object.values(access.ROLE_LABEL_EN), ...Object.values(access.SCOPE_LABEL_EN)]) assert.ok(goodEn(v), v);
  assert.deepEqual(access.ROLE_LABEL, { public: '구경하는 분', visitor: '확인 중인 분', guest: '초대 손님', family: '가족', admin: '집주인' });
  // 걷기 화면의 「이름 대신 쓰는 말」과 같은 낱말(Visitor, Host…)
  assert.equal(access.ROLE_LABEL_EN.public, 'Visitor');
  assert.equal(access.ROLE_LABEL_EN.admin, 'Host');
});

test('로그인 직후 한 번 보이는 말: 모든 열쇠에 영어', () => {
  assert.deepEqual(Object.keys(ev.FLASH_WORD_EN).sort(), Object.keys(ev.FLASH_WORD).sort());
  for (const [k, v] of Object.entries(ev.FLASH_WORD_EN)) assert.ok(goodEn(v), k);
});

test('초대 코드 결과 말: 들어왔든 못 들어왔든 모든 결과가 영어로 옮겨진다', () => {
  const outcomes = ['guest', 'family', 'admin', 'invalid', 'taken', 'already', 'ended', 'full', 'blocked', 'login', 'error'] as const;
  for (const o of outcomes) {
    const note = ev.claimNote(o);
    assert.ok(HANGUL.test(note.message), `${o}: 한국어는 그대로`);
    assert.ok(goodEn(M.messageEn(note.message)), o);
  }
  assert.equal(ev.claimNote('guest').message, '확인됐어요. 어서 오세요.');
});

test('서버 액션(app/actions.ts)이 직접 적은 말은 모두 영어로 옮길 수 있다(새 말을 쓰면 messages-en에도 더한다)', () => {
  const code = src('app/actions.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const said = [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]).filter((s) => HANGUL.test(s));
  // 말이 아닌 한국어: 사진만 붙인 쪽지의 본문(쪽지 글로 저장되는 값)
  const NOT_MESSAGES = new Set(['사진 한 장']);
  const missing = said.filter((s) => !NOT_MESSAGES.has(s) && !goodEn(M.messageEn(s)));
  assert.ok(said.length >= 20, `찾은 말 ${said.length}개`);
  assert.deepEqual(missing, []);
});

test('검사 함수의 말: 글 검사 까닭과 연락처 경고, 한글 자판 안내가 모두 영어로', () => {
  for (const raw of [undefined, '', '가'.repeat(501), 'a\u0007b']) {
    const r = text.checkBody(raw);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(goodEn(M.messageEn(r.reason)), r.reason);
  }
  const all = '010-1234-5678 a@b.co 평화로 12 https://x.y';
  const ko = text.contactWarnings(all);
  const en = text.contactWarnings(all, 'en');
  assert.equal(ko.length, 4);
  assert.equal(en.length, 4);
  assert.deepEqual(text.contactWarnings(all, 'ko'), ko, '기본은 한국어');
  ko.forEach((w, i) => {
    assert.ok(HANGUL.test(w));
    assert.ok(goodEn(en[i]), en[i]);
    assert.equal(M.messageEn(w), en[i], '서버가 돌려준 경고도 같은 영어로');
  });
  assert.ok(goodEn(M.messageEn(code.HANGUL_KEYBOARD_NOTE)));
  assert.equal(code.shortCodeNote('ㅁㄴㅇㄹ', 8, '초대 코드를 다시 확인해 주세요.'), code.HANGUL_KEYBOARD_NOTE);
  assert.equal(M.messageEn('모르는 말'), null, '모르는 말은 옮기지 않는다');
  assert.equal(M.messageEn(null), null);
  for (const k of M.MESSAGE_KEYS) assert.ok(goodEn(M.messageEn(k)), k);
});

test('쪽지 한도와 쪽지 사진 안내: 서버 액션이 돌려주는 그 말들도 messageEn이 같은 영어로 옮긴다', async () => {
  const RE = await import('../../src/lib/record-errors.ts');
  const NP = await import('../../src/lib/note-photo-words.ts');
  for (const db of ['too_many_today', 'too_many']) {
    const ko = RE.recordLimitMessage(db);
    assert.ok(ko && HANGUL.test(ko), db);
    assert.equal(M.messageEn(ko), RE.RECORD_WORDS_EN[ko as string], db);
  }
  for (const [ko, en] of Object.entries(NP.NOTE_PHOTO_WORDS_EN)) assert.equal(M.messageEn(ko), en, ko);
  assert.equal(M.messageEn(NP.notePhotoHourly(NP.HOURLY_PHOTOS)), NP.NOTE_PHOTO_WORDS_EN[NP.notePhotoHourly(NP.HOURLY_PHOTOS)]);
  for (const r of Object.values(NP.NOTE_PHOTO_REASON)) assert.ok(goodEn(M.messageEn(r)), r);
});

test('로그인 화면의 오류 말: 한국어 표(ERROR_WORD)의 열쇠마다 영어', () => {
  const page = src('app/login/page.tsx');
  const table = page.slice(page.indexOf('const ERROR_WORD'), page.indexOf('};', page.indexOf('const ERROR_WORD')));
  const keys = [...table.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ['busy', 'exchange', 'no_code', 'not_ready', 'oauth']);
  assert.deepEqual(Object.keys(M.LOGIN_ERROR_EN).sort(), keys);
  for (const k of keys) assert.ok(goodEn(M.LOGIN_ERROR_EN[k]), k);
});

test('앱 안 브라우저: 이름과 바깥으로 여는 단추 글의 영어, 한국어는 그대로', () => {
  assert.deepEqual(Object.keys(inapp.INAPP_NAME_EN).sort(), Object.keys(inapp.INAPP_NAME).sort());
  for (const v of Object.values(inapp.INAPP_NAME_EN)) assert.ok(goodEn(v), v);
  const android = 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
  const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  assert.equal(inapp.escapeLabel('kakao', ios), '바깥 브라우저로 열기');
  assert.equal(inapp.escapeLabel('webview', android), 'Chrome에서 열기');
  assert.equal(inapp.escapeLabel('webview', ios), 'Safari에서 열기');
  assert.equal(inapp.escapeLabel('kakao', ios, 'en'), 'Open in your browser');
  assert.equal(inapp.escapeLabel('webview', android, 'en'), 'Open in Chrome');
  assert.equal(inapp.escapeLabel('webview', ios, 'en'), 'Open in Safari');
});

test('석등 한 줄: 기본은 한국어 그대로, 영어는 갈래마다(한 장·여러 장)', () => {
  const cases = [null, { lit: 0, today: 0 }, { lit: 1, today: 1 }, { lit: 2, today: 5 }, { lit: 1, today: 0 }, { lit: 12, today: 3 }, { lit: 12, today: 0 }];
  for (const l of cases) {
    assert.deepEqual(front.lanternWords(l, 'ko'), front.lanternWords(l));
    const en = front.lanternWords(l, 'en');
    const ko = front.lanternWords(l);
    assert.ok(goodEn(en.line), JSON.stringify(l));
    assert.equal(en.today === null, ko.today === null, '오늘 수는 두 말에서 함께 보이거나 함께 숨는다');
    if (en.today) assert.ok(goodEn(en.today));
  }
  assert.equal(front.lanternWords({ lit: 1, today: 1 }, 'en').line, "Today's note lit the stone lantern");
  assert.equal(front.lanternWords({ lit: 3, today: 3 }, 'en').line, "Today's 3 notes lit the stone lantern");
  assert.equal(front.lanternWords({ lit: 1, today: 0 }, 'en').line, '1 note has lit the stone lantern');
  assert.deepEqual(front.lanternWords({ lit: 12, today: 3 }, 'en'), { line: '12 notes have lit the stone lantern', today: '3 today' });
});

test('인사 이름: 이름 대신 쓴 「손님」만 영어(Guest), 사람이 지은 이름은 그대로', () => {
  assert.equal(front.greetName(null), front.GREET_FALLBACK);
  assert.equal(front.greetNameEn(front.greetName('')), 'Guest');
  assert.equal(front.greetNameEn('김손님'), '김손님');
  assert.equal(front.greetNameEn('Yohan'), 'Yohan');
});

test('사람이 지은 글의 lang: 한글이 있으면 ko, 없으면 정하지 않는다', () => {
  assert.equal(names.nameLang('구요한'), 'ko');
  assert.equal(names.nameLang('Yohan 구'), 'ko');
  assert.equal(names.nameLang('ㅎㅎ'), 'ko');
  assert.equal(names.nameLang('Yohan'), undefined);
  assert.equal(names.nameLang(''), undefined);
  assert.equal(names.nameLang(null), undefined);
});

test('머리줄 메뉴와 빠른 이동 팔레트: 모든 줄에 영어, 한국어 메뉴 이름은 그대로', () => {
  assert.deepEqual(site.PRIMARY_LINKS.map((l) => l.label), ['집 안 걷기', '도장 투어', '작은 놀이', '방명록', '전시']);
  assert.deepEqual(site.MORE_LINKS.map((l) => l.label), ['갤러리 · 화보', '내 캐릭터 꾸미기', '내 수첩']);
  for (const l of site.PRIMARY_LINKS) assert.ok(goodEn(l.en), l.label);
  for (const l of site.MORE_LINKS) assert.ok(goodEn(l.en) && goodEn(l.descEn), l.label);
  // 단축키 글자는 두 말이 같다
  assert.deepEqual(site.PRIMARY_LINKS.map((l) => l.key), ['G', 'M', 'P', 'B', 'E']);
  const ids = new Set<string>();
  for (const e of site.PALETTE_BASE) {
    assert.ok(!ids.has(e.id), e.id);
    ids.add(e.id);
    for (const v of [e.titleEn, e.subEn, e.groupEn]) assert.ok(goodEn(v), `${e.id}: ${v}`);
    for (const v of [e.title, e.sub, e.group]) assert.ok(HANGUL.test(v), `${e.id}: 한국어`);
  }
  assert.equal(site.PALETTE_BASE.length, 16);
  for (const g of [site.PALETTE_GAMES_GROUP, site.PALETTE_SPOTS_GROUP]) assert.ok(HANGUL.test(g[0]) && goodEn(g[1]));
  for (const r of site.HELP_ROWS) {
    assert.ok(goodEn(r.en), r.ko);
    assert.ok(r.keys.length >= 1);
  }
});

test('첫 화면의 말: 구슬, 작은 문 여섯 채(열린 방 수 갈래), 더 둘러볼 곳 네 장, 세 걸음 모두 영어', () => {
  for (const [id, w] of Object.entries(home.ORB_WORDS)) {
    assert.ok(goodEn(w.title.en) && goodEn(w.sub.en), id);
    assert.ok(HANGUL.test(w.title.ko) && HANGUL.test(w.sub.ko), id);
  }
  // 여섯 개의 작은 문: 집마다 이름·한 줄·인용의 영어(MoreLinks의 표)
  const more = src('components/home/MoreLinks.tsx');
  pairedFields(more.slice(more.indexOf('function houses'), more.indexOf('export function MoreLinks')), ['title', 'sub', 'quote'], 6, 'MoreLinks');
  assert.equal(inlinePairs(more, 'MoreLinks'), 3, '머리말·한 줄·초대 손님만');
  assert.match(more, /subEn: open === null \? 'Map of 13 seals' : `\$\{countEn\(open, 'space'\)\} open`/);
  assert.equal(`${W.countEn(1, 'space')} open`, '1 space open');
  assert.equal(`${W.countEn(5, 'space')} open`, '5 spaces open');
  // 더 둘러볼 곳: 책갈피 네 장의 이름·딱지·한 줄(손님·구경하는 분 갈래까지), 먹글씨 쇼케이스의 말과 속성
  const curated = src('components/home/CuratedMore.tsx');
  pairedFields(curated.slice(curated.indexOf('const items'), curated.indexOf('  return (')), ['title', 'badge', 'desc'], 4, 'CuratedMore');
  assert.equal(inlinePairs(curated, 'CuratedMore'), 8, '읽는 방향·인장 이름 둘·소개·단추, 링크 이름·그림 대체 글·목록 이름');
  assert.equal(home.STEPS.length, 3);
  for (const s of home.STEPS) assert.ok(goodEn(s.title.en) && goodEn(s.text.en), s.title.ko);
  // 첫 화면 어디서나 「쪽지」: 종이라는 말을 섞지 않는다(tests/unit/front.test.ts와 같은 약속)
  assert.doesNotMatch(src('components/home/home-words.ts'), /종이/);
});

test('현장 도장 결과: 모든 결과에 영어 제목과 한 줄, 새로 찍힌 방 이름은 영어 이름을 알 때만 넣는다', () => {
  for (const [k, w] of Object.entries(qr.QR_STAMP_WORDS)) {
    assert.ok(goodEn(w.titleEn) && goodEn(w.lineEn), k);
    assert.ok(HANGUL.test(w.title) && HANGUL.test(w.line), k);
  }
  assert.deepEqual(qr.qrStampTitle('new', { ko: '현관', en: 'Entrance' }), { ko: '현관 도장을 찍었어요', en: 'You got the Entrance stamp' });
  assert.deepEqual(qr.qrStampTitle('new', { ko: '모르는 방', en: '모르는 방' }), { ko: '모르는 방 도장을 찍었어요', en: 'You got the stamp' });
  assert.deepEqual(qr.qrStampTitle('have', { ko: '현관', en: 'Entrance' }), { ko: '이미 받은 도장이에요', en: 'You already have this stamp' });
  assert.deepEqual(qr.qrStampTitle('error', null), { ko: '지금은 도장을 찍지 못했어요', en: "We couldn't stamp it just now" });
  // 판정 이름은 DB(earn_qr_stamp)의 reason과 같다
  assert.deepEqual(Object.keys(qr.QR_STAMP_WORDS).sort(), ['closed', 'error', 'have', 'invalid', 'new', 'not_guest', 'not_now']);
});

// 개인정보 화면이 끼우는 한국어 문장의 옮긴 때 모습. 정본이 바뀌면 이 시험이 알린다: 그때 lib/privacy-en.ts의 영어도 함께 고친다
const TRANSLATED_FROM = {
  shots: '나만 볼 수 있어요. 집주인은 사진을 보지 않지만, 필요하면 사람마다 또는 행사마다 한꺼번에 지울 수 있어요.',
  adminCare: '집주인은 관리 화면에서 모든 사진 캐릭터를 명단 이름과 이름표, 지금 입고 있는지와 함께 볼 수 있어요. 그리는 중이거나 그리지 못한 시도, '
    + '거절된 시도와 그 까닭도 보여요. 문제가 있으면 캐릭터나 3D를 지우거나 다시 만들어요. '
    + '그림을 다시 그릴 때는 원본 사진이 외부 AI 서비스(OpenAI)로 다시 보내져요. 다시 그리다 거절되면 그 캐릭터와 원본 사진이 지워지고, '
    + '그리지 못하면 원래 그림은 남지만 원본 사진은 지워져요. 3D를 바깥 서비스로 보내는 것은 내가 그 그림으로 바깥 서비스에 3D를 '
    + '요청했거나, 내가 괜찮다고 했다고 집주인이 확인한 경우에만이에요. 관리 화면에서는 원본 사진이 보이지 않아요.',
  archive: '집주인은 조연당 기록으로 원본 사진, 캐릭터 그림, 3D 모형의 사본을 집주인 컴퓨터의 보관함에 남겨요. '
    + '보관함은 바깥에 내보이지 않고, 내가 여기서 지운 것은 보관함에서도 다음 정리 때 지워요.',
  trellis: '★로 보관한 캐릭터 그림 가운데 내가 고른 한 장으로 3D 모형을 만들 수 있어요(우리 컴퓨터에서 만들고 바깥 서비스로 보내지 않아요).',
  meshy: '★로 보관한 캐릭터 그림 가운데 내가 고른 한 장으로 3D 모형을 만들 수 있어요. 이때 고른 캐릭터 그림 한 장을 외부 서비스(Meshy, 미국)로 보내 3D를 만들어요(사진 원본은 보내지 않아요). ',
  optOut: 'Meshy에는 받은 그림을 학습에 쓰지 않도록 요청해 두었고, 끝나면 Meshy 쪽 사본은 지워요.',
  training: 'Meshy 약관상 받은 그림이 학습에 쓰일 수 있고, 끝나면 Meshy 쪽 사본은 지워요.',
};

test('개인정보 화면의 끼운 문장: 옮긴 때의 한국어가 지금 정본과 같고, 영어가 모두 있다(같은 갈래로)', async () => {
  const { SHOTS_PRIVACY_LINE } = await import('../../src/lib/shots-pick.ts');
  const { ADMIN_CARE_LINE } = await import('../../src/lib/avatar/admin-care.ts');
  const { CONSENT_ARCHIVE, privacyModel } = await import('../../src/lib/avatar/consent.ts');
  assert.equal(SHOTS_PRIVACY_LINE, TRANSLATED_FROM.shots, 'shots-pick이 바뀌었다: privacy-en의 SHOTS_PRIVACY_LINE_EN도 고친다');
  assert.equal(ADMIN_CARE_LINE, TRANSLATED_FROM.adminCare, 'admin-care가 바뀌었다: ADMIN_CARE_LINE_EN도 고친다');
  assert.equal(CONSENT_ARCHIVE, TRANSLATED_FROM.archive, 'CONSENT_ARCHIVE가 바뀌었다: CONSENT_ARCHIVE_PRIVACY_EN도 고친다');
  assert.equal(privacyModel('trellis'), TRANSLATED_FROM.trellis);
  assert.equal(privacyModel('trellis', true), TRANSLATED_FROM.trellis);
  assert.equal(privacyModel('meshy'), TRANSLATED_FROM.meshy + TRANSLATED_FROM.training);
  assert.equal(privacyModel('meshy', true), TRANSLATED_FROM.meshy + TRANSLATED_FROM.optOut);
  for (const v of [P.SHOTS_PRIVACY_LINE_EN, P.ADMIN_CARE_LINE_EN, P.CONSENT_ARCHIVE_PRIVACY_EN]) assert.ok(goodEn(v), v);
  for (const p of ['meshy', 'trellis'] as const) {
    for (const optOut of [false, true]) assert.ok(goodEn(P.privacyModelEn(p, optOut)), `${p} ${optOut}`);
  }
  // 같은 갈래: trellis는 학습 문장이 없고, meshy는 학습 제외 여부에 따라 다르다
  assert.equal(P.privacyModelEn('trellis', true), P.privacyModelEn('trellis'));
  assert.notEqual(P.privacyModelEn('meshy', true), P.privacyModelEn('meshy'));
  assert.doesNotMatch(P.privacyModelEn('trellis'), /Meshy|training/);
  assert.match(P.privacyModelEn('meshy'), /Meshy, USA/);
  assert.match(P.privacyModelEn('meshy'), /may be used for training/);
  assert.match(P.privacyModelEn('meshy', true), /not to use the pictures it receives for training/);
});

test('개인정보 화면: 한국어 목록은 그대로 두고 영어 목록을 나란히, 영어 화면에는 한국어가 기준이라는 한 줄', () => {
  const page = src('app/privacy/page.tsx');
  assert.equal((page.match(/<ul className="stack" data-ko="">/g) ?? []).length, 4);
  assert.equal((page.match(/<ul className="stack" data-en="" lang="en">/g) ?? []).length, 4);
  assert.match(page, /the Korean version is the reference/);
  // 한국어 목록과 영어 목록의 줄 수가 같다(빠진 줄 없이 옮겼다)
  const lists = [...page.matchAll(/<ul className="stack" data-(ko|en)=""[^>]*>([\s\S]*?)<\/ul>/g)];
  for (let i = 0; i < lists.length; i += 2) {
    const ko = (lists[i][2].match(/<li>/g) ?? []).length;
    const en = (lists[i + 1][2].match(/<li>/g) ?? []).length;
    assert.equal(lists[i][1], 'ko');
    assert.equal(lists[i + 1][1], 'en');
    assert.equal(en, ko, `목록 ${i / 2 + 1}`);
  }
  // 영어 목록에는 한글이 없다
  for (const m of lists.filter((l) => l[1] === 'en')) assert.doesNotMatch(m[2], HANGUL);
});
