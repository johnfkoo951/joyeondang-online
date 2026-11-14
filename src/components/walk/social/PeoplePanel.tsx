'use client';
import { useMemo, useRef } from 'react';
import { T } from '@/components/i18n/T';
import { useLang, useTr } from '@/components/i18n/useLang';
import { placeName } from '@/lib/place-names';
import type { RemotePlayer } from '@/walk/types';
import { peopleEn } from '../hud-text';
import { IconChat, IconClose } from '../icons';
import { trapTab, useDialogFocus } from '../useDialogFocus';
import { AvatarThumb } from './AvatarThumb';
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
  onMention: (p: Person) => void;
  onChat: () => void;
  onClose: () => void;
};

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

// 접속자 목록(U, 위 단추 줄의 「함께 N」): 집·방 어디 있는지, 아바타 작은 그림, 「멘션하기」.
// 접속자 목록을 받지 못하면(실시간 연결이 막힘) 함께 걷기 서버가 알려 주는 같은 공간 사람만 보인다.
// 화면 말은 한국어·영어를 따르고, 사람 이름은 한국어 그대로 lang="ko", 있는 곳 이름은 장소 이름 표로 옮긴다.
export function PeoplePanel({ me, people, synced, nearby, canMention, coarse, onMention, onChat, onClose }: Props) {
  const head = useRef<HTMLHeadingElement>(null);
  useDialogFocus(head);
  const lang = useLang();
  const tr = useTr();
  const list = useMemo(() => groups(people, me.space, lang), [people, me.space, lang]);
  const total = synced ? people.length + 1 : nearby.length + 1;
  const myWhere = [placeLabel(me.space, lang), placeName(lang, me.place)].filter(Boolean).join(' · ');
  const hereLabel = placeLabel(me.space, lang);
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
            <ul className={s.people} aria-label={tr('같은 곳에 있는 분', 'People in the same place')}>
              {nearby.map((p) => (
                <li key={p.id} className={s.person}>
                  <AvatarThumb look={p.look ?? null} name={p.name} size={36} />
                  <span className={s.personMain}>
                    <b className={s.name} lang="ko">{p.name}</b>
                    <span className={s.meta} lang={lang === 'en' && ko(hereLabel) ? 'ko' : undefined}>{hereLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
