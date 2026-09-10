import type { LegQuote, StructuredProductQuote } from '../products/types';
import { toChainPrice } from '../products/units';
import type { AnkerProtocolConfig } from './ankerProtocolConfig';
import { binaryUpRangeTicks } from './predictTicks';

export const U64_MAX = (1n << 64n) - 1n;
/** 1e9-scaled leverage: 1x (no floor). */
export const LEVERAGE_1X = 1_000_000_000n;
/** D6 layer-3 mint slippage (~1.5%). */
export const MINT_SLIPPAGE_BPS = 150;

function assertSafeU64Number(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} exceeds safe integer range.`);
  }
}

export function toQuoteBaseUnits(value: number, decimals: number, label: string): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`${label} decimals must be an integer between 0 and 18.`);
  }

  const rounded = Math.round(value * 10 ** decimals);
  assertSafeU64Number(rounded, label);
  return BigInt(rounded);
}

export function toChainPriceU64(value: number, label: string): bigint {
  const price = toChainPrice(value);
  assertSafeU64Number(price, label);
  return BigInt(price);
}

export function toBpsU64(value: number, label: string): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
  const rounded = Math.round(value * 10_000);
  assertSafeU64Number(rounded, label);
  return BigInt(rounded);
}

export function applyMintSlippage(value: bigint, slippageBps: number = MINT_SLIPPAGE_BPS): bigint {
  if (value < 0n) {
    throw new Error('Slippage base value must be non-negative.');
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0) {
    throw new Error('Slippage bps must be a non-negative integer.');
  }
  if (value === U64_MAX) return U64_MAX;
  const scaled = value * BigInt(10_000 + slippageBps);
  const withCeil = (scaled + 9_999n) / 10_000n;
  return withCeil > U64_MAX ? U64_MAX : withCeil;
}

export function subscribeTopUpBaseUnits(principalBaseUnits: bigint, wrapperBalanceBaseUnits: bigint): bigint {
  if (principalBaseUnits < 0n || wrapperBalanceBaseUnits < 0n) {
    throw new Error('Principal and wrapper balance must be non-negative.');
  }
  return principalBaseUnits > wrapperBalanceBaseUnits
    ? principalBaseUnits - wrapperBalanceBaseUnits
    : 0n;
}

export function productIdBytes(productId: string): number[] {
  return Array.from(new TextEncoder().encode(productId));
}

export function target(config: AnkerProtocolConfig, moduleName: string, functionName: string): string {
  return `${config.packageId}::${moduleName}::${functionName}`;
}

export function predictTarget(config: AnkerProtocolConfig, moduleName: string, functionName: string): string {
  return `${config.predictPackageId}::${moduleName}::${functionName}`;
}

export function accountTarget(config: AnkerProtocolConfig, moduleName: string, functionName: string): string {
  return `${config.accountPackageId}::${moduleName}::${functionName}`;
}

export function assertDualInvestmentQuote(quote: StructuredProductQuote) {
  if (quote.productType !== 'dual-investment') {
    throw new Error('Expected a Dual Investment quote.');
  }
  if (!quote.executable) {
    throw new Error(quote.warning ?? 'Dual Investment quote is not executable.');
  }
}

export function assertQuoteMatchesConfig(quote: StructuredProductQuote, config: AnkerProtocolConfig) {
  if (quote.oracle.predictId.toLowerCase() !== config.poolVaultId.toLowerCase()) {
    throw new Error('Quote Predict object does not match configured Predict object.');
  }
}

/**
 * Client-side mirror of `order::assert_valid_quantity` (abort 4): the order book
 * only stores quantity in fixed-width "lots", so mint_exact_quantity requires an
 * exact multiple of the lot size or the mint aborts. Quote construction already
 * floors quantities to this grid (`floorQuantityToOrderLot` in
 * products/predictPricing.ts) so the quoted payout matches the mint; the floor
 * here only absorbs float→base-unit conversion noise.
 */
const ORDER_QUANTITY_LOT_SIZE_BASE_UNITS = 10_000n;

export function legQuantityToBaseUnits(leg: LegQuote, config: AnkerProtocolConfig): bigint {
  const raw = toQuoteBaseUnits(leg.quantity, config.quoteAssetDecimals, `Quote leg ${leg.id} quantity`);
  return (raw / ORDER_QUANTITY_LOT_SIZE_BASE_UNITS) * ORDER_QUANTITY_LOT_SIZE_BASE_UNITS;
}

export function legCostToBaseUnits(leg: LegQuote, config: AnkerProtocolConfig): bigint {
  return toQuoteBaseUnits(leg.askCost, config.quoteAssetDecimals, `Quote leg ${leg.id} cost`);
}

export function legBinaryUpTicks(leg: LegQuote, tickSizeUsd: number) {
  if (leg.instrumentType !== 'binary-up' && leg.isUp !== true) {
    throw new Error(`Subscribe currently supports binary-up legs only (got ${leg.id}).`);
  }
  const strike = leg.strike;
  if (typeof strike !== 'number') {
    throw new Error(`Quote leg ${leg.id} is missing a strike.`);
  }
  return binaryUpRangeTicks(strike, tickSizeUsd);
}
