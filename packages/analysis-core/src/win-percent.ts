import type { MoverOutcome, MoverScore } from '@brilliancy/engine-protocol';
import { clamp } from './clamp.js';

const CENTIPAWN_CLAMP = 1000;

const WIN_CHANCE_SLOPE = 0.00368208;

const TERMINAL_WIN_PERCENT: Readonly<Record<MoverOutcome, number>> = {
  win: 100,
  loss: 0,
  draw: 50,
};

export function winPercent(score: MoverScore): number {
  switch (score.kind) {
    case 'terminal':
      return TERMINAL_WIN_PERCENT[score.outcome];
    case 'mate':
      return score.plies > 0 ? 100 : 0;
    case 'cp': {
      const cp = clamp(score.cp, -CENTIPAWN_CLAMP, CENTIPAWN_CLAMP);
      return 50 + 50 * (2 / (1 + Math.exp(-WIN_CHANCE_SLOPE * cp)) - 1);
    }
  }
}
