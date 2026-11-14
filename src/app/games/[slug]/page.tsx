import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { JazzArcade } from '@/components/games/JazzArcade';
import { StandaloneGame } from '@/components/games/StandaloneGame';
import { canUse } from '@/lib/access';
import { CANONICAL_GAME_IDS, STANDALONE_GAME_META, resolveGameSlug, standaloneGameHref, type CanonicalGameId } from '@/lib/game-routes';
import { getViewer } from '@/lib/viewer';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return [...CANONICAL_GAME_IDS.map((slug) => ({ slug })), { slug: 'jazz' }, { slug: 'sword-continent' }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveGameSlug(slug);
  if (!resolved) return { title: '작은 놀이' };
  if (resolved.kind === 'jazz') {
    return {
      title: '재즈 게임 스튜디오',
      description: '리듬 천국 재즈 스튜디오 · 재즈 이어 트레이닝 · 박공 아래 잼 단독 실행 허브',
    };
  }
  const meta = STANDALONE_GAME_META[resolved.id];
  return {
    title: meta?.title ?? '작은 놀이',
    description: meta?.blurb,
  };
}

export default function StandaloneGamePage({ params }: Props) {
  return (
    <div className="wrap-wide stack">
      <Suspense fallback={<p className="muted">놀이를 여는 중이에요…</p>}>
        <StandaloneGameBody params={params} />
      </Suspense>
    </div>
  );
}

async function StandaloneGameBody({ params }: Props) {
  const { slug } = await params;
  const resolved = resolveGameSlug(slug);
  if (!resolved) notFound();
  if (resolved.kind === 'jazz') {
    return <JazzArcade />;
  }
  if (resolved.redirect) {
    redirect(standaloneGameHref(resolved.id));
  }
  return <StandaloneGameLive gameId={resolved.id} />;
}

async function StandaloneGameLive({ gameId }: { gameId: CanonicalGameId }) {
  const viewer = await getViewer();
  return (
    <StandaloneGame
      gameId={gameId}
      nickname={viewer.name ?? '손님'}
      role={viewer.role}
      canStamp={canUse(viewer.role, 'stamps')}
    />
  );
}
