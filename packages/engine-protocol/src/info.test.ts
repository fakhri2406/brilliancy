import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type InfoLine, normaliseInfo, pliesFromMateMoves } from './info.js';
import { type SideToMove, toMover, WhiteScore } from './score.js';
import { parseInfo, type RawInfoLine } from './uci.js';

const raw = (
  fields: Omit<RawInfoLine, 'depth'> & Partial<Pick<RawInfoLine, 'depth'>>,
): RawInfoLine => ({
  depth: 20,
  ...fields,
});

const parsed = (line: string): RawInfoLine => {
  const result = parseInfo(line);
  if (result === null)
    throw new Error(`expected an info line, got null for ${JSON.stringify(line)}`);
  return result;
};

describe('normaliseInfo with a centipawn score', () => {
  it('keeps the sign when White is to move', () => {
    expect(normaliseInfo(raw({ rawScore: { kind: 'cp', rawCp: 34 } }), 'w').score).toEqual(
      WhiteScore.cp(34),
    );
    expect(normaliseInfo(raw({ rawScore: { kind: 'cp', rawCp: -34 } }), 'w').score).toEqual(
      WhiteScore.cp(-34),
    );
  });

  it('flips the sign when Black is to move', () => {
    expect(normaliseInfo(raw({ rawScore: { kind: 'cp', rawCp: 34 } }), 'b').score).toEqual(
      WhiteScore.cp(-34),
    );
    expect(normaliseInfo(raw({ rawScore: { kind: 'cp', rawCp: -350 } }), 'b').score).toEqual(
      WhiteScore.cp(350),
    );
  });

  it('turns an equal position into zero for Black, not negative zero', () => {
    expect(normaliseInfo(raw({ rawScore: { kind: 'cp', rawCp: 0 } }), 'b').score).toEqual(
      WhiteScore.cp(0),
    );
  });
});

describe('normaliseInfo with a mate score, at one and two moves for both colours (§5.6 rule 2)', () => {
  it.each([
    ['w', 1, 1],
    ['w', 2, 3],
    ['w', -1, -2],
    ['w', -2, -4],
    ['b', 1, -1],
    ['b', 2, -3],
    ['b', -1, 2],
    ['b', -2, 4],
  ] as const)('with %s to move turns mate %i into %i signed plies', (side, mateMoves, plies) => {
    expect(
      normaliseInfo(raw({ rawScore: { kind: 'mate', rawMateMoves: mateMoves } }), side).score,
    ).toEqual(WhiteScore.mate(plies));
  });

  it('reads mate 0 as a checkmated side to move and reports the game result instead', () => {
    expect(normaliseInfo(raw({ rawScore: { kind: 'mate', rawMateMoves: 0 } }), 'w').score).toEqual(
      WhiteScore.terminal('black'),
    );
    expect(normaliseInfo(raw({ rawScore: { kind: 'mate', rawMateMoves: 0 } }), 'b').score).toEqual(
      WhiteScore.terminal('white'),
    );
  });
});

describe('normaliseInfo with a bound', () => {
  it('keeps the bound when White is to move', () => {
    const line = raw({ rawScore: { kind: 'cp', rawCp: 41 }, scoreBound: 'lower' });
    expect(normaliseInfo(line, 'w')).toMatchObject({
      score: WhiteScore.cp(41),
      scoreBound: 'lower',
    });
  });

  it('swaps the bound when Black is to move, because the sign flipped', () => {
    const lower = raw({ rawScore: { kind: 'cp', rawCp: 41 }, scoreBound: 'lower' });
    const upper = raw({ rawScore: { kind: 'cp', rawCp: 41 }, scoreBound: 'upper' });
    expect(normaliseInfo(lower, 'b')).toMatchObject({
      score: WhiteScore.cp(-41),
      scoreBound: 'upper',
    });
    expect(normaliseInfo(upper, 'b')).toMatchObject({
      score: WhiteScore.cp(-41),
      scoreBound: 'lower',
    });
  });
});

describe('normaliseInfo shapes', () => {
  it('passes the search fields through and leaves no raw field behind', () => {
    const line = parsed(
      'info depth 22 seldepth 30 multipv 1 score cp 34 nodes 1204331 nps 1500000 hashfull 412 tbhits 0 time 803 pv e2e4 e7e5',
    );
    expect(normaliseInfo(line, 'w')).toEqual<InfoLine>({
      depth: 22,
      seldepth: 30,
      multipv: 1,
      nodes: 1204331,
      nps: 1500000,
      timeMs: 803,
      score: WhiteScore.cp(34),
      pv: ['e2e4', 'e7e5'],
    });
  });

  it('omits the score entirely when the line carried none', () => {
    const result = normaliseInfo(parsed('info depth 15 currmove e2e4 currmovenumber 1'), 'b');
    expect(result).toEqual<InfoLine>({ depth: 15 });
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('scoreBound');
  });
});

describe('the parse boundary on an asymmetric position', () => {
  const blackToMoveWhiteWinning = parsed(
    'info depth 20 seldepth 26 multipv 1 score cp -350 nodes 900000 nps 1500000 hashfull 300 tbhits 0 time 600 pv e7e5 g1f3 b8c6',
  );

  it('stores the engine number Black reported as a White-positive advantage', () => {
    expect(normaliseInfo(blackToMoveWhiteWinning, 'b').score).toEqual(WhiteScore.cp(350));
  });

  it('gives each side its own perspective only through toMover, downstream of the store', () => {
    const stored = normaliseInfo(blackToMoveWhiteWinning, 'b').score;
    if (stored === undefined) throw new Error('the line carries a score');
    expect(toMover(stored, 'b')).toEqual({ kind: 'cp', cp: -350 });
    expect(toMover(stored, 'w')).toEqual({ kind: 'cp', cp: 350 });
  });

  it('does the same for a mate Black is about to suffer', () => {
    const stored = normaliseInfo(
      parsed('info depth 20 score mate -2 pv e7e5 d1h5 g8f6 h5f7'),
      'b',
    ).score;
    expect(stored).toEqual(WhiteScore.mate(4));
    if (stored === undefined) throw new Error('the line carries a score');
    expect(toMover(stored, 'b')).toEqual({ kind: 'mate', plies: -4 });
  });
});

describe('pliesFromMateMoves', () => {
  it.each([
    [1, 1],
    [2, 3],
    [3, 5],
    [-1, -2],
    [-2, -4],
    [-3, -6],
  ])('turns mate in %i moves into %i plies', (moves, plies) => {
    expect(pliesFromMateMoves(moves)).toBe(plies);
  });
});

const anySide = fc.constantFrom<SideToMove>('w', 'b');
const anyCp = fc.integer({ min: -32000, max: 32000 });
const anyMateMoves = fc.integer({ min: -250, max: 250 }).filter((moves) => moves !== 0);

describe('normaliseInfo properties', () => {
  it('reports the engine centipawns unchanged for White and negated for Black', () => {
    fc.assert(
      fc.property(anyCp, (cp) => {
        const line = parsed(`info depth 10 score cp ${cp} pv e2e4`);
        expect(normaliseInfo(line, 'w').score).toEqual(WhiteScore.cp(cp));
        expect(normaliseInfo(line, 'b').score).toEqual(WhiteScore.cp(cp === 0 ? 0 : -cp));
      }),
    );
  });

  it('gives the mating side an odd ply count and the mated side an even one, with the sign of the mover', () => {
    fc.assert(
      fc.property(anyMateMoves, anySide, (moves, side) => {
        const score = normaliseInfo(
          parsed(`info depth 10 score mate ${moves} pv e2e4`),
          side,
        ).score;
        if (score === undefined || score.kind !== 'mate')
          throw new Error('a mate line yields a mate');
        const moverMates = moves > 0;
        const whiteIsFavoured = score.plies > 0;
        expect(whiteIsFavoured).toBe(side === 'w' ? moverMates : !moverMates);
        expect(Math.abs(score.plies) % 2 === 1).toBe(moverMates);
        expect(Math.abs(score.plies)).toBe(moverMates ? 2 * moves - 1 : -2 * moves);
      }),
    );
  });

  it('loses nothing in the moves-to-plies conversion', () => {
    const movesFromPlies = (plies: number): number => (plies > 0 ? (plies + 1) / 2 : plies / 2);
    fc.assert(
      fc.property(anyMateMoves, (moves) => {
        expect(movesFromPlies(pliesFromMateMoves(moves))).toBe(moves);
      }),
    );
  });

  it('never carries a raw field into the normalised line', () => {
    fc.assert(
      fc.property(anyCp, anySide, (cp, side) => {
        const result = normaliseInfo(
          parsed(`info depth 10 multipv 1 score cp ${cp} pv e2e4`),
          side,
        );
        expect(Object.keys(result).some((key) => key.startsWith('raw'))).toBe(false);
      }),
    );
  });
});
