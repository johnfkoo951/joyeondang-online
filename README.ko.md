# 조연당 온라인

[🇬🇧 English](README.md) · [🇰🇷 한국어](README.ko.md)

[![Code: MIT](https://img.shields.io/badge/code-MIT-134538)](LICENSE)
[![Content: CC BY-NC 4.0](https://img.shields.io/badge/content-CC%20BY--NC%204.0-E985A2)](LICENSE-content)
[![Site](https://img.shields.io/badge/walk%20the%20house-joyeondang.cmdspace.work-134538)](https://joyeondang.cmdspace.work)

친구와 함께 걸어 다니는 작은 3D 집이에요. 한 가족이 손님을 맞으려고 지었어요. 방을 걷고, 작은 놀이를 하고, 캐릭터를 꾸미고, 사진을 찍고, 쪽지를 남겨요. 이 저장소는 **[joyeondang.cmdspace.work](https://joyeondang.cmdspace.work)** 의 코드예요.

## 무엇이 들어 있나

| 부분 | 자리 | 만든 도구 |
|---|---|---|
| 걷기 엔진: 1인칭·3인칭, 물리, 미니맵, 길 찾기, 방 장면 | `src/walk/` | three.js |
| 놀이, 하나하나가 지연 로딩되는 "카트리지" | `src/games/` | React, Canvas, Web Audio |
| 집, 방, 방 장면 데이터 | `src/content/` | TypeScript |
| 사이트: 화면, 로그인, 쪽지, 갤러리, 캐릭터 만들기, 관리 | `src/app/`, `src/components/` | Next.js 16 (App Router, Cache Components), React 19 |
| 데이터와 권한 | `supabase/migrations/` | Supabase Postgres, 행 단위 보안(RLS) |
| 함께 걷기: 이름과 말풍선 | `game-server/` | Cloudflare Workers, Durable Objects |
| 사진 캐릭터 대기열과 일꾼 | `worker/avatar/` | Node, OpenAI 호환 이미지 API |

[ARCHITECTURE.md](ARCHITECTURE.md)에 부분들이 어떻게 맞물리는지, 놀이·방·캐릭터 규약을 적었어요.

## 바로 해 보기

Node 22가 필요해요.

```bash
npm ci
npm run dev        # http://localhost:3000/walk
npm test           # 단위 시험과 SQL 시험(PGlite 메모리 Postgres)
npm run verify     # 개인정보 검사 다음 운영 빌드
```

키가 하나도 없어도 사이트가 열리고, 다시 그린 집은 누구나 걸을 수 있어요. 로그인, 쪽지, 손님 명단, 함께 걷기, 사진 캐릭터는 아래 서비스가 있어야 해요.

## 내 집으로 배포하기

1. **Supabase**: 프로젝트를 만들고 `supabase/migrations/*.sql`을 순서대로 실행하고, 구글 로그인을 켜고, 주소와 공개 키를 `.env.local`에 넣어요(`.env.example` 참고).
2. **Vercel** 같은 Next.js 호스트: 같은 변수를 넣어요. 서버 전용이고 선택: `SUPABASE_SECRET_KEY`, `HOUSE_WORLD_GZ`(초대 손님에게만 보이는 실제 크기의 집), `FAMILY_ROOMS_JSON`(방 문 이름표).
3. **게임 서버**(선택): `game-server/`에서 `npx wrangler secret put GAME_TOKEN_SECRET`, `wrangler.jsonc`에 `ALLOWED_ORIGINS`와 내 도메인 경로를 넣고 `npx wrangler deploy`. 사이트에는 `GAME_SERVER_URL`과 같은 `GAME_TOKEN_SECRET`을 넣어요.
4. **사진 캐릭터**(선택): [worker/avatar/README.md](worker/avatar/README.md). `AVATAR_ENABLED=1`일 때만 켜져요. 캐릭터는 늘 다정하게 그려요.
5. **부엌 사진 갤러리**(실제 집에만): 이름표가 부엌인 구역의 빈 벽 구간에 빈 액자를 걸어요(`src/walk/gallery.ts`). 전시물은 비공개 저장소 버킷 `gallery`(`manifest.json`과 그림)에 두고 승인함에서 채워요. 손님은 짧게 쓰는 서명 주소로 받아요. `KITCHEN_GALLERY=1`일 때만 액자를 걸어요(꺼 둔 동안에도 승인함에서 미리 채울 수 있어요).

## 개인정보 검사

가족 사이트에는 절대 나가면 안 되는 것이 있어요. 이름, 장소, 실제 도면 같은 것이요. `npm run verify`가 소스와 빌드된 화면을 훑어서 걸리면 빌드를 멈춰요. 이 저장소에는 어느 집에나 쓰는 일반 규칙만 있어요(키 모양, 실측 치수, 방위, 자리 이름). 우리 가족만의 낱말은 git이 무시하는 `private/privacy-rules.mjs`에 넣어요. [private.example/](private.example/)에서 시작하면 돼요.

## 제안, 버그, 기여

- **아이디어와 버그**: 양식으로 [이슈](https://github.com/johnfkoo951/joyeondang-online/issues/new/choose)를 열거나 [토론](https://github.com/johnfkoo951/joyeondang-online/discussions)을 시작해요.
- **풀 리퀘스트는 지금 받지 않아요.** 코드는 가족이 써요. MIT 라이선스로 포크해서 마음껏 쓰셔도 돼요.
- **보안이나 개인정보 문제**: 비공개로 알려 주세요. [SECURITY.md](SECURITY.md)를 보세요.

[ROADMAP.md](ROADMAP.md) · [docs/how-it-grows.md](docs/how-it-grows.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 이 저장소가 갱신되는 방식

코드는 가족 데이터도 함께 있는 비공개 저장소에서 만들어요. 릴리스 때마다 도구가 비공개 부분을 뺀 나머지를 꺼내 개인정보와 비밀값을 검사하고, 키 없이 설치·시험·빌드한 뒤, 릴리스 설명과 함께 커밋 하나로 여기에 올려요. 그래서 이 저장소의 기록은 첫 공개 릴리스부터 시작하고, 커밋 하나가 릴리스 하나예요.

## 라이선스

- 코드: [MIT](LICENSE)
- `src/content/`와 `docs/`의 집 배치, 방 장면, 글과 그림: [CC BY-NC 4.0](LICENSE-content)

만든 사람 **Yohan Koo (CMDSPACE)** · [cmdspace.work](https://cmdspace.work)
