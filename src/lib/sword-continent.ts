import 'server-only';
import { SWORD_SNAPSHOT, type SwordUpstreamMeta } from '@/games/sword/logic';

const REPO = 'johnfkoo951/sword-continent';
const CACHE_TTL_MS = 3 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4500;

const ALLOWED_PLAY_HOSTS = new Set([
  'brewpage.app',
  'raw.githubusercontent.com',
]);

export function isAllowedSwordPlayUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    if (ALLOWED_PLAY_HOSTS.has(u.hostname)) return true;
    return (
      u.hostname.endsWith('.brewpage.app') ||
      u.hostname.endsWith('.vercel.app') ||
      u.hostname.endsWith('.github.io') ||
      u.hostname.endsWith('.cmdspace.work')
    );
  } catch {
    return false;
  }
}

export function extractPlayInfoFromReadme(readme: string, fallback: SwordUpstreamMeta): {
  version: string;
  editionKo: string;
  editionEn: string;
  playUrl: string;
} {
  const verMatch = /현재 버전:\s*(v[0-9.]+)(?:\s*[—\-·]\s*([^\n*]+))?/.exec(readme);
  const version = verMatch?.[1]?.trim() || fallback.version;
  const subKo = verMatch?.[2]?.trim();
  const editionKo = subKo ? `${version} · ${subKo}` : fallback.editionKo;
  const editionEn = version === fallback.version ? fallback.editionEn : `${version} · Live Adventure Build`;

  const urlMatches = readme.match(/https:\/\/[^\s)>"]+/g) ?? [];
  let playUrl = fallback.playUrl;
  for (const cand of urlMatches) {
    if (cand.includes('github.com/')) continue;
    if (isAllowedSwordPlayUrl(cand)) {
      playUrl = cand;
      break;
    }
  }
  return { version, editionKo, editionEn, playUrl };
}

type CacheState = {
  at: number;
  meta: SwordUpstreamMeta;
  html: string | null;
  htmlUrl: string | null;
};

let cache: CacheState = {
  at: 0,
  meta: SWORD_SNAPSHOT,
  html: null,
  htmlUrl: null,
};

async function timedFetch(url: string, accept = 'text/html,*/*'): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: accept,
        'User-Agent': 'joyeondang-sword-sync/1.0',
      },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GitHub johnfkoo951/sword-continent 레포의 최신 HEAD를 확인해 버전과 실행 HTML 주소를 자동 추적한다.
 * - 레포 안에 .html 파일이 새로 올라오면 그 파일을 최우선으로 사용한다.
 * - 없으면 README.md에 적힌 최신 배포 링크(brewpage 등)를 읽는다.
 * - 네트워크 지연·한도 초과 시 저장된 스냅숏(upstream.json)으로 즉시 폴백한다.
 */
export async function resolveSwordUpstream(forceRefresh = false): Promise<SwordUpstreamMeta> {
  const now = Date.now();
  if (!forceRefresh && cache.at > 0 && now - cache.at < CACHE_TTL_MS) {
    return cache.meta;
  }

  try {
    const commitRes = await timedFetch(`https://api.github.com/repos/${REPO}/commits/main`, 'application/vnd.github+json');
    if (!commitRes.ok) throw new Error('github_commit_unavailable');
    const commitData = (await commitRes.json()) as { sha?: string; commit?: { committer?: { date?: string } } };
    const fullSha = typeof commitData.sha === 'string' && /^[0-9a-f]{40}$/i.test(commitData.sha) ? commitData.sha : '';
    if (!fullSha) throw new Error('invalid_sha');

    const [treeRes, readmeRes] = await Promise.all([
      timedFetch(`https://api.github.com/repos/${REPO}/git/trees/${fullSha}?recursive=1`, 'application/vnd.github+json').catch(() => null),
      timedFetch(`https://raw.githubusercontent.com/${REPO}/${fullSha}/README.md`, 'text/plain').catch(() => null),
    ]);

    let repoHtmlUrl: string | null = null;
    if (treeRes?.ok) {
      const treeJson = (await treeRes.json()) as { tree?: Array<{ path?: string; type?: string }> };
      const htmlPaths = (treeJson.tree ?? [])
        .filter((it) => it.type === 'blob' && typeof it.path === 'string' && /\.html$/i.test(it.path))
        .map((it) => it.path as string);
      if (htmlPaths.length > 0) {
        const chosen = htmlPaths.find((p) => p === 'index.html') ?? htmlPaths[htmlPaths.length - 1];
        repoHtmlUrl = `https://raw.githubusercontent.com/${REPO}/${fullSha}/${chosen}`;
      }
    }

    const readmeText = readmeRes?.ok ? await readmeRes.text() : '';
    const parsed = readmeText ? extractPlayInfoFromReadme(readmeText, SWORD_SNAPSHOT) : {
      version: SWORD_SNAPSHOT.version,
      editionKo: SWORD_SNAPSHOT.editionKo,
      editionEn: SWORD_SNAPSHOT.editionEn,
      playUrl: SWORD_SNAPSHOT.playUrl,
    };

    const nextMeta: SwordUpstreamMeta = {
      repo: REPO,
      repoUrl: `https://github.com/${REPO}`,
      branch: 'main',
      commitSha: fullSha.slice(0, 7),
      version: parsed.version,
      editionKo: parsed.editionKo,
      editionEn: parsed.editionEn,
      playUrl: repoHtmlUrl ?? parsed.playUrl,
      coopRoomCode: SWORD_SNAPSHOT.coopRoomCode,
      syncedAt: commitData.commit?.committer?.date ?? new Date().toISOString(),
      source: 'github-live',
    };

    if (cache.htmlUrl !== nextMeta.playUrl) {
      cache = { at: now, meta: nextMeta, html: null, htmlUrl: nextMeta.playUrl };
    } else {
      cache = { ...cache, at: now, meta: nextMeta };
    }
    return nextMeta;
  } catch {
    cache = { ...cache, at: now };
    return cache.meta;
  }
}

// 공개 비로그인 방문자에게는 아이 본명 문자열을 중립 모험가 호칭으로 마스킹한다(코드에는 리터럴을 두지 않는다).
const MASK_A = String.fromCharCode(0xd0dc, 0xc6a9);
const MASK_B = String.fromCharCode(0xd0dc, 0xc0b0);
// v4.4의 2P 호칭(형을 부르는 애칭). 조사 '과'는 받침 없는 '수호자' 뒤에서 '와'가 된다.
const MASK_C = String.fromCharCode(0xc0b0, 0xc774, 0x20, 0xd615);

/** 공개 화면용 호칭 바꾸기. 긴 것부터 바꿔야 짧은 이름이 먼저 먹지 않는다. */
const NAME_MASKS: ReadonlyArray<readonly [string, string]> = [
  [`${MASK_C}과`, '수호자와'],
  [MASK_C, '수호자'],
  [`1P ${MASK_A}이`, '1P 용사'],
  [`${MASK_A}이 (1P)`, '용사 (1P)'],
  [`${MASK_A}이가`, '용사가'],
  [`${MASK_A}이`, '용사 1P'],
  [MASK_A, '용사'],
  [MASK_B, '수호자'],
];

const BRIDGE_SCRIPT = `
<script>
(function(){
  // 왕드래곤을 잡으면 게임이 피리·소환 표시를 다시 끈다. 한 번 지난 단계는 여기서 기억한다.
  var seen = { flute: false, summoned: false, down: false };
  var send = function() {
    try {
      if (typeof state === 'object' && state) {
        var ending = document.getElementById('kingEndingModal');
        if (state.hasFlute) seen.flute = true;
        if (state.kingSpawned) seen.summoned = true;
        if (ending && window.getComputedStyle(ending).display !== 'none') seen.down = true;
        window.parent.postMessage({
          type: 'jy:sword-state',
          started: Boolean(state.started),
          stage: (Number(state.currentStageIndex) || 0) + 1,
          level: Number(state.level) || 1,
          candies: Number(state.candies) || 0,
          totalCandies: Number(state.totalCandiesFed) || Number(state.candies) || 0,
          kills: Number(state.stageKills) || 0,
          totalKills: Number(state.totalKills) || Number(state.stageKills) || 0,
          flute: seen.flute,
          dragonSummoned: seen.summoned,
          dragonDown: seen.down
        }, '*');
      }
    } catch (_) {}
  };
  setInterval(send, 1000);
  window.addEventListener('pointerup', function(){ setTimeout(send, 180); }, { passive: true });
  window.addEventListener('keyup', function(){ setTimeout(send, 180); }, { passive: true });
})();
</script>
`;

export function transformSwordHtml(rawHtml: string, opts: { allowFamilyNames: boolean; playUrl: string }): string {
  let html = rawHtml;
  if (!opts.allowFamilyNames) {
    for (const [from, to] of NAME_MASKS) html = html.replaceAll(from, to);
  }
  // 상대경로 에셋이 있을 때를 대비해 <base> 보강
  if (opts.playUrl.startsWith('https://raw.githubusercontent.com/')) {
    const baseDir = opts.playUrl.replace(/[^/]+$/, '');
    if (!/<base\s/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseDir}">`);
    }
  }
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${BRIDGE_SCRIPT}</body>`);
  } else {
    html = `${html}\n${BRIDGE_SCRIPT}`;
  }
  return html;
}

export async function fetchSwordGameHtml(opts: { forceRefresh?: boolean; allowFamilyNames: boolean }): Promise<{
  meta: SwordUpstreamMeta;
  html: string | null;
}> {
  const meta = await resolveSwordUpstream(Boolean(opts.forceRefresh));
  if (!opts.forceRefresh && cache.html && cache.htmlUrl === meta.playUrl) {
    return { meta, html: transformSwordHtml(cache.html, { allowFamilyNames: opts.allowFamilyNames, playUrl: meta.playUrl }) };
  }

  const urlsToTry = [meta.playUrl];
  if (meta.playUrl !== SWORD_SNAPSHOT.playUrl) urlsToTry.push(SWORD_SNAPSHOT.playUrl);

  for (const targetUrl of urlsToTry) {
    if (!isAllowedSwordPlayUrl(targetUrl)) continue;
    try {
      const res = await timedFetch(targetUrl, 'text/html');
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.length < 200) continue;
      cache = { ...cache, html: text, htmlUrl: targetUrl };
      return { meta, html: transformSwordHtml(text, { allowFamilyNames: opts.allowFamilyNames, playUrl: targetUrl }) };
    } catch {
      // 다음 후보 URL 시도
    }
  }
  return { meta, html: null };
}
