import { describe, expect, it } from 'vitest';
import { buildProductNoteEventIndex, productNoteEventTypes } from './productNoteEvents';

const PACKAGE_ID = `0x${'1'.repeat(64)}`;
const NOTE_ID = `0x${'2'.repeat(64)}`;
const MANAGER_ID = `0x${'3'.repeat(64)}`;
const ORACLE_ID = `0x${'4'.repeat(64)}`;

function eventFixture(typeName: string, txDigest: string, parsedJson: Record<string, unknown>) {
  return {
    id: { txDigest, eventSeq: '0' },
    packageId: PACKAGE_ID,
    transactionModule: 'product_note',
    sender: `0x${'a'.repeat(64)}`,
    type: `${PACKAGE_ID}::product_note::${typeName}`,
    parsedJson,
    bcs: '',
    bcsEncoding: 'base64' as const,
  };
}

describe('product note event index', () => {
  it('builds note transaction and settlement state from deployed V1 receipt events', () => {
    const owner = `0x${'a'.repeat(64)}`;
    const index = buildProductNoteEventIndex([
      eventFixture('ProductSubscribed', '0xsubscribe', {
        note_id: NOTE_ID,
        owner,
        product_kind: '0',
        wrapper_id: MANAGER_ID,
        oracle_id: ORACLE_ID,
        expiry_ms: '1781683200000',
        principal_amount: '1000000000',
        fee_bps: '1000',
        leg_count: '1',
        order_ids: ['11'],
      }),
      eventFixture('ProductRedeemed', '0xsettle', {
        note_id: NOTE_ID,
        owner,
        product_kind: '0',
        wrapper_id: MANAGER_ID,
        oracle_id: ORACLE_ID,
        payout_amount: '1030000000',
        fee_amount: '3000000',
      }),
    ]);

    expect(index.byNoteId[NOTE_ID]).toMatchObject({
      noteId: NOTE_ID,
      subscriptionDigest: '0xsubscribe',
      settlementDigest: '0xsettle',
      wrapperId: MANAGER_ID,
      oracleId: ORACLE_ID,
      payoutBaseUnits: 1_030_000_000n,
      feeBaseUnits: 3_000_000n,
    });
    expect(index.byOwner[owner]).toEqual([NOTE_ID]);
    expect(index.byWrapperId[MANAGER_ID]).toEqual([NOTE_ID]);
    expect(index.byNoteId[NOTE_ID]?.transactionDigests).toEqual(['0xsubscribe', '0xsettle']);
    expect(index.byNoteId[NOTE_ID]?.allocatedPositions).toEqual([]);
  });

  it('deduplicates repeated transaction digests for the same note', () => {
    const index = buildProductNoteEventIndex([
      eventFixture('ProductSubscribed', '0xsubscribe', {
        note_id: NOTE_ID,
        wrapper_id: MANAGER_ID,
        oracle_id: ORACLE_ID,
      }),
      eventFixture('ProductSubscribed', '0xsubscribe', {
        note_id: NOTE_ID,
        wrapper_id: MANAGER_ID,
        oracle_id: ORACLE_ID,
      }),
    ]);

    expect(index.byNoteId[NOTE_ID]?.transactionDigests).toEqual(['0xsubscribe']);
  });

  it('exposes Move event types used by the dashboard indexer', () => {
    expect(productNoteEventTypes(PACKAGE_ID)).toEqual([
      `${PACKAGE_ID}::product_note::ProductSubscribed`,
      `${PACKAGE_ID}::product_note::ProductRedeemed`,
    ]);
  });
});
