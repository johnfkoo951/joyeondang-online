// 부엌 사진 갤러리의 전시 목록(매니페스트) 모양과 검사. 서버(목록 읽기·쓰기)와 화면(받은 목록 읽기)과 시험이 함께 쓴다.
// 외부 의존성 없는 순수 함수만 둔다.
//
// 목록 파일은 비공개 버킷 gallery의 manifest.json 하나다(서버만 읽고 쓴다, src/lib/gallery.ts). 모양:
//   { "items": { "<액자 id>": { "image": "images/<파일>.jpg", "thumb": "images/<파일>-t.jpg", "title": "제목", "desc": "설명" } } }
// 액자 id는 걷기 화면의 빈 액자 판에 적힌 번호다(예: 1-a-2, src/walk/gallery.ts FRAME_ID). image는 버킷 안 경로이고
// 그림(JPEG·PNG·WebP)이어야 한다. thumb는 없어도 된다. 그림 경로가 없거나 틀린 줄은 없는 것으로 본다(그 액자는 「곧 전시해요」).
// 파일 자체가 깨졌으면(JSON이 아니거나 items가 없다) 손님 화면은 모두 「곧 전시해요」이고, 승인함은 그 위에 쓰지 않는다.
// 승인함이 다시 쓸 때는 이해하지 못한 줄과 칸을 그대로 둔다(editManifest).
import { FRAME_ID } from '@/walk/gallery';

export const MANIFEST_FILE = 'manifest.json';

export const GALLERY_TEXT = {
  /** 제목·설명 글자 수 상한 */
  title: 60,
  desc: 600,
  /** 목록 한 장에 담는 줄 수와 파일 크기 상한 */
  items: 120,
  bytes: 256 * 1024,
  /** 제목이 비었을 때 */
  untitled: '무제',
} as const;

/** 목록 한 줄(버킷 안 경로) */
export type ManifestEntry = { image: string; thumb?: string; title: string; desc: string };
/**
 * 손님 화면이 받는 한 줄(그림은 서명 주소 또는 미리보기 주소). key는 그림이 바뀔 때만 바뀌는 짧은 열쇠다:
 * 서명 주소는 목록을 받을 때마다 바뀌므로, 화면은 이 열쇠로 「같은 그림」을 알아보고 이미 받은 그림을 다시 받지 않는다
 */
export type GalleryItem = { id: string; key: string; title: string; desc: string; image: string; thumb?: string };

/** 그림 열쇠 모양(16진 16~64자) */
const ART_KEY = /^[0-9a-f]{16,64}$/;

/**
 * 그림 열쇠: 받은 조각들(버킷 경로, 또는 미리보기 파일 내용)을 SHA-256으로 다져 앞 16자. 조각마다 길이를 앞에 붙여
 * 경계가 섞이지 않게 한다. 경로 자체는 내보내지 않는다
 */
export async function artKey(...parts: Array<string | Uint8Array | undefined>): Promise<string> {
  const enc = new TextEncoder();
  const chunks = parts.map((p) => (p === undefined ? new Uint8Array(0) : typeof p === 'string' ? enc.encode(p) : p));
  const buf = new Uint8Array(chunks.reduce((n, c) => n + 4 + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    new DataView(buf.buffer).setUint32(at, c.length);
    buf.set(c, at + 4);
    at += 4 + c.length;
  }
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return [...d.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const PATH_CONTROL = /[\u0000-\u001f\u007f]/;

/** 글 한 칸: 앞뒤 빈칸·제어 문자를 지우고 줄바꿈은 둘까지만 이어 둔다. 비면 '' */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max).trim();
}

/** 버킷 안 그림 경로인가: 앞에 /가 없고, . .. 칸과 \가 없고, 그림 확장자로 끝난다 */
export function isGalleryPath(v: unknown): v is string {
  if (typeof v !== 'string' || !v || v.length > 200 || v.startsWith('/') || v.includes('\\') || PATH_CONTROL.test(v)) return false;
  if (v.split('/').some((seg) => !seg || seg === '.' || seg === '..')) return false;
  return /\.(?:jpe?g|png|webp)$/i.test(v) && v !== MANIFEST_FILE;
}

export const isFrameId = (v: unknown): v is string => typeof v === 'string' && FRAME_ID.test(v);

function entryOf(o: unknown): ManifestEntry | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (!isGalleryPath(r.image)) return null;
  const e: ManifestEntry = {
    image: r.image,
    title: cleanText(r.title, GALLERY_TEXT.title) || GALLERY_TEXT.untitled,
    desc: cleanText(r.desc ?? r.description, GALLERY_TEXT.desc),
  };
  if (isGalleryPath(r.thumb)) e.thumb = r.thumb;
  return e;
}

/** 목록 파일의 한 줄 그대로(id는 표의 열쇠 또는 배열 칸의 id 값, value는 그 줄의 값) */
type Row = { id: unknown; value: unknown };

/**
 * 읽은 목록 파일 한 장. entries는 쓸 수 있는 줄(액자 id → 전시물)이고, 나머지는 다시 쓸 때 그대로 두려고 파일 모양을 든다:
 * 이해하지 못한 줄(액자 id가 아니거나 그림 경로가 틀렸거나 같은 id의 뒤 줄, 처음 120줄 밖)과 칸(메모 등)을 말없이 지우지 않게
 */
export type ManifestDoc = {
  entries: ReadonlyMap<string, ManifestEntry>;
  /** items 밖의 맨 위 칸들 */
  rest: Readonly<Record<string, unknown>>;
  /** items가 id를 열쇠로 한 표인가, { id, … } 배열인가 */
  shape: 'map' | 'list';
  /** 파일의 줄 차례 그대로 */
  rows: readonly Row[];
  /** entries에 든 줄의 자리(rows 안) */
  used: ReadonlyMap<string, number>;
  /** 읽지 못해 건너뛴 줄 수(파일에는 남아 있다) */
  skipped: number;
};

/** 목록 파일이 아직 없을 때(처음 걸기 전) */
export function emptyManifest(): ManifestDoc {
  return { entries: new Map(), rest: {}, shape: 'map', rows: [], used: new Map(), skipped: 0 };
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * 목록 파일 내용(글 또는 이미 푼 값)을 읽는다. 깨졌으면 null: JSON이 아니거나, 맨 위가 객체가 아니거나, items가 표·배열이
 * 아니거나(빠졌어도), 너무 크다. 깨진 목록 위에는 쓰지 않는다(새 줄 하나만 든 목록으로 덮어쓰면 손으로 넣은 전시가 모두 사라진다).
 * 모양이 틀린 줄은 entries에서만 빼고 센다(같은 id는 처음 것만). items는 id를 열쇠로 한 표와 { id, … } 배열 둘 다 받는다
 */
export function readManifestDoc(raw: unknown): ManifestDoc | null {
  let v = raw;
  if (typeof v === 'string') {
    if (v.length > GALLERY_TEXT.bytes) return null;
    try {
      v = JSON.parse(v.replace(/^﻿/, ''));
    } catch {
      return null;
    }
  }
  if (!isObj(v)) return null;
  const { items, ...rest } = v;
  let shape: ManifestDoc['shape'];
  let rows: Row[];
  if (Array.isArray(items)) {
    shape = 'list';
    rows = items.map((it) => ({ id: isObj(it) ? it.id : undefined, value: it }));
  } else if (isObj(items)) {
    shape = 'map';
    rows = Object.entries(items).map(([id, value]) => ({ id, value }));
  } else return null;
  const entries = new Map<string, ManifestEntry>();
  const used = new Map<string, number>();
  rows.forEach((r, i) => {
    if (i >= GALLERY_TEXT.items || !isFrameId(r.id) || entries.has(r.id)) return;
    const e = entryOf(r.value);
    if (!e) return;
    entries.set(r.id, e);
    used.set(r.id, i);
  });
  return { entries, rest, shape, rows, used, skipped: rows.length - entries.size };
}

/** 읽은 줄만(깨졌으면 null). 손님 화면에 줄 목록과 미리보기가 쓴다 */
export function parseManifest(raw: unknown): Map<string, ManifestEntry> | null {
  const doc = readManifestDoc(raw);
  return doc ? new Map(doc.entries) : null;
}

/**
 * 한 액자의 줄을 바꾸거나(entry) 지운(null) 새 파일 내용. 읽은 줄은 파일 차례대로 앞에, 새 줄은 그 뒤, 이해하지 못한 줄은
 * 맨 뒤에 그대로 둔다(읽지 못한 줄이 앞을 차지해 고친 줄이 읽는 범위 120줄 밖으로 밀리지 않게). 고친 줄도 모르는 칸(메모 등)은
 * 그대로 두고 그림·제목·설명만 바꾼다(설명을 description으로 적었으면 desc로 옮긴다). 지울 때는 같은 id의 뒤 줄도 지운다
 * (남기면 그 줄이 대신 걸린다)
 */
export function editManifest(doc: ManifestDoc, id: string, entry: ManifestEntry | null): string {
  const fields = (old: unknown): Record<string, unknown> => {
    const out: Record<string, unknown> = doc.shape === 'list' ? { id } : {};
    if (isObj(old)) for (const [k, v] of Object.entries(old)) if (!(doc.shape === 'list' && k === 'id') && k !== 'description') out[k] = v;
    out.image = entry!.image;
    if (entry!.thumb) out.thumb = entry!.thumb;
    else delete out.thumb;
    out.title = entry!.title;
    out.desc = entry!.desc;
    return out;
  };
  const keep = new Set(doc.used.values());
  const front: Row[] = [];
  let placed = false;
  for (const [rid, i] of [...doc.used].sort((a, b) => a[1] - b[1])) {
    if (rid !== id) front.push(doc.rows[i]);
    else if (entry) {
      front.push({ id: rid, value: fields(doc.rows[i].value) });
      placed = true;
    }
  }
  if (entry && !placed) front.push({ id, value: fields(null) });
  const back = doc.rows.filter((r, i) => !keep.has(i) && !(entry === null && r.id === id));
  const all = [...front, ...back];
  const items = doc.shape === 'list'
    ? all.map((r) => r.value)
    : Object.fromEntries(all.map((r) => [String(r.id), r.value]));
  return `${JSON.stringify({ ...doc.rest, items }, null, 2)}\n`;
}

/** 목록을 파일 내용으로(사람이 읽고 고치기 좋게 들여 쓰고, 액자 id 차례로) */
export function serializeManifest(items: ReadonlyMap<string, ManifestEntry>): string {
  const ids = [...items.keys()].filter(isFrameId).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const obj: Record<string, ManifestEntry> = {};
  for (const id of ids) {
    const e = items.get(id)!;
    obj[id] = { image: e.image, ...(e.thumb ? { thumb: e.thumb } : {}), title: e.title, desc: e.desc };
  }
  return `${JSON.stringify({ items: obj }, null, 2)}\n`;
}

/** 그림 주소: 같은 사이트 주소, https 주소, 이 컴퓨터 미리보기의 data 주소(그림)만 */
function isArtUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 8_000_000) return false;
  if (v.startsWith('/') && !v.startsWith('//')) return true;
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return true;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/** 화면이 /api/gallery에서 받은 값을 읽는다. 모양이 틀린 줄은 뺀다. 열쇠가 없거나 틀리면 그림 주소를 열쇠로 쓴다(예전 서버) */
export function parseGalleryItems(v: unknown): Map<string, GalleryItem> {
  const out = new Map<string, GalleryItem>();
  const list = v && typeof v === 'object' ? (v as { items?: unknown }).items : undefined;
  if (!Array.isArray(list)) return out;
  for (const it of list.slice(0, GALLERY_TEXT.items)) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    if (!isFrameId(r.id) || out.has(r.id) || !isArtUrl(r.image)) continue;
    const item: GalleryItem = {
      id: r.id,
      key: typeof r.key === 'string' && ART_KEY.test(r.key) ? r.key : r.image,
      title: cleanText(r.title, GALLERY_TEXT.title) || GALLERY_TEXT.untitled,
      desc: cleanText(r.desc, GALLERY_TEXT.desc),
      image: r.image,
    };
    if (isArtUrl(r.thumb)) item.thumb = r.thumb;
    out.set(r.id, item);
  }
  return out;
}
