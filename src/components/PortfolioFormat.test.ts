import { describe, expect, it } from 'vitest';
import { shortAddress, suiExplorerObjectUrl, suiExplorerTxUrl } from './PortfolioFormat';

describe('wallet address formatting', () => {
  it('shows the first 6 and last 4 characters around one ellipsis', () => {
    expect(shortAddress('0xe0785b1234567890da8d')).toBe('0xe078...da8d');
  });

  it('leaves an already-short value intact', () => {
    expect(shortAddress('0x1234')).toBe('0x1234');
  });
});

describe('Sui explorer links', () => {
  it('uses SuiVision testnet transaction links', () => {
    expect(suiExplorerTxUrl('0xdigest')).toBe('https://testnet.suivision.xyz/txblock/0xdigest');
  });

  it('uses SuiVision testnet object links', () => {
    expect(suiExplorerObjectUrl('0xobject')).toBe('https://testnet.suivision.xyz/object/0xobject');
  });
});
