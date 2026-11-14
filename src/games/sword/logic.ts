// 소드 콘티넌트(3D 협동 보스 레이드 액션 RPG) 점수 환산·진행 판정 순수 로직(단위 시험 대상).
import { UPSTREAM_SNAPSHOT } from './upstream';

export type SwordUpstreamMeta = {
  repo: string;
  repoUrl: string;
  branch: string;
  commitSha: string;
  version: string;
  editionKo: string;
  editionEn: string;
  playUrl: string;
  coopRoomCode: string;
  syncedAt: string;
  source?: 'github-live' | 'snapshot';
};

export const SWORD_SNAPSHOT: SwordUpstreamMeta = {
  ...UPSTREAM_SNAPSHOT,
  source: 'snapshot',
};

export type SwordProgress = {
  started: boolean;
  stage: number;
  level: number;
  candies: number;
  totalCandies: number;
  /** 지금 스테이지에서 잡은 수 */
  kills: number;
  /** 스테이지를 넘어도 이어지는 누적 처치 수(v4.4부터, 이전 판은 kills와 같다) */
  totalKills: number;
  /** 50마리를 잡아 받은 황금 피리(v4.4) */
  flute: boolean;
  /** 피리로 불러낸 왕드래곤이 나타남(v4.4) */
  dragonSummoned: boolean;
  /** 왕드래곤을 쓰러뜨려 엔딩을 봄(v4.4) */
  dragonDown: boolean;
};

export const INITIAL_SWORD_PROGRESS: SwordProgress = {
  started: false,
  stage: 1,
  level: 1,
  candies: 0,
  totalCandies: 0,
  kills: 0,
  totalKills: 0,
  flute: false,
  dragonSummoned: false,
  dragonDown: false,
};

/** 왕드래곤 단계 보너스. 피리 → 소환 → 격파 순으로 커진다. */
export const SWORD_DRAGON_BONUS = { flute: 800, summoned: 1200, down: 5000 } as const;

/**
 * RPG 진행 상태를 조연당 통합 리더보드 점수(0 ~ 100,000)로 환산한다.
 * 스테이지 돌파(스테이지당 600점) + 레벨 성장(레벨당 350점) + 누적 사탕 파밍(개당 8점) + 처치(마리당 25점)
 * + 왕드래곤 단계 보너스(피리 800, 소환 1,200, 격파 5,000).
 */
export function computeSwordScore(p: SwordProgress): number {
  const stage = Math.max(1, Math.min(30, Math.trunc(p.stage || 1)));
  const level = Math.max(1, Math.min(99, Math.trunc(p.level || 1)));
  const totalCandies = Math.max(0, Math.min(5000, Math.trunc(Math.max(p.totalCandies || 0, p.candies || 0))));
  const kills = Math.max(0, Math.min(800, Math.trunc(Math.max(p.totalKills || 0, p.kills || 0))));
  const dragonSteps = (p.flute || p.dragonSummoned || p.dragonDown ? SWORD_DRAGON_BONUS.flute : 0)
    + (p.dragonSummoned || p.dragonDown ? SWORD_DRAGON_BONUS.summoned : 0)
    + (p.dragonDown ? SWORD_DRAGON_BONUS.down : 0);

  if (!p.started && stage <= 1 && level <= 1 && totalCandies === 0 && kills === 0 && dragonSteps === 0) {
    return 0;
  }
  const raw = (stage - 1) * 600 + (level - 1) * 350 + totalCandies * 8 + kills * 25 + 100 + dragonSteps;
  return Math.max(0, Math.min(100_000, raw));
}

/** 몬스터 1마리 이상 처치(사탕 15개 이상) 또는 2스테이지/2레벨 도달 시 방 도장 획득 조건 충족 */
export function isSwordCleared(p: SwordProgress): boolean {
  return p.stage >= 2 || p.level >= 2 || p.totalCandies >= 15 || p.candies >= 15 || p.kills >= 3
    || p.totalKills >= 3 || p.flute || p.dragonSummoned || p.dragonDown;
}

export function parseSwordMessage(data: unknown): SwordProgress | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.type !== 'jy:sword-state') return null;
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const kills = Math.max(0, Math.round(num(o.kills, 0)));
  return {
    started: Boolean(o.started),
    stage: Math.max(1, Math.round(num(o.stage, 1))),
    level: Math.max(1, Math.round(num(o.level, 1))),
    candies: Math.max(0, Math.round(num(o.candies, 0))),
    totalCandies: Math.max(0, Math.round(num(o.totalCandies, 0))),
    kills,
    // 이전 판(v3.x)은 아래 칸을 보내지 않는다. 그때는 지금 스테이지 처치 수와 '아직 안 함'으로 둔다.
    totalKills: Math.max(kills, Math.round(num(o.totalKills, 0))),
    flute: o.flute === true,
    dragonSummoned: o.dragonSummoned === true,
    dragonDown: o.dragonDown === true,
  };
}
