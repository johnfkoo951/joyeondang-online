// 손님 화면(도장 투어 지도, 방, 방명록, 갤러리, 전시, 수첩)의 한·영 표와 도우미.
// 표마다 영어가 다 있고(비지 않고, 한글·긴 줄표 없이), 한국어 쪽은 예전 글자 그대로인지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { inlinePairs } from './helpers/bilingual-source.ts';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
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

const W = await import('../../src/lib/page-words.ts');
const R = await import('../../src/lib/stamp-rally.ts');
const SR = await import('../../src/components/stamp/stamp-rules.ts');
const SP = await import('../../src/lib/shots-pick.ts');
const RE = await import('../../src/lib/record-errors.ts');
const NP = await import('../../src/lib/note-photo-words.ts');
const GB = await import('../../src/components/guestbook/guestbook-words.ts');
const LB = await import('../../src/components/gallery/lookbook.ts');
const { DOOR_LABEL, DOOR_LABEL_EN, ROOMS } = await import('../../src/content/rooms.ts');
const { ROLE_LABEL, SCOPE_LABEL } = await import('../../src/lib/access.ts');
const { EXHIBIT_SECTIONS } = await import('../../src/content/exhibit-sections.ts');
const { DOLL_COLORS } = await import('../../src/content/dolls.ts');
const { placeEn } = await import('../../src/lib/place-names.ts');

const HANGUL = /[가-힣]/;
const DASH = /[—–]/;
/** 영어 한 줄: 비지 않고, 한글이 없고, 긴 줄표가 없다 */
function okEn(en: unknown, where: string) {
  assert.equal(typeof en, 'string', where);
  const s = en as string;
  assert.ok(s.trim().length > 0, `${where}: 비었다`);
  assert.doesNotMatch(s, HANGUL, `${where}: 한글이 남았다 (${s})`);
  assert.doesNotMatch(s, DASH, `${where}: 긴 줄표 (${s})`);
}

test('다른 표에서 오는 이름(문패, 범위, 역할, 전시 칸, 인형 색)은 열쇠마다 영어가 있다', () => {
  assert.deepEqual(Object.keys(W.DOOR_EN).sort(), Object.keys(DOOR_LABEL).sort());
  for (const [k, v] of Object.entries(W.DOOR_EN)) okEn(v, `DOOR_EN.${k}`);
  // 문패의 영어는 걷기 화면·집 데이터 표와 같은 말(쉬는 중 = On a break)
  assert.deepEqual(W.DOOR_EN, DOOR_LABEL_EN);
  assert.deepEqual(Object.keys(W.SCOPE_EN).sort(), Object.keys(SCOPE_LABEL).sort());
  for (const [k, v] of Object.entries(W.SCOPE_EN)) okEn(v, `SCOPE_EN.${k}`);
  assert.deepEqual(Object.keys(W.ROLE_EN).sort(), Object.keys(ROLE_LABEL).sort());
  for (const [k, v] of Object.entries(W.ROLE_EN)) okEn(v, `ROLE_EN.${k}`);
  for (const s of EXHIBIT_SECTIONS) {
    okEn(W.SECTION_EN[s.slug]?.title, `SECTION_EN.${s.slug}.title`);
    okEn(W.SECTION_EN[s.slug]?.onsite, `SECTION_EN.${s.slug}.onsite`);
  }
  for (const c of DOLL_COLORS) okEn(W.DOLL_COLOR_EN[c.id], `DOLL_COLOR_EN.${c.id}`);
  assert.equal(W.DOLL_PRESETS.length, 6, '수첩 배지 여섯 개(doll-1 … doll-6)');
  for (const p of W.DOLL_PRESETS) {
    assert.match(p.ko, HANGUL);
    okEn(p.en, `DOLL_PRESETS ${p.ko}`);
  }
});

test('쪽지 상태 낱말 세 벌과 전시 칸 상태: 두 말이 다 있고 한국어는 예전 글자 그대로', () => {
  for (const [name, table] of [['RECORD_STATUS', W.RECORD_STATUS], ['WALL_STATUS', W.WALL_STATUS], ['MINE_STATUS', W.MINE_STATUS]] as const) {
    assert.deepEqual(Object.keys(table).sort(), ['approved', 'hidden', 'rejected', 'sealed', 'submitted'], name);
    for (const [k, v] of Object.entries(table)) {
      assert.match(v.ko, HANGUL, `${name}.${k}`);
      okEn(v.en, `${name}.${k}`);
    }
  }
  assert.equal(W.RECORD_STATUS.submitted.ko, '봉투에 담김, 가족이 읽는 중');
  assert.equal(W.WALL_STATUS.submitted.ko, '봉투에 담김 · 가족 확인 중');
  assert.equal(W.MINE_STATUS.hidden.ko, '내 수첩에만');
  assert.deepEqual(W.SECTION_STATE.empty, { ko: '준비 중', en: 'Coming soon' });
  okEn(W.SECTION_STATE.locked.en, 'SECTION_STATE.locked');
  assert.deepEqual(W.SECTION_STATE.open, { ko: '', en: '' }, '열린 칸은 두 말 모두 비운다');
  assert.equal(W.pick('ko', W.RECORD_STATUS.sealed), '봉인');
  assert.equal(W.pick('en', W.RECORD_STATUS.sealed), 'Sealed');
  assert.equal(W.pick('en', { ko: '가', en: '' }), '가', '영어가 비면 한국어');
});

test('날짜·셈·차례 도우미: 한국어는 예전과 같은 모양, 영어는 영어 모양', () => {
  const iso = '2026-11-12T03:00:00.000Z';
  const koDay = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date(iso));
  assert.equal(W.dayLabel('ko', iso), koDay);
  assert.equal(W.dayLabel('en', iso), 'November 12');
  assert.equal(W.dayLabel('en', '2026-11-11T16:00:00.000Z'), 'November 12', '한국 시간으로 센다');
  assert.equal(W.shotTime('ko', iso), new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }));
  assert.doesNotMatch(W.shotTime('en', iso), HANGUL);
  assert.equal(W.countEn(1, 'photo'), '1 photo');
  assert.equal(W.countEn(2, 'photo'), '2 photos');
  assert.equal(W.countEn(0, 'note'), '0 notes');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(W.ordinalEn),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st']);
  assert.equal(W.hangulLang('안녕'), 'ko');
  assert.equal(W.hangulLang('Hello'), undefined);
  assert.equal(W.hangulLang(null), undefined);
});

test('도장 투어 열세 곳: 짧은 이름·소개·할 일·놀이 이름의 영어, 지점 이름은 장소 이름 표를 따른다', () => {
  assert.equal(R.STAMP_SPOTS.length, 13);
  for (const s of R.STAMP_SPOTS) {
    okEn(s.en.short, `${s.slug}.short`);
    okEn(s.en.charm, `${s.slug}.charm`);
    okEn(s.en.quest, `${s.slug}.quest`);
    assert.equal(Boolean(s.en.game), Boolean(s.gameTitle), `${s.slug}: 놀이가 있는 곳만 놀이 이름`);
    if (s.en.game) okEn(s.en.game, `${s.slug}.game`);
    // 지점 이름은 장소 이름 표가 다 안다(영어 화면에 한국어 이름이 섞이지 않게)
    okEn(R.spotName('en', s), `${s.slug} 이름`);
    assert.equal(R.spotName('en', s), placeEn(s.name));
    // 한국어 화면은 예전 글자 그대로
    assert.equal(R.spotName('ko', s), s.name);
    assert.equal(R.spotShort('ko', s), s.shortName);
    assert.equal(R.spotShort('en', s), s.en.short);
    assert.equal(R.spotCharm('ko', s), s.charm);
    assert.equal(R.spotQuest('en', s), s.en.quest);
    assert.equal(R.spotGame('ko', s), s.gameTitle ?? '');
  }
  for (const z of R.RALLY_ZONES) {
    okEn(z.en.label, `zone ${z.id}`);
    okEn(z.en.desc, `zone ${z.id} desc`);
    assert.equal(R.zoneLabel('ko', z.id), z.label);
    assert.equal(R.zoneLabel('en', z.id), z.en.label);
  }
  // 층별 단면도의 방 이름과 층 이름도 모두 장소 이름 표가 안다
  for (const r of ROOMS) okEn(placeEn(r.name), `room ${r.slug}`);
  for (const f of ['다락', '2층', '1층', '마당']) okEn(placeEn(f), `floor ${f}`);
});

test('도장 찍기 말의 영어: 같은 열쇠, 결과 한 줄, 단추 글. 한국어 상태(message)는 그대로 두고 옮긴다', () => {
  assert.deepEqual(Object.keys(SR.STAMP_WORDS_EN).sort(), Object.keys(SR.STAMP_WORDS).sort());
  for (const [k, v] of Object.entries(SR.STAMP_WORDS_EN)) okEn(v, `STAMP_WORDS_EN.${k}`);
  for (const k of Object.keys(SR.STAMP_WORDS) as (keyof typeof SR.STAMP_WORDS)[]) {
    assert.equal(SR.stampWordEn(SR.STAMP_WORDS[k]), SR.STAMP_WORDS_EN[k]);
  }
  assert.equal(SR.stampWordEn('모르는 말'), '모르는 말', '모르는 말은 그대로');
  assert.equal(SR.stampLineEn({ kind: 'new' }, 'Jazz room'), 'You stamped Jazz room');
  assert.equal(SR.stampLineEn({ kind: 'new' }, ' '), 'You got the stamp');
  assert.equal(SR.stampLineEn({ kind: 'have' }, 'Jazz room'), 'You already have the Jazz room stamp');
  assert.equal(SR.stampLineEn(SR.stampOutcome(null), 'x'), SR.STAMP_WORDS_EN.offline);
  assert.equal(SR.stampLineEn({ kind: 'idle' }, 'x'), null);
  assert.deepEqual(SR.stampButtonEn({ kind: 'idle' }, 'Get the stamp'), { text: 'Get the stamp', locked: false });
  assert.deepEqual(SR.stampButtonEn({ kind: 'busy' }, 'Get the stamp'), { text: 'Stamping', locked: true });
  assert.deepEqual(SR.stampButtonEn({ kind: 'have' }, 'Get the stamp'), { text: 'Stamped', locked: true });
  assert.deepEqual(SR.stampButtonEn({ kind: 'fail', message: 'x', again: true }, 'Get the stamp'), { text: 'Try again', locked: false });
  assert.deepEqual(SR.stampButtonEn({ kind: 'fail', message: 'x', again: false }, 'Get the stamp'), { text: 'Get the stamp', locked: true });
  // 잠김은 한국어 단추와 늘 같다
  for (const st of [{ kind: 'idle' }, { kind: 'busy' }, { kind: 'new' }, { kind: 'have' }, { kind: 'fail', message: 'x', again: true }, { kind: 'fail', message: 'x', again: false }] as const) {
    assert.equal(SR.stampButtonEn(st, 'a').locked, SR.stampButton(st, 'a').locked, JSON.stringify(st));
  }
});

test('걷기 사진 갤러리의 영어: 셈(1 photo / 2 photos), 결과 세 갈래, 언어별 묶음', () => {
  okEn(SP.SHOTS_PRIVACY_LINE_EN, 'SHOTS_PRIVACY_LINE_EN');
  assert.equal(W.SHOTS_PRIVACY_LINE_EN, SP.SHOTS_PRIVACY_LINE_EN, '갤러리 화면이 가져가는 줄');
  assert.equal(SP.pickedDeleteAskEn(1), 'Delete 1 photo? This can’t be undone.');
  assert.equal(SP.pickedDeleteAskEn(3), 'Delete 3 photos? This can’t be undone.');
  assert.equal(SP.pickedDeleteResultEn(3, 3), 'Deleted 3 photos.');
  assert.equal(SP.pickedDeleteResultEn(1, 1), 'Deleted 1 photo.');
  assert.match(SP.pickedDeleteResultEn(1, 0), /The photo you picked is still here/);
  assert.match(SP.pickedDeleteResultEn(4, 0), /The 4 photos you picked are still here/);
  assert.equal(SP.pickedDeleteResultEn(25, 20), 'Deleted 20 of 25 photos. The other 5 photos are still picked. Please try again in a moment.');
  assert.match(SP.pickedDeleteResultEn(2, 1), /The other 1 photo is still picked/);
  assert.equal(SP.pickedDeleteResultEn(0, 0), '');
  for (const t of [SP.pickedDeleteAskEn(2), SP.pickedDeleteResultEn(2, 2), SP.pickedDeleteResultEn(2, 0), SP.pickedDeleteResultEn(3, 1)]) okEn(t, t);
  // 한국어 묶음은 예전 함수 그대로(갤러리 화면은 같은 이름으로 부른다)
  assert.equal(SP.pickWords('ko').pickedDeleteAsk, SP.pickedDeleteAsk);
  assert.equal(SP.pickWords('ko').pickedDeleteResult, SP.pickedDeleteResult);
  assert.equal(SP.pickWords('en').pickedDeleteAsk(2), SP.pickedDeleteAskEn(2));
  assert.equal(SP.pickWords('en').pickedDeleteResult(2, 1), SP.pickedDeleteResultEn(2, 1));
});

test('쪽지·사진 안내의 영어: 서버가 돌려주는 한국어 말마다 영어가 있고, 모르는 말은 null', () => {
  for (const m of [RE.recordLimitMessage('too_many'), RE.recordLimitMessage('too_many_today')]) {
    okEn(RE.RECORD_WORDS_EN[m as string], `RECORD_WORDS_EN ${m}`);
    assert.equal(W.noteMessageEn(m), RE.RECORD_WORDS_EN[m as string]);
  }
  for (const m of [...Object.values(NP.NOTE_PHOTO_REASON), NP.NOTE_PHOTO_FAIL, NP.notePhotoHourly(NP.HOURLY_PHOTOS)]) {
    okEn(NP.NOTE_PHOTO_WORDS_EN[m], `NOTE_PHOTO_WORDS_EN ${m}`);
    assert.equal(W.noteMessageEn(`  ${m} `), NP.NOTE_PHOTO_WORDS_EN[m], '앞뒤 빈칸은 견주지 않는다');
  }
  // 한국어 말은 예전 글자 그대로(서버가 돌려주는 말)
  assert.equal(NP.notePhotoHourly(20), '사진은 한 시간에 20장까지 붙일 수 있어요. 조금 뒤에 다시 해 주세요.');
  assert.equal(NP.NOTE_PHOTO_REASON.too_big, '사진이 너무 커요. 다른 사진을 골라 주세요.');
  assert.equal(W.noteMessageEn('보내지 못했어요. 잠시 뒤 다시 눌러 주세요.'), 'We couldn’t send it. Please try again in a moment.');
  for (const k of W.NOTE_MESSAGE_KEYS) okEn(W.noteMessageEn(k), k);
  assert.equal(W.noteMessageEn('처음 보는 말'), null);
  assert.equal(W.noteMessageEn(undefined), null);
});

test('방명록 글 남길 곳과 예시 벽, 갤러리 화보: 영어가 다 있고 글감 수가 같다', () => {
  assert.deepEqual(GB.DESTINATIONS.map((d) => d.slug), ['living', 'pine', 'study', 'porch', 'photozone']);
  for (const d of GB.DESTINATIONS) {
    for (const k of ['tabLabel', 'subLabel', 'prompt', 'submitLabel'] as const) {
      assert.match(d[k], HANGUL, `${d.slug}.${k} 한국어`);
      okEn(d.en[k], `${d.slug}.en.${k}`);
    }
    assert.equal(d.en.starters.length, d.starters.length, `${d.slug}: 글감 수`);
    d.en.starters.forEach((s, i) => okEn(s, `${d.slug}.starters[${i}]`));
  }
  assert.equal(GB.SAMPLE_WALL.length, 3);
  for (const w of GB.SAMPLE_WALL) {
    assert.ok(w.sampleEn, w.id);
    okEn(w.sampleEn!.roomName, `${w.id}.roomName`);
    okEn(w.sampleEn!.author, `${w.id}.author`);
    okEn(w.sampleEn!.body, `${w.id}.body`);
  }
  assert.equal(LB.LOOKBOOK.length, 6);
  for (const item of LB.LOOKBOOK) {
    okEn(item.en.title, `${item.id}.title`);
    okEn(item.en.caption, `${item.id}.caption`);
    okEn(item.en.cta, `${item.id}.cta`);
  }
});

test('화면 파일의 영어 글(en=…)에 긴 줄표가 없다', () => {
  const files = [
    'components/stamp-map/StampRallyMap.tsx', 'components/stamp-map/RoomVisitTracker.tsx', 'components/stamp-map/CarvedSeal.tsx',
    'components/stamp/Stamp.tsx', 'components/guestbook/GuestbookStudio.tsx', 'components/gallery/HouseLookbook.tsx',
    'components/NoteForm.tsx', 'components/RecordList.tsx', 'components/RoomWebExhibits.tsx', 'components/walk/ExhibitModal.tsx',
    'components/RosterRename.tsx', 'app/map/page.tsx', 'app/guestbook/page.tsx', 'app/gallery/page.tsx', 'app/gallery/GalleryClient.tsx',
    'app/gallery/ShotViewer.tsx', 'app/exhibit/page.tsx', 'app/exhibit/[slug]/page.tsx', 'app/notebook/page.tsx', 'app/room/[slug]/page.tsx',
    'app/exhibit/lettering/page.tsx', 'components/LetteringPreview.tsx',
  ];
  for (const f of files) {
    const text = readFileSync(new URL(f, SRC), 'utf8');
    for (const m of text.matchAll(/\ben=\{?[`'"]([^`'"]*)[`'"]/g)) assert.doesNotMatch(m[1], DASH, `${f}: ${m[1]}`);
  }
});

test('글씨 전시: 작품 열여섯 점의 소개와 읽는 방향이 영어로(옮긴 때의 한국어와 같다), 작품 이름은 옮기지 않는다', async () => {
  const { LETTERING_WORKS } = await import('../../src/content/lettering.ts');
  const L = await import('../../src/content/lettering-en.ts');
  assert.deepEqual(Object.keys(L.LETTERING_DESC_EN).sort(), LETTERING_WORKS.map((w) => w.slug).sort());
  for (const w of LETTERING_WORKS) {
    // 그림을 다시 준비해 한국어 소개가 바뀌면 여기서 알린다: 그때 lettering-en.ts의 영어도 고친다
    assert.equal(L.LETTERING_DESC_EN[w.slug].ko, w.description, `${w.slug}: 옮긴 때의 한국어 소개`);
    okEn(L.letteringDescEn(w), `${w.slug} 소개`);
    okEn(L.letteringDirectionEn(w.direction), `${w.slug} 읽는 방향`);
    assert.match(w.title, HANGUL, `${w.slug}: 작품 이름은 한국어 그대로`);
  }
  // 한국어 소개가 옮긴 때와 다르거나 모르는 방향이면 영어를 쓰지 않는다(화면은 한국어 그대로 lang="ko")
  assert.equal(L.letteringDescEn({ slug: 'ink-gold', description: '다르게 고친 소개' }), null);
  assert.equal(L.letteringDescEn({ slug: 'nowhere', description: '먹색 바탕에 금빛 획을 얹은 전통형 현판.' }), null);
  assert.equal(L.letteringDirectionEn('아래에서 위로 조연당'), null);
  // 화면 코드의 두 말(<T ko en>와 속성 쌍): 전시 화면, 미리보기
  const page = readFileSync(new URL('app/exhibit/lettering/page.tsx', SRC), 'utf8');
  assert.ok(inlinePairs(page, 'lettering/page') >= 18, '전시 화면의 두 말 글');
  assert.match(page, /<h3 lang="ko">\{work\.title\}<\/h3>/, '작품 이름은 lang="ko"');
  assert.equal(inlinePairs(readFileSync(new URL('components/LetteringPreview.tsx', SRC), 'utf8'), 'LetteringPreview'), 5);
});
