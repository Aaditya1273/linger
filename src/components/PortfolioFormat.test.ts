import { describe, expect, it } from 'vitest';
import { shortAddress, explorerAddressUrl, explorerTxUrl } from './PortfolioFormat';

describe('wallet address formatting', () => {
  it('shows the first 6 and last 4 characters around one ellipsis', () => {
    expect(shortAddress('0xe0785b1234567890da8d')).toBe('0xe078...da8d');
  });

  it('leaves an already-short value intact', () => {
    expect(shortAddress('0x1234')).toBe('0x1234');
  });
});

describe('Shannon explorer links', () => {
  it('uses Shannon explorer transaction links', () => {
    expect(explorerTxUrl('0xhash')).toBe('https://shannon-explorer.somnia.network/tx/0xhash');
  });

  it('uses Shannon explorer address links', () => {
    expect(explorerAddressUrl('0xabc')).toBe('https://shannon-explorer.somnia.network/address/0xabc');
  });
});
