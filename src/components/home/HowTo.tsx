import { T } from '@/components/i18n/T';
import { STEPS } from './home-words';
import s from './home.module.css';

// 세 걸음 에디토리얼 노트: 표지의 석등 한 줄(#front-how)이 이 절로 이어진다. 말은 home-words.ts(한국어·영어)
export function HowTo() {
  return (
    <section className={s.how} aria-labelledby="front-how">
      <div className={s.catalogHead}>
        <p className={s.eyebrow}>HOW TO ENJOY</p>
        <h2 id="front-how" className={s.catalogTitle}><T ko="이렇게 놀아요" en="How to play" /></h2>
      </div>
      <ol className={s.steps} role="list">
        {STEPS.map((step, i) => (
          <li key={step.title.ko} className={s.step}>
            <span className={s.num}>0{i + 1}</span>
            <div className={s.stepBody}>
              <h3 className={s.stepTitle}><T ko={step.title.ko} en={step.title.en} /></h3>
              <p className={s.stepText}><T ko={step.text.ko} en={step.text.en} /></p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
