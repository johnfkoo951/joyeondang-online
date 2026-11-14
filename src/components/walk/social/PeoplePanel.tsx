'use client';
import { useId, useMemo, useRef } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { placeName } from '@/lib/place-names';
import type { RemotePlayer } from '@/walk/types';
import { GO_WHY, peopleEn, pick } from '../hud-text';
import { IconChat, IconClose } from '../icons';
import { trapTab, useDialogFocus } from '../useDialogFocus';
import { AvatarThumb } from './AvatarThumb';
import { rowGo, type GoWhy, type Reach } from './go-to-person';
import type { Person } from './mention';
import { placeLabel } from './places';
import s from './social.module.css';
import type { OnlinePerson } from './useOnline';

type Props = {
  me: { name: string; look: unknown; space: string | null; place: string };
  /** 접속자(presence, 나 빼고). synced가 아니면 아직 못 받은 것 */
  people: OnlinePerson[];
  synced: boolean;
  /** 접속자 목록을 받지 못할 때 대신 보이는 같은 공간 사람들(함께 걷기 서버) */
  nearby: RemotePlayer[];
  canMention: boolean;
  coarse: boolean;
  /** 나와 같은 곳에 있는 줄마다 「걸어가기」·「바로 가기」. null이면 단추를 두지 않는다(걷는 세계가 아직 없다) */
  go: PeopleGo | null;
  onMention: (p: Person) => void;
  onChat: () => void;
  onClose: () => void;
};

/** 「걸어가기」·「바로 가기」에 필요한 것: 줄마다 갈 수 있는가(접속자 sub → Reach), 길 격자 준비, 가지 못한 줄, 누를 때 할 일 */
export type PeopleGo = {
  reach: ReadonlyMap<string, Reach>;
  walkReady: boolean;
  miss: { key: string; why: GoWhy } | null;
  /** key는 접속자 줄이면 sub, 같은 곳 줄이면 함께 걷기 id */
  onGo: (key: string, how: 'walk' | 'jump') => void;
};

/**
 * 한 줄의 두 단추와, 못 쓰면 그 까닭 한 줄. 까닭은 단추 설명으로도 읽힌다.
 * 이름과 차례는 길 찾기와 같다(「걸어가기」 다음 「바로 가기」): 같은 일을 두 곳에서 다르게 부르면 손님이 헷갈린다.
 * 눌렀는데 가지 못했을 때만 까닭을 알림(status)으로 읽어 준다(늘 있는 까닭까지 줄마다 읽지 않게)
 */
function GoButtons({ name, k, reach, go }: { name: string; k: string; reach: Reach | undefined; go: PeopleGo }) {
  const lang = useLang();
  const tr = useTr();
  const id = useId();
  const missed = go.miss?.key === k ? go.miss.why : null;
  const st = rowGo(reach, { walkReady: go.walkReady, miss: missed });
  const why = st.why ? pick(GO_WHY[st.why], lang) : '';
  return (
    <span className={s.go}>
      <button type="button" className={s.goBtn} disabled={!st.walk} onClick={() => go.onGo(k, 'walk')} aria-label={tr(`${name}에게 걸어가기`, `Walk to ${name}`)} aria-describedby={why ? id : undefined}>
        <T ko="걸어가기" en="Walk there" />
      </button>
      <button type="button" className={s.goBtn} disabled={!st.jump} onClick={() => go.onGo(k, 'jump')} aria-label={tr(`${name} 옆으로 바로 가기`, `Go now to ${name}`)} aria-describedby={why ? id : undefined}>
        <T ko="바로 가기" en="Go now" />
      </button>
      {why ? <span id={id} className={s.goWhy} role={missed ? 'status' : undefined}>{why}</span> : null}
    </span>
  );
}

/** 두 단추가 어떻게 다른지 한 줄(길 찾기 패널의 설명과 같은 말). 단추가 있는 무리에 한 번만 */
function GoHelp() {
  return (
    <p className={s.goHelp}>
      <T
        ko="「걸어가기」는 그 사람 옆까지 걸어서 데려다줘요. 움직이면 멈춰요. 「바로 가기」는 그 옆으로 바로 옮겨요."
        en="“Walk there” walks you over to them, and moving stops it. “Go now” takes you right next to them."
      />
    </p>
  );
}

type Group = { key: string; title: string; people: OnlinePerson[] };

/** 공간별로 묶는다: 내가 있는 곳 먼저, 그다음 집 안, 방들(이름 차례. 차례는 늘 한국어 이름으로 정해 두 말이 같은 차례다) */
function groups(people: OnlinePerson[], mine: string | null, lang: 'ko' | 'en'): Group[] {
  const by = new Map<string, OnlinePerson[]>();
  for (const p of people) {
    const k = p.space ?? '';
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const rank = (k: string) => (k === mine ? 0 : k === 'house:real' ? 1 : k ? 2 : 3);
  return [...by.entries()]
    .map(([key, list]) => ({ key, sort: placeLabel(key) || '어딘가', title: placeLabel(key, lang) || (lang === 'en' ? 'Somewhere' : '어딘가'), people: list }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.sort.localeCompare(b.sort, 'ko'))
    .map(({ key, title, people: list }) => ({ key, title, people: list }));
}

/** 한글이 남았는가(표에 없는 방 이름): 그 칸은 lang="ko" */
const ko = (s: string) => /[가-힣]/.test(s);

// 접속자 목록(U, 위 단추 줄의 「함께 N」): 집·방 어디 있는지, 아바타 작은 그림, 「멘션하기」,
// 나와 같은 곳 사람 곁으로 모이는 「걸어가기」(길을 따라 걸어서)·「바로 가기」(어둡게 했다가 옆 빈자리로).
// 다른 곳 사람 줄에는 단추를 두지 않는다: 여기서는 갈 수 없고, 어디 있는지는 무리 제목과 있는 곳 줄이 이미 말해 준다
// (휴대폰에서 막힌 단추가 목록을 길게 늘이지 않게. 방 옮기기는 포털에 맡긴다).
// 접속자 목록을 받지 못하면(실시간 연결이 막힘) 함께 걷기 서버가 알려 주는 같은 공간 사람만 보인다.
// 화면 말은 한국어·영어를 따르고, 사람 이름은 한국어 그대로 lang="ko", 있는 곳 이름은 장소 이름 표로 옮긴다.
export function PeoplePanel({ me, people, synced, nearby, canMention, coarse, go, onMention, onChat, onClose }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  const lang = useLang();
  const tr = useTr();
  const list = useMemo(() => groups(people, me.space, lang), [people, me.space, lang]);
  const total = synced ? people.length + 1 : nearby.length + 1;
  const myWhere = [placeLabel(me.space, lang), placeName(lang, me.place)].filter(Boolean).join(' · ');
  const hereLabel = placeLabel(me.space, lang);
  /** 단추는 나와 같은 곳 무리에만 단다(다른 곳 사람에게는 여기서 갈 수 없다) */
  const mine = (key: string) => me.space !== null && key === me.space;
  return (
    <section className={`walk-social ${s.sheet}`} role="dialog" aria-label={tr('접속자', 'People here')} onKeyDown={trapTab} data-coarse={coarse ? 'true' : undefined}>
      <header className={s.head}>
        <h2 ref={head} className={s.title} tabIndex={-1}><T ko={`접속자 ${total}명`} en={`People here (${total})`} /></h2>
        <button type="button" className={s.headBtn} onClick={onChat}>
          <IconChat size={18} />
          <span><T ko="대화" en="Chat" /></span>
        </button>
        <button type="button" className={s.x} onClick={onClose} aria-label={tr('접속자 목록 닫기', 'Close the list of people here')} aria-keyshortcuts="Escape">
          <IconClose size={18} />
        </button>
      </header>
      <div className={s.list}>
        <ul className={s.people} aria-label={tr('나', 'You')}>
          <li className={s.person} data-me="true">
            <AvatarThumb look={me.look} name={me.name} size={36} />
            <span className={s.personMain}>
              <b className={s.name}><T ko={`${me.name} (나)`} en={<><span lang="ko">{me.name}</span> (you)</>} /></b>
              <span className={s.meta} lang={lang === 'en' && ko(myWhere) ? 'ko' : undefined}>{myWhere}</span>
            </span>
          </li>
        </ul>
        {synced ? (
          list.length === 0 ? (
            <p className={s.notice}><T ko="지금은 나 혼자예요." en="It’s just you for now." /></p>
          ) : (
            list.map((g) => (
              <div key={g.key} className={s.group}>
                <h3 className={s.groupTitle}>
                  <span lang={lang === 'en' && ko(g.title) ? 'ko' : undefined}>{g.title}</span>
                  {' '}
                  <span className={s.groupN}><T ko={`${g.people.length}명`} en={peopleEn(g.people.length)} /></span>
                </h3>
                {go && mine(g.key) ? <GoHelp /> : null}
                <ul className={s.people}>
                  {g.people.map((p) => {
                    const where = placeLabel(p.space, lang);
                    return (
                      <li key={p.sub} className={s.person}>
                        <AvatarThumb look={p.look} name={p.name} size={36} />
                        <span className={s.personMain}>
                          <b className={s.name} lang="ko">{p.name}</b>
                          <span className={s.meta} lang={lang === 'en' && ko(where) ? 'ko' : undefined}>{where}</span>
                        </span>
                        {canMention ? (
                          <button type="button" className={s.mentionBtn} onClick={() => onMention({ sub: p.sub, name: p.name })} aria-label={tr(`${p.name} 멘션하기`, `Mention ${p.name}`)}>
                            <T ko="멘션하기" en="Mention" />
                          </button>
                        ) : null}
                        {go && mine(g.key) ? <GoButtons name={p.name} k={p.sub} reach={go.reach.get(p.sub)} go={go} /> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )
        ) : (
          <>
            <p className={s.notice}>
              <T
                ko="접속자 목록을 불러오는 중이에요. 그동안 같은 곳에 있는 분만 보여요."
                en="Loading the list of people here. Until then, you only see people in the same place."
              />
            </p>
            {go && nearby.length > 0 ? <GoHelp /> : null}
            <ul className={s.people} aria-label={tr('같은 곳에 있는 분', 'People in the same place')}>
              {nearby.map((p) => (
                <li key={p.id} className={s.person}>
                  <AvatarThumb look={p.look ?? null} name={p.name} size={36} />
                  <span className={s.personMain}>
                    <b className={s.name} lang="ko">{p.name}</b>
                    <span className={s.meta} lang={lang === 'en' && ko(hereLabel) ? 'ko' : undefined}>{hereLabel}</span>
                  </span>
                  {/* 함께 걷기 서버가 알려 준 같은 곳 사람이라 누군지 바로 안다 */}
                  {go ? <GoButtons name={p.name} k={p.id} reach={{ kind: 'here', id: p.id }} go={go} /> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
