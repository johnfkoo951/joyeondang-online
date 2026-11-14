// 사진을 보내기 전에 기기에서 줄인다(브라우저 전용). /avatar 화면과 걷기 화면의 꾸미기 패널이 함께 쓴다.
// 휴대폰 원본은 서버·플랫폼 한도를 넘기 쉬워서, 줄이지 않고 보내면 올리기가 늘 실패한다.
import { RESIZE_LONG_EDGE, RESIZE_QUALITY } from '@/lib/avatar/rules';

/** 줄인 뒤의 가로·세로: 긴 변을 longEdge에 맞춘다(작은 사진을 키우지는 않는다) */
export function fitSize(width: number, height: number, longEdge: number = RESIZE_LONG_EDGE): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 긴 변을 1024px로 줄인 JPEG. 사진 속 위치·기기 정보는 이때 모두 사라진다. 브라우저가 못 여는 사진이면 던진다 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const img = await loadImage(file);
    source = img;
    width = img.naturalWidth;
    height = img.naturalHeight;
  }
  if (!width || !height) throw new Error('empty image');
  const size = fitSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', RESIZE_QUALITY);
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}
