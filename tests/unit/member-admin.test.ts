// 멤버 관리 파서(src/lib/member-admin.ts)와 관리실 서브페이지 권한 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';

const SRC = new URL('../../src/', import.meta.url);
type Next = (spec: string, ctx: unknown) => { url: string };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (h: { resolve: (spec: string, ctx: unknown, next: Next) => { url: string } }) => void;
};
registerHooks({
  resolve(spec, ctx, next) {
    const s = spec.startsWith('@/') ? new URL(spec.slice(2), SRC).href : spec;
    try {
      return next(s, ctx);
    } catch (e) {
      if (/^(\.|file:)/.test(s) && !/\.[cm]?[jt]sx?$/.test(s)) return next(`${s}.ts`, ctx);
      throw e;
    }
  },
});

const {
  cleanMemberEmail,
  cleanMemberNote,
  cleanMemberRole,
  cleanMemberSlot,
  parseBulkMembers,
} = await import('../../src/lib/member-admin.ts');

const src = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');

test('멤버 입력 정리: 이메일 소문자·공백 제거, 역할·회차·메모 범위 검증', () => {
  assert.equal(cleanMemberEmail('  Guest@Example.COM '), 'guest@example.com');
  assert.equal(cleanMemberEmail('not-an-email'), null);
  assert.equal(cleanMemberEmail(''), null);
  assert.equal(cleanMemberRole('family'), 'family');
  assert.equal(cleanMemberRole('admin'), 'guest', '입력값으로 admin 승격을 허용하지 않는다');
  assert.equal(cleanMemberSlot('15'), '15');
  assert.equal(cleanMemberSlot('online'), 'online');
  assert.equal(cleanMemberSlot('99'), null);
  assert.equal(cleanMemberNote('  반가운 손님\n메모  '), '반가운 손님 메모');
  assert.equal(cleanMemberNote('가'.repeat(250))?.length, 200);
});

test('여러 줄 일괄 등록 파서: 쉼표·탭 구분, 한글 역할·회차 인식, 잘못된 이메일·중복 줄 분리', () => {
  const input = [
    '# 주석 줄은 건너뛴다',
    '김하늘, Sky@Example.com, 손님, 15시, 대학 동기',
    '박바다\tsea@example.com\t가족\tfamily\t사촌',
    '이별빛',
    '잘못된이메일, broken-email, 손님',
    '중복이메일, sky@example.com, 손님',
  ].join('\n');

  const res = parseBulkMembers(input);
  assert.equal(res.valid.length, 3);
  assert.deepEqual(res.valid[0], {
    display_name: '김하늘',
    email: 'sky@example.com',
    role: 'guest',
    slot: '15',
    note: '대학 동기',
  });
  assert.deepEqual(res.valid[1], {
    display_name: '박바다',
    email: 'sea@example.com',
    role: 'family',
    slot: 'family',
    note: '사촌',
  });
  assert.deepEqual(res.valid[2], {
    display_name: '이별빛',
    email: null,
    role: 'guest',
    slot: null,
    note: null,
  });
  assert.deepEqual(res.invalidLines, [5, 6]);
});

test('관리실 서브페이지와 콜라주 에셋: 모든 관리 화면은 admin 역할을 먼저 확인하고, 로그인·로그아웃이 머리줄에 드러난다', () => {
  for (const page of ['app/admin/page.tsx', 'app/admin/members/page.tsx', 'app/admin/records/page.tsx', 'app/admin/rooms/page.tsx']) {
    const code = src(page);
    assert.match(code, /viewer\.role !== 'admin'/, page);
    assert.match(code, /집주인만 들어올 수 있는 곳이에요/, page);
  }
  const chip = src('components/ViewerChip.tsx');
  assert.match(chip, /로그인/);
  assert.match(chip, /로그아웃/);
  assert.match(chip, /action="\/auth\/signout"/);

  const collage = new URL('../../public/web/collage/', import.meta.url);
  for (const asset of [
    'collage-house-poster-v2.webp',
    'cutout-walk-v2.webp',
    'cutout-stamp-v2.webp',
    'cutout-games-v2.webp',
    'cutout-guestbook-v2.webp',
    'cutout-exhibit-v2.webp',
    'cutout-character-v2.webp',
    'edge-tl-v2.webp',
    'edge-tr-v2.webp',
    'edge-bl-v2.webp',
    'edge-br-v2.webp',
  ]) {
    assert.ok(existsSync(new URL(asset, collage)), asset);
  }
});
