// 각 방 안의 상호작용 전시물(시선을 맞추고 E 또는 클릭으로 여는 상세 아카이브).
// 공개 번들에 들어가므로 가족 실명·동네·방위·모형 약호는 쓰지 않는다.

export type ExhibitCard = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  body: string;
  image?: string;
  tags?: string[];
  href?: string;
  hrefLabel?: string;
};

export type RoomExhibit = {
  id: string;
  room: string;
  kicker: string;
  title: string;
  lead: string;
  searchable?: boolean;
  cards: ExhibitCard[];
};

export const ROOM_EXHIBITS: Record<string, RoomExhibit> = {
  // ───────── 생각 지도 방 (구요한의 지식관리 · 지산 블로그 · 강의 자산)
  'mind-jisan': {
    id: 'mind-jisan',
    room: 'mind',
    kicker: 'JISAN ARCHIVE · 지산의 글과 개념',
    title: '지산(紙散) 에세이 & 핵심 개념 책상',
    lead: '종이 위에 흩뿌린 질문들이 연결되어 하나의 시스템이 되기까지 — 지산 블로그에 발행된 핵심 글과 개념 카드를 넘겨 읽어 보세요.',
    searchable: true,
    cards: [
      {
        id: 'jisan-harness-comm',
        badge: '하네스 7층 이론',
        title: '명령은 없다, 연결만 있다 — 소통으로 읽는 에이전트 하네스',
        subtitle: '루만의 세 선택(정보·발화·이해)과 소유로 가르는 일곱 책임 영역',
        body: '에이전틱 워크플로우는 지시와 복종이 아니라 다음 작업이 이어지게 만드는 소통의 연쇄입니다. 선언 원장·좌석·모델 서빙·워커·관측·표면을 책임 단위로 가르면 어디서 맥락이 끊기는지 선명하게 드러납니다.',
        image: '/rooms/pkm-conductor.webp',
        tags: ['Agent Harness', 'Luhmann', '소통이론'],
        href: 'https://jisan.cmdspace.work/posts/agent-harness-communication-1/',
        hrefLabel: '지산 블로그 원문 읽기',
      },
      {
        id: 'jisan-schema-harness',
        badge: '구조적 동치',
        title: 'Schema는 Harness다 — LLM Wiki와 CMDS의 만남',
        subtitle: '원본 보존(Raw) · 컴파일된 위키(Wiki) · 에이전트 규약(Schema)',
        body: '폴더와 프론트매터 스키마는 단순한 정리 규칙이 아니라 AI 에이전트가 길을 잃지 않고 판단하게 만드는 가장 단단한 하네스입니다. 세 줄의 설명문이 수천 개 노트의 라우터가 됩니다.',
        image: '/rooms/pkm-blueprint.webp',
        tags: ['Schema', 'LLM Wiki', 'CMDS'],
        href: 'https://jisan.cmdspace.work/posts/schema-is-harness/',
        hrefLabel: '지산 블로그 원문 읽기',
      },
      {
        id: 'jisan-topology',
        badge: '지식의 지형학 3부작',
        title: '그리고(And)의 풀밭 위에 아니면(Not)의 미로를 짓는 법',
        subtitle: '들뢰즈의 리좀 태그와 루만의 선택 경계가 만나는 자리',
        body: '폴더는 맥락을 하나만 허락하지만 머릿속 개념은 여러 맥락에 동시에 속합니다. 리좀처럼 자유롭게 이어 붙이되, 무엇을 연결하지 않을지 경계를 세울 때 비로소 자기만의 사유 기계가 움직입니다.',
        image: '/rooms/pkm-zettelkasten.webp',
        tags: ['지식의 지형학', 'Zettelkasten', 'Rhizome'],
        href: 'https://jisan.cmdspace.work/posts/topology-of-knowledge-3/',
        hrefLabel: '지산 블로그 원문 읽기',
      },
      {
        id: 'jisan-probability',
        badge: '고유성 철학',
        title: '나만의 확률값 — AI가 평균을 복제할 때 남는 것',
        subtitle: '인터넷 평균 분포가 아닌 내 기록이 빚어내는 고유한 분포',
        body: '거대언어모델은 세상의 평균을 1초 만에 꺼내 놓습니다. 그래서 개인 지식관리는 메모 보관이 아니라 내가 직접 겪고 질문하며 쌓은 고유한 확률 분포를 지키는 일입니다.',
        image: '/rooms/pkm-graph.webp',
        tags: ['PKM 철학', '고유성', 'CMDS 9계명'],
        href: 'https://jisan.cmdspace.work/posts/my-probability/',
        hrefLabel: '지산 블로그 원문 읽기',
      },
      {
        id: 'jisan-9yohan',
        badge: '멀티 에이전트',
        title: '아홉 명의 요한, 하나의 주권 커널 — 9Yohan Constellation',
        subtitle: '900번대 아홉 사업 부문 × 역사 속 아홉 요한 × 아홉 덕목 가드레일',
        body: '케플러(지도)·괴테(문장)·듀이(교육)·바흐(미디어)·노이만(분석)·세례자(관계)·매카시(공학)·하위징아(커뮤니티)·칼뱅(자문). 기능 무리가 아니라 실패 양식을 막아 주는 인격 주소 체계입니다.',
        image: '/rooms/pkm-kepler.webp',
        tags: ['9Yohan', 'Multi-Agent', 'Constellation'],
        href: 'https://jisan.cmdspace.work/posts/9yohan-constellation/',
        hrefLabel: '지산 블로그 원문 읽기',
      },
      {
        id: 'jisan-cmdmd-akm',
        badge: '도구와 측정',
        title: '읽기가 먼저다(CmdMD) & 측정할 수 없으면 복리도 없다(AKM Index)',
        subtitle: '리뷰 우선 마크다운 에디터와 5필러 25기준 지식 시스템 성숙도 진단',
        body: '지식노동의 실제 시간은 쓰기보다 읽고 검토하고 배분하는 데 쓰입니다. 에이전트가 함께 굴리는 지식 생태계를 스스로 채점하고 다음 병목을 고쳐 나가는 실천 기록입니다.',
        image: '/rooms/pkm-workbench.webp',
        tags: ['CmdMD', 'AKM Index', '측정과 복리'],
        href: 'https://jisan.cmdspace.work/posts/cmdmd/',
        hrefLabel: '지산 블로그 원문 읽기',
      },
      {
        id: 'jisan-question',
        badge: '기록의 출발점',
        title: '나는 질문한다, 고로 기록한다 & 선택적 망각의 기술',
        subtitle: '우리가 정말 남겨야 하는 것은 정답이 아니라 살아 있는 질문',
        body: '다 기억하려는 욕심을 내려놓고 Core·Cache·Compost·Cold 네 층으로 덜어낼 때, 몇 년 전 품었던 질문이 오늘의 새로운 자료와 다시 만납니다.',
        image: '/rooms/pkm-luhmann.webp',
        tags: ['질문', '선택적 망각', 'Organizing Dimension'],
        href: 'https://jisan.cmdspace.work/posts/i-ask-therefore-i-record/',
        hrefLabel: '지산 블로그 원문 읽기',
      },
    ],
  },

  'mind-lectures': {
    id: 'mind-lectures',
    room: 'mind',
    kicker: 'MAIN VAULT LECTURE ASSETS · 강의 자산 보드',
    title: '메인 볼트 강의 자산 & 핵심 명제 아카이브',
    lead: '현장 강연과 부트캠프 전사본을 원자 단위 지식 카드로 분해해 쌓아 둔 실제 강의 제목과 핵심 명제들입니다. 검색창에 키워드를 입력해 찾아보세요.',
    searchable: true,
    cards: [
      {
        id: 'lec-agent-1',
        badge: 'CMDS 부트캠프 · AI Agent Workflow',
        title: '에이전트와 일할 때 가장 먼저 설계할 것은 저장이다',
        subtitle: '어디에, 어떤 이름으로, 언제 끝났다고 볼지 정하는 파일 생애주기',
        body: '화려한 프롬프트보다 산출물이 쌓이는 경로와 완료 기준이 먼저입니다. 손으로 한 번 해 본 루틴을 스킬로 깎고 나면 사람은 조종석과 관측만 쥐게 됩니다.',
        image: '/rooms/pkm-process.webp',
        tags: ['부트캠프', '스킬 설계', '저장 규칙'],
      },
      {
        id: 'lec-agent-2',
        badge: 'CMDS 부트캠프 · 하네스 지도',
        title: '세션이 90개가 되면 병목은 내 기억이다 — 자리의 지도로 그리는 하네스',
        subtitle: '윈도우·그룹·워크스페이스 색 구분과 전 세션 풀텍스트 자기조회',
        body: '앱 논쟁은 돌고 업무 정의는 남습니다. 선언 원장·좌석·모델 서빙·워커·관측·표면 여섯 자리로 내 작업 환경을 지도화하고 세션 링크로 언제든 맥락을 부활시킵니다.',
        image: '/rooms/pkm-conductor.webp',
        tags: ['하네스', '세션 관리', '워크스페이스'],
      },
      {
        id: 'lec-pkm-ipo',
        badge: 'PKM for AI Agent 1~4차시',
        title: '인풋과 아웃풋을 먼저 고정하면 그 사이의 일이 보인다 — 개인 IPO 모델링',
        subtitle: '대분류는 아홉 개로 막고 하위는 두 자리로 연다 · 위계가 엇갈리면 속성 두 개로 덮는다',
        body: '지난 강의를 레고 블록으로 쪼개 두면 다음 강의는 조합이 됩니다. 주제 분류(CMDS 번호)와 모음 분류(인덱스 카드)를 다른 차원으로 분리해 AI가 즉시 문맥을 찾게 합니다.',
        image: '/rooms/pkm-blueprint.webp',
        tags: ['IPO 모델링', 'CMDS 100-900', '프론트매터'],
      },
      {
        id: 'lec-llm-wiki',
        badge: 'CMDS LLM Wiki 정규 과정',
        title: '위키는 쌓은 수가 아니라 소화한 수로 센다 — Ingest · Query · Lint',
        subtitle: '원본 하나를 컨테이너 크기로 잘라 사람도 AI도 다시 읽는 지식 층으로',
        body: '인덱스가 없으면 AI가 노트를 전부 열어 봅니다. qmd 분류표와 주간 Lint 점검으로 몇 년 전 관심사와 오늘 수집한 논문이 저절로 이어지는 위성 볼트 운영법입니다.',
        image: '/rooms/pkm-multivault.webp',
        tags: ['LLM Wiki', 'qmd 검색', '멀티볼트'],
      },
      {
        id: 'lec-exec-ax',
        badge: '기업 임원 · 리더십 AX 교육',
        title: '조직 도입은 인력 대체가 아니라 줄어든 시간으로 설득한다',
        subtitle: '의사결정자 먼저, 민감하지 않은 공개 자료부터 시작하는 실전 AX 로드맵',
        body: '임원과 실무자가 같은 마크다운 규격 위에서 보고서·회의록·의사결정 전제를 공유할 때 조직 전체의 학습 속도가 복리로 붙습니다.',
        image: '/rooms/pkm-workbench.webp',
        tags: ['임원 AX', '조직 도입', '의사결정'],
      },
      {
        id: 'lec-researcher',
        badge: '대학 · 연구기관 세컨드 브레인 특강',
        title: '초심자에게는 도구 목록보다 첫 성공의 경로가 필요하다',
        subtitle: '서지 정규화 · 검증된 인용 · 폐쇄망과 로컬 볼트를 아우르는 연구 파이프라인',
        body: '해마다 쏟아지는 보고서와 논문은 서지 정보로 정규화하고 우리 기준의 섹션 인덱스만 볼트에 둡니다. 장비를 교정하듯 연구 워크플로도 매일 조금씩 교정합니다.',
        image: '/rooms/pkm-lecture.webp',
        tags: ['연구자 PKM', '서지 관리', '특강 자산'],
      },
      {
        id: 'lec-gamf',
        badge: '공동체 · 기록 컨퍼런스 기조강연',
        title: '기록은 보관이 아니라 전달이다 — 다음 세대와 다음 AI가 배울 원본',
        subtitle: '찾고 잇는 일은 에이전트에 맡기고, 방향과 감사의 한 줄은 사람이 직접 쓴다',
        body: '에이전트가 하루를 열고 닫아 주어도 마지막 결재와 감사의 문장만큼은 사람의 몫으로 남길 때 기록이 삶과 공동체를 살리는 길이 됩니다.',
        image: '/rooms/pkm-luhmann.webp',
        tags: ['기록 철학', '기조강연', '공동체'],
      },
    ],
  },

  'mind-illustrations': {
    id: 'mind-illustrations',
    room: 'mind',
    kicker: 'PKM ILLUSTRATION GALLERY · 지식관리 일러스트 월',
    title: '벽면 지식관리 일러스트 컬렉션',
    lead: 'Connect → Merge → Develop → Share 네 단계와 제텔카스텐·멀티볼트·에이전트 지휘 장면을 그린 오리지널 일러스트 액자들입니다.',
    cards: [
      {
        id: 'ill-graph',
        badge: 'Knowledge Graph',
        title: '살아 움직이는 지식 연결망 탐색',
        subtitle: '고립된 메모가 아니라 서로를 비추는 별자리',
        body: '노트 하나하나는 작지만 링크가 쌓이는 순간 생각지도 못한 질문의 다리가 놓입니다.',
        image: '/rooms/pkm-graph.webp',
      },
      {
        id: 'ill-process',
        badge: 'CMDS Process',
        title: 'Connect → Merge → Develop → Share',
        subtitle: '발견에서 합성, 구현을 거쳐 세상에 나누기까지',
        body: '수집함에만 머무르지 않고 외부의 산출물과 교육으로 흘러가게 만드는 네 박자 순환 고리입니다.',
        image: '/rooms/pkm-process.webp',
      },
      {
        id: 'ill-zettel',
        badge: 'Zettelkasten & Luhmann',
        title: '루만의 카드 서재와 실로 이은 사유',
        subtitle: '9만 장의 종이 상자에서 오늘날의 마크다운 볼트로',
        body: '자리를 바꾸지 않는 주소와 자기 문장으로 다시 쓰는 원칙이 시대를 건너 이어집니다.',
        image: '/rooms/pkm-zettelkasten.webp',
      },
      {
        id: 'ill-multivault',
        badge: '7-Vault Ecosystem',
        title: '일곱 볼트 생태계와 의미 기반 교차 탐색',
        subtitle: '주저자와 합의 모델에 따라 나뉜 위성들과 마더십의 조화',
        body: '혼자 깊이 묵상하는 공간, AI와 함께 컴파일하는 위키, 동료와 협업하는 볼트가 각자의 질서를 지킵니다.',
        image: '/rooms/pkm-multivault.webp',
      },
    ],
  },

  // ───────── 작업 차고 · 이동식 작전 본부 (구요한의 개러지)
  'garage-grenadier': {
    id: 'garage-grenadier',
    room: 'garage',
    kicker: 'BAY 01 · MOBILE OPERATIONS CENTER',
    title: '이네오스 그레나디어 (Ineos Grenadier) · 이동식 작전 본부',
    lead: '루프랙 위 스타링크 위성 안테나와 후면 카고 오피스를 얹고 어디든 강단과 연구실로 바꾸는 바퀴 달린 본부입니다.',
    cards: [
      {
        id: 'gren-moc',
        badge: 'Mobile Ops Concept',
        title: '바퀴 달린 서재이자 야전 지휘소(이작본)',
        subtitle: '래더 프레임 정통 오프로더 × 스타링크 위성 통신 × 카고 워크스테이션',
        body: '산길 끝 호숫가에서도, 낯선 도시의 강연장 주차장에서도 뒷문을 열면 즉시 모니터와 노트북, 인산철 파워뱅크가 켜집니다. 지붕 위 스타링크 접시가 하늘과 직결되어 끊김 없는 원격 세션과 지식 동기화를 뒷받침합니다.',
        image: '/rooms/garage-moc-iso.webp',
        tags: ['Ineos Grenadier', 'Starlink', '이동식 작전 본부'],
      },
      {
        id: 'gren-cargo',
        badge: 'Rear Cargo Office',
        title: '트렁크 도어를 열면 펼쳐지는 필드 데스크',
        subtitle: '타공판 모듈 수납 · 스윙암 노트북 거치대 · 외부 그래프 모니터',
        body: '이동 중 떠오른 생각과 현장 녹취를 그 자리에서 바로 마크다운과 위키로 정리할 수 있도록 전력·조명·거치 동선을 손수 설계했습니다.',
        image: '/rooms/garage-moc-cargo.webp',
        tags: ['Field Desk', 'Power Station', 'Modular Rack'],
      },
      {
        id: 'gren-blueprint',
        badge: 'System Schematic',
        title: '통합 익스페디션 시스템 설계도',
        subtitle: '(1) 지식 그래프 네트워크 · (2) 스타링크 어레이 · (6) 모듈러 루프랙',
        body: '차량 하드웨어와 AI 지식 인프라를 하나의 시스템 엔지니어링 도면으로 엮은 프로젝트 블루프린트입니다.',
        image: '/rooms/garage-blueprint-starlink.webp',
        tags: ['Blueprint', 'Expedition', 'Starlink Mini'],
      },
    ],
  },

  'garage-cla45': {
    id: 'garage-cla45',
    room: 'garage',
    kicker: 'BAY 02 · PERFORMANCE COUPE',
    title: '메르세데스-AMG CLA 45 · 프로젝트 콘트라스트',
    lead: '각진 오프로더 옆자리를 지키는 날렵한 블랙 & 옐로우 포인트 퍼포먼스 쿠페입니다.',
    cards: [
      {
        id: 'cla-contrast',
        badge: 'Project Contrast',
        title: '정통 프레임 오프로더와 4MATIC+ 쿠페의 대비',
        subtitle: '실버 후드 스트라이프 · 옐로우 에어로 립 · 멀티스포크 매트블랙 휠',
        body: '우직하게 산길을 오르는 그레나디어와 정반대의 매력을 지닌 안주인의 경쾌한 스포츠 쿠페입니다. 차고 벽면의 듀얼 엔지니어링 도면에서 두 차량의 비례와 설계 철학 차이를 한눈에 비교할 수 있습니다.',
        image: '/rooms/garage-blueprint-dual.webp',
        tags: ['Mercedes-AMG CLA 45', '4MATIC+', 'Dual Blueprint'],
      },
    ],
  },

  'garage-tiguan': {
    id: 'garage-tiguan',
    room: 'garage',
    kicker: 'ACQUISITION PLAN · 벽면 구매 계획 & 다이캐스트',
    title: '~~BMW X3~~ → 폭스바겐 티구안(Tiguan) 노선 급선회 기록!',
    lead: '원래 야심 차게 붙여 두었던 X3 도면 위에 빨간 취소선이 그어지고 티구안으로 최종 확정된 사연입니다.',
    cards: [
      {
        id: 'tiguan-story',
        badge: '아버님의 일침',
        title: '"왜 지금 X3를 사냐!" — 효심과 실속을 모두 챙긴 최종 결정',
        subtitle: '벽면 구매 계획표: X3 취소선(✕) → 실속파 패밀리 SUV 티구안 확정 도장!',
        body: '함께 일하고 노래하는 든든한 파트너가 벽 한켠에 BMW X3 제원표를 걸어 두고 설레는 구매 계획을 세웠지만, 아버님께 "왜 X3를 사냐!"고 호되게 혼난 뒤 미련 없이 빨간 줄을 긋고 폭스바겐 티구안으로 최종 노선을 확정했습니다. 도면 앞 전시대에는 못다 이룬 작은 X3 미니카와 새 주인공 티구안 1:18 다이캐스트 모형이 나란히 빛나고 있습니다.',
        tags: ['구매 계획표', '티구안 최종 확정', '1:18 다이캐스트'],
      },
    ],
  },

  'garage-harness': {
    id: 'garage-harness',
    room: 'garage',
    kicker: 'RIG & DEVICE LAB · 장비 설계 작업대',
    title: '멀티디바이스 AI 하네스 & 필드 장비 점검 본부',
    lead: '노트북 주 관제석부터 데스크탑 연산 워커, 고성능 GPU 노드, 모바일 음성 제어기, 현장 녹음 장비까지 이 남자의 취미이자 무기 실험실입니다.',
    cards: [
      {
        id: 'rig-architecture',
        badge: 'Multi-Device Harness',
        title: '주 관제 노트북 × 데스크탑 워커 × GPU 노드 × 모바일 파일럿',
        subtitle: '역할이 다른 기기들이 하나의 세션 링크와 음성 명령으로 맞물리는 구조',
        body: '책상 위 주 노트북이 지휘봉을 잡고, 무거운 백그라운드 일꾼과 렌더링은 데스크탑 서버와 전용 GPU 노드가 나눠 맡으며, 이동 중에는 손안의 모바일 관제기로 세션을 깨우고 점검합니다.',
        image: '/rooms/garage-blueprint-systems.webp',
        tags: ['Multi-Device', 'Telemetry', 'Remote Rig'],
      },
      {
        id: 'rig-field-gear',
        badge: 'Field Kit & Starlink',
        title: '스타링크 미니 · 필드 레코더 · 모듈러 공구벽',
        subtitle: '어디서나 3분 안에 강연·녹화·원격 개발 본부를 세팅하는 체크리스트',
        body: '케이블 하나, 마이크 암 하나, 배터리 잔량까지 출동 전에 이 작업대에서 직접 조이고 테스트합니다.',
        image: '/rooms/garage-starlink-mini.webp',
        tags: ['Starlink Mini', 'Audio Gear', 'Field Check'],
      },
    ],
  },

  // ───────── 재즈가 흐르는 방 (박공 아래 재즈 & 리듬 아카이브)
  'gable-vinyl': {
    id: 'gable-vinyl',
    room: 'gable',
    kicker: 'JAZZ & STAGE NOTES · 레코드와 무대 노트',
    title: '변박에 도전하던 밤의 레코드장과 빛의 리본 무대',
    lead: '박자를 못 타던 곡을 2주 동안 반복해 들으며 자기 리듬으로 만든 이야기와 공연 무대 연출 노트를 모았습니다.',
    cards: [
      {
        id: 'jazz-avishai',
        badge: 'Vinyl Pick 01',
        title: '콘트라베이스가 이끄는 트리오와 2주간의 리듬 정복기',
        subtitle: '어려운 변박을 피하지 않고 끝까지 귀에 익혀 내 노래로 만드는 태도',
        body: '처음 들었을 때 박자를 놓친 것이 분해서 2주 내내 같은 곡만 들으며 마침내 몸에 스윙과 변박을 새겼습니다. 빈틈을 과하지 않고 세련되게 채우는 베이스 리더십이 이 방의 사운드 철학입니다.',
        tags: ['Jazz Trio', 'Odd Meter', 'Tenor Vocal'],
      },
      {
        id: 'jazz-led-ribbon',
        badge: 'Stage Visual',
        title: '서로 다른 결이 섞이지 않고 나란히 흐르는 빛의 리본',
        subtitle: '공연장 와이드 스크린을 채운 리듬과 색채의 블렌드',
        body: '각자의 색이 뭉개지지 않으면서 한 무대 위에서 조화를 이루듯, 테너 보컬과 피아노, 콘트라베이스의 선율이 박공 천장 아래를 흐릅니다.',
        tags: ['Stage Art', 'Jazz Blend', 'Piano & Vocal'],
      },
    ],
  },

  // ───────── 빛이 드는 방 (문장과 호두, 전통 문양의 서재)
  'study-walnut': {
    id: 'study-walnut',
    room: 'study',
    kicker: 'SENTENCES & OBJECTS · 문장과 사유의 창가',
    title: '오늘 만난 좋은 문장과 작은 호두 오브제',
    lead: '읽고 쓰고 듣고 생각하는 시간을 아끼며, 누군가에게 오늘 만난 좋은 문장 같은 사람이 되고 싶은 방입니다.',
    cards: [
      {
        id: 'study-walnut-card',
        badge: '에세이 오브제',
        title: '작은 호두 알 속에 담긴 우주의 결',
        subtitle: '단단한 껍질 안팎으로 이어지는 따뜻한 시선과 말의 온도',
        body: '비행기표와 숙소만 정해 두고 발길 닿는 대로 떠나는 여행처럼, 여백을 남겨 둔 미완의 공간에서 손님들과 오늘 만난 문장을 나눕니다.',
        tags: ['좋은 문장', '에세이', '여백의 미'],
      },
      {
        id: 'study-pattern',
        badge: 'Craft & Aesthetic',
        title: '고려청자 비색 · 단청 연꽃 격자 · 수묵의 선',
        subtitle: '전통의 은은한 문양을 오늘의 옷과 종이 소품으로 풀어낸 취향',
        body: '창살을 통과해 마루에 내려앉는 햇빛 무늬와 비색 도자기, 먹빛 노트들이 조용한 조화를 이룹니다.',
        tags: ['청자 비색', '단청 문양', '수묵'],
      },
    ],
  },

  // ───────── 종이공 과녁 방 (도전과 탐구, 반석 같은 산의 방)
  'target-summit': {
    id: 'target-summit',
    room: 'target',
    kicker: 'CHALLENGE & EXPLORATION · 도전과 탐구 책상',
    title: '만능 도전자 책상 — 수학 퍼즐, 스포츠, 그리고 첫 기록장',
    lead: '해야 할 일은 스스로 척척 끝내고, 새로운 운동과 퍼즐에 거침없이 도전하며 어디서든 친구를 만드는 에너지가 가득한 방입니다.',
    cards: [
      {
        id: 'target-note',
        badge: 'Explorer Desk',
        title: '빠른 수리 감각과 흔들리지 않는 산봉우리 시선',
        subtitle: '공부·독서·탐구·만든 것들을 스스로 정리하는 나만의 첫 노트 보관함',
        body: '창밖으로 보이는 크고 굳건한 바위산과 드넓은 운동장처럼, 어떤 과제 앞에서도 씩씩하게 해법을 찾아내는 도전자 정신을 담았습니다.',
        tags: ['도전 과제', '수학 퍼즐', '스포츠'],
      },
    ],
  },

  // ───────── 좋아하는 것 방 (상상과 질문, 조개와 돌 보물함)
  'toybox-treasure': {
    id: 'toybox-treasure',
    room: 'toybox',
    kicker: 'IMAGINATION & TREASURES · 채집함과 스케치북',
    title: '바닷가 조개 · 산길의 예쁜 돌 보물상자와 상상 스케치북',
    lead: '엉뚱하고 반짝이는 질문이 끊이지 않고, 손으로 그리고 만들며 모은 작은 자연의 보물들이 진열된 방입니다.',
    cards: [
      {
        id: 'toybox-shells',
        badge: 'Nature Collection',
        title: '지나치지 않고 주워 모은 무지개 조개껍데기와 조약돌',
        subtitle: '바닷가 파도 소리와 산길의 햇살이 함께 담긴 보물 접시',
        body: '어른들은 그냥 지나치는 작은 돌멩이와 조개에서도 저마다의 표정과 이야기를 발견해 이름을 붙여 주는 따뜻한 상상력의 공간입니다.',
        tags: ['바닷가 조개', '예쁜 조약돌', '상상 스케치'],
      },
    ],
  },

  // ───────── 손님방 (환대와 쉼)
  'guest-welcome': {
    id: 'guest-welcome',
    room: 'guest',
    kicker: 'HOSPITALITY · 다기 세트와 환영 안내',
    title: '먼 길 오신 손님을 위한 따뜻한 차와 계절 안내첩',
    lead: '잠시 걸음을 멈추고 창밖 달빛 소나무 정원을 바라보며 숨을 고르는 조용한 쉼터입니다.',
    cards: [
      {
        id: 'guest-tea',
        badge: 'Welcome Tea',
        title: '짓고 잇는 집을 찾아 주신 분들께',
        subtitle: '개어 둔 담요와 따뜻한 차 한 잔, 그리고 방명록 한 줄',
        body: '서로 다른 빛깔의 방들을 둘러보신 뒤 언제든 이곳 의자에 앉아 편안히 쉬어 가세요.',
        tags: ['환대', '쉼터', '다기 세트'],
      },
    ],
  },
};

export function getRoomExhibit(id: string): RoomExhibit | null {
  return ROOM_EXHIBITS[id] ?? null;
}
