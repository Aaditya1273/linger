import { fromChainPrice } from '../products/units';
import type { SettlementResult } from '../products/settlement';

export type AnkerProductNoteStatus = 'open' | 'redeemed';
export type AnkerProductNoteType = 'dual-investment';

export interface AnkerProductNoteLeg {
  strike: number;
  quantity: number;
  cost: number;
  quantityBaseUnits: bigint;
  costBaseUnits: bigint;
}

export interface AnkerProductNoteRecord {
  noteId: string;
  productType: AnkerProductNoteType;
  productId: string;
  owner: string;
  wrapperId: string;
  oracleId: string;
  expiryMs: number;
  principal: number;
  principalBaseUnits: bigint;
  reserve: number;
  reserveBaseUnits: bigint;
  coupon: number;
  couponBaseUnits: bigint;
  targetPrice: number;
  floorPrice: number;
  lowerBound: number;
  upperBound: number;
  isBullish: boolean;
  usesMockCurrentDeposit: boolean;
  apr: number;
  feeBps: number;
  legs: AnkerProductNoteLeg[];
  orderIds: bigint[];
  status: AnkerProductNoteStatus;
  redeemedPayout: number;
  redeemedPayoutBaseUnits: bigint;
  redeemedFee: number;
  redeemedFeeBaseUnits: bigint;
}

export interface AnkerPortfolioConfig {
  /** Original (v1) package id — on-chain type identity survives upgrades (ADR-0003). */
  originalPackageId: string;
  quoteAssetDecimals: number;
}

type UnknownRecord = Record<string, unknown>;

/** Type identity pins to the original package id, not the latest upgrade (ADR-0003). */
export function productNoteType(originalPackageId: string) {
  return `${originalPackageId}::product_note::ProductNote`;
}

function scaleForDecimals(decimals: number) {
  return 10 ** decimals;
}

function quoteAmount(value: bigint, decimals: number) {
  return Number(value) / scaleForDecimals(decimals);
}

const U64_MAX = (1n << 64n) - 1n;

function u64String(value: unknown): string | null {
  if (typeof value === 'bigint') return value >= 0n && value <= U64_MAX ? value.toString() : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  return value;
}

function u64Bigint(value: unknown): bigint | null {
  const text = u64String(value);
  if (text === null) return null;
  const parsed = BigInt(text);
  return parsed <= U64_MAX ? parsed : null;
}

function u256Bigint(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  return BigInt(value);
}

function u64Number(value: unknown): number | null {
  const parsed = u64Bigint(value);
  if (parsed === null || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(parsed);
}

function chainPrice(value: unknown): number | null {
  const parsed = u64Bigint(value);
  if (parsed === null || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return fromChainPrice(parsed.toString());
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && 'id' in value) {
    return asString((value as { id: unknown }).id);
  }
  return '';
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return asString(value) === 'true';
}

function asVector(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function decodeProductId(value: unknown): string {
  if (typeof value === 'string') return decodeBase64ProductId(value) ?? value;
  const bytes = asVector(value).map((byte) => Number(byte));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function decodeBase64ProductId(value: string): string | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1) {
    return null;
  }

  try {
    const decoded = atob(value);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    if (!/^[\x20-\x7E]+$/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

function getObjectType(object: unknown): string {
  const record = object as UnknownRecord;
  const data = record.data as UnknownRecord | undefined;
  return asString(record.type ?? record.objType ?? data?.type);
}

function getObjectId(object: unknown): string {
  const record = object as UnknownRecord;
  const data = record.data as UnknownRecord | undefined;
  return asString(record.objectId ?? data?.objectId);
}

function getObjectFields(object: unknown): UnknownRecord | null {
  const record = object as UnknownRecord;
  if (record.json && typeof record.json === 'object') {
    return record.json as UnknownRecord;
  }

  if (record.content && typeof record.content === 'object') {
    return record.content as UnknownRecord;
  }

  const data = record.data as UnknownRecord | undefined;
  const content = data?.content as UnknownRecord | undefined;
  if (content?.fields && typeof content.fields === 'object') {
    return content.fields as UnknownRecord;
  }

  return null;
}

function productTypeFromKind(kind: number): AnkerProductNoteType | null {
  if (kind === 0) return 'dual-investment';
  return null;
}

function statusFromValue(status: number): AnkerProductNoteStatus | null {
  if (status === 0) return 'open';
  if (status === 1) return 'redeemed';
  return null;
}

export function parseOwnedProductNotes(
  objects: unknown[],
  config: AnkerPortfolioConfig,
): AnkerProductNoteRecord[] {
  const noteType = productNoteType(config.originalPackageId);

  return objects.flatMap((object) => {
    if (getObjectType(object) !== noteType) return [];
    const fields = getObjectFields(object);
    if (!fields) return [];

    const strikes = asVector(fields.strikes);
    const quantities = asVector(fields.quantities);
    const costs = asVector(fields.costs);
    const orderIdValues = asVector(fields.order_ids);
    if (
      strikes.length !== quantities.length ||
      strikes.length !== costs.length ||
      strikes.length !== orderIdValues.length
    ) {
      return [];
    }

    const productKind = u64Number(fields.product_kind);
    const productType = productKind === null ? null : productTypeFromKind(productKind);
    const statusValue = u64Number(fields.status);
    const status = statusValue === null ? null : statusFromValue(statusValue);
    const expiryMs = u64Number(fields.expiry_ms);
    const principalBaseUnits = u64Bigint(fields.principal_amount);
    const reserveBaseUnits = u64Bigint(fields.reserve_amount);
    const couponBaseUnits = u64Bigint(fields.coupon_amount);
    const redeemedPayoutBaseUnits = u64Bigint(fields.redeemed_payout_amount);
    const redeemedFeeBaseUnits = u64Bigint(fields.redeemed_fee_amount);
    const targetPrice = chainPrice(fields.target_price);
    const floorPrice = chainPrice(fields.floor_price);
    const lowerBound = chainPrice(fields.lower_bound);
    const upperBound = chainPrice(fields.upper_bound);
    const aprBps = u64Number(fields.apr_bps);
    const feeBps = u64Number(fields.fee_bps);
    const parsedLegs = strikes.map((strike, index) => {
      const strikePrice = chainPrice(strike);
      const quantityBaseUnits = u64Bigint(quantities[index]);
      const costBaseUnits = u64Bigint(costs[index]);
      if (strikePrice === null || quantityBaseUnits === null || costBaseUnits === null) return null;
      return {
        strike: strikePrice,
        quantity: quoteAmount(quantityBaseUnits, config.quoteAssetDecimals),
        quantityBaseUnits,
        cost: quoteAmount(costBaseUnits, config.quoteAssetDecimals),
        costBaseUnits,
      };
    });
    const parsedOrderIds = orderIdValues.map((orderId) => u256Bigint(orderId));

    if (
      productType === null ||
      status === null ||
      expiryMs === null ||
      principalBaseUnits === null ||
      reserveBaseUnits === null ||
      couponBaseUnits === null ||
      redeemedPayoutBaseUnits === null ||
      redeemedFeeBaseUnits === null ||
      targetPrice === null ||
      floorPrice === null ||
      lowerBound === null ||
      upperBound === null ||
      aprBps === null ||
      feeBps === null ||
      parsedLegs.some((leg) => leg === null) ||
      parsedOrderIds.some((orderId) => orderId === null)
    ) {
      return [];
    }

    const legs = parsedLegs as AnkerProductNoteLeg[];
    const orderIds = parsedOrderIds as bigint[];

    return [
      {
        noteId: getObjectId(object),
        productType,
        productId: decodeProductId(fields.product_id),
        owner: asString(fields.owner),
        wrapperId: asString(fields.wrapper_id),
        oracleId: asString(fields.oracle_id),
        expiryMs,
        principal: quoteAmount(principalBaseUnits, config.quoteAssetDecimals),
        principalBaseUnits,
        reserve: quoteAmount(reserveBaseUnits, config.quoteAssetDecimals),
        reserveBaseUnits,
        coupon: quoteAmount(couponBaseUnits, config.quoteAssetDecimals),
        couponBaseUnits,
        targetPrice,
        floorPrice,
        lowerBound,
        upperBound,
        isBullish: asBoolean(fields.is_bullish),
        usesMockCurrentDeposit: asBoolean(fields.uses_mock_current_deposit),
        apr: aprBps / 10_000,
        feeBps,
        legs,
        orderIds,
        status,
        redeemedPayout: quoteAmount(redeemedPayoutBaseUnits, config.quoteAssetDecimals),
        redeemedPayoutBaseUnits,
        redeemedFee: quoteAmount(redeemedFeeBaseUnits, config.quoteAssetDecimals),
        redeemedFeeBaseUnits,
      },
    ];
  });
}

export function markProductNoteClaimed(
  notes: readonly AnkerProductNoteRecord[],
  noteId: string,
  settlement: SettlementResult,
  quoteAssetDecimals = 6,
): AnkerProductNoteRecord[] {
  const scale = 10 ** quoteAssetDecimals;
  return notes.map((note) =>
    note.noteId.toLowerCase() === noteId.toLowerCase()
      ? {
          ...note,
          status: 'redeemed',
          redeemedPayout: Number(settlement.grossPayoutBaseUnits) / scale,
          redeemedPayoutBaseUnits: settlement.grossPayoutBaseUnits,
          redeemedFee: Number(settlement.performanceFeeBaseUnits) / scale,
          redeemedFeeBaseUnits: settlement.performanceFeeBaseUnits,
        }
      : note,
  );
}
