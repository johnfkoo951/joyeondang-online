# 그리기 일꾼 (worker/avatar)

운영 사이트(Vercel)는 사진을 받아 비공개 버킷에 올리고 작업을 `queued`로 남길 뿐이다. 그림은 Mac Studio의 이 일꾼이
그 맥의 구독 프록시(localhost에서만 열림)로 그린다. 프록시는 인터넷에 열지 않는다(바깥으로 나가는 연결만).

## 흐름
1. `POST /api/avatar` → 검사(명단 손님, 동의, 크기·형식, 하루 상한) → 원본 `avatars/<uid>/originals/<id>.<ext>` → `avatar_enqueue` → `202 {id}`
2. 화면은 `GET /api/avatar/status?id=<id>`를 3초마다 묻는다 → `{status: queued|drawing|ready|rejected|failed, url?, message?}`
3. 일꾼: `avatar_claim`(for update skip locked) → 원본 받기 → 사진 살피기(`gpt-6-luna`) → 그리기(`gpt-image-2.6-flare`, `/v1/images/edits`, 1024×1536 투명 PNG) → `<uid>/chars/<id>.png` → `avatar_settle('ready')`
   - 모델이 크기가 조금 다른 세로 그림을 돌려주면(예: 1064×1478) 투명한 1024×1536 판에 비율을 지켜 맞춰 올린다(좌우 가운데, 아래는 바닥에 붙임). 투명하지 않거나 가로로 긴 그림은 다시 그린다
4. 거절(여러 사람·사람 없음·애매함·내용 검사)은 원본을 지우고 `rejected`. 나이는 사진으로 판정하지 않는다(avatar-worker-8부터.
   올린 사람이 고른 나 또는 아이와 보호자 동의를 믿는다. 0025의 `avatar_child_ok`는 DB에 남아 있지만 일꾼은 묻지 않는다). 잠깐의 실패는 `avatar_release`로 1분·2분 뒤 다시, 세 번째 실패는 원본을 지우고 `failed`(하루 장수에 세지 않음)
5. 일꾼이 도중에 죽으면 임대(10분)가 끝난 뒤 다음 잡기가 줄로 되돌린다. 세 번 잡고도 끝나지 않으면 `failed`(timeout)
6. 1분마다 `avatar_worker_beat`. 10분 넘게 조용하면 화면이 「그림 일꾼이 쉬는 중이라 조금 늦어요」를 띄운다

프롬프트와 판정 규칙은 사이트와 같은 파일(`src/lib/avatar/prompt.ts`, `rules.ts`, `openai.ts`)을 그대로 가져온다. 바꿀 때는 그 파일만 고친다.

## 방향 그림 (걷기 화면에서 캐릭터가 보는 쪽에 맞는 그림)
캐릭터 그림은 한 장이라 3D 집 안에서 혼자 납작해 보인다. 그래서 다 그린 캐릭터 그림으로 같은 캐릭터의 다섯 방향(앞, 앞 비스듬, 옆, 뒤 비스듬, 뒤)을
한 번 더 그려 묶음 한 장으로 만든다. 걷기 엔진이 캐릭터가 보는 쪽과 카메라 자리에 맞는 칸을 고르고, 반대쪽은 좌우를 뒤집어 쓴다.
한 장 그리기(손님이 기다린다)가 먼저이고, 한 장 그리기가 30초쯤 없을 때만 한 건씩 한다(마이그레이션 0015의 `avatar_views_*` 함수).
결과를 보고 바로 다른 사진을 올리는 손님이 방향 그림 한 바퀴를 기다리지 않게 하려는 것이다.

1. `avatar_views_claim`: 지금 누군가 걷기에 쓰는 캐릭터(그 사람의 `profiles.look`이 가리키는 사진) 가운데 아직 방향 그림이 없는 가장 새것 하나.
   고르다 만 캐릭터와 지울 캐릭터에는 그리기 수를 쓰지 않는다. 다른 캐릭터로 바꿔 걸으면 그 캐릭터가 그때 줄에 선다.
   여러 방향 그림 안내를 보고 동의한 캐릭터(`views_consent_at`이 있는 것)만 그린다. 안내 전에 만든 옛 캐릭터는 0015 머리말의 채우기 한 줄을 정해 돌린 뒤에만 줄에 선다
2. 캐릭터 PNG 받기 → 그리기(`/v1/images/edits`, 가로 시트 1536×1024로 청함, 투명 바탕. 돌아오는 크기는 달라도 받는다)
3. 시트에서 사람 다섯을 찾아 한 명씩 자른다. 사람이 다섯이 아니거나, 두 줄이거나, 판의 가장자리에 닿아 잘렸거나(`sheet_edge`), 키가 15% 넘게 다르면 그 시트는 쓰지 않는다
4. 보는 쪽 가리기: 살갗 색이 머리의 어느 쪽에 몰렸는지로 먼저 가리고, 비전 모델(`gpt-6-luna`)에 그림마다 방향을 물어 확인한다
   - 순서 확인: 근거는 비전 모델이 본 방향 이름과, 살갗 몫이 다섯 그림에서 차례로 줄고 뒷모습에는 거의 없는 것 둘이다.
     비전이 다섯 방향을 다른 순서로 봤으면 그 순서로 바로잡아 쓴다(다시 그리지 않는다). 살갗 몫으로는 맞는데 비전이 다르다고 하면(둘이 어긋남),
     시트를 버리고 그 자리에서 한 번만 다시 그린다. 비전 답이 뒤죽박죽(같은 방향을 둘 봄)이고 살갗 몫으로도 안 맞을 때는,
     비전이 첫 그림을 앞, 끝 그림을 뒤라고 봤으면 앞·뒤 그림만으로 묶음을 만들고(`frontback`, 다시 그리지 않는다) 양 끝도 다르면 다시 그린다.
     비전 답이 없고 살갗 몫으로도 볼 수 없으면(머리를 민 캐릭터) 묶음을 만들지 않는다. 비전 모델에 닿지 못했으면 나중에 다시 한다
     (`vision_down`, 시트 실패로 세지 않는다). 비전 모델이 답했지만 쓸 수 없는 답(거절, 내용 검사, 모양이 다른 답)이면 같은 시트로는
     끝내 확인할 수 없으니 시트 실패로 센다(`vision_unusable`, 세 번째에 `failed`)
   - 옆모습의 방향이 둘 사이에 다르면 앞·뒤 그림만 쓴다(`views_mode = 'frontback'`). 다 쓰면 `'full'`
   - 살갗 몫이 앞 > 옆 > 뒤로 줄지 않으면(머리를 민 캐릭터처럼 머리 전체가 살갗 색) 살갗 색 판정을 쓰지 않고 비전 답만 따른다
   - 비스듬 그림은 옆모습과 같은 쪽으로 본다. 살갗 색 판정과 비전 답이 둘 다 반대라고 할 때만 그 그림을 따로 뒤집는다
5. 묶음 두 크기(1920×576, 1280×384 WebP)를 `<uid>/views/<id>.v1l.webp`, `.v1s.webp`로 올리고 `avatar_views_settle('ready')`.
   그사이 본인이 캐릭터를 지웠으면(settle이 false) 올린 묶음을 거둔다
6. 실패: 시트가 이상한 것은 2분, 4분 뒤 다시, 시트 실패로 세 번째는 `failed`. 내용 검사에 막히면 바로 `failed`(`blocked`).
   프록시·저장소가 안 되는 것은 그 캐릭터 탓이 아니라서 세 번째부터는 한 시간씩 쉬며 잡은 횟수 여덟 번까지 기다린다.
   두 가지는 따로 센다(DB의 `views_sheet_fails`와 `views_attempts`): 프록시가 멈춘 사이 쓴 횟수가 시트의 세 번을 깎지 않는다.
   묶음을 올린 뒤 `ready`로 적는 호출은 한 번 더 해 본다(적기 한 번 실패했다고 시트를 다시 그리지 않는다).
   실패가 이어지면 일꾼도 방향 그림을 1분에서 두 배씩(끝은 한 시간) 쉰다. 한 장 그리기는 쉬지 않는다

묶음의 모양(칸 순서, 키 95%, 발끝 1.4%, 가장자리 색 번짐과 옅은 알파)은 `src/lib/avatar/sheet.ts`가 정한다. 걷기 엔진과의 약속이라 바꿀 때는 엔진도 함께 본다.

- 그리기 수: 캐릭터마다 그림을 한 번 더 그린다(순서를 믿을 수 없으면 그 자리에서 한 번 더). 하루 그리기 수가 그만큼 는다.
  실패가 이어지는 드문 경우에는 시도마다 다시 그린다(시트가 이상한 실패는 세 번, 프록시·저장소 쪽 실패는 여덟 번의 시도까지).
  줄에 선 캐릭터가 여럿이면 차례로 그린다(한 건에 30~40초, 건 사이 30초 쉼). 동의한 때가 없는 옛 캐릭터는 줄에 서지 않는다
- 끄기: 일꾼 환경 변수 `AVATAR_VIEWS=0`(launchd plist의 `EnvironmentVariables`에 넣고 다시 띄운다). 이미 만든 묶음은 그대로 쓰인다.
  그림 어댑터(sharp)를 불러오지 못하면 방향 그림만 꺼진 채로 돈다(시작 로그의 `views: false`). 운영 DB에 0015가 아직 없으면
  `views error`, `views resting`을 남기며 한 시간에 한 번쯤만 다시 물어본다. 어느 쪽이든 한 장 그리기는 그대로 돈다
- `failed`가 된 캐릭터는 다시 잡지 않는다(걷기에서는 지금처럼 한 장 그림으로 보인다). 프록시가 오래 멈췄다가 돌아온 뒤 다시 그리게 하려면
  프록시 탓으로 굳은 줄만 고른다(내용 검사에 막힌 것과 시트가 거듭 이상했던 것은 다시 그려도 같다):
  ```sql
  update public.avatars
     set views_status = null, views_attempts = 0, views_sheet_fails = 0, views_not_before = null, views_reason = null
   where status = 'ready' and views_status = 'failed'
     and views_reason not in ('blocked', 'sheet_count', 'sheet_rows', 'sheet_edge', 'sheet_heights', 'sheet_wide',
                              'sheet_order', 'vision_unusable', 'bad_output', 'bad_char', 'bad_job');
  ```
- 보내는 것: 캐릭터 그림(사진이 아니다)을 그림 모델에, 그려진 시트를 줄인 JPEG를 비전 모델에 보낸다(잘 안 되면 몇 번 다시). 계정 id는 그대로 보내지 않는다.
  손님에게 보이는 동의 글(`src/lib/avatar/consent.ts`)과 개인정보 화면도 이렇게 적는다
- 남은 파일 치우기: 일꾼이 묶음을 올린 뒤 거두기 전에 멈추면 지운 캐릭터의 묶음 파일이 남을 수 있다. 한가할 때 한 시간에 한 번
  `supabase.mjs`의 청소(`sweepViewStrays`)를 부른다(그 청소가 있는 판에서만)

## 3D 모형 (걷기 화면에서 사진 캐릭터를 판 대신 입체로)
다 그린 캐릭터 그림 한 장으로 3D 모형(GLB 한 파일)을 만든다. 걷기 엔진은 모형 → 방향 그림 묶음 → 그림 한 장 차례로 쓴다.
3D 변환은 제공자 둘 가운데 하나가 한다(일꾼 환경 변수 `AVATAR_MODEL_PROVIDER`):
- `trellis`(기본, 지금 운영): 우리 컴퓨터(그래픽 카드가 있는 PC)의 3D 서비스(TRELLIS). 캐릭터 그림이 바깥으로 나가지 않는다.
  일꾼은 그 PC에 SSH 터널로만 닿는다(`AVATAR_MODEL_URL`, 기본 `http://127.0.0.1:17860`. 아래 「터널」). 아래 1~7번이 이 제공자의 흐름이다
- `meshy`: 바깥 3D 서비스(Meshy, 미국)의 API. 고른 캐릭터 그림 한 장을 보낸다(사진 원본은 보내지 않는다). 돈이 든다. 아래 「Meshy」

어느 쪽인지는 사이트의 동의 글, 3D 확인, 개인정보 화면이 알린다. 사이트(Vercel)의 `AVATAR_MODEL_PROVIDER`도 일꾼과 같은 값으로 둔다
(기본값이 사이트는 `meshy`(외부로 보낸다고 알리는 쪽), 일꾼은 `trellis`라서 둘 다 비워 두지 않는다).
마이그레이션 0016의 `avatar_model_*` 함수를 쓰고, 어떤 줄을 잡을지는 DB의 `avatar_model_claim`이 정한다:
0021부터는 사람이 ★로 보관한 그림 가운데 「3D 만들기」로 요청한 것만(손님·가족 한 번, 관리자 제한 없음, 실패한 요청은 세지 않는다).
걷기에 입은 캐릭터라서 저절로 만들지 않는다(0016은 입은 캐릭터를 모두 저절로 만들었다).
그것도 일꾼이 잡기에 넘기는 제공자(`p_via`, 이 판의 일꾼은 제 `AVATAR_MODEL_PROVIDER`를 넘긴다)로 요청한 줄만 준다:
Meshy로 보낸다고 알린 요청은 meshy 일꾼만, 우리 컴퓨터로 알린 요청은 trellis 일꾼만 잡는다(두 일꾼을 함께 돌려도 섞이지 않고,
Meshy로 고른 손님의 한 번뿐인 3D가 다른 곳의 결과로 쓰이지 않는다). 제공자를 넘기지 않는 옛 일꾼(avatar-worker-5까지)은 아무것도
받지 못한다. 그 제공자의 일꾼이 없으면 요청은 기다리기만 한다(화면은 몇 분 뒤 「늦어지고 있어요」로 바뀐다).
돈이 든 시도는 따로 센다: 바깥 3D 서비스가 작업을 만들면(작업 id를 받으면) 일꾼이 `avatar_model_job`으로 알리고, DB는 그 요청을 그 사람의
시도로 한 번 센다(손님·가족 두 번까지: 한 번, 못 만들면 한 번 더. 실패해도, 그림을 지워도 줄지 않는다). 작업을 만들기 전에 끝난 서비스 사정
(키·잔액·쉬는 중·하루 상한·연결 실패·만들기 전 거절)은 세지 않는다. 모두 합친 하루 3D 요청은 100까지(집주인 결정, 관리자는 셈 밖).
숫자는 0021의 `avatar_limits()` 한곳에 있다. Meshy 일꾼의 하루 만들기 상한(`MESHY_DAILY_MAX`, 기본 120)은 이보다 작게 두지 않는다
(아래 「Meshy」: 일꾼의 셈은 다시 만든 작업과 관리자의 요청까지 세므로, 작으면 DB가 받은 요청이 다음 날까지 기다린다). 둘은 함께 바꾼다. 다시 해도 같은 실패(`bad_char`, `bad_job`, Meshy의 `blocked`·`meshy_input`·`meshy_rejected`,
우리 컴퓨터의 `bad_input`)로 굳은 그림은 다시 요청을 받지 않는다(`model_blocked`).

1. 따로 도는 고리: 한 장 그리기·방향 그림과 다른 자원(그래픽 카드 PC)만 쓰므로 한 장 그리기를 늦추지 않게 따로 돈다.
   줄이 비었으면 15초마다 묻는다(사이트에서 3D 만들기를 요청하면 그만큼 안에 잡힌다)
2. 서비스가 꺼져 있으면 잡지 않는다: 잡기 전에 `GET /health`(모델을 다 불렀는가)를 본다. 닿지 않거나 불러오는 중이면 줄을 잡지 않고
   1분 뒤, 그 뒤로는 2분마다 다시 본다(잡은 횟수를 쓰지 않고 실패로 굳히지도 않는다). 꺼진 동안 `/health`는 2분에 한 번이라
   서비스가 돌아오면 2분 안에 알아채고 바로 잇는다(일하다 실패가 이어져 모형 고리가 쉬는 중이면 그 쉼이 끝난 뒤에 본다. 아래 7번).
   살아 있으면 1분 동안은 다시 묻지 않는다
3. `avatar_model_claim(일꾼, 임대, 제공자)`(0021): 이 일꾼의 제공자로 3D를 요청한 그림 가운데 아직 모형이 없는 것 하나를 요청한 차례로.
   요청한 때(`requested_at`)와 곳(`via`)을 함께 준다. 그 함수가 없는 DB(0021 전)에서는 어댑터(`supabase.mjs`의 `modelClaim`)가 제공자 없이
   0016의 잡기를 부른다: 지금 걷기에 쓰는 캐릭터 가운데 가장 새것을 저절로 주고 `requested_at`이 없다(trellis는 지금처럼 만들고,
   바깥 3D 서비스는 그런 줄을 보내지 않는다: 아래 「Meshy」)
4. 캐릭터 PNG 받기 → `POST /to3d?seed=<잡은 횟수>&compress=meshopt`(본문 PNG, 시간 제한 240초) → GLB
5. 확인(`src/lib/avatar/model.ts`의 `checkGlb`): GLB 머리, 1.5MB 이하, 걷기 엔진이 풀 수 있는 필수 확장만(meshopt, 정수 꼭짓점 등. Draco는 안 됨),
   삼각형 1만 이하(장면에 놓인 대로), 모양(키 0.8~1.25, 발이 원점 ±0.1, 바닥 가운데가 원점 ±0.25)
6. `<uid>/models/<id>.v1.glb`(`model/gltf-binary`)로 올리고 `avatar_model_settle('ready')`. 그사이 본인이 캐릭터를 지웠으면(settle이 false) 올린 모형을 거둔다
7. 실패:
   - 결과가 이상함(확인에 걸림, 서비스의 생성 실패 500, 너무 큰 답): 2분, 4분 뒤 다른 seed로 다시, 세 번째는 `failed`. DB가 따로 센다(`model_bad_fails`)
   - 서비스가 받지 않는 입력(400·422): 바로 `failed`
   - 서비스·터널·저장소가 안 됨(닿지 않음, 끊김, 502·503·504, 시간 넘김): 2분, 4분, 그 뒤로는 한 시간씩 쉬며 잡은 횟수 여덟 번까지.
     일하다 끊기면 다음 차례에 서비스부터 다시 본다(꺼져 있으면 위 2번처럼 잡지 않고 기다린다)
   - 실패가 이어지면 모형 고리가 1분에서 두 배씩(끝은 한 시간) 쉰다
   - 올리기와 ready로 적기는 한 번 더 해 본다(다 만든 모형을 버리지 않게)

- 한 건에 20~30초(터널 포함, 2026-11 측정). 서비스는 한 번에 한 건이라 요청이 몰리면 요청한 차례로 만든다
- 끄기: 일꾼 환경 변수 `AVATAR_MODELS=0`(plist의 `EnvironmentVariables`에 넣고 다시 띄운다). 이미 만든 모형은 그대로 쓰인다.
  운영 DB에 0016이 아직 없으면 `models error`, `models resting`을 남기며 가끔만 다시 물어본다. 한 장 그리기·방향 그림은 그대로 돈다.
  **돈을 실제로 멈추는 것은 이 일꾼의 `AVATAR_MODELS=0`이다**: 사이트의 `AVATAR_MODELS=0`은 단추와 라우트만 쉬고, DB 함수
  `avatar_model_request`는 로그인한 손님이 직접 부를 수 있다(한도는 DB가 지킨다)
- 운영 사이트에도 `AVATAR_MODELS=0`(Vercel 환경 변수)을 두면 없는 모형을 DB에 묻지 않고 `X-Avatar-Asset: none`으로 알려 걷기 화면이 다시 묻지 않는다(방향 그림은 `AVATAR_VIEWS=0`)
- `failed`가 된 모형: 실패한 요청은 셈에서 빠지므로 본인이 같은 그림(★)으로 「3D 만들기」를 다시 누르면 처음부터 다시 만든다
  (돈이 든 시도가 남았을 때. 다시 해도 같은 실패로 굳은 그림은 받지 않는다).
  3D 서비스를 고친 뒤 한꺼번에 다시 만들게 하려면 요청한 그림만, 그것도 지금 일꾼의 제공자로 동의한 요청만 고른다(요청하지 않은 그림은
  0021의 잡기가 잡지 않고, 다른 곳으로 동의한 요청은 meshy 일꾼이 `reconsent`로 돌려준다). 다시 해도 같은 실패와 `reconsent`는 빼고,
  작업을 만든 때는 비운다(되살린 요청의 작업을 만들면 새 시도로 센다). 되살린 요청은 다시 센다: 그사이 다른 그림을 요청한 사람은
  한도(한 번)를 넘게 되고, meshy면 한 건마다 크레딧이 든다:
  ```sql
  update public.avatars
     set model_status = null, model_attempts = 0, model_bad_fails = 0, model_not_before = null, model_reason = null, model_job_at = null
   where status = 'ready' and model_status = 'failed' and model_requested_at is not null
     and model_request_via = 'meshy'  -- 지금 일꾼의 AVATAR_MODEL_PROVIDER(trellis면 'trellis')
     and model_reason not in ('reconsent', 'bad_char', 'bad_job', 'blocked', 'meshy_input', 'meshy_rejected', 'bad_input');
  ```
- 제공자를 바꿀 때(사이트와 일꾼을 함께 `trellis` → `meshy` 등): 잡기는 일꾼의 제공자로 요청한 줄만 주므로, 옛 곳으로 요청하고 아직 잡히지 않은
  줄은 그곳의 일꾼이 없으면 기다리기만 한다. 바꾼 뒤 그 줄을 `reconsent`로 돌려준다(실패라 셈에서 빠지고, 화면이 새 확인 글로 다시 묻는다.
  작업을 이미 만든 줄(`model_job_at`)은 그 시도가 누적에 남는다):
  ```sql
  update public.avatars
     set model_status = 'failed', model_reason = 'reconsent', model_not_before = null
   where status = 'ready' and model_status is null and model_requested_at is not null
     and model_request_via = 'trellis';  -- 옛 제공자
  ```
- 남은 파일 치우기: 방향 그림과 같이 한가할 때 한 시간에 한 번 `sweepModelStrays`(지운 캐릭터의 남은 모형 파일)

### Meshy (바깥 3D 서비스, 돈이 든다)
`AVATAR_MODEL_PROVIDER=meshy`면 위 1~3번(따로 도는 고리, 잡기 전에 살피기, 잡기)과 5~6번(확인, 올리기·적기)은 같고, 만드는 자리와 실패 갈래가 다르다.
코드는 `meshy.mjs`(API와 돈 안전장치), `glb.mjs`(받은 GLB 다듬기).

**이 판(시작 줄의 `version`이 `avatar-worker-6` 이상, 지금 `avatar-worker-8`)의 일꾼으로만, 0021을 운영 DB에 올린 뒤에 켠다.** 내보내는 순서는 0021 머리말이 정본이다:
3D를 만드는 일꾼을 모두 이 판으로 바꾸거나 `AVATAR_MODELS=0`으로 띄운다 → 0021 → 일꾼을 다시 띄우고 plist마다 시작 줄의 `version`·`models`·`modelProvider`를
본다(업데이트 스크립트가 고쳐 쓰지 않는 plist도) → 사이트. **옛 일꾼 스냅숏(avatar-worker-4·5)에서 `AVATAR_MODEL_PROVIDER`만 `meshy`로 바꾸지 않는다**:
옛 판은 0021 전에는 걷기에 입은 캐릭터를 저절로 Meshy로 보내고, 판에 따라 돈이 든 시도를 DB에 알리지 않고(`avatar_model_job`) Meshy 사본도 지우지 않는다
(하루 상한 기본도 200이었다). 0021은 제공자를 넘기지 않는 옛 일꾼에게 줄을 주지 않으므로, 못 바꾼 일꾼이 남아도 0021 뒤에는 돈이 들지 않는다.
이 판은 사람이 요청한 그림만 보낸다: 잡은 줄에 요청한 때(`requested_at`, 0021의 잡기만 싣는다)가 없으면
그림을 받지도 보내지도 않고 그 줄을 바로 돌려놓은 뒤 3D 모형을 멈춘다(`model job was not requested`, `models halted until restart`.
잡은 횟수 하나는 쓴다). 0021 전의 잡기는 걷기에 입은 캐릭터를 저절로 주기 때문이다. 한 장 그리기·방향 그림은 그대로 돈다.
0021을 올린 뒤 일꾼을 다시 띄운다. 올렸는지는 0021 머리말의 확인(`avatar_model_claim(text, integer, text)`의 `'requested_at'`·`'via'`·`p_via`)으로 본다.
그것도 Meshy로 보낸다고 알리고 받은 요청만 보낸다: 0021의 잡기는 `via`(사람이 누를 때 확인 글이 알린 곳, 사이트가 적는다)가 `meshy`인 줄만
meshy 일꾼에게 준다. 일꾼도 한 번 더 본다: 잡은 줄의 `via`가 `meshy`가 아니면(제공자를 거르지 않는 잡기) 그림을 받지도 보내지도 않고
`failed`(`reconsent`)로 적는다. 작업을 만들지 않았으니 셈에서 빠지고, 화면이 새 확인 글로 다시 묻는다.

**같은 Meshy 키로는 meshy 일꾼 하나만 켠다.** Studio에서 일꾼을 여럿 띄우면 하나만 `AVATAR_MODEL_PROVIDER=meshy`로 두고 나머지는 `AVATAR_MODELS=0`
(한 장 그리기와 방향 그림만)으로 둔다. 일꾼은 키의 해시로 이름 지은 잠금 파일(`~/.joyeondang/meshy-locks/meshy-<해시>.lock`, 장부 자리와 상관없는
고정 자리)을 쥐고, 같은 키를 쓰는 둘째 프로세스(다른 일꾼, `--once`, 한 건 시험)는 `meshy key in use by another process: models off`를 남기고 3D만 끈다.
`MESHY_STATE_FILE`을 일꾼마다 따로 두어도 같다: 장부(이어 볼 작업, 지울 작업, 하루 셈)는 프로세스마다라 같은 키로 둘이 돌면
기다림·받기·올리기가 끊겨 돌려놓은 요청을 다른 일꾼이 잡아 새 유료 작업을 만들고, 만들기 요청이 끊긴 일꾼이 남의 작업을 제 것으로 삼아
남의 3D를 올린 뒤 지우고, 하루 상한도 일꾼 수만큼 늘어나기 때문이다. 다른 컴퓨터는 이 잠금이 보지 못하니 같은 키를 두 컴퓨터에서 쓰지 않는다.

켜기 전에 꼭 할 것:
1. Meshy 대시보드에서 이 키에 **월 크레딧 한도**를 둔다(하루 상한 120건 × 40크레딧이면 하루 최대 약 4,800. 한 달 한도는 그보다 좁게)
2. 학습 제외: Meshy 이용약관은 Enterprise가 아닌 고객의 입력과 결과를 학습과 개선에 쓸 수 있다고 적고, 지원 메일로 요청하면 빼 준다고 한다.
   API 계정으로 요청하고, 답을 받으면 여기에 적고 사이트(Vercel)에 `MESHY_TRAINING_OPTOUT=1`을 둔다. 그 전에는 동의 글·3D 확인·개인정보 화면이
   「Meshy 약관상 받은 그림이 학습에 쓰일 수 있고」라고 그대로 알린다(`src/lib/avatar/consent.ts`의 `meshyTraining`)
   기록: 2026-11-12 Meshy 지원팀이 이 API 계정을 학습 제외로 기록했다고 답했고, 2026-11-14 사이트에 `MESHY_TRAINING_OPTOUT=1`을 두었다
   (그 뒤 화면은 「Meshy에는 받은 그림을 학습에 쓰지 않도록 요청해 두었고」라고 알린다)
3. 사이트의 `AVATAR_MODEL_PROVIDER`도 `meshy`로(요청 줄의 `via`가 `meshy`가 되게)
4. 일꾼마다 시작 줄을 본다: meshy 일꾼 하나만 `models: true`, `modelProvider: "meshy"`, `meshy.key_lock: true`, 나머지는 `models: false`

1. 살피기(`ready`): 쉬는 중이 아니고, 오늘(KST) 보낸 만들기 요청이 `MESHY_DAILY_MAX` 아래이고, 잔액(`GET /openapi/v1/balance`, 크레딧을 쓰지 않는다)이
   한 건 값(40) 이상일 때만 줄을 잡는다. 잔액은 5분 동안 다시 묻지 않는다
2. 만들기 `POST /openapi/v1/image-to-3d`(`Authorization: Bearer <키>`). 그림은 data URI(`data:image/png;base64,…`)로 싣는다(바깥에 열린 주소를 만들지 않는다)

   | 이름 | 값 | 까닭 |
   |---|---|---|
   | `ai_model` | `meshy-7.1` | 만드는 모델. DB의 `model_maker`에도 이 이름을 적는다 |
   | `geometry_resolution` | `2k`(`MESHY_GEOMETRY=ultra`) | Ultra 형상(+5크레딧). `4k`도 값은 같지만 휴대폰용으로 다시 짜므로 `2k`로 넉넉하다. `standard`면 Ultra를 끈다 |
   | `should_texture`, `texture_resolution` | `true`, `2k` | 텍스처는 2K(가장 낮은 값). 이 맥에서 1024로 줄인다 |
   | `enable_pbr` | `false` | 기본색 한 장만(걷기 엔진은 텍스처 한 장만 쓴다) |
   | `should_remesh`, `topology`, `target_polycount` | `true`, `triangle`, `9000`(`MESHY_TARGET_POLYCOUNT`) | meshy-7.1은 기본이 다시 짜지 않는다. 삼각형으로 상한(1만) 아래에 바로 오게 |
   | `image_enhancement` | `false`(`MESHY_IMAGE_ENHANCEMENT=1`이면 `true`) | 고른 그림의 모습을 그대로(켜면 Meshy가 그림을 먼저 다듬는다) |
   | `target_formats` | `["glb"]` | 쓰는 것만(문서: 형식이 적으면 빨라질 수 있다) |

   보내지 않는 것: `remove_lighting`(Meshy 6 텍스처 모델에만 되고 다른 모델에 `true`면 400), `pose_mode`(자세를 바꾸지 않는다),
   `auto_size`(크기는 이 맥에서 맞춘다), `moderation`(그림은 이미 그리기 단계의 내용 검사를 지났다)
3. 묻기 `GET /openapi/v1/image-to-3d/<작업 id>`: 5초마다(`Retry-After`가 더 길면 그만큼, 끝은 1분), 한 번 잡았을 때 10분까지.
   끊김·429·5xx는 끝까지 다시 묻는다. 10분이 넘으면 줄을 돌려놓고, 다시 잡으면 새로 만들지 않고 그 작업을 이어 본다
4. 받기 `model_urls.glb`(`assets.meshy.ai`의 서명된 주소. 키를 싣지 않는다). Meshy는 결과를 길어야 3일 두므로 다 되면 바로 받는다
5. 다듬기(`glb.mjs`, 그래픽 카드 PC의 후처리와 같은 일): 조각 하나로 합치기(재질이 여럿이면 실패), 마디 변환 굽기, 정면 돌리기(`MESHY_YAW`),
   키 1.0·발이 원점·바닥 가운데가 원점, 삼각형이 1만을 넘으면 9,700으로 줄이기(meshoptimizer, 오차 한도를 조금씩 넓힌다),
   위치·법선·uv 밖의 값과 기본색 밖의 텍스처 버리기, 텍스처 1024 이하 JPEG(품질 85, 1MB를 넘으면 낮춘다), meshopt 압축.
   그 뒤의 확인(`checkGlb`)은 trellis와 같다
6. 임대는 20분(trellis 10분): 만들기·기다리기(10분)·받기·다듬기·올리기가 한 번에 들어가게

- 돈 안전장치
  - 결과 탓 실패(Meshy의 생성 실패·취소, 결과 없음·지워짐, 다듬지 못함, 확인에 걸림)는 새 작업으로 한 번만 다시 만들고 두 번째에 `failed`.
    Meshy가 FAILED로 끝낸 작업의 크레딧은 Meshy가 돌려준다
  - 작업을 만들면(작업 id를 받으면) 바로 DB에 알린다(`avatar_model_job`): 그 사람의 돈이 든 시도로 한 번 센다(같은 요청의 둘째 작업은 그대로).
    장부의 작업을 이어 볼 때도 다시 알린다(앞의 알림이 끊겼을 수 있다. DB는 요청마다 한 번만 센다). 알리지 못해도 만들기는 잇는다
  - 장부(`worker/avatar/state/meshy.json`, git에 들어가지 않는다. `MESHY_STATE_FILE`로 바꾼다): 그림 id → 만든 작업 id, 오늘 보낸 만들기 요청 수,
    Meshy에서 지울 작업. 기다리다 시간이 넘거나 받기가 끊기거나 일꾼이 멈춰 같은 그림을 다시 잡으면 그 작업을 이어 본다(60시간 안).
    결과가 이상하다고 판정된 뒤(DB의 `model_bad_fails`가 늘었다)에만 새로 만든다. 끝난 그림(ready·failed·지워짐)은 장부에서 뺀다
  - 키 하나에 클라이언트 하나(`keyLock`, 위): 키의 잠금 파일을 살아 있는 다른 프로세스가 쥐고 있으면 3D 모형을 끈다. 장부 옆 잠금 파일
    (`<장부>.lock`)도 같은 방식이다. 잠금에는 pid와 그 프로세스가 시작한 때를 적는다: 쥔 프로세스가 죽었거나, 컴퓨터를 다시 켠 뒤 같은 pid를
    다른 프로세스가 쓰면(잠금을 쓴 때가 켜기 전이거나 그 pid의 프로세스가 시작한 때가 다르면) 죽은 잠금으로 보고 넘겨받는다. 넘겨받기는 한 번에
    한 프로세스만(`<잠금>.takeover`), 그것도 죽었다고 본 내용 그대로일 때만 지운다(다시 켠 뒤 일꾼 여럿이 함께 떠도 둘이 함께 쥐지 않게).
    한 건 시험(`dry-run.mjs`)도 같은 키 잠금과 같은 장부를 쓴다(아래 「모형 한 건 시험」)
  - 만들기 요청이 답 없이 끊기면 다시 만들기 전에 목록(`GET /openapi/v1/image-to-3d?page_size=5&sort_by=-created_at`)에서 요청 뒤에 생긴,
    장부에 없는 작업을 찾아 그것을 쓴다(문서가 권하는 대로). 키 잠금을 쥐었을 때만 찾는다(같은 키를 이 프로세스 하나만 쓸 때만 그 작업이
    제 것이다). 그런 작업이 정확히 하나일 때만(둘 이상이면 다른 컴퓨터가 같은 키를 쓰는 등이라 고르지 않는다). 못 찾으면 줄을 돌려놓는다
  - 하루 상한 `MESHY_DAILY_MAX`(기본 120, KST 자정에 새로. 운영 값은 plist에서): 보내기 전에 센다(실패한 요청도 센다). 셈은 이 프로세스의 장부에
    있고 키 잠금으로 키 하나에 프로세스 하나라 곧 키마다의 셈이다(장부 파일을 바꾸면 하루 셈과 이어 보기가 새로 시작한다). 다 쓰면 줄을 잡지 않고
    하루 한 번 `meshy daily cap reached`를 남긴다. `0`이면 새로 만들지 않는다. 0021의 하루 3D 요청 상한(100)보다 작게 두지 않는다: 이 셈은 결과 탓으로
    다시 만든 작업과 관리자의 요청까지 세므로, 작으면 DB가 받은 요청이 다음 날까지 기다린다(그동안 화면은 몇 분 뒤 「늦어지고 있어요」로 바뀐다)
- Meshy 쪽 사본 지우기: 끝난 작업(다 받아 올림, 그만둠, 만드는 사이 본인이 지운 그림, 결과 탓으로 새로 만들어 바꾼 옛 작업,
  60시간 넘게 잇지 않은 작업)은 `DELETE /openapi/v1/image-to-3d/<작업 id>`로 지운다(보낸 그림과 만든 모형·자료를 영구히 지운다).
  도는 중(409)이거나 닿지 않으면 장부의 「지울 작업」에 남겨 다음 차례(살피기 때 1분에 한 번, 한 번에 다섯 건)에 다시 지운다.
  이미 없으면(404) 지운 것으로 본다. 15일 넘게 못 지운 것은 장부에서 뺀다(Meshy가 보관 기한에 이미 지웠다).
  받은 그대로의 GLB(다듬기 전)는 Meshy에서 지우기 전에 원본 에셋 보관 폴더에 쓴다(`processModel`의 `keepRaw`. 아래 「원본 에셋 남기기」,
  `AVATAR_ASSET_ARCHIVE_DIR`을 둘 때만)
  - 옛 판(avatar-worker-4)이 만든 Meshy 작업(2026-11 운영 시험의 관리자 모형 등)은 이 판의 장부에 없어 이 판이 지우지 않는다(DB 쪽은 `ready` 그대로
    셈 밖이라 괜찮다). Meshy가 보관 기한(API 결과는 길어야 3일, Studio 요금제 14일)에 지운다. 바로 지우려면 일꾼을 멈춘 뒤 목록
    (`GET /openapi/v1/image-to-3d?page_size=50&sort_by=-created_at`)에서 그 작업 id를 찾아 `DELETE /openapi/v1/image-to-3d/<작업 id>`로 지운다
    (지금 장부의 `tasks`·`trash`에 있는 작업은 일꾼이 지우니 건드리지 않는다)
  - 키가 안 됨(401), 크레딧 없음(402), 허용 IP·요금제 등(403), 잔액이 한 건 값보다 적음: 한 시간 쉬며 `meshy paused: …` 경고.
    쉬는 동안은 Meshy에 묻지 않는다. 모형 고리는 늘 하던 대로 `model service down: waiting`도 남긴다(한 장 그리기·방향 그림은 그대로 돈다)
  - Meshy 대시보드에서 키마다 월 크레딧 한도와 허용 IP를 둘 수 있다. 켜기 전에 키에 한도를 두기를 권한다
- 실패 갈래(서비스 쪽 사정으로 돌려놓는 간격은 trellis와 같다: 2분, 4분, 그 뒤로는 한 시간씩, 잡은 횟수 여덟 번까지)

  | 무엇 | 까닭(`model_reason`) | 어떻게 |
  |---|---|---|
  | 받지 않는 입력(400·422), 작업 FAILED `invalid_input`, 내용 검사(403) | `meshy_rejected`, `meshy_input`, `blocked` | 바로 `failed` |
  | 작업 FAILED(그 밖)·CANCELED, 결과 없음, 결과 주소 끝남, 너무 큼, 다듬지 못함, 확인에 걸림 | `meshy_failed`, `meshy_canceled`, `meshy_no_glb`, `meshy_expired`, `too_big`, `glb_*`, `bad_output` | 2분 뒤 새 작업으로 한 번 더, 두 번째에 `failed` |
  | 작업이 없어짐(묻기 404, 만든 지 2분이 넘음) | `meshy_task_gone` | 결과 탓과 같다(요청 하나에 새 작업은 두 건까지). 만든 지 2분 안의 404는 아직 보이지 않는 것이라 다시 묻는다 |
  | 10분 넘게 기다림, 받기 끊김, 바쁨(429) | `timeout`, `download_failed`, `meshy_busy` | 돌려놓는다. 다시 잡으면 장부의 작업을 이어 본다 |
  | 요청한 곳이 다름(`via`가 `meshy`가 아님) | `reconsent` | 그림을 받지도 보내지도 않고 바로 `failed`(셈에서 빠지고 화면이 다시 묻는다) |
  | Meshy가 안 됨(5xx·끊김), 키·크레딧(401·402·403), 쉬는 중, 하루 상한 | `service_down`, `meshy_auth`, `meshy_credits`, `meshy_forbidden`, `meshy_paused`, `daily_cap` | 돌려놓고, 모형 고리는 살피기(`ready`)부터 다시 |

- 값(크레딧, 2026-11 Meshy 가격표. API는 미리 산 크레딧으로 낸다): meshy-7.1 텍스처 2K 30 + Ultra 5 = **35**. 다시 짜기(remesh)는
  Image to 3D 가격표에 따로 적혀 있지 않다(따로 쓰는 Remesh API는 5) → 한 건 **35~40**. 결과 탓으로 한 번 더 만들면 그 두 배.
  잔액이 40보다 적으면 잡지 않는다. 하루 상한 120은 하루 최대 약 4,800이고, 대시보드의 키 한도(월)로 한 번 더 막는다
- 정면: Meshy 문서는 GLB의 정면 축을 적지 않는다. glTF 관례(+Z 정면)로 보고 돌리지 않는다. 처음 한 건을 아래 「모형 한 건 시험」으로 만들어
  `<출력>.meshy.glb`(받은 그대로)와 다듬은 GLB를 보고, 캐릭터가 뒤를 보면 `MESHY_YAW=180`(옆을 보면 90 또는 270)
- 되돌리기: `AVATAR_MODEL_PROVIDER`를 빼거나 `trellis`로 두고 다시 띄운다(사이트 값도 함께). 이미 만든 모형은 그대로 쓰인다

| 환경 변수 | 기본 | 뜻 |
|---|---|---|
| `AVATAR_MODEL_PROVIDER` | `trellis` | `meshy`면 이 절의 흐름. 모르는 값이면 3D 모형만 꺼진다 |
| `MESHY_API_KEY_FILE` | (없음) | 키 파일(`MESHY_API_KEY=…` 한 줄 또는 값 한 줄). 없거나 못 읽거나 값이 비면 3D 모형만 꺼진다 |
| `MESHY_GEOMETRY` | `ultra` | `standard`, `ultra`(=`2k`), `2k`, `4k` |
| `MESHY_TARGET_POLYCOUNT` | `9000` | 다시 짤 면(삼각형) 수, 100~300000 |
| `MESHY_DAILY_MAX` | `120` | 하루(KST) 만들기 요청 상한. 이 프로세스의 셈(키 잠금으로 곧 이 키의 셈). 0021의 하루 3D 요청 상한(100)보다 작게 두지 않는다 |
| `MESHY_YAW` | `0` | 다듬을 때 y축으로 돌리는 각도(도) |
| `MESHY_IMAGE_ENHANCEMENT` | 끔 | `1`이면 Meshy가 그림을 먼저 다듬는다 |
| `MESHY_STATE_FILE` | `worker/avatar/state/meshy.json` | 장부 파일. 키 잠금은 이 자리와 상관없이 키마다 하나다 |

- 키 파일: `worker/avatar/secrets/meshy.env`에 `MESHY_API_KEY=…` 한 줄, `chmod 600`(이 폴더는 git에 들어가지 않는다).
  키는 Meshy 개발자 화면의 API Keys에서 만든다(만들 때 한 번만 보인다). 일꾼은 키를 기록·오류·장부 어디에도 남기지 않고, 결과 파일을 받을 때도 싣지 않는다
- API는 Pro 이상 요금제에서 쓴다(무료 Starter는 안 된다). Pro는 초당 20번, 동시에 도는 작업 10개(일꾼은 한 번에 한 건)

#### 확인한 API 사실과 출처 (2026-11-12)
- Image to 3D(https://docs.meshy.ai/en/api/image-to-3d): 위 표의 이름과 값. `image_url`은 공개 주소나 base64 data URI(JPG·PNG·WebP, 20MB 이하),
  `ai_model`의 `latest`가 Meshy 7.1, `geometry_resolution`은 `standard|2k|4k`(`2k`·`4k`가 Ultra, meshy-7.1 필요), `should_remesh` 기본은 meshy-6-lite만 켬,
  `target_polycount`는 100~300000(다시 짤 때, 기본 30000, 어림값), 만들기 답은 `{"result": "<작업 id>"}`,
  상태는 `PENDING|IN_PROGRESS|SUCCEEDED|FAILED|CANCELED`, 결과는 `model_urls.glb`, 실패는 `task_error.type`(`invalid_input`, `timeout`,
  `service_unavailable`, `server_error`), 쓴 값은 `consumed_credits`(FAILED는 0)
- 가격(https://docs.meshy.ai/en/api/pricing): meshy-7.1 텍스처 없이 20, 텍스처 2K 30, Ultra(`2k`·`4k`) +5, 따로 쓰는 Remesh API 5
- 인증(https://docs.meshy.ai/en/api/authentication): `Authorization: Bearer <키>`, 키마다 월 크레딧 한도와 허용 IP
- 속도 제한(https://docs.meshy.ai/en/api/rate-limits): 초당 20번(묻기도 센다), 동시 작업 Pro 10. 넘으면 429(초당이면 `Retry-After`)
- 보관(https://docs.meshy.ai/en/api/asset-retention): API로 만든 결과는 길어야 3일. 주소는 서명돼 있고 작업의 `expires_at`에 끝난다
- 지우기(https://docs.meshy.ai/en/api/image-to-3d): `DELETE /openapi/v1/image-to-3d/<작업 id>`가 작업과 모형·자료를 영구히 지운다.
  끝난 작업과 실패한 작업을 지울 수 있고, 도는 중이면 409
- 학습(https://www.meshy.ai/terms-of-use): Enterprise가 아닌 고객의 입력과 결과를 학습과 개선에 쓸 수 있고, 요청하면 빼 준다고 적는다.
  API 소개 페이지의 자주 묻는 질문은 API 입력을 학습에 쓰지 않는다고 해서 자료끼리 엇갈린다. 학습 제외의 답을 받기 전에는 약관대로 알린다
  (2026-11-12 답을 받아 2026-11-14부터 학습 제외로 알린다. 위 「켜기 전에 꼭 할 것」 2)
- 오류(https://docs.meshy.ai/en/api/errors): 본문은 `{"message"}`. 401 키, 402 크레딧, 403 허용 IP·요금제·내용 검사 등, 429, 5xx는 물러났다 다시.
  FAILED 작업은 크레딧을 돌려준다. 만들기 요청이 끊겼으면 새로 만들기 전에 그 작업이 있는지 먼저 본다
- 잔액(https://docs.meshy.ai/en/api/balance): `GET /openapi/v1/balance` → `{"balance", …}`, 크레딧을 쓰지 않는다
- 요금제·묻는 간격(https://www.meshy.ai/tutorials/api-quickstart-image-to-3d): API는 Pro·Studio·Enterprise, 5초마다 묻기

### 모형 한 건 시험 (MBP)
```bash
AVATAR_MODEL_URL=http://127.0.0.1:7860 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs --model <캐릭터.png> <출력.glb>
AVATAR_MODEL_PROVIDER=meshy MESHY_API_KEY_FILE=worker/avatar/secrets/meshy.env \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs --model <캐릭터.png> <출력.glb>
```
DB·저장소는 가짜, 3D 서비스는 진짜로 일꾼과 같은 한 바퀴(`processModel`)를 돈다. 프록시 키는 쓰지 않는다. 서비스에 닿지 않으면 바로 알려 주고 멈춘다.
meshy는 진짜로 한 건을 만든다(크레딧 35~40). Meshy가 준 그대로의 GLB를 `<출력>.meshy.glb`로도 남긴다(정면 확인용).
일꾼과 같은 키 잠금과 같은 장부(`MESHY_STATE_FILE`, 기본 `worker/avatar/state/meshy.json`)를 쓴다: 이 컴퓨터에서 같은 키로 일꾼이 돌면 만들지 않고
멈추고(일꾼을 멈추거나 다른 키로), 만든 한 건은 그 장부의 하루 셈에 든다. 다른 컴퓨터의 일꾼은 이 잠금이 보지 못하니 그때는 다른 키를 쓴다.

### 터널 (Mac Studio → 그래픽 카드 PC)
3D 서비스는 그 PC의 `127.0.0.1:7860`에만 열려 있다(방화벽 포트를 열지 않는다). Studio의 일꾼은 SSH 터널로 닿는다:
`ssh -N -L 127.0.0.1:17860:127.0.0.1:7860 <그 PC의 SSH 호스트>`. 늘 열어 두려면 `work.cmdspace.joyeondang-model-tunnel.plist.template`을
쓴다(launchd가 끊기면 다시 연다).
1. Studio의 `~/.ssh/config`에 그 PC의 호스트 이름(예: `Host gpu-pc`)과 사용자, 비밀번호 없이 쓰는 키가 있어야 한다(launchd는 묻지 못한다).
   먼저 `ssh -o BatchMode=yes <호스트> exit`가 그냥 끝나는지 본다
2. 틀을 복사해 `__SSH__`(보통 `/usr/bin/ssh`), `__GPU_HOST__`, `__LOG_DIR__`를 채운다
3. `cp … ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/work.cmdspace.joyeondang-model-tunnel.plist`
4. 확인: `curl -s http://127.0.0.1:17860/health`(`"loaded":true`), 멈추기: `launchctl bootout gui/$(id -u)/work.cmdspace.joyeondang-model-tunnel`
- 터널이나 그 PC가 꺼져 있어도 일꾼은 멈추지 않는다: 모형만 위 2번처럼 기다리고, 돌아오면 이어서 만든다
- 터널은 이 맥의 루프백(127.0.0.1)에만 묶는다. 17860이 이미 쓰이면 ssh가 바로 끝나고(`ExitOnForwardFailure`) launchd가 30초 뒤 다시 해 본다

## 원본 에셋 남기기 (`assets.mjs`)
그림과 3D를 만들 때 생기는 중간 산출물(면 줄이기 전 GLB, 작업 기록, 다듬기 전후 수치 등)은 운영 저장소에 올리지 않고 버려 왔다.
일꾼 환경 변수 `AVATAR_ASSET_ARCHIVE_DIR`을 두면 그것을 이 맥의 보관 폴더에 캐릭터 id마다 모은다. 나중에 누구 캐릭터였는지,
어떤 모델로 얼마나 걸려 무엇을 만들었는지 알 수 있게 JSON 기록을 함께 둔다. 모아 가는 쪽(보관함의 수집 도구)이 이 폴더를 읽는다.

| 환경 변수 | 기본 | 뜻 |
|---|---|---|
| `AVATAR_ASSET_ARCHIVE_DIR` | (없음: 끔) | 보관 폴더의 절대 경로. 이 저장소 밖이어야 한다(안이거나 링크를 따라가 안이면 경고 뒤 끈다. 사람의 그림이 git 작업 폴더에 섞이지 않게). 없으면 만든다(700) |

```
<AVATAR_ASSET_ARCHIVE_DIR>/
  <캐릭터 id>/                 폴더 700, 파일 600. 임시 파일에 쓴 뒤 바꿔 끼운다(반쪽 파일을 읽지 않게)
    drawing.png                올린 캐릭터 그림(운영 저장소 chars/<id>.png와 같은 바이트, 1024×1536 투명 PNG)
    draw.json                  그림 단계 기록
    meshy-raw.glb              (meshy) Meshy가 준 그대로의 GLB: 면 줄이기·텍스처 다듬기 전. Meshy에서 지우기 전에 쓴다
    meshy-task.json            (meshy) 작업 기록: 시도마다(실패한 시도 포함) 하나씩
    tidy.json                  (meshy) 이 맥에서 다듬기 전후 수치
    trellis-stats.json         (trellis) 3D 서비스가 X-Avatar3D-Stats에 실은 수치
    model.glb                  운영에 올린 휴대폰용 GLB(운영 저장소 models/<id>.v1.glb와 같은 바이트)
```

- 모든 JSON은 `schema`(`joyeondang-avatar-assets@1`), `character_id`, `user_id`(사용자 id, 사람 이름은 없다. 명단과는 모아 가는 쪽이 잇는다)를 싣는다
- `draw.json`: `stage`(`drawing`), `written_at`, `worker`, `worker_version`, `attempt`(그리기 줄을 잡은 횟수), `vision_model`, `image_model`,
  `check`(판독 요약 `ok`, `person_count`, `photo_of_person`, `likely_under14`, `uncertain`), `seconds`(`download`, `check`, `draw`,
  `upload`(올리기와 ready로 적기), `total`), `image`(`width`, `height`, `fitted_from`: 모델이 준 크기가 달라 판에 맞췄으면 처음 크기 `"WxH"`),
  `usage`(그리기 모델의 토큰 수, 숫자 칸만), `file`(`name`, `bytes`, `sha256`)
- `meshy-task.json`: `provider`(`meshy`), `ai_model`, `settings`(보낸 설정: `ai_model`, `geometry_resolution`, `should_texture`, `texture_resolution`,
  `enable_pbr`, `should_remesh`, `topology`, `target_polycount`, `image_enhancement`, `target_formats`, `yaw`), `updated_at`,
  `attempts`(최근 20개): `at`, `worker`, `worker_version`, `attempt`(3D 줄을 잡은 횟수), `outcome`(`ready` | `retry` | `failed` | `late`),
  `reason`(실패 까닭, README 「Meshy」의 표), `task`(Meshy 작업 id, 만들기 전에 끝났으면 null), `resumed`(장부의 작업을 이어 봤는가), `polls`,
  `credits`(Meshy가 적은 쓴 크레딧), `seconds`(이 차례에 걸린 초), `meshy_times`(`created_at`, `started_at`, `finished_at`),
  `statuses`(상태가 바뀔 때마다 `at`, `status`, `progress`), `raw`(이 차례에 쓴 받은 그대로의 GLB: `name`, `task`, `bytes`, `sha256`, 없으면 null)
- `tidy.json`: `written_at`, `task`, `yaw`, `before`(`bytes`, `triangles`, `texture`: `width`, `height`, `type`), `after`(`bytes`, `triangles`,
  `texture`: `width`, `height`, `type`(`jpeg`), `jpeg_quality`), `simplified`(면을 줄였는가), `check`(올린 GLB의 확인: `bytes`, `triangles`,
  `height`, `images`), `file`(`model.glb`의 `name`, `bytes`, `sha256`)
- `trellis-stats.json`: `written_at`, `worker`, `worker_version`, `maker`, `attempt`, `service`(서비스 수치: `total_s`, `generate_s`, `bake_s`,
  `tris`, `bytes`, `seed`, `front_applied`, `front_iou`, `yaw_fix` 가운데 온 것), `check`, `file`
- 쓰는 때: 그림은 ready로 적은 뒤(거절·실패·그리는 사이 지운 것은 쓰지 않는다). 3D는 서비스를 부른 차례가 끝날 때마다(meshy는 실패한
  시도도 `meshy-task.json`에 남는다). 같은 캐릭터의 3D를 다시 만들면 `meshy-raw.glb`·`tidy.json`·`model.glb`는 새것으로 바뀌고,
  `meshy-task.json`의 `attempts`에 지난 시도가 남는다
- 남기지 않는 것: **원본 사진**(사진 원본은 운영 저장소에만), Meshy 키, 서명된 결과 주소(`model_urls` 등), 사진 살피기 답의 다른 말.
  기록은 정해 둔 칸만 모양을 보고 골라 쓴다
- 쓰기 실패(디스크 가득, 권한, 폴더가 사라짐)는 경고 한 줄(`asset archive: … not written`)만 남기고 그림·3D 만들기는 그대로 간다.
  디스크가 20초 넘게 답하지 않으면 기다리지 않고 넘어간다(쓰기는 뒤에서 마저 하고, 일꾼이 끝날 때 기다린다)
- 지운 캐릭터 따라 지우기: 3D를 만드는 사이 본인이 그림을 지웠으면(`model gone`) 그 캐릭터의 폴더를 바로 지운다. 그 뒤에 지운 캐릭터는
  일꾼이 한가할 때 한 시간에 한 번 DB에서 상태를 읽어(`avatars`의 `id`, `status`만) 지웠거나 거절·실패했거나 줄이 없는 캐릭터의 폴더를
  지운다. 폴더가 셋 이상인데 한 줄도 읽히지 않으면(다른 DB를 읽었을 수 있다) 아무것도 지우지 않고 경고한다. 캐릭터 id 모양이 아닌 것은 건드리지 않는다
- 켜기: Studio의 plist `EnvironmentVariables`에 `AVATAR_ASSET_ARCHIVE_DIR`(이 저장소 밖의 절대 경로)을 더하고 다시 띄운다. 시작 줄의 `assets: true`를 본다

## 파일
- `core.mjs`: 한 장 그리기의 한 바퀴(잡기 → 정리). DB·저장소·프록시·그림 어댑터를 바깥에서 받는다
- `views.mjs`: 방향 그림의 한 바퀴와, 언제 할지 정하는 차례(`createViewsTurn`)
- `models.mjs`: 3D 모형의 한 바퀴, 언제 할지 정하는 차례(`createModelsTurn`), 제공자 고르기(`modelProviderOf`), trellis 어댑터(`createModelService`)
- `meshy.mjs`: 제공자 meshy(Meshy API, 장부, 하루 상한, 쉬기), `glb.mjs`: 바깥 3D 서비스의 GLB를 걷기 엔진의 약속에 맞게 다듬기
  (gltf-transform·meshoptimizer·sharp)
- `proxy.mjs`: 프록시 호출과 키 파일 읽기, `supabase.mjs`: 운영 DB·저장소(비밀 키)
- `assets.mjs`: 원본 에셋 남기기(보관 폴더 고르기, 그림·3D 기록 쓰기, 지운 캐릭터 따라 지우기)
- `image.mjs`: 그림 읽고 쓰기와 크기 조절(sharp). 화소 계산은 `src/lib/avatar/sheet.ts`
- `worker.mjs`: 늘 도는 본체(`--once`는 한 바퀴만), `dry-run.mjs`: DB·저장소는 가짜, 프록시(또는 3D 서비스)는 진짜로 한 장 시험
- `work.cmdspace.joyeondang-avatar-worker.plist.template`: Mac Studio launchd 틀
- `work.cmdspace.joyeondang-model-tunnel.plist.template`: 그래픽 카드 PC로 가는 SSH 터널을 늘 열어 두는 launchd 틀

## 한 장 시험 (MBP)
```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs <사진> <출력.png>
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON worker/avatar/dry-run.mjs --views <캐릭터.png> <출력 접두어>
```
키는 `PROXY_API_KEY_FILE`(기본: llm-proxy의 `config/client-keys.local.env`의 `OPENAI_API_KEY` 줄)에서 읽고 출력하지 않는다.
`--views`는 방향 그림만 한 번 돌려 `<접두어>.v1l.webp`, `<접두어>.v1s.webp`와 모델이 그린 시트 `<접두어>.sheet.png`를 쓴다
(버리고 다시 그린 시트가 있었다면 `<접두어>.sheet-discarded.png`). 그림 모델을 바꿔 보려면 `AVATAR_IMAGE_MODEL`.

## Mac Studio에 올리기 (마이그레이션 0003을 운영 DB에 적용한 뒤. 방향 그림은 0015까지, 3D 모형은 0016까지, meshy는 0021까지)
1. 이 브랜치를 Studio에 받아 `npm ci` (node 22.18 이상: `.ts`를 그대로 가져온다. sharp는 next와 함께 들어온다)
2. `worker/avatar/secrets/supabase-secret.env`에 `SUPABASE_SECRET_KEY=…` 한 줄, `chmod 600`. 폴더는 git에 들어가지 않는다
3. 틀을 복사해 `__NODE__`, `__REPO_DIR__`, `__SUPABASE_URL__`, `__PROXY_KEY_FILE__`(Studio 프록시 키 파일)을 채우고 `mkdir -p worker/avatar/logs`.
   3D 모형을 Meshy로 만들려면 이 판으로 바꾸고 0021을 올린 뒤(0021 머리말의 「내보내는 순서」) `worker/avatar/secrets/meshy.env`
   (`MESHY_API_KEY=…`, `chmod 600`)를 두고 `EnvironmentVariables`에 `AVATAR_MODEL_PROVIDER`(`meshy`)와 `MESHY_API_KEY_FILE`을 더한다(틀의 주석,
   위 「Meshy」. 사이트 값도 같게). 일꾼을 여럿 띄우면 그 가운데 하나만 meshy로 두고 나머지 plist에는 `AVATAR_MODELS=0`을 둔다(같은 키로는 하나만 돈다).
   원본 에셋을 남기려면 틀의 `AVATAR_ASSET_ARCHIVE_DIR` 주석을 풀고 `__ASSET_ARCHIVE_DIR__`에 이 저장소 밖의 절대 경로를 채운다
   (위 「원본 에셋 남기기」)
4. 한 바퀴 시험: 같은 환경 변수로 `node … worker/avatar/worker.mjs --once` (할 일이 없으면 `start`·`stop`만 찍힌다.
   그릴 사진이 없고 방향 그림이 아직 없는 캐릭터가 있으면 그 방향 그림을 한 건 그린다. 그리지 않고 보려면 `AVATAR_VIEWS=0`을 붙인다.
   그 뒤 모형도 한 차례 돈다: 3D 서비스가 받을 수 있고(trellis는 터널, meshy는 잔액) 3D를 요청한 그림이 있으면 한 건 만든다.
   끄려면 `AVATAR_MODELS=0`. 시작 줄의 `version`(`avatar-worker-8`), `models: true`, `modelProvider`, `modelUrl`(trellis) 또는 `meshy`(설정)를 본다.
   meshy 일꾼이 돌고 있으면 같은 키의 `--once`는 `meshy key in use by another process: models off`를 남기고 3D를 건너뛴다)
5. `cp … ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/work.cmdspace.joyeondang-avatar-worker.plist`
6. 살피기: `tail -f worker/avatar/logs/worker.out.log`, 멈추기: `launchctl bootout gui/$(id -u)/work.cmdspace.joyeondang-avatar-worker`

운영 사이트의 끄기 스위치: Vercel 환경 변수 `AVATAR_ENABLED=0`(만들기 단추와 `/api/avatar/status`의 `enabled`가 false가 된다).
