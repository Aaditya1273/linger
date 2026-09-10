import { describe, expect, it } from 'vitest';
import type { AnkerProductNoteRecord } from './ankerPortfolio';
import { lifecycleForProductNote } from './productNoteLifecycle';
import type { PredictMarketState } from '../deepbook/predictMarketState';
import { productNoteFixture } from '../test/productNoteFixture';

const MARKET_ID = `0x${'5'.repeat(64)}`;

function noteFixture(overrides: Partial<AnkerProductNoteRecord> = {}): AnkerProductNoteRecord {
  return productNoteFixture({ oracleId: MARKET_ID, ...overrides });
}

function marketState(settlementPrice: number | null): PredictMarketState {
  return {
    expiryMarketId: MARKET_ID,
    expiryMs: 1_000,
    settlementPrice,
    settlementPriceBaseUnits: settlementPrice === null ? null : BigInt(Math.round(settlementPrice * 1_000_000_000)),
  };
}

describe('lifecycleForProductNote', () => {
  it('uses countdown, claimable, and claimed as the three user-facing states', () => {
    expect(lifecycleForProductNote(noteFixture(), marketState(null), 999)).toBe('countdown');
    expect(lifecycleForProductNote(noteFixture(), marketState(64_213), 1_001)).toBe('claimable');
    expect(lifecycleForProductNote(noteFixture({ status: 'redeemed' }), marketState(64_213), 1_001)).toBe('claimed');
  });

  it('does not make an expired but unsettled market claimable', () => {
    expect(lifecycleForProductNote(noteFixture(), marketState(null), 1_001)).toBe('awaiting_settle');
    expect(lifecycleForProductNote(noteFixture(), undefined, 1_001)).toBe('awaiting_settle');
  });

  it('does not trust settlement state from a different market', () => {
    expect(
      lifecycleForProductNote(
        noteFixture(),
        { ...marketState(64_213), expiryMarketId: `0x${'6'.repeat(64)}` },
        1_001,
      ),
    ).toBe('awaiting_settle');
  });
});
