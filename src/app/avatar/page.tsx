import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { T } from '@/components/i18n/T';
import { canSee } from '@/lib/access';
import { noFunction } from '@/lib/avatar/assets';
import { modelConfirm } from '@/lib/avatar/consent';
import {
  CHAR_COLUMNS, HISTORY_SHOWN, KEPT_STATUSES, MESSAGES, MESSAGES_EN, SLOTS, SLOTS_MAX, arrangeSlots, benchCells, benchSize, canRequestModel,
  countParts, countsOf, dailyLimits, dailyLine, decideQuota, itemBadge, modelRoom, readCharacters, readQuota, type CharItem,
} from '@/lib/avatar/rules';
import { avatarConfig, avatarReady, meshyTrainingOptOut, modelProvider, modelsOn } from '@/lib/avatar/server';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/viewer';
import { cleanLook, photoId } from '@/walk/look';
import { AvatarCard, DeleteAllOriginals, EmptySlot, MakingSlot, MiniCard, type CardInfo } from './AvatarCard';
import { WebDollStudio } from '@/components/avatar/WebDollStudio';
import { AvatarStudio } from './AvatarStudio';
import { Labeled, TitleLang } from './LangBits';
import styles from './avatar.module.css';

// 화면 말: 보이는 글은 두 말을 함께 싣는다(T. 서버는 언어를 모르고, CSS가 고른 말만 보인다). 서버가 만든 글(장수 줄, 수 배지,
// 만든 때, 3D 배지·확인)은 두 말을 다 만들어 넘긴다. 이름표 속성과 창 제목은 작은 클라이언트 조각이 고른다(LangBits)

const TITLE = '내 캐릭터 만들기';
export const metadata: Metadata = { title: TITLE, robots: { index: false, follow: false } };

export default function AvatarPage() {
  return (
    <div className="wrap stack">
      <TitleLang ko={TITLE} en="Make my character" />
      <div className="art-cutout-hero">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 캐릭터 콜라주 컷아웃 */}
        <img src="/web/collage/collage-character-v2.webp" alt="" className="art-cutout-hero-img" />
        <div className="stack" style={{ gap: 8 }}>
          <p className="art-eyebrow">CHARACTER ATELIER</p>
          <h1 className="art-display-title"><T ko="내 캐릭터 꾸미기" en="Dress up my character" /></h1>
          <p className="art-serif-lead">
            <T
              ko="머리 모양·옷·안경·밀짚모자를 조합해 3D 인형을 바로 꾸미거나, 초대 손님은 내 사진으로 AI 그림·3D 모형 캐릭터를 만들 수 있어요."
              en="Mix hairstyles, clothes, glasses and a straw hat to dress up a 3D doll right away. Invited guests can also make an AI picture and 3D model character from their own photo."
            />
          </p>
        </div>
      </div>
      <Suspense fallback={<WebDollStudio canSaveServer={false} />}>
        <DollCustomGate />
      </Suspense>
      <section className="stack" aria-labelledby="ai-photo-head">
        <h2 id="ai-photo-head"><T ko="내 사진으로 AI·3D 캐릭터 만들기" en="Make an AI and 3D character from my photo" /></h2>
        <Suspense fallback={<p className="muted"><T ko="캐릭터 방을 여는 중이에요" en="Opening the character room" /></p>}>
          <AvatarBody />
        </Suspense>
      </section>
    </div>
  );
}

async function DollCustomGate() {
  const viewer = await getViewer();
  const canSave = viewer.ready && viewer.signedIn && canSee(viewer.role, 'guests');
  if (!canSave) return <WebDollStudio canSaveServer={false} />;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  const { data: profile } = uid
    ? await supabase.from('profiles').select('look').eq('user_id', uid).maybeSingle()
    : { data: null };
  return <WebDollStudio canSaveServer initialLook={(profile as { look?: unknown } | null)?.look} />;
}

type Row = {
  id: string;
  status: string;
  original_path: string | null;
  image_path: string | null;
  created_at: string;
  slot?: number | null;
};

const MADE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** 만든 때의 영어(「Nov 12, 3:05 PM」. 같은 한국 시간) */
const MADE_EN = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** 0021 전의 DB에서 보관 중 줄은 이만큼까지 읽는다(칸 셋과, 칸 밖에 남은 옛 캐릭터) */
const KEPT_SHOWN = 40;
/** 지운 캐릭터의 원본 사진은 최근 것부터 이만큼 보인다. 더 있으면 알리고, 「원본 사진 모두 지우기」는 전부 지운다 */
const GONE_SHOWN = 100;

async function AvatarBody() {
  const viewer = await getViewer();
  if (!viewer.ready) {
    return (
      <p className="note-box">
        <T
          ko={<>캐릭터 만들기는 곧 열려요. 그동안 <Link href="/map">집을 둘러보세요</Link>.</>}
          en={<>Character making opens soon. Meanwhile, <Link href="/map">look around the house</Link>.</>}
        />
      </p>
    );
  }
  if (!viewer.signedIn) {
    return (
      <div className="stack">
        <p className="lead">
          <T
            ko="내 사진으로 조연당을 함께 걷는 꼬마 캐릭터를 만들어요. 초대 명단에 계신 분만 쓸 수 있어요."
            en="Make a little character from your photo to walk Joyeondang together. Only guests on the guest list can use this."
          />
        </p>
        <Link className="btn btn-roof" href="/login?next=/avatar"><T ko="들어가기" en="Enter" /></Link>
      </div>
    );
  }
  if (!canSee(viewer.role, 'guests')) {
    return (
      <div className="stack">
        <p className="lead"><T ko={MESSAGES.notGuest} en={MESSAGES_EN.notGuest} /></p>
        <Link className="btn" href="/notebook"><T ko="수첩에서 들어오는 길 확인하기" en="Check how to get in from your notebook" /></Link>
      </div>
    );
  }

  const supabase = await createClient();
  // 지우지 않은 그림(이력, 작업대 포함)과 지운 것은 따로 읽는다. 함께 읽어 최근 몇 줄로 자르면, 만들고 지우기를 되풀이한
  // 날에는 지운 줄이 창을 채워 작업대의 캐릭터와 오래된 원본 사진이 화면에서 밀려난다.
  // 작업대는 걷기 화면(/api/avatar/slots)처럼 칸 번호가 있는 줄을 따로 읽는다(오래전 그림을 꺼냈으면 최근 이력 창 밖에 있다)
  const cols = 'id, status, original_path, image_path, created_at';
  const charCols = `${CHAR_COLUMNS}, original_path, image_path`;
  const historyList = () => supabase
    .from('avatars')
    .select(charCols)
    .in('status', [...KEPT_STATUSES])
    .order('created_at', { ascending: false })
    .limit(HISTORY_SHOWN + 1);
  const benchList = () => supabase
    .from('avatars')
    .select(charCols)
    .in('status', [...KEPT_STATUSES])
    .not('slot', 'is', null)
    .limit(SLOTS_MAX * 2);
  // 0021 전의 DB: 보관 중 줄을 만든 차례대로(칸 번호(0019)가 있으면 그것도)
  const keptList = (withSlot: boolean) => supabase
    .from('avatars')
    .select(withSlot ? `${cols}, slot` : cols)
    .in('status', [...KEPT_STATUSES])
    .order('created_at')
    .limit(KEPT_SHOWN);
  // 지운 것은 원본 사진이 남은 줄만(원본이 없는 지운 줄은 보일 것이 없다). 하나 더 읽어 더 있는지 안다
  const goneList = () => supabase
    .from('avatars')
    .select(cols)
    .eq('status', 'deleted')
    .not('original_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(GONE_SHOWN + 1);
  const [histRes, benchRes, goneRes, { data: quotaRaw, error: quotaError }, { data: claims }] = await Promise.all([
    historyList(),
    benchList(),
    goneList(),
    supabase.rpc('avatar_quota'),
    supabase.auth.getClaims(),
  ]);
  // 장수를 읽지 못했으면(몰릴 때 잠깐) 옛 화면으로 떨어지지 않고 다시 열어 달라고만 한다(0021인지조차 모른다)
  if (quotaError && avatarReady() && !noFunction(quotaError)) {
    return (
      <p className="note-box" role="status">
        <T ko="지금은 캐릭터 방을 읽지 못했어요. 잠시 뒤 다시 열어 주세요." en="We couldn't load the character room just now. Please open it again in a moment." />
      </p>
    );
  }
  const quota = readQuota(quotaRaw);
  const counts = countsOf(quota);
  // 0021(이력·★·3D)이 있는 DB인가. 없으면 예전처럼 칸 셋과 칸 밖 캐릭터만
  const modern = counts !== null && !histRes.error && !benchRes.error;
  const goneRows = (goneRes.data ?? []) as unknown as Row[];
  const uid = claims?.claims?.sub;
  // 걷기에 쓰는 캐릭터는 걷기 화면이 그리는 겉모습(profiles.look)이다
  const { data: profile } = uid
    ? await supabase.from('profiles').select('look').eq('user_id', uid).maybeSingle()
    : { data: null };
  const rawLook = (profile as { look?: unknown } | null)?.look;
  const activeId = rawLook && typeof rawLook === 'object' ? photoId(cleanLook(rawLook)) : null;
  const decision = decideQuota(quota, avatarConfig().totalCap);
  // 하루 장수는 역할마다 다르다(DB가 정해 준다). 제한 없는 역할(관리자)은 null.
  // 이력이나 칸이 다 찬 것만으로는 오늘 장수가 줄지 않는다(지우면 바로 만든다: decideQuota가 그때도 left를 준다)
  const unlimited = dailyLimits(quota).cap === null;
  const line = dailyLine(quota, decision);
  const lineEn = dailyLine(quota, decision, 'en');
  const left = decision.ok || decision.reason === 'slots_full' || decision.reason === 'history_full' ? decision.left : 0;
  const provider = modelProvider();
  const optOut = meshyTrainingOptOut();
  const on = modelsOn();
  /** 수 배지(이력·★·3D)의 영어. 한국어 배지와 같은 차례 */
  const partsEn = countParts(counts, on, 'en');

  // ───── 0021의 이력·작업대·★·3D
  // 작업대 칸 수는 DB가 세션의 역할로 준다(손님 3, 가족·관리자 9). 그 밖의 칸 번호(역할이 줄어 남은 칸)는 이력에 있는 것으로 본다
  const size = benchSize(quota);
  const histRows = modern ? ((histRes.data ?? []) as unknown as Row[]) : [];
  const rowsById = new Map([...histRows, ...(modern ? ((benchRes.data ?? []) as unknown as Row[]) : [])].map((r) => [r.id, r]));
  const history = modern ? readCharacters(histRes.data, provider, size).slice(0, HISTORY_SHOWN) : [];
  const historyMore = modern && histRows.length > HISTORY_SHOWN;
  const bench = modern ? benchCells(readCharacters(benchRes.data, provider, size), size) : [];
  const benchFree = bench.some((c) => c === null);
  // 바꿀 칸 단추에 그 칸의 그림을 작게 보인다(다 그린 그림만. 비었거나 그리는 중이면 빈 틀)
  const benchThumbs = bench.map((c) => (c && c.status === 'ready' ? c.id : null));
  // 칸이 셋보다 많으면(가족·관리자 9칸) 작은 카드로 늘 세 칸씩 놓는다(휴대폰에서 3×3)
  const benchMany = bench.length > SLOTS;
  // ★ 보관함: 이력(최근 HISTORY_SHOWN개)과 작업대에서 ★ 그림만. 손님·가족은 이력이 그보다 작아 모두 보인다
  const keptItems = [...new Map([...bench, ...history].filter((c): c is CharItem => Boolean(c?.kept)).map((c) => [c.id, c])).values()]
    .sort((a, b) => b.since.localeCompare(a.since));
  const room = modelRoom(counts, on);
  const modelLeft = room.left;
  const modelCap = counts ? counts.models.cap : null;
  const cardOfItem = (item: CharItem, place: 'bench' | 'keep' | 'history'): CardInfo | null => {
    const r = rowsById.get(item.id);
    if (!r) return null;
    return {
      id: item.id,
      hasImage: item.status === 'ready' && Boolean(r.image_path),
      hasOriginal: Boolean(r.original_path),
      active: item.id === activeId,
      made: MADE.format(new Date(r.created_at)),
      madeEn: MADE_EN.format(new Date(r.created_at)),
      slot: item.slot ?? undefined,
      kept: item.kept,
      model: item.model,
      badge3d: itemBadge(item, modelLeft),
      badge3dEn: itemBadge(item, modelLeft, 'en'),
      modelCap,
      history: place !== 'bench',
      benchFree,
      benchSize: size,
      benchThumbs,
      // 3D 만들기 단추는 보관함(★)에만 둔다(★ 그림만 3D로 만들 수 있다)
      modelAsk: place === 'keep' && canRequestModel(item, modelLeft) ? modelConfirm(provider, modelCap, optOut) : null,
      modelAskEn: place === 'keep' && canRequestModel(item, modelLeft) ? modelConfirm(provider, modelCap, optOut, 'en') : null,
      turns: place === 'bench',
    };
  };

  // ───── 0021 전의 DB(예전 칸 셋). 칸 번호(0019)를 올리기 전이면 번호 없이 읽어 만든 차례대로 칸에 놓는다
  let legacyRows: Row[] = [];
  if (!modern) {
    const first = await keptList(true);
    legacyRows = ((first.error ? (await keptList(false)).data : first.data) ?? []) as unknown as Row[];
  }
  const legacyById = new Map(legacyRows.map((r) => [r.id, r]));
  const legacyCard = (r: Row, slot?: number): CardInfo => ({
    id: r.id,
    hasImage: r.status === 'ready' && Boolean(r.image_path),
    hasOriginal: Boolean(r.original_path),
    active: r.id === activeId,
    made: MADE.format(new Date(r.created_at)),
    madeEn: MADE_EN.format(new Date(r.created_at)),
    slot,
  });
  const layout = arrangeSlots(legacyRows);
  const extra = layout.extra.map((s) => legacyById.get(s.id)).filter((r): r is Row => Boolean(r)).map((r) => legacyCard(r));

  const gone = goneRows.slice(0, GONE_SHOWN).map((r) => ({
    id: r.id, hasImage: false, hasOriginal: Boolean(r.original_path), active: false, made: MADE.format(new Date(r.created_at)),
    madeEn: MADE_EN.format(new Date(r.created_at)),
  }) satisfies CardInfo);
  const goneMore = goneRows.length > GONE_SHOWN;
  const liveRows = modern ? [...rowsById.values()] : legacyRows;
  const originals = liveRows.filter((r) => r.status === 'ready' && r.original_path).length + goneRows.length;

  return (
    <div className="stack">
      <p className="lead">
        <T
          ko={<>
            내 사진에서 옷 색깔과 머리 모양, 안경 같은 것만 골라 귀여운 꼬마 캐릭터로 그려요. 누구나 같은 귀여운 비율로
            그려지고, 다 그리면 집 안을 걸을 때 종이 인형 대신 이 캐릭터가 나와요.
          </>}
          en="We take only things like clothing colors, hairstyle and glasses from your photo and draw a cute little character. Everyone is drawn in the same cute proportions, and once it's done, this character appears instead of the paper doll when you walk the house."
        />
      </p>

      {!avatarReady() || quotaError ? (
        <p className="note-box"><T ko={MESSAGES.notReady} en={MESSAGES_EN.notReady} /></p>
      ) : (
        <>
          {/* 내 하루 장수 줄. 모두의 상한이나 시도 수로 막혔으면 숨기고 까닭은 아래 카드가 알린다 */}
          {line ? (
            <p className="small muted" style={{ margin: 0 }}>
              <T ko={line} en={lineEn ?? line} />
            </p>
          ) : null}
          {/* 이력·★·3D의 수와 한도(제한이 없으면 그렇다고, 3D를 쉬거나 다 썼으면 그렇다고) */}
          {modern ? (
            <Labeled as="ul" className={styles.counts} ko="이력, ★ 보관, 3D" en="History, ★ favorites, 3D">
              {countParts(counts, on).map((part, i) => (
                <li key={part} className="badge"><T ko={part} en={partsEn[i] ?? part} /></li>
              ))}
            </Labeled>
          ) : null}
          {/* 장수가 다 차도 같은 자리에 둔다(방금 만든 그림이 새로고침 뒤에도 보이게) */}
          <AvatarStudio left={left} blocked={decision.ok ? null : decision.message} provider={provider} optOut={optOut} />
        </>
      )}

      {modern ? (
        <>
          <section className="stack" aria-labelledby="bench">
            <h2 id="bench"><T ko="작업대" en="Workbench" /></h2>
            <p className="small muted" style={{ margin: 0 }}>
              <T
                ko={<>
                  새로 만든 그림은 작업대 {size}칸 가운데 빈 칸에 들어가요. 다 차면 작업대에 가장 오래 있던 그림이 작업대에서 빠져요(이력에는 그대로 있어요).
                  ★로 보관한 그림과 지금 걷기에 쓰는 그림은 되도록 남겨요.
                </>}
                en={<>
                  New pictures go into an empty slot among your {size} workbench slots. When it&apos;s full, the picture that has been there longest
                  comes off the workbench (it stays in your history). Your ★ favorites and the picture you&apos;re walking as stay on it when possible.
                </>}
              />
            </p>
            {/* 칸이 셋보다 많으면(가족·관리자 9칸) 작은 카드로 늘 세 칸씩(휴대폰에서 3×3) */}
            <ol className={benchMany ? styles.slotsMany : styles.slots}>
              {bench.map((item, i) => {
                const card = item ? cardOfItem(item, 'bench') : null;
                return (
                  <li key={item?.id ?? `empty-${i}`} className={styles.slotItem}>
                    {!item || !card ? (
                      <EmptySlot n={i + 1} canMake={decision.ok} mini={benchMany} />
                    ) : item.status === 'ready' ? (
                      benchMany ? <MiniCard card={card} /> : <AvatarCard card={card} />
                    ) : (
                      <MakingSlot n={i + 1} id={item.id} queued={item.status === 'queued'} mini={benchMany} />
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="stack" aria-labelledby="keeps">
            <h2 id="keeps"><T ko="★ 보관함" en="★ Favorites" /></h2>
            <p className="small muted" style={{ margin: 0 }}>
              {room.left !== 0
                ? <T ko="마음에 드는 그림에 ★을 누르면 여기 모여요. 그 가운데 하나를 골라 3D로 만들 수 있어요." en="Press ★ on pictures you like and they gather here. You can pick one of them to make into 3D." />
                : room.why === 'off'
                  ? <T ko="마음에 드는 그림에 ★을 누르면 여기 모여요. 3D 만들기는 지금 쉬고 있어요." en="Press ★ on pictures you like and they gather here. 3D making is paused right now." />
                  : <T ko="마음에 드는 그림에 ★을 누르면 여기 모여요." en="Press ★ on pictures you like and they gather here." />}
            </p>
            <div className={styles.miniGrid}>
              {keptItems.map((item) => {
                const card = cardOfItem(item, 'keep');
                return card ? <MiniCard key={item.id} card={card} /> : null;
              })}
              {/* 빈 칸: 한도가 있는 역할만(남은 칸 수만큼) */}
              {counts && counts.keeps.cap !== null
                ? Array.from({ length: Math.max(0, counts.keeps.cap - keptItems.length) }, (_, i) => (
                  <p key={`keep-empty-${i}`} className={styles.miniEmpty}><T ko="이력에서 ☆을 누르면 여기 놓여요" en="Press ☆ in your history to put it here" /></p>
                ))
                : null}
            </div>
          </section>

          <section className="stack" aria-labelledby="history">
            <h2 id="history"><T ko="이력" en="History" /></h2>
            <p className="small muted" style={{ margin: 0 }}>
              <T
                ko="지우지 않은 그림이 최근부터 모두 있어요. 그림을 누르면 그 캐릭터로 걷고, ☆을 누르면 보관함에 놓여요."
                en="Every picture you haven't deleted is here, newest first. Tap a picture to walk as that character, or press ☆ to add it to your favorites."
              />
            </p>
            {/* 이력이 다 찼으면(위 만들기 카드가 까닭을 알린다) 여기서 지울 것을 고르게 한다. 저절로 지우지 않는다 */}
            {!decision.ok && decision.reason === 'history_full' ? (
              <p className="note-box" role="status">
                <T
                  ko="새로 만들려면 아래에서 지울 그림을 골라 「지우기」를 눌러 주세요. 3D가 있는 그림과 ★ 그림은 남겨 두세요."
                  en="To make a new one, choose a picture below and press “Delete”. Keep the pictures with 3D and your ★ pictures."
                />
              </p>
            ) : null}
            {history.length ? (
              <div className={styles.miniGrid}>
                {history.map((item) => {
                  if (item.status !== 'ready') {
                    return <MakingSlot key={item.id} n={item.slot ?? undefined} id={item.id} queued={item.status === 'queued'} mini />;
                  }
                  const card = cardOfItem(item, 'history');
                  return card ? <MiniCard key={item.id} card={card} /> : null;
                })}
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}><T ko="아직 만든 그림이 없어요." en="No pictures yet." /></p>
            )}
            {historyMore ? (
              <p className="small muted" style={{ margin: 0 }}>
                <T
                  ko={<>이력이 더 있어요. 최근 {HISTORY_SHOWN}개만 보여요. 지우면 그다음 것이 보여요.</>}
                  en={<>There is more history. Only the latest {HISTORY_SHOWN} are shown. Delete some to see the next ones.</>}
                />
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="stack" aria-labelledby="mine">
          <h2 id="mine"><T ko="내 캐릭터 칸" en="My character slots" /></h2>
          <p className="small muted" style={{ margin: 0 }}>
            <T
              ko={<>사진 캐릭터는 {SLOTS}개까지 보관해요. 칸을 골라 걷기에 쓰고, 칸을 비우면 그 자리에 새로 만들 수 있어요.</>}
              en={<>You can keep up to {SLOTS} photo characters. Choose a slot to walk with it, and empty a slot to make a new one there.</>}
            />
          </p>
          <ol className={styles.slots}>
            {layout.cells.map((item, i) => {
              const row = item ? legacyById.get(item.id) : undefined;
              return (
                <li key={item?.id ?? `empty-${i}`} className={styles.slotItem}>
                  {!item || !row ? (
                    <EmptySlot n={i + 1} canMake={decision.ok} />
                  ) : item.status === 'ready' ? (
                    <AvatarCard card={legacyCard(row, i + 1)} />
                  ) : (
                    <MakingSlot n={i + 1} id={item.id} queued={item.status === 'queued'} />
                  )}
                </li>
              );
            })}
          </ol>
          {extra.length ? (
            <>
              <p className="small muted" style={{ margin: 0 }}>
                <T
                  ko={<>칸 밖에 남은 캐릭터예요. 보관 중인 캐릭터가 {SLOTS}개보다 적어질 때까지는 새로 만들 수 없어요.</>}
                  en={<>These characters are outside the slots. You can&apos;t make a new one until you keep fewer than {SLOTS} characters.</>}
                />
              </p>
              <div className={styles.grid}>
                {extra.map((c) => (
                  <AvatarCard key={c.id} card={c} />
                ))}
              </div>
            </>
          ) : null}
        </section>
      )}

      {gone.length ? (
        <section className="stack" aria-labelledby="gone">
          <h2 id="gone"><T ko="지운 캐릭터의 원본 사진" en="Original photos of deleted characters" /></h2>
          <div className={styles.grid}>
            {gone.map((c) => (
              <AvatarCard key={c.id} card={c} />
            ))}
          </div>
          {goneMore ? (
            <p className="small muted" style={{ margin: 0 }}>
              <T
                ko="원본 사진이 더 있어요. 최근 것부터 보여요. 아래 「원본 사진 모두 지우기」는 여기 보이지 않는 것까지 모두 지워요."
                en="There are more original photos. The newest are shown first. “Delete all original photos” below also deletes the ones not shown here."
              />
            </p>
          ) : null}
        </section>
      ) : null}

      <Labeled as="section" className="stack" ko="원본 사진 보관" en="Original photo storage">
        {originals > 1 ? <DeleteAllOriginals /> : null}
        <p className="small muted">
          <T
            ko={<>
              원본 사진은 내가 지울 때까지 보관되고 사이트에서는 나만 볼 수 있어요. 그림은 조연당 온라인에 들어온 초대 손님에게만 보여요.
              집주인 보관함의 사본도 내가 지우면 다음 정리 때 지워요.
              {/* 하루 장수에 제한이 없는 역할에는 뜻이 없는 말이라 뺀다 */}
              {unlimited ? null : ' 그림을 지워도 오늘 만든 장수는 그대로예요.'}
            </>}
            en={<>
              Your original photos are kept until you delete them, and on the site only you can see them. Pictures are shown only to invited
              guests who have entered Joyeondang Online. When you delete them, the copies in the host&apos;s archive are also deleted at the next cleanup.
              {unlimited ? null : " Deleting a picture doesn't change how many you've made today."}
            </>}
          />
        </p>
      </Labeled>
    </div>
  );
}
