// 연습판 카드 묶음. 서버 카드(/api/who)를 받지 못하면 이걸로 논다(손님이 아니거나, 아직 카드가 없거나, 연결이 끊겼을 때).
// 지어낸 종이 인형 다섯(물건 이름)과 누구에게나 할 법한 다정한 말만 담는다. 실제 사람 이름·문장은 여기 두지 않는다.
import type { Deck } from './logic';

export const SAMPLE_DECK: Deck = {
  people: [
    { id: 'pencil', name: '연필 인형', icon: 'pen', color: 'lamp', intro: '무엇이든 먼저 적어 보는 인형이에요. 쪽지와 목록을 좋아해요.' },
    { id: 'piano', name: '피아노 인형', icon: 'piano', color: 'sky', intro: '건반 위에서 하루를 시작하는 인형이에요. 콧노래도 잘 불러요.' },
    { id: 'ball', name: '공 인형', icon: 'ball', color: 'roof', intro: '마당에서 뛰고 구르는 걸 제일 좋아하는 인형이에요.' },
    { id: 'book', name: '책 인형', icon: 'book', color: 'pine', intro: '잠들기 전에 꼭 한 쪽을 읽는 인형이에요. 그림책을 모아요.' },
    { id: 'brush', name: '붓 인형', icon: 'brush', color: 'plum', intro: '물감을 섞어 처음 보는 색을 만드는 인형이에요.' },
  ],
  lines: [
    { who: 'pencil', text: '생각이 엉키면 먼저 한 줄 적어 봐요.' },
    { who: 'pencil', text: '지우개가 있으니까 틀려도 괜찮아요.' },
    { who: 'piano', text: '천천히 쳐도 노래는 끝까지 갈 수 있어요.' },
    { who: 'piano', text: '작은 소리로 쳐도 마음에는 크게 들려요.' },
    { who: 'ball', text: '넘어져도 다시 굴러가면 돼요!' },
    { who: 'ball', text: '같이 던지면 더 멀리 가요.' },
    { who: 'book', text: '모르는 낱말을 만나면 그림부터 봐요.' },
    { who: 'book', text: '한 쪽만 읽어도 오늘 읽은 거예요.' },
    { who: 'brush', text: '물감이 번지면 그건 새 무늬예요.' },
    { who: 'brush', text: '하늘은 꼭 파랗지 않아도 돼요.' },
  ],
};
