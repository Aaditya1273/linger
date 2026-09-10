import { bcs } from '@mysten/sui/bcs';
import { deriveObjectID, normalizeSuiAddress } from '@mysten/sui/utils';

export const SUI_CLOCK_OBJECT_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export interface AccountWrapperIds {
  accountPackageId: string;
  accountRegistryId: string;
}

export interface DeriveAccountWrapperAddressInput extends AccountWrapperIds {
  owner: string;
}

export interface AccountWrapperRecord {
  wrapperId: string | undefined;
  exists: boolean;
  owner: string | undefined;
  balancesBagId: string | undefined;
}

export interface AccountWrapperBalance {
  dusdcBalanceBaseUnits: bigint;
  dusdcBalance: number;
}

export function accountWrapperType(accountPackageId: string): string {
  return `${accountPackageId}::account::AccountWrapper`;
}

export function accountWrapperKeyType(accountPackageId: string): string {
  return `${accountPackageId}::account_registry::AccountWrapperKey`;
}

export function coinKeyType(accountPackageId: string, quoteAssetType: string): string {
  return `${accountPackageId}::account::CoinKey<${quoteAssetType}>`;
}

export function deriveAccountWrapperAddress(input: DeriveAccountWrapperAddressInput): string {
  const owner = normalizeSuiAddress(input.owner);
  const key = bcs.Address.serialize(owner).toBytes();
  return deriveObjectID(input.accountRegistryId, accountWrapperKeyType(input.accountPackageId), key);
}

function bagIdFromBalances(balances: unknown): string | undefined {
  if (!isRecord(balances)) return undefined;
  if (typeof balances.id === 'string') return balances.id;
  if (isRecord(balances.id) && typeof balances.id.id === 'string') return balances.id.id;
  if (isRecord(balances.fields)) {
    const fieldsId = balances.fields.id;
    if (typeof fieldsId === 'string') return fieldsId;
    if (isRecord(fieldsId) && typeof fieldsId.id === 'string') return fieldsId.id;
  }
  return undefined;
}

function getObjectJson(object: unknown): UnknownRecord | null {
  if (!isRecord(object)) return null;
  if (isRecord(object.json)) return object.json;
  if (isRecord(object.content)) return object.content;
  const data = object.data;
  if (isRecord(data) && isRecord(data.content) && isRecord(data.content.fields)) {
    return data.content.fields;
  }
  return null;
}

function getObjectId(object: unknown): string {
  if (!isRecord(object)) return '';
  if (typeof object.objectId === 'string') return object.objectId;
  const data = object.data;
  if (isRecord(data) && typeof data.objectId === 'string') return data.objectId;
  const json = getObjectJson(object);
  if (json && typeof json.id === 'string') return json.id;
  return '';
}

function getObjectType(object: unknown): string {
  if (!isRecord(object)) return '';
  if (typeof object.type === 'string') return object.type;
  const data = object.data;
  if (isRecord(data) && typeof data.type === 'string') return data.type;
  return '';
}

export function parseAccountWrapperObject(
  object: unknown,
  config: Pick<AccountWrapperIds, 'accountPackageId'>,
): AccountWrapperRecord {
  if (!object) {
    return { wrapperId: undefined, exists: false, owner: undefined, balancesBagId: undefined };
  }

  const expectedType = accountWrapperType(config.accountPackageId);
  const objectType = getObjectType(object);
  if (objectType && objectType !== expectedType) {
    return { wrapperId: undefined, exists: false, owner: undefined, balancesBagId: undefined };
  }

  const json = getObjectJson(object);
  const account = json && isRecord(json.account) ? json.account : null;
  const wrapperId = getObjectId(object) || (json ? asString(json.id) : '');
  if (!wrapperId) {
    return { wrapperId: undefined, exists: false, owner: undefined, balancesBagId: undefined };
  }

  return {
    wrapperId,
    exists: true,
    owner: account ? asString(account.owner) || undefined : undefined,
    balancesBagId: account ? bagIdFromBalances(account.balances) : undefined,
  };
}

function extractBalanceValue(fieldJson: unknown): bigint | null {
  if (fieldJson == null) return null;
  if (typeof fieldJson === 'string' || typeof fieldJson === 'number' || typeof fieldJson === 'bigint') {
    try {
      return BigInt(fieldJson);
    } catch {
      return null;
    }
  }
  if (!isRecord(fieldJson)) return null;

  if ('value' in fieldJson) {
    const nested = extractBalanceValue(fieldJson.value);
    if (nested !== null) return nested;
  }

  if (isRecord(fieldJson.fields) && 'value' in fieldJson.fields) {
    return extractBalanceValue(fieldJson.fields.value);
  }

  return null;
}

export function parseAccountWrapperBalance(
  fieldJson: unknown,
  config: { quoteAssetDecimals: number },
): AccountWrapperBalance {
  const baseUnits = extractBalanceValue(fieldJson) ?? 0n;
  const divisor = 10 ** config.quoteAssetDecimals;
  return {
    dusdcBalanceBaseUnits: baseUnits,
    dusdcBalance: Number(baseUnits) / divisor,
  };
}

export interface GrpcObjectClient {
  core: {
    getObject(input: {
      objectId: string;
      include?: { json?: boolean; content?: boolean };
    }): Promise<{ object: unknown }>;
    getDynamicField(input: {
      parentId: string;
      name: { type: string; bcs: Uint8Array };
    }): Promise<{ dynamicField: { fieldId: string } }>;
  };
}

function isObjectNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /not found/i.test(error.message);
}

async function resolveObjectJson(object: unknown): Promise<unknown> {
  if (!isRecord(object) || !('json' in object)) return object;
  const json = object.json;
  if (json != null && typeof json === 'object' && 'then' in json && typeof (json as Promise<unknown>).then === 'function') {
    return { ...object, json: await (json as Promise<unknown>) };
  }
  return object;
}

export async function fetchAccountWrapper(input: {
  client: GrpcObjectClient;
  owner: string;
  accountPackageId: string;
  accountRegistryId: string;
}): Promise<AccountWrapperRecord & { wrapperId: string }> {
  const wrapperId = deriveAccountWrapperAddress({
    accountPackageId: input.accountPackageId,
    accountRegistryId: input.accountRegistryId,
    owner: input.owner,
  });

  try {
    const { object } = await input.client.core.getObject({
      objectId: wrapperId,
      include: { json: true, content: true },
    });
    const resolved = await resolveObjectJson(object);
    const parsed = parseAccountWrapperObject(resolved, {
      accountPackageId: input.accountPackageId,
    });
    if (!parsed.exists) {
      return { wrapperId, exists: false, owner: undefined, balancesBagId: undefined };
    }
    return { ...parsed, wrapperId: parsed.wrapperId ?? wrapperId };
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      return { wrapperId, exists: false, owner: undefined, balancesBagId: undefined };
    }
    throw error;
  }
}

export async function fetchAccountWrapperBalance(input: {
  client: GrpcObjectClient;
  wrapperId: string;
  accountPackageId: string;
  quoteAssetType: string;
  quoteAssetDecimals: number;
}): Promise<AccountWrapperBalance> {
  try {
    const { object } = await input.client.core.getObject({
      objectId: input.wrapperId,
      include: { json: true, content: true },
    });
    const resolved = await resolveObjectJson(object);
    const parsed = parseAccountWrapperObject(resolved, {
      accountPackageId: input.accountPackageId,
    });
    if (!parsed.exists || !parsed.balancesBagId) {
      return { dusdcBalanceBaseUnits: 0n, dusdcBalance: 0 };
    }

    try {
      const { dynamicField } = await input.client.core.getDynamicField({
        parentId: parsed.balancesBagId,
        name: {
          type: coinKeyType(input.accountPackageId, input.quoteAssetType),
          bcs: new Uint8Array(),
        },
      });
      const fieldObject = await input.client.core.getObject({
        objectId: dynamicField.fieldId,
        include: { json: true },
      });
      const fieldResolved = await resolveObjectJson(fieldObject.object);
      const fieldJson = getObjectJson(fieldResolved);
      return parseAccountWrapperBalance(fieldJson, {
        quoteAssetDecimals: input.quoteAssetDecimals,
      });
    } catch {
      return { dusdcBalanceBaseUnits: 0n, dusdcBalance: 0 };
    }
  } catch {
    return { dusdcBalanceBaseUnits: 0n, dusdcBalance: 0 };
  }
}
