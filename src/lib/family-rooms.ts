import 'server-only';

// 손님에게만 보여 주는 가족 방 이름표(예: 「○○의 방」). 실명이 들어가므로 저장소·공개 묶음에는 없고,
// 서버 환경 변수 FAMILY_ROOMS_JSON(배열 JSON)에만 있다. 손님 확인은 부르는 쪽(app/api/family-rooms)이 먼저 한다.

export type FamilyRoom = { slug: string; owner: string; title: string; line?: string };

const SLUG = /^[a-z0-9-]{2,32}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= max && !CONTROL.test(t) ? t : null;
}

/** 환경 변수를 읽어 이름표 목록을 돌려준다. 없거나 깨졌으면 [], 모양이 틀린 항목은 뺀다(같은 방은 처음 것만). */
export function loadFamilyRooms(raw = process.env.FAMILY_ROOMS_JSON): FamilyRoom[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: FamilyRoom[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const slug = typeof o.slug === 'string' && SLUG.test(o.slug) ? o.slug : null;
    const owner = text(o.owner, 40);
    const title = text(o.title, 60);
    if (!slug || !owner || !title || seen.has(slug)) continue;
    seen.add(slug);
    const line = o.line === undefined ? null : text(o.line, 200);
    out.push(line ? { slug, owner, title, line } : { slug, owner, title });
  }
  return out;
}
