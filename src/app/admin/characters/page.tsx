import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { adminStoreReady, drainAvatarTrash } from '@/lib/avatar/admin-server';
import { modelProvider, modelsOn } from '@/lib/avatar/server';
import { getViewer } from '@/lib/viewer';
import { CharacterConsole } from './CharacterConsole';

export const metadata: Metadata = { title: '캐릭터 관리', robots: { index: false, follow: false } };

// 캐릭터 관리 콘솔(집주인만, 0024). 집주인이 아니면 승인함처럼 막는다. 목록과 조작은 콘솔이 API로 한다
// (/api/admin/characters, 판정은 DB가 is_admin()으로 한 번 더). 화면을 열 때 지난번에 못 지운 파일(버릴 목록)을 마저 지운다.
export default function CharactersPage() {
  return (
    <div className="wrap-wide stack">
      <p className="small" style={{ margin: 0 }}><Link href="/admin">승인함으로</Link></p>
      <h1>캐릭터 관리</h1>
      <Suspense fallback={<p className="muted">불러오는 중</p>}>
        <ConsoleGate />
      </Suspense>
    </div>
  );
}

async function ConsoleGate() {
  const viewer = await getViewer();
  if (viewer.role !== 'admin') {
    return <p className="note-box">집주인만 들어올 수 있는 곳이에요. <Link href="/">첫 화면으로</Link></p>;
  }
  const store = adminStoreReady();
  const drained = store ? await drainAvatarTrash() : null;
  return <CharacterConsole provider={modelProvider()} modelsOn={modelsOn()} store={store} trashLeft={drained?.left === true} />;
}
