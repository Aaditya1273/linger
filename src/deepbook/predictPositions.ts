/**
 * Reads which of an account's Predict positions are still open on-chain.
 *
 * After an expiry market settles, a permissionless sweep can redeem every
 * settled position directly into the owner's account balance — the position
 * rows disappear from the account's Predict position table. A claim that
 * still calls `redeem_settled` for a swept leg aborts in
 * `predict_account::remove_position`, so the claim builder needs to know
 * which order ids remain live.
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

interface DynamicFieldEntry {
  fieldId?: string;
  name?: { type?: string; bcs?: Uint8Array | string };
}

interface CoreInspectionClient {
  core: {
    getObject(input: { objectId: string; include: { json: true } }): Promise<unknown>;
    listDynamicFields(input: {
      parentId: string;
      cursor?: string | null;
      limit?: number;
    }): Promise<unknown>;
  };
}

function hasCoreInspection(client: unknown): client is CoreInspectionClient {
  if (!isRecord(client) || !isRecord(client.core)) return false;
  return (
    typeof client.core.getObject === 'function' && typeof client.core.listDynamicFields === 'function'
  );
}

async function objectJson(client: CoreInspectionClient, objectId: string): Promise<UnknownRecord> {
  const result = await client.core.getObject({ objectId, include: { json: true } });
  const object = isRecord(result) && isRecord(result.object) ? result.object : result;
  const json = isRecord(object) ? object.json : null;
  if (!isRecord(json)) throw new Error(`Object ${objectId} has no readable content.`);
  return json;
}

async function listAllDynamicFields(
  client: CoreInspectionClient,
  parentId: string,
): Promise<DynamicFieldEntry[]> {
  const entries: DynamicFieldEntry[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await client.core.listDynamicFields({ parentId, cursor, limit: 50 });
    if (!isRecord(page) || !Array.isArray(page.dynamicFields)) {
      throw new Error(`Dynamic field page for ${parentId} is invalid.`);
    }
    entries.push(...(page.dynamicFields as DynamicFieldEntry[]));
    cursor = page.hasNextPage && typeof page.cursor === 'string' ? page.cursor : null;
  } while (cursor);
  return entries;
}

function bcsBytes(value: Uint8Array | string | undefined): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return null;
}

/** PositionKey BCS: expiry market id (32 bytes) followed by the order id (u256 LE). */
export function decodePositionKeyBcs(bytes: Uint8Array): { expiryMarketId: string; orderId: bigint } | null {
  if (bytes.length !== 64) return null;
  let marketHex = '';
  for (let i = 0; i < 32; i += 1) marketHex += bytes[i].toString(16).padStart(2, '0');
  let orderId = 0n;
  for (let i = 63; i >= 32; i -= 1) orderId = (orderId << 8n) | BigInt(bytes[i]);
  return { expiryMarketId: `0x${marketHex}`, orderId };
}

/**
 * Order ids (decimal strings) the account still holds as open Predict
 * positions on the given expiry market. An account without Predict app data
 * or an empty position table genuinely has no live positions — that is a
 * positive observation, not an error.
 */
export async function fetchLivePredictOrderIds(
  client: unknown,
  input: { wrapperId: string; expiryMarketId: string },
): Promise<Set<string>> {
  if (!hasCoreInspection(client)) {
    throw new Error('Current Sui client does not support dynamic field inspection.');
  }

  const wrapper = await objectJson(client, input.wrapperId);
  const account = isRecord(wrapper.account) ? wrapper.account : null;
  const accountId = typeof account?.account_id === 'string' ? account.account_id : null;
  if (!accountId) throw new Error(`AccountWrapper ${input.wrapperId} has no inner account id.`);

  const accountFields = await listAllDynamicFields(client, accountId);
  const predictApp = accountFields.find((entry) =>
    entry.name?.type?.includes('::predict_account::PredictApp'),
  );
  if (!predictApp?.fieldId) return new Set();

  const predictData = await objectJson(client, predictApp.fieldId);
  const value = isRecord(predictData.value) ? predictData.value : null;
  const positions = isRecord(value?.positions) ? value.positions : null;
  const positionsTableId = typeof positions?.id === 'string' ? positions.id : null;
  if (!positionsTableId) return new Set();

  const marketId = input.expiryMarketId.toLowerCase();
  const live = new Set<string>();
  for (const entry of await listAllDynamicFields(client, positionsTableId)) {
    if (!entry.name?.type?.includes('::predict_account::PositionKey')) continue;
    const bytes = bcsBytes(entry.name.bcs);
    const key = bytes ? decodePositionKeyBcs(bytes) : null;
    if (key && key.expiryMarketId === marketId) live.add(key.orderId.toString());
  }
  return live;
}
