import { describe, expect, it } from 'vitest';
import { resolveProtocolNetwork } from './deepbook';

describe('resolveProtocolNetwork', () => {
  it('defaults to the deployed testnet protocol environment', () => {
    expect(resolveProtocolNetwork()).toBe('testnet');
  });

  it('fails closed when a non-testnet network is requested', () => {
    expect(() => resolveProtocolNetwork('mainnet')).toThrow(/only configured for Sui testnet/);
    expect(() => resolveProtocolNetwork('devnet')).toThrow(/only configured for Sui testnet/);
  });
});
