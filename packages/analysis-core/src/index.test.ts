import { PACKAGE_NAME as CHESS_UTILS } from '@brilliancy/chess-utils';
import { WhiteScore } from '@brilliancy/engine-protocol';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@brilliancy/analysis-core', () => {
  it('resolves its entry point', () => {
    expect(PACKAGE_NAME).toBe('@brilliancy/analysis-core');
  });

  it('resolves both permitted workspace dependencies from their built output (§4.2)', () => {
    expect(CHESS_UTILS).toBe('@brilliancy/chess-utils');
    expect(WhiteScore.cp(0)).toEqual({ kind: 'cp', cp: 0 });
  });
});
