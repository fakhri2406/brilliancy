import { describe, expect, expectTypeOf, it } from 'vitest';
import * as protocol from './index.js';

const RUNTIME_SURFACE = ['WhiteScore', 'toMover'] as const;

describe('@brilliancy/engine-protocol', () => {
  it('exports exactly the public runtime surface', () => {
    expect(Object.keys(protocol).sort()).toEqual([...RUNTIME_SURFACE]);
  });

  it('types the runtime surface identically', () => {
    expectTypeOf<keyof typeof protocol>().toEqualTypeOf<(typeof RUNTIME_SURFACE)[number]>();
  });

  it('offers no way to build a MoverScore other than toMover', () => {
    expect(protocol).not.toHaveProperty('MoverScore');
  });
});
