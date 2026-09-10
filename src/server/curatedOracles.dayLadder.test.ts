import { describe, expect, it } from 'vitest';
import { deterministicCuratedBtcOracleResponse } from './deterministicPredictFixtures';

describe('deterministicCuratedBtcOracleResponse (E2E)', () => {
  it('serves one merged response: day rows first, then hourly rows', () => {
    const nowMs = 1_700_000_000_000;
    const response = deterministicCuratedBtcOracleResponse(nowMs);

    const dayRows = response.oracles.filter((oracle) => oracle.group === 'day');
    const hourlyRows = response.oracles.filter((oracle) => oracle.group === 'hourly');
    expect(dayRows.length).toBeGreaterThan(0);
    expect(hourlyRows.length).toBe(3);

    // Day group leads (primary product) and carries embedded browse markets —
    // the 6-24 indexer cannot serve fixture ids.
    expect(response.oracles.slice(0, dayRows.length).every((oracle) => oracle.group === 'day')).toBe(true);
    expect(dayRows.every((oracle) => oracle.market)).toBe(true);
    expect(hourlyRows.every((oracle) => oracle.cadence === '1h')).toBe(true);
  });
});
