import {
  negatedWhenBlackToMove,
  type SideToMove,
  type TerminalOutcome,
  WhiteScore,
} from './score.js';
import type { RawInfoLine, RawScore, ScoreBound } from './uci.js';

export interface InfoLine {
  readonly depth: number;
  readonly seldepth?: number;
  readonly multipv?: number;
  readonly nodes?: number;
  readonly nps?: number;
  readonly timeMs?: number;
  readonly score?: WhiteScore;
  readonly scoreBound?: ScoreBound;
  readonly pv?: readonly string[];
}

export interface PvLine {
  readonly move: string;
  readonly moves: readonly string[];
  readonly score: WhiteScore;
}

export function normaliseInfo(raw: RawInfoLine, sideToMove: SideToMove): InfoLine {
  const { rawScore, scoreBound, ...searchFields } = raw;
  if (rawScore === undefined) return searchFields;

  const score = whiteScoreFrom(rawScore, sideToMove);
  if (scoreBound === undefined) return { ...searchFields, score };
  return { ...searchFields, score, scoreBound: boundForWhite(scoreBound, sideToMove) };
}

export const pliesFromMateMoves = (moves: number): number =>
  moves > 0 ? 2 * moves - 1 : 2 * moves;

const CHECKMATED_SIDE_LOSES: Readonly<Record<SideToMove, TerminalOutcome>> = {
  w: 'black',
  b: 'white',
};

const OPPOSITE_BOUND: Readonly<Record<ScoreBound, ScoreBound>> = {
  lower: 'upper',
  upper: 'lower',
};

function whiteScoreFrom(raw: RawScore, sideToMove: SideToMove): WhiteScore {
  switch (raw.kind) {
    case 'cp':
      return WhiteScore.cp(negatedWhenBlackToMove(raw.rawCp, sideToMove));
    case 'mate':
      if (raw.rawMateMoves === 0) return WhiteScore.terminal(CHECKMATED_SIDE_LOSES[sideToMove]);
      return WhiteScore.mate(
        negatedWhenBlackToMove(pliesFromMateMoves(raw.rawMateMoves), sideToMove),
      );
  }
}

const boundForWhite = (bound: ScoreBound, sideToMove: SideToMove): ScoreBound =>
  sideToMove === 'w' ? bound : OPPOSITE_BOUND[bound];
