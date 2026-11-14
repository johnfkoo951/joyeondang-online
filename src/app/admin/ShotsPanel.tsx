import { after } from 'next/server';
import { ShotsForgetList } from '@/app/admin/ShotsForget';
import { cleanShotsStorage, shotsAdminReady, shotsKeyWorks } from '@/lib/shots-admin';
import {
  CLEAN_AFTER_MS, SHOTS_KEY_BROKEN, SHOTS_NOT_READY, asShotCounts, asShotEvents, asShotTotals, panelTrouble,
} from '@/lib/shots-admin-rules';
import { createClient } from '@/lib/supabase/server';

// ───────── 걷기 사진 지우기(0022): 걷다가 찍은 사진(실제 집 화면)을 사람마다, 행사 초대 코드마다 지운다.
// 관리 화면(집주인만) 안에서 따로 <Suspense>로 그린다(저장소에 묻는 동안 다른 칸을 붙잡지 않게).
// 집주인은 사진을 보지 않는다: DB의 admin_shot_counts·admin_shot_events·admin_shot_totals가 집주인인지 한 번 더 보고
// 사람마다 장수와 합계만 준다(경로·장소·찍은 때는 오지 않는다). 사람 줄은 많은 순 500줄까지, 합계는 DB가 따로 센다.
// 저장소 정리가 남았으면 화면을 보낸 뒤(after) 이어서 지운다. 화면을 그리는 동안에는 지우지 않는다.
export async function ShotsPanel() {
  const supabase = await createClient();
  const present = shotsAdminReady();
  const [counts, events, totals, keyOk] = await Promise.all([
    supabase.rpc('admin_shot_counts'),
    supabase.rpc('admin_shot_events'),
    supabase.rpc('admin_shot_totals'),
    present ? shotsKeyWorks() : Promise.resolve(false),
  ]);
  const error = counts.error ?? events.error ?? totals.error;
  const sum = asShotTotals(totals.data);
  if (!error && keyOk && (sum.files > 0 || sum.folders > sum.waiting)) {
    after(() => cleanShotsStorage(CLEAN_AFTER_MS));
  }
  return (
    <section className="card stack" aria-labelledby="shots">
      <h2 id="shots" style={{ marginTop: 0 }}>걷기 사진 지우기</h2>
      <p className="small muted">
        집 안을 걷다가 찍은 사진(실제 집 화면)이에요. 손님뿐 아니라 가족, 집주인, 명단 밖 계정의 사진도 사람마다 지울 수 있어요.
        사진은 열어 보지 않고 사람마다 장수만 보여요. 지우면 그 사람의 갤러리에서 바로 사라지고, 저장소의 파일은 서버가 이어서
        지워요(올리다 끊겨 갤러리에 안 보이던 파일까지). 되돌릴 수 없어요. 행사가 끝나면 그 행사로 들어온 손님의 사진을 한꺼번에 지울 수 있어요.
      </p>
      {error ? (
        <p className="note-box">{panelTrouble(error)}</p>
      ) : (
        <ShotsForgetList
          people={asShotCounts(counts.data)}
          events={asShotEvents(events.data)}
          totals={sum}
          note={!present ? SHOTS_NOT_READY : keyOk ? '' : SHOTS_KEY_BROKEN}
        />
      )}
    </section>
  );
}
