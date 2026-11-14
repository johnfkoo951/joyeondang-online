// 누구에게나 같은 답을 서버 프로세스 안에서 잠깐 기억한다. 외부 의존성 없는 순수 함수(node --test 로 바로 돈다).
// CDN 캐시는 주소 뒤 쿼리가 다르면 비켜 가므로, 그때도 요청마다 DB에 가지 않게 하는 두 번째 겹이다.

/**
 * load를 감싼다: ms 안에 다시 물으면 기억한 답을 주고, 동시에 온 물음은 한 번의 load를 함께 기다린다.
 * load가 null을 주거나 던지면 기억하지 않는다(실패를 굳히지 않는다).
 * load가 waitMs 안에 끝나지 않으면 기다리던 물음들에 null을 주고 놓는다: 답 없는 한 번의 요청에
 * 그 뒤의 모든 물음이 줄줄이 매달리지 않게(늦게 온 답은 버린다).
 */
export function shortMemo<T>(
  ms: number, load: () => Promise<T | null>, now: () => number = Date.now, waitMs = 4000,
): () => Promise<T | null> {
  let memo: { at: number; value: T } | null = null;
  let flying: Promise<T | null> | null = null;
  return () => {
    if (memo && now() - memo.at < ms) return Promise.resolve(memo.value);
    if (!flying) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<null>((done) => {
        timer = setTimeout(() => done(null), waitMs);
      });
      let mine: Promise<T | null> | null = null;
      const work = load().then((value) => {
        // 기다리다 놓은 뒤에 온 답은 기억하지 않는다(그 사이 더 새 답이 들어왔을 수 있다)
        if (flying === mine) memo = value === null ? null : { at: now(), value };
        return value;
      });
      mine = Promise.race([work, late]).finally(() => {
        clearTimeout(timer);
        if (flying === mine) flying = null;
      });
      // 놓은 뒤 load가 던져도 처리되지 않은 거부로 남지 않게
      work.catch(() => {});
      flying = mine;
    }
    return flying;
  };
}
