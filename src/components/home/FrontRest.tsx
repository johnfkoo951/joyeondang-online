import { howFirst, type FrontWho } from '@/lib/front';
import { HowTo } from './HowTo';
import { MoreLinks } from './MoreLinks';

// 집 안 걷기 다음: 둘러볼 곳과 「이렇게 놀아요」. 처음 온 사람(로그인 전·명단 밖)에게는 어떻게 노는지를 먼저(쪽지와 석등이
// 무엇인지 바로 아래에서 읽게), 명단 손님에게는 갈 곳을 먼저. who가 null(확인하는 동안)이면 명단 손님 차례다.
export function FrontRest({ who, open }: { who: FrontWho['kind'] | null; open: number | null }) {
  const more = <MoreLinks who={who} open={open} />;
  if (howFirst(who)) {
    return (
      <>
        <HowTo />
        {more}
      </>
    );
  }
  return (
    <>
      {more}
      <HowTo />
    </>
  );
}
