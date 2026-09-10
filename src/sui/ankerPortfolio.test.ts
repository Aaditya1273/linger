import { describe, expect, it } from 'vitest';
import { markProductNoteClaimed, parseOwnedProductNotes, productNoteType } from './ankerPortfolio';

const PACKAGE_ID = `0x${'1'.repeat(64)}`;
const NOTE_ID = `0x${'2'.repeat(64)}`;
const OWNER = `0x${'a'.repeat(64)}`;
const MANAGER_ID = `0x${'b'.repeat(64)}`;
const ORACLE_ID = `0x${'c'.repeat(64)}`;

function productIdBytes(value: string) {
  return Array.from(new TextEncoder().encode(value));
}

function dualNoteFields() {
  return {
    owner: OWNER,
    product_kind: '0',
    product_id: productIdBytes('dual-demo'),
    wrapper_id: MANAGER_ID,
    oracle_id: ORACLE_ID,
    expiry_ms: '1781683200000',
    principal_amount: '1000000000',
    reserve_amount: '610000000',
    coupon_amount: '20000000',
    target_price: '66000000000000',
    floor_price: '61000000000000',
    lower_bound: '0',
    upper_bound: '0',
    is_bullish: false,
    uses_mock_current_deposit: false,
    apr_bps: '19264',
    fee_bps: '1000',
    strikes: ['61000000000000', '62000000000000'],
    quantities: ['10000000', '12500000'],
    costs: ['2100000', '3125000'],
    order_ids: ['11', '22'],
    status: '0',
    redeemed_payout_amount: '0',
    redeemed_fee_amount: '0',
  };
}

describe('Anker portfolio parser', () => {
  it('builds the ProductNote type string for owned-object queries', () => {
    expect(productNoteType(PACKAGE_ID)).toBe(`${PACKAGE_ID}::product_note::ProductNote`);
  });

  it('rejects objects typed under a non-original package id (upgrades never re-type notes)', () => {
    const upgradedPackageId = `0x${'f'.repeat(64)}`;
    const notes = parseOwnedProductNotes(
      [
        {
          objectId: NOTE_ID,
          type: productNoteType(PACKAGE_ID),
          json: dualNoteFields(),
        },
        {
          objectId: `0x${'8'.repeat(64)}`,
          type: productNoteType(upgradedPackageId),
          json: dualNoteFields(),
        },
      ],
      { originalPackageId: PACKAGE_ID, quoteAssetDecimals: 6 },
    );

    expect(notes.map((note) => note.noteId)).toEqual([NOTE_ID]);
  });

  it('parses owned Dual Investment notes from Sui v2 JSON content', () => {
    const notes = parseOwnedProductNotes(
      [
        {
          objectId: NOTE_ID,
          type: productNoteType(PACKAGE_ID),
          json: dualNoteFields(),
        },
        {
          objectId: `0x${'9'.repeat(64)}`,
          type: `${PACKAGE_ID}::other::Object`,
          json: dualNoteFields(),
        },
      ],
      { originalPackageId: PACKAGE_ID, quoteAssetDecimals: 6 },
    );

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      noteId: NOTE_ID,
      productType: 'dual-investment',
      productId: 'dual-demo',
      owner: OWNER,
      wrapperId: MANAGER_ID,
      oracleId: ORACLE_ID,
      status: 'open',
      principal: 1_000,
      principalBaseUnits: 1_000_000_000n,
      reserve: 610,
      reserveBaseUnits: 610_000_000n,
      coupon: 20,
      couponBaseUnits: 20_000_000n,
      targetPrice: 66_000,
      floorPrice: 61_000,
      apr: 1.9264,
      feeBps: 1_000,
      usesMockCurrentDeposit: false,
      orderIds: [11n, 22n],
    });
    expect(notes[0]?.legs).toEqual([
      { strike: 61_000, quantity: 10, quantityBaseUnits: 10_000_000n, cost: 2.1, costBaseUnits: 2_100_000n },
      {
        strike: 62_000,
        quantity: 12.5,
        quantityBaseUnits: 12_500_000n,
        cost: 3.125,
        costBaseUnits: 3_125_000n,
      },
    ]);
  });

  it('decodes base64 vector<u8> product ids returned by Sui v2 JSON content', () => {
    const fields = {
      ...dualNoteFields(),
      product_id: 'dGFyZ2V0LWJ1eS01',
    };

    const notes = parseOwnedProductNotes(
      [
        {
          objectId: NOTE_ID,
          type: productNoteType(PACKAGE_ID),
          json: fields,
        },
      ],
      { originalPackageId: PACKAGE_ID, quoteAssetDecimals: 6 },
    );

    expect(notes[0]?.productId).toBe('target-buy-5');
  });

  it('parses ProductNotes from sui client object JSON shape', () => {
    const notes = parseOwnedProductNotes(
      [
        {
          objectId: NOTE_ID,
          objType: productNoteType(PACKAGE_ID),
          content: {
            ...dualNoteFields(),
            product_id: 'dGFyZ2V0LWJ1eS01',
          },
        },
      ],
      { originalPackageId: PACKAGE_ID, quoteAssetDecimals: 6 },
    );

    expect(notes[0]).toMatchObject({
      noteId: NOTE_ID,
      productType: 'dual-investment',
      productId: 'target-buy-5',
      principal: 1_000,
    });
  });

  it('ignores removed Shark Fin product kind from JSON-RPC style content fields', () => {
    const fields = {
      ...dualNoteFields(),
      product_kind: '1',
      product_id: productIdBytes('shark-demo'),
      lower_bound: '64000000000000',
      upper_bound: '72000000000000',
      is_bullish: true,
      uses_mock_current_deposit: true,
      status: '1',
      redeemed_payout_amount: '1030000000',
      redeemed_fee_amount: '1230000',
    };

    const notes = parseOwnedProductNotes(
      [
        {
          data: {
            objectId: NOTE_ID,
            type: productNoteType(PACKAGE_ID),
            content: {
              dataType: 'moveObject',
              fields,
            },
          },
        },
      ],
      { originalPackageId: PACKAGE_ID, quoteAssetDecimals: 6 },
    );

    expect(notes).toEqual([]);
  });

  it('fails closed instead of defaulting unknown product or status values to live notes', () => {
    const unknownProduct = {
      objectId: NOTE_ID,
      type: productNoteType(PACKAGE_ID),
      json: { ...dualNoteFields(), product_kind: '9' },
    };
    const unknownStatus = {
      objectId: `0x${'3'.repeat(64)}`,
      type: productNoteType(PACKAGE_ID),
      json: { ...dualNoteFields(), status: '9' },
    };

    expect(parseOwnedProductNotes([unknownProduct, unknownStatus], {
      originalPackageId: PACKAGE_ID,
      quoteAssetDecimals: 6,
    })).toEqual([]);
  });

  it('fails closed when ProductNote leg vectors cannot be matched by index', () => {
    const malformedLegs = {
      objectId: NOTE_ID,
      type: productNoteType(PACKAGE_ID),
      json: {
        ...dualNoteFields(),
        quantities: ['10000000'],
        costs: ['2100000', '3125000'],
      },
    };

    expect(parseOwnedProductNotes([malformedLegs], {
      originalPackageId: PACKAGE_ID,
      quoteAssetDecimals: 6,
    })).toEqual([]);
  });

  it('fails closed when required u64 fields are not decimal integers', () => {
    const invalidPrincipal = {
      objectId: NOTE_ID,
      type: productNoteType(PACKAGE_ID),
      json: {
        ...dualNoteFields(),
        principal_amount: 'not-a-u64',
      },
    };

    expect(parseOwnedProductNotes([invalidPrincipal], {
      originalPackageId: PACKAGE_ID,
      quoteAssetDecimals: 6,
    })).toEqual([]);
  });
});

describe('markProductNoteClaimed', () => {
  it('updates the claimed note immediately with the submitted payout and fee', () => {
    const [note] = parseOwnedProductNotes(
      [{ objectId: NOTE_ID, type: productNoteType(PACKAGE_ID), json: dualNoteFields() }],
      { originalPackageId: PACKAGE_ID, quoteAssetDecimals: 6 },
    );

    expect(
      markProductNoteClaimed([note], NOTE_ID, {
        grossPayoutBaseUnits: 1_030_000_000n,
        performanceFeeBaseUnits: 2_000_000n,
        netPayoutBaseUnits: 1_028_000_000n,
        realizedLegs: [],
      }),
    ).toEqual([
      expect.objectContaining({
        status: 'redeemed',
        redeemedPayout: 1_030,
        redeemedPayoutBaseUnits: 1_030_000_000n,
        redeemedFee: 2,
        redeemedFeeBaseUnits: 2_000_000n,
      }),
    ]);
  });
});
