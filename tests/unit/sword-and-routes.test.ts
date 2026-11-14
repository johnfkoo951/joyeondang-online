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
const { SWORD_SNAPSHOT, computeSwordScore, isSwordCleared, parseSwordMessage } = await import('../../src/games/sword/logic.ts');
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
  assert.equal(computeSwordScore({ started: false, stage: 1, level: 1, candies: 0, totalCandies: 0, kills: 0 }), 0);
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
