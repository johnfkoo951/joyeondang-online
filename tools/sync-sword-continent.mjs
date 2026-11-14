#!/usr/bin/env node
// johnfkoo951/sword-continent 최신 커밋·버전·플레이 주소를 읽어 src/games/sword/upstream.ts를 갱신한다.
// 로컬 클론(기본은 이 저장소 옆 폴더 sword-continent, SWORD_CONTINENT_DIR로 바꿀 수 있다)이 있으면 함께 git pull --ff-only로 맞춘다.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'src/games/sword/upstream.ts');
const LOCAL_REPO = process.env.SWORD_CONTINENT_DIR || join(ROOT, '..', 'sword-continent');
const REPO = 'johnfkoo951/sword-continent';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'joyeondang-sword-sync' },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'joyeondang-sword-sync' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

if (existsSync(join(LOCAL_REPO, '.git'))) {
  try {
    execFileSync('git', ['-C', LOCAL_REPO, 'pull', '--ff-only'], { stdio: 'inherit' });
  } catch {
    console.warn('! 로컬 sword-continent pull 건너뜀(네트워크 또는 로컬 변경 확인)');
  }
}

const prev = existsSync(OUT) ? (() => { const m = /UPSTREAM_SNAPSHOT\s*=\s*(\{[\s\S]*?\})\s*as const/.exec(readFileSync(OUT, 'utf8')); return m ? JSON.parse(m[1]) : {}; })() : {};
const commit = await fetchJson(`https://api.github.com/repos/${REPO}/commits/main`);
const sha = String(commit.sha || '').slice(0, 7) || prev.commitSha || 'main';

const treeData = await fetchJson(`https://api.github.com/repos/${REPO}/git/trees/${commit.sha}?recursive=1`);
const htmlFiles = (treeData.tree || [])
  .filter((item) => item.type === 'blob' && /\.html$/i.test(item.path))
  .map((item) => item.path);

const readme = await fetchText(`https://raw.githubusercontent.com/${REPO}/${commit.sha}/README.md`);
const verMatch = /현재 버전:\s*(v[0-9.]+)(?:\s*[—\-·]\s*([^\n*]+))?/.exec(readme);
const version = verMatch?.[1]?.trim() || prev.version || 'v3.7';
const subtitleKo = verMatch?.[2]?.trim();
const editionKo = subtitleKo ? `${version} · ${subtitleKo}` : (prev.editionKo || version);

let playUrl = prev.playUrl || 'https://brewpage.app/api/html/public/Hye23cU10a';
if (htmlFiles.length > 0) {
  const preferred = htmlFiles.find((p) => p === 'index.html') || htmlFiles[htmlFiles.length - 1];
  playUrl = `https://raw.githubusercontent.com/${REPO}/${commit.sha}/${preferred}`;
} else {
  const urlMatch = /https:\/\/(?:brewpage\.app\/api\/html\/public\/[A-Za-z0-9_-]+|[^\s)>"]+\.html)/i.exec(readme);
  if (urlMatch) playUrl = urlMatch[0];
}

const next = {
  repo: REPO,
  repoUrl: `https://github.com/${REPO}`,
  branch: 'main',
  commitSha: sha,
  version,
  editionKo,
  editionEn: prev.editionEn && prev.version === version ? prev.editionEn : `${version} · Live Adventure Build`,
  playUrl,
  coopRoomCode: prev.coopRoomCode || '7794',
  syncedAt: new Date().toISOString(),
};

writeFileSync(OUT, `// tools/sync-sword-continent.mjs가 자동 갱신하는 스냅숏(런타임에는 GitHub HEAD를 실시간 우선 조회한다).\nexport const UPSTREAM_SNAPSHOT = ${JSON.stringify(next, null, 2)} as const;\n`, 'utf8');
console.log(`✓ sword-continent 동기화 완료: ${next.editionKo} (${next.commitSha}) -> ${next.playUrl}`);
