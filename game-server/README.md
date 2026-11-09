# joyeondang-game: 함께 걷기 서버

걷기 화면에서 같은 공간(집 또는 방 하나)에 있는 손님들이 서로의 캐릭터·이름표·말풍선을 보게 하는 작은 서버다.
Cloudflare Worker 하나와 Durable Object 클래스 `Space` 하나로 되어 있고, 공간마다 DO가 하나씩 생긴다(`idFromName(space)`).
Next 사이트와는 따로 묶고 따로 배포한다(루트 tsconfig·eslint에서 이 폴더를 뺐다).

| 파일 | 하는 일 |
|---|---|
| `src/index.ts` | 문지기: `GET /connect?space=&token=` WebSocket 업그레이드만. Origin(`ALLOWED_ORIGINS`), 공간 이름(`house:real`, `room:[a-z0-9-]{2,32}`), 출입증을 보고 DO로 넘긴다. `/health`는 `ok` |
| `src/space.ts` | DO. WebSocket Hibernation API(`ctx.acceptWebSocket`, 사람 정보는 `serializeAttachment`). 60명까지, 같은 사람이 다시 들어오면 앞 연결을 닫는다 |
| `src/protocol.ts` | 짧은 키 JSON 규약과 값 검사. 사이트 쪽 짝은 `src/walk/net.ts` |
| `src/token.ts` | 출입증 확인(WebCrypto HMAC-SHA256, 시간 일정 비교). 서명은 사이트 `src/lib/game-token.ts` |
| `test/smoke.mjs` | 로컬 연기 시험(두 손님 흉내, 거절, 속도 제한, 61번째 full) |

위치·말은 저장소에 쓰지 않는다. 연결이 끊기면 사라진다.

## 출입증
사이트 `GET /api/game-token`(손님 이상만, 아니면 404)이 `{ token, url, exp }`를 준다.
`token = base64url(JSON {sub, name, color, role, exp}) + '.' + base64url(HMAC-SHA256(GAME_TOKEN_SECRET, 앞부분 글자))`, `exp`는 유닉스 초, 10분.
`sub`는 로그인 id를 서명 키로 한 번 감춘 값이라 이 서버는 실제 계정 id를 모른다. 다른 사람에게는 연결마다 새로 만든 짧은 id만 보인다.

## 로컬에서 띄우기
```bash
cd game-server
npm install
npx tsc --noEmit
npx wrangler dev --port 8788      # 로그인 없이 로컬로만 돈다
```
`.dev.vars`(커밋 안 함, `.gitignore`에 있음)에 시험값을 둔다.
```
GAME_TOKEN_SECRET=<아무 긴 시험 문자열, 32자 이상 권장>
ALLOWED_ORIGINS=http://localhost:3331,http://127.0.0.1:3331,http://localhost:3334
```
이 맥은 8787 포트를 다른 로컬 서비스가 쓰고 있어 8788 이후를 쓴다.

연기 시험(비밀값은 환경 변수로만 넘기고 화면에 찍지 않는다):
```bash
set -a; . ./.dev.vars; set +a
SMOKE_URL=http://127.0.0.1:8788 node test/smoke.mjs
```
사이트와 같이 보려면 Next에 `GAME_SERVER_URL=ws://127.0.0.1:8788`, `GAME_TOKEN_SECRET=<.dev.vars와 같은 값>`, `JY_LOCAL_PREVIEW=1`을 준다.
로컬 미리보기에서는 창마다 다른 손님으로 출입증이 나온다.

## 배포(사람이 한 번)
1. `npx wrangler login` (Cloudflare 계정, 무료 요금제로 충분)
2. `npx wrangler deploy` → 주소가 `https://joyeondang-game.<계정 하위 도메인>.workers.dev`로 나온다
3. `npx wrangler secret put GAME_TOKEN_SECRET` (긴 무작위 값, 예: `openssl rand -base64 48`)
4. 걷기 화면 주소가 바뀌면 `wrangler.jsonc`의 `ALLOWED_ORIGINS`를 고치고 다시 배포
5. Vercel 환경 변수: `GAME_SERVER_URL=wss://joyeondang-game.<계정 하위 도메인>.workers.dev`, `GAME_TOKEN_SECRET=<3과 같은 값>`(Production에만)
6. 확인: `curl https://…workers.dev/health` → `ok`, 두 브라우저로 손님 로그인 뒤 서로 보이는지

`migrations`의 `v1`(`new_sqlite_classes: ["Space"]`)은 이미 배포한 뒤에는 고치지 않는다. 클래스를 바꾸면 새 태그를 더한다.
로그(observability)는 꺼 두었다. 요청 주소에 출입증이 들어 있어서다. 켜야 하면 짧게 켜고 끈다.

## 비용 메모(2026-11 기준, Cloudflare 문서)
- 무료 요금제는 SQLite 백엔드 DO만 된다. 그래서 `new_sqlite_classes`.
- 요청: 하루 100,000. WebSocket 연결 1번 = 1요청, 받은 메시지는 20개 = 1요청, 보내는 메시지는 무료.
  한 사람이 걸으며 초당 8번 보내면 시간당 약 1,440요청, 가만히 있으면(3초마다) 시간당 60요청.
  손님 10명이 하루 2시간씩 계속 걸어도 약 29,000요청.
- 시간: 하루 13,000 GB-s(DO 하나를 128MB로 셈 → 약 28시간). 사람이 있는 동안 3초마다 상태가 와서 DO가 깨어 있으므로
  사람이 있는 공간 하나가 하루 종일 차 있으면 약 10,800 GB-s. 집과 방 몇 곳에 동시에 하루 종일 사람이 있지 않는 한 무료 범위.
- 넘으면 무료 요금제는 그날(UTC 0시까지) 연결이 실패하고, 걷기 화면은 혼자 걷기로 돌아간다(오류 없이).
- 저장소는 거의 쓰지 않는다(위치·말을 저장하지 않음).
