import { describe, expect, it } from 'vitest';
import { isOracleFeedPaused, ORACLE_PAUSE_THRESHOLD_MS } from './oracleHealth';

const nowMs = 1_785_000_000_000;

describe('isOracleFeedPaused', () => {
  it('is not paused while both Block Scholes lanes are inside the threshold', () => {
    expect(
      isOracleFeedPaused(
        { bsPriceTimestampMs: nowMs - 1_000, bsSviTimestampMs: nowMs - 5_000 },
        nowMs,
      ),
    ).toBe(false);
  });

  it('pauses when the price lane stops pushing', () => {
    expect(
      isOracleFeedPaused(
        { bsPriceTimestampMs: nowMs - ORACLE_PAUSE_THRESHOLD_MS - 1, bsSviTimestampMs: nowMs - 1_000 },
        nowMs,
      ),
    ).toBe(true);
  });

  it('pauses when the SVI lane stops pushing', () => {
    expect(
      isOracleFeedPaused(
        { bsPriceTimestampMs: nowMs - 1_000, bsSviTimestampMs: nowMs - ORACLE_PAUSE_THRESHOLD_MS - 1 },
        nowMs,
      ),
    ).toBe(true);
  });

  it('pauses when a feed object is missing on-chain (explicit null)', () => {
    expect(isOracleFeedPaused({ bsPriceTimestampMs: null, bsSviTimestampMs: nowMs }, nowMs)).toBe(true);
    expect(isOracleFeedPaused({ bsPriceTimestampMs: nowMs, bsSviTimestampMs: null }, nowMs)).toBe(true);
  });

  it('does not judge payloads that predate the timestamp fields', () => {
    expect(isOracleFeedPaused({}, nowMs)).toBe(false);
  });

  it('tolerates slight future timestamps from clock skew', () => {
    expect(
      isOracleFeedPaused({ bsPriceTimestampMs: nowMs + 2_000, bsSviTimestampMs: nowMs + 2_000 }, nowMs),
    ).toBe(false);
  });
});
