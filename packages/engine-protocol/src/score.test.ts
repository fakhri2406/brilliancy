import { describe, expect, expectTypeOf, it } from 'vitest';
import { type MoverOutcome, type MoverScore, type TerminalOutcome, WhiteScore } from './score.js';

describe('WhiteScore constructors', () => {
  it('builds a centipawn score', () => {
    expect(WhiteScore.cp(34)).toEqual({ kind: 'cp', cp: 34 });
  });

  it('builds a mate score in signed plies', () => {
    expect(WhiteScore.mate(-4)).toEqual({ kind: 'mate', plies: -4 });
  });

  it('builds a terminal score', () => {
    expect(WhiteScore.terminal('draw')).toEqual({ kind: 'terminal', outcome: 'draw' });
  });

  it('normalises negative zero centipawns to zero', () => {
    expect(WhiteScore.cp(-0)).toEqual({ kind: 'cp', cp: 0 });
  });

  it('rejects a centipawn score that is not a finite number', () => {
    expect(() => WhiteScore.cp(Number.NaN)).toThrow(RangeError);
    expect(() => WhiteScore.cp(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => WhiteScore.cp(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('rejects a mate distance that has no sign or is not a whole number of plies', () => {
    expect(() => WhiteScore.mate(0)).toThrow(RangeError);
    expect(() => WhiteScore.mate(1.5)).toThrow(RangeError);
    expect(() => WhiteScore.mate(Number.NaN)).toThrow(RangeError);
  });
});

describe('the two perspectives are distinct types', () => {
  it('refuses a WhiteScore where a MoverScore is required', () => {
    expectTypeOf<WhiteScore>().not.toExtend<MoverScore>();
  });

  it('refuses a MoverScore where a WhiteScore is required', () => {
    expectTypeOf<MoverScore>().not.toExtend<WhiteScore>();
  });

  it('refuses an unbranded object literal as either perspective', () => {
    expectTypeOf<{ kind: 'cp'; cp: number }>().not.toExtend<WhiteScore>();
    expectTypeOf<{ kind: 'cp'; cp: number }>().not.toExtend<MoverScore>();
    expectTypeOf<{ kind: 'terminal'; outcome: 'white' }>().not.toExtend<WhiteScore>();
    expectTypeOf<{ kind: 'terminal'; outcome: 'win' }>().not.toExtend<MoverScore>();
  });

  it('keeps the centipawn and mate members apart on the brand alone', () => {
    expectTypeOf<Extract<WhiteScore, { kind: 'cp' }>>().not.toExtend<
      Extract<MoverScore, { kind: 'cp' }>
    >();
    expectTypeOf<Extract<MoverScore, { kind: 'cp' }>>().not.toExtend<
      Extract<WhiteScore, { kind: 'cp' }>
    >();
    expectTypeOf<Extract<WhiteScore, { kind: 'mate' }>>().not.toExtend<
      Extract<MoverScore, { kind: 'mate' }>
    >();
    expectTypeOf<Extract<MoverScore, { kind: 'mate' }>>().not.toExtend<
      Extract<WhiteScore, { kind: 'mate' }>
    >();
  });

  it('keeps the White perspective assignable to itself through the constructors', () => {
    expectTypeOf(WhiteScore.cp).returns.toEqualTypeOf<WhiteScore>();
    expectTypeOf(WhiteScore.mate).returns.toEqualTypeOf<WhiteScore>();
    expectTypeOf(WhiteScore.terminal).returns.toEqualTypeOf<WhiteScore>();
  });

  it('gives terminal scores a colour vocabulary for White and a result vocabulary for the mover', () => {
    expectTypeOf<
      Extract<WhiteScore, { kind: 'terminal' }>['outcome']
    >().toEqualTypeOf<TerminalOutcome>();
    expectTypeOf<
      Extract<MoverScore, { kind: 'terminal' }>['outcome']
    >().toEqualTypeOf<MoverOutcome>();
  });
});
