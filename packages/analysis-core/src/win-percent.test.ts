import {
  type MoverScore,
  type SideToMove,
  type TerminalOutcome,
  toMover,
  WhiteScore,
} from '@brilliancy/engine-protocol';
import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { winPercent } from './win-percent.js';

const forWhite = (score: WhiteScore): number => winPercent(toMover(score, 'w'));
const forBlack = (score: WhiteScore): number => winPercent(toMover(score, 'b'));

describe('winPercent on centipawns, against the §6.1 curve', () => {
  it.each([
    [0, 50],
    [50, 54.589644],
    [100, 59.10259],
    [200, 67.621164],
    [300, 75.11255],
    [500, 86.307166],
    [1000, 97.544744],
    [-100, 40.89741],
    [-500, 13.692834],
    [-1000, 2.455256],
  ])('maps %i centipawns for the mover to %f', (cp, expected) => {
    expect(forWhite(WhiteScore.cp(cp))).toBeCloseTo(expected, 5);
  });

  it('is exactly 50 in an equal position', () => {
    expect(forWhite(WhiteScore.cp(0))).toBe(50);
    expect(forBlack(WhiteScore.cp(0))).toBe(50);
  });

  it('clamps at ten pawns, so every larger advantage reads the same', () => {
    expect(forWhite(WhiteScore.cp(5000))).toBe(forWhite(WhiteScore.cp(1000)));
    expect(forWhite(WhiteScore.cp(1_000_000))).toBe(forWhite(WhiteScore.cp(1000)));
    expect(forWhite(WhiteScore.cp(-5000))).toBe(forWhite(WhiteScore.cp(-1000)));
  });

  it('never reaches 100 or 0 on centipawns alone', () => {
    expect(forWhite(WhiteScore.cp(1000))).toBeLessThan(100);
    expect(forWhite(WhiteScore.cp(-1000))).toBeGreaterThan(0);
  });
});

describe('winPercent on mate', () => {
  it('reads the sign and nothing else', () => {
    expect(forWhite(WhiteScore.mate(1))).toBe(100);
    expect(forWhite(WhiteScore.mate(99))).toBe(100);
    expect(forWhite(WhiteScore.mate(-2))).toBe(0);
    expect(forWhite(WhiteScore.mate(-100))).toBe(0);
  });

  it('gives the side being mated zero and the side mating a hundred', () => {
    expect(forBlack(WhiteScore.mate(1))).toBe(0);
    expect(forBlack(WhiteScore.mate(-2))).toBe(100);
  });

  it('flattens every mate to the same value, which is the artifact §6.1 accepts', () => {
    expect(forWhite(WhiteScore.mate(5)) - forWhite(WhiteScore.mate(17))).toBe(0);
    expect(100 - forWhite(WhiteScore.cp(500))).toBeCloseTo(13.692834, 5);
  });
});

describe('winPercent on terminal positions', () => {
  it('scores a game White won as 100 for White', () => {
    expect(forWhite(WhiteScore.terminal('white'))).toBe(100);
  });

  it('scores a game White won as 0, not 100, when Black is the mover being graded', () => {
    expect(forBlack(WhiteScore.terminal('white'))).toBe(0);
  });

  it('scores a game Black won as 100 for Black and 0 for White', () => {
    expect(forBlack(WhiteScore.terminal('black'))).toBe(100);
    expect(forWhite(WhiteScore.terminal('black'))).toBe(0);
  });

  it('scores a draw as 50 for both', () => {
    expect(forWhite(WhiteScore.terminal('draw'))).toBe(50);
    expect(forBlack(WhiteScore.terminal('draw'))).toBe(50);
  });
});

describe('winPercent accepts a MoverScore only (§5.6 rule 3)', () => {
  it('is typed to take a MoverScore', () => {
    expectTypeOf(winPercent).parameter(0).toEqualTypeOf<MoverScore>();
  });

  it('refuses a WhiteScore, including the members that carry no colour vocabulary', () => {
    expectTypeOf<WhiteScore>().not.toExtend<Parameters<typeof winPercent>[0]>();
    expectTypeOf<Extract<WhiteScore, { kind: 'cp' }>>().not.toExtend<
      Parameters<typeof winPercent>[0]
    >();
    expectTypeOf<Extract<WhiteScore, { kind: 'mate' }>>().not.toExtend<
      Parameters<typeof winPercent>[0]
    >();
  });

  it('refuses what the WhiteScore constructors return until toMover has run', () => {
    expectTypeOf(WhiteScore.cp).returns.not.toExtend<Parameters<typeof winPercent>[0]>();
    expectTypeOf(WhiteScore.terminal).returns.not.toExtend<Parameters<typeof winPercent>[0]>();
    expectTypeOf(toMover).returns.toExtend<Parameters<typeof winPercent>[0]>();
  });
});

const anySide = fc.constantFrom<SideToMove>('w', 'b');
const anyWhiteScore: fc.Arbitrary<WhiteScore> = fc.oneof(
  fc.integer().map((cp) => WhiteScore.cp(cp)),
  fc
    .integer({ min: -500, max: 500 })
    .filter((plies) => plies !== 0)
    .map((plies) => WhiteScore.mate(plies)),
  fc
    .constantFrom<TerminalOutcome>('white', 'black', 'draw')
    .map((outcome) => WhiteScore.terminal(outcome)),
);

describe('winPercent properties', () => {
  it('stays finite and within 0 to 100 for every score and either mover', () => {
    fc.assert(
      fc.property(anyWhiteScore, anySide, (score, side) => {
        const chance = winPercent(toMover(score, side));
        expect(Number.isFinite(chance)).toBe(true);
        expect(chance).toBeGreaterThanOrEqual(0);
        expect(chance).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('gives the two sides chances that sum to 100 for every score', () => {
    fc.assert(
      fc.property(anyWhiteScore, (score) => {
        expect(forWhite(score) + forBlack(score)).toBeCloseTo(100, 9);
      }),
    );
  });

  it('never falls as the mover gains centipawns', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (first, second) => {
        const [smaller, larger] = first <= second ? [first, second] : [second, first];
        expect(forWhite(WhiteScore.cp(smaller))).toBeLessThanOrEqual(
          forWhite(WhiteScore.cp(larger)),
        );
      }),
    );
  });

  it('ranks a mate above every centipawn score and being mated below every one', () => {
    fc.assert(
      fc.property(fc.integer(), (cp) => {
        expect(forWhite(WhiteScore.mate(1))).toBeGreaterThan(forWhite(WhiteScore.cp(cp)));
        expect(forWhite(WhiteScore.mate(-1))).toBeLessThan(forWhite(WhiteScore.cp(cp)));
      }),
    );
  });
});
