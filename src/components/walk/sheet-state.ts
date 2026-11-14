// 걷기 화면 위에 페이지 시트(방 쪽지·수첩·갤러리 등)가 떠 있는지. 시트 틀(WalkSheetFrame)이 쓰고,
// 걷기 화면(그리기 쉬기, 키 멈추기)과 사이트 단축키(Shortcuts)가 읽는다. 서로를 가져오지 않게 작은 저장소로 둔다.
// 틀이 겹쳐 붙었다 떨어지는 순간(시트 안에서 다른 페이지로 갈 때)에도 닫힌 것으로 잠깐 튀지 않게 수로 센다.

let open = 0;
const subs = new Set<() => void>();

function tell() {
  for (const fn of subs) fn();
}

/** 시트가 하나 떴다. 돌려준 함수를 부르면 그 시트가 내려간 것으로 친다(두 번 불러도 한 번만) */
export function holdSheet(): () => void {
  open += 1;
  tell();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    open = Math.max(0, open - 1);
    tell();
  };
}

export function isSheetOpen(): boolean {
  return open > 0;
}

/** useSyncExternalStore에 넘기는 구독 */
export function subscribeSheet(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
