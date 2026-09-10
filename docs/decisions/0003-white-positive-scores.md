# 0003 — White-positive scores everywhere, mover-relative only inside `analysis-core`

## Context

Version 1.0 of the spec stated two incompatible rules as law: §5.5 normalised
engine output to White-positive at the parser boundary, and §6.1 fed a
side-to-move score into `winPercent`. §5.6 in 1.1 resolves this as "the one law"
[R-1]: every score that is stored, transported, cached, logged or rendered is
White-positive, and the mover's perspective exists only inside `analysis-core`,
only for one classification, produced by one function. This record is the
§16-mandated record of that convention and of the choices made while making it
unrepresentable in the type system rather than avoided by discipline.

Four things forced choices the spec's sketch does not settle:

- **The sketch's branding is one-directional.** §5.6 writes
  `MoverScore = WhiteScore & { __mover }`. That blocks a `WhiteScore` from
  reaching a `MoverScore` slot — the direction that fixes the 1.0
  contradiction — but a `MoverScore` is structurally a `WhiteScore` and flows
  into any `WhiteScore`-typed slot: `move_evals.score_cp`, the API body, the
  cache row. Rule 4 of §5.6 forbids exactly that, and the type system as
  sketched does not enforce it.
- **A colour name in the mover frame.** §6.1's `winPercent` reads a terminal
  `outcome === 'white'` as 100 and calls it "pre-oriented by toMover". A
  reorientation that is missed, or applied to only some cases, falls through
  unchanged and silently inverts the grade on the final ply of every game Black
  wins — the ply §6.2.1 says users most want graded.
- **Mate distances arrive in moves from the side to move.** UCI `mate n` is in
  moves; §5.6 rule 2 requires plies, with the `2n − 1` / `2n` asymmetry, and
  §6.1 reads only the sign.
- **Two frame changes, not one.** The engine reports from the side to move, so
  the parser boundary must flip for Black as well. §5.6's "only `toMover`
  flips" is true of the White-to-mover step; it is silent about the
  engine-to-White step, which is the same negation in the other direction.

## Decision

1. **Two frames, two functions.** A score changes frame in exactly two places,
   both in `@brilliancy/engine-protocol`: `normaliseInfo` takes
   engine-perspective UCI output to White-positive as the line leaves the
   reader, and `toMover` takes White-positive to mover-relative. Nothing else in
   the repository negates a score. Pass 2 of §6.0, `winPercent`, the database,
   the API and the eval bar consume either a `WhiteScore` or the `MoverScore`
   that `toMover` returned.

2. **The brand is bidirectional.** `WhiteScore` and `MoverScore` share the
   `cp` and `mate` bodies but each carries a phantom key `[perspective]` whose
   type is the literal `'white'` or `'mover'`. `perspective` is a
   `declare const … : unique symbol` that never exists at runtime; the objects
   are plain `{ kind, … }` records, so structured clone and JSON carry a
   `WhiteScore` across a Web Worker boundary or the wire unchanged. Because the
   two literals differ, neither type is assignable to the other, and the error
   message names the mismatch:
   `Type '"mover"' is not assignable to type '"white"'`. Type-level tests assert
   both directions and that an unbranded object literal is neither.

3. **Construction is confined.** A `WhiteScore` is built only through
   `WhiteScore.cp`, `WhiteScore.mate` and `WhiteScore.terminal`; a
   `MoverScore` only through `toMover`. The two casts that attach the brand are
   `asWhite` and `asMover` in `packages/engine-protocol/src/score.ts`, and no
   other file casts to either type. `WhiteScore.cp` rejects a non-finite number;
   `WhiteScore.mate` rejects zero and non-integers.

4. **The mover's terminal vocabulary is `win | loss | draw`.** Only `WhiteScore`
   carries `white | black | draw`. `toMover` maps one to the other through a
   total table keyed by side to move and outcome, so a missing case is a
   compile error rather than a value that passes through unchanged. This
   follows §6.2.1's prose — "maps `white`/`black` to a mover-relative
   win/loss" — rather than the §6.1 sketch's `outcome === 'white'`.

5. **Mate is stored in signed plies.** `plies = n > 0 ? 2n − 1 : 2n`, computed
   from the engine's `mate n`, then given the White-positive sign. The
   magnitude is never re-based across plies; only the sign is read today.

6. **UCI `mate 0` is a checkmated root, not a mate score.** Stockfish emits
   `info depth 0 score mate 0` when asked to search a position in which the
   side to move is already checkmated. A White-positive mate with zero plies
   has no sign and therefore no meaning, so `normaliseInfo` reports it as the
   terminal result: `mate 0` with White to move is `terminal 'black'`. §6.2.1
   still forbids Pass 1 from searching a terminal position; this covers the
   interactive board and any other caller that does.

7. **A bound flips with the sign.** A `lowerbound` reported for Black to move is
   an upper bound on White's score. `InfoLine.scoreBound` is carried and
   swapped for Black; `wdl` is not parsed, because it would need the same
   reorientation and nothing reads it.

8. **§6.1's formulas are used verbatim.** `winPercent` uses slope
   `0.00368208` on centipawns clamped to ±1000; `accuracyPercent` uses
   `103.1668`, `0.04354` and `3.1669`. They are Lichess's published values and
   Phase 2 calibration (§6.6) depends on them being exactly these.

## Consequences

- A score cannot be written as an object literal anywhere outside `score.ts`;
  call sites read `WhiteScore.cp(34)`. A database row or a JSON payload becomes
  a `WhiteScore` through the constructors, or through one deliberate cast in
  one deserialiser, which is a review item when Phase 3 arrives.
- A `MoverScore` cannot be persisted, sent or cached by accident: every
  `WhiteScore`-typed slot rejects it at compile time, and the only mover values
  in existence are those `toMover` returned inside `analysis-core`.
- `RawInfoLine` is not exported by name from `engine-protocol`, and no
  `WhiteScore`-typed slot accepts one. Its structure is visible through
  `ReturnType<typeof parseInfo>`, as any exported function's is; the defence
  against it flowing downstream is that it is not a score type at all and its
  fields are named `rawCp` and `rawMateMoves`.
- **Mate flattening, accepted per §6.1.** Every mate reads 100 or 0, so a
  mate-in-3 that becomes a mate-in-9 registers zero loss, and a mate that
  becomes +5.00 registers a 13.7-point loss (100 − 86.3). The ±1000 clamp caps
  a centipawn score at 97.54 win%, so even mate to +10.00 registers 2.46
  points. Grading within a mate sequence is a separate signal (§15), never a
  bent `winPercent`.
- One sentence in §6.1 is wrong about the clamp's effect: it says that without
  the clamp +40 and +12 "both saturate to 100%". Without the clamp they differ
  (98.8 against 100.0); with it they are identical at 97.54. The clamp stays
  because the formula is Lichess's and calibration depends on it; the
  justification in the spec text should not be relied on.
- The compiler is the test. Type guarantees are asserted with `expectTypeOf`
  in ordinary test files, which `pnpm typecheck` checks because each package's
  `tsconfig.json` includes its tests. `@ts-expect-error` is unavailable — it is
  a comment, and `check:comments` rejects it.
- Reversing any of this means either removing the brand, which makes the 1.0
  contradiction representable again, or changing the stored frame, which
  invalidates every persisted score and the shared cache. Neither is a flag
  flip; both would be a new record superseding this one.

## Status

`accepted`
