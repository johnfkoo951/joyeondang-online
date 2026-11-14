import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string; shortCircuit?: boolean } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const { CANONICAL_GAME_IDS, JAZZ_GAME_IDS, resolveGameSlug } = await import('../../src/lib/game-routes.ts');
const { missingDoor } = await import('../../src/lib/known-path.ts');
const { INITIAL_SWORD_PROGRESS, SWORD_DRAGON_BONUS, SWORD_SNAPSHOT, computeSwordScore, isSwordCleared, parseSwordMessage } = await import('../../src/games/sword/logic.ts');
const { extractPlayInfoFromReadme, isAllowedSwordPlayUrl, transformSwordHtml } = await import('../../src/lib/sword-continent.ts');

test('단독 미니게임·재즈 스튜디오 경로 해석과 없는 이름 404 판정', () => {
  assert.equal(CANONICAL_GAME_IDS.length, 12);
  assert.deepEqual([...JAZZ_GAME_IDS], ['groove', 'pitch', 'jam']);
  assert.deepEqual(resolveGameSlug('sword'), { kind: 'game', id: 'sword', redirect: false });
  assert.deepEqual(resolveGameSlug('sword-continent'), { kind: 'game', id: 'sword', redirect: true });
  assert.deepEqual(resolveGameSlug('jazz'), { kind: 'jazz' });
  assert.equal(resolveGameSlug('unknown-game'), null);

  for (const id of [...CANONICAL_GAME_IDS, 'jazz', 'sword-continent']) {
    assert.equal(missingDoor(`/games/${id}`), false, `/games/${id}`);
    assert.equal(missingDoor(`/play/${id}`), false, `/play/${id}`);
  }
  assert.equal(missingDoor('/games/no-such-game'), true);
  assert.equal(missingDoor('/play/no-such-game'), true);
});

test('소드 콘티넌트 진행 메시지 파싱, 클리어 조건, 리더보드 점수 환산', () => {
  assert.equal(computeSwordScore(INITIAL_SWORD_PROGRESS), 0);
  const msg = parseSwordMessage({
    type: 'jy:sword-state',
    started: true,
    stage: 3,
    level: 2,
    candies: 45,
    totalCandies: 75,
    kills: 12,
  });
  assert.ok(msg);
  assert.equal(isSwordCleared(msg!), true);
  assert.ok(computeSwordScore(msg!) > 2000);
});

test('소드 콘티넌트 GitHub README 자동 추적 파서 및 공개 방문자 마스킹·브리지 주입', () => {
  const sampleReadme = '# Sword\n**현재 버전: v4.2 — 그림자 왕국 업데이트**\n플레이: https://brewpage.app/api/html/public/NewBuild99\n';
  const info = extractPlayInfoFromReadme(sampleReadme, SWORD_SNAPSHOT);
  assert.equal(info.version, 'v4.2');
  assert.equal(info.playUrl, 'https://brewpage.app/api/html/public/NewBuild99');
  assert.equal(isAllowedSwordPlayUrl('https://evil.example.org/x.html'), false);
  assert.equal(isAllowedSwordPlayUrl('https://raw.githubusercontent.com/johnfkoo951/sword-continent/main/index.html'), true);

  const html = transformSwordHtml('<!doctype html><html><head></head><body><h1>Game</h1></body></html>', {
    allowFamilyNames: false,
    playUrl: 'https://raw.githubusercontent.com/johnfkoo951/sword-continent/main/games/app.html',
  });
  assert.ok(html.includes('jy:sword-state'));
  assert.ok(html.includes('<base href="https://raw.githubusercontent.com/johnfkoo951/sword-continent/main/games/">'));
});

test('소드 콘티넌트 v4.4: 이전 판 메시지는 새 칸을 기본값으로, 누적 처치와 왕드래곤 단계는 점수가 차례로 커진다', () => {
  const old = parseSwordMessage({ type: 'jy:sword-state', started: true, stage: 2, level: 1, candies: 0, totalCandies: 0, kills: 7 });
  assert.ok(old);
  assert.equal(old!.totalKills, 7);
  assert.equal(old!.flute, false);
  assert.equal(old!.dragonSummoned, false);
  assert.equal(old!.dragonDown, false);

  const base = { ...INITIAL_SWORD_PROGRESS, started: true, stage: 9, level: 6, kills: 4, totalKills: 52 };
  // 스테이지를 넘어 이어진 누적 처치가 지금 스테이지 처치보다 점수에 반영된다
  assert.ok(computeSwordScore(base) > computeSwordScore({ ...base, totalKills: 4 }));
  const flute = computeSwordScore({ ...base, flute: true });
  const summoned = computeSwordScore({ ...base, dragonSummoned: true });
  const down = computeSwordScore({ ...base, dragonDown: true });
  assert.equal(flute - computeSwordScore(base), SWORD_DRAGON_BONUS.flute);
  assert.ok(computeSwordScore(base) < flute && flute < summoned && summoned < down);
  assert.equal(down - computeSwordScore(base), SWORD_DRAGON_BONUS.flute + SWORD_DRAGON_BONUS.summoned + SWORD_DRAGON_BONUS.down);
  assert.equal(isSwordCleared({ ...INITIAL_SWORD_PROGRESS, flute: true }), true);
  // 참(true)이 아닌 값(문자열·숫자)은 단계로 치지 않는다
  const fake = parseSwordMessage({ type: 'jy:sword-state', flute: 'yes', dragonDown: 1 });
  assert.equal(fake!.flute, false);
  assert.equal(fake!.dragonDown, false);
});

test('소드 콘티넌트 v4.4: 공개 방문자에게 1P·2P 호칭을 가리고, 다리 스크립트가 왕드래곤 단계를 보낸다', () => {
  // 시험에도 실명 글자를 그대로 두지 않는다(개인정보 검문)
  const p1 = String.fromCharCode(0xd0dc, 0xc6a9);
  const p2 = String.fromCharCode(0xc0b0, 0xc774, 0x20, 0xd615);
  const raw = `<html><head></head><body><button>1P ${p1}이 (방 생성)</button><b>2P ${p2} (참여)</b><i>${p2}과 함께!</i><p>${p1}이가 왕드래곤을 무찔렀어</p><span>${p1} 대영웅</span></body></html>`;
  const masked = transformSwordHtml(raw, { allowFamilyNames: false, playUrl: SWORD_SNAPSHOT.playUrl });
  assert.equal(masked.includes(p1), false);
  assert.equal(masked.includes(p2), false);
  assert.ok(masked.includes('1P 용사 (방 생성)'));
  assert.ok(masked.includes('2P 수호자 (참여)'));
  assert.ok(masked.includes('수호자와 함께!'));
  assert.ok(masked.includes('용사가 왕드래곤을'));
  assert.ok(masked.includes('용사 대영웅'));
  const kept = transformSwordHtml(raw, { allowFamilyNames: true, playUrl: SWORD_SNAPSHOT.playUrl });
  assert.ok(kept.includes(`1P ${p1}이`));
  for (const key of ['totalKills', 'dragonSummoned', 'dragonDown', 'kingEndingModal']) assert.ok(masked.includes(key), key);
  assert.equal(SWORD_SNAPSHOT.version, 'v4.4');
});
