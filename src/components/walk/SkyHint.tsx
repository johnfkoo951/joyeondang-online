'use client';
import { T } from '@/components/i18n/T';
import styles from './SkyHint.module.css';

/**
 * 밤하늘 안내: 걷기에 들어오면 잠깐 위를 올려다보라고 알린다(휴대폰 첫 시점에는 하늘이 거의 보이지 않는다).
 * note는 집주인이 서버 환경 변수로 정한 한 줄이다. 있으면 첫 문장(「별이 잘 보이는 밤이에요.」) 대신 그 글을 위 줄에 그대로 쓴다.
 * 집주인이 쓴 글이라 화면 말과 상관없이 한국어로 읽게 한다.
 */
export function SkyHint({ note }: { note?: string }) {
  return (
    <div className={styles.hint} role="status">
      {note ? <span className={styles.note} lang="ko">{note}</span> : <T ko="별이 잘 보이는 밤이에요. " en="A clear, starry night. " />}
      <T ko="하늘을 올려다보세요." en="Look up at the sky." />
    </div>
  );
}
