import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type MoverOutcome,
  type MoverScore,
  type SideToMove,
  type TerminalOutcome,
  toMover,
  WhiteScore,
} from './score.js';

const anySide = fc.constantFrom<SideToMove>('w', 'b');
const anyOutcome = fc.constantFrom<TerminalOutcome>('white', 'black', 'draw');
const anyPlies = fc.integer({ min: -400, max: 400 }).filter((plies) => plies !== 0);

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

describe('toMover with White to move', () => {
  it('keeps centipawns', () => {
    expect(toMover(WhiteScore.cp(350), 'w')).toEqual({ kind: 'cp', cp: 350 });
    expect(toMover(WhiteScore.cp(-350), 'w')).toEqual({ kind: 'cp', cp: -350 });
  });

  it('keeps mate plies', () => {
    expect(toMover(WhiteScore.mate(3), 'w')).toEqual({ kind: 'mate', plies: 3 });
    expect(toMover(WhiteScore.mate(-4), 'w')).toEqual({ kind: 'mate', plies: -4 });
  });

  it('reads a White win as a win, a Black win as a loss and a draw as a draw', () => {
    expect(toMover(WhiteScore.terminal('white'), 'w')).toEqual({
      kind: 'terminal',
      outcome: 'win',
    });
    expect(toMover(WhiteScore.terminal('black'), 'w')).toEqual({
      kind: 'terminal',
      outcome: 'loss',
    });
    expect(toMover(WhiteScore.terminal('draw'), 'w')).toEqual({
      kind: 'terminal',
      outcome: 'draw',
    });
  });
});

describe('toMover with Black to move', () => {
  it('negates centipawns', () => {
    expect(toMover(WhiteScore.cp(350), 'b')).toEqual({ kind: 'cp', cp: -350 });
    expect(toMover(WhiteScore.cp(-350), 'b')).toEqual({ kind: 'cp', cp: 350 });
  });

  it('negates mate plies without re-basing the distance', () => {
    expect(toMover(WhiteScore.mate(3), 'b')).toEqual({ kind: 'mate', plies: -3 });
    expect(toMover(WhiteScore.mate(-4), 'b')).toEqual({ kind: 'mate', plies: 4 });
  });

  it('reads a White win as a loss, a Black win as a win and a draw as a draw', () => {
    expect(toMover(WhiteScore.terminal('white'), 'b')).toEqual({
      kind: 'terminal',
      outcome: 'loss',
    });
    expect(toMover(WhiteScore.terminal('black'), 'b')).toEqual({
      kind: 'terminal',
      outcome: 'win',
    });
    expect(toMover(WhiteScore.terminal('draw'), 'b')).toEqual({
      kind: 'terminal',
      outcome: 'draw',
    });
  });

  it('turns an equal position into zero, not negative zero', () => {
    expect(toMover(WhiteScore.cp(0), 'b')).toEqual({ kind: 'cp', cp: 0 });
  });
});

describe('toMover', () => {
  it('returns a new object rather than aliasing its input', () => {
    const white = WhiteScore.cp(12);
    expect(toMover(white, 'w')).not.toBe(white);
  });

  it('gives the two sides opposite centipawns for every White score', () => {
    fc.assert(
      fc.property(fc.integer(), (cp) => {
        const white = WhiteScore.cp(cp);
        expect(toMover(white, 'w')).toEqual({ kind: 'cp', cp });
        expect(toMover(white, 'b')).toEqual({ kind: 'cp', cp: cp === 0 ? 0 : -cp });
      }),
    );
  });

  it('gives the two sides opposite mate plies of the same magnitude', () => {
    fc.assert(
      fc.property(anyPlies, (plies) => {
        const white = WhiteScore.mate(plies);
        expect(toMover(white, 'w')).toEqual({ kind: 'mate', plies });
        expect(toMover(white, 'b')).toEqual({ kind: 'mate', plies: -plies });
      }),
    );
  });

  it('gives the two sides opposite terminal outcomes unless the game was drawn', () => {
    const opposite: Record<MoverOutcome, MoverOutcome> = { win: 'loss', loss: 'win', draw: 'draw' };
    fc.assert(
      fc.property(anyOutcome, (outcome) => {
        const white = WhiteScore.terminal(outcome);
        const forWhite = toMover(white, 'w');
        const forBlack = toMover(white, 'b');
        if (forWhite.kind !== 'terminal' || forBlack.kind !== 'terminal') {
          throw new Error('a terminal score must stay terminal');
        }
        expect(forBlack.outcome).toBe(opposite[forWhite.outcome]);
        expect(forWhite.outcome === 'draw').toBe(outcome === 'draw');
      }),
    );
  });

  it('never leaves a colour name in a mover-relative terminal score', () => {
    fc.assert(
      fc.property(anyOutcome, anySide, (outcome, side) => {
        const mover = toMover(WhiteScore.terminal(outcome), side);
        if (mover.kind !== 'terminal') throw new Error('a terminal score must stay terminal');
        expect(['win', 'loss', 'draw']).toContain(mover.outcome);
      }),
    );
  });
});

describe('the two perspectives are distinct types', () => {
  it('refuses a WhiteScore where a MoverScore is required', () => {
    expectTypeOf<WhiteScore>().not.toExtend<MoverScore>();
  });

  it('refuses a MoverScore where a WhiteScore is required', () => {
    expectTypeOf<MoverScore>().not.toExtend<WhiteScore>();
    expectTypeOf<MoverScore>().not.toExtend<Parameters<typeof toMover>[0]>();
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

  it('keeps each perspective assignable to itself through the constructors and toMover', () => {
    expectTypeOf(WhiteScore.cp).returns.toEqualTypeOf<WhiteScore>();
    expectTypeOf(WhiteScore.mate).returns.toEqualTypeOf<WhiteScore>();
    expectTypeOf(WhiteScore.terminal).returns.toEqualTypeOf<WhiteScore>();
    expectTypeOf(toMover).parameter(0).toEqualTypeOf<WhiteScore>();
    expectTypeOf(toMover).returns.toEqualTypeOf<MoverScore>();
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
