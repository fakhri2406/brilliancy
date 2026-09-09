# 0002 — `nodenext` module resolution for the shared packages, `bundler` for the web app

## Context

§0.2 fixes `moduleResolution: "bundler"` for the project's TypeScript. That is
the right setting for `apps/web`, which is compiled by Vite and never resolved by
Node.

It is the wrong setting for the four shared packages, because of a requirement
stated one section later. §4.2:

> `@brilliancy/analysis-core` is the heart of the project. It must be pure,
> synchronous, and dependency-light so it runs unchanged in a Web Worker and in
> Node.

Two runtimes, one build output. The conflict is narrow and mechanical:

- Under `bundler` resolution the compiler **accepts extensionless relative
  imports** — `import { x } from './helper'` typechecks and is emitted verbatim
  into `dist/index.js`.
- **Node's ESM loader rejects that specifier at runtime.** It does no extension
  guessing. `ERR_MODULE_NOT_FOUND`.

So `bundler` in the shared packages produces a build that is green in CI, green
in the browser, and broken the first time anything imports it from Node. The
failure surfaces in Phase 3 (§11), when `apps/api` first loads `analysis-core`
in Node — weeks after the import was written, in a package nobody was editing.
It surfaces again in Phase 5 with `apps/engine-worker`. And it does not wait for
either: `tools/calibrate/` (§6.6) and `tools/seed-cache/` (§3.4) are Node
programs that import `chess-utils`, and §0.2's test runner executes
`analysis-core`'s own suite in Node.

This is the cheapest possible class of bug to prevent and one of the more
annoying to diagnose, and it is prevented by a compiler flag rather than by
discipline.

## Decision

Module resolution is set **per workspace**, not globally. `tsconfig.base.json`
deliberately contains no `module` or `moduleResolution` at all; everything else
from §0.2 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `target: ES2022`) stays shared.

| Workspace | `module` | `moduleResolution` |
|---|---|---|
| `apps/web` | `ESNext` | `bundler` — §0.2 unchanged |
| `packages/engine-protocol` | `nodenext` | `nodenext` |
| `packages/chess-utils` | `nodenext` | `nodenext` |
| `packages/openings` | `nodenext` | `nodenext` |
| `packages/analysis-core` | `nodenext` | `nodenext` |

This is a deliberate, scoped override of one cell of §0.2's TypeScript row. It
is not a licence to relitigate the rest of that row.

Under `nodenext` the compiler rejects an extensionless relative import outright:

```
error TS2835: Relative import paths need explicit file extensions in ECMAScript
imports when '--moduleResolution' is 'node16' or 'nodenext'.
Did you mean './helper.js'?
```

Relative imports inside the four packages therefore carry an explicit `.js`
extension — pointing at the emitted file, from the `.ts` source. That is correct
under both runtimes and is what Node needs.

Two supporting rules make this hold end to end:

- Each package's `exports` and `types` point only at `dist`. There is no
  `src`-to-`dist` alias anywhere — not in Vite, not in Vitest, not in a
  `tsconfig` path mapping. A given import has exactly one resolution path,
  identical for the web app, the test runner and Node. Deleting a package's
  `dist` makes its consumers fail to resolve, which is the honest behaviour.
- Turborepo orders the work: `build`, `typecheck` and `test` all declare
  `dependsOn: ["^build"]`, so a dependency's `dist` exists before anything reads
  it.

## Consequences

- Relative imports in `packages/*` must be written `./thing.js` even though the
  file on disk is `thing.ts`. This looks wrong to anyone who has only worked in
  bundler-resolved code. It is correct, and the compiler enforces it, so it
  cannot rot.
- `apps/web` keeps extensionless relative imports. The two conventions coexist
  and the difference is visible in each `tsconfig.json`.
- Package code must resolve cleanly under Node's ESM rules, which means no
  bundler-only tricks in `packages/*`: no importing CSS or assets, no
  extensionless directory imports, no reliance on a bundler's `mainFields`
  ordering.
- Anything genuinely browser-only stays in `apps/web`. §4.2 already requires
  this of `analysis-core`; the flag now makes a violation a compile error rather
  than a runtime surprise.
- Verify the rule is live by adding an extensionless relative import to any of
  the four packages and running `pnpm typecheck`: it must fail with TS2835.

To reverse this, `analysis-core` would have to stop being required to run in
Node — which would mean the API and engine-worker no longer share the
classification code, i.e. abandoning the single fact §4.1 says drives the whole
stack decision. It is not a flag flip.

## Status

`accepted`
