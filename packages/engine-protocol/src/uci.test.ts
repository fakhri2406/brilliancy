import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseInfo, type RawInfoLine, UciSyntaxError } from './uci.js';

const MAIN_LINE =
  'info depth 22 seldepth 30 multipv 1 score cp 34 nodes 1204331 nps 1500000 hashfull 412 tbhits 0 time 803 pv e2e4 e7e5 g1f3 b8c6 f1b5';

const MATE_LINE =
  'info depth 18 seldepth 25 multipv 1 score mate 3 nodes 51234 nps 1024680 hashfull 22 tbhits 0 time 50 pv f3f7 e8e7 d1d7 e7f8 d7f7';

const SECOND_PV_LINE =
  'info depth 22 seldepth 31 multipv 2 score cp 28 nodes 1204331 nps 1500000 hashfull 412 tbhits 0 time 803 pv d2d4 g8f6 c2c4 e7e6';

describe('parseInfo on captured Stockfish output', () => {
  it('reads every field of a full principal-variation line', () => {
    expect(parseInfo(MAIN_LINE)).toEqual<RawInfoLine>({
      depth: 22,
      seldepth: 30,
      multipv: 1,
      nodes: 1204331,
      nps: 1500000,
      timeMs: 803,
      rawScore: { kind: 'cp', rawCp: 34 },
      pv: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'],
    });
  });

  it('keeps a mate score in engine-perspective moves, untouched', () => {
    expect(parseInfo(MATE_LINE)).toEqual<RawInfoLine>({
      depth: 18,
      seldepth: 25,
      multipv: 1,
      nodes: 51234,
      nps: 1024680,
      timeMs: 50,
      rawScore: { kind: 'mate', rawMateMoves: 3 },
      pv: ['f3f7', 'e8e7', 'd1d7', 'e7f8', 'd7f7'],
    });
  });

  it('reads the rank of a secondary MultiPV line', () => {
    expect(parseInfo(SECOND_PV_LINE)).toMatchObject({
      multipv: 2,
      rawScore: { kind: 'cp', rawCp: 28 },
      pv: ['d2d4', 'g8f6', 'c2c4', 'e7e6'],
    });
  });

  it('reads negative centipawns and negative mate distances', () => {
    expect(parseInfo('info depth 12 score cp -350 pv e7e5')).toMatchObject({
      rawScore: { kind: 'cp', rawCp: -350 },
    });
    expect(parseInfo('info depth 12 score mate -2 pv e7e5')).toMatchObject({
      rawScore: { kind: 'mate', rawMateMoves: -2 },
    });
  });

  it('accepts a progress line that carries only a depth', () => {
    expect(parseInfo('info depth 15 currmove e2e4 currmovenumber 1')).toEqual<RawInfoLine>({
      depth: 15,
    });
  });

  it('accepts the depth-zero lines Stockfish emits for a checkmated or stalemated root', () => {
    expect(parseInfo('info depth 0 score mate 0')).toEqual<RawInfoLine>({
      depth: 0,
      rawScore: { kind: 'mate', rawMateMoves: 0 },
    });
    expect(parseInfo('info depth 0 score cp 0')).toEqual<RawInfoLine>({
      depth: 0,
      rawScore: { kind: 'cp', rawCp: 0 },
    });
  });

  it('marks a fail-high or fail-low score as a bound', () => {
    expect(
      parseInfo('info depth 25 seldepth 33 multipv 1 score cp 41 lowerbound nodes 4001234 pv e2e4'),
    ).toMatchObject({ rawScore: { kind: 'cp', rawCp: 41 }, scoreBound: 'lower', pv: ['e2e4'] });
    expect(
      parseInfo('info depth 25 multipv 1 score mate 4 upperbound nodes 12 pv e2e4'),
    ).toMatchObject({ rawScore: { kind: 'mate', rawMateMoves: 4 }, scoreBound: 'upper' });
  });

  it('leaves the bound out when the score is exact', () => {
    expect(parseInfo(MAIN_LINE)).not.toHaveProperty('scoreBound');
  });

  it('skips the fields it does not carry, including wdl and future keywords', () => {
    expect(
      parseInfo(
        'info depth 20 seldepth 27 multipv 1 score cp 34 wdl 412 500 88 nodes 1204331 nps 1500000 hashfull 412 tbhits 0 time 803 pv e2e4 e7e5',
      ),
    ).toEqual<RawInfoLine>({
      depth: 20,
      seldepth: 27,
      multipv: 1,
      nodes: 1204331,
      nps: 1500000,
      timeMs: 803,
      rawScore: { kind: 'cp', rawCp: 34 },
      pv: ['e2e4', 'e7e5'],
    });
    expect(parseInfo('info depth 3 futurekeyword 42 score cp 1 pv e2e4')).toEqual<RawInfoLine>({
      depth: 3,
      rawScore: { kind: 'cp', rawCp: 1 },
      pv: ['e2e4'],
    });
  });

  it('does not depend on field order', () => {
    expect(
      parseInfo('info nodes 100 score cp 5 depth 7 time 3 multipv 1 pv e2e4'),
    ).toEqual<RawInfoLine>({
      depth: 7,
      multipv: 1,
      nodes: 100,
      timeMs: 3,
      rawScore: { kind: 'cp', rawCp: 5 },
      pv: ['e2e4'],
    });
  });

  it('tolerates repeated spaces, tabs, surrounding whitespace and a CRLF ending', () => {
    expect(parseInfo('  info  depth 7\tscore cp 5   pv e2e4 e7e5\r\n')).toEqual<RawInfoLine>({
      depth: 7,
      rawScore: { kind: 'cp', rawCp: 5 },
      pv: ['e2e4', 'e7e5'],
    });
  });

  it('accepts promotions, Chess960 castling and the null move in a pv', () => {
    expect(parseInfo('info depth 12 score cp 15 pv e7e8q e1h1 0000 a7a8n')).toMatchObject({
      pv: ['e7e8q', 'e1h1', '0000', 'a7a8n'],
    });
  });

  it('treats everything after the string keyword as text', () => {
    expect(
      parseInfo(
        'info string NNUE evaluation using nn-1c0000000000.nnue (133MiB, (22528, 3072, 15, 32, 1))',
      ),
    ).toBeNull();
    expect(parseInfo('info string depth 99 score cp 5 pv e2e4')).toBeNull();
    expect(parseInfo('info depth 5 string depth 6 score cp 5')).toEqual<RawInfoLine>({ depth: 5 });
  });
});

describe('parseInfo on lines that carry no usable info', () => {
  it.each([
    'bestmove e2e4 ponder e7e5',
    'readyok',
    'uciok',
    'id name Stockfish 19',
    'option name Hash type spin default 16 min 1 max 33554432',
    'information depth 5',
    'info',
    '',
    '   ',
  ])('returns null for %j', (line) => {
    expect(parseInfo(line)).toBeNull();
  });

  it('returns null for an info line without a depth', () => {
    expect(parseInfo('info nodes 5000000 nps 1500000 hashfull 800 time 3333')).toBeNull();
    expect(parseInfo('info currmove e2e4 currmovenumber 3')).toBeNull();
  });
});

describe('parseInfo on malformed info lines', () => {
  it.each([
    ['a depth that is not a number', 'info depth twenty score cp 5 pv e2e4'],
    ['a negative depth', 'info depth -3 score cp 5 pv e2e4'],
    ['a node count in exponent notation', 'info depth 20 nodes 1e6 score cp 5 pv e2e4'],
    ['a score with no unit', 'info depth 20 score 34 pv e2e4'],
    ['a score with an unknown unit', 'info depth 20 score pawns 34 pv e2e4'],
    ['a centipawn score with no value', 'info depth 20 score cp'],
    ['a centipawn score that is not an integer', 'info depth 20 score cp abc pv e2e4'],
    ['a centipawn score with an explicit plus sign', 'info depth 20 score cp +34 pv e2e4'],
    ['a mate score that is not an integer', 'info depth 20 score mate x pv e2e4'],
    ['an empty pv', 'info depth 20 score cp 5 pv'],
    ['a pv containing a keyword', 'info depth 20 score cp 5 pv e2e4 nodes 5'],
    ['a pv containing two glued lines', 'info depth 20 score cp 5 pv e2e4info depth 21'],
    ['a repeated depth', 'info depth 20 depth 21 score cp 5 pv e2e4'],
    ['a repeated score', 'info depth 20 score cp 5 score cp 6 pv e2e4'],
    ['a keyword with nothing after it', 'info depth 20 seldepth'],
  ])('throws a UciSyntaxError for %s', (_description, line) => {
    expect(() => parseInfo(line)).toThrow(UciSyntaxError);
    expect(() => parseInfo(line)).toThrow(SyntaxError);
  });

  it('carries the offending line on the error', () => {
    const line = 'info depth twenty';
    try {
      parseInfo(line);
      throw new Error('parseInfo accepted a malformed line');
    } catch (error) {
      if (!(error instanceof UciSyntaxError)) throw error;
      expect(error.line).toBe(line);
      expect(error.name).toBe('UciSyntaxError');
      expect(error.message).toContain('depth needs an integer');
    }
  });
});

const count = fc.integer({ min: 0, max: 2_000_000_000 });
const uciMove = fc
  .tuple(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
    fc.integer({ min: 1, max: 8 }),
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
    fc.integer({ min: 1, max: 8 }),
    fc.constantFrom('', 'q', 'r', 'b', 'n'),
  )
  .map(([fromFile, fromRank, toFile, toRank, promotion]) =>
    [fromFile, fromRank, toFile, toRank, promotion].join(''),
  );

const stockfishLine = fc.record({
  depth: fc.integer({ min: 0, max: 99 }),
  seldepth: fc.integer({ min: 0, max: 120 }),
  multipv: fc.integer({ min: 1, max: 5 }),
  score: fc.oneof(
    fc.integer({ min: -32000, max: 32000 }).map((cp) => ({ text: `cp ${cp}`, cp })),
    fc.integer({ min: -250, max: 250 }).map((mate) => ({ text: `mate ${mate}`, mate })),
  ),
  bound: fc.constantFrom('', ' lowerbound', ' upperbound'),
  nodes: count,
  nps: count,
  time: count,
  pv: fc.array(uciMove, { minLength: 1, maxLength: 12 }),
});

describe('parseInfo properties', () => {
  it('recovers every field of any well-formed Stockfish line', () => {
    fc.assert(
      fc.property(stockfishLine, (line) => {
        const text = `info depth ${line.depth} seldepth ${line.seldepth} multipv ${line.multipv} score ${line.score.text}${line.bound} nodes ${line.nodes} nps ${line.nps} hashfull 3 tbhits 0 time ${line.time} pv ${line.pv.join(' ')}`;
        const expected: RawInfoLine = {
          depth: line.depth,
          seldepth: line.seldepth,
          multipv: line.multipv,
          nodes: line.nodes,
          nps: line.nps,
          timeMs: line.time,
          rawScore:
            'cp' in line.score
              ? { kind: 'cp', rawCp: line.score.cp }
              : { kind: 'mate', rawMateMoves: line.score.mate },
          pv: line.pv,
          ...(line.bound === ''
            ? {}
            : { scoreBound: line.bound === ' lowerbound' ? 'lower' : 'upper' }),
        };
        expect(parseInfo(text)).toEqual(expected);
      }),
    );
  });

  it('reads the same values whatever order the fields arrive in, as long as pv is last', () => {
    fc.assert(
      fc.property(stockfishLine, fc.infiniteStream(fc.nat()), (line, seeds) => {
        const fields = [
          `depth ${line.depth}`,
          `seldepth ${line.seldepth}`,
          `multipv ${line.multipv}`,
          `score ${line.score.text}${line.bound}`,
          `nodes ${line.nodes}`,
          `time ${line.time}`,
        ];
        const shuffled: string[] = [];
        while (fields.length > 0) {
          const next = seeds.next();
          const at = (next.done ? 0 : next.value) % fields.length;
          shuffled.push(...fields.splice(at, 1));
        }
        const ordered = `info depth ${line.depth} seldepth ${line.seldepth} multipv ${line.multipv} score ${line.score.text}${line.bound} nodes ${line.nodes} time ${line.time} pv ${line.pv.join(' ')}`;
        expect(parseInfo(`info ${shuffled.join(' ')} pv ${line.pv.join(' ')}`)).toEqual(
          parseInfo(ordered),
        );
      }),
    );
  });

  it('never yields a NaN or fractional number, whatever text follows a keyword', () => {
    const keyword = fc.constantFrom(
      'depth',
      'seldepth',
      'multipv',
      'nodes',
      'nps',
      'time',
      'score cp',
      'score mate',
    );
    fc.assert(
      fc.property(fc.array(fc.tuple(keyword, fc.string()), { maxLength: 6 }), (pairs) => {
        const text = `info ${pairs.map(([key, value]) => `${key} ${value}`).join(' ')}`;
        let parsed: RawInfoLine | null;
        try {
          parsed = parseInfo(text);
        } catch (error) {
          expect(error).toBeInstanceOf(UciSyntaxError);
          return;
        }
        if (parsed === null) return;
        const numbers = [
          parsed.depth,
          parsed.seldepth,
          parsed.multipv,
          parsed.nodes,
          parsed.nps,
          parsed.timeMs,
        ];
        if (parsed.rawScore !== undefined) {
          numbers.push(
            parsed.rawScore.kind === 'cp' ? parsed.rawScore.rawCp : parsed.rawScore.rawMateMoves,
          );
        }
        for (const value of numbers) {
          if (value !== undefined) expect(Number.isInteger(value)).toBe(true);
        }
      }),
    );
  });
});
