import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@brilliancy/openings', () => {
  it('resolves its entry point', () => {
    expect(PACKAGE_NAME).toBe('@brilliancy/openings');
  });
});
