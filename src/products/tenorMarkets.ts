import { DEEPBOOK_PREDICT } from '../config/deepbook';
import type { PredictCadenceConfig } from '../config/predictDeployment';
import type { ExpiryMarketSummary } from '../deepbook/predictAdapter';

/** One calendar day — boundary between the hourly and day-scale tenor groups. */
export const DAY_MS = 86_400_000;

/** Tenor grouping on the single Dual Investment page (CONTEXT: Tenor). */
export type TenorGroup = 'hourly' | 'day';

type CadenceFingerprint = Pick<PredictCadenceConfig, 'maxExpiryAllocation' | 'initialExpiryCash'>;

/** Markets carry no cadence name; the creation params identify the schedule. */
export function matchesCadenceFingerprint(
  market: Pick<ExpiryMarketSummary, 'maxExpiryAllocation' | 'initialExpiryCash'>,
  cadence: CadenceFingerprint,
): boolean {
  return (
    market.maxExpiryAllocation === cadence.maxExpiryAllocation &&
    market.initialExpiryCash === cadence.initialExpiryCash
  );
}

/**
 * Shelving follows remaining tenor (ADR-0007): at least one day remaining
 * sells on the day shelf; under one day on the hourly shelf, so a decayed
 * day market migrates instead of vanishing. The hourly predicate is
 * exclusion-based — sub-day remaining AND not minute-cadence (ADR-0002) —
 * so day-born rows never depend on sharing the 1h cadence fingerprint.
 */
export function filterMarketsForTenorGroup(
  markets: readonly ExpiryMarketSummary[],
  group: TenorGroup,
  options: {
    nowMs?: number;
    minuteCadences?: readonly CadenceFingerprint[];
  } = {},
): ExpiryMarketSummary[] {
  const nowMs = options.nowMs ?? Date.now();
  const minuteCadences = options.minuteCadences ?? DEEPBOOK_PREDICT.minuteCadences;

  return markets
    .filter((market) => {
      const remainingMs = market.expiryMs - nowMs;
      if (group === 'day') return remainingMs >= DAY_MS;
      return (
        remainingMs > 0 &&
        remainingMs < DAY_MS &&
        !minuteCadences.some((cadence) => matchesCadenceFingerprint(market, cadence))
      );
    })
    .sort((a, b) => a.expiryMs - b.expiryMs);
}
