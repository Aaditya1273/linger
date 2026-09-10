export const PRODUCT_NOTE_EVENT_NAMES = [
  'ProductSubscribed',
  'ProductRedeemed',
] as const;

export type ProductNoteEventName = (typeof PRODUCT_NOTE_EVENT_NAMES)[number];

export type ProductNoteAllocatedPosition = {
  strikeBaseUnits: bigint;
  quantityBaseUnits: bigint;
  costBaseUnits: bigint;
};

export type ProductNoteEventIndexEntry = {
  noteId: string;
  owner?: string;
  wrapperId?: string;
  oracleId?: string;
  subscriptionDigest?: string;
  settlementDigest?: string;
  expiryMs?: bigint;
  principalBaseUnits?: bigint;
  reserveBaseUnits?: bigint;
  couponBaseUnits?: bigint;
  feeBps?: bigint;
  positionQuantityBaseUnits?: bigint;
  positionPayoutBaseUnits?: bigint;
  payoutBaseUnits?: bigint;
  feeBaseUnits?: bigint;
  feePaidBaseUnits?: bigint;
  transactionDigests: string[];
  allocatedPositions: ProductNoteAllocatedPosition[];
  orderIds?: bigint[];
};

export type ProductNoteEventIndex = {
  byNoteId: Record<string, ProductNoteEventIndexEntry>;
  byOwner: Record<string, string[]>;
  byWrapperId: Record<string, string[]>;
};

export type ProductNoteEventPage = {
  events: unknown[];
  /** Opaque pagination cursor; null once the last page has been read. */
  nextCursor: string | null;
};

export type ProductNoteEventClient = {
  listEvents(input: { eventType: string; cursor?: string | null; limit?: number }): Promise<ProductNoteEventPage>;
};

type ProductNoteSuiEvent = {
  id?: { txDigest?: unknown };
  type?: unknown;
  parsedJson?: unknown;
};

function recordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bigintValue(value: unknown) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}

function orderIdsValue(value: unknown): bigint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((entry) => bigintValue(entry));
  if (parsed.some((entry) => entry === undefined)) return undefined;
  return parsed as bigint[];
}

function eventName(eventType: unknown): ProductNoteEventName | undefined {
  if (typeof eventType !== 'string') return undefined;
  const name = eventType.split('::').at(-1);
  return PRODUCT_NOTE_EVENT_NAMES.find((candidate) => candidate === name);
}

function txDigest(event: ProductNoteSuiEvent) {
  return stringValue(recordValue(event.id, 'txDigest'));
}

function ensureEntry(index: ProductNoteEventIndex, noteId: string) {
  index.byNoteId[noteId] ??= { noteId, transactionDigests: [], allocatedPositions: [] };
  return index.byNoteId[noteId];
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

function indexEntryRelations(index: ProductNoteEventIndex, entry: ProductNoteEventIndexEntry) {
  if (entry.owner) {
    index.byOwner[entry.owner] ??= [];
    pushUnique(index.byOwner[entry.owner], entry.noteId);
  }
  if (entry.wrapperId) {
    index.byWrapperId[entry.wrapperId] ??= [];
    pushUnique(index.byWrapperId[entry.wrapperId], entry.noteId);
  }
}

function assignString(target: ProductNoteEventIndexEntry, key: 'owner' | 'wrapperId' | 'oracleId', value: unknown) {
  const parsed = stringValue(value);
  if (parsed) target[key] = parsed;
}

function assignBigint(
  target: ProductNoteEventIndexEntry,
  key:
    | 'expiryMs'
    | 'principalBaseUnits'
    | 'reserveBaseUnits'
    | 'couponBaseUnits'
    | 'feeBps'
    | 'positionQuantityBaseUnits'
    | 'positionPayoutBaseUnits'
    | 'payoutBaseUnits'
    | 'feeBaseUnits'
    | 'feePaidBaseUnits',
  value: unknown,
) {
  const parsed = bigintValue(value);
  if (parsed !== undefined) target[key] = parsed;
}

function applyProductSubscribed(entry: ProductNoteEventIndexEntry, event: ProductNoteSuiEvent, parsed: Record<string, unknown>) {
  const digest = txDigest(event);
  if (digest) entry.subscriptionDigest = digest;
  assignString(entry, 'owner', parsed.owner);
  assignString(entry, 'wrapperId', parsed.wrapper_id);
  assignString(entry, 'oracleId', parsed.oracle_id);
  assignBigint(entry, 'expiryMs', parsed.expiry_ms);
  assignBigint(entry, 'principalBaseUnits', parsed.principal_amount);
  assignBigint(entry, 'feeBps', parsed.fee_bps);
  const orderIds = orderIdsValue(parsed.order_ids);
  if (orderIds) entry.orderIds = orderIds;
}

function applyProductRedeemed(entry: ProductNoteEventIndexEntry, event: ProductNoteSuiEvent, parsed: Record<string, unknown>) {
  const digest = txDigest(event);
  if (digest) entry.settlementDigest = digest;
  assignString(entry, 'owner', parsed.owner);
  assignString(entry, 'wrapperId', parsed.wrapper_id);
  assignString(entry, 'oracleId', parsed.oracle_id);
  assignBigint(entry, 'payoutBaseUnits', parsed.payout_amount);
  assignBigint(entry, 'feeBaseUnits', parsed.fee_amount);
}

/** Event type identity pins to the original package id, not the latest upgrade (ADR-0003). */
export function productNoteEventTypes(originalPackageId: string) {
  return PRODUCT_NOTE_EVENT_NAMES.map((name) => `${originalPackageId}::product_note::${name}`);
}

export function buildProductNoteEventIndex(events: readonly unknown[]): ProductNoteEventIndex {
  const index: ProductNoteEventIndex = { byNoteId: {}, byOwner: {}, byWrapperId: {} };

  for (const event of events) {
    if (!isRecord(event)) continue;
    const parsed = event.parsedJson;
    if (!isRecord(parsed)) continue;
    const name = eventName(event.type);
    const noteId = stringValue(parsed.note_id);
    if (!name || !noteId) continue;
    const entry = ensureEntry(index, noteId);
    const digest = txDigest(event);
    if (digest) pushUnique(entry.transactionDigests, digest);

    if (name === 'ProductSubscribed') applyProductSubscribed(entry, event, parsed);
    if (name === 'ProductRedeemed') applyProductRedeemed(entry, event, parsed);
    indexEntryRelations(index, entry);
  }

  return index;
}
