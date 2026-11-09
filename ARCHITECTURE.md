# Architecture · 구조

[English](#english) · [한국어](#한국어)

## English

```
Browser
 ├─ Next.js site (src/app, src/components) ──── Supabase: login, guest list, notes, stamps, shots, avatar queue
 │    ├─ walk engine (src/walk, three.js) ◀── house world: src/content/world.ts (everyone)
 │    │                                         or HOUSE_WORLD_GZ (server-only, invited guests)
 │    └─ mini-games (src/games, loaded on demand)
 └─ WebSocket ──── game server (game-server, one Durable Object per space)
                     ▲ short-lived signed token from /api/game-token

Photo character: /api/avatar (upload, 202) → avatars queue in Postgres → worker/avatar (claims a job,
calls an image API, uploads the result) → the walk page polls /api/avatar/status and swaps the character
```

### Contracts

**Mini-game cartridge** (`src/games/types.ts`). A game is one module whose default export is
`MountGame = (container, ctx) => cleanup`. It draws into `container`, gets everything it needs from `ctx`
(room, nickname, role, seed, coarse pointer, reduced motion, theme) and calls `ctx.onExit(result)` to close.
The cleanup function must release events, animation frames, audio and WebGL. Register it in
`src/games/registry.ts` with `id`, `title`, `room`, a one-line `blurb`, `seconds` and `load: () => import('./your-game')`.
Stamps are given only when `result.cleared` is true. Notes are never locked behind a game.

**House and rooms** (`src/walk/types.ts`). Everything walkable is a `HouseWorld` with `kind` `'redrawn'`,
`'real'` or `'room'`: floors, walls, openings, furniture, hotspots and portals as plain data. A room scene
(`src/content/room-worlds.ts`) is its own small world; walking out returns you to its door. Hotspot kinds
include `portal`, `exit` and `game`.

**Characters** (`src/walk/look.ts`). `CharacterLook` is either a doll (`hair`, `hairColor`, `skin`, `top`,
`bottom`, `acc` from fixed palettes) or a photo character URL. Always pass input through `cleanLook`.

**Walking together** (`game-server/src/protocol.ts`). A small JSON protocol over one WebSocket per guest.
States are batched every 100 ms; up to 60 guests per space, one chat line per 1.5 s, short bubbles.
The site signs a 10-minute HMAC token so the game server never talks to the database.

**Privacy**. The real house, family names and keys never enter the bundle: they live in server-only
environment variables and reach invited guests only. `npm run verify` runs the privacy gate on the source
and on the built pages.

### Adding things
- **A game**: make `src/games/<id>/index.ts` with a default `MountGame`, add it to the registry, add a hotspot of kind `game` in the room, write a unit test for its logic.
- **A room scene**: add the data to `src/content/room-worlds.ts`, a portal in `src/content/world.ts`, run `npm test` (reachability and privacy checks run there).
- **A character item**: extend the lists in `src/walk/look.ts` and draw it in `src/walk/avatar.ts`.

## 한국어

위 그림이 전체 흐름이에요. 브라우저는 Next.js 사이트와 Supabase(로그인, 명단, 쪽지, 도장, 사진, 사진 캐릭터 대기열)를 쓰고, 걷기 엔진은 누구나 보는 다시 그린 집(`src/content/world.ts`)이나 초대 손님에게만 서버가 주는 실제 크기의 집(`HOUSE_WORLD_GZ`)을 그려요. 함께 걷기는 사이트가 서명한 10분짜리 출입증으로 게임 서버에 붙어요.

### 규약
- **놀이 카트리지** (`src/games/types.ts`): 기본 내보내기는 `MountGame = (container, ctx) => cleanup`. 필요한 것은 모두 `ctx`로 받고, 닫을 때 `ctx.onExit(result)`. 정리 함수는 이벤트·애니메이션·소리·WebGL을 모두 놓아요. `src/games/registry.ts`에 `id`, `title`, `room`, `blurb`, `seconds`, `load`로 등록해요. 도장은 `cleared`일 때만, 쪽지는 놀이로 잠그지 않아요.
- **집과 방** (`src/walk/types.ts`): 걸을 수 있는 모든 것은 `HouseWorld`(`kind`: `redrawn`, `real`, `room`) 데이터예요. 방 장면(`src/content/room-worlds.ts`)은 따로 지은 작은 세계이고, 나오면 그 방 문 앞이에요.
- **캐릭터** (`src/walk/look.ts`): 정해진 팔레트의 인형이거나 사진 캐릭터 주소. 입력은 늘 `cleanLook`을 거쳐요.
- **함께 걷기** (`game-server/src/protocol.ts`): 손님마다 웹소켓 하나, 상태는 100ms마다 묶어 보내고, 공간 하나에 60명, 채팅은 1.5초에 한 줄.
- **개인정보**: 실제 집, 가족 이름, 키는 번들에 들어가지 않아요. 서버 전용 환경 변수에만 있고 초대 손님에게만 가요. `npm run verify`가 소스와 빌드 결과를 검사해요.

### 더하는 법
- **놀이**: `src/games/<id>/index.ts`에 `MountGame`, registry에 등록, 방에 `game` 자리, 로직 단위 시험.
- **방 장면**: `src/content/room-worlds.ts`에 데이터, `src/content/world.ts`에 포털, `npm test`(닿을 수 있는지와 개인정보를 거기서 봐요).
- **캐릭터 소품**: `src/walk/look.ts` 목록을 늘리고 `src/walk/avatar.ts`에서 그려요.
