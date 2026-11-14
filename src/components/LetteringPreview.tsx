import Link from 'next/link';
import { T } from '@/components/i18n/T';
import { LangImg, LangRegion } from '@/components/LangAttrs';
import s from './lettering-preview.module.css';

// 전시 목록과 집·작품 칸 아래의 글씨 전시 미리보기. 화면 말은 한국어와 영어를 나란히(<T>, 속성은 LangAttrs)
export function LetteringPreview() {
  return (
    <LangRegion as="aside" className={s.preview} label={['조연당의 글씨 전시', 'Joyeondang lettering exhibit']}>
      <Link href="/exhibit/lettering" className={s.link}>
        <LangImg
          src="/web/lettering/14-hanji-running-horizontal-small.webp" width={640} height={360} loading="lazy"
          alt={['조연당 먹글씨와 지산 낙관', 'Joyeondang ink lettering and the Jisan seal']}
        />
        <span className={s.words}>
          <strong><T ko="조연당의 글씨" en="Joyeondang lettering" /></strong>
          <span><T ko="한지 서예, 현판과 안내판, 지산의 작은 붉은 인장." en="Calligraphy on hanji, plaques and signs, and Jisan’s small red seal." /></span>
          <span className={s.action}><T ko="글씨 전시 보기" en="See the lettering exhibit" /></span>
        </span>
      </Link>
    </LangRegion>
  );
}
