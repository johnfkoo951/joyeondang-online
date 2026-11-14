// 그림 읽고 쓰기와 크기 조절(sharp를 감싼 얇은 층). 화소 계산은 src/lib/avatar/sheet.ts가 하고 여기서는 바이트 ↔ RGBA만 맡는다.
// 일꾼의 다른 파일은 이 어댑터를 바깥에서 받는다(시험에서는 가짜를 넘긴다).
//   decode(bytes) → {data, w, h}   PNG·WebP·JPEG 바이트를 RGBA 화소로(알파가 없으면 255로 채운다)
//   resize(img, w, h) → {data, w, h}
//   encodeWebp(img) → Uint8Array   방향 그림 묶음용
//   encodePng(img) → Uint8Array
//   previewJpeg(bytes) → Uint8Array   비전 모델에 보여 줄 작은 JPEG
// sharp는 next가 함께 들여오는 선택 의존성이다. 없는 맥에서도 한 장 그리기는 돌아야 하므로 부르는 쪽이 실패를 받아 넘긴다.

/** 비전 모델에 보내는 그림의 폭. 다섯 사람이 한 줄인 시트에서 얼굴 방향을 읽기에 넉넉하다 */
const PREVIEW_WIDTH = 1400;

export async function createImage() {
  const { default: sharp } = await import('sharp');
  const raw = (img) =>
    sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.w, height: img.h, channels: 4 } });
  const bytesOf = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
  return {
    async decode(bytes) {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data: bytesOf(data), w: info.width, h: info.height };
    },
    async resize(img, w, h) {
      const { data } = await raw(img).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
      return { data: bytesOf(data), w, h };
    },
    // exact: 투명한 화소의 색을 버리지 않는다(몸 바깥으로 번지게 채운 색이 걷기 화면에서 가장자리의 어두운 테를 막는다)
    async encodeWebp(img) {
      return bytesOf(await raw(img).webp({ quality: 84, alphaQuality: 92, exact: true, effort: 5 }).toBuffer());
    },
    async encodePng(img) {
      return bytesOf(await raw(img).png().toBuffer());
    },
    // 흰 바탕에 올려 보낸다: 투명 바탕에 남은 옅은 얼룩이 사람으로 읽히지 않게
    async previewJpeg(bytes) {
      return bytesOf(await sharp(bytes).flatten({ background: '#ffffff' }).resize({ width: PREVIEW_WIDTH }).jpeg({ quality: 88 }).toBuffer());
    },
  };
}
