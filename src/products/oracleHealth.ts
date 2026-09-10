import type { OracleMarket } from './types';

/**
 * Browse-side detector for a paused upstream Block Scholes push. The chain's
 * PricingConfig holds mint inputs to tight windows (spot/forward 10s, SVI 60s),
 * so once the push stops every `load_live_pricer` aborts (`EBlockScholesPriceStale`).
 * The browse gate uses a coarser threshold: a sub-minute push gap is a transient
 * the pre-sign simulation already explains, not a reason to flap the subscribe CTA.
 */
export const ORACLE_PAUSE_THRESHOLD_MS = 60_000;

/** English warning carried on the quote; UI layers localize via `warningCode`. */
export const ORACLE_PAUSED_WARNING =
  'Upstream price feed is paused — new subscriptions are temporarily unavailable.';

/**
 * True when the Block Scholes inputs behind on-chain mint pricing are missing
 * (`null`: feed objects unreadable) or older than the pause threshold. Payloads
 * predating the timestamp fields (`undefined`) are not judged — absence of
 * evidence is not a pause.
 */
export function isOracleFeedPaused(
  oracle: Pick<OracleMarket, 'bsPriceTimestampMs' | 'bsSviTimestampMs'>,
  nowMs: number,
): boolean {
  const stamps = [oracle.bsPriceTimestampMs, oracle.bsSviTimestampMs];
  if (stamps.some((stamp) => stamp === null)) return true;
  return stamps.some(
    (stamp) => typeof stamp === 'number' && nowMs - stamp > ORACLE_PAUSE_THRESHOLD_MS,
  );
}
