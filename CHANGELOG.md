# Changelog

## Unreleased · 2026-11-13
- 처음 만나는 환영 이젤은 집 그림·색연필 이름·파란 online과 한영 환영 인사로, 집 현판은 한자 서예·붉은 아호인으로 새로 조판했다. 판의 원래 비율·위치·충돌은 보존하고 기존 장면 소유 이미지 로더로 불러온다.
- 첫 화면 상단에 선택한 「서양 활자의 여백」 배너를 적용했다. 한자 서예와 자간 넓은 ONLINE, 붉은 아호인을 원본 3:1 비율로 보존하고, 한지 바탕은 다크 모드에서도 유지한다. 공간 구슬·메뉴·전시 구성은 그대로다. 화면 읽기용 제목은 한국어·영어를 따른다.

## v0.9.0 (words-and-light) · 2026-11-13
- **빛이 드는 방 → 「글과 빛이 드는 곳」**: 한지 질감의 미색 벽, 창 하나(옆 창 제거), 창으로 비스듬히 드는 빛줄기(`lightShaft`). 방 안 물건이 놀이의 입구가 된다: 책장 위 시집(`poetryShelf`) → 문장의 주인을 찾아라, 벼루와 붓이 놓인 서안(`inkWritingDesk`) → 글씨의 주인을 찾아라. 문장 걸어 두기는 그대로.
- **문장의 주인을 찾아라 (`poetry`)**: 받은 문항 26개(구절 20, 직접 채울 자리 6) 가운데 6문항을 매번 섞어 내고, 시인 낙관 넷 중 하나를 고른다. 맞히면 빛이 카드 위로 옮겨 오며 제목·연도·시인 소개, 틀리면 낙관이 찍히지 않는다. 끝에 「오늘 당신에게 온 문장」과 이 기기 문장 수집함·텍스트 내려받기. 리더보드 점수 있음.
- **글씨의 주인을 찾아라 (`calligraphy`)**: 恒常心 세 칸(아래 한글 음). 펜·손가락 필압, 마우스는 속도로 굵기. 흔들리는 원 겹치기·가장자리 흐림·획 끝 비백. 칸마다 보이지 않는 마스크로 체본 60% 이상·바깥 먹 30% 이하이면 완성, 붉은 낙관 → 向上心에서 恒常心으로 번져 바뀌고 마무리 문장, 내 글씨 PNG 내려받기. 점수 없음(도장만).
- **창가에서 수채 그림그리기 (`watercolor`)**: 거실 창가 이젤(다시 그린 집·손질한 실제 집 모두 같은 규칙으로 창 앞 빈자리에 놓는다). 물감 여섯·붓 크기·물의 양, 되돌리기, PNG 내려받기, 내려받지 않고 나가면 한 번 알림. 점수 없음.
- 단독 주소 `/games/poetry`·`/games/calligraphy`·`/games/watercolor`(`/play/…`), 놀이 모음 12종. 점수 없는 놀이에는 빈 순위표를 보이지 않는다. 다시 그린 집 거실의 책장을 왼쪽 뒤 구석으로 옮기고 오른쪽 뒤 구석에 창을 냈다.

## v0.8.0 (sword-continent & standalone-arcade & room-shells) · 2026-11-13
- **아홉 번째 놀이 「소드 콘티넌트」 탑재 및 GitHub 실시간 동기화 (`src/games/sword`, `/api/sword-continent`)**: 좋아하는 것 방(`toybox`)에 황금 대검과 4대 왕국 크리스탈 아케이드 스테이션(`swordArcade`)을 설치하고, 공개 GitHub 레포(`johnfkoo951/sword-continent`)의 최신 HEAD(레포 내 HTML 또는 `README.md` 최신 배포 링크)를 서버가 자동 추적해 별도 재배포 없이 최신 버전을 반영. 실시간 진행도 브리지(`jy:sword-state`)로 방 도장 및 통합 리더보드 자동 기록 지원(`npm run sync:sword` CLI 동봉).
- **모든 미니게임·재즈 게임 외부 단독 실행 라우트 신설 (`/games/[slug]`, `/games/jazz`, `/play/[slug]`)**: 3D 집 안 걷기를 거치지 않고 외부 링크만으로 아홉 가지 놀이 각각(`/games/sword`, `/games/groove`, `/games/pitch`, `/games/jam`, `/games/target`, `/games/brain`, `/games/shelf`, `/games/sentences`, `/games/who`)과 재즈 3종 전용 스튜디오(`/games/jazz`), 짧은 별칭(`/play/...`)을 즉시 실행·공유하고 실시간 순위표를 함께 확인하도록 구성.
- **방별 전용 건축 마감 분리 (`ROOM_SHELLS` in `room-windows.ts`, `scene.ts`)**: 작업 차고(빈티지 노출 적벽돌·다크 차콜 에폭시 바닥·주차 베이 라인·12등 사각 블랙 트랙 스포트라이트·후면 필드 전개 카트), 생각 지도 방(딥 포레스트 그린 갤러리 월·차콜 옻칠 하단·브러시드 실버 몰딩·보조 터치 스크린 데스크), 재즈 방(미드나잇 인디고 클럽 월), 빛이 드는 방(한지 회벽·청자 비색 몰딩) 등 방마다 고유한 벽·바닥·천장·조명으로 전환.

## v0.7.0 (sit-title-mobile) · 2026-11-13
- **3D 캐릭터 앉은 자세**: 엉덩이에서만 꺾여 다리가 막대처럼 서고 발바닥이 앞을 보던 자세(땅에 박힌 것처럼 보였다)를, 무릎을 굽혀 발뒤꿈치가 바닥에 닿고 두 다리를 조금 벌리며 몸을 살짝 뒤로 기대는 자세로 바꿨다. 치마·한복은 자락째 앞으로 접어 무릎 꿇은 것처럼 보이지 않는다. 뼈대 없이 같은 꼭짓점 셰이더 하나로 한다.
- **칭호**: 캐릭터 꾸미기 창 맨 위에서 이름표 위에 뜨는 짧은 한 줄(20자)을 달고 뗀다. 겉모습에 실려 함께 걷는 사람 모두에게 보이고(게임 서버가 같은 검사로 받는다), 인형·사진을 바꾸거나 다른 화면에서 캐릭터를 골라도 남는다. 프로필의 겉모습 칸에 함께 저장된다(DB 변경 없음).
- **휴대폰 걷기 화면**: 왼쪽 위 장소 카드를 누르면 갈 수 있는 곳 목록(걸어가기·바로 가기)이 열린다(데스크탑은 G와 같은 목록). 살피기·들어가기·나가기 단추를 오른쪽 스틱 바로 위로 옮겨 오른손 엄지가 닿게 했다(가로 화면은 스틱 왼쪽 옆).

## v0.6.0 (english-app-shell) · 2026-11-13
- **영어 화면 전환(사이트 전체)**: 머리줄·모바일 메뉴·걷기 메뉴의 언어 칩(한국어 ↔ EN)으로 화면 말을 바꾼다. 처음 온 손님은 브라우저 언어로 고르고(한국어가 없으면 영어) 이 기기에 기억한다. 사람이 쓴 글(전시 원고, 방명록, 대화, 작품 제목)은 한국어 그대로 `lang="ko"`로 두고, 한국어 화면은 전과 같다.
- **홈 화면에 추가(앱처럼 쓰기)**: 매니페스트와 앱 아이콘, 기기별 안내 창(아이폰은 공유 단추, 안드로이드는 설치 창이나 브라우저 메뉴, 앱 안 브라우저는 바깥 브라우저로), 첫 화면 권유(닫으면 이 기기에서 다시 안 보임), 모바일 메뉴의 「앱처럼 쓰기」. 홈 화면 앱은 바로 집 안 걷기로 열린다.
- **아이폰 홈 화면 앱 로그인 이어받기 (`/app-link`, `0027_app_handoff.sql`)**: 사파리에서 로그인해 받은 여섯 글자 코드(5분 동안 한 번)를 앱에 넣으면 같은 계정으로 들어온다. 코드는 해시만 저장하고 표는 서버만 읽고 쓴다.
- **실측 1층 시험 지도(허용 목록의 관리자만)**: 벽·문·창·방만 지은 가벼운 걷기 세계와 지도 고르기(`/walk?map=shell`). 데이터는 서버 환경 변수에만 있고 저장소에는 없다. 휴대폰급 조건에서 지금 집보다 크게 가볍다.
- **함께 걷기의 뛰기·앉기**: 다른 사람의 점프와 앉은 자세가 내 화면에도 보인다(게임 서버 상태에 `j`·`st`, 옛 화면·옛 서버와 호환). Ctrl과 앉기 단추로 앉고, 모든 캐릭터 모양에 앉은 자세가 있다.
- **걷기 화면 보기 조작**: 전체 화면(F 키·단추), 대화 가리기(멘션은 그대로 보임).
- **반려묘 폴리**: 시선이 때때로 바뀌고, 「야옹」 말고도 츤데레 혼잣말이 나온다(한·영). 말풍선이 화면을 크게 덮던 문제를 고쳤다.
- **작은 놀이 수**: 첫 화면·빠른 이동·수첩·놀이 모음의 놀이 수 글자를 등록된 놀이 수(여덟)와 맞추고, 놀이가 늘면 시험이 알린다.
- **놀이 중 단축키**: 놀이 창이 떠 있으면 사이트 단축키(숫자·글자)가 놀이를 끊지 않는다.

## v0.5.4 (home-lettering-cta) · 2026-11-13
- **첫 화면 한지 행서·지산(紙散) 낙관 대표작 쇼케이스 (`CuratedMore.tsx`)**: 조연당의 글씨 중 지산 백문인이 찍힌 한지 행서 작품(`14-hanji-running-horizontal.webp`, 「바람을 닮은 행서」)과 `jisan-baiwen.webp` 인장 배지를 메인 화면에 화선지 배접 스타일로 배치하고, 다크 모드에서도 화선지 바탕(`--art-hanji-paper`)과 주홍 인장이 선명히 유지되도록 구현.
- **첫 화면 하단 4종 탐색 링크 책갈피 리디자인 (`MoreLinks.tsx`, `home.module.css`)**: 기존 `·` 구분 밑줄 한 줄 텍스트를 네 가지 안료 스파인(주홍·코발트·솔빛·주황)과 전용 엠블럼, 요약 배지, 원형 화살표 인터랙션을 갖춘 2×2 한지 책갈피 색인표로 전면 개편.

## v0.5.3 (garage-vehicles-v2) · 2026-11-13
- **작업 차고 3D 차량 모형 리빌드 (`ineos-grenadier-v1.glb`, `mercedes-cla45-v1.glb`)**: 그림자·반사광·해칭선이 없는 무광 스튜디오 레퍼런스를 새로 제작해 Meshy 7.1 + N1 네이티브 35K 토폴로지로 재생성. 강제 데시메이션과 고폴리곤 노멀맵 충돌로 생기던 차체 표면 왜곡을 없애고 루프랙 일체형 위성 안테나·옐로우 에어로 립·브레이크 캘리퍼 디테일을 선명하게 복원.

## v0.5.2 (landscape-daylight) · 2026-11-13
- Keep the sky outside scene tone mapping and add static procedural cloud banks to a clear blue gradient.
- Reduce mountain dominance and retain subtler rock washes with blue-green atmospheric separation.
- Add seeded near-garden shrubs, flower drifts, grasses, rocks, branching trees and middle-distance woodland clusters outside the supplied floor footprint.
- Use shared instanced geometry and half-density mobile budgets; preserve static rendering and scene-owned cleanup.
- Extend visual checks to sky, side ground and broad third-person views, with brightness, placement and lifecycle regression tests.

## Lettering exhibition · 2026-11-13
- Add “조연당의 글씨” at `/exhibit/lettering`: sixteen sign/calligraphy studies and two artist-seal impressions, with reading-direction and production-method notes.
- Link it from the exhibition index, house/works sections and home; support the walking overlay and its return navigation.
- Serve a 1.4 MB web-image set with responsive variants, intrinsic dimensions and lazy loading. Keep original exports, provenance and visual-test evidence out of deployments.
- Preserve a light paper substrate under transparent seals in dark mode. Add catalog, image-integrity and exact route-allowlist regression tests.

## v0.5.1 (header-ux) · 2026-11-13
- **상단 메뉴 레이아웃 전면 재설계 (`NavLinks`, `AccountPopover`, `MobileMenuDrawer`, `ViewerChip`)**: 데스크탑 3-Zone 단일 행 그리드(브랜드 · 핵심 메뉴 5종 + `더보기` 팝오버 · 원형 검색 아이콘 + 테마/글자 도구 + 단일 계정 드롭다운 캡슐)로 집주인 로그인 시 칩 줄바꿈과 로고 충돌, 검색 단추 찌그러짐을 해결. 모바일·태블릿(`<= 1040px`)에서는 깔끔한 1줄 상단 바와 한지 전체 메뉴 시트(`☰ 메뉴`)로 통합.

## v0.5.0 (rooms-v1) · 2026-11-13
- **일곱 개 방 세계관 확장 및 360° 창밖 풍경 디오라마 (`room-windows.ts`, `room-worlds.ts`)**: 생각 지도 방·작업 차고·재즈 방·빛이 드는 방·과녁 방·좋아하는 것 방·손님방 일곱 공간 모두 주인의 취향을 담은 입체 소품과 사각형 잘림 없는 360° 스카이돔 창밖 전망을 갖추도록 전면 확장.
- **시선(Gaze) 기반 3D 하이라이트 및 미니맵 연동 (`gaze.ts`, `minimap.ts`, `ExhibitModal`)**: 방 안에서 시선이 향하는 전시·놀이·리더보드 오브제에 바닥 비콘 링과 HUD 행동 단추(`E 전시 보기` / `E 리더보드`)가 켜지고 미니맵에 이중 고리로 표시되며, 한글 IME 조합에 안전한 실시간 검색 아카이브 모달을 지원.
- **생각 지도 방 & 이동식 작전 본부 3D 개러지 (`furnish-rooms.ts`, `room-exhibits.ts`)**: 서재에 지식관리 일러스트 갤러리·에세이 책상·강의 자산 아카이브 보드를 배치하고, 차고를 2베이 이동식 작전 본부(루프랙 위성 안테나 탑재 오프로더·퍼포먼스 쿠페 3D GLB, 구매 계획 변경 블루프린트 및 1:18 다이캐스트 전시대, 멀티디바이스 관제 벤치)로 확장.
- **재즈 리듬·청음 신작 2종 및 방·웹 통합 리더보드 (`groove`, `pitch`, `0026_game_leaderboards.sql`)**: 리듬게임천국 스타일 4막 `리듬 천국 재즈 스튜디오`와 15건반 로즈 합성기 기반 3단계 `재즈 이어 트레이닝`을 추가해 전체 놀이를 8종으로 넓히고, 방 안 스탠드·결과 카드·웹(`/games`, `/room/[slug]`)이 실시간 연동되는 통합 리더보드 구축.

## v0.4.0 (collage-unification) · 2026-11-13
- **도장 투어(`/map`) 미니멀 콜라주 포스터 리디자인**: 크림베이지(`#F4F0E6`) 한지 바탕 위에 찢은 색종이·오일파스텔로 그린 가로(16:9)·세로(9:16) 전용 도장 투어 맵(`stamp-rally-*-v2.webp`)을 제작하고, 구역별 크레용 구슬 핀(`CrayonOrb`)과 주인(朱印) 전각 인장(`CarvedSeal`), 점선 에디토리얼 시트로 전면 통일.
- **전체 웹 에셋 오일파스텔 콜라주(`web-v2`) 일원화**: 작은 놀이(`/games`), 방명록(`/guestbook`), 캐릭터(`/avatar`), 개별 방(`/room/[slug]`), 화보 갤러리(`/gallery`)에 남아 있던 기존 `v1` 수채 풍경화 에셋 6종을 모두 제거하고 신규 투명 누끼 콜라주 아트워크(`collage-{games,writing,character}-v2.webp`)와 포스터 헤더로 100% 교체.

## v0.3.3 (environment-v2 pilot) · 2026-11-13
- Replace finite photographic scenery cards with continuous volumetric terrain, a static sky dome and ink-toned rock shading.
- Add modern hillside gallery silhouettes, broad sculptural tree crowns and a contemporary stone light-sculpture; retain the supplied house geometry and navigation.
- Add abstract color-field art to existing framed surfaces.
- Integrate eight generated pilot furniture models, stable silhouette variants, scene-scoped shared loading and fallbacks at every eligible placement.
- Retain original lighting and shared materials while replacing geometry; cover late disposal, failures and concurrent placements with regression tests.
- Record expanded before/after camera turns and actual GLB renders separately from generation references. Remaining furniture categories are not part of this approved pilot.

## v0.3.2 (cream-beige-default) · 2026-11-13
- **크림베이지(`#F4F0E6`) 밝은 배경 디폴트 고정**: 기기 OS가 다크 모드여도 첫 방문 기본 화면은 늘 따뜻한 크림베이지(`#F4F0E6`, `data-theme="light"`)로 열리고, 사용자가 직접 `다크`를 선택했을 때만 어두운 테마로 전환되도록 변경. 2막 포스터 섹션에도 가장자리 콜라주 프레임 추가.

## v0.3.1 (theme-toggle) · 2026-11-13
- **라이트 / 다크 수동 선택 지원 (`ThemeToggle`, `lib/theme.ts`)**: 상단 머리줄과 3D 걷기 메뉴, 빠른 이동 명령 팔레트(`/`·`Cmd+K`), 단축키(`T`)에서 밝은 한지 도화지 테마(`라이트`)와 차분한 밤 조명 테마(`다크`)를 직접 고르고 기기에 기억시킬 수 있도록 추가. 크레용 구슬(`CrayonOrb`), 미니게임 덮개, 미니맵까지 실시간 연동.

## v0.3.0 (web-v2 · admin-suite) · 2026-11-12
- **미니멀 & 아티스틱 콜라주 메인 랜딩 (`/`) 전면 재설계**: 사각 상자 UI를 걷어내고 도화지 여백 위에 찢은 오일파스텔 색조각 프레임(`edge-*-v2.webp`)과 살아 있는 크레용 결 입체 구슬 6개(`CrayonOrb`)가 떠 있는 1막 오브제 무대, 컷아웃 집 포스터(`collage-house-poster-v2.webp`)와 점선 에디토리얼 행·얇은 알약 단추로 구성된 2막 포스터 스프레드, 구슬 문고리가 달린 6채의 작은 집(`cutout-*-v2.webp`) 3막으로 전면 개편.
- **로그인·로그아웃 가시성 강화 (`ViewerChip`, `/login`, `FrontDoor`, `WalkMenu`)**: 상단 머리줄 어디서나 로그인 상태(이름·역할)와 원클릭 `로그인` / `로그아웃` 단추가 선명하게 보이도록 개선하고, `/login` 페이지에 초대 코드 동시 입력칸과 현재 계정 상태 안내를 추가.
- **관리실 스위트 및 멤버 관리 페이지 신설 (`/admin`, `/admin/members`, `/admin/records`, `/admin/rooms`)**: 공통 `AdminNav` 탭 바와 운영 대시보드 KPI 보드를 도입하고, 멤버 검색·다중 필터·여러 명 일괄 붙여넣기 등록·역할/회차/이메일/관리자 메모 인라인 편집·제외 복구·CSV 내보내기를 갖춘 `/admin/members`, 전체 글 검색·공개 범위 변경·재게시를 지원하는 `/admin/records`, 공간 문패·조용 모드·현장 QR 운영실 `/admin/rooms`를 구축.

## v0.2.1 (env-v1) · 2026-11-12
- Integrate environment art with the web v0.2.0 release and current companion animation features without replacing either feature set.
- Exclude private generation sources and visual verification evidence from deployment uploads; retain the compact runtime assets.
- Add original generated landscape, botanical, ink-wash and woven-rug images to existing decorative surfaces with procedural fallbacks.
- Add compact textured chair and garden urn GLBs, bounded to existing furniture and flowerbed footprints.
- Refine gallery-style plaster, stone and bronze exterior finishes with thin coping and reveal details.
- Replace dense distant city blocks with a quiet low-rise hillside and layered forest, and add generated curved mountain and village backdrops.
- Preserve collision geometry, guest-gallery access, cutaway visibility, static batching and render-on-demand behavior.
- Release asynchronous image/model resources when scenes close; rebuild cached static shadows after model replacement on touch devices.
- Add generated-surface lifecycle, atlas sampling, model fitting and shallow-flowerbed regression tests.
- Establish versioned before/after multi-scene screenshots and Eagle asset filing for major design updates. Private capture evidence and generation receipts are not public release content.

## v0.2.0 (web-v1) · 2026-11-12
- **메인 랜딩 (`/`) 개편**: 저녁 마당과 세 아치 포치 수채 일러스트(`hero-house-v1`), 처마 현판, 석등 불빛 배지, 핵심 행동 버튼과 대표 일러스트 쇼케이스 카드 3종·보조 타일 5종·세 걸음 안내로 첫 화면 경험을 재구성.
- **13곳 전각 도장 투어 맵 (`/map`, `/room/[slug]`)**: 가로형(16:9)·세로형(9:16) 전용 일러스트 맵 위에 마당·1층·2층 13곳 핀과 구역별 전각 인장(`CarvedSeal`, 13종 문양) 배치. 방 방문·3D 살피기·미니게임 플레이 시 다녀옴 상태 연동, 도장 찍기 애니메이션 및 13곳 완주 인장첩 추가(정식 DB 도장 + 비로그인 체험 도장 지원).
- **작은 놀이 웹 아케이드 (`/games`, `@sheet/(..)games`)**: 6종의 미니게임을 갈래별로 모아 3D 걷기 없이 웹에서 바로 플레이하고 방 도장을 획득할 수 있는 허브 구축.
- **방명록·문장 스튜디오 (`/guestbook`, `@sheet/(..)guestbook`)**: 거실 방명록, 앞마당 소나무, 빛 드는 서재(문장+출처), 세 아치 포치, 포토존 5곳 통합 작성기와 글감 칩, 한글 IME 조합 중 실시간 갱신되는 한지 엽서 미리보기, 통합 읽기 벽 구현.
- **웹 3D 인형 커스터마이저 & 화보 갤러리 (`/avatar`, `/gallery`, `/notebook`)**: 누구나 꾸미고 걷기에 즉시 반영하는 `WebDollStudio`, 조연당 공간 그림 화보(`HouseLookbook`), 수첩 인형 배지 및 13곳 인장첩 추가.
- **전역 키보드·탐색 UX**: 상단 네비게이션 확장 및 `/`·`Cmd+K` 빠른 이동 명령 팔레트, 숫자·글자 단축키 추가.

## v0.1.0 · 2026-11-08 ~ 2026-11-12
- 초기 집 지도, 온라인 전시 7칸, 초대 명단·구글 로그인·수첩, 3D 집 안 걷기(`/walk`), 함께 걷기 실시간 서버, 방 포털과 미니게임 6종, AI 사진·3D 캐릭터 스튜디오, 반려동물 걸음 및 컨트롤 룸 구축.
