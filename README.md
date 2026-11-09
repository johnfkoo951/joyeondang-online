# Joyeondang Online

[🇬🇧 English](README.md) · [🇰🇷 한국어](README.ko.md)

[![Code: MIT](https://img.shields.io/badge/code-MIT-134538)](LICENSE)
[![Content: CC BY-NC 4.0](https://img.shields.io/badge/content-CC%20BY--NC%204.0-E985A2)](LICENSE-content)
[![Site](https://img.shields.io/badge/walk%20the%20house-joyeondang.cmdspace.work-134538)](https://joyeondang.cmdspace.work)

A small 3D house you can walk through with friends. A family built it to welcome guests: walk the rooms, play little games, dress up a character, take a picture, leave a note. This is the code behind **[joyeondang.cmdspace.work](https://joyeondang.cmdspace.work)**.

## What's inside

| Part | Where | Built with |
|---|---|---|
| Walk engine: first and third person, physics, minimap, find-your-way, room scenes | `src/walk/` | three.js |
| Mini-games, each a lazy-loaded "cartridge" | `src/games/` | React, Canvas, Web Audio |
| The house, rooms and room scenes as data | `src/content/` | TypeScript |
| Site: pages, login, notes, gallery, character studio, admin | `src/app/`, `src/components/` | Next.js 16 (App Router, Cache Components), React 19 |
| Data and permissions | `supabase/migrations/` | Supabase Postgres with row-level security |
| Walking together: names and speech bubbles | `game-server/` | Cloudflare Workers and Durable Objects |
| Photo-to-character queue and worker | `worker/avatar/` | Node, an OpenAI-compatible image API |

[ARCHITECTURE.md](ARCHITECTURE.md) explains how the parts fit and the contracts for games, rooms and characters.

## Quick start

Needs Node 22.

```bash
npm ci
npm run dev        # http://localhost:3000/walk
npm test           # unit tests and SQL tests (in-memory Postgres via PGlite)
npm run verify     # privacy gate, then a production build
```

With no keys at all, the site runs and the redrawn house is open to everyone. Login, notes, the guest list, walking together and photo characters need the services below.

## Deploy your own

1. **Supabase**: create a project, run `supabase/migrations/*.sql` in order, turn on Google login, and copy the URL and publishable key into `.env.local` (see `.env.example`).
2. **Vercel** or any Next.js host: set the same variables. Server-only and optional: `SUPABASE_SECRET_KEY`, `HOUSE_WORLD_GZ` (a real-scale house shown only to invited guests), `FAMILY_ROOMS_JSON` (name tags on room doors).
3. **Game server** (optional): in `game-server/`, run `npx wrangler secret put GAME_TOKEN_SECRET`, set `ALLOWED_ORIGINS` and your own route in `wrangler.jsonc`, then `npx wrangler deploy`. Give the site `GAME_SERVER_URL` and the same `GAME_TOKEN_SECRET`.
4. **Photo characters** (optional): see [worker/avatar/README.md](worker/avatar/README.md). Off unless `AVATAR_ENABLED=1`. Characters are always drawn kindly.

## Privacy gate

A family site holds things that must never ship: names, places, the real floor plan. `npm run verify` scans the source and the built pages and fails the build on a hit. This repository carries only the general rules (key formats, real measurements, compass directions, position names). Put your own family's words in `private/privacy-rules.mjs`, which git ignores. Start from [private.example/](private.example/).

## Ideas, bugs and contributions

- **Ideas and bugs**: open an [issue](https://github.com/johnfkoo951/joyeondang-online/issues/new/choose) with a form, or start a [discussion](https://github.com/johnfkoo951/joyeondang-online/discussions).
- **Pull requests are not accepted for now.** The family writes the code. You're welcome to fork it under the MIT license.
- **Security or privacy problems**: report privately, see [SECURITY.md](SECURITY.md).

[ROADMAP.md](ROADMAP.md) · [docs/how-it-grows.md](docs/how-it-grows.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## How this repository is updated

The code is developed in a private repository that also holds the family's data. At each release a script exports everything except the private parts, checks it for personal data and secrets, installs, tests and builds it with no keys, and publishes it here as one commit with release notes. So the history here starts at the first public release, and each commit is a release.

## License

- Code: [MIT](LICENSE)
- The house layout, room scenes, words and pictures in `src/content/` and `docs/`: [CC BY-NC 4.0](LICENSE-content)

Made by **Yohan Koo (CMDSPACE)** · [cmdspace.work](https://cmdspace.work)
