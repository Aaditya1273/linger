import { describe, expect, it } from 'vitest';
import { parseExpiryMarketObject } from './predictOnchain';

const MARKET_ID = `0x${'a'.repeat(64)}`;

/** Verbatim field layout of an 8-04 ExpiryMarket object (GraphQL contents.json). */
function marketJson(overrides: { settlement_price?: string | null } = {}) {
  return {
    id: MARKET_ID,
    propbook_underlying_id: 1,
    expiry: '1786000800000',
    cash: { cash_balance: '0' },
    strike_exposure: {
      expiry_market_id: MARKET_ID,
      expiry_ms: '1786000800000',
      tick_size: '10000000',
      admission_tick_size: '1000000000',
      settlement_price: overrides.settlement_price ?? null,
      config: {
        liquidation_ltv: '850000000',
        max_admission_leverage: '3000000000',
        base_fee: '20000000',
        min_fee: '5000000',
        min_entry_probability: '10000000',
        max_entry_probability: '990000000',
        expiry_fee_window_ms: '300000',
        expiry_fee_max_multiplier: '2000000000',
        no_leverage_window_ms: '3600000',
      },
    },
    mint_paused: false,
  };
}

describe('parseExpiryMarketObject', () => {
  it('parses a live (unsettled) 8-04 expiry market object', () => {
    expect(parseExpiryMarketObject(marketJson())).toEqual({
      expiryMarketId: MARKET_ID,
      expiryMs: 1_786_000_800_000,
      tickSizeRaw: 10_000_000,
      admissionTickSizeRaw: 1_000_000_000,
      propbookUnderlyingId: 1,
      baseFeeRaw: 20_000_000,
      minFeeRaw: 5_000_000,
      minEntryProbabilityRaw: 10_000_000,
      maxEntryProbabilityRaw: 990_000_000,
      expiryFeeWindowMs: 300_000,
      expiryFeeMaxMultiplierRaw: 2_000_000_000,
      mintPaused: false,
      settlementPriceBaseUnits: null,
    });
  });

  it('parses the exact settlement price of a settled market', () => {
    const state = parseExpiryMarketObject(marketJson({ settlement_price: '63819551020700' }));
    expect(state?.settlementPriceBaseUnits).toBe(63_819_551_020_700n);
  });

  it('returns null for payloads missing the strike exposure config', () => {
    expect(parseExpiryMarketObject({ id: MARKET_ID, expiry: '1' })).toBeNull();
    expect(parseExpiryMarketObject(null)).toBeNull();
  });
});
