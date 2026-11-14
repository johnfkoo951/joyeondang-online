import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/components/i18n/useLang';
import type { GameContext } from '../types';
import {
  INITIAL_SWORD_PROGRESS,
  SWORD_SNAPSHOT,
  computeSwordScore,
  isSwordCleared,
  parseSwordMessage,
  type SwordProgress,
  type SwordUpstreamMeta,
} from './logic';
import s from './sword.module.css';

export function SwordGame({ ctx }: { ctx: GameContext }) {
  const lang = useLang();
  const [meta, setMeta] = useState<SwordUpstreamMeta>(SWORD_SNAPSHOT);
  const [progress, setProgress] = useState<SwordProgress>(INITIAL_SWORD_PROGRESS);
  const [bestScore, setBestScore] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const startMsRef = useRef<number>(0);
  const bestRef = useRef({ score: 0, cleared: false, progress: INITIAL_SWORD_PROGRESS });

  useEffect(() => {
    startMsRef.current = performance.now();
    let stop = false;
    fetch('/api/sword-continent/meta', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { meta?: SwordUpstreamMeta } | null) => {
        if (!stop && d?.meta) setMeta(d.meta);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  const reportToOverlay = useCallback(
    (nextProg: SwordProgress) => {
      const score = computeSwordScore(nextProg);
      const cleared = isSwordCleared(nextProg) || bestRef.current.cleared;
      const hi = Math.max(bestRef.current.score, score);
      bestRef.current = { score: hi, cleared, progress: nextProg };
      setBestScore(hi);
      if (cleared || hi > 0) {
        ctx.report?.({
          cleared,
          score: hi,
          ms: Math.max(1000, Math.round(performance.now() - startMsRef.current)),
          detail: {
            stage: nextProg.stage,
            level: nextProg.level,
            candies: Math.max(nextProg.totalCandies, nextProg.candies),
          },
        });
      }
    },
    [ctx],
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const parsed = parseSwordMessage(e.data);
      if (!parsed) return;
      setProgress(parsed);
      reportToOverlay(parsed);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [reportToOverlay]);

  const refreshLatest = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sword-continent/meta?refresh=1', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const d = (await res.json()) as { meta?: SwordUpstreamMeta };
        if (d?.meta) setMeta(d.meta);
      }
    } catch {
      // 스냅숏 유지
    } finally {
      setReloadNonce((n) => n + 1);
      setSyncing(false);
    }
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  };

  const finishAndSave = () => {
    const b = bestRef.current;
    if (b.score === 0 && !b.cleared) {
      ctx.onExit({
        cleared: true,
        score: 150,
        ms: Math.max(1000, Math.round(performance.now() - startMsRef.current)),
        detail: { stage: 1, level: 1 },
      });
      return;
    }
    ctx.onExit({
      cleared: b.cleared || b.score >= 100,
      score: b.score,
      ms: Math.max(1000, Math.round(performance.now() - startMsRef.current)),
      detail: {
        stage: b.progress.stage,
        level: b.progress.level,
        candies: Math.max(b.progress.totalCandies, b.progress.candies),
      },
    });
  };

  const frameSrc = `/api/sword-continent/frame${reloadNonce > 0 ? `?refresh=1&t=${reloadNonce}` : ''}`;

  return (
    <div ref={wrapRef} className={s.root}>
      <div className={s.bar}>
        <div className={s.leftGroup}>
          <span className={s.versionBadge}>
            🗡️ {lang === 'en' ? meta.editionEn : meta.editionKo} ({meta.commitSha})
          </span>
          <span className={s.coopBadge}>
            {lang === 'en' ? `2P Co-op Room: ${meta.coopRoomCode}` : `🤝 2인 협동 방 코드: ${meta.coopRoomCode}`}
          </span>
          <span className={s.scoreBadge}>
            {lang === 'en'
              ? `Stage ${progress.stage} · Lv.${progress.level} · 🍬 ${progress.candies} · ${bestScore} pts`
              : `스테이지 ${progress.stage} · Lv.${progress.level} · 🍬 ${progress.candies} · ${bestScore}점`}
          </span>
        </div>
        <div className={s.rightGroup}>
          <button type="button" className={s.miniBtn} onClick={() => void refreshLatest()} disabled={syncing}>
            {syncing
              ? (lang === 'en' ? 'Syncing…' : '동기화 중…')
              : (lang === 'en' ? '↻ Sync GitHub' : '↻ 최신판 동기화')}
          </button>
          <a
            href={meta.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={s.miniBtn}
          >
            GitHub ↗
          </a>
          <button type="button" className={s.miniBtn} onClick={toggleFullscreen}>
            {lang === 'en' ? 'Fullscreen' : '전체화면'}
          </button>
          <button type="button" className={s.finishBtn} onClick={finishAndSave}>
            {lang === 'en' ? 'Save Score & Stamp' : '점수 마감 & 도장'}
          </button>
        </div>
      </div>

      <div className={s.stageWrap}>
        <iframe
          ref={frameRef}
          key={reloadNonce}
          src={frameSrc}
          title={lang === 'en' ? 'The Sword Continent 3D Boss Raid RPG' : '소드 콘티넌트 3D 협동 보스 레이드 RPG'}
          className={s.frame}
          allow="fullscreen; autoplay"
          onLoad={() => {
            try {
              frameRef.current?.contentWindow?.focus();
            } catch {
              // 무시
            }
          }}
        />
      </div>
    </div>
  );
}
