import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@brilliancy/chess-utils', () => {
  it('resolves its entry point', () => {
    expect(PACKAGE_NAME).toBe('@brilliancy/chess-utils');
  });
});
