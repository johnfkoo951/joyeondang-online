import 'server-only';
import { EXHIBIT_PIECES, type ExhibitPiece } from '@/content/exhibit.generated';
import { canSee, type Role } from '@/lib/access';

export type PieceView =
  | { state: 'empty' } // 원고를 아직 쓰지 않았거나 초안
  | { state: 'locked'; visibility: ExhibitPiece['visibility'] } // 이 사람에게는 아직 닫힘
  | { state: 'open'; piece: ExhibitPiece };

/** 원고 본문은 볼 수 있는 사람에게만 넘긴다. 닫힌 칸은 범위만 알려 준다. */
export function viewPiece(slug: string, role: Role): PieceView {
  const piece = EXHIBIT_PIECES.find((p) => p.slug === slug);
  if (!piece) return { state: 'empty' };
  if (!canSee(role, piece.visibility)) return { state: 'locked', visibility: piece.visibility };
  return { state: 'open', piece };
}
