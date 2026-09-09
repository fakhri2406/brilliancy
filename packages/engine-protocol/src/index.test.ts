import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@brilliancy/engine-protocol', () => {
  it('resolves its entry point', () => {
    expect(PACKAGE_NAME).toBe('@brilliancy/engine-protocol');
  });
});
