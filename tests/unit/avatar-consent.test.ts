// 사진 캐릭터 동의 글: 사진을 올리는 두 화면(내 캐릭터 화면, 걷기 화면의 캐릭터 패널)이 같은 글을 보여 주고,
// 그 글이 여러 방향 그림(캐릭터 그림을 한 번 더 보냄)을 안내하며, 그 안내를 보여 준 화면만 동의 표시를 보내는지 본다.
// 3D 모형(0021): 사람이 고른 ★ 그림 한 장을 3D 서비스로 보낸다. 어디서 만드는지(Meshy, 미국 | 우리 컴퓨터)는
// 사이트 환경 변수 AVATAR_MODEL_PROVIDER를 따르고, 동의 글·3D 확인 글·개인정보 화면이 같은 곳에서 고른다.
// Meshy가 받은 그림을 학습에 쓸 수 있다는 약관 내용(또는 학습 제외를 요청해 두었다는 것, MESHY_TRAINING_OPTOUT)과
// 끝나면 Meshy 쪽 사본을 지운다는 것도 세 곳이 같은 한 문장(meshyTraining)으로 알린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONSENT_ARCHIVE, CONSENT_GUARDIAN, CONSENT_MAIN, CONSENT_VIEWS_FIELD, GUARDIAN_FIELD, SUBJECT_FIELD, SUBJECT_LABEL, SUBJECT_QUESTION, consentMain,
  consentPoints, meshyTraining, modelConfirm, modelConfirmYes, privacyModel, readModelProvider, readSubject, readTrainingOptOut,
} from '../../src/lib/avatar/consent.ts';

const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

test('동의 글: 머리말이 붙은 짧은 다섯 줄. 바깥으로 보내는 곳(OpenAI·Meshy 미국)과 여러 방향 그림, 지울 때까지 남고 함께 지워지는 것, 집주인 보관과 관리, 보이는 범위를 알린다', () => {
  for (const [p, o] of [['meshy', false], ['trellis', false], ['meshy', true]] as const) {
    const pts = consentPoints(p, o);
    assert.deepEqual(pts.map((x) => x.head), ['그림', '3D', '보관 기간', '집주인', '보이는 곳'], '다섯 줄, 머리말 순서');
    for (const { head, text } of pts) {
      // 휴대폰 동의 상자는 한 줄에 스무 자 남짓. 알릴 것이 가장 많은 3D 줄(나라, 한 장만, 원본 안 보냄, 학습 약관, 지움)도 대여섯 줄 안
      assert.ok(text.length <= 110, `${head} ${text.length}자: ${text}`);
      assert.equal(/[—–]/.test(text), false, '긴 줄표가 없다');
      assert.equal(text.startsWith(head), false, `${head}: 머리말을 본문에서 되풀이하지 않는다`);
    }
    const all = consentMain(p, o);
    assert.equal(all, pts.map((x) => `${x.head}: ${x.text}`).join(' '));
    assert.match(all, /그림: 사진과 그림을 OpenAI\(미국\)로 보내 캐릭터 그림과 여러 방향 그림을 그려요\./);
    assert.match(all, /원본 사진과 그림은 내가 지울 때까지 남고, 언제든 지울 수 있어요/);
    assert.match(all, /그림을 지우면 여러 방향 그림과 3D도 함께 지워져요/);
    assert.equal(all.match(/그림을 지우면/g)?.length, 1, '「그림을 지우면」은 한 번만');
    assert.match(all, /집주인: 기록으로 원본 사진, 그림, 3D 사본을 보관하고, 관리 화면에서 캐릭터를 지우거나 다시 만들 수 있어요/);
    assert.match(all, /내가 지운 것은 다음 정리 때 보관함에서도 지워요/);
    assert.match(all, /보이는 곳: 조연당 온라인에 들어온 사람에게만 보여요/);
    assert.doesNotMatch(all, /데에만 써요/, '사본을 남기므로 「그림을 만드는 데에만」이라고 하지 않는다');
  }
  assert.equal(CONSENT_VIEWS_FIELD, 'consent_views', '서버와 두 화면이 같은 이름을 쓴다');
  // 두 화면은 머리말을 굵게, 본문을 이어서 보인다(글을 따로 적지 않는다)
  for (const file of ['app/avatar/AvatarStudio.tsx', 'components/walk/CharacterPanel.tsx']) {
    assert.match(src(file), /<li key=\{p\.head\}><b>\{p\.head\}<\/b> \{p\.text\}<\/li>/, file);
  }
});

test('누구 사진이에요?: 나(만 14세 이상) 또는 아이(만 14세 미만, 보호자 동의). 폼 값은 둘만 받는다', () => {
  assert.equal(SUBJECT_QUESTION, '누구 사진이에요?');
  assert.deepEqual(SUBJECT_LABEL, { self: '나예요(만 14세 이상)', child: '아이예요(만 14세 미만)' });
  assert.match(CONSENT_GUARDIAN, /보호자이고, 아이 사진으로 캐릭터를 만드는 데 동의해요/);
  assert.deepEqual(['self', 'child', 'kid', '', null, undefined].map(readSubject), ['self', 'child', null, null, null, null]);
  assert.deepEqual([SUBJECT_FIELD, GUARDIAN_FIELD], ['subject', 'consent_guardian']);
  // 서버: 아이는 보호자 동의 없이는 받지 않고, 받으면 그 그림 줄에 적는다(0025). 옛 화면의 consent_self는 나로 본다
  const route = src('app/api/avatar/route.ts');
  assert.match(route, /readSubject\(form\.get\(SUBJECT_FIELD\)\) \?\? \(agreed\(form\.get\('consent_self'\)\) \? 'self' : null\)/);
  assert.match(route, /subject === 'child' && !agreed\(form\.get\(GUARDIAN_FIELD\)\)/);
  assert.match(route, /rpc\('avatar_guardian_agree', \{ p_id: id \}\)/);
});

test('집주인 보관함: 동의 글은 한 줄로 알리고 개인정보 화면에는 보관함 문장 전체. 「나만 볼 수 있어요」는 사이트 안에서만', () => {
  assert.match(CONSENT_ARCHIVE, /원본 사진, 캐릭터 그림, 3D 모형의 사본을 집주인 컴퓨터의 보관함에 남겨요/);
  assert.match(CONSENT_ARCHIVE, /내가 여기서 지운 것은 보관함에서도 다음 정리 때 지워요/);
  assert.doesNotMatch(CONSENT_ARCHIVE, /[—–]/);
  const privacy = src('app/privacy/page.tsx');
  assert.match(privacy, /<li>\{CONSENT_ARCHIVE\}<\/li>/);
  assert.match(privacy, /사이트에서 원본 사진은 나만 볼 수 있어요/);
  assert.match(privacy, /만 14세 미만 아이의 사진은 보호자가 동의할 때만 받아요/);
  assert.doesNotMatch(privacy, /아이로 보이는 사진은 캐릭터를 만들지 않아요/);
  assert.match(src('app/avatar/page.tsx'), /집주인 보관함의 사본도 내가 지우면 다음 정리 때 지워요/);
});

test('동의 글의 3D: 기본(meshy)은 고른 그림 한 장만 Meshy(미국)로 보내고, 약관상 학습에 쓸 수 있다고 사실대로 알린다', () => {
  assert.equal(CONSENT_MAIN, consentMain('meshy'), '기본은 외부로 보낸다고 알리는 쪽');
  assert.equal(consentMain(), consentMain('meshy', false), '기본은 학습 제외를 요청하기 전');
  const meshy = consentPoints('meshy')[1].text;
  assert.match(meshy, /^내가 고른 ★ 그림 한 장만 Meshy\(미국\)로 보내 만들어요\. 사진 원본은 보내지 않아요\./);
  assert.match(meshy, /Meshy 약관상 받은 그림이 학습에 쓰일 수 있고, 끝나면 Meshy 쪽 사본은 지워요\.$/);
  assert.doesNotMatch(consentMain('meshy'), /우리 컴퓨터/);
  assert.match(consentPoints('meshy', true)[1].text, /Meshy에는 받은 그림을 학습에 쓰지 않도록 요청해 두었고,/);
  assert.doesNotMatch(consentMain('meshy', true), /학습에 쓰일 수/);
  const trellis = consentPoints('trellis')[1].text;
  assert.match(trellis, /^내가 고른 ★ 그림 한 장으로 우리 컴퓨터에서 만들어요\. 바깥으로 보내지 않아요\.$/);
  assert.doesNotMatch(consentMain('trellis'), /Meshy|학습/);
  assert.equal(consentMain('trellis', true), consentMain('trellis'), '우리 컴퓨터는 학습 문장이 없다');
});

test('Meshy 학습 한 문장은 한곳(meshyTraining)에: 동의 글·3D 확인·개인정보 화면이 같은 문장을 쓴다', () => {
  for (const optOut of [false, true]) {
    const line = meshyTraining(optOut);
    assert.ok(consentMain('meshy', optOut).includes(line));
    assert.ok(modelConfirm('meshy', 1, optOut).includes(line));
    assert.ok(privacyModel('meshy', optOut).includes(line));
    assert.equal(/[—–]/.test(line), false);
  }
  assert.notEqual(meshyTraining(false), meshyTraining(true));
  // 다른 파일에 따로 적지 않는다
  for (const file of ['app/avatar/AvatarStudio.tsx', 'components/walk/CharacterPanel.tsx', 'app/privacy/page.tsx', 'app/avatar/page.tsx']) {
    assert.doesNotMatch(src(file), /학습에 쓰일 수|학습에 쓰지 않도록/, file);
  }
});

test('3D 모드는 환경 변수 AVATAR_MODEL_PROVIDER: trellis일 때만 우리 컴퓨터, 그 밖과 빈 값은 Meshy(덜 알리는 쪽으로 틀리지 않게)', () => {
  assert.equal(readModelProvider('trellis'), 'trellis');
  assert.equal(readModelProvider(' TRELLIS '), 'trellis');
  for (const v of ['meshy', 'Meshy', '', '  ', 'trellis2', 'local', undefined, null]) assert.equal(readModelProvider(v), 'meshy', String(v));
  const server = src('lib/avatar/server.ts');
  assert.match(server, /readModelProvider\(process\.env\.AVATAR_MODEL_PROVIDER\)/);
});

test('학습 제외는 환경 변수 MESHY_TRAINING_OPTOUT이 1일 때만(답을 받은 뒤 켠다). 그 밖은 약관대로 알린다', () => {
  assert.equal(readTrainingOptOut('1'), true);
  assert.equal(readTrainingOptOut(' 1 '), true);
  for (const v of ['0', 'true', 'yes', '', undefined, null, '11']) assert.equal(readTrainingOptOut(v), false, String(v));
  assert.match(src('lib/avatar/server.ts'), /readTrainingOptOut\(process\.env\.MESHY_TRAINING_OPTOUT\)/);
});

test('3D 확인 글: 무엇을 어디로 보내는지, 학습 한 문장, 한 사람 몇 번인지(제한이 없으면 말하지 않는다). 긴 줄표가 없다', () => {
  assert.equal(modelConfirm('meshy', 1),
    '이 캐릭터 그림을 3D로 만들려고 외부 3D 서비스(Meshy, 미국)로 보내요. 사진 원본은 보내지 않아요. ' +
    'Meshy 약관상 받은 그림이 학습에 쓰일 수 있고, 끝나면 Meshy 쪽 사본은 지워요. 한 사람 한 번만 만들 수 있어요. 보낼까요?');
  assert.equal(modelConfirm('meshy', null),
    '이 캐릭터 그림을 3D로 만들려고 외부 3D 서비스(Meshy, 미국)로 보내요. 사진 원본은 보내지 않아요. ' +
    'Meshy 약관상 받은 그림이 학습에 쓰일 수 있고, 끝나면 Meshy 쪽 사본은 지워요. 보낼까요?');
  assert.match(modelConfirm('meshy', 2), /한 사람 2번까지 만들 수 있어요/);
  assert.match(modelConfirm('meshy', 1, true), /학습에 쓰지 않도록 요청해 두었고/);
  assert.equal(modelConfirm('trellis', 1), '이 캐릭터 그림으로 우리 컴퓨터에서 3D를 만들어요(바깥 서비스로 보내지 않아요). 한 사람 한 번만 만들 수 있어요. 만들까요?');
  assert.equal(modelConfirm('trellis', 1, true), modelConfirm('trellis', 1));
  assert.deepEqual([modelConfirmYes('meshy'), modelConfirmYes('trellis')], ['보내기', '3D 만들기']);
  for (const p of ['meshy', 'trellis'] as const) {
    for (const cap of [1, null]) {
      for (const optOut of [false, true]) {
        const t = modelConfirm(p, cap, optOut);
        assert.equal(/[—–]/.test(t), false);
        assert.ok(t.length <= 170, `${p} ${cap} ${optOut}: ${t.length}자`);
      }
    }
  }
});

test('개인정보 화면의 3D 설명: 모드에 따라 Meshy(미국)로 보내거나 우리 컴퓨터에서 만든다. 학습 한 문장도. 화면은 환경 변수로 고른다', () => {
  assert.match(privacyModel('meshy'), /고른 캐릭터 그림 한 장을 외부 서비스\(Meshy, 미국\)로 보내 3D를 만들어요\(사진 원본은 보내지 않아요\)/);
  assert.match(privacyModel('meshy'), /Meshy 약관상 받은 그림이 학습에 쓰일 수 있고/);
  assert.match(privacyModel('meshy', true), /학습에 쓰지 않도록 요청해 두었고/);
  assert.match(privacyModel('trellis'), /우리 컴퓨터에서 만들고 바깥 서비스로 보내지 않아요/);
  const page = src('app/privacy/page.tsx');
  assert.match(page, /\{privacyModel\(provider, optOut\)\}/);
  assert.match(page, /const provider = modelProvider\(\);/);
  assert.match(page, /const optOut = meshyTrainingOptOut\(\);/);
  assert.doesNotMatch(page, /우리 컴퓨터에서 만들고 바깥 서비스로/, '3D 설명을 화면에 따로 적지 않는다(모드와 어긋나지 않게)');
  assert.match(page, /만든 캐릭터 그림은 내가 지울 때까지 이력에 남아요/);
  assert.match(page, /여러 방향 그림과 3D 모형도 함께 지워져요/);
});

test('동의 글: 두 화면이 같은 글을 쓰고(따로 적지 않는다), 둘 다 동의 표시를 함께 보내며, 서버는 그 표시가 있을 때만 적는다', () => {
  for (const file of ['app/avatar/AvatarStudio.tsx', 'components/walk/CharacterPanel.tsx']) {
    const s = src(file);
    assert.match(s, /consentPoints\(provider, optOut\)\.map/, `${file}: 같은 글을 서버가 알려 준 3D 모드와 학습 제외로 보여 준다`);
    assert.match(s, /\{SUBJECT_QUESTION\}/, `${file}: 누구 사진인지 묻는다`);
    assert.match(s, /\{CONSENT_GUARDIAN\}/, `${file}: 아이를 고르면 보호자 동의를 받는다`);
    assert.doesNotMatch(s, /외부 AI 서비스|Meshy|우리 컴퓨터/, `${file}: 글을 따로 적어 두지 않는다`);
  }
  assert.match(src('app/avatar/page.tsx'), /provider=\{provider\} optOut=\{optOut\}/, '내 캐릭터 화면은 서버가 모드와 학습 제외를 넘긴다');
  assert.match(src('app/api/avatar/slots/route.ts'), /provider, models_on: modelsOn\(\), training_optout: meshyTrainingOptOut\(\)/,
    '걷기 화면은 칸 답으로 모드와 학습 제외를 받는다');
  assert.match(src('app/avatar/AvatarStudio.tsx'), /body\.append\(CONSENT_VIEWS_FIELD, '1'\)/);
  assert.match(src('components/walk/useCharacter.ts'), /body\.append\(CONSENT_VIEWS_FIELD, '1'\)/);
  const route = src('app/api/avatar/route.ts');
  assert.match(route, /if \(agreed\(form\.get\(CONSENT_VIEWS_FIELD\)\)\)/);
  assert.match(route, /rpc\('avatar_views_agree', \{ p_id: id \}\)/);
});
