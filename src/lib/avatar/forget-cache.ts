import { VIEW_SIZES, isUuid } from '@/lib/avatar/rules';

// 지운 캐릭터 그림이 이 기기의 브라우저 캐시(최대 1시간)에 남지 않게 한다.
// 캐시를 건너뛰어 한 번 다시 받으면 서버는 이제 404(no-store)로 답하고, 브라우저는 갖고 있던 옛 그림을 버린다.
// 그 그림으로 만든 방향 그림 묶음(걷기 화면이 받는 두 크기)과 3D 모형도 같은 방법으로 버린다:
// 주소는 걷기 엔진이 묻는 것과 글자까지 같아야 한다.
// 지우기는 이미 끝난 뒤라 여기서 실패해도 조용히 넘어간다(그때는 캐시 수명이 다하면 사라진다).
export function dropCachedAvatar(id: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!isUuid(id)) return Promise.resolve();
  const urls = [`/api/avatar/${id}`, ...VIEW_SIZES.map((s) => `/api/avatar/${id}/views?s=${s}`), `/api/avatar/${id}/model`];
  return Promise.all(
    urls.map((url) => fetcher(url, { cache: 'reload', credentials: 'same-origin' }).then(() => undefined, () => undefined)),
  ).then(() => undefined);
}
