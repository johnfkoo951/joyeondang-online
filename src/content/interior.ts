// 인테리어 팔레트. 레퍼런스를 받으면 이 파일의 색만 바꿔도 집 전체가 따라 바뀐다.
// 1층: 빈티지 우드톤, 코지. 2층: 블랙 앤 실버 + 한국 전통 요소(창살, 한지, 좌식 상, 병풍, 반닫이).

export const EXTERIOR = {
  wall: '#f1eee5', // 갤러리의 따뜻한 미색 회벽
  base: '#aaa391', // 낮은 석재 기단
  roof: '#985d49', // 채도를 낮춘 테라코타
  column: '#c3beb0', // 밝은 석회석 기둥
  arch: '#f5f1e8', // 회벽 아치
  trim: '#3d3730', // 짙은 브론즈 창틀
  glass: '#3b4a52',
  stone: '#b8b0a2', // 판석·석등
  stoneWall: '#9c9384',
  pineLeaf: '#586e52',
  pineTrunk: '#6a4a33',
  shrub: '#4f6b45',
  sky: '#e6f2f5',
};

export const LAWN_BY_SEASON = { spring: '#86a66c', summer: '#5f8f4f', autumn: '#8d9c7b', winter: '#a9ab9a' } as const;

export const FLOOR1 = {
  oak: ['#9b6b43', '#8a5c38', '#a87a4e'], // 오크 마루 세 톤
  redstone: '#8c4a3a', // 현관 붉은 돌
  tile: '#cfc3ae', // 주방 바닥(닫힌 방)
  wallTop: '#efe2c9', // 크림 벽
  wainscot: '#5b3a25', // 허리 높이 월넛 판
  rug: '#8e3b2e',
  rugBorder: '#c99a4b',
  leather: '#8a4b2a', // 코냑 가죽
  cushions: ['#c9973f', '#6f7243', '#a5553a'],
  walnut: '#5a3a24',
  brass: '#b08d57',
  books: ['#6d3b2a', '#3e5b47', '#b98a4a', '#7a6a58', '#2f3e4e', '#8c6d3f', '#5b2f2f'],
  warmLight: '#ffc27a',
  paperCard: '#f6efe0',
};

export const FLOOR2 = {
  floor: ['#1f1d1b', '#191817', '#262321'], // 먹색 마루
  wall: '#2b2b2e', // 숯빛 벽
  silver: '#c3c7cc', // 은빛 몰딩·장석
  lacquer: '#121212', // 옻칠 검정
  hanji: '#f1e9d8', // 한지
  silk: '#8e9196', // 방석 회색 비단
  beam: '#2e241d', // 노출 보
  lightStrip: '#e2e8ee',
  hanjiLight: '#fff1d8',
};
