// 놀이 소리의 공용 시작점. iOS Safari(17 이상)는 기기 옆 무음 스위치가 켜져 있으면 Web Audio 소리를 내지 않는다.
// 놀이 소리는 「재생(playback)」 세션이라고 알려 무음 스위치와 상관없이 들리게 한다(navigator.audioSession, 기능 확인 뒤).
// 지원하지 않는 브라우저는 그냥 지나가고, AudioContext는 그대로 만든다.

type SessionLike = { type?: string };

/** 소리를 재생 세션으로 알린다. 바꿨으면 true(이미 playback이거나 지원하지 않으면 false) */
export function preferPlayback(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  try {
    const session = (nav as { audioSession?: SessionLike } | undefined)?.audioSession;
    if (!session || typeof session !== 'object' || !('type' in session) || session.type === 'playback') return false;
    session.type = 'playback';
    return true;
  } catch {
    // 못 바꿔도 소리는 낸다
    return false;
  }
}

/** 새 AudioContext(만들 수 없으면 null). 만들기 바로 전에 재생 세션으로 알린다. 사용자 동작 안에서 부른다 */
export function openAudioContext(options?: AudioContextOptions): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  preferPlayback();
  try {
    return options ? new AC(options) : new AC();
  } catch {
    return null;
  }
}
