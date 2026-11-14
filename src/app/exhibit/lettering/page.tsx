import type { Metadata } from 'next';
import Link from 'next/link';
import { DocTitle } from '@/components/DocTitle';
import { T } from '@/components/i18n/T';
import { LangAnchor, LangImg, LangRegion } from '@/components/LangAttrs';
import { LETTERING_WORKS, type LetteringWork } from '@/content/lettering';
import { letteringDescEn, letteringDirectionEn } from '@/content/lettering-en';
import s from './lettering.module.css';

export const metadata: Metadata = {
  title: '조연당의 글씨',
  description: '한지 위의 먹글씨부터 세 가지 색의 손글씨까지. 조연당의 현판과 지산 낙관을 함께 펼칩니다.',
};

// 화면 말은 한국어와 영어를 나란히(<T>, 속성은 LangAttrs). 작품 이름은 옮기지 않는다(lang="ko"). 작품 소개와 읽는 방향의 영어는
// content/lettering-en.ts(모르는 글은 한국어 그대로 lang="ko")

function Artwork({ work, featured = false }: { work: LetteringWork; featured?: boolean }) {
  const no = String(work.number).padStart(2, '0');
  const descEn = letteringDescEn(work);
  const dirEn = letteringDirectionEn(work.direction);
  const hanji = work.group === 'hanji';
  return (
    <figure className={featured ? s.featured : s.work} id={`work-${work.number}`}>
      <LangAnchor className={s.imageLink} href={work.src} target="_blank" rel="noopener noreferrer"
        label={[`${work.title}, 이미지 크게 보기 (새 탭)`, `No. ${no}: see the image larger (new tab)`]}>
        <LangImg src={work.src} srcSet={`${work.thumb} ${work.thumbWidth}w, ${work.src} ${work.width}w`}
          sizes={featured ? '(max-width: 800px) 100vw, 1120px' : '(max-width: 600px) 100vw, (max-width: 900px) 50vw, 360px'}
          width={work.width} height={work.height} loading={featured ? 'eager' : 'lazy'}
          alt={[
            `${work.title}. ${work.direction}.${hanji ? ' 紙散 낙관이 찍힌 생성형 서예 시안.' : ''}`,
            `${dirEn ?? 'Joyeondang'}.${hanji ? ' A generative calligraphy proof stamped with the 紙散 seal.' : ''}`,
          ]} />
      </LangAnchor>
      <figcaption className={s.caption}>
        <div className={s.captionTitle}><span className={s.number}>{no}</span><h3 lang="ko">{work.title}</h3></div>
        <p><T ko={work.description} en={descEn ?? <span lang="ko">{work.description}</span>} /></p>
        <p className={s.direction}>
          <T ko={work.direction} en={dirEn ?? <span lang="ko">{work.direction}</span>} /> <span aria-hidden="true">/</span> <T ko="이미지 누르면 크게 보기" en="Tap the image to see it larger" />
        </p>
      </figcaption>
    </figure>
  );
}

/** 이름으로 맞이하는 세 묶음: 열쇠, 한국어 이름, 영어 이름 */
const SIGN_GROUPS = [
  ['plaque', '집 현판', 'House plaques'], ['easel', '이젤 안내판', 'Easel signs'], ['desk', '탁상 안내판', 'Desk signs'],
] as const;

export default function LetteringPage() {
  const featured = LETTERING_WORKS.find((work) => work.number === 14)!;
  return (
    <article className={`wrap-wide ${s.page}`}>
      <DocTitle en="Lettering" />
      <header className={s.intro}>
        <Link href="/exhibit" className={s.back}><T ko="전시로 돌아가기" en="Back to the exhibit" /></Link>
        <h1><T ko="조연당의 글씨" en="Joyeondang lettering" /></h1>
        <p className={s.lead}><T ko={<>집의 이름을 쓰고,<br />그 곁에 작은 인장을 남깁니다.</>} en={<>We write the name of the house<br />and leave a small seal beside it.</>} /></p>
        <p>
          <T
            ko={<>한지 위의 먹글씨, 단정한 현판, 세 가지 색의 손글씨.<br />같은 이름을 서로 다른 표정으로 펼쳐 보았어요.</>}
            en={<>Ink brushwork on hanji paper, neat plaques, handwriting in three colors.<br />The same name, shown in different moods.</>}
          />
        </p>
        <LangRegion as="nav" className={s.contents} label={['글씨 전시 차례', 'Lettering exhibit contents']}>
          <a href="#hanji"><T ko="한지 서예" en="Calligraphy on hanji" /></a><a href="#signs"><T ko="현판과 안내판" en="Plaques and signs" /></a><a href="#seal"><T ko="지산 낙관" en="Jisan seal" /></a>
        </LangRegion>
      </header>

      <section id="hanji" className={s.section} aria-labelledby="hanji-title">
        <div className={s.sectionHead}>
          <h2 id="hanji-title"><T ko="한지에 쓰다" en="Written on hanji" /></h2>
          <p><T ko="종이의 결, 먹의 농담, 획 사이의 여백." en="The grain of the paper, the shades of ink, the space between strokes." /></p>
        </div>
        <Artwork work={featured} featured />
        <div className={s.grid}>
          {LETTERING_WORKS.filter((work) => work.group === 'hanji' && work.number !== featured.number).map((work) => <Artwork key={work.number} work={work} />)}
        </div>
        <p className={s.note}>
          <T
            ko="이 네 작품은 생성형 AI로 만든 서예풍 이미지에 지산의 낙관을 별도로 합성한 디지털 시안이에요. 실제 친필을 촬영한 것은 아니며, 대형 인쇄 전에는 해상도를 보강해야 해요."
            en="These four pieces are digital proofs: calligraphy-style images made with generative AI, with Jisan’s seal added separately. They are not photos of real handwriting, and the resolution needs to be raised before any large print."
          />
        </p>
      </section>

      <section className={s.reading} aria-labelledby="reading-title">
        <h2 id="reading-title"><T ko="집 이름과 글쓴이의 호" en="The house name and the writer’s pen name" /></h2>
        <div>
          <p>
            <T
              ko={<><strong>造連堂, 조연당.</strong> 짓고 잇는 집의 이름이에요. 전통 가로 현판은 화면에 <span aria-label="오른쪽부터 읽는 조연당" lang="ko">堂連造</span>로 놓고, 오른쪽부터 읽어요. 현대 가로판은 왼쪽부터, 세로판은 위에서 아래로 읽습니다.</>}
              en={<><strong>造連堂, Joyeondang.</strong> The name of a home that builds and connects. On screen, the traditional horizontal plaque is set as <span aria-label="Joyeondang, read from the right">堂連造</span> and read from the right. Modern horizontal signs read from the left, and vertical ones from top to bottom.</>}
            />
          </p>
          <p>
            <T
              ko={<><strong>紙散, 지산.</strong> 종이 지, 흩을 산. 기록을 통해 사람과 생각을 연결하며 지식을 세상으로 퍼뜨린다는 뜻의 호예요. 집의 이름 옆 작은 붉은 인장에는 이 두 글자를 담았습니다.</>}
              en={<><strong>紙散, Jisan.</strong> 紙 (ji) means paper and 散 (san) means to scatter. The pen name means connecting people and ideas through records and spreading knowledge into the world. The small red seal beside the house name holds these two characters.</>}
            />
          </p>
        </div>
      </section>

      <section id="signs" className={s.section} aria-labelledby="signs-title">
        <div className={s.sectionHead}>
          <h2 id="signs-title"><T ko="이름으로 맞이하다" en="Welcoming with a name" /></h2>
          <p><T ko="집에 거는 현판부터 안내데스크 위의 작은 인사까지." en="From the plaque on the house to a small greeting on the front desk." /></p>
        </div>
        {SIGN_GROUPS.map(([group, title, titleEn]) => (
          <LangRegion key={group} className={s.collection} label={[title, titleEn]}>
            <h3 className={s.groupTitle}><T ko={title} en={titleEn} /></h3>
            <div className={s.grid}>{LETTERING_WORKS.filter((work) => work.group === group).map((work) => <Artwork key={work.number} work={work} />)}</div>
          </LangRegion>
        ))}
        <p className={s.note}>
          <T
            ko="서체를 조판한 디자인 시안이에요. 색 손글씨는 제공된 원본에서 추출했고, 집 그림은 그 분위기를 이어 만든 웹용 재해석 이미지입니다. 목재·금속 등의 표현은 소재 제안이며 실제 제작·설치 결과가 아니에요."
            en="These are design proofs set in type. The color handwriting was taken from the original provided, and the house drawings are web reinterpretations in the same mood. Wood, metal and other finishes are material suggestions, not pieces that were actually made or installed."
          />
        </p>
      </section>

      <section id="seal" className={s.sealSection} aria-labelledby="seal-title">
        <div><h2 id="seal-title"><T ko="글씨 곁의 작은 붉음" en="A little red beside the letters" /></h2>
          <p>
            <T
              ko={<>작품에 호를 새겨 찍는 인장을 <strong>아호인</strong>이라고 해요. 紙散 두 글자를 위에서 아래로 담았습니다.</>}
              en={<>A seal carved with a pen name and pressed on a work is called a <strong>pen-name seal</strong>. This one holds the two characters 紙散, from top to bottom.</>}
            />
          </p>
          <p>
            <T
              ko="붉은 면에 흰 글자가 남는 백문인과 붉은 글자·테두리로 찍는 주문인. 한지 서예 네 작품에는 백문인을 사용했어요."
              en="A white-text seal leaves white characters on a red field, and a red-text seal prints red characters and a red border. The four calligraphy pieces on hanji use the white-text seal."
            />
          </p>
          <p className={s.note}>
            <T
              ko="현대 서체 기반 낙관 디자인입니다. 고증한 전서체 전각이나 법적 효력의 직인·인감은 아니에요."
              en="This seal design is based on a modern typeface. It is not a historically researched seal-script carving, nor an official or legally binding seal."
            />
          </p>
        </div>
        <div className={s.seals}>
          {(['baiwen', 'zhuwen'] as const).map((kind) => (
            <figure key={kind}>
              <LangAnchor href={`/web/lettering/jisan-${kind}.webp`} target="_blank" rel="noopener noreferrer"
                label={[`지산 ${kind === 'baiwen' ? '백문인' : '주문인'} 크게 보기 (새 탭)`, `Jisan ${kind === 'baiwen' ? 'white-text' : 'red-text'} seal, see it larger (new tab)`]}>
                <LangImg src={`/web/lettering/jisan-${kind}.webp`} width={300} height={480} loading="lazy"
                  alt={[
                    `紙散, 위에서 아래로 지산. ${kind === 'baiwen' ? '붉은 바탕에 흰 글자' : '붉은 글자와 테두리'}.`,
                    `紙散, Jisan, from top to bottom. ${kind === 'baiwen' ? 'White characters on red' : 'Red characters and a red border'}.`,
                  ]} />
              </LangAnchor>
              <figcaption><T ko={kind === 'baiwen' ? '백문인' : '주문인'} en={kind === 'baiwen' ? 'White-text seal' : 'Red-text seal'} /></figcaption>
            </figure>
          ))}
        </div>
      </section>
      <footer className={s.footer}>
        <p><T ko="현판과 낙관의 첫 시안입니다. 최종 도안과 제작 방식은 아직 고르는 중이에요." en="These are first drafts of the plaques and seals. The final design and how they will be made are still being chosen." /></p>
        <Link href="/exhibit/house"><T ko="조연당, 짓고 잇는 집 읽기" en="Read “Joyeondang, a home that builds and connects”" /></Link>
      </footer>
    </article>
  );
}
