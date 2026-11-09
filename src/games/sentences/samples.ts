// 벽에 아직 걸린 종이가 없을 때 보이는 예시 문장. 저작권 보호 기간이 끝난 옛 글이거나 이 놀이가 직접 지은 문장만.
// 줄바꿈(\n)은 시의 행 구분이다. 퍼즐에서는 띄어쓰기처럼 다룬다.
import type { Sentence } from './logic';

export const SAMPLE_SENTENCES: Sentence[] = [
  {
    id: 'sample-new-road',
    text: '어제도 가고 오늘도 갈\n나의 길 새로운 길',
    source: '윤동주, 「새로운 길」',
    sample: true,
  },
  {
    id: 'sample-learn',
    text: '배우고 때때로 익히면 또한 기쁘지 아니한가.',
    source: '『논어』 학이편',
    sample: true,
  },
  {
    id: 'sample-stars',
    text: '별 하나에 추억과\n별 하나에 사랑과\n별 하나에 쓸쓸함과',
    source: '윤동주, 「별 헤는 밤」',
    sample: true,
  },
  {
    id: 'sample-sand',
    text: '엄마야 누나야 강변 살자\n뜰에는 반짝이는 금모래빛\n뒷문 밖에는 갈잎의 노래',
    source: '김소월, 「엄마야 누나야」',
    sample: true,
  },
  {
    id: 'sample-leaf',
    text: '바람도 없는 공중에 수직의 파문을 내이며 고요히 떨어지는 오동잎은 누구의 발자취입니까.',
    source: '한용운, 「알 수 없어요」',
    sample: true,
  },
  {
    id: 'sample-grapes',
    text: '내 고장 칠월은\n청포도가 익어 가는 시절',
    source: '이육사, 「청포도」',
    sample: true,
  },
  {
    id: 'sample-light',
    text: '창을 지난 빛은 바닥에 잠깐 머물다 가지만, 그 무늬를 본 사람의 하루는 조금 오래 밝다.',
    source: '이 방에서 지어 둔 문장',
    sample: true,
  },
  {
    id: 'sample-copy',
    text: '좋은 문장을 손으로 옮겨 적으면 그 문장이 내 걸음의 속도로 다시 읽힌다.',
    source: '이 방에서 지어 둔 문장',
    sample: true,
  },
];
