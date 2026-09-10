import { describe, expect, it } from 'vitest';
import { isOracleTimestampFresh, resolveLiveForward } from './propbookOracle';

describe('resolveLiveForward', () => {
  it('re-anchors the Block Scholes forward onto a fresh pyth spot', () => {
    expect(
      resolveLiveForward({ pythSpot: 101_000, pythFresh: true, bsSpot: 100_000, bsForward: 100_500 }),
    ).toBeCloseTo(101_505, 6);
  });

  it('falls back to the raw Block Scholes forward when pyth is stale', () => {
    expect(
      resolveLiveForward({ pythSpot: 101_000, pythFresh: false, bsSpot: 100_000, bsForward: 100_500 }),
    ).toBe(100_500);
  });

  it('falls back when any anchor input is non-positive', () => {
    expect(
      resolveLiveForward({ pythSpot: 0, pythFresh: true, bsSpot: 100_000, bsForward: 100_500 }),
    ).toBe(100_500);
  });
});

describe('isOracleTimestampFresh', () => {
  const nowMs = 1_785_000_000_000;

  it('accepts observations inside the freshness window', () => {
    expect(
      isOracleTimestampFresh({ sourceTimestampMs: nowMs - 5_000, nowMs, freshnessMs: 10_000 }),
    ).toBe(true);
  });

  it('rejects stale, future, and missing timestamps', () => {
    expect(
      isOracleTimestampFresh({ sourceTimestampMs: nowMs - 10_001, nowMs, freshnessMs: 10_000 }),
    ).toBe(false);
    expect(
      isOracleTimestampFresh({ sourceTimestampMs: nowMs + 1, nowMs, freshnessMs: 10_000 }),
    ).toBe(false);
    expect(isOracleTimestampFresh({ sourceTimestampMs: 0, nowMs, freshnessMs: 10_000 })).toBe(false);
  });
});
