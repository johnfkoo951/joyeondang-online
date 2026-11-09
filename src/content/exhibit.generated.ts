// 이 파일은 tools/sync-exhibit.mjs가 만든다. 손으로 고치지 않는다.
// 원고 정본: 볼트 70. Outputs/74. Projects/조연당 온라인/전시 원고/
import 'server-only';

export type ExhibitPiece = {
  slug: string;
  visibility: 'public' | 'guests' | 'family';
  html: string;
  updated: string;
};

export const EXHIBIT_PIECES: ExhibitPiece[] = [];
