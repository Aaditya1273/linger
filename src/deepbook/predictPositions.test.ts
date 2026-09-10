import { describe, expect, it } from 'vitest';
import { fetchLivePredictOrderIds } from './predictPositions';

const WRAPPER_ID = `0x${'b'.repeat(64)}`;
const ACCOUNT_ID = `0x${'a'.repeat(64)}`;
const PREDICT_APP_FIELD_ID = `0x${'1'.repeat(64)}`;
const POSITIONS_TABLE_ID = `0x${'2'.repeat(64)}`;
const MARKET_ID = `0x${'5'.repeat(64)}`;
const OTHER_MARKET_ID = `0x${'6'.repeat(64)}`;

function positionKeyBcs(marketId: string, orderId: bigint): Uint8Array {
  const bytes = new Uint8Array(64);
  const marketBytes = marketId.slice(2).match(/../g)!.map((pair) => Number.parseInt(pair, 16));
  bytes.set(marketBytes, 0);
  let value = orderId;
  for (let i = 32; i < 64; i += 1) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

function mockClient(input: { positionKeys: Uint8Array[]; predictAppPresent?: boolean }) {
  const predictAppPresent = input.predictAppPresent ?? true;
  return {
    core: {
      async getObject({ objectId }: { objectId: string }) {
        if (objectId === WRAPPER_ID) {
          return { object: { json: { account: { account_id: ACCOUNT_ID } } } };
        }
        if (objectId === PREDICT_APP_FIELD_ID) {
          return { object: { json: { value: { positions: { id: POSITIONS_TABLE_ID } } } } };
        }
        throw new Error(`unexpected getObject ${objectId}`);
      },
      async listDynamicFields({ parentId }: { parentId: string }) {
        if (parentId === ACCOUNT_ID) {
          return {
            dynamicFields: predictAppPresent
              ? [
                  {
                    fieldId: PREDICT_APP_FIELD_ID,
                    name: { type: '0xdb3e::account::DataKey<0xdb3e::predict_account::PredictApp>' },
                  },
                ]
              : [],
            hasNextPage: false,
            cursor: null,
          };
        }
        if (parentId === POSITIONS_TABLE_ID) {
          return {
            dynamicFields: input.positionKeys.map((bcs) => ({
              name: { type: '0xdb3e::predict_account::PositionKey', bcs },
            })),
            hasNextPage: false,
            cursor: null,
          };
        }
        throw new Error(`unexpected listDynamicFields ${parentId}`);
      },
    },
  };
}

describe('fetchLivePredictOrderIds', () => {
  it('returns the order ids still open on the given market', async () => {
    const client = mockClient({
      positionKeys: [
        positionKeyBcs(MARKET_ID, 11n),
        positionKeyBcs(MARKET_ID, 340_282_366_920_938_463_463_374_607_431_768_211_457n),
        positionKeyBcs(OTHER_MARKET_ID, 22n),
      ],
    });

    const live = await fetchLivePredictOrderIds(client, {
      wrapperId: WRAPPER_ID,
      expiryMarketId: MARKET_ID,
    });

    expect(live).toEqual(new Set(['11', '340282366920938463463374607431768211457']));
  });

  it('treats an account with no Predict data as having no live positions', async () => {
    const client = mockClient({ positionKeys: [], predictAppPresent: false });

    const live = await fetchLivePredictOrderIds(client, {
      wrapperId: WRAPPER_ID,
      expiryMarketId: MARKET_ID,
    });

    expect(live).toEqual(new Set());
  });

  it('rejects clients that cannot inspect dynamic fields', async () => {
    await expect(
      fetchLivePredictOrderIds({}, { wrapperId: WRAPPER_ID, expiryMarketId: MARKET_ID }),
    ).rejects.toThrow('dynamic field inspection');
  });
});
