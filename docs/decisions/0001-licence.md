# 0001 — Licence the entire repository AGPL-3.0-or-later

## Context

Two of this project's load-bearing dependencies are copyleft, and both were
chosen before the licence question (§2.1, §2.2):

- **Stockfish is GPL-3.0-or-later.** Shipping it — as a WASM bundle to the
  browser, or as a native binary inside a Docker image — makes the combined work
  a derivative work under the FSF's reading, and the Stockfish project has
  enforced this against commercial vendors before (§2.1).
- **Chessground is GPL-3.0-or-later and says so specifically for websites.** Its
  README states that using it for your website makes the combined work
  distributable only under the GPL, and that you must therefore release your
  source to the users of your website. `@lichess-org/stockfish-web` is
  AGPL-3.0-or-later (§2.2).

Brilliancy is a hosted web application. Under plain GPL there is a real argument
that network use is not distribution, which would leave the obligation to users
of the hosted service ambiguous — exactly the gap that matters here (§2.3).

Getting this wrong is called out in §2 as "the single most likely way this
project ends badly", and §14 puts it first in the immediate next steps: the
licence lands before anything else.

## Decision

**The entire repository is licensed AGPL-3.0-or-later** (§0.2, §2.3).

- `LICENSE` holds the verbatim GNU AGPL v3 text as published by the FSF at
  <https://www.gnu.org/licenses/agpl-3.0.txt>.
- `NOTICES` sits alongside it and carries the attribution convention: any
  dependency with an attribution requirement is added in the same commit that
  adds the dependency, never later (§2.3).
- AGPL over plain GPL specifically to close the network-use gap, which is what
  Lichess does.

## Consequences

Accepted up front (§2.3):

- Brilliancy **cannot later be relicensed** to build a closed-source commercial
  version without rewriting the GPL parts. This is not recoverable by a later
  decision record; it would be a rewrite.
- **Anyone may fork and host it.** This is fine and is how Lichess-adjacent
  tools thrive.
- **AGPL §13 applies to the deployment, not just the repository.** Every operator
  of a modified version must offer its users that version's corresponding source.
  The hosted app therefore has to carry a working source link, and `README.md`
  states the obligation.
- `NOTICES` becomes a standing commit-time obligation, not a document someone
  tidies before launch.

Separate from the licence but part of the same discipline (§2.4): no chess.com
artwork, piece sets, sounds, classification thresholds, or Game Review labels
enter this repository at all. Those are copyright and terms-of-service problems
that an AGPL licence does nothing to solve. Classification icons are original
SVG drawn in-repo (§0.2).

## Status

`accepted`
