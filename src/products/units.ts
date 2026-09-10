export const PRICE_SCALE = 1_000_000_000;

export function fromChainPrice(value: number | string): number {
  return Number(value) / PRICE_SCALE;
}

export function toChainPrice(value: number): number {
  return Math.round(value * PRICE_SCALE);
}

export function daysBetween(nowMs: number, expiryMs: number): number {
  return Math.max(0, (expiryMs - nowMs) / 86_400_000);
}

export function aprFromCoupon(coupon: number, principal: number, daysToExpiry: number): number {
  if (principal <= 0 || daysToExpiry <= 0) return 0;
  return (coupon / principal) * (365 / daysToExpiry);
}
