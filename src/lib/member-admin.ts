// 멤버 관리 순수 계산·일괄 등록 파서(단위 시험과 서버 액션·화면이 함께 쓴다).
import { cleanRosterName } from './roster-name';

export const VALID_SLOTS = ['11', '15', '16', '17', 'online', 'family'] as const;
export type MemberSlot = (typeof VALID_SLOTS)[number];
export type EditableRole = 'guest' | 'family';

export const SLOT_LABELS: Record<MemberSlot, string> = {
  '11': '11시 예배',
  '15': '15시 말과 글',
  '16': '16시 재즈와 예술',
  '17': '17시 AI와 삶',
  online: '온라인 손님',
  family: '가족',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanMemberEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return EMAIL_RE.test(v) ? v : null;
}

export function cleanMemberSlot(raw: unknown): MemberSlot | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return (VALID_SLOTS as readonly string[]).includes(v) ? (v as MemberSlot) : null;
}

export function cleanMemberRole(raw: unknown): EditableRole {
  return raw === 'family' ? 'family' : 'guest';
}

export function cleanMemberNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200);
  return v || null;
}

export type ParsedBulkMember = {
  display_name: string;
  email: string | null;
  role: EditableRole;
  slot: MemberSlot | null;
  note: string | null;
};

export type BulkParseResult = {
  valid: ParsedBulkMember[];
  invalidLines: number[];
};

/**
 * 여러 줄 텍스트 파싱.
 * 형식: `이름, 이메일(선택), 역할(guest|family|가족|손님, 선택), 회차(11|15|16|17|online, 선택), 메모(선택)`
 * 탭(\t) 또는 쉼표(,) 구분자를 모두 지원한다.
 */
export function parseBulkMembers(raw: string): BulkParseResult {
  const valid: ParsedBulkMember[] = [];
  const invalidLines: number[] = [];
  const seenEmails = new Set<string>();

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const sep = trimmed.includes('\t') ? '\t' : ',';
    const parts = trimmed.split(sep).map((p) => p.trim());
    const name = cleanRosterName(parts[0] ?? '');
    if (!name) {
      invalidLines.push(idx + 1);
      return;
    }

    let email: string | null = null;
    if (parts[1]) {
      email = cleanMemberEmail(parts[1]);
      if (!email) {
        invalidLines.push(idx + 1);
        return;
      }
      if (seenEmails.has(email)) {
        invalidLines.push(idx + 1);
        return;
      }
      seenEmails.add(email);
    }

    const rawRole = (parts[2] ?? '').toLowerCase();
    const role: EditableRole = rawRole === 'family' || rawRole === '가족' ? 'family' : 'guest';

    const rawSlot = (parts[3] ?? '').replace(/시$/, '');
    const slot = cleanMemberSlot(rawSlot);
    const note = cleanMemberNote(parts.slice(4).join(', '));

    valid.push({ display_name: name, email, role, slot, note });
  });

  return { valid, invalidLines };
}
