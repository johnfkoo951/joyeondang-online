// 방 놀이 카트리지 규약(기획서 5.6). 놀이 하나는 이 모양의 모듈 하나다.
// 걷기 화면이 놀이 자리(hotspot kind 'game')에서 「놀이 시작」을 누르면 registry에서 지연 로딩해 덮개 화면에 붙인다.
// 놀이는 걷기 엔진과 서로 모른다. 필요한 것은 모두 ctx로 받는다.
import type { Role } from '@/lib/access';

export type GameResult = {
  /** 놀이 점수(없으면 비움). 높을수록 좋다 */
  score?: number;
  /** 끝까지 마쳤는지(도장은 마쳤을 때만 준다) */
  cleared: boolean;
  /** 걸린 시간(ms) */
  ms: number;
  /** 놀이마다 남기고 싶은 작은 값들 */
  detail?: Record<string, number | string>;
};

export type GameContext = {
  /** 놀이 id(registry 키)와 놀이가 놓인 방 slug */
  game: string;
  room: string;
  /** 화면에 부를 이름(로그인 안 했으면 '손님') */
  nickname: string;
  role: Role;
  /** 방문마다 바뀌는 난수 씨앗(같은 씨앗이면 같은 판) */
  seed: number;
  /** 손가락 기기인지, 움직임 줄이기, 지금 테마 */
  coarse: boolean;
  reducedMotion: boolean;
  theme: 'light' | 'dark';
  /**
   * 놀이를 닫는다. 결과를 넘기면 걷기 화면이 결과 카드와 도장(손님 이상, cleared일 때)을 처리한다.
   * 놀이는 Esc 처리를 직접 하지 않는다: 덮개 화면이 Esc·닫기 단추를 받아 onExit()을 부른다.
   */
  onExit: (result?: GameResult) => void;
  /**
   * 지금까지의 결과를 덮개 화면에 미리 알린다(선택). 놀이는 마친 상태(cleared)에 닿는 순간과 그 뒤 점수가 바뀔 때 부른다.
   * 아이가 다 하고 나서 결과 단추 대신 닫기(✕)·Esc를 눌러도, 덮개 화면이 마지막으로 받은 결과로 결과 카드와 도장을 처리한다.
   * 한 번 cleared를 알린 놀이는 그 뒤 결과가 cleared가 아니어도 도장을 잃지 않는다.
   */
  report?: (result: GameResult) => void;
};

/**
 * 놀이 모듈의 기본 내보내기. container(덮개 화면 안 빈 칸, 크기는 화면 전체)에 그리고,
 * 정리 함수를 돌려준다. 정리 함수는 이벤트·애니메이션·오디오·WebGL을 모두 놓아야 한다.
 */
export type MountGame = (container: HTMLElement, ctx: GameContext) => () => void;

export type GameMeta = {
  id: string;
  /** 공개 이름(실명 없음) */
  title: string;
  /** 놀이가 놓인 방 slug */
  room: string;
  /** 시작 전 한 줄 설명 */
  blurb: string;
  /** 대략 걸리는 시간(초) */
  seconds: number;
  /** 지연 로딩. 놀이마다 따로 쪼개진 묶음이 된다 */
  load: () => Promise<{ default: MountGame }>;
};
