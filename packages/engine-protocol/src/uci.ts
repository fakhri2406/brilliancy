export type ScoreBound = 'lower' | 'upper';

export type RawScore =
  | { readonly kind: 'cp'; readonly rawCp: number }
  | { readonly kind: 'mate'; readonly rawMateMoves: number };

export interface RawInfoLine {
  readonly depth: number;
  readonly seldepth?: number;
  readonly multipv?: number;
  readonly nodes?: number;
  readonly nps?: number;
  readonly timeMs?: number;
  readonly rawScore?: RawScore;
  readonly scoreBound?: ScoreBound;
  readonly pv?: readonly string[];
}

export class UciSyntaxError extends SyntaxError {
  readonly line: string;

  constructor(line: string, problem: string) {
    super(`Malformed UCI info line (${problem}): ${JSON.stringify(line)}`);
    this.name = 'UciSyntaxError';
    this.line = line;
  }
}

type Builder<T> = { -readonly [K in keyof T]?: T[K] };

type CountField = 'depth' | 'seldepth' | 'multipv' | 'nodes' | 'nps' | 'timeMs';

const COUNT_FIELD_FOR_KEYWORD: Readonly<Record<string, CountField>> = {
  depth: 'depth',
  seldepth: 'seldepth',
  multipv: 'multipv',
  nodes: 'nodes',
  nps: 'nps',
  time: 'timeMs',
};

const BOUND_FOR_KEYWORD: Readonly<Record<string, ScoreBound>> = {
  lowerbound: 'lower',
  upperbound: 'upper',
};

const UNSIGNED_INTEGER = /^\d+$/;
const SIGNED_INTEGER = /^-?\d+$/;
const UCI_MOVE = /^(?:[a-h][1-8][a-h][1-8][nbrq]?|0000)$/;

export function parseInfo(line: string): RawInfoLine | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;

  const fields: Builder<RawInfoLine> = {};
  let index = 1;
  while (index < tokens.length) {
    const keyword = tokens[index];
    if (keyword === undefined || keyword === 'string') break;

    if (keyword === 'pv') {
      rejectRepeat(fields, 'pv', line);
      fields.pv = readMoves(tokens, index + 1, line);
      break;
    }

    if (keyword === 'score') {
      rejectRepeat(fields, 'rawScore', line);
      index = readScore(tokens, index, fields, line);
      continue;
    }

    const countField = COUNT_FIELD_FOR_KEYWORD[keyword];
    if (countField !== undefined) {
      rejectRepeat(fields, countField, line);
      fields[countField] = readInteger(tokens, index + 1, UNSIGNED_INTEGER, keyword, line);
      index += 2;
      continue;
    }

    index += 1;
  }

  if (fields.depth === undefined) return null;
  return { ...fields, depth: fields.depth };
}

function rejectRepeat(fields: Builder<RawInfoLine>, field: keyof RawInfoLine, line: string): void {
  if (fields[field] !== undefined) {
    throw new UciSyntaxError(line, `${field} given twice`);
  }
}

function readInteger(
  tokens: readonly string[],
  index: number,
  shape: RegExp,
  keyword: string,
  line: string,
): number {
  const token = tokens[index];
  if (token === undefined || !shape.test(token)) {
    throw new UciSyntaxError(line, `${keyword} needs an integer, got ${JSON.stringify(token)}`);
  }
  return Number(token);
}

function readScore(
  tokens: readonly string[],
  index: number,
  fields: Builder<RawInfoLine>,
  line: string,
): number {
  const unit = tokens[index + 1];
  if (unit === 'cp') {
    fields.rawScore = {
      kind: 'cp',
      rawCp: readInteger(tokens, index + 2, SIGNED_INTEGER, 'score cp', line),
    };
  } else if (unit === 'mate') {
    fields.rawScore = {
      kind: 'mate',
      rawMateMoves: readInteger(tokens, index + 2, SIGNED_INTEGER, 'score mate', line),
    };
  } else {
    throw new UciSyntaxError(line, `score needs cp or mate, got ${JSON.stringify(unit)}`);
  }

  const next = index + 3;
  const bound = BOUND_FOR_KEYWORD[tokens[next] ?? ''];
  if (bound === undefined) return next;
  fields.scoreBound = bound;
  return next + 1;
}

function readMoves(tokens: readonly string[], start: number, line: string): readonly string[] {
  const moves = tokens.slice(start);
  if (moves.length === 0) {
    throw new UciSyntaxError(line, 'pv needs at least one move');
  }
  const stray = moves.find((move) => !UCI_MOVE.test(move));
  if (stray !== undefined) {
    throw new UciSyntaxError(line, `pv contains ${JSON.stringify(stray)}, which is not a UCI move`);
  }
  return moves;
}
