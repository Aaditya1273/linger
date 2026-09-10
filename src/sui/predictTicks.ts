import { alignToGrid } from '../products/strikeGrid';

/** Upstream `tick_bits = 30` → positive-infinity sentinel as a higher tick. */
export const POS_INF_TICK = (1n << 30n) - 1n;

function assertPositiveTickSize(tickSizeUsd: number) {
  if (!(tickSizeUsd > 0) || !Number.isFinite(tickSizeUsd)) {
    throw new Error('tickSize must be positive.');
  }
}

function assertFinitePrice(priceUsd: number) {
  if (!Number.isFinite(priceUsd) || priceUsd < 0) {
    throw new Error('price must be a non-negative finite number.');
  }
}

/**
 * Convert a USD strike to an absolute tick index on the market grid.
 * Upstream: `finite_strike = tick * tick_size` (both in 1e9 fixed-point), so
 * `tick = round(priceUsd / tickSizeUsd)`.
 */
export function priceToTickIndex(priceUsd: number, tickSizeUsd: number): bigint {
  assertFinitePrice(priceUsd);
  assertPositiveTickSize(tickSizeUsd);

  const ticks = Math.round(priceUsd / tickSizeUsd);
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    throw new Error('tick index exceeds safe integer range.');
  }
  return BigInt(ticks);
}

/** Snap a USD price to the admission grid (typically $1 for Turbo). */
export function alignPriceToAdmissionGrid(priceUsd: number, admissionTickSizeUsd: number): number {
  assertFinitePrice(priceUsd);
  assertPositiveTickSize(admissionTickSizeUsd);
  return alignToGrid(priceUsd, 0, admissionTickSizeUsd).aligned;
}

/**
 * binary-up(K) → half-open range [K, +∞) as `(lower_tick, higher_tick)` where
 * `higher_tick = pos_inf_tick`.
 */
export function binaryUpRangeTicks(
  strikeUsd: number,
  tickSizeUsd: number,
): { lowerTick: bigint; higherTick: bigint } {
  return {
    lowerTick: priceToTickIndex(strikeUsd, tickSizeUsd),
    higherTick: POS_INF_TICK,
  };
}
