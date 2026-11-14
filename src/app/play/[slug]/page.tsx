import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CANONICAL_GAME_IDS, resolveGameSlug, standaloneGameHref } from '@/lib/game-routes';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return [...CANONICAL_GAME_IDS.map((slug) => ({ slug })), { slug: 'jazz' }, { slug: 'sword-continent' }];
}

export default function PlayRedirectPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PlayRedirectBody params={params} />
    </Suspense>
  );
}

async function PlayRedirectBody({ params }: Props): Promise<null> {
  const { slug } = await params;
  const resolved = resolveGameSlug(slug);
  if (!resolved) notFound();
  if (resolved.kind === 'jazz') redirect('/games/jazz');
  redirect(standaloneGameHref(resolved.id));
}
