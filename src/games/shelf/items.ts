// 좋아하는 것 선반의 소품. 이 배열 하나만 바꾸면 선반 소품이 바뀐다(이름·색·모양 열쇠).
// shape는 art.tsx의 그림 열쇠 중 하나. 같은 모양을 색만 바꿔 여러 번 써도 된다. id는 저장에 쓰이니 바꾸지 않는다.
// en은 영어 화면의 이름(그림이 보여 주는 물건이라 옮긴다).
export type ShapeKey =
  | 'dino' | 'car' | 'train' | 'blocks' | 'robot' | 'ball' | 'star' | 'book'
  | 'crayons' | 'palette' | 'drum' | 'guitar' | 'trumpet' | 'plane' | 'boat' | 'rocket'
  | 'teddy' | 'cat' | 'dog' | 'fish' | 'flower' | 'rainbow' | 'balloon' | 'cupcake';

export type ShelfItem = { id: string; name: string; en: string; color: string; shape: ShapeKey };

export const ITEMS: readonly ShelfItem[] = [
  { id: 'dino', name: '공룡', en: 'Dinosaur', color: '#5f9e57', shape: 'dino' },
  { id: 'car', name: '자동차', en: 'Car', color: '#d2553f', shape: 'car' },
  { id: 'train', name: '기차', en: 'Train', color: '#3f73b8', shape: 'train' },
  { id: 'blocks', name: '블록', en: 'Blocks', color: '#e0a32e', shape: 'blocks' },
  { id: 'robot', name: '로봇', en: 'Robot', color: '#8a97a8', shape: 'robot' },
  { id: 'ball', name: '공', en: 'Ball', color: '#e0703a', shape: 'ball' },
  { id: 'star', name: '별', en: 'Star', color: '#f0c43c', shape: 'star' },
  { id: 'book', name: '그림책', en: 'Picture book', color: '#7a5bb5', shape: 'book' },
  { id: 'crayons', name: '크레용', en: 'Crayons', color: '#d24f6e', shape: 'crayons' },
  { id: 'palette', name: '물감', en: 'Paints', color: '#c99a62', shape: 'palette' },
  { id: 'drum', name: '작은 북', en: 'Little drum', color: '#c2453b', shape: 'drum' },
  { id: 'ukulele', name: '우쿨렐레', en: 'Ukulele', color: '#c47b3c', shape: 'guitar' },
  { id: 'trumpet', name: '나팔', en: 'Trumpet', color: '#d9a62e', shape: 'trumpet' },
  { id: 'plane', name: '비행기', en: 'Airplane', color: '#4b9bd4', shape: 'plane' },
  { id: 'boat', name: '돛단배', en: 'Sailboat', color: '#2f7fa8', shape: 'boat' },
  { id: 'rocket', name: '로켓', en: 'Rocket', color: '#e05a4f', shape: 'rocket' },
  { id: 'teddy', name: '곰 인형', en: 'Teddy bear', color: '#b07a4a', shape: 'teddy' },
  { id: 'cat', name: '고양이', en: 'Cat', color: '#e3a050', shape: 'cat' },
  { id: 'dog', name: '강아지', en: 'Puppy', color: '#a87b55', shape: 'dog' },
  { id: 'fish', name: '물고기', en: 'Fish', color: '#3fa6a0', shape: 'fish' },
  { id: 'flower', name: '꽃', en: 'Flower', color: '#e06a9a', shape: 'flower' },
  { id: 'rainbow', name: '무지개', en: 'Rainbow', color: '#e0583f', shape: 'rainbow' },
  { id: 'balloon', name: '풍선', en: 'Balloon', color: '#d9465f', shape: 'balloon' },
  { id: 'cupcake', name: '컵케이크', en: 'Cupcake', color: '#e69ab6', shape: 'cupcake' },
];
