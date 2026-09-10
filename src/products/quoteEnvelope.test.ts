import { describe, expect, it } from 'vitest';
import { assertQuoteEnvelope, createQuoteEnvelope, productHashForQuote } from './quoteEnvelope';
import type { StructuredProductQuote } from './types';

function quoteFixture(overrides: Partial<StructuredProductQuote> = {}): StructuredProductQuote {
  return {
    id: 'dual-demo',
    productType: 'dual-investment',
    title: 'Target Buy BTC',
    principal: 1_000,
    oracle: {
      predictId: '0xpredict',
      oracleId: '0xoracle',
      underlyingAsset: 'BTC',
      expiryMs: 2_000,
      minStrike: 50_000,
      tickSize: 1,
      status: 'active',
      spot: 66_000,
      forward: 66_100,
      spotTimestampMs: 1,
      sviTimestampMs: 1,
      serverLagSeconds: 0,
    },
    reserve: 900,
    totalLegCost: 10,
    coupon: 90,
    apr: 0.1,
    executable: true,
    legs: [
      {
        id: 'up-60000',
        instrumentType: 'binary-up',
        oracleId: '0xoracle',
        expiryMs: 2_000,
        strike: 60_000,
        isUp: true,
        quantity: 40,
        description: 'UP 60,000',
        askPrice: 0.1,
        askCost: 4,
        redeemPreview: 0,
        quoteTimestampMs: 100,
        executable: true,
      },
      {
        id: 'up-62000',
        instrumentType: 'binary-up',
        oracleId: '0xoracle',
        expiryMs: 2_000,
        strike: 62_000,
        isUp: true,
        quantity: 60,
        description: 'UP 62,000',
        askPrice: 0.1,
        askCost: 6,
        redeemPreview: 0,
        quoteTimestampMs: 120,
        executable: true,
      },
    ],
    scenarios: [],
    ...overrides,
  };
}

describe('QuoteEnvelope', () => {
  it('captures quote expiry and max cost protection from quoted legs', () => {
    const envelope = createQuoteEnvelope({
      quote: quoteFixture(),
      network: 'testnet',
      quoteAssetDecimals: 6,
      ttlMs: 30_000,
      slippageBps: 100,
    });

    expect(envelope.quotedAtMs).toBe(100);
    expect(envelope.expiresAtMs).toBe(30_100);
    expect(envelope.productHash).toMatch(/^0x[0-9a-f]{16}$/);
    expect(envelope.oracleId).toBe('0xoracle');
    expect(envelope.expiryMs).toBe(2_000);
    expect(envelope.maxTotalCostBaseUnits).toBe(10_100_000n);
    expect(envelope.minCouponBaseUnits).toBe(89_900_000n);
    expect(envelope.legs.map((leg) => leg.maxCostBaseUnits)).toEqual([4_040_000n, 6_060_000n]);
  });

  it('rejects expired quote envelopes before wallet signing', () => {
    const quote = quoteFixture();
    const envelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: 6,
      ttlMs: 30_000,
      slippageBps: 100,
    });

    expect(() =>
      assertQuoteEnvelope({
        quote,
        envelope,
        network: 'testnet',
        quoteAssetDecimals: 6,
        nowMs: 30_101,
      }),
    ).toThrow('Quote expired');
  });

  it('rejects envelopes for a different oracle or expiry before wallet signing', () => {
    const quote = quoteFixture();
    const envelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: 6,
      ttlMs: 30_000,
      slippageBps: 100,
    });

    expect(() =>
      assertQuoteEnvelope({
        quote: quoteFixture({ oracle: { ...quote.oracle, oracleId: '0xother' } }),
        envelope,
        network: 'testnet',
        quoteAssetDecimals: 6,
        nowMs: 1_000,
      }),
    ).toThrow('Quote oracle mismatch');

    expect(() =>
      assertQuoteEnvelope({
        quote: quoteFixture({ oracle: { ...quote.oracle, expiryMs: 3_000 } }),
        envelope,
        network: 'testnet',
        quoteAssetDecimals: 6,
        nowMs: 1_000,
      }),
    ).toThrow('Quote expiry mismatch');
  });

  it('rejects stale envelopes when quote economics change beyond max cost', () => {
    const quote = quoteFixture();
    const envelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: 6,
      ttlMs: 30_000,
      slippageBps: 100,
    });
    const repriced = quoteFixture({
      totalLegCost: 10.2,
      legs: quote.legs.map((leg) => ({ ...leg, askCost: leg.askCost + 0.1 })),
    });

    expect(productHashForQuote(repriced)).toBe(productHashForQuote(quote));
    expect(() =>
      assertQuoteEnvelope({
        quote: repriced,
        envelope,
        network: 'testnet',
        quoteAssetDecimals: 6,
        nowMs: 1_000,
      }),
    ).toThrow('Quoted cost exceeds max cost');
  });

  it('keeps product hash stable for reprices that only change quote economics', () => {
    const quote = quoteFixture();
    const envelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: 6,
      ttlMs: 30_000,
      slippageBps: 100,
    });
    const repriced = quoteFixture({
      totalLegCost: 10.05,
      coupon: 89.95,
      apr: 0.09,
      legs: quote.legs.map((leg) => ({ ...leg, askCost: leg.askCost + 0.025 })),
    });

    expect(productHashForQuote(repriced)).toBe(productHashForQuote(quote));
    expect(() =>
      assertQuoteEnvelope({
        quote: repriced,
        envelope,
        network: 'testnet',
        quoteAssetDecimals: 6,
        nowMs: 1_000,
      }),
    ).not.toThrow();
  });

  it('rejects refreshed quote metadata when coupon falls below the envelope minimum', () => {
    const quote = quoteFixture();
    const envelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: 6,
      ttlMs: 30_000,
      slippageBps: 100,
    });
    const repriced = quoteFixture({
      totalLegCost: 10.05,
      coupon: 89.89,
      apr: 0.09,
      legs: quote.legs.map((leg) => ({ ...leg, askCost: leg.askCost + 0.025 })),
    });

    expect(productHashForQuote(repriced)).toBe(productHashForQuote(quote));
    expect(() =>
      assertQuoteEnvelope({
        quote: repriced,
        envelope,
        network: 'testnet',
        quoteAssetDecimals: 6,
        nowMs: 1_000,
      }),
    ).toThrow('Quoted coupon is below the minimum accepted coupon.');
  });

  it('rejects negative leg economics instead of clipping them into base units', () => {
    expect(() =>
      createQuoteEnvelope({
        quote: quoteFixture({
          totalLegCost: -1,
          legs: quoteFixture().legs.map((leg) => ({ ...leg, askCost: -1 })),
        }),
        network: 'testnet',
        quoteAssetDecimals: 6,
        ttlMs: 30_000,
        slippageBps: 100,
      }),
    ).toThrow('Quote leg cost must be a non-negative finite number');
  });

  it('rejects amount conversions that exceed the safe integer boundary before bigint conversion', () => {
    const unsafeCost = Number.MAX_SAFE_INTEGER / 1_000_000 + 1;

    expect(() =>
      createQuoteEnvelope({
        quote: quoteFixture({
          totalLegCost: unsafeCost,
          legs: quoteFixture().legs.map((leg) => ({ ...leg, askCost: unsafeCost, quantity: unsafeCost })),
        }),
        network: 'testnet',
        quoteAssetDecimals: 6,
        ttlMs: 30_000,
        slippageBps: 100,
      }),
    ).toThrow('exceeds safe integer range');
  });
});
