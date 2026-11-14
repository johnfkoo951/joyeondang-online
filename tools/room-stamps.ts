// 방 의견함 장부를 지금 방에 맞춘다: npm run room-stamps (바뀐 방만 그때의 버전·시각으로 한 줄 더 적는다)
// npm run room-stamps -- --check 는 고치지 않고 밀린 방만 알린다(밀렸으면 끝 코드 1).
// 방 장면·마감·창밖·방 소개를 고친 뒤, 커밋하기 전에 돌린다. package.json 버전을 먼저 올렸으면 그 버전이 적힌다.
import * as nodeModule from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('src/', ROOT);
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

const { computePrints, stampLedger, staleRooms } = await import('../src/lib/room-voice-stamp.ts');
const LEDGER = new URL('src/content/room-voice-stamps.json', ROOT);
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const version = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')).version as string;
const prints = computePrints();

if (process.argv.includes('--check')) {
  const stale = staleRooms(ledger, prints);
  if (stale.length) {
    console.error(`의견함 장부가 밀린 방: ${stale.join(', ')} (npm run room-stamps 로 적어 주세요)`);
    process.exit(1);
  }
  console.log('의견함 장부가 지금 방과 맞아요.');
} else {
  const { ledger: next, changed } = stampLedger(ledger, prints, version, new Date().toISOString());
  if (!changed.length) {
    console.log('바뀐 방이 없어요.');
  } else {
    writeFileSync(LEDGER, `${JSON.stringify(next, null, 2)}\n`);
    for (const slug of changed) {
      const e = next.rooms[slug].history[0];
      const add = e.added.length ? ` 새로 ${e.added.length}` : '';
      const rm = e.removed.length ? ` 빠짐 ${e.removed.length}` : '';
      console.log(`${slug}: v${version}${add}${rm}`);
    }
  }
}
