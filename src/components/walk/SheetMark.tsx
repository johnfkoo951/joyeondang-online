'use client';
import { useLayoutEffect } from 'react';
import { holdSheet } from './sheet-state';

/**
 * 걷기 화면 위 시트로 뜬 페이지가 붙어 있는 동안 「시트 열림」을 알린다.
 * 시트 틀(WalkSheetFrame)이 이것으로 열리고 닫히며, 걷기 화면은 그리기와 키를 쉬고, 사이트 단축키는 꺼진다.
 * 시트로 가로챈 페이지(src/app/walk/@sheet/(..)…)마다 하나씩 둔다.
 */
export function SheetMark() {
  useLayoutEffect(() => holdSheet(), []);
  return null;
}
