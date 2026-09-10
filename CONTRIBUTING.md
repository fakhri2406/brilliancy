# Contributing

The conventions below are the ones CI enforces. Where a rule has a reason, the
reason lives in [`CLAUDE.md`](CLAUDE.md), in [`docs/decisions/`](docs/decisions/)
or in the spec — cite the section rather than repeating the argument here.

Read [`CLAUDE.md`](CLAUDE.md) before your first change. It is short enough to
read in full and it exists so you do not need the spec open to avoid the
expensive mistakes.

## Branches

One branch per unit of work, cut from `main`, named `type/short-slug` where
`type` is the Conventional Commit type the branch is mostly made of:

```
chore/ci
feat/uci-parser
fix/mate-ply-sign
docs/decision-0003
```

Open one pull request per branch, targeting `main`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). The type set is
the `@commitlint/config-conventional` default — `feat`, `fix`, `docs`, `chore`,
`refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`. Scope is optional
and names the workspace or area: `feat(engine-protocol):`, `ci:`, `docs(spec):`.

Cite spec sections in the body wherever a change traces to one. "Per §6.2.1" is
a complete justification; "seemed right" is not.

**Merge commits, never squash** (§0.2). Every commit on a branch lands in `main`
history intact, so **each commit has to stand on its own**: it builds, its own
checks pass, and it reads sensibly in isolation. Commit in logical units as you
go rather than one blob at the end. If a commit adds a dependency, that same
commit updates [`NOTICES`](NOTICES); if it introduces a non-obvious choice, that
same commit adds the decision record.

Two things enforce the message format, because both are needed under a
no-squash policy:

- a `commit-msg` hook (husky) rejects a malformed message at commit time;
- CI re-checks **every commit in the pull request range**, not just the head
  commit or the pull request title.

The hook is installed by `pnpm install` via the `prepare` script. If it is not
firing, check `git config core.hooksPath` — it should be `.husky/_`.

## Decision records

`docs/decisions/NNNN-short-title.md`, four fixed headings — **Context**,
**Decision**, **Consequences**, **Status** (`accepted` / `superseded by NNNN`).
Numbered sequentially, **never renumbered, never deleted**; a superseded record
stays and gains a pointer to its replacement. Copy
[`0000-template.md`](docs/decisions/0000-template.md).

Write one when a choice would otherwise only be visible by reading the code and
would surprise someone six months later (§16). Do **not** write one for routine
implementation choices — a directory of noise is a directory nobody reads.

## Attribution

Any dependency carrying an attribution requirement is added to
[`NOTICES`](NOTICES) **in the same commit that adds the dependency**, never later
(§2.3). Because commits are not squashed, deferring the entry leaves a commit in
`main` that ships a dependency with no attribution. The obligation follows the
bytes, so transitive dependencies that reach users are listed too;
development-only tooling that is never distributed is not.

## No comments in code

Source, config and script files carry no comments — no `//`, no `/* */`, no
JSDoc, no JSONC comments in a `tsconfig.json`. `.gitignore` is the single
exception. Explanation belongs where it can be found and reviewed:
[`CLAUDE.md`](CLAUDE.md) for conventions and invariants,
[`docs/decisions/`](docs/decisions/) for anything needing a rationale, the spec
for everything it already settles. Name things so that no comment is wanted.

`pnpm check:comments` enforces this for `.ts`, `.tsx`, `.js` and `.jsx` using the
TypeScript scanner, so a URL inside a string literal is not mistaken for a
comment. JSON, YAML and shell files stay review-enforced.

## The package graph

`analysis-core` may depend only on `engine-protocol` and `chess-utils`; nothing
under `packages/` may depend on an app or a tool; the graph stays acyclic and
shallow (§4.2). Every workspace under `packages/` needs an explicit entry in
`PACKAGE_POLICY` in [`tools/check-deps.mjs`](tools/check-deps.mjs) — a new
package with no entry is a hard failure, not a default-allow.

To widen the graph, edit `PACKAGE_POLICY` and cite the spec section that permits
the new edge. Do not widen it silently, and do not work around it.

## Before opening a pull request

```sh
pnpm install
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs the six checks the `verify` CI job runs, in the same order:
`check:deps`, `check:comments`, `lint`, `typecheck`, `build`, `test`. If it is
green locally and red in CI, the setup is wrong — say so rather than working
around it. The one thing that job adds is the commit-message check over the pull
request range, which needs a pull request to have a range; the `commit-msg` hook
covers the same ground locally, one commit at a time.

`pnpm test:e2e` is separate because it downloads browsers and is slow. It runs
Playwright in **Chromium and WebKit**. WebKit is not optional: §5.2.1 makes
Safari a permanently different execution path for this product — no
`SharedArrayBuffer`, no multi-threaded engine tier — and the suite exists so that
path is never untested. On a first run, install the two browsers:

```sh
pnpm exec playwright install chromium webkit
```

Individual commands, when you want to run one on its own:

```sh
pnpm check:deps
pnpm check:comments
pnpm lint
pnpm format
pnpm typecheck
pnpm build
pnpm test
```

Node and pnpm versions come from [`.nvmrc`](.nvmrc) and the root
`packageManager` field. CI reads both from those files, so the two cannot drift.
