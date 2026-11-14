// 찍은 사진을 이 기기에 남기는 길 고르기. 화면과 떼어 놓아 시험할 수 있게 한다.
// a.download는 결과를 알 수 없고, 앱 안 브라우저(웹뷰)에서는 받아 주는 앱이 없으면 조용히 사라진다.
// iOS에서는 내려받아도 사진 앱이 아니라 파일 앱으로 간다. 그래서 그 두 곳은 공유 시트(「이미지 저장」)를 먼저 쓴다.

/** shared 공유 시트로 넘김 · closed 손님이 시트를 닫음 · tap 한 번 더 눌러야 함 · hold 길게 눌러 저장 · download 내려받기 시작 */
export type SaveWay = 'shared' | 'closed' | 'tap' | 'hold' | 'download';

export type SaveEnv = {
  /** 공유 시트를 먼저 쓸 기기인가(iOS, 앱 안 브라우저). 그 밖에는 지금처럼 바로 내려받는다 */
  sheet: boolean;
  /** 앱 안 브라우저인가: 내려받기를 믿을 수 없어 사진을 화면에 띄운다 */
  inApp: boolean;
  /** 「사진 저장」을 눌러 다시 하는 중인가(또 거절되면 되묻지 않고 다음 길로) */
  again?: boolean;
  canShare?: (d: { files: File[] }) => boolean;
  share?: (d: { files: File[] }) => Promise<void>;
  download: (blob: Blob, name: string) => void;
};

/** iPadOS는 맥 사파리 흉내를 내므로 손가락 점 개수로 가른다 */
export const isIOS = (ua: string, touchPoints = 0) =>
  /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1);

export async function saveShot(blob: Blob, name: string, env: SaveEnv): Promise<SaveWay> {
  if (env.sheet && env.share && env.canShare) {
    try {
      const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
      if (env.canShare({ files: [file] })) {
        await env.share({ files: [file] });
        return 'shared';
      }
    } catch (e) {
      const why = (e as { name?: string } | null)?.name;
      if (why === 'AbortError') return 'closed';
      // 찍는 사이에 누른 동작의 시간이 지나 거절됐다: 단추를 한 번 더 누르게 한다
      if (why === 'NotAllowedError' && !env.again) return 'tap';
      // 그 밖의 실패는 아래 길로
    }
  }
  if (env.inApp) return 'hold';
  env.download(blob, name);
  return 'download';
}
