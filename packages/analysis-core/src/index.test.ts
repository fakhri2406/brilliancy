import { PACKAGE_NAME as CHESS_UTILS } from '@brilliancy/chess-utils';
import { toMover, WhiteScore } from '@brilliancy/engine-protocol';
import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('@brilliancy/analysis-core', () => {
  it('exports exactly the public runtime surface', () => {
    expect(Object.keys(core).sort()).toEqual(['accuracyPercent', 'winPercent']);
  });

  it('resolves both permitted workspace dependencies from their built output (§4.2)', () => {
    expect(CHESS_UTILS).toBe('@brilliancy/chess-utils');
    expect(core.winPercent(toMover(WhiteScore.cp(0), 'w'))).toBe(50);
  });
});
