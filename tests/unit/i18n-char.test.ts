// 캐릭터 만들기 화면의 영어(외국인 손님용): 동의 글, 안내 글(MESSAGES), 걷기 창의 머리줄·배지·3D 셈, 그리는 중 단계 글,
// 인형 이름표, 받은 한국어 안내를 옮기는 표(sayEn). 모든 칸에 영어가 있고(빈 글 없음, 한글 없음), 한국어는 그대로인지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';

// 화면 코드는 확장자 없이 가져온다: 시험에서는 .ts를 붙여 찾게 한다
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
const g = globalThis as Record<string, unknown>;
const store = new Map<string, string>();
g.window ??= { addEventListener: () => {}, removeEventListener: () => {} };
g.document ??= { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
g.localStorage ??= {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const C = await import('../../src/lib/avatar/consent.ts');
const R = await import('../../src/lib/avatar/rules.ts');
const W = await import('../../src/lib/avatar/words-en.ts');
const D = await import('../../src/content/dolls.ts');
const L = await import('../../src/walk/look.ts');
const M2 = await import('../../src/components/walk/making.ts');
const M3 = await import('../../src/components/walk/making-3d.ts');

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
/** 코드(주석을 뺀)의 글자 묶음 가운데 한글이 든 것. 템플릿의 ${…} 자리는 3으로 채운다 */
function koLiterals(code: string): string[] {
  const text = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const q = text[i];
    if (q !== "'" && q !== '"' && q !== '`') continue;
    let j = i + 1;
    let s = '';
    while (j < text.length && text[j] !== q) {
      if (text[j] === '\\') {
        s += text[j + 1];
        j += 2;
      } else if (q === '`' && text[j] === '$' && text[j + 1] === '{') {
        let depth = 1;
        j += 2;
        while (j < text.length && depth) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
          j++;
        }
        s += '3';
      } else s += text[j++];
    }
    if (/[가-힣]/.test(s)) out.push(s);
    i = j;
  }
  return out;
}
const HANGUL = /[가-힣]/;
/** 영어 한 줄: 비지 않았고, 한글과 긴 줄표가 없다 */
function english(t: string | null | undefined, what: string) {
  assert.equal(typeof t, 'string', what);
  assert.ok(t && t.trim().length > 0, `${what}: 빈 글`);
  assert.doesNotMatch(t!, HANGUL, `${what}: 한글이 남았다 「${t}」`);
  assert.doesNotMatch(t!, /[—–]/, `${what}: 긴 줄표`);
}

test('동의 글의 영어: 다섯 줄 모두, 같은 차례, 같은 뜻(보내는 곳·한 장만·원본 안 보냄·학습 약관·지움·집주인·보이는 범위)', () => {
  for (const provider of ['meshy', 'trellis'] as const) {
    for (const optOut of [false, true]) {
      const ko = C.consentPoints(provider, optOut);
      const en = C.consentPoints(provider, optOut, 'en');
      assert.equal(en.length, ko.length, '줄 수가 같다');
      for (const [i, p] of en.entries()) {
        english(p.head, `${provider}/${optOut} head ${i}`);
        english(p.text, `${provider}/${optOut} text ${i}`);
      }
      assert.equal(C.consentMain(provider, optOut, 'en'), en.map((p) => `${p.head}: ${p.text}`).join(' '));
      const all = C.consentMain(provider, optOut, 'en');
      assert.match(all, /OpenAI \(USA\)/, '그림을 그리는 곳');
      assert.match(all, /views from several angles/, '여러 방향 그림');
      assert.match(all, /until you delete them, and you can delete them any time/, '지울 때까지, 언제든');
      assert.match(all, /Deleting a picture also deletes its angle views and 3D/, '함께 지워진다');
      assert.match(all, /The host keeps copies of the original photo, pictures and 3D as a record/, '집주인 보관');
      assert.match(all, /delete or remake characters on the admin screen/, '집주인 관리');
      assert.match(all, /removed from the archive at the next cleanup/, '다음 정리 때 보관함에서도');
      assert.match(all, /Only people who have entered Joyeondang Online can see it/, '보이는 범위');
      if (provider === 'meshy') {
        assert.match(en[1].text, /^Only the one ★ picture you choose is sent to Meshy \(USA\)/);
        assert.match(en[1].text, /Your original photo is not sent\./);
        assert.ok(en[1].text.endsWith(C.meshyTraining(optOut, 'en')), '학습 한 문장은 meshyTraining 한곳');
      } else {
        assert.match(en[1].text, /our own computer/);
        assert.doesNotMatch(all, /Meshy|training/, '우리 컴퓨터에는 Meshy·학습 문장이 없다');
      }
    }
  }
  // 한국어는 그대로(기본 인자도 한국어)
  assert.deepEqual(C.consentPoints('meshy', false, 'ko'), C.consentPoints('meshy', false));
  assert.equal(C.consentMain(), C.CONSENT_MAIN);
});

test('학습 한 문장·3D 확인·개인정보 3D 설명·누구 사진인지의 영어', () => {
  english(C.meshyTraining(false, 'en'), 'training');
  english(C.meshyTraining(true, 'en'), 'training optOut');
  assert.match(C.meshyTraining(false, 'en'), /may be used for training/);
  assert.match(C.meshyTraining(true, 'en'), /asked Meshy not to use/);
  assert.match(C.meshyTraining(false, 'en'), /Meshy's copy is deleted when it's done/);
  for (const p of ['meshy', 'trellis'] as const) {
    for (const cap of [1, 2, null]) {
      for (const optOut of [false, true]) {
        const t = C.modelConfirm(p, cap, optOut, 'en');
        english(t, `confirm ${p} ${cap} ${optOut}`);
        if (cap === 1) assert.match(t, /Each person can do this only once\./);
        if (cap === 2) assert.match(t, /up to 2 times/);
        if (cap === null) assert.doesNotMatch(t, /Each person/, '제한이 없으면 횟수를 말하지 않는다');
        if (p === 'meshy') assert.ok(t.includes(C.meshyTraining(optOut, 'en')) && /Send it\?$/.test(t));
        else assert.match(t, /Make it\?$/);
      }
    }
    english(C.modelConfirmYes(p, 'en'), `yes ${p}`);
    english(C.privacyModel(p, false, 'en'), `privacy ${p}`);
  }
  assert.deepEqual([C.modelConfirmYes('meshy', 'en'), C.modelConfirmYes('trellis', 'en')], ['Send', 'Make 3D']);
  assert.ok(C.privacyModel('meshy', true, 'en').includes(C.meshyTraining(true, 'en')));
  for (const s of ['self', 'child'] as const) english(C.SUBJECT_LABEL_EN[s], `subject ${s}`);
  for (const [k, v] of Object.entries({ SUBJECT_QUESTION_EN: C.SUBJECT_QUESTION_EN, CONSENT_GUARDIAN_EN: C.CONSENT_GUARDIAN_EN, CONSENT_TERMS_EN: C.CONSENT_TERMS_EN, CONSENT_ARCHIVE_EN: C.CONSENT_ARCHIVE_EN })) {
    english(v, k);
  }
  // 아이 사진 안내(MESSAGES.child)가 부르는 단추 이름은 영어 화면의 「누구 사진이에요?」 단추와 같다
  assert.ok(R.MESSAGES_EN.child.includes(`“${C.SUBJECT_LABEL_EN.child.replace(/ \(.*\)$/, '')}”`));
});

test('안내 글(MESSAGES)의 영어: 모든 열쇠가 있고, 숫자가 든 글도 비지 않는다', () => {
  const keys = Object.keys(R.MESSAGES) as (keyof typeof R.MESSAGES)[];
  assert.deepEqual(Object.keys(R.MESSAGES_EN).sort(), [...keys].sort(), '같은 열쇠');
  for (const k of keys) {
    const ko = R.MESSAGES[k];
    const en = R.MESSAGES_EN[k];
    assert.equal(typeof en, typeof ko, `${k}: 글이면 글, 함수면 함수`);
    if (typeof ko === 'string') english(en as string, k);
    else for (const n of [undefined, null, 0, 1, 2, 3, 10]) english((en as (n?: number | null) => string)(n), `${k}(${n})`);
  }
  assert.equal(R.MESSAGES_EN.userLimit(1), "You've reached today's limit of 1 picture. Please try again tomorrow.");
  assert.equal(R.MESSAGES_EN.userLimit(10), "You've reached today's limit of 10 pictures. Please try again tomorrow.");
  assert.equal(R.messagesIn('ko'), R.MESSAGES);
  assert.equal(R.messagesIn('en'), R.MESSAGES_EN);
});

test('받은 한국어 안내 → 영어(messageEn): 숫자가 든 글은 그 숫자로, 3D 셈 안내도. 모르는 글은 빈 글', () => {
  const keys = Object.keys(R.MESSAGES) as (keyof typeof R.MESSAGES)[];
  for (const k of keys) {
    const ko = R.MESSAGES[k];
    if (typeof ko === 'string') {
      assert.equal(R.messageEn(ko), R.MESSAGES_EN[k], k);
      continue;
    }
    for (const n of [null, 1, 2, 3, 7, 10, 22]) {
      const fn = R.MESSAGES_EN[k] as (n?: number | null) => string;
      assert.equal(R.messageEn((ko as (n?: number | null) => string)(n)), fn(n), `${k}(${n})`);
    }
  }
  // 3D를 못 만들었을 때의 셈 안내(서버가 한국어로 준다)
  const counts = (n: number, cap: number | null) =>
    ({ history: { n: 0, cap: 10 }, keeps: { n: 0, cap: 3 }, models: { n: 0, cap: 1 }, tries: { n, cap } });
  const cases: [unknown, unknown, ReturnType<typeof counts> | null][] = [
    ['service_down', null, null], ['meshy_failed', '2026-11-12T03:00:00Z', null], ['meshy_failed', '2026-11-12T03:00:00Z', counts(0, null)],
    ['meshy_failed', '2026-11-12T03:00:00Z', counts(0, 2)], ['meshy_failed', '2026-11-12T03:00:00Z', counts(0, 3)],
    ['meshy_failed', '2026-11-12T03:00:00Z', counts(2, 2)], ['reconsent', null, null], ['bad_char', '2026-11-12T03:00:00Z', null],
  ];
  for (const [reason, jobAt, c] of cases) {
    const ko = R.modelFailText(reason, 'meshy', jobAt, c);
    const en = R.modelFailText(reason, 'meshy', jobAt, c, 'en');
    english(en.message, `fail message ${String(reason)}`);
    english(en.note, `fail note ${String(reason)}`);
    assert.equal(R.messageEn(ko.message), en.message, `message ${String(reason)}`);
    assert.equal(R.messageEn(ko.note), en.note, `note ${String(reason)} ${JSON.stringify(c?.tries)}`);
  }
  // 한국어는 그대로
  assert.equal(R.modelFailText('meshy_failed', 'meshy', '2026-11-12T03:00:00Z', counts(0, 3)).note, '3D 몫을 돌려드렸어요. 3번 더 해 볼 수 있어요.');
  assert.equal(R.messageEn('누군가 적은 글'), '');
  assert.equal(R.messageEn(''), '');
});

test('걷기 창의 머리줄·배지·3D 셈·지우기 경고의 영어(한국어는 그대로)', () => {
  const quota = (o: Record<string, unknown>) => R.readQuota({ used: 1, attempts: 1, total: 1, cap: 10, attempt_cap: 22, ...o });
  const full = { history: 4, history_cap: 10, keeps: 1, keep_cap: 3, models: 0, model_cap: 1, model_tries: 0, model_tries_cap: 2, model_day: 0, model_day_cap: 100 };
  for (const q of [quota({}), quota({ cap: null }), quota(full), quota({ ...full, history: 10 }), quota({ ...full, cap: null, history_cap: null, keep_cap: null, model_cap: null })]) {
    const d = R.decideQuota(q, 150);
    const line = R.dailyLine(q, d, 'en');
    if (R.dailyLine(q, d) !== null) english(line, 'dailyLine');
    const c = R.countsOf(q);
    for (const on of [true, false]) {
      for (const p of R.countParts(c, on, 'en')) english(p, 'countParts');
      assert.equal(R.countParts(c, on, 'en').length, R.countParts(c, on).length);
      if (c) english(R.modelPart(c, on, 'en'), 'modelPart');
      const head = R.headLine(d.ok ? { ok: true, left: d.left } : { ok: false, reason: d.reason, left: 'left' in d ? d.left : undefined }, c, on, 'en');
      if (head) english(head, 'headLine');
      const none = R.modelNoneLine(c, on, false, 'en');
      if (R.modelNoneLine(c, on, false) !== null) english(none, 'modelNoneLine');
      const ch = R.modelChance(c, on);
      if (ch) english(R.modelChanceLine(ch, 'en'), 'modelChanceLine');
    }
  }
  for (const ch of [{ left: 1, again: 1 }, { left: 1, again: 0 }, { left: 2, again: 3 }, { left: null, again: null }, { left: 1, again: undefined }]) {
    english(R.modelChanceLine(ch, 'en'), JSON.stringify(ch));
  }
  assert.equal(R.modelChanceLine({ left: 1, again: 1 }, 'en'), '3D: 1 left · If it fails, you can try once more');
  for (const part of [{ ok: true, left: 3 }, { ok: true, left: null }, { ok: false, reason: 'history_full', left: 2 }, { ok: false, reason: 'slots_full', left: 1 }]) {
    english(R.dailyPart(part, 'en'), JSON.stringify(part));
  }
  for (const m of ['ready', 'making', 'waiting'] as const) {
    for (const cap of [1, 2]) english(R.deleteWarning(m, cap, 'en'), `deleteWarning ${m} ${cap}`);
  }
  assert.equal(R.deleteWarning('none', 1, 'en'), null);
  assert.equal(R.deleteWarning('ready', null, 'en'), null);
  for (const state of ['waiting', 'making', 'ready', 'failed'] as const) {
    for (const o of [{}, { blocked: true }, { reconsent: true }, { retry: true }]) english(R.modelBadge(state, o, 'en'), `badge ${state} ${JSON.stringify(o)}`);
  }
  assert.equal(R.modelBadge('none', {}, 'en'), '');
  // 한국어는 그대로(기본 인자)
  assert.equal(R.modelChanceLine({ left: 1, again: 1 }), '3D 1번 남음 · 못 만들면 한 번 더 해 볼 수 있어요');
  assert.equal(R.dailyPart({ ok: true, left: 3 }), '오늘 3장 더');
});

test('그리는 중(2D)·3D 단계 글의 영어: 단계 이름은 같은 수, 시각은 「3:30 PM」, 서버가 준 까닭은 그대로 넘긴다', () => {
  const base = { at: 0, drawingAt: null, ahead: null, message: null };
  for (const m of [
    { ...base, phase: 'queued' as const }, { ...base, phase: 'queued' as const, ahead: 3 }, { ...base, phase: 'drawing' as const, drawingAt: 0 },
    { ...base, phase: 'ready' as const },
  ]) {
    for (const now of [1_000, 30_000, 90_000]) english(M2.makingStage(m, now, R.MESSAGES.workerResting, 'en'), `2D ${m.phase} ${now}`);
  }
  // 서버 글(쉬는 중 안내, 못 그린 까닭)은 그대로 돌려주고, 화면이 sayEn으로 옮긴다
  const resting = { ...base, phase: 'queued' as const, message: R.MESSAGES.workerResting };
  assert.equal(M2.makingStage(resting, 1_000, R.MESSAGES.workerResting, 'en'), R.MESSAGES.workerResting);
  english(W.sayEn(R.MESSAGES.workerResting), 'resting');
  const failed = { ...base, phase: 'failed' as const };
  english(W.sayEn(M2.makingStage(failed, 1_000, R.MESSAGES.workerResting, 'en')), '2D failed default');
  assert.equal(M2.makingStage({ ...base, phase: 'drawing', drawingAt: 0 }, 30_000, R.MESSAGES.workerResting), '캐릭터를 그리는 중이에요');

  const m3 = { id: 'x', at: 0, makingAt: null, later: null, message: null, note: null, doneAt: null, seen: false };
  const later = Date.UTC(2026, 10, 12, 6, 30); // 한국 15:30
  for (const m of [
    { ...m3, phase: 'waiting' as const }, { ...m3, phase: 'waiting' as const, later }, { ...m3, phase: 'making' as const, makingAt: 0 },
    { ...m3, phase: 'ready' as const },
  ]) {
    for (const now of [1_000, 200_000, 400_000]) {
      english(M3.modelStage(m, Math.min(now, later - 1), 'en'), `3D ${m.phase} ${now}`);
      const note = M3.modelNote(m, now, 'en');
      if (M3.modelNote(m, now) !== null) english(note, `note ${m.phase}`);
      const chip = M3.modelChipText(m, now, 'en');
      english(chip.label, `chip ${m.phase}`);
      assert.doesNotMatch(chip.tail, HANGUL);
    }
  }
  assert.equal(M3.kstClock(later, 'en'), '3:30 PM');
  assert.equal(M3.kstClock(Date.UTC(2026, 10, 12, 15, 5), 'en'), '12:05 AM');
  assert.equal(M3.kstClock(later), '15시 30분', '한국어는 그대로');
  assert.match(M3.modelStage({ ...m3, phase: 'waiting', later }, later - 1, 'en'), /around 3:30 PM Korea time/);
  assert.equal(M3.MODEL_STEPS_EN.length, M3.MODEL_STEPS.length);
  for (const s of M3.MODEL_STEPS_EN) english(s, 'step');
  english(W.sayEn(M3.modelStage({ ...m3, phase: 'failed' }, 1_000, 'en')), '3D failed default');
});

test('인형 이름표: 고르는 목록마다 같은 수의 이름, 모두 영어가 있고 한국어는 전과 같다', () => {
  assert.deepEqual(Object.keys(D.HAIR_NAMES).sort(), [...L.HAIR_STYLES].sort());
  assert.deepEqual(Object.keys(D.ACC_NAMES).sort(), [...L.ACCESSORIES].sort());
  assert.equal(D.HAIR_COLOR_NAMES.length, L.HAIR_COLORS.length);
  assert.equal(D.CLOTH_NAMES.length, L.CLOTH_COLORS.length);
  const all = [...Object.values(D.HAIR_NAMES), ...Object.values(D.ACC_NAMES), ...D.HAIR_COLOR_NAMES, ...D.CLOTH_NAMES];
  for (const n of all) {
    assert.match(n.ko, HANGUL);
    english(n.en, n.ko);
  }
  for (const c of D.DOLL_COLORS) english(c.en, c.label);
  // 한국어 이름은 예전 화면 그대로(걷기 창과 「내 캐릭터」 화면에 따로 적혀 있던 것)
  assert.deepEqual(L.HAIR_STYLES.map((h) => D.HAIR_NAMES[h].ko), ['짧은 머리', '단발', '긴 머리', '곱슬', '올림머리', '캡 모자']);
  assert.deepEqual(L.ACCESSORIES.map((a) => D.ACC_NAMES[a].ko), ['없음', '안경', '밀짚모자', '리본', '헤드폰', '목도리']);
  assert.deepEqual(D.HAIR_COLOR_NAMES.map((n) => n.ko), ['검은 갈색', '진한 갈색', '갈색', '밝은 갈색', '금빛', '은회색', '초록', '붉은 갈색']);
  assert.deepEqual(D.CLOTH_NAMES.map((n) => n.ko), ['숲 초록', '벽돌', '살구 갈색', '남색', '하늘 파랑', '겨자', '보라', '크림', '먹색', '분홍']);
  assert.deepEqual(D.DOLL_COLORS.map((c) => c.label), ['봄 분홍', '여름 녹색', '가을 주황', '겨울 청회색', '크림', '먹색']);
});

test('받은 한국어 안내를 옮기는 표(sayEn): 표의 모든 글에 영어가 있고, 숫자 칸 글과 MESSAGES도 옮긴다', () => {
  assert.ok(W.KNOWN_KO.length > 30);
  for (const ko of W.KNOWN_KO) english(W.sayEn(ko), ko);
  assert.equal(W.sayEn('작업대 3번 칸에 놓았어요.'), 'Placed in workbench slot 3.');
  assert.equal(W.sayEn(R.MESSAGES.tryLater), R.MESSAGES_EN.tryLater);
  assert.equal(W.sayEn(` ${R.MESSAGES.notGuest} `), R.MESSAGES_EN.notGuest, '앞뒤 빈칸은 본다');
  assert.equal(W.sayEn('모르는 글'), '');
  assert.equal(W.sayEn(null), '');
  assert.equal(W.sayEn(''), '');
});

test('서버 액션·올리기·고치기 확인이 주는 한국어 안내는 모두 표에 있다(글을 바꾸면 이 시험이 알린다)', () => {
  // 「내 캐릭터」 화면의 서버 액션, 고치기 요청의 확인, 올리기: 이 세 파일에서 한글이 든 글은 모두 손님에게 보이는 안내다
  for (const f of ['app/avatar/actions.ts', 'lib/avatar/route-gate.ts', 'components/walk/useCharacter.ts']) {
    const said = koLiterals(src(f));
    if (f === 'app/avatar/actions.ts') assert.ok(said.length >= 20, `서버 액션의 안내 ${said.length}개`);
    for (const t of said) english(W.sayEn(t), `${f}: ${t}`);
  }
  // 화면이 적어 두었다가 Say로 보이는 글(걷기 창, 「내 캐릭터」 화면, 그리는 중 기록)
  const shown: Record<string, string[]> = {
    'components/walk/CharacterPanel.tsx': [
      '로그인이 끊겼어요. 다시 들어온 뒤 해 주세요.', '초대 손님만 할 수 있어요.', '사진이 너무 커요. 40MB보다 작은 사진으로 골라 주세요.',
      '작업대가 다 차서 가장 오래 있던 그림이 작업대에서 빠졌어요(이력에는 그대로 있어요).', '이 캐릭터로 갈아입었어요.', '그리기를 그만두고 지웠어요.',
      '그림을 지웠어요. 지금은 기본 인형으로 걸어요. 원본 사진은 「내 캐릭터」 화면에서 지울 수 있어요.',
      '그림을 지웠어요. 원본 사진은 「내 캐릭터」 화면에서 지울 수 있어요.', '로그인이 끊겼어요. 다시 들어온 뒤 지워 주세요.',
      '초대 손님만 지울 수 있어요.', '지금은 지우지 못했어요. 잠시 뒤 다시 해 주세요.', '작업대에 놓았어요.', '이미 3D가 있거나 만드는 중이에요.',
      '3D 만들기를 맡겼어요. 보통 1~2분 걸려요. 다 되면 이 그림에 「3D」가 붙고, 이 캐릭터를 입고 걸으면 3D로 보여요.',
    ],
    'app/avatar/AvatarStudio.tsx': [
      '이 사진은 열 수 없어요. 다른 사진으로 해 주세요.', '그림을 만들지 못했어요. 잠시 뒤 다시 해 주세요.',
      '연결이 끊겼어요. 잠시 뒤 아래 목록을 확인하고, 없으면 다시 해 주세요.', '상태를 확인하지 못했어요. 잠시 뒤 아래 목록을 확인해 주세요.',
      '연결이 끊겼어요. 잠시 뒤 아래 목록을 확인해 주세요.', '아직 그리는 중이에요. 다 그리면 아래 「내 캐릭터」에 생겨요.',
    ],
    'components/walk/making.ts': ['이번 사진으로는 그림을 만들지 못했어요.'],
    'components/walk/making-3d.ts': ['3D를 만들지 못했어요.'],
    'lib/avatar/rules.ts': ['지금은 새로 만들 수 없어요.'],
  };
  for (const [f, list] of Object.entries(shown)) {
    const text = src(f);
    for (const t of list) {
      assert.ok(text.includes(t), `${f}에 「${t}」가 없다(글을 바꿨으면 words-en.ts 표도 고친다)`);
      english(W.sayEn(t), `${f}: ${t}`);
    }
  }
});
