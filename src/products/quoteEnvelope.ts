import type { LegQuote, StructuredProductQuote } from './types';
import { legIdentityKey } from './legIdentity';

export interface QuoteEnvelopeLeg {
  legKey: string;
  quantityBaseUnits: bigint;
  expectedCostBaseUnits: bigint;
  maxCostBaseUnits: bigint;
}

export interface QuoteEnvelope {
  network: string;
  oracleId: string;
  expiryMs: number;
  productHash: string;
  quotedAtMs: number;
  expiresAtMs: number;
  maxTotalCostBaseUnits: bigint;
  minCouponBaseUnits: bigint;
  legs: readonly QuoteEnvelopeLeg[];
}

interface CreateQuoteEnvelopeInput {
  quote: StructuredProductQuote;
  network: string;
  quoteAssetDecimals: number;
  ttlMs: number;
  slippageBps: number;
}

interface AssertQuoteEnvelopeInput {
  quote: StructuredProductQuote;
  envelope: QuoteEnvelope;
  network: string;
  quoteAssetDecimals: number;
  nowMs: number;
}

const BPS_DENOMINATOR = 10_000n;
const FNV_64_OFFSET = 0xcbf29ce484222325n;
const FNV_64_PRIME = 0x100000001b3n;
const U64_MASK = (1n << 64n) - 1n;
export const DEFAULT_QUOTE_ENVELOPE_TTL_MS = 30_000;
export const DEFAULT_QUOTE_ENVELOPE_SLIPPAGE_BPS = 100;

function toBaseUnits(value: number, decimals: number, label: string) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`${label} decimals must be an integer between 0 and 18.`);
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }

  const scaled = value * 10 ** decimals;
  const rounded = Math.round(scaled);
  if (!Number.isFinite(scaled) || !Number.isSafeInteger(rounded)) {
    throw new Error(`${label} exceeds safe integer range for ${decimals} decimals.`);
  }

  return BigInt(rounded);
}

function maxWithSlippage(value: bigint, slippageBps: number) {
  const numerator = value * BigInt(10_000 + Math.max(0, slippageBps));
  return (numerator + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
}

function minCouponWithSlippage(couponBaseUnits: bigint, expectedCostBaseUnits: bigint, maxCostBaseUnits: bigint) {
  const acceptedCostIncrease = maxCostBaseUnits - expectedCostBaseUnits;
  return couponBaseUnits > acceptedCostIncrease ? couponBaseUnits - acceptedCostIncrease : 0n;
}

export function legKey(leg: LegQuote) {
  return legIdentityKey(leg);
}

function stableHash(input: string) {
  let hash = FNV_64_OFFSET;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_64_PRIME) & U64_MASK;
  }
  return `0x${hash.toString(16).padStart(16, '0')}`;
}

export function productHashForQuote(quote: StructuredProductQuote) {
  return stableHash(JSON.stringify({
    productType: quote.productType,
    principal: quote.principal,
    oracleId: quote.oracle.oracleId,
    expiryMs: quote.oracle.expiryMs,
    reserve: quote.reserve,
    legs: quote.legs.map((leg) => legKey(leg)),
  }));
}

export function createQuoteEnvelope({
  quote,
  network,
  quoteAssetDecimals,
  ttlMs,
  slippageBps,
}: CreateQuoteEnvelopeInput): QuoteEnvelope {
  const quotedAtMs = quote.legs.reduce(
    (oldest, leg) => Math.min(oldest, leg.quoteTimestampMs),
    quote.legs[0]?.quoteTimestampMs ?? Date.now(),
  );
  const legs = quote.legs.map((leg) => {
    const expectedCostBaseUnits = toBaseUnits(leg.askCost, quoteAssetDecimals, 'Quote leg cost');
    return {
      legKey: legKey(leg),
      quantityBaseUnits: toBaseUnits(leg.quantity, quoteAssetDecimals, 'Quote leg quantity'),
      expectedCostBaseUnits,
      maxCostBaseUnits: maxWithSlippage(expectedCostBaseUnits, slippageBps),
    };
  });
  const expectedTotalCostBaseUnits = toBaseUnits(quote.totalLegCost, quoteAssetDecimals, 'Quote total leg cost');
  const maxTotalCostBaseUnits = maxWithSlippage(expectedTotalCostBaseUnits, slippageBps);
  const couponBaseUnits = toBaseUnits(quote.coupon, quoteAssetDecimals, 'Quote coupon');
  return {
    network,
    oracleId: quote.oracle.oracleId,
    expiryMs: quote.oracle.expiryMs,
    productHash: productHashForQuote(quote),
    quotedAtMs,
    expiresAtMs: quotedAtMs + ttlMs,
    maxTotalCostBaseUnits,
    minCouponBaseUnits: minCouponWithSlippage(couponBaseUnits, expectedTotalCostBaseUnits, maxTotalCostBaseUnits),
    legs,
  };
}

export function assertQuoteEnvelope({
  quote,
  envelope,
  network,
  quoteAssetDecimals,
  nowMs,
}: AssertQuoteEnvelopeInput) {
  if (envelope.network !== network) {
    throw new Error(`Quote network mismatch: expected ${network}, got ${envelope.network}.`);
  }
  if (envelope.oracleId !== quote.oracle.oracleId) {
    throw new Error(`Quote oracle mismatch: expected ${envelope.oracleId}, got ${quote.oracle.oracleId}.`);
  }
  if (envelope.expiryMs !== quote.oracle.expiryMs) {
    throw new Error(`Quote expiry mismatch: expected ${envelope.expiryMs}, got ${quote.oracle.expiryMs}.`);
  }
  if (envelope.productHash !== productHashForQuote(quote)) {
    throw new Error('Quote product hash mismatch.');
  }
  if (nowMs > envelope.expiresAtMs) {
    throw new Error('Quote expired. Refresh pricing before signing.');
  }
  const totalCost = toBaseUnits(quote.totalLegCost, quoteAssetDecimals, 'Quote total leg cost');
  if (totalCost > envelope.maxTotalCostBaseUnits) {
    throw new Error('Quoted cost exceeds max cost.');
  }
  if (toBaseUnits(quote.coupon, quoteAssetDecimals, 'Quote coupon') < envelope.minCouponBaseUnits) {
    throw new Error('Quoted coupon is below the minimum accepted coupon.');
  }
  const envelopeLegsByKey = new Map(envelope.legs.map((leg) => [leg.legKey, leg]));
  quote.legs.forEach((leg) => {
    const key = legKey(leg);
    const envelopeLeg = envelopeLegsByKey.get(key);
    if (!envelopeLeg) {
      throw new Error(`Quote envelope is missing leg ${key}.`);
    }
    if (toBaseUnits(leg.quantity, quoteAssetDecimals, 'Quote leg quantity') !== envelopeLeg.quantityBaseUnits) {
      throw new Error(`Quote quantity changed for leg ${key}.`);
    }
    if (toBaseUnits(leg.askCost, quoteAssetDecimals, 'Quote leg cost') > envelopeLeg.maxCostBaseUnits) {
      throw new Error('Quoted cost exceeds max cost.');
    }
  });
}
