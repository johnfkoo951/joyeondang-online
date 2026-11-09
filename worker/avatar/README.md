# 그리기 일꾼 (worker/avatar)

운영 사이트(Vercel)는 사진을 받아 비공개 버킷에 올리고 작업을 `queued`로 남길 뿐이다. 그림은 Mac Studio의 이 일꾼이
그 맥의 구독 프록시(localhost에서만 열림)로 그린다. 프록시는 인터넷에 열지 않는다(바깥으로 나가는 연결만).

## 흐름
1. `POST /api/avatar` → 검사(명단 손님, 동의, 크기·형식, 하루 상한) → 원본 `avatars/<uid>/originals/<id>.<ext>` → `avatar_enqueue` → `202 {id}`
2. 화면은 `GET /api/avatar/status?id=<id>`를 3초마다 묻는다 → `{status: queued|drawing|ready|rejected|failed, url?, message?}`
3. 일꾼: `avatar_claim`(for update skip locked) → 원본 받기 → 사진 살피기(`gpt-6-luna`) → 그리기(`gpt-image-2.6-flare`, `/v1/images/edits`, 1024×1536 투명 PNG) → `<uid>/chars/<id>.png` → `avatar_settle('ready')`
4. 거절(아이로 보임·여러 사람·사람 없음·애매함·내용 검사)은 원본을 지우고 `rejected`. 잠깐의 실패는 `avatar_release`로 1분·2분 뒤 다시, 세 번째 실패는 원본을 지우고 `failed`(하루 3장에 세지 않음)
5. 일꾼이 도중에 죽으면 임대(10분)가 끝난 뒤 다음 잡기가 줄로 되돌린다. 세 번 잡고도 끝나지 않으면 `failed`(timeout)
6. 1분마다 `avatar_worker_beat`. 10분 넘게 조용하면 화면이 「그림 일꾼이 쉬는 중이라 조금 늦어요」를 띄운다

프롬프트와 판정 규칙은 사이트와 같은 파일(`src/lib/avatar/prompt.ts`, `rules.ts`, `openai.ts`)을 그대로 가져온다. 바꿀 때는 그 파일만 고친다.

## 파일
- `core.mjs`: 한 바퀴(잡기 → 정리). DB·저장소·프록시를 바깥에서 받는다
- `proxy.mjs`: 프록시 호출과 키 파일 읽기, `supabase.mjs`: 운영 DB·저장소(비밀 키)
- `worker.mjs`: 늘 도는 본체(`--once`는 한 바퀴만), `dry-run.mjs`: DB·저장소는 가짜, 프록시는 진짜로 한 장 시험
- `work.cmdspace.joyeondang-avatar-worker.plist.template`: Mac Studio launchd 틀

## 한 장 시험 (MBP)
```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs <사진> <출력.png>
```
키는 `PROXY_API_KEY_FILE`(기본: llm-proxy의 `config/client-keys.local.env`의 `OPENAI_API_KEY` 줄)에서 읽고 출력하지 않는다.

## Mac Studio에 올리기 (마이그레이션 0003을 운영 DB에 적용한 뒤)
1. 이 브랜치를 Studio에 받아 `npm ci` (node 22.18 이상: `.ts`를 그대로 가져온다)
2. `worker/avatar/secrets/supabase-secret.env`에 `SUPABASE_SECRET_KEY=…` 한 줄, `chmod 600`. 폴더는 git에 들어가지 않는다
3. 틀을 복사해 `__NODE__`, `__REPO_DIR__`, `__SUPABASE_URL__`, `__PROXY_KEY_FILE__`(Studio 프록시 키 파일)을 채우고 `mkdir -p worker/avatar/logs`
4. 한 바퀴 시험: 같은 환경 변수로 `node … worker/avatar/worker.mjs --once` (할 일이 없으면 `start`·`stop`만 찍힌다)
5. `cp … ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/work.cmdspace.joyeondang-avatar-worker.plist`
6. 살피기: `tail -f worker/avatar/logs/worker.out.log`, 멈추기: `launchctl bootout gui/$(id -u)/work.cmdspace.joyeondang-avatar-worker`

운영 사이트의 끄기 스위치: Vercel 환경 변수 `AVATAR_ENABLED=0`(만들기 단추와 `/api/avatar/status`의 `enabled`가 false가 된다).
