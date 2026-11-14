// 놀이 소리 공용 시작점: iOS 무음 스위치를 넘도록 재생(playback) 세션으로 알리는지(기능 확인 뒤에만).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferPlayback } from '../../src/games/audio-session.ts';

test('audioSession이 있으면 playback으로 바꾸고, 없거나 막히면 그냥 지나간다', () => {
  const nav = { audioSession: { type: 'auto' } };
  assert.equal(preferPlayback(nav), true);
  assert.equal(nav.audioSession.type, 'playback');
  assert.equal(preferPlayback(nav), false, '이미 playback이면 그대로');
  assert.equal(preferPlayback({}), false, '지원하지 않는 브라우저');
  assert.equal(preferPlayback(undefined), false);
  const locked = {
    audioSession: {
      get type() {
        return 'auto';
      },
      set type(_v: string) {
        throw new Error('막힘');
      },
    },
  };
  assert.equal(preferPlayback(locked), false, '바꾸다 막혀도 던지지 않는다');
});
