import type { SviParameters } from '../products/types';

/**
 * Normalized propbook oracle reads. Since the 8-04 deployment these come from
 * `predictOnchain.fetchPropbookOracleReads` (devInspect over the propbook store
 * getters); `sourceTimestampMs` carries the provider clock the on-chain pricer
 * asserts freshness on (`model_timestamp_ms` for Block Scholes lanes).
 */
export interface PropbookSpotRead {
  spot: number;
  sourceTimestampMs: number;
  updateTimestampMs: number;
}

export interface PropbookForwardRead {
  forward: number;
  expiryMs: number;
  sourceTimestampMs: number;
  updateTimestampMs: number;
}

export interface PropbookSviRead {
  svi: SviParameters;
  expiryMs: number;
  sourceTimestampMs: number;
  updateTimestampMs: number;
}

/**
 * Predict live-forward rule (pricing-and-oracles.md):
 * pyth fresh → pyth_spot × (bs.forward / bs.spot); else bs.forward.
 */
export function resolveLiveForward(input: {
  pythSpot: number;
  pythFresh: boolean;
  bsSpot: number;
  bsForward: number;
}): number {
  if (input.pythFresh && input.pythSpot > 0 && input.bsSpot > 0 && input.bsForward > 0) {
    return input.pythSpot * (input.bsForward / input.bsSpot);
  }
  return input.bsForward;
}

export function isOracleTimestampFresh(input: {
  sourceTimestampMs: number;
  nowMs: number;
  freshnessMs: number;
}): boolean {
  if (!(input.sourceTimestampMs > 0) || input.sourceTimestampMs > input.nowMs) return false;
  return input.nowMs - input.sourceTimestampMs <= input.freshnessMs;
}
