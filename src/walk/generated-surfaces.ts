import * as THREE from 'three';

/** Generic decorative sources only; guest photographs use their own access-controlled loader. */
export const SURFACE_ASSETS = {
  hills: '/environment/salon-evening-hills-v1.webp',
  botanical: '/environment/salon-botanical-v1.webp',
  ink: '/environment/ink-mountain-v1.webp',
  rug: '/environment/salon-woven-rug-v1.webp',
} as const;

type Decoded = { image: CanvasImageSource; close: () => void };
export type SurfaceLoader = (url: string, signal: AbortSignal) => Promise<Decoded>;
type Rect = { x: number; y: number; w: number; h: number };

const decode: SurfaceLoader = async (url, signal) => {
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('Decorative image unavailable');
  const bitmap = await createImageBitmap(await response.blob());
  if (signal.aborted || bitmap.width > 2048 || bitmap.height > 2048) {
    bitmap.close();
    throw new Error('Decorative image cancelled or oversized');
  }
  return { image: bitmap, close: () => bitmap.close() };
};

/**
 * Paint into existing canvas textures rather than replacing material identities after static baking.
 * A failed load leaves the procedural surface intact. One decode per URL per scene, no retry loop.
 * Scene disposal aborts requests and also closes images that finish decoding after cancellation.
 */
export function createSurfaceAssets(onChange: () => void = () => {}, load: SurfaceLoader = decode) {
  let alive = true;
  const controller = new AbortController();
  const pending = new Map<string, Promise<Decoded | null>>();
  const owned = new Set<Decoded>();
  let loaded = 0, failed = 0;
  function source(url: string) {
    let p = pending.get(url);
    if (!p) {
      p = Promise.resolve().then(() => load(url, controller.signal)).then((value) => {
        if (!alive) { value.close(); return null; }
        owned.add(value);
        loaded++;
        return value;
      }).catch(() => { if (alive) failed++; return null; });
      pending.set(url, p);
    }
    return p;
  }
  return {
    paint(texture: THREE.CanvasTexture, url: string, rect?: Rect) {
      if (!alive) return;
      void source(url).then((value) => {
        if (!alive || !value) return;
        const canvas = texture.image as HTMLCanvasElement;
        if (!canvas.width || !canvas.height) return;
        const g = canvas.getContext('2d');
        if (!g) return;
        const r = rect ?? { x: 0, y: 0, w: canvas.width, h: canvas.height };
        g.drawImage(value.image, r.x, r.y, r.w, r.h);
        texture.needsUpdate = true;
        onChange();
      }).catch(() => { /* Retain the existing surface when a canvas cannot be updated. */ });
    },
    stats: () => ({ loaded, failed, pending: pending.size - loaded - failed }),
    dispose() {
      if (!alive) return;
      alive = false;
      controller.abort();
      owned.forEach((value) => value.close());
      owned.clear();
      pending.clear();
    },
  };
}

/** Upscale the fallback once, before first GPU upload, leaving its composition unchanged. */
export function enlargeSurface(texture: THREE.CanvasTexture, factor = 2) {
  const before = texture.image as HTMLCanvasElement;
  const next = document.createElement('canvas');
  next.width = before.width * factor;
  next.height = before.height * factor;
  next.getContext('2d')!.drawImage(before, 0, 0, next.width, next.height);
  texture.image = next;
  before.width = before.height = 0;
  texture.needsUpdate = true;
  return texture;
}

/** Keep UV samples inside their atlas cell; center-crop is applied by the caller before this inset. */
export function insetAtlasUV(value: number, cell: number, cells: number, cellPixels = 512, gutter = 4) {
  const inset = gutter / cellPixels;
  return (cell + inset + value * (1 - 2 * inset)) / cells;
}
