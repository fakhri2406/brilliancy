import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { accuracyPercent } from './accuracy.js';

describe('accuracyPercent against the §6.1 curve', () => {
  it.each([
    [0, 99.9999],
    [1, 95.604402],
    [2, 91.396177],
    [5, 79.81704],
    [10, 63.582619],
    [20, 40.020427],
    [30, 24.775552],
    [50, 8.530272],
  ])('scores a move that lost %f win-percentage points at %f', (lost, expected) => {
    expect(accuracyPercent(50 + lost, 50)).toBeCloseTo(expected, 5);
  });

  it('tops out a hair under 100 for a move that lost nothing', () => {
    expect(accuracyPercent(60, 60)).toBeCloseTo(99.9999, 4);
    expect(accuracyPercent(60, 60)).toBeLessThan(100);
  });

  it('clamps to 100 for a move that gained chances', () => {
    expect(accuracyPercent(40, 45)).toBe(100);
    expect(accuracyPercent(0, 100)).toBe(100);
  });

  it('clamps to 0 for a move that lost everything', () => {
    expect(accuracyPercent(100, 0)).toBe(0);
  });
});

const anyChance = fc.double({ min: 0, max: 100, noNaN: true });
const anyDecidedChance = fc.constantFrom(0, 50, 100);

describe('accuracyPercent properties', () => {
  it('stays within 0 to 100 for any pair of win chances', () => {
    fc.assert(
      fc.property(anyChance, anyChance, (before, after) => {
        const accuracy = accuracyPercent(before, after);
        expect(Number.isFinite(accuracy)).toBe(true);
        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('stays within 0 to 100 across all-mate and all-terminal sequences', () => {
    fc.assert(
      fc.property(anyDecidedChance, anyDecidedChance, (before, after) => {
        const accuracy = accuracyPercent(before, after);
        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('depends only on how much was lost, not on where the game stood', () => {
    fc.assert(
      fc.property(
        anyChance,
        anyChance,
        fc.integer({ min: -100, max: 100 }),
        (before, after, shift) => {
          expect(accuracyPercent(before + shift, after + shift)).toBeCloseTo(
            accuracyPercent(before, after),
            6,
          );
        },
      ),
    );
  });

  it('never rewards losing more', () => {
    fc.assert(
      fc.property(anyChance, anyChance, anyChance, (before, smallerLoss, largerLoss) => {
        const [less, more] =
          smallerLoss <= largerLoss ? [smallerLoss, largerLoss] : [largerLoss, smallerLoss];
        expect(accuracyPercent(before, before - less)).toBeGreaterThanOrEqual(
          accuracyPercent(before, before - more),
        );
      }),
    );
  });
});
