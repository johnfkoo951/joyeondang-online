import 'server-only';
import { gunzipSync } from 'node:zlib';
import type { Role } from '@/lib/access';
import { localPreview } from '@/lib/preview';
import { shellToWorld } from '@/lib/shell-world';
import type { HouseWorld } from '@/walk/types';

// 관리자 전용 「실측 1층 (시험)」 지도의 데이터. 저장소·빌드 결과물에는 없고 서버 환경 변수 HOUSE_SHELL_GZ(실측 껍데기 JSON을
// gzip한 뒤 base64)에만 있다. 이 컴퓨터 미리보기(lib/preview.ts의 두 겹 잠금)가 켜져 있으면 HOUSE_SHELL_FILE이 가리키는 파일
// (JSON 또는 gzip)도 읽는다: 저장소 밖에 둔 파일을 다시 내보내면 서버를 다시 띄우지 않아도 바로 보인다.
// 받는 사람 확인은 부르는 쪽(app/api/house-shell)이 먼저 한다. 걷기 세계로 바꾸는 일은 lib/shell-world.ts.

/**
 * 실측 지도를 여는 계정 목록: 서버 환경 변수 HOUSE_SHELL_USERS(로그인 id, 쉼표·띄어쓰기로 나눔).
 * 처음에는 집주인 한 사람만 연다(관리자라고 다 열리지 않는다). 목록이 비면 아무도 못 연다(미리보기 제외)
 */
export function shellUsers(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set((env.HOUSE_SHELL_USERS ?? '').split(/[\s,]+/).filter(Boolean));
}

/** 실측 지도를 받는 사람: 목록에 있는 관리자, 또는 이 컴퓨터 미리보기 */
export function shellAllowed(o: { role: Role; sub: string | null; preview: boolean; users: ReadonlySet<string> }): boolean {
  if (o.preview) return true;
  return o.role === 'admin' && typeof o.sub === 'string' && o.sub.length > 0 && o.users.has(o.sub);
}

export { loopbackHost } from '@/lib/preview';

/** 이 서버에 실측 지도 데이터가 설정돼 있나(지도 고르기를 보일지). 파일은 읽지 않고 설정만 본다 */
export function shellConfigured(env: Record<string, string | undefined> = process.env): boolean {
  if ((env.HOUSE_SHELL_GZ ?? '').trim()) return true;
  return localPreview(env) && Boolean((env.HOUSE_SHELL_FILE ?? '').trim());
}

/** 풀어 낸 JSON의 상한(바이트). 깨지거나 엉뚱한 값이 서버 메모리를 다 먹지 않게 */
const MAX_BYTES = 4 * 1024 * 1024;

/** 파일 시스템에서 쓰는 만큼만(시험에서 「건드리지 않았다」를 볼 수 있게) */
export type ShellDisk = {
  lstat: (file: string) => Promise<{ isFile: () => boolean; size: number }>;
  readFile: (file: string) => Promise<Uint8Array>;
};

// 파일 읽기 모듈은 미리보기일 때에만, 묶는 도구가 따라오지 않게 불러온다(갤러리 미리보기와 같은 까닭)
async function nodeDisk(): Promise<ShellDisk> {
  const fs = await import(/* webpackIgnore: true */ 'node:fs/promises');
  return { lstat: (file) => fs.lstat(file), readFile: (file) => fs.readFile(file) };
}

/** gzip이면 풀고(상한까지), 아니면 그대로 JSON으로 읽는다. 못 읽으면 null */
function decode(buf: Uint8Array): unknown {
  try {
    const gz = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
    const raw = gz ? gunzipSync(buf, { maxOutputLength: MAX_BYTES }) : Buffer.from(buf);
    if (raw.length > MAX_BYTES) return null;
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

// 같은 환경 변수 값이면 바꾼 결과도 같으므로 서버 프로세스마다 한 번만 바꾼다
let cache: { raw: string; out: HouseWorld | null } | null = null;

/**
 * 실측 지도 세계. 환경 변수가 먼저, 없으면(미리보기에서만) 파일. 없거나 깨졌으면 null(라우트가 404로 숨긴다)
 */
export async function shellHouse(env: Record<string, string | undefined> = process.env, disk?: ShellDisk): Promise<HouseWorld | null> {
  const raw = (env.HOUSE_SHELL_GZ ?? '').trim();
  if (raw) {
    if (cache?.raw === raw) return cache.out;
    const out = shellToWorld(decode(Buffer.from(raw, 'base64')));
    cache = { raw, out };
    return out;
  }
  if (!localPreview(env)) return null;
  const file = (env.HOUSE_SHELL_FILE ?? '').trim();
  if (!file) return null;
  const d = disk ?? (await nodeDisk());
  try {
    const st = await d.lstat(file);
    // 진짜 파일만(바로가기는 다른 곳을 가리킬 수 있다), 너무 큰 것은 읽지 않는다
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    return shellToWorld(decode(await d.readFile(file)));
  } catch {
    return null;
  }
}
