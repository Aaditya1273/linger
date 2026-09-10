export const DEFAULT_PROTOCOL_FEE_BPS = 1_000;

const BPS_DENOMINATOR = 10_000;

function normalizedFeeBps(feeBps: number) {
  if (!Number.isFinite(feeBps)) return 0;
  return Math.min(BPS_DENOMINATOR, Math.max(0, feeBps));
}

export function netAprAfterCouponFee(apr: number, feeBps = DEFAULT_PROTOCOL_FEE_BPS) {
  if (!Number.isFinite(apr)) return 0;
  const netApr = apr * (1 - normalizedFeeBps(feeBps) / BPS_DENOMINATOR);
  return Math.abs(netApr) < 1e-12 ? 0 : Number(netApr.toFixed(12));
}

/** The reward amount the user actually keeps — every user-facing reward figure shows this. */
export function netCouponAfterFee(coupon: number, feeBps = DEFAULT_PROTOCOL_FEE_BPS) {
  if (!Number.isFinite(coupon)) return 0;
  return coupon * (1 - normalizedFeeBps(feeBps) / BPS_DENOMINATOR);
}
