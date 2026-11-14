// 찍은 사진을 기기에 남기는 길: 공유 시트가 되는 곳은 그쪽으로, 앱 안 브라우저는 길게 눌러 저장, 그 밖에는 내려받기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIOS, saveShot, type SaveEnv } from '../../src/components/walk/saveShot.ts';

const blob = new Blob(['x'], { type: 'image/jpeg' });
const named = (name: string) => Object.assign(new Error(name), { name });

/** 부른 일을 적어 두는 가짜 기기 */
function device(over: Partial<SaveEnv> & { shareFails?: Error; can?: boolean } = {}) {
  const log: string[] = [];
  const { shareFails, can = true, ...rest } = over;
  const env: SaveEnv = {
    sheet: true,
    inApp: false,
    canShare: () => can,
    share: async (d) => {
      log.push(`share:${d.files[0]?.name}:${d.files[0]?.type}`);
      if (shareFails) throw shareFails;
    },
    download: (_b, name) => log.push(`download:${name}`),
    ...rest,
  };
  return { env, log };
}

test('공유 시트가 되면 시트로만 넘기고 내려받지 않는다', async () => {
  const { env, log } = device();
  assert.equal(await saveShot(blob, 'a.jpg', env), 'shared');
  assert.deepEqual(log, ['share:a.jpg:image/jpeg']);
});

test('손님이 시트를 닫으면(AbortError) 조용히 끝낸다', async () => {
  const { env, log } = device({ shareFails: named('AbortError') });
  assert.equal(await saveShot(blob, 'a.jpg', env), 'closed');
  assert.equal(log.some((l) => l.startsWith('download')), false);
});

test('누른 동작의 시간이 지나 거절되면 한 번 더 누르게 하고, 다시 눌러도 거절되면 다음 길로 간다', async () => {
  const first = device({ shareFails: named('NotAllowedError') });
  assert.equal(await saveShot(blob, 'a.jpg', first.env), 'tap');
  assert.equal(first.log.some((l) => l.startsWith('download')), false, '되묻는 동안에는 내려받지 않는다');

  const again = device({ shareFails: named('NotAllowedError'), again: true });
  assert.equal(await saveShot(blob, 'a.jpg', again.env), 'download');
  const inApp = device({ shareFails: named('NotAllowedError'), again: true, inApp: true });
  assert.equal(await saveShot(blob, 'a.jpg', inApp.env), 'hold');
});

test('파일 공유가 안 되는 기기: 보통 브라우저는 내려받고, 앱 안 브라우저는 사진을 띄운다(내려받기를 부르지 않는다)', async () => {
  const plain = device({ can: false });
  assert.equal(await saveShot(blob, 'a.jpg', plain.env), 'download');
  assert.deepEqual(plain.log, ['download:a.jpg']);

  const webview = device({ inApp: true, canShare: undefined, share: undefined });
  assert.equal(await saveShot(blob, 'a.jpg', webview.env), 'hold');
  assert.deepEqual(webview.log, []);

  const broken = device({ inApp: true, shareFails: named('DataError') });
  assert.equal(await saveShot(blob, 'a.jpg', broken.env), 'hold', '그 밖의 공유 실패도 사진을 잃지 않는다');
});

test('공유 시트를 먼저 쓰지 않는 기기(데스크탑, 안드로이드 브라우저)는 지금처럼 바로 내려받는다', async () => {
  const { env, log } = device({ sheet: false });
  assert.equal(await saveShot(blob, 'a.jpg', env), 'download');
  assert.deepEqual(log, ['download:a.jpg']);
});

test('iOS 판정: 아이폰, 맥 흉내를 내는 아이패드는 맞고 맥과 안드로이드는 아니다', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  assert.equal(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'), true);
  assert.equal(isIOS(mac, 5), true);
  assert.equal(isIOS(mac, 0), false);
  assert.equal(isIOS('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 5), false);
});
