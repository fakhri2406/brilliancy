# Brilliancy

A hybrid-engine chess analysis platform: Stockfish runs in your browser via
WebAssembly, a server tier exists only for deep runs and for building a shared
evaluation cache. Full-game analysis with per-move classification, accuracy
scores and an eval graph; multi-source game import; play against the engine; a
board editor.

Analysis is client-first. Nothing is sent anywhere to analyse a game you paste
in, and an anonymous analysis is never persisted server-side.

The authoritative technical specification is [`docs/spec/v1.1.md`](docs/spec/v1.1.md).
Its section numbers are the contract — cite them in commits, PRs and code
comments.

**Status: scaffolding.** There is no chess in this repository yet. Phase 0a of
the build order in §11.

## Licence

**AGPL-3.0-or-later.** The full text is in [`LICENSE`](LICENSE); the reasoning is
in [`docs/decisions/0001-licence.md`](docs/decisions/0001-licence.md).

This is not incidental. Stockfish and Chessground are both GPL-3.0-or-later, so
the combined work is copyleft either way (§2.1, §2.2); AGPL is chosen over plain
GPL because it closes the "network use is not distribution" gap that matters for
a hosted web app (§2.3).

**Source-availability obligation.** Under AGPL §13, if you run a modified version
of Brilliancy and let other people use it over a network, you must offer those
users the corresponding source of *your* version. Hosting an unmodified copy and
linking back here satisfies it; hosting a fork without publishing your changes
does not.

Third-party attribution is in [`NOTICES`](NOTICES), which is updated in the same
commit that adds a dependency — never later (§2.3).

## Prerequisites

- **Node 22 LTS** — pinned in `.nvmrc` and in the root `engines` field.
- **pnpm 9** — pinned via `packageManager`. Corepack is unbundled from Node 25
  onward, so install it directly: `npm install -g pnpm@9`.

## Quickstart

```sh
pnpm install
pnpm dev          # watch builds for every package + the Vite dev server
```

Everything the CI will run, and everything you should run before pushing:

```sh
pnpm typecheck    # tsc across every workspace
pnpm lint         # biome check (lint + format), one config at the root
pnpm build        # tsc -> dist for packages, vite build for the web app
pnpm test         # vitest, per package
pnpm check:deps   # enforces the §4.2 package dependency graph
```

`pnpm format` rewrites files in place; `pnpm lint` only reports.

## Layout

```
apps/web/                   Vite + React SPA
packages/engine-protocol/   UCI parse/encode, score types
packages/chess-utils/       PGN, fenHash, own board repr, SEE, material
packages/openings/          vendored ECO data + lookup trie
packages/analysis-core/     win%, accuracy, classification pipeline
tools/check-deps.mjs        package graph guard
docs/spec/v1.1.md           the specification
docs/decisions/             decision records (§16)
CLAUDE.md                   conventions and invariants for contributors
```

`apps/api` and `packages/db` arrive in Phase 3, and `apps/engine-worker` in
Phase 5 (§11). The workspace globs already cover all three.
