import { describe, expect, it } from 'vitest';
import { areExperimentalProductsEnabled, assertExperimentalProductsEnabled } from './experimentalFeatures';

describe('experimental feature flags', () => {
  it('keeps unfinished products disabled by default', () => {
    expect(areExperimentalProductsEnabled({})).toBe(false);
    expect(() => assertExperimentalProductsEnabled(false)).toThrow('Experimental products are disabled');
  });

  it('enables experimental products only from explicit opt-in flags', () => {
    expect(areExperimentalProductsEnabled({ ENABLE_EXPERIMENTAL_PRODUCTS: 'true' })).toBe(true);
    expect(areExperimentalProductsEnabled({ NEXT_PUBLIC_ENABLE_EXPERIMENTAL_PRODUCTS: '1' })).toBe(true);
    expect(areExperimentalProductsEnabled({ ENABLE_EXPERIMENTAL_PRODUCTS: 'false' })).toBe(false);
  });
});
