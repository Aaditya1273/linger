import { describe, expect, it } from 'vitest';
import { parsePredictMarketStateWire, toPredictMarketStateWire } from './predictMarketState';

const MARKET_ID = `0x${'5'.repeat(64)}`;

describe('predict market state wire format', () => {
  it('parses a settled expiry market and its exact settlement price', () => {
    expect(
      parsePredictMarketStateWire({
        expiryMarketId: MARKET_ID,
        expiryMs: 1_000,
        settlementPriceBaseUnits: '64213934107220',
      }),
    ).toEqual({
      expiryMarketId: MARKET_ID,
      expiryMs: 1_000,
      settlementPrice: 64_213.93410722,
      settlementPriceBaseUnits: 64_213_934_107_220n,
    });
  });

  it('keeps an expired market without a settlement price awaiting settlement', () => {
    expect(
      parsePredictMarketStateWire({
        expiryMarketId: MARKET_ID,
        expiryMs: 1_000,
        settlementPriceBaseUnits: null,
      }),
    ).toEqual({
      expiryMarketId: MARKET_ID,
      expiryMs: 1_000,
      settlementPrice: null,
      settlementPriceBaseUnits: null,
    });
  });

  it('round-trips through the JSON-safe wire shape (bigint as string)', () => {
    const state = parsePredictMarketStateWire({
      expiryMarketId: MARKET_ID,
      expiryMs: 2_000,
      settlementPriceBaseUnits: '1',
    });
    expect(parsePredictMarketStateWire(toPredictMarketStateWire(state))).toEqual(state);
  });

  it('rejects a payload without a market id', () => {
    expect(() => parsePredictMarketStateWire({ expiryMs: 1_000 })).toThrow('invalid');
  });
});
