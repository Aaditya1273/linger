import { afterEach, describe, expect, it, vi } from 'vitest';
import { oracleMarketFromFixture } from '../test/oracleMarketFixture';
import {
  applyPredictMintBounds,
  createDefaultQuoteProvider,
  normalizePreviewResult,
  SviBrowseQuoteProvider,
  toPreviewQuantityBaseUnits,
} from './quoteProvider';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizePreviewResult', () => {
  it('normalizes mint cost and redeem payout', () => {
    expect(normalizePreviewResult({ mintCost: '12', redeemPayout: '9' })).toEqual({
      askCost: 12,
      redeemPreview: 9,
    });
  });
});

describe('toPreviewQuantityBaseUnits', () => {
  it('converts preview quantities without silently clamping invalid values', () => {
    expect(toPreviewQuantityBaseUnits(1.25)).toBe(1_250_000n);
    expect(() => toPreviewQuantityBaseUnits(0)).toThrow('Preview quantity must be greater than zero');
    expect(() => toPreviewQuantityBaseUnits(0.0000001)).toThrow('Preview quantity rounds to zero base units');
    expect(() => toPreviewQuantityBaseUnits(Number.MAX_SAFE_INTEGER / 1_000_000 + 1)).toThrow(
      'Preview quantity exceeds safe integer range',
    );
  });
});

describe('applyPredictMintBounds', () => {
  it('marks quoted legs outside the Predict mint ask bounds as not executable', () => {
    const quote = applyPredictMintBounds(
      {
        id: 'up-64667',
        instrumentType: 'binary-up',
        oracleId: '0xoracle',
        expiryMs: 1,
        strike: 64_667,
        isUp: true,
        quantity: 1,
        description: 'UP 64,667',
      },
      { askCost: 1.001, redeemPreview: 0 },
      123,
      { minAskPrice: 0.01, maxAskPrice: 0.99 },
    );

    expect(quote.executable).toBe(false);
    expect(quote.error).toMatch(/outside Predict mint bounds/);
  });
});

describe('SviBrowseQuoteProvider', () => {
  it('prices binary-up legs from SVI fair + trading fee stack', async () => {
    const market = oracleMarketFromFixture();
    const provider = new SviBrowseQuoteProvider(market);
    const [quote] = await provider.quoteLegs([
      {
        id: 'up',
        instrumentType: 'binary-up',
        oracleId: market.oracleId,
        expiryMs: market.expiryMs,
        strike: 72_500,
        isUp: true,
        quantity: 10,
        description: 'UP',
      },
    ]);

    expect(quote.askPrice).toBeGreaterThan(0);
    expect(quote.askPrice).toBeLessThan(1);
    expect(quote.askCost).toBeCloseTo(quote.askPrice * 10);
    expect(quote.executable).toBe(true);
  });
});

describe('createDefaultQuoteProvider', () => {
  it('uses local SVI quotes for deterministic browser tests when a market is supplied', () => {
    vi.stubEnv('NEXT_PUBLIC_ANKER_DETERMINISTIC_E2E', 'true');
    const provider = createDefaultQuoteProvider(oracleMarketFromFixture());
    expect(provider).toBeInstanceOf(SviBrowseQuoteProvider);
  });

  it('rejects quoting when no SVI market is available instead of inventing prices', async () => {
    const provider = createDefaultQuoteProvider();
    await expect(
      provider.quoteLegs([
        {
          id: 'up',
          instrumentType: 'binary-up',
          oracleId: '0xoracle',
          expiryMs: 1,
          strike: 72_500,
          isUp: true,
          quantity: 10,
          description: 'UP',
        },
      ]),
    ).rejects.toThrow('SVI surface unavailable');
  });
});
