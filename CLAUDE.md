# CLAUDE.md

Read this in full before touching anything. It exists so you do not need the spec
open to avoid the expensive mistakes.

## 1. What this is

Brilliancy is a hybrid-engine chess analysis platform: Stockfish runs in the
user's browser via WebAssembly and does the expensive work for free, while a
single small VPS serves an API, a job queue and a **shared evaluation cache**
that keeps server cost near-flat as usage grows. On top of that sits full-game
analysis with a ten-label move classification, per-player accuracy, an eval
graph, multi-source game import (chess.com and Lichess), play-versus-engine and
a board editor. It is licensed AGPL-3.0-or-later, client-first by design, and
built by one developer on a domain-plus-VPS budget.

## 2. Where the spec lives

**[`docs/spec/v1.1.md`](docs/spec/v1.1.md).** It is the authoritative technical
specification and it is long on purpose.

Its **section numbers are authoritative and stable**. Cite them — in commit
bodies, in PR descriptions, in code comments, and in decision records — whenever
a choice traces to the spec. "Per §6.2.1" is a complete justification; "seemed
right" is not.

If the spec is silent, ambiguous, or wrong, **do not invent an answer and do not
silently substitute one**. Say so, and resolve it in a decision record (§16). The
only sanctioned deviation from a fixed decision so far is
[`0002-module-resolution.md`](docs/decisions/0002-module-resolution.md).

Reading order if you read nothing else: **§0.2, §2, §5.6, §6.0** (§0.1).

## 3. Invariants

### The cache trust boundary — four data-flow rules (§3.3)

The shared cache is the cost-control mechanism, which makes it the highest-value
thing to poison. A hostile client can POST arbitrary `(fen, score, pv)` tuples;
if those enter `position_cache`, every later user is served a fabricated
evaluation for that position, permanently, with no signal that anything is
wrong. Silent, durable, and attributable to us. So:

1. **`POST /api/eval/batch` is read-only.** There is no endpoint, at any tier,
   that accepts a client-supplied evaluation into `position_cache`. Not for
   authenticated users. Not for the developer's own account.
2. **Client-computed evals are still persisted — elsewhere.** They go into
   `move_evals`, scoped to one `analyses` row with `tier = 'client'`, visible
   only to that game's owner. That is what makes a client-side analysis survive
   a reload and show up in the library.
3. **Enforcement is at the database, not in application logic.** Two Postgres
   roles: `brilliancy_api` has no `INSERT`/`UPDATE` grant on `position_cache`;
   `brilliancy_engine` does. A future code change that "helpfully" writes client
   evals to the cache fails at the SQL layer instead of shipping.
4. **`engine-worker` writes `position_cache` only for jobs it executed itself**,
   keyed by its own `engine_version`.

Relaxing this is not an option; the sanctioned future path is a separate
`position_cache_candidates` quarantine table with k-of-n agreement (k ≥ 3,
no shared IP, accounts older than 30 days, scores within 15 cp), and that is a
P3 idea, not a plan (§3.3, §15).

### Seeding the cache — four constraints (§3.4)

The Lichess open database publishes ~395 M Stockfish-evaluated positions under
CC0. It is a licence-clean warm start for `position_cache` on day one, and it
changes the cold-start economics of the whole design. It is Phase 5 work, but it
constrains Phase 1:

1. **Filter on ingest.** The full set will not fit on a €6 VPS. Take
   `depth >= 20` with at least 3 PVs, and cap total rows at whatever leaves 60%
   of the disk free. Prioritise by piece count descending.
2. **The hash must stay compatible.** Their FEN carries only board, active
   colour, castling rights and en passant — no halfmove clock. §8.2's bucketing
   exists to make our hash agree with theirs for the overwhelming majority of
   positions. **Do not change the hash without re-checking this.**
3. **Seeded rows use the reserved sentinel `engine_version = 'lichess-db'`** and
   rank below our own entries in the §8.3 lookup, so a seed is used only when
   nothing better exists and is superseded the moment our engine produces one.
4. **Ingest is a one-off manual script** in `tools/seed-cache/`, run against a
   downloaded shard. It is not part of the deployment.

### The sign convention (§5.6) — the one law

Every score that is **stored, transported, cached, logged, rendered or returned
by the API is White-positive.** Mover-perspective (`MoverScore`) exists only
inside `analysis-core`, only for the duration of one classification, and is
produced by exactly one function: `toMover`. `winPercent` accepts `MoverScore`
only, so the compiler refuses a `WhiteScore`. `RawInfoLine` never escapes
`engine-protocol`. Mate is stored in **signed plies**, not moves
(`plies = n > 0 ? 2n - 1 : 2n`), and is never re-based across plies.

How that is enforced, since prompt 0b.1
([`0003-white-positive-scores.md`](docs/decisions/0003-white-positive-scores.md)):

- A score changes frame in exactly two functions, both in `engine-protocol`:
  `normaliseInfo` takes engine-perspective UCI output to White-positive at the
  reader boundary, and `toMover` takes White-positive to mover-relative. Nothing
  else negates a score.
- `WhiteScore` and `MoverScore` are branded in **both directions**: neither is
  assignable to the other, so a mover-relative value cannot reach a
  `WhiteScore`-typed slot (the wire, the database, the cache) any more than a
  White-positive one can reach `winPercent`. Build a `WhiteScore` only through
  `WhiteScore.cp`, `WhiteScore.mate` and `WhiteScore.terminal`; a `MoverScore`
  only through `toMover`. The two casts that attach the brand live in
  `packages/engine-protocol/src/score.ts` and nowhere else.
- A mover-relative terminal score reads `win | loss | draw`, never a colour.
  Only `WhiteScore` carries `white | black | draw`.
- UCI `mate 0` means the side to move is already checkmated; `normaliseInfo`
  reports it as the terminal result, because a White-positive mate with zero
  plies has no sign. `WhiteScore.mate(0)` throws.
- A `lowerbound` or `upperbound` swaps when the sign flips; `InfoLine.scoreBound`
  is already oriented for White.

### The classification pipeline (§6.0) — four passes, one direction

0 Replay → 1 Sweep (the only engine pass) → 2 Context → 3 Classify → 4 Report.
**Pass 2 may read Pass 1's numbers; it may never read Pass 3's labels.** That is
what keeps Pass 3 pure and parallelisable. Any future signal that appears to need
a neighbouring ply's *label* must instead be expressed as a threshold on that
ply's `loss`. If you genuinely need a label, add a Pass 3.5 — do not make Pass 3
sequential.

## 4. Fixed decisions

Condensed from **§0.2**. Settled. Do not relitigate mid-build; if one turns out
wrong, change it in a decision record (§16) and note the version.

| Area | Decision |
|---|---|
| Licence | AGPL-3.0-or-later for the whole repository. `LICENSE` + `NOTICES`. |
| Runtime | Node 22 LTS, pinned in `.nvmrc` and root `engines`. |
| Package manager | pnpm 9, pinned via `packageManager`. |
| Monorepo | pnpm workspaces + Turborepo. |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, target `ES2022`. |
| Module resolution | **Overridden, deliberately** — see below. |
| Lint + format | Biome. One tool, one config at the root. No ESLint/Prettier. |
| Unit + integration tests | Vitest. `@vitest/browser` only where a real Web Worker is needed. |
| E2E | Playwright, Chromium **and WebKit** — WebKit specifically because of §5.2.1. |
| Hashing | `@noble/hashes/blake3`. Pure TS, byte-identical in browser and Node. Cache keys must match across tiers. |
| ECO data | `lichess-org/chess-openings` (CC0), **vendored at a pinned commit** into `packages/openings`, never fetched at build time. |
| Piece art | Cburnett (CC-BY-SA 3.0) as default plus one alternative, bundled as static SVG. |
| Classification icons | Original SVG, drawn in-repo. Never derived from chess.com artwork (§2.4). |
| Board renderer | `@lichess-org/chessground` (the **scoped** package; the unscoped `chessground` is deprecated), pinned exactly. |
| Chess rules | `chess.js` — but **not** for SEE (§6.5.1). |
| CI | GitHub Actions. The §13 performance assertion is a regression alarm, not a benchmark. |
| Commits | Conventional Commits. Merge commits, **never squash**. |
| Decision records | `docs/decisions/NNNN-title.md`, four fixed headings (§16). |

### The one authorised override: module resolution

§0.2 fixes `moduleResolution: "bundler"`. That is correct for `apps/web` and
unsafe for the shared packages, because §4.2 requires `analysis-core` to run
unchanged in a Web Worker **and** in Node. Bundler resolution accepts
extensionless relative imports; Node's ESM loader rejects them at runtime — so
the failure would surface in Phase 3 rather than at compile time.

Therefore, per workspace:

- `apps/web` → `module: ESNext`, `moduleResolution: bundler`.
- the four packages → `module: nodenext`, `moduleResolution: nodenext`, so the
  compiler enforces explicit `.js` extensions on relative imports (TS2835).

`tsconfig.base.json` holds everything else and deliberately sets no `module` or
`moduleResolution`. Full reasoning:
[`docs/decisions/0002-module-resolution.md`](docs/decisions/0002-module-resolution.md).

**Build outputs.** Packages compile with `tsc` to `dist`; `exports` and `types`
point only at the built output. There is exactly one resolution path for a given
import — the web app, Vitest and Node all resolve identically. No `src`/`dist`
dual-resolution aliasing, ever. Turbo orders it: `build`, `typecheck` and `test`
all `dependsOn: ["^build"]`.

### Not configured yet, on purpose

- **Cross-origin isolation headers** for the Vite dev server. §5.2.1 is emphatic
  that they be set for `server` **and** `preview` before the first engine call:
  without them `crossOriginIsolated` is false on localhost, `SharedArrayBuffer`
  is undefined, and the tier detector silently drops to single-threaded — a day
  lost to profiling threads that were never enabled. §11 assigns this to
  **Phase 0b**, together with the loud dev-only assertion. It is not in
  `apps/web/vite.config.ts` yet.
- **GitHub Actions and Playwright** — prompt 0a.2.
- **`apps/web` has no `test` script.** A real React smoke test needs a DOM
  environment, and nothing yet justifies the dependency. The four packages carry
  the unit tests; the web app is covered by Playwright from 0a.2.

## 5. Package graph

§4.2 states it in prose:

> Its only workspace dependencies are `engine-protocol` and `chess-utils`, and
> neither may import from `analysis-core` — the dependency graph among packages
> stays acyclic and shallow.

`tools/check-deps.mjs` enforces it.

```
apps/web ─┐
apps/api ─┼─→ any packages/*        (apps may depend on packages, never on another app)
apps/engine-worker ─┘

packages/analysis-core ──→ packages/engine-protocol
                       └─→ packages/chess-utils

packages/engine-protocol   (leaf)
packages/chess-utils       (leaf)
packages/openings          (leaf)
packages/db                (leaf, Phase 3)
```

The rules, all enforced:

- `analysis-core` may depend **only** on `engine-protocol` and `chess-utils`.
- Neither `engine-protocol` nor `chess-utils` may depend on `analysis-core`.
- No `packages/*` workspace may depend on an app or a tool — the layering runs
  one way.
- The graph stays **acyclic** and **shallow** (at most 2 edges deep).
- Internal edges use the `workspace:` protocol, so a published package can never
  be silently substituted for the local one.
- Every workspace under `packages/` needs an explicit entry in `PACKAGE_POLICY`
  in `tools/check-deps.mjs`. A new package with no entry is a hard failure, not
  a default-allow: adding a package means stating what it may import.

```sh
pnpm check:deps
```

To widen the graph you edit `PACKAGE_POLICY` and cite the spec section that
permits the new edge. Do not widen it silently, and do not work around it.

One honest caveat about that table. §4.2 constrains `analysis-core` and requires
the graph to be acyclic and shallow; it does **not** itself say that
`chess-utils` and `openings` import nothing. Their empty entries are a
deliberate tightening — a package starts as a leaf and an edge is added on
purpose. The likeliest future edge is `openings → chess-utils`, because §8.1
keys the `openings` table on `fen_hash` and §8.2 puts `fenHash` in
`chess-utils`. Add it when the code needs it, and record §8.2 as the reason.

What each package holds. `chess-utils` and `openings` are stubs today, exporting
only a `PACKAGE_NAME` constant that their smoke test asserts, so a broken build
or a broken `exports` map fails loudly rather than silently producing an empty
`dist`. `engine-protocol` and `analysis-core` carry real code since prompt 0b.1
and pin their runtime export surface in a test instead.

| Package | Contents | Phase |
|---|---|---|
| `engine-protocol` | `WhiteScore` (type and constructors), `MoverScore`, `SideToMove`, `toMover`, `parseInfo`, `normaliseInfo`, `InfoLine`, `PvLine`, `UciSyntaxError`. `RawInfoLine` never leaves this package (§5.5, §5.6). **Landed in 0b.1.** | 1 |
| `chess-utils` | Own 0x88/mailbox board, `attackersTo` **with x-ray attackers**, the SEE swap algorithm and its ≥40-position golden suite (§6.5.1), `fenHash` + `HASH_VERSION` (§8.2), PGN normalisation. Budget a week, not an afternoon. | 1 |
| `openings` | `lichess-org/chess-openings` vendored at a **pinned commit** (CC0, five TSV files by ECO volume), plus the lookup trie the Pass 0 replay walks for `inBook` and the ECO code. | 1 |
| `analysis-core` | `winPercent`, `accuracyPercent` (**landed in 0b.1**), then the four passes of §6.0, `classify` and the game report. Pure, synchronous, dependency-light — which is why it compiles under `nodenext`. | 1 |

`apps/api`, `apps/engine-worker` and `packages/db` do not exist yet. Per §11,
`apps/api` and `packages/db` arrive in **Phase 3** (Fastify, Postgres, Drizzle,
Better Auth, the two roles of §3.3) and `apps/engine-worker` in **Phase 5** (the
server engine tier: BullMQ, the native Stockfish pool, `position_cache`). The
workspace globs and the policy table already cover all three.

## 6. Never do this

- **Never let a client-computed evaluation reach `position_cache`** (§3.3). Not
  via an endpoint, not via the claim flow of §8.5, not for an authenticated user,
  not for your own account. The claim endpoint is exactly the vector this rule
  exists to close, and it is the one place a reviewer will be tempted to open it.
- **Never bring chess.com artwork, thresholds or Game Review labels into this
  repository** (§2.4). Not the move-quality glyphs, not the piece sets, board
  themes or sounds, not the undisclosed classification thresholds, and not the
  Game Review labels — those sit behind authentication and scraping them
  breaches the ToS. Draw your own icons; derive your own thresholds from
  win-probability (§6); calibrate against Lichess NAGs plus a hand-labelled set
  (§6.6). Do not clone their palette either (§7.4).
- **Never change `fenHash` normalisation without bumping `HASH_VERSION` and
  documenting a full cache rebuild** (§8.2). The bucketing is also what makes the
  Lichess CC0 seed compatible (§3.4), so a change silently invalidates the entire
  cache *and* breaks seeding. Keep the test that asserts a Lichess-format
  four-field FEN and its full equivalent hash identically.
- **Never call the engine on a terminal position** (§6.2.1). Pass 0 marks
  terminal status; Pass 1 skips the engine and synthesises a
  `{ kind: 'terminal', … }` score. A naive implementation either hangs waiting
  for `bestmove` or records garbage for the final ply of every decisive game —
  which is exactly the ply users most want graded. Terminal scores are **never
  written to `position_cache`**: they are a property of the game's history, not
  of the position. Resignation, timeout, abandonment and agreement produce a
  **non-terminal** final position and are searched normally.
- **Never flip a score's sign outside `normaliseInfo` and `toMover`** (§5.6) —
  the first takes engine output to White-positive, the second White-positive to
  mover-relative — and never persist, transmit, cache or render a mover-relative
  number. Never build a `WhiteScore` or `MoverScore` by object literal or cast
  outside `packages/engine-protocol/src/score.ts`; go through `WhiteScore.cp`,
  `WhiteScore.mate`, `WhiteScore.terminal` and `toMover`.
- **Never let Pass 2 read a Pass 3 label** (§6.0). See section 3 above.
- **Never ship two different engine binaries under one `engine_version` string**
  (§5.1). Format is `sf19-{tier}-{buildHash8}`. This corrupts the cache in a way
  you will not be able to unpick afterwards.
- **Never offer MultiPV = 1 for a classified analysis** (§6.4.1) — `isOnlyGoodMove`
  is then always false and Great can never fire. Enforce MultiPV ≥ 2 in the job
  schema, not by trusting the caller.
- **Never expose a free-form depth input** (§8.3). Canonical depths only —
  `{12, 16, 18, 20, 24, 30}` — surfaced as named presets. Arbitrary depths
  fragment the cache into near-uselessness.
- **Never re-label an old analysis under new thresholds** (§6.6, §12). Version
  the thresholds instead.
- **Never switch COEP to `require-corp`** to buy Safari threading (§5.2.1). It
  would break OAuth popups and third-party images for everyone. Single-threaded
  WASM on Safari is an accepted outcome; a broken login flow is not. Revisiting
  it is a decision record, not a silent flag flip.
- **Never build SEE on chess.js** (§6.5.1). `moves({ verbose: true })` per square
  is two orders of magnitude more work than needed, and missing x-ray attackers
  produces false Brilliants on moves that are simply losing material.

## 7. Conventions

**Commits.** [Conventional Commits](https://www.conventionalcommits.org/). Cite
spec sections in the body where a change traces to one.

> **Never commit anything yourself. Wait for explicit approval from the user,
> every single time.** Stage nothing, commit nothing, push nothing, and open no
> PR until told to. Show the diff and the proposed message, then stop.

**Branches.** One feature branch per prompt. **The user creates and manages the
branch before each prompt** — do not create, switch, rebase or delete branches.

**Merge commits, never squash** (§0.2). Every commit on a feature branch lands
in `main` history unsquashed, so **each commit must stand on its own**: it builds,
its own checks pass, and it makes sense read in isolation. Commit in logical
units, not one blob at the end.

**Decision records.** `docs/decisions/NNNN-short-title.md`, four fixed headings —
**Context, Decision, Consequences, Status** (`accepted` / `superseded by NNNN`).
Numbered sequentially, **never renumbered, never deleted**; a superseded record
stays and gains a pointer to its replacement. Copy
[`0000-template.md`](docs/decisions/0000-template.md).

Write one when a choice would otherwise only be visible by reading the code and
would surprise someone six months later. §16 names the minimum set: the licence;
the White-positive convention; SEE ignoring pins; the halfmove bucketing
threshold; the canonical depth ladder; the Safari threading trade-off; the
Miss-outranks-Blunder precedence; the chosen blunder threshold after calibration.
Do **not** write one for routine implementation choices — if the code is
self-evident the record is noise, and a directory of noise is a directory nobody
reads.

**NOTICES.** Any dependency carrying an attribution requirement is added to
[`NOTICES`](NOTICES) **in the same commit that adds the dependency**, never later
(§2.3). Because commits are not squashed, deferring the entry leaves a commit in
`main` that ships a dependency with no attribution. The obligation follows the
bytes, so transitive dependencies that reach users are listed too.

**Dependencies.** Add nothing the current phase does not require. Shared
versions are pinned once in `pnpm-workspace.yaml`'s `catalog:` and referenced as
`catalog:` from each workspace — bump in one place, not five.

**No comments in code.** Source, config and script files carry no comments — no
`//`, no `/* */`, no JSDoc, no JSONC comments in a `tsconfig.json`, no `#` in
`pnpm-workspace.yaml`. **`.gitignore` is the single exception**; its section
headers stay.

Explanation lives where it can be found and reviewed instead: this file for
conventions and invariants, `docs/decisions/` for anything that needs a
rationale, and the spec for everything it already settles. Where a rule is
enforced by code, the enforcement message carries the citation —
`tools/check-deps.mjs` prints the §4.2 reference to whoever violates it, which
reaches them at the moment it matters rather than sitting in a file nobody
opens.

So: name things so that no comment is wanted. If a piece of code genuinely
cannot be followed without prose, the prose belongs in a decision record, and
the record's existence is the signal that the code is subtle.

**Type-level tests.** A guarantee the compiler provides is tested with
`expectTypeOf` from Vitest inside an ordinary `*.test.ts` file —
`expectTypeOf<MoverScore>().not.toExtend<WhiteScore>()`. Each package's
`tsconfig.json` includes its tests, so `pnpm typecheck` fails the moment such an
assertion stops holding, and `pnpm test` runs the file as a no-op. Do not reach
for `@ts-expect-error`: it is a comment, `check:comments` rejects it, and it
would take the assertion out of the type checker's normal path anyway.

**Property tests.** `fast-check`, pinned once in the catalog and added as a
`devDependency` of each package that uses it. Development-only and never
shipped, so it needs no `NOTICES` entry (§2.3). Use it for the invariants §13
names — ranges, symmetries, round trips — alongside, never instead of, the
fixed-point cases that pin the constants.

## Commands

```sh
pnpm install
pnpm dev          # package watch builds + Vite dev server
pnpm typecheck    # tsc, every workspace
pnpm lint         # biome check (lint + format), whole repo, one root config
pnpm format       # biome, rewrites in place
pnpm build        # tsc -> dist; vite build for the web app
pnpm test         # vitest, per package
pnpm check:deps   # §4.2 package graph guard
```

`pnpm dev` needs the packages built once first; the turbo `dev` task declares
`dependsOn: ["^build"]` so that happens automatically.
