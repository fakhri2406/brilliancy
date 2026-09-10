declare const perspective: unique symbol;

type Perspective = 'white' | 'mover';

type Branded<P extends Perspective> = { readonly [perspective]: P };

export type SideToMove = 'w' | 'b';

export type TerminalOutcome = 'white' | 'black' | 'draw';

export type MoverOutcome = 'win' | 'loss' | 'draw';

type CentipawnScore = { readonly kind: 'cp'; readonly cp: number };

type MateScore = { readonly kind: 'mate'; readonly plies: number };

type WhiteTerminalScore = { readonly kind: 'terminal'; readonly outcome: TerminalOutcome };

type MoverTerminalScore = { readonly kind: 'terminal'; readonly outcome: MoverOutcome };

type WhiteScoreBody = CentipawnScore | MateScore | WhiteTerminalScore;

type MoverScoreBody = CentipawnScore | MateScore | MoverTerminalScore;

export type WhiteScore = WhiteScoreBody & Branded<'white'>;

export type MoverScore = MoverScoreBody & Branded<'mover'>;

const asWhite = (body: WhiteScoreBody): WhiteScore => body as WhiteScore;

const asMover = (body: MoverScoreBody): MoverScore => body as MoverScore;

const withoutNegativeZero = (value: number): number => (value === 0 ? 0 : value);

const negated = (value: number): number => (value === 0 ? 0 : -value);

export const negatedWhenBlackToMove = (value: number, sideToMove: SideToMove): number =>
  sideToMove === 'w' ? withoutNegativeZero(value) : negated(value);

export const WhiteScore = {
  cp(cp: number): WhiteScore {
    if (!Number.isFinite(cp)) {
      throw new RangeError(`A centipawn score must be a finite number, got ${cp}`);
    }
    return asWhite({ kind: 'cp', cp: withoutNegativeZero(cp) });
  },

  mate(plies: number): WhiteScore {
    if (!Number.isInteger(plies) || plies === 0) {
      throw new RangeError(
        `A mate distance must be a non-zero whole number of plies, got ${plies}`,
      );
    }
    return asWhite({ kind: 'mate', plies });
  },

  terminal(outcome: TerminalOutcome): WhiteScore {
    return asWhite({ kind: 'terminal', outcome });
  },
};

const MOVER_OUTCOME: Readonly<Record<SideToMove, Readonly<Record<TerminalOutcome, MoverOutcome>>>> =
  {
    w: { white: 'win', black: 'loss', draw: 'draw' },
    b: { white: 'loss', black: 'win', draw: 'draw' },
  };

export function toMover(score: WhiteScore, sideToMove: SideToMove): MoverScore {
  switch (score.kind) {
    case 'cp':
      return asMover({ kind: 'cp', cp: negatedWhenBlackToMove(score.cp, sideToMove) });
    case 'mate':
      return asMover({ kind: 'mate', plies: negatedWhenBlackToMove(score.plies, sideToMove) });
    case 'terminal':
      return asMover({ kind: 'terminal', outcome: MOVER_OUTCOME[sideToMove][score.outcome] });
  }
}
